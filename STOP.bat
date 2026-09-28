@echo off
rem STOP.bat: stops SHIP IT (the game and Sage) if it's still running from this folder.
rem Other programs, and other copies of the project, are left alone.
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\stop-ship-it.ps1"
if errorlevel 1 (
  echo.
  echo Stopping SHIP IT failed. Read the message above.
  pause
  exit /b 1
)
rem Windows' own timeout: another one (like Git's) may come first on PATH.
"%SystemRoot%\System32\timeout.exe" /t 3 >nul 2>nul
exit /b 0