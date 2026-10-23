param([string]$Configuration='Release')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
 foreach ($script in @('tools/style_contract.mjs','tools/screen_contract.mjs','tools/binding_contract.mjs','tools/composition_contract.mjs','tools/capabilities.mjs','tools/native_fixtures.mjs','tools/screen_examples.mjs','tools/extension_fixtures.mjs','tools/cursor_fixtures.mjs','tools/native_widget_catalog.mjs','tools/native_widget_fixtures.mjs','tools/project_fixtures.mjs','tools/composition_fixtures.mjs')) {
  & node $script
  if ($LASTEXITCODE) { throw "Generation failed: $script" }
 }
 & cmake -S tests/native -B local/native-build
 if ($LASTEXITCODE) { throw 'Native configuration failed' }
 & cmake --build local/native-build --config $Configuration -j 8
 if ($LASTEXITCODE) { throw 'Native build failed' }
 & "local/native-build/$Configuration/style_runtime_tests.exe" local/native-fixtures
 if ($LASTEXITCODE) { throw 'Style regression failed' }
 & "local/native-build/$Configuration/screen_runtime_tests.exe" local/screen-fixtures
 if ($LASTEXITCODE) { throw 'Screen integration failed' }
 & "local/native-build/$Configuration/style_service_tests.exe" local/screen-fixtures
 if ($LASTEXITCODE) { throw 'Style service integration failed' }
 & "local/native-build/$Configuration/native_widget_tests.exe" local/native-widget-fixtures
 if ($LASTEXITCODE) { throw 'Native widget integration failed' }
 & "local/native-build/$Configuration/native_widget_disabled_tests.exe"
 if ($LASTEXITCODE) { throw 'Native widget module exclusion failed' }
 & node tools/check_native_extensions.mjs
 if ($LASTEXITCODE) { throw 'Extension capabilities roundtrip failed' }
 & "local/native-build/$Configuration/project_service_tests.exe" local/project-fixtures
 if ($LASTEXITCODE) { throw 'Project service integration failed' }
 & node tools/binding_fixtures.mjs
 if ($LASTEXITCODE) { throw 'Binding codec fixtures failed' }
 & "local/native-build/$Configuration/binding_tests.exe" local/binding-fixtures
 if ($LASTEXITCODE) { throw 'Binding/event integration failed' }
 & "local/native-build/$Configuration/ble_scanner_tests.exe"
 if ($LASTEXITCODE) { throw 'BLE scanner reducer failed' }
 & "local/native-build/$Configuration/system_status_tests.exe"
 if ($LASTEXITCODE) { throw 'System status reducer failed' }
 & "local/native-build/$Configuration/composition_tests.exe" local/composition-fixtures
 if ($LASTEXITCODE) { throw 'Composition lifecycle integration failed' }
} finally { Pop-Location }
