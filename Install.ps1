[CmdletBinding(SupportsShouldProcess)]
param([string]$SteamPath, [switch]$InstallFramework)
$ErrorActionPreference = 'Stop'
try {
    if (-not $SteamPath) { $SteamPath = (Get-ItemProperty 'HKCU:\Software\Valve\Steam').SteamPath }
    $SteamPath = [IO.Path]::GetFullPath($SteamPath)
    if (-not (Test-Path -LiteralPath (Join-Path $SteamPath 'steam.exe'))) { throw '所选目录没有 steam.exe。' }
    $pluginSource = Join-Path $PSScriptRoot 'workshop-translator.star'
    if (-not (Test-Path -LiteralPath $pluginSource)) { throw '缺少 workshop-translator.star，请完整解压安装包。' }
    $frameworkFile = Join-Path $SteamPath 'millennium\lib\millennium.dll'
    $pluginDir = Join-Path $SteamPath 'millennium\plugins'
    $pluginTarget = Join-Path $pluginDir 'local.workshop.translator.star'
    if (-not $WhatIfPreference -and (Get-Process steam -ErrorAction SilentlyContinue)) {
        throw '请先从 Steam 菜单选择「退出」，然后重新运行安装程序。安装程序不会强制结束 Steam。'
    }
    if (-not (Test-Path -LiteralPath $frameworkFile)) {
        if (-not $InstallFramework) { throw '需要先安装 Millennium 3.6.2 或更新版。也可运行 Install.cmd 安装本插件及框架。' }
        if (Test-Path -LiteralPath (Join-Path $SteamPath 'wsock32.dll')) {
            throw '发现已有 wsock32.dll，但未找到 Millennium。为避免覆盖其他插件，请先检查该文件来源。'
        }
        if ($PSCmdlet.ShouldProcess($SteamPath, '下载并安装官方 Millennium 3.6.2 框架')) {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $staging = Join-Path ([IO.Path]::GetTempPath()) ('WorkshopTranslator-' + [guid]::NewGuid().ToString('N'))
            New-Item -ItemType Directory -Path $staging | Out-Null
            $archive = Join-Path $staging 'millennium.zip'
            Invoke-WebRequest -UseBasicParsing 'https://github.com/SteamClientHomebrew/Millennium/releases/download/v3.6.2/millennium-v3.6.2-windows-x86_64.zip' -OutFile $archive
            $expected = 'CD78CF680563491D24F58A4FC948DCFC7CB3B38523AC80162845E52B06151CC2'
            if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected) { throw 'Millennium 下载文件校验失败，已停止。' }
            $expanded = Join-Path $staging 'expanded'
            Expand-Archive -LiteralPath $archive -DestinationPath $expanded
            foreach ($item in Get-ChildItem -LiteralPath $expanded) {
                Copy-Item -LiteralPath $item.FullName -Destination $SteamPath -Recurse -Force
            }
            Write-Host 'Millennium 3.6.2 已安装。' -ForegroundColor Green
        }
    }
    if ($PSCmdlet.ShouldProcess($pluginTarget, '安装海京Tools 0.3.7')) {
        New-Item -ItemType Directory -Path $pluginDir -Force | Out-Null
        if (Test-Path -LiteralPath $pluginTarget) {
            Copy-Item -LiteralPath $pluginTarget -Destination ($pluginTarget + '.' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.bak')
        }
        Copy-Item -LiteralPath $pluginSource -Destination $pluginTarget -Force
        if ((Get-FileHash -LiteralPath $pluginSource).Hash -ne (Get-FileHash -LiteralPath $pluginTarget).Hash) { throw '插件复制后校验失败。' }
        $offlineRoot = Join-Path $env:LOCALAPPDATA 'HaijingTools\offline'
        if (Test-Path -LiteralPath (Join-Path $offlineRoot 'models\translate-en_zh-1_9\model\model.bin')) {
            foreach ($name in @('Start-Offline.ps1','Start-OnDemand.ps1','Stop-Offline.ps1','server.py','start_service.py')) {
                Copy-Item -LiteralPath (Join-Path (Join-Path $PSScriptRoot 'offline') $name) -Destination (Join-Path $offlineRoot $name) -Force
            }
        }
        Write-Host ('插件已安装到：' + $pluginTarget) -ForegroundColor Green
        Write-Host '下一步：启动 Steam → 左上角 Steam → Millennium → Plugins → 启用「海京Tools」。'
        Write-Host '打开创意工坊，在右下角点击「翻译本页」。'
    }
} catch {
    Write-Error $_
    exit 1
}
