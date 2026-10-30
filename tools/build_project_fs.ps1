# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Oleg Kozhevnikov
param([string]$CoreDir=$env:PLATFORMIO_CORE_DIR)
$ErrorActionPreference='Stop'
if(!$CoreDir){$CoreDir=Join-Path $env:USERPROFILE '.platformio'}
$root=Split-Path $PSScriptRoot -Parent
$python=Join-Path $CoreDir 'penv/.espidf-5.5.6/Scripts/python.exe'
$packagesDir=if($env:PLATFORMIO_PACKAGES_DIR){$env:PLATFORMIO_PACKAGES_DIR}else{Join-Path $CoreDir 'packages'}
$generator=Join-Path $packagesDir 'framework-espidf-v5.5.6/components/spiffs/spiffsgen.py'
# project_image.mjs produces the reviewed catalog/files before this command.
# Match sdkconfig.s3: page=256, block=4096, filename=32, metadata=4, both magics.
& $python $generator 0x400000 (Join-Path $root 'local/project-image/files') (Join-Path $root 'local/project-image/spiffs.bin')
if($LASTEXITCODE){throw 'SPIFFS image generation failed'}
Get-Item -LiteralPath (Join-Path $root 'local/project-image/spiffs.bin') | Select-Object FullName,Length
