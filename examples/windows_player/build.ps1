param([string]$Configuration='Release',[string]$LvglSource='', [string]$TinyCborSource='')
$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$build=Join-Path $root 'local/windows-player'
$options=@('-S',$PSScriptRoot,'-B',$build)
if($LvglSource){$options+="-DLVGL_SOURCE_DIR=$LvglSource"}
if($TinyCborSource){$options+="-DTINYCBOR_SOURCE_DIR=$TinyCborSource"}
& cmake @options
if($LASTEXITCODE){throw 'Windows player configuration failed'}
& cmake --build $build --config $Configuration --parallel 8
if($LASTEXITCODE){throw 'Windows player build failed'}
Write-Output (Join-Path $build "$Configuration/nacborui_player.exe")
