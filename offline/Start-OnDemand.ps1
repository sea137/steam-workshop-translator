$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'HaijingTools\offline'
foreach ($relative in @('start_service.py','server.py','venv\Scripts\python.exe','models\translate-en_zh-1_9\model\model.bin','models\translate-en_zh-1_9\sentencepiece.model')) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $relative))) { Write-Output 'HAIJING_MISSING'; exit 0 }
}
& (Join-Path $root 'venv\Scripts\python.exe') (Join-Path $root 'start_service.py')
exit $LASTEXITCODE
