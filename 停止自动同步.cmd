@echo off
setlocal
chcp 65001 >nul
title SHANHAI - Stop Auto Sync
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Control-AutoSync.ps1" -Action Stop
pause
