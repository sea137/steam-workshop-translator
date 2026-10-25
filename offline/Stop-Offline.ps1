$ErrorActionPreference = 'Stop'
$offlineRoot = Join-Path $env:LOCALAPPDATA 'HaijingTools\offline'
$pidFile = Join-Path $offlineRoot 'server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host '离线翻译没有运行。'; exit 0 }
$serverPid = 0
if (-not [int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$serverPid)) { throw '进程记录无效。' }
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid"
$expectedPython = Join-Path $offlineRoot 'venv\Scripts\python.exe'
$expectedServer = Join-Path $offlineRoot 'server.py'
if ($process -and $process.ExecutablePath -eq $expectedPython -and $process.CommandLine.Contains($expectedServer)) {
    Stop-Process -Id $serverPid
    Write-Host '离线翻译已停止。'
} else { Write-Host '记录的离线进程已经退出。' }
