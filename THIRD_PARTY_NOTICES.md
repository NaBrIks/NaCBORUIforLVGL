# Third-party notices

The root MIT license covers owner-authored code. Other rights and notices remain
in force as recorded in [LICENSES.md](LICENSES.md).

## RGB board reset/init portions: CC0-1.0

Scope: `examples/s3_style_lab/main/board.cpp`, through the owner's former
`ESP32-yaidfws/examples/touch_lcd7` adapter. Own integration is MIT; the referenced
reset/init portions are CC0-1.0. The file therefore uses `MIT AND CC0-1.0`.

Retained attribution: **2022 Espressif Systems (Shanghai) CO LTD**.
Pinned upstream: [waveshare_rgb_lcd_port.c at b30c6be50d3d60b9426f84439cd368fe0499dbeb](https://github.com/waveshareteam/ESP32-S3-Touch-LCD-7/blob/b30c6be50d3d60b9426f84439cd368fe0499dbeb/examples/ESP-IDF/08_lvgl_v8_demo/components/waveshare_rgb_lcd_port.c).
Full terms: [CC0 1.0 Universal](LICENSES/CC0-1.0.txt).
This per-file CC0 notice is distinct from the manufacturer's root Apache license;
it does not change the license of ESP-IDF or the external touch-driver components.

## Other retained material

- [Tabler icons notice](frontend/src/design/icons/LICENSE.txt): MIT, Paweł Kuna.
- [LilyGO notice](examples/lilygo_t_display_s3/NOTICE): MIT, Shenzhen Xinyuan
  Electronic Technology Co., Ltd.; the adapted file header is retained.
- LVGL reference/derived material, SDKs, fonts and npm dependencies: see the
  complete scope/version [register](docs/readme_sources_ru.md). Their licenses
  are not replaced with a project-author copyright header.
