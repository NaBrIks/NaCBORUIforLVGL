param([Parameter(Mandatory)][string]$Serial,[string]$Adb = 'adb',[string]$Apk)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if (!$Apk) { $Apk = Join-Path $root 'local\designer\release\NaCBORUIforLVGL-Designer-android-arm64.apk' }
if (!(Test-Path -LiteralPath $Apk -PathType Leaf)) { throw 'Build the AndroidPhone target first and supply -Apk if not using the prepared release path.' }
$abi = (& $Adb -s $Serial shell getprop ro.product.cpu.abi) -join ''
if ($LASTEXITCODE -or $abi.Trim() -ne 'arm64-v8a') { throw 'This APK requires an explicitly selected arm64 Android device.' }
& $Adb -s $Serial install -r $Apk
if ($LASTEXITCODE) { throw 'APK install failed' }
& $Adb -s $Serial shell monkey -p org.nacborui.designer -c android.intent.category.LAUNCHER 1
if ($LASTEXITCODE) { throw 'App launch failed' }
