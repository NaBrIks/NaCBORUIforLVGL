param([Parameter(Mandatory)][string]$Port,[Parameter(Mandatory)][string]$ExpectedMac,[switch]$ProvisionFilesystem,[switch]$UpdateFilesystem,[switch]$FullImage)
$ErrorActionPreference='Stop'
if($FullImage){if($UpdateFilesystem){throw 'FullImage includes filesystem provisioning'};$ProvisionFilesystem=$true}
if($ProvisionFilesystem -and $UpdateFilesystem){throw 'Choose initial provisioning or an existing-filesystem update'}
$root=Split-Path $PSScriptRoot -Parent
$python=Join-Path $root 'local/esptool-env/Scripts/python.exe'
$build=Join-Path $root 'examples/s3_style_lab/.pio/build/s3'
$app=Join-Path $build 'firmware.bin'
$table=Join-Path $build 'partitions.bin'
$fs=Join-Path $root 'local/project-image/spiffs.bin'
$live=Join-Path $root 'local/s3-live-partitions.bin'
$appBytes=(Get-Item -LiteralPath $app).Length
if($appBytes -le 0 -or $appBytes -gt 0x500000){throw 'Application does not fit existing factory partition'}
$identity=(& $python -m esptool --chip esp32s3 --port $Port chip-id 2>&1 | Out-String)
if($LASTEXITCODE -or $identity -notmatch [regex]::Escape($ExpectedMac)){throw "Unexpected device: $identity"}
$identity | Set-Content -LiteralPath (Join-Path $root 'local/s3-pre-flash-identity.log')
& $python -m esptool --chip esp32s3 --port $Port --baud 460800 read-flash 0x8000 0x1000 $live
if($LASTEXITCODE){throw 'Cannot read live partition table'}
$before=[IO.File]::ReadAllBytes($live);$after=[IO.File]::ReadAllBytes($table)
if($after.Length -gt 4096){throw 'Invalid partition image'}
# Preserve all three existing partition entries byte-for-byte (NVS, PHY, factory).
for($i=0;$i -lt 96;$i++){if($before[$i] -ne $after[$i]){throw 'Existing partition entry would change'}}
$identical=$true
for($i=0;$i -lt $after.Length;$i++){if($before[$i] -ne $after[$i]){$identical=$false;break}}
$writeArgs=@('0x10000',$app)
if($ProvisionFilesystem){
 $bootHeaderPath=Join-Path $root 'local/s3-boot-preflight.bin'
 & $python -m esptool --chip esp32s3 --port $Port --baud 115200 read-flash 0x0 0x1000 $bootHeaderPath
 if($LASTEXITCODE){throw 'Cannot inspect bootloader flash-size header'}
 $bootHeader=[IO.File]::ReadAllBytes($bootHeaderPath)
 if(!$FullImage -and ($bootHeader[0] -ne 0xe9 -or ($bootHeader[3] -band 0xf0) -lt 0x40)){throw 'Existing bootloader declares less than 16 MiB. Correct its inspected image header before partition migration; see project storage guide.'}
 if((Get-Item -LiteralPath $fs).Length -ne 0x400000){throw 'Filesystem image must be exactly 4 MiB'}
 # The only allowed new entry is data/spiffs at the final 4 MiB of 16 MiB flash.
 if($after[96] -ne 0xaa -or $after[97] -ne 0x50 -or $after[98] -ne 1 -or $after[99] -ne 0x82 -or [BitConverter]::ToUInt32($after,100) -ne 0xC00000 -or [BitConverter]::ToUInt32($after,104) -ne 0x400000){throw 'Unexpected filesystem partition'}
 # Migration accepts the original three-entry table or this exact four-entry table.
 if(!$identical -and !($before[96] -eq 0xeb -and $before[97] -eq 0xeb)){throw 'Unknown live partition layout'}
 $writeArgs=@('0x8000',$table,'0x10000',$app,'0xC00000',$fs)
} elseif($UpdateFilesystem){
 # Explicit replacement after an exported project was recompiled/migrated. This
 # is not the normal app-only update and must never alter the partition table.
 if(!$identical){throw 'Filesystem update requires an identical live partition table'}
 if((Get-Item -LiteralPath $fs).Length -ne 0x400000){throw 'Filesystem image must be exactly 4 MiB'}
 if($after[96] -ne 0xaa -or $after[97] -ne 0x50 -or $after[98] -ne 1 -or $after[99] -ne 0x82 -or [BitConverter]::ToUInt32($after,100) -ne 0xC00000 -or [BitConverter]::ToUInt32($after,104) -ne 0x400000){throw 'Unexpected filesystem partition'}
 $writeArgs=@('0x10000',$app,'0xC00000',$fs)
} elseif(!$identical){throw 'Partition migration requires explicit -ProvisionFilesystem; normal flash never writes filesystem/table'}
if($FullImage){
 $bootloader=Join-Path $build 'bootloader.bin'
 $header=[IO.File]::ReadAllBytes($bootloader)
 if($header.Length -lt 24 -or $header[0] -ne 0xe9 -or ($header[3] -band 0xf0) -lt 0x40){throw 'Full bootloader must declare 16 MiB flash'}
 $writeArgs=@('0x0',$bootloader)+$writeArgs
}
$log=Join-Path $root 'local/s3-flash.log'
& $python -m esptool --chip esp32s3 --port $Port --baud 460800 write-flash --no-progress @writeArgs *> $log
if($LASTEXITCODE){Get-Content -LiteralPath $log -Tail 15;throw 'Flash failed'}
$verified=([regex]::Matches([IO.File]::ReadAllText($log),'Hash of data verified')).Count
if($verified -ne $(if($FullImage){4}elseif($ProvisionFilesystem){3}elseif($UpdateFilesystem){2}else{1})){throw 'Not every written region was verified'}
$report=[ordered]@{port=$Port;mac=$ExpectedMac;bytes=$appBytes;sha256=(Get-FileHash -LiteralPath $app -Algorithm SHA256).Hash.ToLowerInvariant();offset='0x10000';app_only=!($ProvisionFilesystem -or $UpdateFilesystem);bootloader_written=[bool]$FullImage;partition_table_written=[bool]$ProvisionFilesystem;verified=$true}
if($ProvisionFilesystem -or $UpdateFilesystem){$report.filesystem=[ordered]@{offset='0xC00000';bytes=4194304;sha256=(Get-FileHash -LiteralPath $fs -Algorithm SHA256).Hash.ToLowerInvariant()};$report.partition_sha256=(Get-FileHash -LiteralPath $table -Algorithm SHA256).Hash.ToLowerInvariant()}
$report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $root 'local/s3-deployment.json')
Get-Content -LiteralPath $log -Tail 12
