<#
.SYNOPSIS
Regenerates the real-git fixtures that the paste-verification parser tests read.

.DESCRIPTION
The parsers in src/engine/verify must match what git actually prints, not what we
remember it prints. This script builds throwaway repositories under $env:TEMP, puts
each one into a known state (fresh, dirty, renamed, ahead of origin, detached, mid-merge,
and so on), and saves git's genuine output next to this script as .txt files.

Commit dates and the author are fixed, so the commit hashes come out the same on every
run and the tests can assert exact hashes. Your own git settings are ignored while it
runs, so the fixtures show what git prints out of the box.

When it finishes (or fails), it deletes the throwaway repositories and puts back every
environment variable it changed, so your terminal is left as it was.

Run it from the repo root in PowerShell 7:
    pwsh -File src/engine/verify/fixtures/capture.ps1
#>

# Windows PowerShell 5.1 turns anything git writes to stderr (like push progress) into a
# script-stopping error, and reads this file in the wrong text encoding.
#Requires -Version 7.2
param([string]$OutDir = $PSScriptRoot)

$ErrorActionPreference = 'Stop'
$utf8 = [System.Text.UTF8Encoding]::new($false)
$work = Join-Path $env:TEMP 'ship-it-verify-fixtures'
$script:tick = 0

# Environment variables belong to the whole terminal window, not just this script. Their
# old values are saved here and put back at the end. Otherwise your next real commit in
# the same window would be signed "SHIP IT Fixtures" and dated 2026-09-01.
$gitVariables = @(
    'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_AUTHOR_DATE',
    'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'GIT_COMMITTER_DATE',
    'GIT_EDITOR', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL',
    'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0',
    'GIT_TEST_UF_DELAY_WARNING'
)
$savedVariables = @{}
foreach ($name in $gitVariables) {
    $savedVariables[$name] = [Environment]::GetEnvironmentVariable($name)
}
$savedEncoding = [Console]::OutputEncoding

