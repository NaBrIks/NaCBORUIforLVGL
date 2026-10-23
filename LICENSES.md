# License scope and third-party notices

The root [MIT License](LICENSE) applies to independently authored NaCBORUIforLVGL code and documentation, including the C++ core (`include/lvgl_cbor`, `src`), JavaScript codecs (`packages`), and host MCP adapter (`integrations/mcp`). It does not replace third-party licenses or relicense adapted code.

| Material | License / notice |
| --- | --- |
| Frontend, including shell adaptations from ESP32-yaidfws | GPL-3.0-only; [frontend/LICENSE](frontend/LICENSE) |
| ESP32-S3 example, including board/display adaptations | GPL-3.0-only; [examples/s3_style_lab/LICENSE](examples/s3_style_lab/LICENSE) |
| Tabler icons bundled with the frontend | Preserve [the icon license notice](frontend/src/design/icons/LICENSE.txt) |
| LVGL-derived API reference material | MIT under the upstream LVGL notice; see the source register and generated reference provenance |
| External dependencies | Their own licenses and copyright notices; versions are recorded in lock files and the source register |

The GPL example uses the external NaWServer server (formerly ESP32-yaidfws) and optionally ESP32-yabt. These dependencies remain outside the portable core. Combining or distributing the example or frontend must retain their applicable GPL terms; the root MIT license does not remove them.

The [source and dependency register](docs/readme_sources_ru.md) records origins, versions, and notice locations. Existing upstream copyright notices must be preserved.
