# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Oleg Kozhevnikov
param(
    [string[]] $Profiles = @('board','direct-repeat','cbor-repeat','direct-mixed','cbor-mixed','pages','data','schemes','history','filesystem','wifi','http','editor','full'),
    [int] $Jobs = 12,
    [ValidateSet('direct-repeat','direct-mixed','phases-og','phases-os')]
    [string] $CacheEnvironment = 'direct-repeat',
    [string] $OutputRoot = (Join-Path $PSScriptRoot 'out')
)
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$pio = Get-Command pio -ErrorAction SilentlyContinue
if(!$pio){ $pio = Join-Path $env:USERPROFILE '.platformio/penv/Scripts/pio.exe' }
$order = @('board','direct-repeat','cbor-repeat','direct-mixed','cbor-mixed','pages','data','schemes','history','filesystem','wifi','http','editor','full')
if($Profiles | Where-Object {$_ -notin $order}){ throw 'Unknown benchmark profile' }
if('editor' -in $Profiles -or 'full' -in $Profiles){
    if(!(Test-Path -LiteralPath (Join-Path $root 'frontend/dist/index.html'))){
        Push-Location $root
        try {
            & npm run build
            if($LASTEXITCODE){ throw 'Web editor build failed' }
        } finally { Pop-Location }
    }
    & node (Join-Path $root 'tools/pack_assets.mjs')
    if($LASTEXITCODE){ throw 'Web editor packaging failed' }
}
if($Profiles | Where-Object {[array]::IndexOf($order,$_) -ge 7}){
    & node (Join-Path $root 'tools/appearance_image.mjs')
    if($LASTEXITCODE){ throw 'Appearance packaging failed' }
}

$buildRoot = if($env:PLATFORMIO_BUILD_DIR){$env:PLATFORMIO_BUILD_DIR}else{Join-Path $PSScriptRoot '.pio/build'}
$originalProfile = $env:NACBOR_BENCH_PROFILE_OVERRIDE
try {
    foreach($profile in $Profiles){
        $env:NACBOR_BENCH_PROFILE_OVERRIDE = [string][array]::IndexOf($order,$profile)
        $out = Join-Path $OutputRoot $profile
        New-Item -ItemType Directory -Force -Path $out | Out-Null
        $log = Join-Path $out 'build.log'
        Write-Host "Building $profile"
        & $pio run -d $PSScriptRoot -e $CacheEnvironment -j $Jobs *> $log
        if($LASTEXITCODE){
            Get-Content -LiteralPath $log -Tail 45
            throw "Build failed for $profile"
        }
        $build = Join-Path $buildRoot $CacheEnvironment
        foreach($file in @('firmware.bin','firmware.elf','nacbor_memory_bench.map')){
            Copy-Item -LiteralPath (Join-Path $build $file) -Destination $out
        }
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot "sdkconfig.$CacheEnvironment") -Destination (Join-Path $out 'sdkconfig')
        Select-String -LiteralPath $log -Pattern '^RAM:','^Flash:' | ForEach-Object Line
    }
} finally {
    $env:NACBOR_BENCH_PROFILE_OVERRIDE = $originalProfile
}
