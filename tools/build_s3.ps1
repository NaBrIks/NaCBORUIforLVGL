# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Oleg Kozhevnikov
param([string]$CoreDir=$env:PLATFORMIO_CORE_DIR,[switch]$WithoutEditor,[switch]$WithoutProjectApi,[switch]$WithoutProject,[string]$PreserveProject,[string]$ProjectJson)
$ErrorActionPreference='Stop'
if(!$CoreDir){$CoreDir=Join-Path $env:USERPROFILE '.platformio'}
$projectRoot=Split-Path $PSScriptRoot -Parent
& node (Join-Path $projectRoot 'tools/native_widget_catalog.mjs')
if($LASTEXITCODE){throw 'Native widget catalog generation failed'}
$projectArgs=@(Join-Path $projectRoot 'tools/project_image.mjs')
if($PreserveProject){$projectArgs+=@('--preserve',$PreserveProject)}
if($ProjectJson){$projectArgs+=@('--project-json',$ProjectJson)}
& node @projectArgs
if($LASTEXITCODE){throw 'Project base generation failed'}
if(@($WithoutEditor,$WithoutProjectApi,$WithoutProject).Where({$_}).Count -gt 1){throw 'Choose one exclusion profile per build'}
$buildEnvironment=if($WithoutEditor){'s3-no-editor'}elseif($WithoutProject){'s3-no-project'}elseif($WithoutProjectApi){'s3-no-project-api'}else{'s3'}
if($WithoutEditor){
 & node (Join-Path $projectRoot 'tools/pack_assets.mjs') --startup-only
 if($LASTEXITCODE){throw 'Startup packet generation failed'}
}
if($buildEnvironment -ne 's3'){
 $noEditorConfig=Join-Path $projectRoot "examples/s3_style_lab/sdkconfig.$buildEnvironment"
 $fullConfig=Join-Path $projectRoot 'examples/s3_style_lab/sdkconfig.s3'
 if(!(Test-Path -LiteralPath $noEditorConfig) -and (Test-Path -LiteralPath $fullConfig)){Copy-Item -LiteralPath $fullConfig -Destination $noEditorConfig}
}
# Generated profiles retain earlier defaults. Match the application's three-server
# SNTP initializer without replacing other local board/runtime settings.
$sdkConfig=Join-Path $projectRoot "examples/s3_style_lab/sdkconfig.$buildEnvironment"
if(Test-Path -LiteralPath $sdkConfig){
 $originalConfig=[IO.File]::ReadAllText($sdkConfig)
 $configText=$originalConfig
 # NaWServer now has one TCP engine; legacy backend switches are invalid.
 $configText=[regex]::Replace($configText,'(?m)^(?:# )?CONFIG_NAWSERVER_BACKEND_(?:TCP|HTTPD)(?:=.*| is not set)\r?\n?','')
 if($configText -notmatch '(?m)^CONFIG_NAWSERVER_WEBSOCKET=y\r?$'){
  $configText=[regex]::Replace($configText,'(?m)^(?:# )?CONFIG_NAWSERVER_WEBSOCKET(?:=.*| is not set)\r?\n?','').TrimEnd()
  $configText+="`nCONFIG_NAWSERVER_WEBSOCKET=y`n"
 }
 # Rich UI catalog/project handlers need a larger worker stack than minimal routes.
 $configText=[regex]::Replace($configText,'(?m)^CONFIG_NAWSERVER_TCP_HTTP_STACK_SIZE=\d+\r?$','CONFIG_NAWSERVER_TCP_HTTP_STACK_SIZE=12288')
 if($configText -notmatch '(?m)^CONFIG_NAWSERVER_TCP_HTTP_STACK_SIZE=12288\r?$'){$configText+="`nCONFIG_NAWSERVER_TCP_HTTP_STACK_SIZE=12288`n"}
 $serverSetting='CONFIG_LWIP_SNTP_MAX_SERVERS=3'
 $updatedConfig=[regex]::Replace($configText,'(?m)^CONFIG_LWIP_SNTP_MAX_SERVERS=\d+\r?$',$serverSetting)
 if($updatedConfig -notmatch '(?m)^CONFIG_LWIP_SNTP_MAX_SERVERS=3\r?$'){$updatedConfig+="`n$serverSetting`n"}
 if($updatedConfig -cne $originalConfig){[IO.File]::WriteAllText($sdkConfig,$updatedConfig,[Text.UTF8Encoding]::new($false))}
}
$env:PLATFORMIO_CORE_DIR=$CoreDir
$pioExe=Join-Path $CoreDir 'penv/Scripts/pio.exe'
if(!(Test-Path -LiteralPath $pioExe)){$pioExe=Join-Path $env:USERPROFILE '.platformio/penv/Scripts/pio.exe'}
# PlatformIO watches the two example CMakeLists, not extra components or
# nested component CMakeLists. Refresh its code model when either input changes.
$cmakeCache=Join-Path $projectRoot "examples/s3_style_lab/.pio/build/$buildEnvironment/CMakeCache.txt"
$componentCmake=@(
 (Join-Path $projectRoot 'CMakeLists.txt')
 (Join-Path $projectRoot 'examples/s3_style_lab/main/CMakeLists.txt')
 (Join-Path $projectRoot '../NaWServer/CMakeLists.txt')
)
if((Test-Path -LiteralPath $cmakeCache) -and @($componentCmake|Where-Object{(Get-Item -LiteralPath $_).LastWriteTimeUtc -gt (Get-Item -LiteralPath $cmakeCache).LastWriteTimeUtc}).Count){
 Remove-Item -LiteralPath $cmakeCache -Force
}
& $pioExe run -d (Join-Path $projectRoot 'examples/s3_style_lab') -e $buildEnvironment -j 8
exit $LASTEXITCODE
