# NaCBORUIforLVGL

English · [Русский](Readme.ru.md)

**CBOR-based UI definitions for LVGL**

Dynamic LVGL interfaces from editable JSON and compiled CBOR: screens, shared
styles, typed data bindings, events and nested pages. The editor, MCP adapter
and Windows launcher share codecs; devices and Windows execute the same C++
runtime. The core is not tied to ESP32.

Canonical repository: [NaBrIks/NaCBORUIforLVGL](https://github.com/NaBrIks/NaCBORUIforLVGL).
It is private; cloning requires authorized access.

## Modules and licenses

| Part | Purpose | License |
| --- | --- | --- |
| `include/lvgl_cbor`, `src` | C++17 runtime, styles, DataRegistry, ProjectService/storage | MIT |
| `packages` | JSON/CBOR screen/project/style and supported CSS codecs | MIT |
| `integrations/mcp` | Optional host stdio MCP adapter over the existing device API | MIT |
| `examples/common` | Shared Appearance, demo sources/actions and sample image | MIT |
| `examples/windows_player` | Real Win32 LVGL player, schemes and CPU/RAM/GPU overview | MIT |
| `examples/lilygo_t_display_s3` | Independent ST7789 T-Display-S3 example | MIT, including its upstream NOTICE |
| `frontend`, `examples/s3_style_lab` | Owner-authored editor shell and RGB/touch example | MIT; third-party exceptions in [scope](LICENSES.md) |

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
- Device capabilities and WebSocket updates; host MCP reuses device APIs/codecs.
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
Vite requirement `^20.19.0 || >=22.12.0`. `npm run sim` starts the browser editor;
Windows also has `RunSimulator.cmd`. This CSS preview does **not** execute LVGL.

For native tests and the Windows player, install Visual Studio C++ Build Tools
with Windows SDK, CMake 3.24+, Git and Node.js. Fetch dependencies explicitly;
this path does not need ESP-IDF, NaWServer or a prepared S3 example:

```powershell
git clone --depth 1 --branch v9.6.0 https://github.com/lvgl/lvgl.git local/deps/lvgl
git clone --depth 1 --branch v0.6.1 https://github.com/intel/tinycbor.git local/deps/tinycbor
./tools/test_native.ps1 -LvglSource "$PWD/local/deps/lvgl" -TinyCborSource "$PWD/local/deps/tinycbor"
./examples/windows_player/build.ps1 -LvglSource "$PWD/local/deps/lvgl" -TinyCborSource "$PWD/local/deps/tinycbor"
npm run player
npm run player:test
npm run player:test-system
npm run player:test-resize
```

Upstream tag commits: LVGL `80ca777e37a2b176770726a02e07a6fb79ef0b39`,
TinyCBOR `1e8296f94e40c6ac976d4c5a7b1db7f45978a83f`.
Open files with `npm run player -- interface.json` or `.cbor`; `--watch` reloads
saved changes. GPU counters need a compatible Windows/WDDM driver; unavailable
values remain unavailable. See [player setup/limits](examples/windows_player/README.md).

The optional MCP adapter has its own lock file and tests:

```sh
npm --prefix integrations/mcp ci
npm --prefix integrations/mcp test
```

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
responsive. The player has no editor HTTP/WS server or bundled Node runtime.
[Dated reviews](docs/reviews/README.md) distinguish measured host/hardware results.

## Documentation, licensing and support

Detailed guides are mainly Russian: [index](docs/README.md),
[nested pages](docs/readme_page_composition_ru.md), [MCP](integrations/mcp/README.md),
[SeMaps](docs/readme_semaps_ru.md), [sources/notices](docs/readme_sources_ru.md).

Project-owned code is [MIT](LICENSE), including the owner-authored frontend/RGB
code previously offered under GPL. This follows the owner's explicit decision
on 2026-10-30, rather than the repository transfer or a history rewrite. Third-party
code, Tabler icons, LilyGO parameters/notices, LVGL reference material and external
libraries retain their own terms. See the explicit [exceptions register](LICENSES.md).
Existing third-party copyright notices must stay intact.

Contributions and voluntary donations are welcome. No payment link is configured;
donations are optional and do not change license terms.
