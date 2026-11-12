# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Oleg Kozhevnikov
param([string]$CoreDir=$env:PLATFORMIO_CORE_DIR,[string]$LvglComponentSource='', [string]$CborComponentSource='', [switch]$WebSocket)
$ErrorActionPreference='Stop'
if(!$CoreDir){$CoreDir=Join-Path $env:USERPROFILE '.platformio'}
$defaults=Join-Path $PSScriptRoot '../s3_style_lab/managed_components'
if(!$LvglComponentSource){$LvglComponentSource=Join-Path $defaults 'lvgl__lvgl'}
if(!$CborComponentSource){$CborComponentSource=Join-Path $defaults 'espressif__cbor'}
$links=Join-Path $PSScriptRoot 'managed_components'
New-Item -ItemType Directory -Force -Path $links | Out-Null
foreach($dependency in @(@('lvgl__lvgl',$LvglComponentSource),@('espressif__cbor',$CborComponentSource))) {
 $source=(Resolve-Path -LiteralPath $dependency[1]).Path
 if(!(Test-Path -LiteralPath (Join-Path $source 'CMakeLists.txt'))){throw 'Source component has no CMakeLists.txt'}
 if($dependency[0] -eq 'lvgl__lvgl') {
  $version=[IO.File]::ReadAllText((Join-Path $source 'include/lvgl/lv_version.h'))
  foreach($expected in @(@('MAJOR',9),@('MINOR',6),@('PATCH',0))) {
   if($version -notmatch ('(?m)^#define LVGL_VERSION_'+$expected[0]+'\s+'+$expected[1]+'\s*$')){throw 'This target requires LVGL 9.6.0'}
  }
 }
 $link=Join-Path $links $dependency[0]
 if(!(Test-Path -LiteralPath $link)){New-Item -ItemType Junction -Path $link -Target $source | Out-Null}
 elseif((Get-Item -LiteralPath $link).Target -ne $source){throw "Existing dependency link differs: $link"}
}
& node (Join-Path $PSScriptRoot 'build.mjs')
if($LASTEXITCODE){throw 'LilyGO project compilation failed'}
$previousManager=$env:IDF_COMPONENT_MANAGER
try {
 # Dependencies are the explicitly supplied, already pinned source components.
 $env:IDF_COMPONENT_MANAGER='0'
 $pio=Join-Path $CoreDir 'penv/Scripts/pio.exe'
 $target = if($WebSocket){'lilygo-ws'}else{'lilygo'}
 & $pio run -d $PSScriptRoot -e $target -j 8
 if($LASTEXITCODE){throw 'LilyGO firmware build failed'}
} finally {$env:IDF_COMPONENT_MANAGER=$previousManager}
