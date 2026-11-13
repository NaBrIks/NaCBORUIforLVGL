# Windows player (MIT)

A real LVGL 9.6.0 application with the built-in Win32 display/input backend.
The System and Graphics profiles use the same executable and start from
different projects. JSON and CBOR project files go through the shared JavaScript
codecs. The executable loads CBOR through the existing C++ `ProjectService`,
`ScreenRuntime`, `StyleService` and `DataRegistry`.

`Appearance` and `DemoData` now live in `../common` and are linked unchanged
by this player and the T-Display-S3 target. This directory retains the Windows
file/font/window adapters. See [the MCU example](../lilygo_t_display_s3/README.md).

## Build and run

Requirements: Windows, Visual Studio C++ Build Tools with the Windows SDK,
CMake 3.24+, Node.js matching the root README, and `npm ci` at the repository root.
Also provide LVGL **9.6.0** and TinyCBOR **0.6.1** sources. If the S3 example has
already downloaded these dependencies, CMake reuses only those source trees.
It neither builds nor contacts the board. Otherwise supply independent source
directories. The desktop HTTP/WS adapter uses NaWServer; ESP-IDF is not needed.

```powershell
./examples/windows_player/build.ps1 -LvglSource '<deps>/lvgl' -TinyCborSource '<deps>/tinycbor' -NaWServerSource '<deps>/NaWServer'
# Or, with dependencies already available:
npm run player:build
npm run build
npm run player            # System profile, HTTP API on port 5300
npm run player:graphics   # Graphics profile, HTTP API on port 5301
npm run player -- '<projects>/interface.json' --watch
npm run player -- '<projects>/interface.cbor'
npm run player -- '<projects>/interface.json' --entry details
```

