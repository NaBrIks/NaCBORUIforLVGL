# Classic and cockpit interfaces

[Русский](cockpit.ru.md)

The 7″ S3 demo project starts with the classic TPMS / GPS, Radar, Trip and
Setup tabs. Press **FLT** in the lower-right corner to replace the entire
visible interface with the cockpit. Press **STD** in the same corner to
return to the classic interface and its selected tab.

The cockpit includes a demo tyre-pressure panel, the existing radar
widget and a radio-style panel bound to system time and the device IP.
The **LCD / LED** switch changes the pressure readout style. The brushed
metal effect uses gradients and thin lines. Each screw uses the same
circular head and a slot drawn at a different angle.

The stock demo generator adds the layouts using ordinary LVGL objects,
styles, bindings and navigation events. The full demo catalog contains
both layouts. The catalog can also be previewed through the project API.
See the [Russian board guide](README.md) for building the stock catalog.

Native LVGL verification renders both cockpit readout styles and checks
the switch in both directions. To repeat it, generate the fixtures with
`node tools/native_widget_fixtures.mjs` and run the native widget test
with the fixture directory and `--interfaces`.

The Waveshare 7″ S3 hardware check used pointer input at the display
coordinates to run Radar → FLT → LCD → LED → LCD → STD. STD restored Radar.
The board’s LVGL frames confirmed the change in digit and background colors.
Diagnostics reported zero binding errors and the same boot ID throughout.
Physical LCD output is verified separately at the panel.
