param([string]$CoreDir=$env:PLATFORMIO_CORE_DIR)
$ErrorActionPreference='Stop'
if(!$CoreDir){$CoreDir=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../NaWServer/local/pio-core'))}
$root=Split-Path $PSScriptRoot -Parent
$python=Join-Path $CoreDir 'penv/.espidf-5.4.0/Scripts/python.exe'
$generator=Join-Path $CoreDir 'packages/framework-espidf/components/spiffs/spiffsgen.py'
# project_image.mjs produces the reviewed catalog/files before this command.
# Match sdkconfig.s3: page=256, block=4096, filename=32, metadata=4, both magics.
& $python $generator 0x400000 (Join-Path $root 'local/project-image/files') (Join-Path $root 'local/project-image/spiffs.bin')
if($LASTEXITCODE){throw 'SPIFFS image generation failed'}
Get-Item -LiteralPath (Join-Path $root 'local/project-image/spiffs.bin') | Select-Object FullName,Length
