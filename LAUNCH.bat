@echo off
rem LAUNCH.bat: double-click to play SHIP IT.
rem It installs packages only if they're missing, starts the game and Sage (the AI mentor),
rem and opens Chrome at http://localhost:18173 when the game is ready.
rem To stop: close the SHIP IT window, or double-click STOP.bat.
cd /d "%~dp0"

if not exist "%~dp0start-ship-it.bat" (
  echo.
  echo start-ship-it.bat is missing from this folder, so SHIP IT can't start.
  echo Keep LAUNCH.bat in the SHIP IT folder, next to package.json.
  pause
  exit /b 1
)

rem start-ship-it.bat does the work: it checks for Node.js, installs packages when they're
rem missing or broken, starts everything, opens Chrome, and pauses on any error.
call "%~dp0start-ship-it.bat"
exit /b %errorlevel%