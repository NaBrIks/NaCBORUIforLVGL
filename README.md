# NaCBORUIforLVGL

English · [Русский](readme.ru.md)

**CBOR-based UI definitions for LVGL**

A modular editor and runtime for dynamic LVGL interfaces: JSON/CBOR documents, shared styles, data bindings, events, and nested pages.

Design a project in the browser, preview it on a connected device, and explicitly save it when ready. Load new screen descriptions without rebuilding firmware. The application registers the data sources, actions, and native components available to the editor.

Repository name: `NaCBORUIforLVGL`.

## Features

- Whole-project documents with screens, shared styles, and an entry screen.
- Bidirectional JSON/CBOR codecs and CSS import/export for supported styles.
- Typed symbolic data sources and actions, screen-owned bindings and events.
- Nested page instances with release, cache, or retain policies.
- Device capability discovery and live project updates over WebSocket.
- Separate preview and save operations; connecting or selecting a page does not change the device screen.
- An optional host-side MCP adapter using the existing device API and shared codecs.
- A browser simulator, a real LVGL Windows player, and an ESP32-S3 UI example.

## Try the editor

Requires Node.js 20.19+ or 22.12+ with npm.

```sh
npm ci
npm run sim
```

On Windows, `RunSimulator.cmd` also starts the simulator. The browser preview approximates layout with CSS; it does **not** execute LVGL. Hardware behavior must be checked on a device.

To run **real LVGL** on Windows, build the [desktop player](examples/windows_player/README.md), then use `npm run player -- interface.json` (or `.cbor`). It reuses the same CBOR runtime, bindings and events. The bundled demo includes real CPU/per-processor graphs, RAM and GPU load/memory through Windows SDK APIs. The application offers Light, Cream, Emerald and Dark schemes; switching shared styles preserves page instances and data. Add `--watch` to reload saved files. This target requires C++ Build Tools, CMake and the documented LVGL/TinyCBOR sources; it does not require ESP-IDF or a connected board.

```sh
npm test
npm run contract:check
npm run build
```

The optional MCP adapter has its own dependencies and tests:

```sh
npm --prefix integrations/mcp ci
npm --prefix integrations/mcp test
```

## Architecture and portability

The C++ runtime lives in `include/lvgl_cbor` and `src`; reusable JavaScript codecs live in `packages`. Board drivers, networking, data acquisition, and storage are application integrations. The core is not tied to ESP32, while the provided hardware example targets ESP32-S3 and depends on ESP-IDF and separate companion projects. Its HTTP/WebSocket server is **NaWServer** (formerly ESP32-yaidfws), expected in a sibling `NaWServer` directory. NaWServer is currently private, so building this example requires access; the browser simulator and portable core do not require that repository. See the [example setup](examples/s3_style_lab/README.md) before building firmware.

The target LVGL version is **9.6.0**. Screens use cursor-executed ABI v3; styles use ABI v2. JSON is the editable source and CBOR is the device representation. Application data names remain symbolic UTF-8 strings.

Existing identifiers `lvgl_cbor`, `LVGL_CBOR_*`, `@lvgl-cbor/*`, and browser draft keys are retained for compatibility. Renaming the project does not change the wire formats or ABI.

## Documentation

Most detailed guides are currently in Russian:

- [Documentation index](docs/README.md)
- [Windows player: real LVGL, JSON/CBOR and application data](examples/windows_player/README.md)
- [Projects, storage, API, and MCP](docs/readme_projects_ru.md)
- [SeMaps architecture maps and local MCP setup (Russian)](docs/readme_semaps_ru.md)
- [Data bindings and events](docs/readme_bindings_ru.md)
- [Nested pages and lifecycle](docs/readme_page_composition_ru.md)
- [Modules, file formats, CSS, and MCP](docs/readme_modules_files_css_mcp_ru.md)
- [Cursor executor and native components](docs/readme_fast_executor_ru.md)
- [Browser simulator](docs/readme_simulator_ru.md)
- [ESP32-S3 example](examples/s3_style_lab/README.md)
- [Third-party sources and provenance](docs/readme_sources_ru.md)

Implementation reviews in `docs/reviews` distinguish measured results from design proposals.

## License

Independently authored core code, codecs, and the MCP adapter are licensed under the [MIT License](LICENSE).

This repository also includes **GPL-3.0-only** frontend and ESP32-S3 example adaptations from ESP32-yaidfws, plus other third-party material. The example links the GPL NaWServer implementation; board/display and editor shell code also retain their GPL provenance. Their existing licenses and notices remain in effect; the repository as a whole must not be described as MIT-only. See [license scope and exceptions](LICENSES.md) and the [source register](docs/readme_sources_ru.md).
