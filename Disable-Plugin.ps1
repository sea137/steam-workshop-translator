[CmdletBinding(SupportsShouldProcess)]
param([string]$SteamPath, [switch]$Restore)
$ErrorActionPreference = 'Stop'
if (-not $SteamPath) { $SteamPath = (Get-ItemProperty 'HKCU:\Software\Valve\Steam').SteamPath }
$SteamPath = [IO.Path]::GetFullPath($SteamPath)
if (-not (Test-Path -LiteralPath (Join-Path $SteamPath 'steam.exe'))) { throw '所选目录没有 steam.exe。' }
if (-not $WhatIfPreference -and (Get-Process steam -ErrorAction SilentlyContinue)) {
    throw '请先完全退出 Steam。若窗口打不开，请在任务管理器结束 Steam 后再运行；脚本不会强制结束进程。'
}
$pluginDir = [IO.Path]::GetFullPath((Join-Path $SteamPath 'millennium\plugins'))
$enabledPath = Join-Path $pluginDir 'local.workshop.translator.star'
$disabledPath = $enabledPath + '.haijing-disabled'
$sourcePath = if ($Restore) { $disabledPath } else { $enabledPath }
$targetPath = if ($Restore) { $enabledPath } else { $disabledPath }
if (-not (Test-Path -LiteralPath $sourcePath)) { Write-Host '目标插件已经处于所选状态，或尚未安装。'; return }
if (Test-Path -LiteralPath $targetPath) { throw '目标备份已存在，已停止以避免覆盖。' }
if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($sourcePath)) -ne $pluginDir -or
    [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($targetPath)) -ne $pluginDir) { throw '插件路径校验失败。' }
if ($PSCmdlet.ShouldProcess($sourcePath, '切换海京Tools插件启用状态（保留备份）')) {
    Move-Item -LiteralPath $sourcePath -Destination $targetPath
    if ($Restore) { Write-Host '海京Tools 已恢复，启动 Steam 后生效。' }
    else { Write-Host '海京Tools 已停用。请启动 Steam 测试；Millennium、游戏、缓存和其他插件均保留。' }
}
