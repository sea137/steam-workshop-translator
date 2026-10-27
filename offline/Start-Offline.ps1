[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$offlineRoot = Join-Path $env:LOCALAPPDATA 'HaijingTools\offline'
$pythonExe = Join-Path $offlineRoot 'venv\Scripts\python.exe'
$serverFile = Join-Path $offlineRoot 'server.py'
$modelRoot = Join-Path $offlineRoot 'models\translate-en_zh-1_9'
Add-Type -AssemblyName System.Net.Http
function Get-LocalHealth {
    $handler = [Net.Http.HttpClientHandler]::new(); $handler.UseProxy = $false
    $client = [Net.Http.HttpClient]::new($handler); $client.Timeout = [TimeSpan]::FromSeconds(2)
    try { return ($client.GetStringAsync('http://127.0.0.1:17653/health').GetAwaiter().GetResult() | ConvertFrom-Json) }
    catch { return $null }
    finally { $client.Dispose(); $handler.Dispose() }
}
try {
    $health = Get-LocalHealth
    if ($health.service -eq 'HaijingToolsOffline') {
        if ($health.version -lt 2) { Write-Host '离线服务是旧版。升级后请先运行「停止离线翻译.cmd」，再运行本启动脚本更新服务。' -ForegroundColor Yellow }
        else { Write-Host '离线翻译已经运行。' }
        exit 0
    }
    if ($health) { throw '端口被其他程序占用。' }
    if (-not (Test-Path -LiteralPath $pythonExe) -or -not (Test-Path -LiteralPath (Join-Path $modelRoot 'model\model.bin'))) {
        throw '请先运行「安装离线翻译.cmd」。'
    }
    if (Get-NetTCPConnection -State Listen -LocalPort 17653 -ErrorAction SilentlyContinue) {
        throw '17653 端口仍被占用，但健康检查失败。服务可能繁忙或异常；请先运行「停止离线翻译.cmd」再启动，勿重复启动多个进程。'
    }
    $serverSource = Join-Path $PSScriptRoot 'server.py'
    if ([IO.Path]::GetFullPath($serverSource) -ne [IO.Path]::GetFullPath($serverFile)) {
        Copy-Item -LiteralPath $serverSource -Destination $serverFile -Force
    }
    foreach ($logName in @('server-error.log','server.log')) {
        $logPath = Join-Path $offlineRoot $logName
        if (Test-Path -LiteralPath $logPath) {
            Copy-Item -LiteralPath $logPath -Destination ($logPath + '.' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.bak')
        }
    }
    $proc = Start-Process -FilePath $pythonExe -ArgumentList @(('"' + $serverFile + '"'), '--model', ('"' + $modelRoot + '"')) -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $offlineRoot 'server-error.log') -RedirectStandardOutput (Join-Path $offlineRoot 'server.log')
    [IO.File]::WriteAllText((Join-Path $offlineRoot 'server.pid'), [string]$proc.Id)
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 500
        try {
            $health = Get-LocalHealth
            if ($health.service -eq 'HaijingToolsOffline') {
                Write-Host '离线翻译已启动。回到 Steam，在「翻译源」选择「本地模型」。' -ForegroundColor Green
                Write-Host '此后翻译不联网。重启电脑后需要再次运行「启动离线翻译.cmd」。'
                exit 0
            }
        } catch { }
        if ($proc.HasExited) { throw ('离线服务启动失败，请查看：' + (Join-Path $offlineRoot 'server-error.log')) }
    }
    throw '启动超时，请检查本机 17653 端口及运行环境。'
} catch { Write-Error $_; exit 1 }
