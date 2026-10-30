# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Oleg Kozhevnikov
param([string]$Configuration='Release',[string]$LvglSource='', [string]$TinyCborSource='', [string]$BuildDirectory='local/windows-player')
$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$build=if([IO.Path]::IsPathRooted($BuildDirectory)){$BuildDirectory}else{Join-Path $root $BuildDirectory}
$options=@('-S',$PSScriptRoot,'-B',$build)
if($LvglSource){$options+="-DLVGL_SOURCE_DIR=$LvglSource"}
if($TinyCborSource){$options+="-DTINYCBOR_SOURCE_DIR=$TinyCborSource"}
& cmake @options
if($LASTEXITCODE){throw 'Windows player configuration failed'}
& cmake --build $build --config $Configuration --parallel 8
if($LASTEXITCODE){throw 'Windows player build failed'}
Write-Output (Join-Path $build "$Configuration/nacborui_player.exe")
