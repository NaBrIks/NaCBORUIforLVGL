# NaCBORUI Designer (Windows / Android)

The standard configuration application shipped with NaCBORUIforLVGL,
not a demo-specific editor. Sources live in `tools/designer`.

A Blazor Hybrid presentation over the existing SPLA libraries. The app runs the
conversation, model requests and MCP tools locally through SPLA. It does not start
an HTTP server. The browser editor remains available from the Windows LVGL demo.
See [Russian guide](../../docs/readme_maui_designer_ru.md).

## Source dependencies

Install the .NET 10 MAUI Windows/Android workloads. The application pins SDK 10.0.403
and MAUI 10.0.110. Check out SPLA beside the `esp32` directory, or pass
`-p:SplaRoot=<absolute SPLA checkout>`. SPLA is referenced, never copied or modified.
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

## Development target

The current LVGL player exposes its API, and its existing MCP adapter is stdio.
For the phone prototype, a **NaWServer** native HTTP gateway carries the existing
MCP SDK/tools to that API. It is a separate process/listener to avoid a same-listener
synchronous callback deadlock. There is no second codec or project implementation.

From the repository root, with the graphics player already listening on port 5301:

```powershell
cmake -S integrations/mcp/native_gateway -B local/mcp-gateway
cmake --build local/mcp-gateway --config Release
node integrations/mcp/run-http.mjs --device=http://127.0.0.1:5301 --port=5302
```

Gateway default: `http://127.0.0.1:5302/mcp`. It permits project preview/save/data
operations through the existing MCP catalog. Keep this development endpoint private.
It rejects browser Origin requests and is loopback-only by default. Port 443 is rejected.
It is stateless Streamable HTTP, JSON responses; the SPLA client needs no SSE GET.

Windows app MCP URL: `http://127.0.0.1:5302/mcp`.
Android emulator MCP URL: `http://10.0.2.2:5302/mcp`.
For an Android phone connected by USB, without a LAN listener/firewall change:

```powershell
adb reverse tcp:5302 tcp:5302
adb install -r '<signed android-arm64 APK>'
```

Then use `http://127.0.0.1:5302/mcp` in the phone app. The reverse mapping lasts
for that adb connection; renew it after reconnecting. A real device with a native
compatible HTTP MCP endpoint can instead be configured directly. This prototype
does **not** add MCP HTTP to the MCU firmware or prove direct phone-to-MCU operation.

Model endpoint, provider, model and MCP URL are independent app settings. Enter an API
key once in Settings; the key goes to platform SecureStorage, ordinary settings to
Preferences. No developer key is bundled. Connect/refresh do not save or replace the
LVGL project. Chat is held in memory by SPLA; restarting the app clears conversation,
not the target project. New Chat also leaves the target project untouched.

For the prepared ARM64 APK the USB install/launch helper is:
`./install-phone.ps1 -Serial <explicit adb phone serial>` (optionally `-Adb <adb executable>`).
The physical Android default is loopback for that USB mapping. The emulator default
remains 10.0.2.2. APKs and signing keys are deliberately ignored by Git.
The `:free` checkbox filters model IDs with that suffix; SPLA's current string-only
model catalog does not expose pricing/vision metadata. It is not a price guarantee
for arbitrary compatible providers.
