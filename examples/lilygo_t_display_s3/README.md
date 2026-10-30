# T-Display-S3 CBOR UI example (MIT)

An independent 320×170 landscape example for the **standard ST7789 T-Display-S3**.
It uses ESP-IDF 5.5.6, LVGL 9.6.0 and TinyCBOR 0.6.1. The AMOLED and T3-S3 OLED
boards need different drivers. Board wiring/initialization provenance is in
[NOTICE](NOTICE); GPL RGB-board/editor code is not included.

The three nested pages contain every current standard contract type: `obj`,
`label`, `button`, `bar`, `slider`, `arc`, `line`, `image`, `checkbox`, `switch`,
`textarea`, `dropdown`. The layout is authored at its real size, not scaled down
from the Windows 800×480 demo. Status and bottom navigation stay outside the
124-pixel page container.

The four color schemes use the exact shared `examples/common/appearance`
implementation and catalog used by Windows. The speed source/actions also use
the shared `examples/common/demo_data`. Page composition, caching, binding
updates and events execute the existing portable core. The navigation executor
sets selected button states; the application does not maintain another UI model.

GPIO0 selects the next page. GPIO14 selects the next scheme. No touch controller
is assumed. Individual controls can be exercised through the USB diagnostic
adapter below. This is an offline demo: it does not start Wi-Fi, Bluetooth,
HTTP/WS, MCP or NTP services and contains no network credentials.

## Build

Install the same PlatformIO/ESP-IDF/toolchain baseline documented by the project,
Node.js and root npm dependencies. Provide pinned source components for
`lvgl__lvgl` 9.6.0 and `espressif__cbor` 0.6.1~4. By default the build reuses
already downloaded components under the RGB example; it does not build or flash
that example. Independent component directories can be supplied explicitly:

```powershell
./examples/lilygo_t_display_s3/build.ps1 `
  -LvglComponentSource '<deps>/lvgl__lvgl' `
  -CborComponentSource '<deps>/espressif__cbor'
```

The helper creates ignored directory junctions to those source directories.
PlatformIO needs their paths inside this project's component tree to preserve
distinct source filenames. Two tiny CMake aliases map the core's short library
names to those pinned components. The component manager is disabled for this
build because all required sources are explicitly supplied.

`build.mjs` compiles editable `demo.json` and the shared palette catalog through
the existing PC codecs into ignored `main/project.generated.hpp`. The MCU receives
CBOR; it contains no second JSON parser. Generated SDK settings, `.pio`, linked
dependencies and firmware images remain ignored.

Firmware output: `.pio/build/lilygo/{bootloader.bin,partitions.bin,firmware.bin}`.
Install the full image set at offsets `0x0`, `0x8000`, `0x10000` respectively,
using the generated flash mode/frequency. Identify the actual chip/MAC and board
before writing. Erase only when the owner authorizes it. There is no automatic
flash step in the build helper.

## USB control and verification

USB Serial/JTAG accepts a 4-byte little-endian length followed by a CBOR request.
Payloads are limited to 4096 bytes; the receive storage is a fixed 4100-byte array.
Commands are dispatched in the LVGL task. Replies are diagnostic JSON lines
prefixed with `@ui `; they share stdout with normal ESP-IDF boot logs.

Supported operations: `inspect`, `scheme`, `publish`, `write` (whole source),
`invoke`, `click`, and in-process LVGL `event` (`pressed`, `released`, `key`).
They call ProjectService, DataRegistry and native LVGL handlers; the transport
does not execute bindings itself. `inspect` reports actual page instances,
requested node bounds/state/values, source snapshots and LCD transfer count.

Install pyserial in the Python environment used by the helper. Example:

```powershell
node examples/lilygo_t_display_s3/tools/hardware.mjs --port '<device-port>' --python '<python>'
```

The test exchanges CBOR with the real MCU, checks four schemes, ON/OFF and
writeback events, all page bounds, retained instances and continued publication
while hidden. It leaves Home/Cream with the speed generator running. It does
not reset, flash or press a physical button. The deliberate invalid-scheme
test produces one expected rejected action, distinguished from binding errors.

The same project can also be opened with the Windows player (rebuild it after
adding the shared modules/resources). Test all three pages and four palettes in
hidden real LVGL windows without OS input or activation:

```powershell
node examples/lilygo_t_display_s3/test-preview.mjs '<player.exe>'
```

Built-in Montserrat 12/14/20/28 and the shared small image are registered
resources. The compact labels use English; no installed Windows font is copied
into the firmware. Registry metadata remains UTF-8, including Russian palette
titles. Camera verification is separate from serial assertions; original device
identifiers, USB logs and photos belong in ignored local storage.

[Проверка настоящего дисплея](../../docs/reviews/REVIEW_20261030_lilygo.md)
