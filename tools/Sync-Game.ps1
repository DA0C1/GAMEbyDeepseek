param(
  [string]$RepositoryPath = (Split-Path -Parent $PSScriptRoot),
  [string]$Message
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$gitExecutable = $null
$repositoryRoot = $null
$syncLock = $null
$resultCode = 0

function Invoke-GameGit {
  param([string[]]$Arguments, [switch]$ReadOutput)

  # Windows PowerShell 5 treats native stderr as ErrorRecord, including successful Git progress.
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $lines = @(& $script:gitExecutable -C $script:repositoryRoot @Arguments 2>&1)
    $nativeExit = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  $output = @($lines | ForEach-Object { $_.ToString() })
  if (-not $ReadOutput -or $nativeExit -ne 0) {
    $output | ForEach-Object { Write-Host $_ }
  }
  if ($nativeExit -ne 0) { throw ('Git ' + $Arguments[0] + ' 未完成，请查看上面的提示。') }
  if ($ReadOutput) { return $output }
}

try {
  $gitCommand = Get-Command git.exe -ErrorAction SilentlyContinue
  if ($gitCommand) { $gitExecutable = $gitCommand.Source }
  if (-not $gitExecutable) {
    foreach ($candidate in @(
      (Join-Path $env:ProgramFiles 'Git\cmd\git.exe'),
      (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe')
    )) {
      if (Test-Path -LiteralPath $candidate) { $gitExecutable = $candidate; break }
    }
  }
  if (-not $gitExecutable) { throw '未找到 Git，请安装 Git for Windows 后重试。' }

  $repositoryRoot = (Resolve-Path -LiteralPath $RepositoryPath).Path
  $actualRoot = (Invoke-GameGit -Arguments @('rev-parse', '--show-toplevel') -ReadOutput) -join ''
  if ([IO.Path]::GetFullPath($actualRoot) -ne [IO.Path]::GetFullPath($repositoryRoot)) {
    throw '请在游戏仓库根目录使用同步入口。'
  }
  $gitDirectory = (Invoke-GameGit -Arguments @('rev-parse', '--absolute-git-dir') -ReadOutput) -join ''
  try {
    $syncLock = [IO.File]::Open((Join-Path $gitDirectory 'game-sync.lock'), [IO.FileMode]::OpenOrCreate,
      [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  } catch { throw '另一个同步正在运行，请等它完成后再试。' }

  $branch = (Invoke-GameGit -Arguments @('symbolic-ref', '--quiet', '--short', 'HEAD') -ReadOutput) -join ''
  if ($branch -ne 'main') { throw '当前不在 main 分支，请先切回 main 再同步。' }
  foreach ($state in @('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply')) {
    if (Test-Path -LiteralPath (Join-Path $gitDirectory $state)) {
      throw '有尚未完成的合并或其他 Git 操作，请先处理完成，再运行同步。'
    }
  }
  $unmerged = @(Invoke-GameGit -Arguments @('diff', '--name-only', '--diff-filter=U') -ReadOutput)
  if ($unmerged.Count -gt 0) { throw '存在未解决的文件冲突，请先处理完成。' }

  Write-Host '正在检查 GitHub 更新……'
  Invoke-GameGit -Arguments @('fetch', 'origin')

  $changes = @(Invoke-GameGit -Arguments @('status', '--porcelain=v1') -ReadOutput)
  if ($changes.Count -gt 0) {
    if ([string]::IsNullOrWhiteSpace($Message)) { $Message = 'sync: update game ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') }
    Write-Host '正在保存本地修改……'
    Invoke-GameGit -Arguments @('add', '-A', '--', '.')
    Invoke-GameGit -Arguments @('commit', '-m', $Message)
  } else { Write-Host '本地没有新的文件修改。' }

  Write-Host '正在合并 GitHub 更新……'
  Invoke-GameGit -Arguments @('merge', '--no-edit', 'origin/main')
  Write-Host '正在上传到 GitHub……'
  Invoke-GameGit -Arguments @('push', 'origin', 'HEAD:refs/heads/main')

  $localHead = (Invoke-GameGit -Arguments @('rev-parse', 'HEAD') -ReadOutput) -join ''
  $remoteHead = (Invoke-GameGit -Arguments @('rev-parse', 'origin/main') -ReadOutput) -join ''
  if ($localHead -ne $remoteHead) { throw '远端状态发生变化，请再次运行同步。' }
  $remaining = @(Invoke-GameGit -Arguments @('status', '--porcelain=v1') -ReadOutput)
  if ($remaining.Count -gt 0) { throw '已提交的内容已同步，但同步期间又出现了新修改，请再次运行。' }
  Write-Host ('同步完成：本地与 GitHub 一致（' + $localHead.Substring(0, 7) + '）。') -ForegroundColor Green
} catch {
  Write-Host ('同步已停止：' + $_.Exception.Message) -ForegroundColor Red
  Write-Host '本地文件和提交均已保留。若有冲突，请解决并完成合并后再运行；网络失败可直接重试。'
  $resultCode = 1
} finally {
  if ($syncLock) { $syncLock.Dispose() }
}

exit $resultCode