Sources: [LVGL v9.6.0](https://github.com/lvgl/lvgl/tree/v9.6.0),
[TinyCBOR v0.6.1](https://github.com/intel/tinycbor/tree/v0.6.1), and
[NaWServer](https://github.com/NaBrIks/NaWServer).
NaWServer's native Windows CMake integration must be available. CMake also checks
the sibling `NaWServer` checkout and `local/deps/NaWServer`; alternatively set
`NAWSERVER_SOURCE_DIR` explicitly.
Do not point `TinyCborSource` at its inner `src` directory.
Build output is ignored under `local/windows-player`. The earlier build directory
is left untouched, so a running older player need not be stopped to build this version.

## Color schemes

The included project opens **Система (System)** inside the existing shell.
The bottom navigation offers Overview, Data, System and Settings. The settings page has
four scheme buttons, a bound current-choice label, and all 12 standard types
currently supported by the shared runtime: `obj`, `label`, `button`, `bar`,
`slider`, `arc`, `line`, `image`, `checkbox`, `switch`, `textarea`, and `dropdown`.
The compact example includes normal/disabled buttons and writable controls.
It is an ordinary JSON/CBOR page, not a separate native settings renderer.

The buttons call the registered `ui.select_scheme` action; `ui.scheme` publishes
`{id, title}`. Bindings update checked states and the label. The native menu and
control API share this same selection method and preference storage. Pages and
their bindings stay alive while changing appearance.

Russian labels use resources `ui_14` / `ui_20` / `ui_28`, rendered by LVGL TinyTTF from the
installed Windows Segoe UI font. The font file is not copied into the repository
or bundled with the player. Legacy Montserrat resources remain available.
The default theme's color transitions are disabled in this desktop profile so
the selected palette is displayed immediately and consistently.

The application menu **Оформление: Кремовая → Цветовая схема** offers **Светлая,
Кремовая, Изумрудная, Тёмная**, in the UI-standard order, with the current choice
checked. The default catalog uses Cream. Custom catalogs may override ordinary
role style properties, including radius/borders; the registry example provides
Classic, Space and Pony variants. See [custom appearance](../../docs/readme_appearance.ru.md).

The palette data in `../common/appearance/schemes.json` comes from TechnicalShell's standard color
tokens. These are data values, not a copy of its CSS or frontend implementation.
`../common/appearance/schemes.mjs` compiles every variant through the shared project/style codecs.
The application exposes stable `const lv_style_t *` resources named `ui.canvas`,
`ui.panel`, `ui.status`, `ui.text`, `ui.muted`, `ui.button`, `ui.button_pressed`,
`ui.button_focus`, `ui.focus_outline`, `ui.button_disabled`, `ui.indicator`, `ui.track`, `ui.knob`,
`ui.arc_track`, and `ui.arc_value`. Pages attach them with ordinary
`global-static:ui.*` style references and LVGL parts/states. The included project
uses this mechanism; there are no widget-ID branches in the runtime.

State-specific roles are explicit: the switch uses `ui.indicator` on
`INDICATOR/CHECKED`, so LVGL's default blue checked style cannot override the
chosen palette. Its OFF indicator keeps the default transparent opacity.
Buttons also attach an explicit `FOCUS_KEY` outline; arcs attach it for
`FOCUS_KEY` and `EDITED`. A combined-state test checks the effective LVGL colors.
Checkbox selection, slider knob, textarea cursor/selection, lines and image
recolor use the same role resources. The generated 24×24 sample image is owned
by the demo. A small application theme extension styles the standard dropdown's
separate popup with those same shared resources and the installed Cyrillic font;
it does not add a second widget implementation to the engine.

Switching replaces the shared style values at their existing addresses in the
serialized UI context. It preserves pages, cached instances, data, bindings and
focus. Local properties still override a shared role; copy/merge still makes a
snapshot. Hardcoded/custom-drawn colors need their own explicit adaptation.
Existing projects must attach these resources to opt into this appearance;
the player does not guess semantic roles from RGB values.

The choice is stored separately in `%LOCALAPPDATA%/NaCBORUIforLVGL/player.json`;
it does not modify the project. Use `--scheme dark` for a startup choice,
`--settings PATH` for another preference file, or `--no-settings` to disable it.
The four variants are loaded once from a compiled resource project; its tiny
screen entries carry catalog labels and are never displayed. Preparing the
catalog uses the existing `parse_project` / `StyleRuntime`; applying a choice
uses the existing `StyleValue::replace`. Core code and ABI are unchanged.

Native LVGL snapshots: [Light](../../docs/images/windows-scheme-light.png),
[Cream](../../docs/images/windows-scheme-cream.png),
[Emerald](../../docs/images/windows-scheme-emerald.png),
[Dark](../../docs/images/windows-scheme-dark.png).

`File → Open` / **Ctrl+O** opens a whole JSON/CBOR project. **F5** reloads it.
`--watch` listens to filesystem notifications with a short debounce. It also
handles an editor replacing the file by rename. No network polling is involved.
The loader validates against the actual native capability catalog before
compiling. Errors change the existing window title; details are available in
`Help → Details` and the launcher's JSON-lines output. No automatic error dialog
or banner covers the interface. The previous project remains on a failed root
load. A failed nested page uses the existing runtime's red-cross placeholder.

The initial logical display size comes from the chosen screen's `size`; Windows
DPI scaling stretches its image without changing that layout. With NaWServer
enabled, opening/reloading projects keeps the same native process, window,
server and application data; normal responsive layout uses its current viewport.
Without the API, opening another resolution prepares a new native window before
closing the old session and restarts application demo data. Same-size reload
keeps application data and replaces the project composition/cache.
The source document is never rewritten or automatically saved.

## Included application capabilities

`demo.json` is an independent, standard-widget example: status clock, speed arc,
numeric speed, action counter, writable controls, and four nested pages. It does not
contain any board driver, Bluetooth implementation, or copied S3 demo module.

| Name | Contract |
| --- | --- |
| `demo.speed` | `{kmh: number 0..180, unit: text, sequence: integer}`; autonomous 25 Hz CBOR publication |
| `demo.running` | Writable boolean; pauses/resumes the generator |
| `demo.clicks` | Nonnegative integer; retained across page changes |
| `demo.level` | Writable integer 0..100; slider |
| `demo.checked` | Writable boolean; checkbox |
| `demo.choice` | Writable integer 0..2; dropdown selection |
| `demo.text` | Writable UTF-8 text, max 128 bytes; textarea (32 characters) |
| `system.clock` | `{localTime: text}` from the Windows clock, no NTP configuration |
| `demo.step` | Action with integer argument 1..100 |
| `demo.reset` | Action with null argument |
| `ui.scheme` | Readonly `{id, title}` describing the current appearance |
| `ui.select_scheme` | Action with scheme ID text; used by the Settings page |

These belong to `src/demo_data.*`, not the UI engine. Applications register their
own schemas, handlers, resources and native widgets in the same way as firmware.
This player does not advertise the S3's optional native widget catalog. Projects
requiring unregistered widgets/sources/resources are rejected, not silently
emulated. Font resources are `ui_20`, `ui_28`, `montserrat_20`, and `montserrat_28`;
`ui_sample_image` is a registered LVGL image descriptor.

## Optional local control

`--control` accepts one JSON command per line on stdin and returns JSON-line
results on stdout. This stdin adapter serves local diagnostics and opens no
port. The separate `--api` flag starts native NaWServer. Example control
commands:

```json
{"op":"write","source":"demo.running","value":false,"id":1}
{"op":"publish","source":"demo.speed","value":{"kmh":42.5,"unit":"km/h","sequence":1},"id":2}
{"op":"invoke","action":"demo.step","value":10,"id":3}
{"op":"scheme","scheme":"emerald","id":5}
{"op":"inspect","nodes":[{"id":"clock"}],"id":4}
{"op":"open","path":"<absolute-project-path>"}
{"op":"quit"}
```

`publish` is application-side source publication. `write` uses the source's
writable handler (optional `path` array); `invoke` uses its registered action.
All validation and execution belongs to `DataRegistry`. Native operations are
serialized with LVGL. `inspect` returns view instance IDs, requested node bounds
and supported standard-widget values; `dataJson` contains the existing registry
snapshot verbatim. `click` with `node` and optional numeric `instance` injects a
LVGL clicked event for integration tests. It does not emulate pointer input.
`event` with `node`, optional `instance`, and `event` (`pressed`, `released`,
`focus`, or `key`) exercises the actual LVGL control handlers. For `key`, provide
ASCII 1..127 or `left`, `right`, `up`, `down`, `enter`, `escape`, `backspace`.
These events stay inside the player; no OS mouse/keyboard input is sent.

The private launcher-to-executable bridge frames CBOR values with a 4-byte LE
length, max 64 KiB per command; the native input buffer is bounded. The launcher
queues at most 32 commands. Whole compiled project files are bounded at 2 MiB
and stored in an OS temporary folder removed on normal shutdown. Browser/Node
codecs own JSON parsing/compilation; no JSON library is added to C++ or firmware.
Launch through Node for JSON loading, file dialogs and watch support. The native
executable alone can open a compiled `.cbor` via `--project`, `--width`, `--height`.

## Native NaWServer and web editor

`npm run player` enables the native API at `http://127.0.0.1:5300`. Direct launcher
invocation enables it with `--api`, `--api-port PORT` or `--api-store PREFIX`.
Without API options it retains no-listener mode. NaWServer serves the built editor,
HTTP project/data APIs and binary-CBOR WebSocket events through the same native
services. Foreign Host/Origin requests are rejected; local port 443 is forbidden.

Preview, revision-checked save, show/reset, data actions and bindings reuse
ProjectService, FileProjectStore and DataRegistry. Saving does not switch the
display. Source JSON and application live values are not implicitly persisted.

Designer normally connects to this player using Direct API. To test the
limited native MCP proof of concept, build with `LVGL_CBOR_NATIVE_MCP=ON`
(default `OFF`) and start the player with the API enabled. NaWServer then
serves `/mcp` on the same loopback address and port. Use the
[native MCP build and verification guide](../../docs/readme_windows_native_mcp.ru.md)
for its supported operations.

[API guide](../../docs/readme_windows_api.ru.md).

## Verification

```powershell
npm test
npm run player:test
npm run player:test-system
npm run player:test-resize
npm run player:test-catalog
npm run player:test-api
```

The second command uses hidden Win32 LVGL windows without activating them or
sending keyboard/mouse input. It checks JSON/CBOR equivalence,
CBOR source updates, formatted/fractional bindings, writable sources, actions,
nested navigation/retention, reload, missing resources, failure preservation,
different display sizes and shutdown. It requires the Release executable built
above. It additionally checks all four palettes, menu checkmarks, persistence,
instance/geometry preservation, cache/reactivation, and exports real LVGL BMP
snapshots to ignored `local/windows-schemes`. `--hidden` is also available for
other automation. Physical mouse/keyboard acceptance is separate from injected
LVGL events. A control `snapshot` command with `path` writes the current screen
using LVGL's own snapshot renderer; it does not capture the user's desktop.

Settings snapshots are exported as `settings-<scheme>.bmp`, plus `-on.bmp` and
`-popup.bmp` variants. Tests cover all four palettes, switch/checkbox ON/OFF,
slider, text and dropdown writeback, cursor and popup colors, scheme buttons,
bindings, preview values, menu synchronization, retained instances and actual
component containment. This covers the 12 supported contract types, not every
widget offered upstream by LVGL.
Tests also cover combined keypad focus/edit states, bounded large counters,
180.0 km/h and 32 Cyrillic input characters. The page stays within its container;
long input can scroll inside the textarea. Labels keep fixed cells and use the
standard ellipsis where needed; full source values remain in the registry.
To build without replacing a running executable, use `build.ps1 -BuildDirectory
local/windows-player-staging` and pass that executable as the optional first
argument to `test-window.mjs`.

## Resizable window

The player uses the regular LVGL Win32 desktop backend: drag the frame or maximize
the window. Status and bottom navigation keep their height; all remaining client
space belongs to the page. The bundled pages use ordinary LVGL Grid/Flex, percentages
and FR tracks, so graphs/columns/containers follow the viewport while fonts and
ordinary control heights remain readable. No CBOR recompilation or project reload
occurs during resize. Data, histories, current page, bindings and form values stay
alive. A square arc in the settings mini-example keeps its aspect and size.

For the bundled demo the minimum client area is 800×480. A smaller standalone
document may start with its smaller minimum. Window tracking is bounded to 4096
pixels on either side. Existing larger CPU/GPU lists scroll inside their region
when needed; the shell stays fixed. Size is not saved to the project/preferences.

`screen.size` remains the authored initial size. The player explicitly selects
`ScreenViewport::Display` on the existing ProjectService; the portable runtime's
default `Declared` mode still validates the declared size at load. Nested `fill`
views already follow their container. Opening an arbitrary fixed-coordinate
project does not automatically make its internal layout responsive: the author
uses the same Grid/Flex/percentage styles. Wire ABI is unchanged.

The optional control command `{op:"resize",width:1200,height:800}` resizes the
actual native client area without activation. Backend resolution changes on its
next LVGL timer pass; `inspect` reports `clientWidth/Height`, `displayWidth/Height`
and `resizable`. Invalid sizes preserve the active page. The command is a local
Windows adapter, not a new MCU API.

`player:test-resize` runs hidden native windows at four distinct sizes, returns
to the initial size, visits every page, checks parent/viewport bounds, stable
instances/values and CBOR reload in a resized display. It exports measurements
and snapshots under ignored `local/windows-resize` without OS mouse/key input.

The desktop target uses native NaWServer for the web editor and HTTP/WS API.
The optional MCP profile uses that same listener. Install Node.js separately
for the launcher and the JavaScript project codecs.

## Windows system overview

System shows real CPU load, one history per logical processor (including SMT),
physical RAM usage, GPU load and dedicated/shared GPU memory on one page.
Four Flex blocks keep related values together: CPU (total and logical processors),
RAM, GPU load, and GPU memory. CPU fills the upper region; the other three share
the lower row with equal width. Plots grow with the viewport; GPU memory rows
remain compact. Thin palette-aware borders separate the blocks.
It uses Windows SDK **PDH + DXGI + GlobalMemoryStatusEx**, linked as system
libraries `pdh` and `dxgi`. No vendor SDK, WMI, new package, driver installation
or administrator privilege is required. GPU counters require a compatible
Windows/WDDM driver; an unavailable value stays `—`, never a fabricated zero.

`SystemMetrics` owns one sampling thread. It collects about once per second and
replaces one bounded latest-sample mailbox. The UI thread drains four owned CBOR
values through `DataRegistry::publish_cbor`; ordinary page bindings apply them.
The worker never calls LVGL or the registry. Histories hold exactly 32 integer
percentage samples, with `-1` for a gap. They continue off page and independently
of the demonstration speed generator. Startup has no invented history.

| Source | Data |
|---|---|
| `system.cpu` | Total processor time %, detected/displayed processor counts, sequence and `{label, history}` series |
| `system.cores` | Fixed bounded array of `{label, history}`, numeric processor-group/index order |
| `system.memory` | Physical total/used/available MiB, %, summary and series |
| `system.gpus` | Adapter names, busiest engine %, dedicated used/capacity and shared MiB, labels and series |

CPU measures `% Processor Time`, not frequency-weighted Processor Utility, so it
may differ from Task Manager. GPU sums processes on each physical engine and
reports the busiest engine, rather than summing mutually concurrent engines.
DXGI supplies adapter identity/capacity; adapter-wide PDH counters supply memory
usage. This is not a process-local DXGI memory budget. Shared GPU memory is RAM;
do not add it again to physical RAM usage. Missing fields remain unavailable.

`demo:history_plot` is one small optional native example component, with a single
bounded `series` method described in `history-plot.json`. It draws using LVGL and
reads the same style resources on every draw; there is no alternate UI engine.
Its catalog is embedded by CMake and published through the existing capabilities
mechanism. The core, shared ABI, editor, common example modules and LilyGO do not
change for Windows telemetry. The ordinary JSON page is generated by
`system-page.mjs`. The authored `demo.json` contains neutral CPU/GPU placeholders,
not the machine topology that happened to be used when the demo was created.
Before compiling the bundled system demo, the launcher takes the exact fixed-array
sizes from the actual `system.cores` / `system.gpus` registry schemas. No adapter names
or counter values are authored into the page. Projects without a system page are
left untouched; user-opened JSON/CBOR files keep their own definitions.

DXGI hardware adapters can include distinct entries with the same model name;
these are not merged by display name. A discovered adapter without matching PDH
counters stays visible with unavailable readings, rather than acquiring invented
zeroes. This list describes DXGI adapters, not a guaranteed count of physical cards.

Bounds: up to 64 logical processors and four DXGI hardware adapters, detected at
startup; CPU total still covers all processors. `count` and `displayed` make any
CPU truncation explicit. Up to 32 processors and two GPUs fit without scrolling;
larger supported topologies scroll only their own core/GPU region. Counter-array
allocations are limited to 4 MiB; each read retries at most three times if process
instances change. Topology changes require restarting the demo. Sampling has
nominal one-second spacing; this is an overview, not a precise tracing tool.

`player:test-system` runs real counters, fills the 32-sample history, checks
collection while Settings is open, four palettes, node bounds, unavailable data,
rejection without geometry changes and clean shutdown. It exports native LVGL
snapshots and local measurements to ignored `local/windows-system`. Add
`--require-gpu` after the optional executable argument to require working GPU
load/memory counters on the acceptance machine.

[Подробное руководство на русском](../../docs/readme_windows_player.ru.md)

## Grouped catalog, optional history and custom design

```powershell
npm run player -- examples/windows_player/registry-demo.json --schemes examples/windows_player/registry-schemes.json --no-settings
npm run player:test-catalog
```

The additional example uses a 32-point/200 ms optional sampler, ordinary slider/switch
bindings and three appearance choices: strict classic, space future and pink pony.
Custom `--schemes` catalogs support ordinary style `roleOverrides`, compiled by the
shared style codec. `LVGL_CBOR_HISTORY=OFF` excludes the generic sampler; the original
SystemMetrics histories remain independent. Test the OFF executable with
`node examples/windows_player/test-catalog.mjs PATH_TO_EXE --expect-history-off`.

For a new design, use Designer in Direct API mode to edit ordinary project styles
and ordered component references, then preview or save the project.
The optional native MCP proof of concept has its own verification guide.
See [catalog/history](../../docs/readme_data_catalog.ru.md),
[custom appearance via MCP](../../docs/readme_appearance.ru.md) and
[validation](../../docs/reviews/REVIEW_20261107_data-catalog-history.md).

## Native graphics gallery

`npm run player:graphics` opens the separate five-page graphics application
(Raster, Vector, MCP canvas, Controller, Settings), with real LVGL samples,
including animated GIF and MIT Tabler SVG icons. The original demo remains intact.
Run `npm run player:test-graphics` for hidden native pixel/animation acceptance.

`LVGL_CBOR_GRAPHICS_GALLERY=ON` is the default Windows CMake profile; OFF excludes
the extra native component/resources and heavy decoder/vector flags. MCU profiles
are unchanged. See [formats, flags and validation](../../docs/readme_graphics.ru.md).

A saved Windows project survives authored-base upgrades through the existing
ProjectService and FileProjectStore. Legacy stores without a cached original base
can use `--base-recovery original.json` once; an incorrect base never resets user
changes. See [Windows storage and verification](../../docs/readme_windows_api.ru.md).

NaWServer serves native display and pointer input at `/viewer` and the project
editor at `/editor/`. Use the [SPLA-based Designer](../../tools/designer/README.md)
for model-driven authoring. It carries the bilingual instructions and method
references in `tools/designer/prompts`. See
[display transport and MCP feedback](../../docs/readme_display_feedback.ru.md).

Upgrading an existing saved project preserves its old pages by design. If Settings
was the unmodified old demo page, reset only its `screens/settings` override using
`reset_project_changes` with the current revision, then refresh. Do not reset the
whole project: the MCP-authored canvas and other owner documents must survive.
The obsolete graphics-assistant.dpapi is no longer read or written; it may be deleted.
