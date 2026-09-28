<#
.SYNOPSIS
Captures real PowerShell 7 output that Act 1's simulated shell must match.

.DESCRIPTION
Act 1 teaches the player's own terminal, so its simulated commands must print what
PowerShell really prints: the same headers, columns, dates and error wording. This script
runs the real commands against a throwaway folder under $env:TEMP and saves their output
next to this script as .txt files, which the shell's tests compare against.

To keep the captures stable and free of personal details:
- Output is plain text (no colours), errors use ConciseView, and the culture is en-US.
- Every file and folder in the throwaway tree is dated 2026-09-27 10:15.
- The throwaway folder's real path is rewritten as C:\Users\kyle, the simulated home.
- This terminal's process id is rewritten as {PID}.

When it finishes (or fails), it deletes the throwaway folder, stops the test listener,
and puts back every setting it changed, so your terminal is left as it was.

Run it from the repo root in PowerShell 7:
    pwsh -File src/engine/shell/machine/fixtures/capture-shell.ps1
#>

#Requires -Version 7.2
param([string]$OutDir = $PSScriptRoot)

$ErrorActionPreference = 'Stop'
# A native program's non-zero exit code is part of what's captured, not a script error.
$PSNativeCommandUseErrorActionPreference = $false
$utf8 = [System.Text.UTF8Encoding]::new($false)
$work = Join-Path $env:TEMP 'ship-it-shell-captures'
$fakeHome = Join-Path $work 'home'
$fixed = Get-Date '2026-09-27T10:15:00'
$port = 48123

$savedRendering = $PSStyle.OutputRendering
$savedErrorView = $ErrorView
$savedCulture = [System.Threading.Thread]::CurrentThread.CurrentCulture
$savedUiCulture = [System.Threading.Thread]::CurrentThread.CurrentUICulture
$savedLocation = Get-Location
$listener = $null

# Makes captured text the same on every machine: \r\n becomes \n, the throwaway home reads
# as the simulated one, and this terminal's process id becomes {PID}.
function ConvertTo-Stable([string]$Text) {
    $stable = $Text -replace "`r`n", "`n"
    $stable = $stable.Replace($fakeHome, 'C:\Users\kyle')
    $stable = $stable.Replace($env:USERPROFILE, 'C:\Users\kyle')
    $stable = $stable -replace "\b$PID\b", '{PID}'
    # npm names its log file after the moment it ran.
    $stable = $stable -replace '\d{4}-\d{2}-\d{2}T\d{2}_\d{2}_\d{2}_\d{3}Z', '{TIMESTAMP}'
    return $stable
}

function Save-Capture([string]$Name, [string]$Text) {
    [System.IO.File]::WriteAllText((Join-Path $OutDir "$Name.txt"), (ConvertTo-Stable $Text), $utf8)
    Write-Host "captured $Name"
}

# Runs a command and captures what it prints, the way the terminal would show it.
function Save-Output([string]$Name, [scriptblock]$Command) {
    Save-Capture $Name ((& $Command) | Out-String -Width 120)
}

# Runs a command that should fail, the way a player types it at the prompt, and captures
# its error. It runs in a fresh pwsh: inside this script, errors would also show the
# script's file and line, which a typed command never does.
function Save-Error([string]$Name, [string]$Command) {
    $setup = @(
        "`$PSStyle.OutputRendering = 'PlainText'"
        "`$ErrorView = 'ConciseView'"
        "[System.Threading.Thread]::CurrentThread.CurrentCulture = 'en-US'"
        "[System.Threading.Thread]::CurrentThread.CurrentUICulture = 'en-US'"
        "Set-Location -LiteralPath '$fakeHome'"
    ) -join '; '
    $output = & pwsh -NoProfile -NonInteractive -Command "$setup; $Command" 2>&1 |
        ForEach-Object { "$_" }
    if ($output.Count -eq 0) { throw "$Name was expected to fail, but printed nothing." }
    Save-Capture $Name (($output -join "`n") + "`n")
}

# Runs a native program and captures everything it prints, plus its exit code.
function Save-Native([string]$Name, [string]$Program, [string[]]$Arguments) {
    $found = Get-Command $Program -ErrorAction SilentlyContinue
    if ($null -eq $found) {
        Save-Capture $Name "(not installed: $Program)`n"
        return
    }
    $output = & $Program @Arguments 2>&1 | ForEach-Object { "$_" }
    Save-Capture $Name ((($output -join "`n") + "`n") + "exit code: $LASTEXITCODE`n")
}

