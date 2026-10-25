[CmdletBinding()]
param([string]$OutputDirectory, [string]$ModelPath)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot 'out' }
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version.' }
$compiled = Join-Path $projectRoot 'workshop-translator.star'
if (-not (Test-Path -LiteralPath $compiled)) { throw 'Run bun run build first.' }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$staging = Join-Path $OutputDirectory ('staging-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging | Out-Null
$files = @('workshop-translator.star','Install.cmd','Install.ps1','Uninstall.cmd','Uninstall.ps1','README.md','LICENSE','CHANGELOG.md','安装离线翻译.cmd','启动离线翻译.cmd','停止离线翻译.cmd','dictionary-example.json','dictionary-starter.json')
foreach ($name in $files) { Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $staging }
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs') -Destination $staging -Recurse
$offlineStaging = Join-Path $staging 'offline'
New-Item -ItemType Directory -Path $offlineStaging | Out-Null
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'offline') -File | Where-Object { $_.Extension -in @('.py','.ps1') } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $offlineStaging }
$archive = Join-Path $OutputDirectory ('HaijingTools-v' + $version + '-Windows.zip')
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $archive -Force
$releaseFiles = @($archive)
if ($ModelPath) {
    if ((Get-FileHash -LiteralPath $ModelPath -Algorithm SHA256).Hash -ne '433E7C4F034D87FBE2353161E05F18646D7999452F801A4E1F0378522B9850AB') { throw 'Model SHA256 mismatch.' }
    $models = Join-Path $staging 'models'
    New-Item -ItemType Directory -Path $models | Out-Null
    $modelAsset = Join-Path $OutputDirectory 'translate-en_zh-1_9.argosmodel'
    Copy-Item -LiteralPath $ModelPath -Destination (Join-Path $models 'translate-en_zh-1_9.argosmodel')
    if ([IO.Path]::GetFullPath($ModelPath) -ne [IO.Path]::GetFullPath($modelAsset)) { Copy-Item -LiteralPath $ModelPath -Destination $modelAsset -Force }
    $complete = Join-Path $OutputDirectory ('HaijingTools-v' + $version + '-Windows-WithModel.zip')
    Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $complete -Force
    $releaseFiles += @($complete, $modelAsset)
}
$dictionaryAsset = Join-Path $OutputDirectory 'dictionary-starter.json'
Copy-Item -LiteralPath (Join-Path $projectRoot 'dictionary-starter.json') -Destination $dictionaryAsset -Force
$binary = Join-Path $OutputDirectory 'workshop-translator.star'
Copy-Item -LiteralPath $compiled -Destination $binary -Force
$checksums = Join-Path $OutputDirectory 'SHA256SUMS.txt'
$releaseFiles += @($binary, $dictionaryAsset)
$lines = $releaseFiles | ForEach-Object { ((Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + [IO.Path]::GetFileName($_)) }
[IO.File]::WriteAllLines($checksums, $lines, [Text.UTF8Encoding]::new($false))
Write-Output $archive
Write-Output $binary
Write-Output $checksums
if ($ModelPath) { Write-Output $complete; Write-Output $modelAsset }
