[CmdletBinding()]
param([string]$ModelPath)
$ErrorActionPreference = 'Stop'
$offlineRoot = Join-Path $env:LOCALAPPDATA 'HaijingTools\offline'
if (-not $ModelPath) {
    $bundledModel = Join-Path (Split-Path -Parent $PSScriptRoot) 'models\translate-en_zh-1_9.argosmodel'
    if (Test-Path -LiteralPath $bundledModel) { $ModelPath = $bundledModel }
}

function Get-VerifiedDownload([string]$Url, [string]$Destination, [string]$Sha256) {
    if ((Test-Path -LiteralPath $Destination) -and (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -eq $Sha256) { return }
    Write-Host ('下载：' + $Url)
    try { Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destination -TimeoutSec 180 }
    catch {
        # Some system proxies reject the model host. A direct TLS connection is
        # attempted once without changing Windows or Steam proxy settings.
        Write-Host '默认连接失败，尝试直接连接官方下载地址。'
        Add-Type -AssemblyName System.Net.Http
        $handler = [Net.Http.HttpClientHandler]::new(); $handler.UseProxy = $false
        $client = [Net.Http.HttpClient]::new($handler); $client.Timeout = [TimeSpan]::FromMinutes(15)
        try {
            $stream = $client.GetStreamAsync($Url).GetAwaiter().GetResult()
            $output = [IO.File]::Create($Destination)
            try { $stream.CopyTo($output) } finally { $output.Dispose(); $stream.Dispose() }
        } finally { $client.Dispose(); $handler.Dispose() }
    }
    if ((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -ne $Sha256) { throw '下载校验失败，已停止安装。' }
}

try {
    if (-not [Environment]::Is64BitOperatingSystem) { throw '离线翻译需要 64 位 Windows。' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Write-Host '将安装私有运行环境及约 67 MB 的英中翻译模型。首次需要联网，运行环境还需额外下载。'
    Write-Host ('安装位置：' + $offlineRoot)
    New-Item -ItemType Directory -Path $offlineRoot -Force | Out-Null
    $uvZip = Join-Path $offlineRoot 'uv.zip'
    Get-VerifiedDownload 'https://github.com/astral-sh/uv/releases/download/0.13.5/uv-x86_64-pc-windows-msvc.zip' $uvZip 'A38B8D1902B7CFBC76B423BA1BB456F623F42064CDC72628B6075B89AFD1019A'
    $uvRoot = Join-Path $offlineRoot 'uv'
    Expand-Archive -LiteralPath $uvZip -DestinationPath $uvRoot -Force
    $uvExe = (Get-ChildItem -LiteralPath $uvRoot -Filter uv.exe -Recurse | Select-Object -First 1).FullName
    if (-not $uvExe) { throw '未找到 uv.exe。' }
    $env:UV_PYTHON_INSTALL_DIR = Join-Path $offlineRoot 'python'
    $env:UV_CACHE_DIR = Join-Path $offlineRoot 'download-cache'
    $venvRoot = Join-Path $offlineRoot 'venv'
    if (-not (Test-Path -LiteralPath (Join-Path $venvRoot 'Scripts\python.exe'))) {
        & $uvExe venv --python 3.11 --managed-python $venvRoot
        if ($LASTEXITCODE -ne 0) {
            # On some Windows installations the download succeeds before uv's
            # minor-version junction becomes usable. Retry using the real exe.
            $managedPython = Get-ChildItem -LiteralPath $env:UV_PYTHON_INSTALL_DIR -Filter python.exe -Recurse | Where-Object { $_.Directory.Name -match '^cpython-3\.11\.' } | Select-Object -First 1
            if ($managedPython) { & $uvExe venv --python $managedPython.FullName $venvRoot }
        }
        if ($LASTEXITCODE -ne 0) { throw '私有 Python 运行环境安装失败，请检查下载连接。' }
    }
    $pythonExe = Join-Path $venvRoot 'Scripts\python.exe'
    & $uvExe pip install --python $pythonExe --only-binary :all: 'ctranslate2==4.8.3' 'sentencepiece==0.2.2'
    if ($LASTEXITCODE -ne 0) { throw '离线引擎依赖安装失败。' }
    $modelFile = Join-Path $offlineRoot 'translate-en_zh-1_9.argosmodel'
    $modelHash = '433E7C4F034D87FBE2353161E05F18646D7999452F801A4E1F0378522B9850AB'
    if ($ModelPath) {
        if ((Get-FileHash -LiteralPath $ModelPath -Algorithm SHA256).Hash -ne $modelHash) { throw '模型不是受支持的官方英中 1.9 版本，SHA256 不匹配。' }
        if ([IO.Path]::GetFullPath($ModelPath) -ne [IO.Path]::GetFullPath($modelFile)) { Copy-Item -LiteralPath $ModelPath -Destination $modelFile -Force }
    } else {
        try { Get-VerifiedDownload 'https://github.com/sea137/steam-workshop-translator/releases/download/v0.3.1/translate-en_zh-1_9.argosmodel' $modelFile $modelHash }
        catch { Get-VerifiedDownload 'https://argos-net.com/v1/translate-en_zh-1_9.argosmodel' $modelFile $modelHash }
    }
    # Expand-Archive requires a .zip extension in Windows PowerShell 5.1.
    $zipFile = Join-Path $offlineRoot 'model.zip'
    Copy-Item -LiteralPath $modelFile -Destination $zipFile -Force
    Expand-Archive -LiteralPath $zipFile -DestinationPath (Join-Path $offlineRoot 'models') -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'server.py') -Destination (Join-Path $offlineRoot 'server.py') -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Start-Offline.ps1') -Destination (Join-Path $offlineRoot 'Start-Offline.ps1') -Force
    Write-Host '离线翻译安装完成。' -ForegroundColor Green
    & (Join-Path $PSScriptRoot 'Start-Offline.ps1')
    if ($LASTEXITCODE -ne 0) { throw '安装完成，但服务尚未启动。请运行「启动离线翻译.cmd」。' }
} catch { Write-Error $_; exit 1 }
