# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Oleg Kozhevnikov
param(
  [ValidateSet('Check','Apply','List')][string]$Mode='Check',
  [string]$FormatterPath=$env:UNCRUSTIFY
)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
try {
$names=((& git -C $root -c core.quotepath=false ls-files -z) -join "`n").Split([char]0,[StringSplitOptions]::RemoveEmptyEntries)
if($LASTEXITCODE){throw 'Cannot list tracked source files'}
$generated=@(
  'include/lvgl_cbor/contract.hpp','include/lvgl_cbor/screen_contract.hpp',
  'include/lvgl_cbor/binding_contract.hpp','include/lvgl_cbor/composition_contract.hpp',
  'examples/common/sample_image.hpp','examples/s3_style_lab/main/native_widgets/catalog.generated.hpp',
  'examples/lilygo_t_display_s3/main/board.cpp'
)
$files=@($names | Where-Object {
  $_ -match '\.(c|cc|cpp|cxx|h|hh|hpp|hxx)$' -and
  $_ -notmatch '(^|/)(vendor|third_party|managed_components|node_modules|\.pio|fonts|generated|SIG)(/|$)' -and
  $_ -notmatch '(^|/)assets\.hpp$|\.generated\.' -and $_ -notin $generated -and
  (Test-Path -LiteralPath (Join-Path $root $_) -PathType Leaf)
} | Sort-Object)
if($Mode -eq 'List'){$files;exit 0}
if(!$FormatterPath){$FormatterPath=(Get-Command uncrustify -CommandType Application -ErrorAction Stop).Source}
$version=(& $FormatterPath --version) -join ''
if($LASTEXITCODE -or $version -notmatch '^Uncrustify-0\.83\.0_f$'){throw 'Install the pinned Uncrustify 0.83.0_f; use PATH, UNCRUSTIFY or -FormatterPath'}
$config=Join-Path $root 'uncrustify.cfg'
if(!(Test-Path -LiteralPath $config -PathType Leaf)){throw 'Cannot find uncrustify.cfg'}
& $FormatterPath -q -c $config --update-config *> $null
if($LASTEXITCODE){throw 'Cannot load uncrustify.cfg'}
} catch {
  Write-Error -Message $_.Exception.Message -ErrorAction Continue
  exit 2
}
$failures=0
foreach($file in $files){
  $source=Join-Path $root $file
  $arguments=@('-q','-c',(Join-Path $root 'uncrustify.cfg'),'-l',$(if($file -match '\.c$'){'C'}else{'CPP'}))
  if($Mode -eq 'Apply'){$arguments+=@('--no-backup','--replace',$source)}else{$arguments+=@('--check','-f',$source)}
  & $FormatterPath @arguments
  if($LASTEXITCODE){$failures++;Write-Output "FAIL: $file"}
}
Write-Output "$Mode`: $($files.Count) maintained C/C++ files, $failures failures"
if($failures){exit 1}
