# NaCBORUI Designer (Windows / Android)

Актуальные три режима подключения: [Прямой API / MCP устройства / MCP-прокси](../../docs/readme_designer_connections_ru.md). Основной — прямой API с JS-кодеками внутри приложения, без Node.js.
The standard configuration application shipped with NaCBORUIforLVGL,
not a demo-specific editor. Sources live in `tools/designer`.

A Blazor Hybrid presentation over the existing SPLA libraries. The app runs the
conversation, model requests and MCP tools locally through SPLA. The inbound Windows MCP endpoint is opt-in. The browser editor remains available from the Windows LVGL demo.
See [Russian guide](../../docs/readme_maui_designer_ru.md).

## Source dependencies

Install the .NET 10 MAUI Windows/Android workloads. The application pins SDK 10.0.403
and MAUI 10.0.110. Install Node.js as specified in the root README and run
`npm ci` at the repository root before building. Check out SPLA beside the
`esp32` directory, or pass `-SplaRoot <absolute SPLA checkout>` to `build.ps1`.
For direct MSBuild invocation use `-p:SplaRoot=<absolute SPLA checkout>`.
The four ProjectReference entries can become package references when the owner's
SPLA NuGet packages are available.

```powershell
cd tools/designer
.\build.ps1 -Target Windows
.\build.ps1 -Target AndroidEmulator -AndroidSdkDirectory '<Android SDK>' -JavaSdkDirectory '<JDK 21>'
.\build.ps1 -Target AndroidPhone -AndroidSdkDirectory '<Android SDK>' -JavaSdkDirectory '<JDK 21>'
```

All dependency build outputs go to the repository's ignored `local/designer`.
The Android debug APK embeds managed assemblies; it does not require fast deployment.
This is a development-signed APK, not a store release.

## Target connection

Direct API is the default: existing JavaScript codecs execute locally inside
BlazorWebView, and the application's bounded HttpClient talks to the target.
Direct API requires only the application and its selected target.

Settings also offer Device MCP and MCP proxy. Both reuse the same SPLA HTTP MCP
client and store independent endpoint URLs. A proxy is explicitly selected, never
automatically started. Native Windows MCP is an optional proof of concept
(`LVGL_CBOR_NATIVE_MCP=ON`, default OFF), with metadata/data/actions/frame tools.
UI JSON authoring remains in the local Direct API tools; it is not implemented
by the native MCP PoC. MCU deployment is not part of this iteration.

Build the local module with `npm run designer:tools`; the MAUI build also generates
it from shared sources. Node/Vite are build-time dependencies only.

Model endpoint, provider, model and target URL are independent app settings.
The API key belongs to platform SecureStorage; ordinary settings use Preferences.
Chat is held in memory by SPLA. Restarting or clearing chat does not replace the
target project. Connect/refresh are passive.

For a prepared ARM64 APK, the install helper is
`./install-phone.ps1 -Serial <explicit adb phone serial>` (optionally `-Adb <adb executable>`).
APKs and signing keys remain ignored. The `:free` checkbox filters model IDs by
suffix; it is not a pricing guarantee for arbitrary compatible providers.

## Optional MCP for external agents on Windows

`./build.ps1 -Target Windows -WithMcp` builds the NaWServer DLL beside Designer.
It requires the adjacent NaWServer checkout with the MCP content callback.
Set `NACBORUI_DESIGNER_MCP_PORT` (for example, `5303`) before starting
`App.exe`, then connect a Direct API device. The app serves Streamable HTTP at
`http://127.0.0.1:5303/mcp` while that target is connected.

External tools call the same active Designer session and WebView codecs as chat.
They receive the connected device's tool schemas, text errors, and display frames.
Start with `get_authoring_instructions` to load the same complete English guide
used by chat. Tool calls are serialized with chat and rejected after a target
change until reconnect. The transport has a 64 KiB response budget. Use a
document or subtree read for large projects, and a smaller `maxEdge` for frames.

Antigravity uses a Streamable HTTP entry in its `mcp_config.json`:

```json
{"mcpServers":{"nacborui_designer":{"serverUrl":"http://127.0.0.1:5303/mcp"}}}
```
