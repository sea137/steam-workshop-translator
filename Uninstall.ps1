[CmdletBinding(SupportsShouldProcess)]
param([string]$SteamPath, [switch]$RemoveCache)
$ErrorActionPreference = 'Stop'
if (-not $SteamPath) { $SteamPath = (Get-ItemProperty 'HKCU:\Software\Valve\Steam').SteamPath }
$SteamPath = [IO.Path]::GetFullPath($SteamPath)
if (-not (Test-Path -LiteralPath (Join-Path $SteamPath 'steam.exe'))) { throw '所选目录没有 steam.exe。' }
if (-not $WhatIfPreference -and (Get-Process steam -ErrorAction SilentlyContinue)) { throw '请先退出 Steam，再运行卸载脚本。' }
$paths = @((Join-Path $SteamPath 'millennium\plugins\local.workshop.translator.star'))
if ($RemoveCache) { $paths += Join-Path $SteamPath 'millennium\config\workshop-translator-cache.json' }
foreach ($path in $paths) {
    if ((Test-Path -LiteralPath $path) -and $PSCmdlet.ShouldProcess($path, '删除本插件文件')) {
        Remove-Item -LiteralPath $path
    }
}
Write-Host '插件卸载操作完成。Millennium 框架和其他插件保留。'
