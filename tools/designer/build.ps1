param(
    [ValidateSet('Windows','AndroidEmulator','AndroidPhone')][string]$Target = 'Windows',
    [string]$AndroidSdkDirectory = $env:ANDROID_HOME,
    [string]$JavaSdkDirectory = $env:JAVA_HOME,
    [string]$SplaRoot
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$artifacts = Join-Path $root 'local\designer\artifacts'
$arguments = @('build', 'App\App.csproj', '-c', 'Debug', '--artifacts-path', $artifacts)
if ($SplaRoot) { $arguments += "-p:SplaRoot=$SplaRoot" }
if ($Target -eq 'Windows') {
    $arguments += @('-f', 'net10.0-windows10.0.19041.0')
} else {
    if (!$AndroidSdkDirectory -or !(Test-Path -LiteralPath $AndroidSdkDirectory -PathType Container)) { throw 'Supply -AndroidSdkDirectory with Android platform 36/build tools.' }
    if (!$JavaSdkDirectory -or !(Test-Path -LiteralPath $JavaSdkDirectory -PathType Container)) { throw 'Supply -JavaSdkDirectory with JDK 21.' }
    $rid = if ($Target -eq 'AndroidPhone') { 'android-arm64' } else { 'android-x64' }
    $arguments += @('-f','net10.0-android', "-p:RuntimeIdentifier=$rid", '-p:AndroidPackageFormats=apk', '-p:EmbedAssembliesIntoApk=true', "-p:AndroidSdkDirectory=$AndroidSdkDirectory", "-p:JavaSdkDirectory=$JavaSdkDirectory")
}
Push-Location $PSScriptRoot
try {
    & dotnet @arguments
    if ($LASTEXITCODE) { throw "Build failed ($LASTEXITCODE)" }
} finally { Pop-Location }
