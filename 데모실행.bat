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

REM --- 1. locate node.exe (default install dir first, then PATH) ---
set "NODE="
if exist "C:\Program Files\nodejs\node.exe" set "NODE=C:\Program Files\nodejs\node.exe"
if not defined NODE (
  for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE set "NODE=%%N"
)
if not defined NODE (
  echo [ERROR] Node.js not found.
  echo         Install the LTS version from https://nodejs.org and run again.
  echo.
  pause
  exit /b 1
)
echo Using Node: %NODE%
echo.

REM --- 2. first run only: install dependencies ---
if not exist "node_modules\express\package.json" (
  echo Dependencies are missing. Installing... this takes 1-2 minutes and needs internet.
  echo.
  set "NPMCMD=npm"
  if exist "C:\Program Files\nodejs\npm.cmd" set "NPMCMD=C:\Program Files\nodejs\npm.cmd"
  call "%NPMCMD%" install
  if not exist "node_modules\express\package.json" (
    echo.
    echo [ERROR] Automatic install failed.
    echo         Open a terminal in this folder and run:   npm install
    echo         Then run this file again.
    pause
    exit /b 1
  )
)

echo Starting the server. A browser tab will open in a few seconds.
echo If it does not, open this address manually:
echo.
echo        http://localhost:3000
echo.
echo [ Close this black window to stop the server ]
echo.

REM --- 3. open the default browser after ~4 seconds ---
start "" /b cmd /c "ping -n 5 127.0.0.1 >nul & start http://localhost:3000"

REM --- 4. run the server directly with node (no npm needed) ---
"%NODE%" src\server\index.js

echo.
echo Server stopped.
pause
