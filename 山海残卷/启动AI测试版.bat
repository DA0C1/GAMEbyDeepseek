@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or newer first.
  pause
  exit /b 1
)
start "SHANHAI AI TEST server" /min node tools\serve.cjs 8898
timeout /t 2 /nobreak >nul
start "" "http://localhost:8898/ai-test.html"
