[CmdletBinding()]
param([string]$OutputDirectory)
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
$files = @('workshop-translator.star','Install.cmd','Install.ps1','Uninstall.cmd','Uninstall.ps1','README.md','LICENSE','CHANGELOG.md')
foreach ($name in $files) { Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $staging }
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs') -Destination $staging -Recurse
$archive = Join-Path $OutputDirectory ('HaijingTools-v' + $version + '-Windows.zip')
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $archive -Force
$binary = Join-Path $OutputDirectory 'workshop-translator.star'
Copy-Item -LiteralPath $compiled -Destination $binary -Force
$checksums = Join-Path $OutputDirectory 'SHA256SUMS.txt'
$lines = @($archive,$binary) | ForEach-Object { ((Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + [IO.Path]::GetFileName($_)) }
[IO.File]::WriteAllLines($checksums, $lines, [Text.UTF8Encoding]::new($false))
Write-Output $archive
Write-Output $binary
Write-Output $checksums
