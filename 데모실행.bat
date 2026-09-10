@echo off
REM ==========================================================
REM  HiSketch (AI Screen Draft) - demo launcher
REM  Double-click to start the server and open the browser.
REM  Korean usage notes: see the .txt file next to this one.
REM ==========================================================
title HiSketch demo server
cd /d "%~dp0"

echo ==================================================
echo    HiSketch (AI Screen Draft) - demo
echo ==================================================
echo.

REM --- 1. find Node.js (PATH, then default install dir) ---
set "NPM="
where node >nul 2>&1
if not errorlevel 1 set "NPM=npm"
if not defined NPM if exist "C:\Program Files\nodejs\npm.cmd" (
  set "PATH=%PATH%;C:\Program Files\nodejs"
  set "NPM=C:\Program Files\nodejs\npm.cmd"
)
if not defined NPM (
  echo [ERROR] Node.js not found.
  echo         Install the LTS version from https://nodejs.org and run again.
  echo.
  pause
  exit /b 1
)

REM --- 2. first run only: install dependencies ---
if not exist "node_modules" (
  echo First run: installing dependencies. This takes 1-2 minutes...
  echo.
  call "%NPM%" install
  if errorlevel 1 (
    echo.
    echo [ERROR] install failed. Check your internet connection and run again.
    pause
    exit /b 1
  )
)

echo.
echo Starting the server. A browser tab will open in a few seconds.
echo If it does not, open this address manually:
echo.
echo        http://localhost:3000
echo.
echo [ Close this black window to stop the server ]
echo.

REM --- 3. open the default browser after ~4 seconds ---
start "" /b cmd /c "ping -n 5 127.0.0.1 >nul & start http://localhost:3000"

REM --- 4. run the server in this window ---
call "%NPM%" start

echo.
echo Server stopped.
pause