try {
    $PSStyle.OutputRendering = 'PlainText'
    $ErrorView = 'ConciseView'
    [System.Threading.Thread]::CurrentThread.CurrentCulture = 'en-US'
    [System.Threading.Thread]::CurrentThread.CurrentUICulture = 'en-US'

    if (Test-Path $work) { Remove-Item $work -Recurse -Force }
    $null = New-Item -ItemType Directory -Path $fakeHome
    $null = New-Item -ItemType Directory -Path (Join-Path $fakeHome 'quillwork\api\docs')
    $null = New-Item -ItemType Directory -Path (Join-Path $fakeHome 'quillwork\web')
    $null = New-Item -ItemType Directory -Path (Join-Path $fakeHome 'Downloads')
    $hidden = New-Item -ItemType Directory -Path (Join-Path $fakeHome '.cache')
    $hidden.Attributes = $hidden.Attributes -bor [System.IO.FileAttributes]::Hidden
    Set-Content (Join-Path $fakeHome 'notes.txt') 'ship it'
    Set-Content (Join-Path $fakeHome 'quillwork\api\package.json') '{ "name": "quillwork-api", "version": "1.0.0" }'
    Set-Content (Join-Path $fakeHome 'quillwork\api\server.js') "require('dotenv').config();"
    Set-Content (Join-Path $fakeHome 'quillwork\api\.env.example') "PORT=`nLOG_LEVEL="
    Set-Content (Join-Path $fakeHome 'quillwork\api\docs\setup.md') '# Setup'
    Set-Content (Join-Path $fakeHome 'quillwork\web\index.html') '<!doctype html>'
    Get-ChildItem $fakeHome -Recurse -Force | ForEach-Object { $_.LastWriteTime = $fixed }
    (Get-Item $fakeHome).LastWriteTime = $fixed

    Set-Location $fakeHome

    # What these captures came from, so a later PowerShell's changes can be spotted.
    Save-Capture 'captured-with' "PowerShell $($PSVersionTable.PSVersion)`nWindows $([Environment]::OSVersion.Version)`n"

    # ---- Location and listings ----
    Save-Output 'get-location' { Get-Location }
    Save-Output 'ls' { Get-ChildItem }
    Save-Output 'ls-force' { Get-ChildItem -Force }
    Save-Output 'ls-name' { Get-ChildItem -Name }
    Save-Output 'ls-recurse' { Get-ChildItem quillwork -Recurse }
    Save-Output 'ls-env-temp' { Get-ChildItem Env:TEMP }

    # ---- Creating items (dated after creation, so the listing is stable) ----
    Save-Output 'new-item-file' {
        $item = New-Item standup.md
        $item.LastWriteTime = $fixed
        Get-Item standup.md
    }
    Save-Output 'new-item-folder' {
        $item = New-Item -ItemType Directory logs
        $item.LastWriteTime = $fixed
        Get-Item logs
    }

    # ---- Errors, word for word ----
    Save-Error 'error-not-recognized' 'nope-not-a-command'
    Save-Error 'error-cd-missing' 'Set-Location nope'
    Save-Error 'error-cd-file' 'Set-Location notes.txt'
    Save-Error 'error-cd-no-drive' "Set-Location 'Q:\games'"
    Save-Error 'error-cd-positional' 'Set-Location C:\Program Files\nodejs'
    Save-Error 'error-dir-s' 'Get-ChildItem /s'
    Save-Error 'error-rm-rf' 'Remove-Item -rf notes.txt'
    Save-Error 'error-ls-ambiguous' 'Get-ChildItem -f'
    Save-Error 'error-new-item-exists' 'New-Item notes.txt'
    Save-Error 'error-stop-process-missing-id' 'Stop-Process -Id'
    Save-Error 'error-stop-process-no-such' 'Stop-Process -Id 999999'
    Save-Error 'error-get-process-missing' 'Get-Process nod'
    Save-Error 'error-tcp-missing' "Get-NetTCPConnection -LocalPort $($port + 1)"

    # ---- Commands, processes, ports (machine-dependent: tests compare their shape) ----
    Save-Output 'get-command' {
        Get-Command Get-ChildItem, ls, where.exe, npm -ErrorAction SilentlyContinue
    }
    Save-Output 'get-process-self' { Get-Process -Id $PID }
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
    $listener.Start()
    Save-Output 'tcp-listen' { Get-NetTCPConnection -LocalPort $port -State Listen }
    Save-Capture 'netstat-listen' ((((netstat -ano | Select-String ":$port\b") | ForEach-Object { "$_" }) -join "`n") + "`n")
    $listener.Stop()
    $listener = $null

    # ---- Native programs ----
    Save-Native 'where-missing' 'where.exe' @('nope-not-a-program')
    Save-Native 'version-node' 'node' @('--version')
    Save-Native 'version-npm' 'npm' @('--version')
    Save-Native 'version-python' 'python' @('--version')
    Save-Native 'version-pip' 'pip' @('--version')
    Save-Native 'version-winget' 'winget' @('--version')
    $project = Join-Path $work 'npm-project'
    $null = New-Item -ItemType Directory -Path $project
    Set-Content (Join-Path $project 'package.json') '{ "name": "capture", "version": "1.0.0" }'
    Set-Location $project
    Save-Native 'npm-run-missing' 'npm' @('run', 'nope')
    Set-Location $fakeHome
} finally {
    if ($null -ne $listener) { $listener.Stop() }
    Set-Location $savedLocation
    $PSStyle.OutputRendering = $savedRendering
    $ErrorView = $savedErrorView
    [System.Threading.Thread]::CurrentThread.CurrentCulture = $savedCulture
    [System.Threading.Thread]::CurrentThread.CurrentUICulture = $savedUiCulture
    if (Test-Path $work) { Remove-Item $work -Recurse -Force }
}