# Runs git and stops the script if it didn't exit with the expected code, showing git's
# own message. A setup step that failed quietly would capture the wrong state.
function Invoke-GitChecked([int]$ExpectedExitCode, [string]$Repo, [string[]]$GitArgs) {
    $output = & git -C $Repo -c color.ui=never @GitArgs 2>&1
    if ($LASTEXITCODE -ne $ExpectedExitCode) {
        throw "git $($GitArgs -join ' ') exited with $LASTEXITCODE in ${Repo}:`n$($output -join "`n")"
    }
}

# Runs one setup step quietly: Invoke-Git <repo> <git arguments...>. It reads $args
# instead of declaring parameters on purpose. A function with declared parameters also
# gets PowerShell's own -Debug and -Verbose, which would swallow git's -d or -v.
function Invoke-Git {
    Invoke-GitChecked 0 $args[0] @($args | Select-Object -Skip 1)
}

# Starts a merge or rebase that is meant to stop on a conflict. Git exits with 1 when
# that happens, so here 1 is success.
function Invoke-GitConflict {
    Invoke-GitChecked 1 $args[0] @($args | Select-Object -Skip 1)
}

# Moves the fake clock one minute forward and dates the next commit (or tag) with it.
function Step-CommitClock {
    $script:tick++
    $date = (Get-Date '2026-09-01T12:00:00Z').ToUniversalTime().AddMinutes($script:tick)
    $env:GIT_AUTHOR_DATE = $date.ToString('yyyy-MM-ddTHH:mm:ssZ')
    $env:GIT_COMMITTER_DATE = $env:GIT_AUTHOR_DATE
}

# Commits whatever is staged, one fake minute after the previous commit.
function New-Commit {
    param([string]$Repo, [string]$Message)
    Step-CommitClock
    Invoke-Git $Repo commit -q -m $Message
}

# Writes a file with LF endings so the content is the same on every OS.
function Write-RepoFile {
    param([string]$Repo, [string]$Path, [string]$Content)
    $full = Join-Path $Repo $Path
    $parent = Split-Path $full -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
    [System.IO.File]::WriteAllText($full, $Content, $utf8)
}

function New-Repo {
    param([string]$Name)
    $path = Join-Path $work $Name
    Invoke-Git $work init -q -b main $path
    return $path
}

# Saves the output of one git command as a fixture. -Color keeps git's ANSI codes, the
# way they arrive when a terminal copies colored text. -WithErrors keeps stderr too, for
# a command that is expected to fail.
function Save-Fixture {
    param(
        [string]$Name,
        [string]$Repo,
        [string[]]$GitArgs,
        [switch]$Color,
        [switch]$WithErrors
    )
    $colorSetting = if ($Color) { 'always' } else { 'never' }
    if ($WithErrors) {
        $lines = & git -C $Repo -c "color.ui=$colorSetting" @GitArgs 2>&1 |
            ForEach-Object { "$_" }
    }
    else {
        $lines = & git -C $Repo -c "color.ui=$colorSetting" @GitArgs
        if ($LASTEXITCODE -ne 0) { throw "git $($GitArgs -join ' ') failed while saving $Name" }
    }
    $text = if ($null -eq $lines) { '' } else { (@($lines) -join "`n") + "`n" }
    [System.IO.File]::WriteAllText((Join-Path $OutDir "$Name.txt"), $text, $utf8)
}

try {
    # Git prints UTF-8. Without this, PowerShell decodes it with the console's legacy code page.
    [Console]::OutputEncoding = $utf8
    if (Test-Path $work) { Remove-Item -Recurse -Force $work }
    New-Item -ItemType Directory -Path $work | Out-Null

    $env:GIT_AUTHOR_NAME = 'SHIP IT Fixtures'
    $env:GIT_AUTHOR_EMAIL = 'fixtures@ship-it.invalid'
    $env:GIT_COMMITTER_NAME = $env:GIT_AUTHOR_NAME
    $env:GIT_COMMITTER_EMAIL = $env:GIT_AUTHOR_EMAIL
    # Keeps git from opening an editor for merge and rebase messages.
    $env:GIT_EDITOR = 'true'
    # Skips the system and user git config files. Settings like core.quotePath,
    # status.showUntrackedFiles, or advice.statusHints would change what git prints.
    $env:GIT_CONFIG_NOSYSTEM = '1'
    $env:GIT_CONFIG_GLOBAL = Join-Path $work 'empty.gitconfig'
    New-Item -ItemType File -Path $env:GIT_CONFIG_GLOBAL | Out-Null
    # Turns off CRLF conversion for every git call, clones included. With it on, a clone's
    # checkout rewrites line endings and git then reports files as modified that nobody touched.
    $env:GIT_CONFIG_COUNT = '1'
    $env:GIT_CONFIG_KEY_0 = 'core.autocrlf'
    $env:GIT_CONFIG_VALUE_0 = 'false'

    # --- A brand-new repository -------------------------------------------------------------
    $fresh = New-Repo 'fresh'
    Save-Fixture 'status-long-fresh' $fresh @('status')
    Save-Fixture 'status-sb-fresh' $fresh @('status', '-sb')
    Save-Fixture 'log-oneline-fresh-error' $fresh @('log', '--oneline') -WithErrors

    # --- Untracked files before the first commit --------------------------------------------
    $unborn = New-Repo 'unborn'
    Write-RepoFile $unborn 'README.md' "# Demo`n"
    Write-RepoFile $unborn 'src/app.ts' "export {};`n"
    Write-RepoFile $unborn 'notes draft.txt' "todo`n"
    Write-RepoFile $unborn '.env' "PORT=3000`n"
    Save-Fixture 'status-long-untracked-unborn' $unborn @('status')
    Save-Fixture 'status-short-untracked-unborn' $unborn @('status', '--short')
    Invoke-Git $unborn add README.md
    Save-Fixture 'status-long-staged-unborn' $unborn @('status')
    Save-Fixture 'status-sb-staged-unborn' $unborn @('status', '-sb')

    # --- Staged, unstaged, and untracked changes all at once --------------------------------
    $mixed = New-Repo 'mixed'
    Write-RepoFile $mixed 'README.md' "# Demo`n"
    Write-RepoFile $mixed 'src/app.ts' "export const app = 1;`n"
    Write-RepoFile $mixed 'src/util.ts' "export const util = 1;`n"
    Write-RepoFile $mixed 'old.txt' "remove me`n"
    Invoke-Git $mixed add .
    New-Commit $mixed 'chore: initial commit'
    Write-RepoFile $mixed 'src/app.ts' "export const app = 2;`n"
    Invoke-Git $mixed add src/app.ts
    Write-RepoFile $mixed 'src/app.ts' "export const app = 3;`n"
    Write-RepoFile $mixed 'README.md' "# Demo`n`nMore docs.`n"
    Write-RepoFile $mixed 'src/new.ts' "export {};`n"
    Invoke-Git $mixed add src/new.ts
    Remove-Item (Join-Path $mixed 'old.txt')
    Write-RepoFile $mixed 'draft notes.md' "ideas`n"
    Write-RepoFile $mixed 'dist/bundle.js' "console.log(1);`n"
    Write-RepoFile $mixed 'café.txt' "unicode name`n"
    Save-Fixture 'status-long-mixed' $mixed @('status')
    Save-Fixture 'status-short-mixed' $mixed @('status', '--short')
    Save-Fixture 'status-sb-mixed' $mixed @('status', '-sb')
    Save-Fixture 'status-porcelain-mixed' $mixed @('status', '--porcelain')
    Save-Fixture 'status-long-mixed-color' $mixed @('status') -Color
    Save-Fixture 'status-sb-mixed-color' $mixed @('status', '-sb') -Color
    Save-Fixture 'status-long-subdir' "$mixed/src" @('status')
    Save-Fixture 'status-short-subdir' "$mixed/src" @('status', '--short')

    # --- Renames, including names with spaces -----------------------------------------------
    $renamed = New-Repo 'renamed'
    Write-RepoFile $renamed 'a.txt' "alpha`n"
    Write-RepoFile $renamed 'old name.txt' "spaced`n"
    Write-RepoFile $renamed 'keep.txt' "keep`n"
    Invoke-Git $renamed add .
    New-Commit $renamed 'chore: initial commit'
    Invoke-Git $renamed mv a.txt b.txt
    Invoke-Git $renamed mv 'old name.txt' 'new name.txt'
    Invoke-Git $renamed mv keep.txt kept.txt
    Write-RepoFile $renamed 'kept.txt' "keep`nchanged after the rename`n"
    Save-Fixture 'status-long-renamed' $renamed @('status')
    Save-Fixture 'status-short-renamed' $renamed @('status', '--short')
    Save-Fixture 'status-porcelain-renamed' $renamed @('status', '--porcelain')

    # --- Deletions, staged and unstaged -----------------------------------------------------
    $deleted = New-Repo 'deleted'
    Write-RepoFile $deleted 'gone-staged.txt' "one`n"
    Write-RepoFile $deleted 'gone-unstaged.txt' "two`n"
    Write-RepoFile $deleted '.env' "PORT=3000`n"
    Invoke-Git $deleted add .
    New-Commit $deleted 'chore: initial commit'
    Invoke-Git $deleted rm -q gone-staged.txt
    Remove-Item (Join-Path $deleted 'gone-unstaged.txt')
    Invoke-Git $deleted rm -q --cached .env
    Save-Fixture 'status-long-deleted' $deleted @('status')
    Save-Fixture 'status-short-deleted' $deleted @('status', '--short')

    # --- A local bare repository standing in for GitHub -------------------------------------
    $origin = Join-Path $work 'origin.git'
    Invoke-Git $work init -q --bare -b main $origin
    $local = New-Repo 'local'
    Write-RepoFile $local 'README.md' "# Demo`n"
    Invoke-Git $local add .
    New-Commit $local 'chore: initial commit'
    Invoke-Git $local remote add origin $origin
    Invoke-Git $local push -u origin main
    Save-Fixture 'status-long-up-to-date' $local @('status')
    Save-Fixture 'status-sb-up-to-date' $local @('status', '-sb')
    Save-Fixture 'status-porcelain-branch-up-to-date' $local @('status', '--porcelain', '-b')

    Write-RepoFile $local 'a.txt' "a`n"
    Invoke-Git $local add a.txt
    New-Commit $local 'feat: add a'
    Write-RepoFile $local 'b.txt' "b`n"
    Invoke-Git $local add b.txt
    New-Commit $local 'feat: add b'
    Write-RepoFile $local 'README.md' "# Demo`n`nEdited.`n"
    Save-Fixture 'status-long-ahead' $local @('status')
    Save-Fixture 'status-sb-ahead' $local @('status', '-sb')
    Invoke-Git $local restore README.md
    Save-Fixture 'status-long-ahead-clean' $local @('status')
    Invoke-Git $local push

    $other = Join-Path $work 'other'
    Invoke-Git $work clone -q $origin $other
    Write-RepoFile $other 'c.txt' "c`n"
    Invoke-Git $other add c.txt
    New-Commit $other 'feat: add c'
    Invoke-Git $other push
    Invoke-Git $local fetch
    Save-Fixture 'status-long-behind' $local @('status')
    Save-Fixture 'status-sb-behind' $local @('status', '-sb')

    Write-RepoFile $local 'd.txt' "d`n"
    Invoke-Git $local add d.txt
    New-Commit $local 'feat: add d'
    Save-Fixture 'status-long-diverged' $local @('status')
    Save-Fixture 'status-sb-diverged' $local @('status', '-sb')
    Save-Fixture 'status-sb-diverged-color' $local @('status', '-sb') -Color

    # A branch whose remote copy was deleted, as after a merged pull request.
    Invoke-Git $local switch -q -c feature/old
    Invoke-Git $local push -u origin feature/old
    Invoke-Git $other push origin --delete feature/old
    Invoke-Git $local fetch --prune
    Save-Fixture 'status-long-gone' $local @('status')
    Save-Fixture 'status-sb-gone' $local @('status', '-sb')

    # --- Detached HEAD ----------------------------------------------------------------------
    Invoke-Git $local switch -q main
    Invoke-Git $local switch -q --detach HEAD~1
    Save-Fixture 'status-long-detached' $local @('status')
    Save-Fixture 'status-sb-detached' $local @('status', '-sb')
    Write-RepoFile $local 'e.txt' "e`n"
    Invoke-Git $local add e.txt
    New-Commit $local 'feat: add e while detached'
    Save-Fixture 'status-long-detached-from' $local @('status')
    Invoke-Git $local switch -q main

    # --- A clean repository with no remote --------------------------------------------------
    $clean = New-Repo 'clean'
    Write-RepoFile $clean 'README.md' "# Demo`n"
    Invoke-Git $clean add .
    New-Commit $clean 'chore: initial commit'
    Save-Fixture 'status-long-clean' $clean @('status')
    Save-Fixture 'status-short-clean' $clean @('status', '--short')
    Save-Fixture 'status-sb-clean' $clean @('status', '-sb')

    # --- Ignored files ----------------------------------------------------------------------
    $ignored = New-Repo 'ignored'
    Write-RepoFile $ignored '.gitignore' "dist/`n.env`n"
    Write-RepoFile $ignored 'README.md' "# Demo`n"
    Invoke-Git $ignored add .
    New-Commit $ignored 'chore: initial commit'
    Write-RepoFile $ignored 'dist/app.js' "bundle`n"
    Write-RepoFile $ignored '.env' "PORT=3000`n"
    Write-RepoFile $ignored 'notes.txt' "notes`n"
    Save-Fixture 'status-short-ignored' $ignored @('status', '--short', '--ignored')
    Save-Fixture 'status-long-ignored' $ignored @('status', '--ignored')

    # --- History: conventional and not, a branch, a merge, tags, and a remote ---------------
    $history = New-Repo 'history'
    Write-RepoFile $history 'README.md' "# Demo`n"
    Invoke-Git $history add .
    New-Commit $history 'Initial commit'
    Write-RepoFile $history 'src/status.ts' "export {};`n"
    Invoke-Git $history add .
    New-Commit $history 'feat: add status parser'
    Write-RepoFile $history 'src/status.ts' "export const quoted = true;`n"
    Invoke-Git $history add .
    New-Commit $history 'fix(parser): handle quoted paths'
    Write-RepoFile $history 'notes.txt' "stuff`n"
    Invoke-Git $history add .
    New-Commit $history 'update stuff'
    Invoke-Git $history tag v1.0
    Invoke-Git $history switch -q -c feature
    Write-RepoFile $history 'src/legacy.ts' "export const legacy = false;`n"
    Invoke-Git $history add .
    New-Commit $history 'feat!: drop legacy format'
    Write-RepoFile $history 'docs/verify.md' "# Verify`n"
    Invoke-Git $history add .
    New-Commit $history 'docs: explain paste verification'
    Invoke-Git $history switch -q main
    Write-RepoFile $history 'src/status.test.ts' "export {};`n"
    Invoke-Git $history add .
    New-Commit $history 'test: cover detached HEAD'
    Step-CommitClock
    Invoke-Git $history merge --no-ff -q feature
    Invoke-Git $history tag -a v1.1 -m 'Release 1.1'
    $historyOrigin = Join-Path $work 'history-origin.git'
    Invoke-Git $work init -q --bare -b main $historyOrigin
    Invoke-Git $history remote add origin $historyOrigin
    Invoke-Git $history push -u origin main feature --tags
    Write-RepoFile $history 'CHANGELOG.md' "# Changelog`n"
    Invoke-Git $history add .
    New-Commit $history 'docs(changelog): start a changelog'
    Save-Fixture 'log-oneline' $history @('log', '--oneline')
    Save-Fixture 'log-oneline-decorate' $history @('log', '--oneline', '--decorate')
    Save-Fixture 'log-oneline-n3' $history @('log', '--oneline', '--decorate', '-3')
    Save-Fixture 'log-oneline-graph' $history @('log', '--oneline', '--graph', '--decorate', '--all')
    Save-Fixture 'log-oneline-graph-color' $history @('log', '--oneline', '--graph', '--decorate', '--all') -Color
    Save-Fixture 'log-oneline-decorate-color' $history @('log', '--oneline', '--decorate') -Color

    $historyClone = Join-Path $work 'history-clone'
    Invoke-Git $work clone -q $historyOrigin $historyClone
    Invoke-Git $historyClone switch -q --detach HEAD~1
    Save-Fixture 'log-oneline-detached' $historyClone @('log', '--oneline', '--decorate', '--all', '-4')

    # --- A merge stopped by a conflict, then a rebase stopped by one ------------------------
    $conflict = New-Repo 'conflict'
    Write-RepoFile $conflict 'app.ts' "export const port = 3000;`n"
    Write-RepoFile $conflict 'README.md' "# Demo`n"
    Invoke-Git $conflict add .
    New-Commit $conflict 'chore: initial commit'
    Invoke-Git $conflict switch -q -c other
    Write-RepoFile $conflict 'app.ts' "export const port = 4000;`n"
    Invoke-Git $conflict add .
    New-Commit $conflict 'feat: move to port 4000'
    Invoke-Git $conflict switch -q main
    Write-RepoFile $conflict 'app.ts' "export const port = 5000;`n"
    Write-RepoFile $conflict 'README.md' "# Demo`n`nPorts.`n"
    Invoke-Git $conflict add .
    New-Commit $conflict 'feat: move to port 5000'
    Invoke-GitConflict $conflict merge other
    Save-Fixture 'status-long-merge-conflict' $conflict @('status')
    Save-Fixture 'status-short-merge-conflict' $conflict @('status', '--short')
    Save-Fixture 'status-sb-merge-conflict' $conflict @('status', '-sb')
    Invoke-Git $conflict add app.ts
    Save-Fixture 'status-long-merge-resolved' $conflict @('status')
    Invoke-Git $conflict merge --abort
    Invoke-Git $conflict switch -q other
    Invoke-GitConflict $conflict rebase main
    Save-Fixture 'status-long-rebase-conflict' $conflict @('status')
    Invoke-Git $conflict rebase --abort

    # New scenarios go below this line. Each commit moves the fake clock, so a commit added
    # above would change every hash after it and break the tests that assert them.

    # --- Submodules with changes inside them ----------------------------------------------
    $shared = New-Repo 'shared'
    Write-RepoFile $shared 'lib.ts' "export const lib = 1;`n"
    Invoke-Git $shared add .
    New-Commit $shared 'chore: initial commit'
    $super = New-Repo 'super'
    Write-RepoFile $super 'README.md' "# Demo`n"
    Invoke-Git $super add .
    New-Commit $super 'chore: initial commit'
    # Since git 2.38.1, cloning a submodule from a local folder needs explicit permission.
    foreach ($submodule in 'lib', 'tools', 'vendor') {
        Invoke-Git $super -c protocol.file.allow=always submodule add -q $shared $submodule
    }
    New-Commit $super 'chore: add submodules'
    # lib: an edited file. tools: a new commit. vendor: a new untracked file.
    Write-RepoFile $super 'lib/lib.ts' "export const lib = 2;`n"
    Write-RepoFile $super 'tools/lib.ts' "export const lib = 3;`n"
    Invoke-Git "$super/tools" add .
    New-Commit "$super/tools" 'feat: bump lib'
    Write-RepoFile $super 'vendor/notes.txt' "notes`n"
    Save-Fixture 'status-long-submodule' $super @('status')
    Save-Fixture 'status-short-submodule' $super @('status', '--short')
    Save-Fixture 'status-porcelain-submodule' $super @('status', '--porcelain')

    # --- Notes below a clean status: a stash count, and advice after a slow scan ----------
    Write-RepoFile $clean 'README.md' "# Demo`n`nWork in progress.`n"
    Invoke-Git $clean stash push -q
    Save-Fixture 'status-long-stash' $clean @('status', '--show-stash')
    # A test switch built into git pretends the scan for untracked files took 3.25 seconds.
    # A real scan can take that long in a big repository on Windows.
    $env:GIT_TEST_UF_DELAY_WARNING = '1'
    Save-Fixture 'status-long-slow-untracked' $clean @('status')
    Remove-Item Env:GIT_TEST_UF_DELAY_WARNING

    # --- Every tracked file, including secrets and build output committed by mistake -------
    $tracked = New-Repo 'tracked'
    Write-RepoFile $tracked 'README.md' "# Demo`n"
    Write-RepoFile $tracked '.env.example' "PORT=`n"
    Write-RepoFile $tracked '.env' "PORT=3000`n"
    Write-RepoFile $tracked 'café/.env.local' "PORT=4000`n"
    Write-RepoFile $tracked 'dist/app.js' "bundle`n"
    Invoke-Git $tracked add .
    New-Commit $tracked 'chore: initial commit'
    Save-Fixture 'ls-files' $tracked @('ls-files')

    Write-Host "Saved fixtures to $OutDir"
}
finally {
    foreach ($name in $gitVariables) {
        [Environment]::SetEnvironmentVariable($name, $savedVariables[$name])
    }
    [Console]::OutputEncoding = $savedEncoding
    if (Test-Path $work) { Remove-Item -Recurse -Force $work }
}
