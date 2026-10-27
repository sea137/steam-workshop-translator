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
    # A Windows venv launcher starts a child managed Python that owns the port.
    # Stop only children whose executable and server arguments belong to us.
    $managedRoot = [IO.Path]::GetFullPath((Join-Path $offlineRoot 'python')) + [IO.Path]::DirectorySeparatorChar
    foreach ($child in @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$serverPid")) {
        if ($child.ExecutablePath -and $child.ExecutablePath.StartsWith($managedRoot, [StringComparison]::OrdinalIgnoreCase) -and
            [IO.Path]::GetFileName($child.ExecutablePath) -eq 'python.exe' -and $child.CommandLine.Contains($expectedServer)) {
            Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
        }
    }
    Stop-Process -Id $serverPid -ErrorAction SilentlyContinue
    Write-Host '离线翻译已停止。'
} else { Write-Host '记录的离线进程已经退出。' }
