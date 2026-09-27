@echo off
rem Starts SHIP IT: the game and Sage (the AI mentor), then opens it in Google Chrome.
rem Double-click this file. Close this window, or press Ctrl+C then Y, to stop everything.
setlocal
title SHIP IT
echo Starting SHIP IT, one moment...
cd /d "%~dp0"

rem A copy on the Desktop can't find the game. A shortcut to this file works fine.
if not exist "package.json" goto :not_in_repo
if not exist "scripts\open-when-ready.ps1" goto :not_in_repo

rem The save lives in Chrome under this exact address, so the game always uses this port.
set "GAME_URL=http://localhost:18173/"

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed, or npm is not on PATH.
  echo Install Node.js 24 LTS from https://nodejs.org, then double-click this file again.
  pause
  exit /b 1
)

rem Agents work in this folder on branches. Playing unmerged work uses the real save, so ask.
set "BRANCH="
set "DIRTY="
for /f "delims=" %%B in ('git branch --show-current 2^>nul') do set "BRANCH=%%B"
for /f "delims=" %%L in ('git status --porcelain 2^>nul') do set "DIRTY=1"
if defined BRANCH if /i not "%BRANCH%"=="main" goto :work_in_progress
if defined DIRTY goto :work_in_progress
:branch_checked

rem Already running from this folder? Then just bring the game up in Chrome.
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\open-when-ready.ps1" -Url "%GAME_URL%" -CheckOnly
if %errorlevel% equ 3 (
  echo SHIP IT is already running, so this opened it in a new Chrome tab.
  echo That tab has your save now. Any older SHIP IT tab stops saving, so you can close it.
  timeout /t 5 >nul
  exit /b 0
)
if %errorlevel% equ 4 (
  echo.
  echo Another program is using port 18173, so SHIP IT can't start there.
  echo Close that program, or restart the computer, then double-click this file again.
  pause
  exit /b 1
)

rem Only one launcher at a time gets past this point. Windows frees the lock file as soon as
rem the window closes, even if it crashes.
set "STARTED="
call :start 9>"%TEMP%\ship-it-launcher.lock"
if not defined STARTED (
  echo SHIP IT is already starting in another window. Chrome opens by itself when it's ready.
  timeout /t 5 >nul
)
exit /b 0

:start
set "STARTED=1"

rem Install or repair packages: first run, an interrupted install, or new ones from git pull.
call npm ls --all >nul 2>nul
if errorlevel 1 (
  echo Installing packages. This takes a minute or two. Keep this window open.
  call npm ci || goto :install_failed
)

rem A helper waits in the background until the game answers, then opens Chrome.
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\open-when-ready.ps1" -Url "%GAME_URL%" -Detach

echo.
echo SHIP IT runs at %GAME_URL% and Chrome opens by itself in a few seconds.
echo Keep this window open while you play. To stop: close it, or press Ctrl+C then Y.
echo.
call npm run dev

echo.
echo SHIP IT stopped. If it stopped by itself, read the messages above.
echo "EACCES" or "already in use" next to port 18173 means Windows or another program holds
echo the port: see Troubleshooting in README.md.
pause
exit /b 0

:install_failed
echo.
echo Installing packages failed. Read the messages above, then double-click this file again.
pause
exit /b 1

:work_in_progress
echo.
echo Heads up: this folder has unmerged work in it (branch "%BRANCH%").
echo Playing it uses your real save, and progress made on unfinished code may not carry over.
echo To play the finished game, switch back to main first: git switch main
echo Press any key to play anyway, or close this window.
pause >nul
goto :branch_checked

:not_in_repo
echo.
echo start-ship-it.bat has to stay in the SHIP IT folder.
echo For a desktop icon, right-click it and choose Send to, then Desktop (create shortcut).
pause
exit /b 1
