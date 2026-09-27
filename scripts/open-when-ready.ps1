<#
.SYNOPSIS
Opens SHIP IT in Google Chrome once this folder's game server answers. start-ship-it.bat
runs it.

.DESCRIPTION
Asks the dev server at -Url which folder it serves (/__ship-it/checkout, added by
vite.config.ts). Only an answer naming this checkout counts as "SHIP IT is running", so
another app on the port, or another copy of the repo, is never mistaken for the game.

Without -CheckOnly: waits up to -TimeoutSeconds for the game, then opens Chrome (or the
default browser when Chrome isn't installed). Exits 0 when it opened the game, 1 on
timeout.

With -Detach: starts the waiting version in its own minimized window and returns at once.

With -CheckOnly: doesn't wait. Exit codes, read by start-ship-it.bat:
  3  this folder's game is already running (Chrome was opened on it)
  4  something else is using the port
  1  nothing is running there

Chrome specifically, because the save lives inside the browser: always the same browser at
the same address keeps all progress in one place.
#>
param(
    [string]$Url = 'http://localhost:18173/',
    [int]$TimeoutSeconds = 120,
    [switch]$CheckOnly,
    [switch]$Detach
)

if ($Detach) {
    # Relaunch in its own minimized window and return at once. Start-Process doesn't pass the
    # launcher's open handles on, so the launcher's lock file is freed the moment its window
    # closes, instead of staying held by this helper (or by Chrome) for minutes.
    Start-Process -FilePath 'powershell' -WindowStyle Minimized -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Url', $Url
    )
    exit 0
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')

# 'ours' when this folder's dev server answers, 'other' when something else does, 'down'
# when nothing answers at all.
function Get-GameState {
    try {
        $response = Invoke-WebRequest -Uri ($Url.TrimEnd('/') + '/__ship-it/checkout') `
            -UseBasicParsing -TimeoutSec 2
    } catch {
        # A 404 means some other web app is listening. No response means nothing is.
        if ($_.Exception.Response) { return 'other' }
        return 'down'
    }
    $served = ([string]$response.Content).Trim().TrimEnd('\', '/')
    if ($served -ieq $repoRoot) { return 'ours' }
    return 'other'
}

function Open-Game {
    $chrome = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($chrome) {
        Start-Process -FilePath $chrome -ArgumentList $Url
    } else {
        Start-Process -FilePath $Url
    }
}

if ($CheckOnly) {
    switch (Get-GameState) {
        'ours' { Open-Game; exit 3 }
        'other' { exit 4 }
        default { exit 1 }
    }
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
    if ((Get-GameState) -eq 'ours') {
        Open-Game
        exit 0
    }
    Start-Sleep -Milliseconds 500
}
# The game never came up. The launcher window shows why, so opening a dead page would only
# add confusion.
exit 1
