<#
.SYNOPSIS
Stops SHIP IT's dev servers (the game and Sage) started from this folder. STOP.bat runs it.

.DESCRIPTION
Finds the node processes whose command line points into this folder (Vite, the Sage
server, and concurrently, which runs both) and ends each one with its child processes.
Nothing else is touched: not other programs, and not other copies of the repo.
#>
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\') + '\'

$running = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $null -ne $_.CommandLine -and $_.CommandLine.Contains($root) })

if ($running.Count -eq 0) {
    Write-Host 'SHIP IT is not running.'
    exit 0
}

# taskkill reports on stderr when a process is already gone (ended with its parent's tree a
# moment ago). That's fine, so don't let it count as a failure; the check below decides.
$ErrorActionPreference = 'Continue'
foreach ($process in $running) {
    & taskkill.exe /PID $process.ProcessId /T /F *> $null
}

$left = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $null -ne $_.CommandLine -and $_.CommandLine.Contains($root) })
if ($left.Count -gt 0) {
    Write-Host "Could not stop $($left.Count) SHIP IT process(es): $($left.ProcessId -join ', ')"
    exit 1
}
Write-Host 'SHIP IT stopped.'