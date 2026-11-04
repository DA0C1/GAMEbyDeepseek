@echo off
setlocal
chcp 65001 >nul
title SHANHAI - GitHub Sync
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Sync-Game.ps1"
set "SYNC_RESULT=%errorlevel%"
echo.
pause
exit /b %SYNC_RESULT%
