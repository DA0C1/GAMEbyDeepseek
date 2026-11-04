param([string]$Message)
$shell = New-Object -ComObject WScript.Shell
$null = $shell.Popup($Message, 15, '山海残卷 · 自动同步', 48)
