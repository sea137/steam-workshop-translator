$ErrorActionPreference = 'Stop'
$script = Join-Path (Split-Path -Parent $PSScriptRoot) 'Disable-Plugin.ps1'
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$sandbox = Join-Path $tempBase ('haijing-recovery-' + [guid]::NewGuid().ToString('N'))
$plugins = Join-Path $sandbox 'millennium\plugins'
New-Item -ItemType Directory -Path $plugins -Force | Out-Null
[IO.File]::WriteAllBytes((Join-Path $sandbox 'steam.exe'), [byte[]]@())
$plugin = Join-Path $plugins 'local.workshop.translator.star'
$other = Join-Path $plugins 'another-plugin.star'
[IO.File]::WriteAllText($plugin, 'our-plugin')
[IO.File]::WriteAllText($other, 'keep-other-plugin')
function Get-Process { param($Name) return $null }
try {
    & $script -SteamPath $sandbox -WhatIf
    if (-not (Test-Path -LiteralPath $plugin)) { throw 'WhatIf mutated the plugin' }
    & $script -SteamPath $sandbox
    if ((Test-Path -LiteralPath $plugin) -or -not (Test-Path -LiteralPath ($plugin + '.haijing-disabled'))) { throw 'Plugin was not disabled' }
    if ([IO.File]::ReadAllText($other) -ne 'keep-other-plugin') { throw 'Other plugin changed' }
    & $script -SteamPath $sandbox -Restore
    if ([IO.File]::ReadAllText($plugin) -ne 'our-plugin') { throw 'Restore lost bytes' }
    [IO.File]::WriteAllText(($plugin + '.haijing-disabled'), 'existing-backup')
    $blocked = $false
    try { & $script -SteamPath $sandbox } catch { $blocked = $true }
    if (-not $blocked -or [IO.File]::ReadAllText(($plugin + '.haijing-disabled')) -ne 'existing-backup') { throw 'Existing backup was overwritten' }
    Write-Host 'PASS: reversible plugin-only recovery, exact restore, WhatIf, other plugins and existing backup preserved'
} finally {
    $resolved = [IO.Path]::GetFullPath($sandbox)
    if (-not $resolved.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'haijing-recovery-*') { throw 'Unsafe test cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
