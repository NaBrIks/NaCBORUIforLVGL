# License scope and third-party exceptions

The root [MIT License](LICENSE) applies to project-owned NaCBORUIforLVGL code:
the C++ core, codecs, MCP/device adapters, frontend, shared modules, Windows player
and both hardware examples. Copyright: **2026 Oleg Kozhevnikov**, as confirmed by
the owner. The owner explicitly selected MIT for his code on 2026-10-30, including
his earlier ESP32-yaidfws frontend/RGB adaptations previously offered under GPL.
Their provenance comments remain; the nested [frontend license](frontend/LICENSE)
and [RGB example license](examples/s3_style_lab/LICENSE) now contain MIT.
Earlier Git revisions retain their historical licensing records. A repository
transfer or history rewrite by itself is not a relicensing operation.

## Exceptions and retained notices

| Material | Terms and location |
| --- | --- |
| Tabler SVG/CSS/webfont assets in `frontend/src/design/icons` | Upstream MIT; copyright 2020-2024 Paweł Kuna, original [LICENSE.txt](frontend/src/design/icons/LICENSE.txt). Do not replace with the project author's header. |
| Adapted T-Display-S3 panel parameters in `examples/lilygo_t_display_s3/main/board.cpp` | Upstream MIT, copyright 2024 Shenzhen Xinyuan Electronic Technology Co., Ltd.; full [NOTICE](examples/lilygo_t_display_s3/NOTICE) and file header retained. |
| LVGL-derived API names/signatures/reference text in generated contracts/catalogs | Upstream LVGL MIT notice; provenance/SHA records and [source register](docs/readme_sources_ru.md). Generated files are not relabelled as solely project-authored. |
| LVGL and TinyCBOR sources | External dependencies under their own MIT notices, not vendored here. |
| Montserrat font data supplied by LVGL | Preserve the applicable font license from the selected LVGL dependency when distributing it; project headers do not replace font licenses. |
| ESP-IDF and managed touch drivers | External dependencies with their own licenses/notices, including Apache-2.0; see [source register](docs/readme_sources_ru.md). |
| Vue, cborg, Vite, MCP SDK and transitive npm dependencies | Their own package licenses; versions/integrities are recorded in lock files. |
| Installed Windows Segoe UI | OS font is read at runtime, never copied into this repository or bundled. Windows licensing is not replaced by MIT. |
| NaWServer | Separate owner project/dependency; use the license of the selected revision. |

Generated files, assets, third-party material and strict JSON do not receive
invented project-author copyright comments. Maintained project source headers
use `SPDX-License-Identifier: MIT` and the confirmed author/year; the full terms
remain in LICENSE. Historical confirmed notices are retained.

MIT allows commercial use and sale subject to its notice requirements.
Voluntary donations do not change licensing or third-party obligations.
No payment account or donation URL is configured in this repository.
