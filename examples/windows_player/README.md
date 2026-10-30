# Windows player (MIT)

A real LVGL 9.6.0 application with the built-in Win32 display/input backend.
JSON and CBOR projects go through the **same JavaScript codecs** as the editor
and MCP. The native executable only receives CBOR and links the existing C++
`ProjectService`, `ScreenRuntime`, `StyleService` and `DataRegistry` sources.
There is no second renderer, binding engine or event dispatcher.

`Appearance` and `DemoData` now live in `../common` and are linked unchanged
by this player and the T-Display-S3 target. This directory retains the Windows
file/font/window adapters. See [the MCU example](../lilygo_t_display_s3/README.md).

## Build and run

Requirements: Windows, Visual Studio C++ Build Tools with the Windows SDK,
CMake 3.24+, Node.js matching the root README, and `npm ci` at the repository root.
Also provide LVGL **9.6.0** and TinyCBOR **0.6.1** sources. If the S3 example has
already downloaded these dependencies, CMake reuses only those source trees.
It neither builds nor contacts the board. Otherwise supply independent source
directories; ESP-IDF and NaWServer are not needed:

```powershell
./examples/windows_player/build.ps1 -LvglSource '<deps>/lvgl' -TinyCborSource '<deps>/tinycbor'
# Or, with dependencies already available:
npm run player:build
npm run player
npm run player -- '<projects>/interface.json' --watch
npm run player -- '<projects>/interface.cbor'
npm run player -- '<projects>/interface.json' --entry details
```

Sources: [LVGL v9.6.0](https://github.com/lvgl/lvgl/tree/v9.6.0) and
[TinyCBOR v0.6.1](https://github.com/intel/tinycbor/tree/v0.6.1).
Do not point `TinyCborSource` at its inner `src` directory.
Build output is ignored under `local/windows-player`. The earlier build directory
is left untouched, so a running older player need not be stopped to build this version.

## Color schemes

The included project opens **Настройки (Settings)** inside the existing shell.
The bottom navigation offers Overview, Data and Settings. The settings page has
four scheme buttons, a bound current-choice label, and all 12 standard types
currently supported by the shared runtime: `obj`, `label`, `button`, `bar`,
`slider`, `arc`, `line`, `image`, `checkbox`, `switch`, `textarea`, and `dropdown`.
The compact example includes normal/disabled buttons and writable controls.
It is an ordinary JSON/CBOR page, not a separate native settings renderer.

The buttons call the registered `ui.select_scheme` action; `ui.scheme` publishes
`{id, title}`. Bindings update checked states and the label. The native menu and
control API share this same selection method and preference storage. Pages and
their bindings stay alive while changing appearance.

Russian labels use resources `ui_20` / `ui_28`, rendered by LVGL TinyTTF from the
installed Windows Segoe UI font. The font file is not copied into the repository
or bundled with the player. Legacy Montserrat resources remain available.
The default theme's color transitions are disabled in this desktop profile so
the selected palette is displayed immediately and consistently.

The application menu **Оформление: Кремовая → Цветовая схема** offers **Светлая,
Кремовая, Изумрудная, Тёмная**, in the UI-standard order, with the current choice
checked. The default is Cream. Only color appearance is implemented in this
Windows prototype; screen geometry, density and radius profiles are unchanged.

The palette data in `schemes.json` comes from TechnicalShell's standard color
tokens. These are data values, not a copy of its CSS or frontend implementation.
`schemes.mjs` compiles every variant through the shared project/style codecs.
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
DPI scaling stretches its image without changing that layout. Opening another
resolution prepares a new native window before closing the old session. This
restarts its application demo data. Same-size reload keeps the application data
and replaces the project composition/cache, like the existing project loader.
The source document is never rewritten or automatically saved.

## Included application capabilities

`demo.json` is an independent, standard-widget example: status clock, speed arc,
numeric speed, action counter, writable controls, and three nested pages. It does not
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
results on stdout. It is an application test/data adapter, not an HTTP/MCP server.
It opens no port and never connects to a device. Examples:

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

## Verification

```powershell
npm test
npm run player:test
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

This is the first desktop target. It does not yet host the editor's HTTP/WS API,
package a standalone Node runtime, or claim MCU memory/timing equivalence.

[Подробное руководство на русском](../../docs/readme_windows_player_ru.md)
