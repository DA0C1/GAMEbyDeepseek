param([ValidateSet('Start', 'Stop', 'Run', 'Status')][string]$Action = 'Start')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$repository = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $repository '.game-sync'
$daemon = Join-Path $PSScriptRoot 'auto-sync.cjs'
$stateFile = Join-Path $runtime 'state.json'
$stopFile = Join-Path $runtime 'stop'
$startupLink = Join-Path ([Environment]::GetFolderPath('Startup')) '山海残卷 GitHub 自动同步.lnk'
$control = Join-Path $PSScriptRoot 'Control-AutoSync.ps1'

function Get-SyncProcess {
  if (-not (Test-Path -LiteralPath $stateFile)) { return $null }
  try {
    $saved = Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $candidate = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$saved.pid)
    if ($candidate -and $candidate.CommandLine -and $candidate.CommandLine.Contains($daemon)) { return $candidate }
  } catch {}
  return $null
}

try {
  if ($Action -eq 'Status') {
    $statusFile = Join-Path $runtime 'status.txt'
    if (Test-Path -LiteralPath $statusFile) {
      Start-Process -FilePath notepad.exe -ArgumentList @('"' + $statusFile + '"') -WindowStyle Normal
    } else { Write-Host '自动同步尚未启动。' }
    exit 0
  }

  if ($Action -eq 'Stop') {
    if (Test-Path -LiteralPath $startupLink) {
      $shell = New-Object -ComObject WScript.Shell
      if ($shell.CreateShortcut($startupLink).Arguments.Contains($control)) {
        Remove-Item -LiteralPath $startupLink
      }
    }
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    [IO.File]::WriteAllText($stopFile, 'stop')
    for ($attempt = 0; $attempt -lt 30 -and (Get-SyncProcess); $attempt++) { Start-Sleep -Milliseconds 500 }
    if (Get-SyncProcess) { Write-Host '已取消登录启动；正在等待本次同步完成后停止。' }
    else { Write-Host '自动同步已停止，登录后也不会再自动启动。' }
    exit 0
  }

  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  $nodeExecutable = $null
  if ($nodeCommand) { $nodeExecutable = $nodeCommand.Source }
  if (-not $nodeExecutable) {
    foreach ($candidate in @(
      (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
      (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
    )) {
      if (Test-Path -LiteralPath $candidate) { $nodeExecutable = $candidate; break }
    }
  }
  if (-not $nodeExecutable) { throw '未找到 Node.js，请安装 Node.js 22 或以上版本。' }
  New-Item -ItemType Directory -Path $runtime -Force | Out-Null
  if (Test-Path -LiteralPath $stopFile) { Remove-Item -LiteralPath $stopFile }

  if ($Action -eq 'Start') {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($startupLink)
    $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $shortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $control + '" -Action Run'
    $shortcut.WorkingDirectory = $repository
    $shortcut.WindowStyle = 7
    $shortcut.Description = '山海残卷：本地改动自动上传，定时获取 GitHub 更新。'
    $shortcut.Save()
  }

  if (-not (Get-SyncProcess)) {
    Start-Process -FilePath $nodeExecutable -ArgumentList @('"' + $daemon + '"') -WorkingDirectory $repository -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $runtime 'launcher-output.log') -RedirectStandardError (Join-Path $runtime 'launcher-error.log')
    for ($attempt = 0; $attempt -lt 20 -and -not (Get-SyncProcess); $attempt++) { Start-Sleep -Milliseconds 250 }
    if (-not (Get-SyncProcess)) { throw '后台进程未能启动，请查看 .game-sync 中的启动日志。' }
  }
  Write-Host '后台自动同步已启动：改动停稳 5 秒后上传，每 30 秒检查 GitHub。'
  if ($Action -eq 'Start') { Write-Host '已设置登录 Windows 后自动启动。' }
} catch {
  Write-Host ('未完成：' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
