# NaCBORUIforLVGL

English · [Русский](Readme.ru.md)

**CBOR-based UI definitions for LVGL**

Dynamic LVGL interfaces from editable JSON and compiled CBOR: screens, shared
styles, typed data bindings, events and nested pages. The editor and Windows launcher share codecs; devices and Windows execute the same C++
runtime. The core is not tied to ESP32.

Canonical repository: [NaBrIks/NaCBORUIforLVGL](https://github.com/NaBrIks/NaCBORUIforLVGL).
It is private; cloning requires authorized access.

## Modules and licenses

| Part | Purpose | License |
| --- | --- | --- |
| `include/lvgl_cbor`, `src` | C++17 runtime, styles, DataRegistry, ProjectService/storage | MIT |
| `packages` | JSON/CBOR screen/project/style and supported CSS codecs | MIT |
| `examples/common` | Shared appearance, demo data, layout diagnostics and display transport helpers | MIT |
| `examples/windows_player` | Real Win32 LVGL player, schemes and CPU/RAM/GPU overview | MIT |
| `examples/lilygo_t_display_s3` | Independent ST7789 T-Display-S3 example | MIT, including its upstream NOTICE |
| `frontend`, `integrations/nawserver` | Web editor and native HTTP/WS adapters | MIT; third-party notices in [scope](LICENSES.md) |
| `examples/s3_style_lab` | 7-inch RGB/touch demo with nested dashboard pages and display diagnostics | MIT with retained third-party notices |
| `tools/designer` | Windows/Android Designer, distributed separately from the examples | MIT; external SPLA source dependency |

Bluetooth implementations/examples belong to their own projects. They are not
UI-runtime dependencies. OS font binaries, SDKs and build outputs are not bundled.
External libraries retain their own licenses and notices.

## Features and API

- Whole-project JSON/CBOR with screens, shared styles and an entry page.
- `ProjectService`: named loading, separate preview/save, a base project plus an
  optional changes store. Connecting/selecting an editor page is passive.
- `DataRegistry`: typed symbolic sources/actions. Applications publish owned
  snapshots or CBOR; bindings call existing widget methods in the UI context.
- Pages own bindings/events and child instances with release/cache/retain policies.
  Inactive bindings can pause; sources retain latest values and bounded history.
- `WidgetRegistry`: application-registered native components and compiler metadata.
- Device capabilities and WebSocket updates over the native NaWServer API.
- Real Windows LVGL, resizable Grid/Flex pages, four schemes and system telemetry
  through Windows SDK APIs, without vendor GPU SDKs.

Initialize LVGL/resources, register sources/actions, construct ProjectService and
load a compiled project. Serialize all registry/LVGL work in the UI context.
See [bindings](docs/readme_bindings_ru.md), [projects/API](docs/readme_projects_ru.md)
and [public headers](include/lvgl_cbor/README.md). Shared example modules are
ordinary source files for external applications, not automatically linked by
the root IDF component.

## Clean-checkout setup

```sh
gh repo clone NaBrIks/NaCBORUIforLVGL
cd NaCBORUIforLVGL
npm ci
npm test
npm run contract:check
npm run build
```

GitHub CLI (or Git) needs repository access. Node.js must satisfy the pinned
Vite requirement `^20.19.0 || >=22.12.0`. The browser layout uses CSS; the native player executes LVGL.

For native tests and the Windows player, install Visual Studio C++ Build Tools
with Windows SDK, CMake 3.24+, Git and Node.js. Fetch dependencies explicitly;
the player also needs the NaWServer checkout; ESP-IDF and a prepared S3 example are not required:

```powershell
git clone --depth 1 --branch v9.6.0 https://github.com/lvgl/lvgl.git local/deps/lvgl
git clone --depth 1 --branch v0.6.1 https://github.com/intel/tinycbor.git local/deps/tinycbor
git clone --depth 1 https://github.com/NaBrIks/NaWServer.git local/deps/NaWServer
./tools/test_native.ps1 -LvglSource "$PWD/local/deps/lvgl" -TinyCborSource "$PWD/local/deps/tinycbor"
./examples/windows_player/build.ps1 -LvglSource "$PWD/local/deps/lvgl" -TinyCborSource "$PWD/local/deps/tinycbor" -NaWServerSource "$PWD/local/deps/NaWServer"
npm run player
npm run player:test
npm run player:test-system
npm run player:test-resize
```

After building the native player, `npm run sim` or `RunSimulator.cmd` rebuilds
and serves the editor through it.

Upstream tag commits: LVGL `80ca777e37a2b176770726a02e07a6fb79ef0b39`,
TinyCBOR `1e8296f94e40c6ac976d4c5a7b1db7f45978a83f`.
Open files with `npm run player -- interface.json` or `.cbor`; `--watch` reloads
saved changes. GPU counters need a compatible Windows/WDDM driver; unavailable
values remain unavailable. See [player setup/limits](examples/windows_player/README.md).

## Examples and Designer

| Example | What it demonstrates |
| --- | --- |
| [Windows player](examples/windows_player/README.md) | `npm run player` for system telemetry and themes; `npm run player:graphics` for raster/vector graphics, the remote-control UI and the authoring canvas. Both run real LVGL. |
| [7-inch ESP32-S3 RGB](examples/s3_style_lab/README.md) | Nested dashboard pages, native instruments, the web editor and live display through HTTP/WS. |
| [LilyGO T-Display-S3](examples/lilygo_t_display_s3/README.md) | Small ST7789 display, button input, and live USB diagnostics; optional Wi-Fi preview. |
| [Native widget](examples/native_widget/README.md) | Portable registration of a C++ widget and its authoring metadata. |

The [Windows/Android Designer](tools/designer/README.md) uses SPLA for
conversation, provider access and MCP. Direct API is the default and uses the
shared codecs inside the app. Designer can also connect to an explicitly
configured MCP endpoint. On Windows, the native player has optional embedded
MCP, and Designer can expose its current Direct API session to external agents
on loopback. The 7-inch firmware uses the Direct API and does not expose
`/mcp`. See the [connection modes and capabilities](docs/readme_mcp_ru.md).

## Hardware integrations

The RGB S3 example requires ESP-IDF 5.5.6, locked managed components and a separate
authorized **NaWServer** checkout in a sibling folder. The root IDF component
expects dependencies named `lvgl`/`cbor`; examples provide integration/aliases.
SDK/toolchain and private Wi-Fi configuration belong to the application.
See [RGB setup](examples/s3_style_lab/README.md),
[T-Display-S3 setup](examples/lilygo_t_display_s3/README.md) and
[environment setup](docs/readme_development_environment_ru.md).
A passing host build does not prove physical LCD/touch behavior. Deployment and
hardware-smoke commands change real devices and require authorization.

## Boundaries

Target: **LVGL 9.6.0**, screen cursor ABI **v3**, styles **v2**. Existing
`lvgl_cbor`, `LVGL_CBOR_*` and `@lvgl-cbor/*` identifiers remain compatible.
Application data names are symbolic UTF-8; objects, values, depth and queues are
bounded by contracts/capabilities. A project cannot introduce executable code,
new sensors or unregistered native components.

Bindings are bounded expressions, not scripts. Automatic array-row creation,
universal widget coverage and arbitrary HTML/CSS behavior are not promised.
Desktop `ScreenViewport::Display` adapts the root; `Declared` remains the default
for size validation. Fixed-coordinate projects need authoring changes to become
responsive. The player serves the built editor and HTTP/WS API through NaWServer.
[Dated reviews](docs/reviews/README.md) distinguish measured host/hardware results.

The Windows graphics profile includes native LVGL BIN/PNG/JPEG/BMP/GIF/SVG,
pixel formats and curve comparisons.
See [graphics guide](docs/readme_graphics_ru.md). The decoder/vector gallery can
be excluded with `LVGL_CBOR_GRAPHICS_GALLERY=OFF`.

## Documentation, licensing and support

Detailed guides are mainly Russian: [index](docs/README.md),
[nested pages](docs/readme_page_composition_ru.md), [MCP status](docs/readme_mcp_ru.md),
[SeMaps](docs/readme_semaps_ru.md), [sources/notices](docs/readme_sources_ru.md).

C/C++ contributions use [Uncrustify 0.83.0_f](agents/code_style.md) and the
unchanged NaWServer profile in `uncrustify.cfg`. Run
`.\uncrustify-check.cmd` before review; `.\uncrustify-apply.cmd` formats source,
and `.\uncrustify-apply.cmd --help` describes the options.
Generated/vendor code and other languages are excluded.

Project-owned code is [MIT](LICENSE), including the owner-authored frontend/RGB
code previously offered under GPL. This follows the owner's explicit decision
on 2026-10-30, rather than the repository transfer or a history rewrite. Third-party
code, Tabler icons, LilyGO parameters/notices, LVGL reference material and external
libraries retain their own terms. See the explicit [exceptions register](LICENSES.md).
Existing third-party copyright notices must stay intact.

Contributions and voluntary donations are welcome. No payment link is configured;
donations are optional and do not change license terms.

Grouped data discovery includes descriptions, units and bounded HTTP pages.
An optional, application-owned `DataHistory` sampler publishes ordinary sources
independently of page lifetime. See [the catalog guide](docs/readme_data_catalog_ru.md).
Run `npm run player:test-catalog` for real Windows LVGL and native API coverage.

User-authored appearance via project documents and ordered style stacks: [guide](docs/readme_appearance_ru.md).

`npm run player` also starts the persistent loopback API at `http://127.0.0.1:5300`.
Preview, revision-checked save, styles, bindings and events execute in native shared services.
`npm run player:test-api` verifies the production path and restart persistence.
See [Windows API](docs/readme_windows_api_ru.md).

See [Windows demos and live native view](docs/readme_graphics_ru.md).
