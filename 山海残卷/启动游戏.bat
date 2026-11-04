@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
title SCROLLS OF SHANHAI
color 0E
set "GAME_DIR=%~dp0"

if not exist "%GAME_DIR%\index.html" (
  echo [ERROR] Game files not found at %GAME_DIR%
  pause
  exit /b 1
)

cd /d "%GAME_DIR%"

echo.
echo   SCROLLS OF SHANHAI
echo   --------------------------
echo   Starting local server ...
echo.

where node >nul 2>nul
if %errorlevel%==0 goto withnode

where python >nul 2>nul
if %errorlevel%==0 goto withpy

echo Python / Node not found. Please install one of them.
pause
exit /b 1

:withpy
if exist "%GAME_DIR%\tools\serve.py" goto withpy_fast
start "SHANHAI server" /min cmd /c "python -m http.server 8899 --bind 127.0.0.1"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8899/index.html"
exit /b 0

:withpy_fast
start "SHANHAI server" /min cmd /c python "%GAME_DIR%\tools\serve.py" 8899
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8899/index.html"
exit /b 0

:withnode
start "SHANHAI server" /min node tools\serve.cjs 8899
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8899/index.html"
exit /b 0
