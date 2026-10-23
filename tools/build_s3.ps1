param([string]$CoreDir=$env:PLATFORMIO_CORE_DIR,[switch]$WithoutEditor,[switch]$WithoutProjectApi,[switch]$WithoutProject,[string]$PreserveProject,[string]$ProjectJson,[switch]$WithoutScanner)
$ErrorActionPreference='Stop'
if(!$CoreDir){$CoreDir=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../NaWServer/local/pio-core'))}
$projectRoot=Split-Path $PSScriptRoot -Parent
& node (Join-Path $projectRoot 'tools/native_widget_catalog.mjs')
if($LASTEXITCODE){throw 'Native widget catalog generation failed'}
$projectArgs=@(Join-Path $projectRoot 'tools/project_image.mjs')
if($PreserveProject){$projectArgs+=@('--preserve',$PreserveProject)}
if($ProjectJson){$projectArgs+=@('--project-json',$ProjectJson)}
if(!$WithoutScanner){$projectArgs+='--with-scanner'}
& node @projectArgs
if($LASTEXITCODE){throw 'Project base generation failed'}
if(@($WithoutEditor,$WithoutProjectApi,$WithoutProject,$WithoutScanner).Where({$_}).Count -gt 1){throw 'Choose one exclusion profile per build'}
$buildEnvironment=if($WithoutEditor){'s3-no-editor'}elseif($WithoutProject){'s3-no-project'}elseif($WithoutProjectApi){'s3-no-project-api'}elseif($WithoutScanner){'s3-no-scanner'}else{'s3'}
if($WithoutEditor){
 & node (Join-Path $projectRoot 'tools/pack_assets.mjs') --startup-only
 if($LASTEXITCODE){throw 'Startup packet generation failed'}
}
if($buildEnvironment -ne 's3'){
 $noEditorConfig=Join-Path $projectRoot "examples/s3_style_lab/sdkconfig.$buildEnvironment"
 $fullConfig=Join-Path $projectRoot 'examples/s3_style_lab/sdkconfig.s3'
 if(!(Test-Path -LiteralPath $noEditorConfig) -and (Test-Path -LiteralPath $fullConfig)){Copy-Item -LiteralPath $fullConfig -Destination $noEditorConfig}
}
$managerDir=Join-Path $projectRoot 'local/idf-manager-libs'
$idfPython=Join-Path $CoreDir 'penv/.espidf-5.4.0/Scripts/python.exe'
if(!(Test-Path (Join-Path $managerDir 'idf_component_manager-2.5.2.dist-info'))){
 & $idfPython -m pip install --target $managerDir 'idf-component-manager==2.5.2'
 if($LASTEXITCODE){throw 'Project-local component manager installation failed'}
}
$env:PLATFORMIO_CORE_DIR=$CoreDir
$pioExe=Join-Path $env:USERPROFILE '.platformio/penv/Scripts/pio.exe'
# PlatformIO 6.10 watches the two example CMakeLists, not extra components or
# included module.cmake files. Refresh its code model when either input changes.
$cmakeCache=Join-Path $projectRoot "examples/s3_style_lab/.pio/build/$buildEnvironment/CMakeCache.txt"
$componentCmake=@(
 (Join-Path $projectRoot 'CMakeLists.txt')
 (Join-Path $projectRoot 'examples/s3_style_lab/main/ble_scanner/module.cmake')
)
if((Test-Path -LiteralPath $cmakeCache) -and @($componentCmake|Where-Object{(Get-Item -LiteralPath $_).LastWriteTimeUtc -gt (Get-Item -LiteralPath $cmakeCache).LastWriteTimeUtc}).Count){
 Remove-Item -LiteralPath $cmakeCache -Force
}
& $pioExe run -d (Join-Path $projectRoot 'examples/s3_style_lab') -e $buildEnvironment -j 8
exit $LASTEXITCODE
