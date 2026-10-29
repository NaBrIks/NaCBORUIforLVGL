# Windows player (MIT)

A real LVGL 9.6.0 application with the built-in Win32 display/input backend.
JSON and CBOR projects go through the **same JavaScript codecs** as the editor
and MCP. The native executable only receives CBOR and links the existing C++
`ProjectService`, `ScreenRuntime`, `StyleService` and `DataRegistry` sources.
There is no second renderer, binding engine or event dispatcher.

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
Build output is ignored under `local/windows-player-build`.

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
numeric speed, action counter, writable switch, and two nested pages. It does not
contain any board driver, Bluetooth implementation, or copied S3 demo module.

| Name | Contract |
| --- | --- |
| `demo.speed` | `{kmh: number 0..180, unit: text, sequence: integer}`; autonomous 25 Hz CBOR publication |
| `demo.running` | Writable boolean; pauses/resumes the generator |
| `demo.clicks` | Nonnegative integer; retained across page changes |
| `system.clock` | `{localTime: text}` from the Windows clock, no NTP configuration |
| `demo.step` | Action with integer argument 1..100 |
| `demo.reset` | Action with null argument |

These belong to `src/demo_data.*`, not the UI engine. Applications register their
own schemas, handlers, resources and native widgets in the same way as firmware.
This player does not advertise the S3's optional native widget catalog. Projects
requiring unregistered widgets/sources/resources are rejected, not silently
emulated. Default resources are `montserrat_20` and `montserrat_28`.

## Optional local control

`--control` accepts one JSON command per line on stdin and returns JSON-line
results on stdout. It is an application test/data adapter, not an HTTP/MCP server.
It opens no port and never connects to a device. Examples:

```json
{"op":"write","source":"demo.running","value":false,"id":1}
{"op":"publish","source":"demo.speed","value":{"kmh":42.5,"unit":"km/h","sequence":1},"id":2}
{"op":"invoke","action":"demo.step","value":10,"id":3}
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

The second command opens real Win32 LVGL windows. It checks JSON/CBOR equivalence,
CBOR source updates, formatted/fractional bindings, writable sources, actions,
nested navigation/retention, reload, missing resources, failure preservation,
different display sizes and shutdown. It requires the Release executable built
above. Physical mouse/keyboard acceptance is separate from injected LVGL events.

This is the first desktop target. It does not yet host the editor's HTTP/WS API,
package a standalone Node runtime, or claim MCU memory/timing equivalence.

[Подробное руководство на русском](../../docs/readme_windows_player_ru.md)
