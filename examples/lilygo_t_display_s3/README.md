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
adapter below. The default build is USB-only. The optional `lilygo-ws`
build adds Wi-Fi and NaWServer display streaming. Both use the same PARTIAL
rendering and local project.

## Build

The PowerShell build helper uses Windows directory junctions. Prepare
[PlatformIO and ESP-IDF 5.5.6](../../docs/readme_development_environment_ru.md),
install Node.js, and run `npm ci` from the repository root. Supply the pinned
ESP-IDF components `lvgl__lvgl` 9.6.0 and `espressif__cbor` 0.6.1~4.
If those components already exist under the Waveshare example's
`managed_components` directory, run `./examples/lilygo_t_display_s3/build.ps1`
without arguments to reuse them. For an independent build, pass the component
source directories explicitly:

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

## Optional Wi-Fi and WebSocket

Place a compatible [NaWServer](https://github.com/NaBrIks/NaWServer) checkout
in the `NaWServer` directory next to this repository. Copy
`main/wifi_secret.example.hpp` to the ignored `main/wifi_secret.hpp` and fill
in the local Wi-Fi station credentials. Build with
`./examples/lilygo_t_display_s3/build.ps1 -WebSocket`, reusing the component
paths from the USB build when needed. The application image
is in `.pio/build/lilygo-ws/firmware.bin`. USB remains available on this
build. The upper-right statusbar shows the assigned IPv4 address from the
`system.network.ip` binding. Without an address it shows a dash. USB
`inspect` also reports `wsAddress` after DHCP.

Add the board address as a **Direct API** connection in Designer. The
firmware advertises a preview-only connection via `GET /api/info`. Frame
streaming uses the existing `/api/view/ws` LVF2 protocol, with binary RGB565
strips and a scene identifier. Pointer input uses `POST /api/view/input`
with the existing CBOR command. Use the Wi-Fi preview on a trusted local
network with one viewer. NaWServer retains bounded TX storage. A page
change sends `cancel` for an in-flight update, and the next request gets a
full frame. The server keeps the socket open while waiting for changes.

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

`inspect` also reports `mode: partial`, `buffers: 2`, `pixelFormat: RGB565`
and `transfer: band`. The optional USB `frame_band` request takes `y`, `rows`
(1–6) and `passive`. The LVGL task first observes normal PARTIAL flushes. If
`passive` is false, it can invalidate the requested band after at least 15 ms
with an idle gap of 20 ms, or at 35 ms if ordinary drawing is continuous.
A page change cancels an unfinished band, and the next band carries the
new scene ID. Passive requests expire after
500 ms without causing a redraw. The reply is a diagnostic JSON line with
`frameBytes`, immediately followed by the binary LVF1 packet. At most one
4,128-byte packet and a 256-byte coverage mask are retained. The host can
assemble a full RGB565 image from 29 requests. The MCU uses the existing two
DMA strip buffers and captures before the i80 driver swaps bytes for ST7789.
The capture does not read the LCD's GRAM.

```powershell
node examples/lilygo_t_display_s3/tools/partial-hardware.mjs '<device-port>' '<python>'
```

The Windows Designer can capture the actual display directly. Select the
T-Display-S3 USB profile, enter the COM port, and connect. Designer polls
`view_state` over the open serial connection. Its scene ID changes when the
project changes page, and its damage counter advances on ordinary LVGL flushes.
Capture-only redraws do not advance that counter. Designer requests a new
update only when either value changes or Refresh is pressed. Normal
PARTIAL flushes mark intersected six-row bands with their latest revision.
Both transports select only those bands newer than the viewer's revision.
A new scene or explicit Refresh selects all 29 bands. Each selected band is
read during flush; if its pixels have already been reused in the DMA strip,
LVGL redraws just that band for capture. The same capture buffer is leased
to one sender at a time. The previous frame remains visible during transfer. `view_input` takes display-pixel coordinates
`x`, `y` and a boolean `pressed` and uses the shared LVGL pointer.
See [Designer connections](../../docs/readme_designer_connections_ru.md#t-display-s3-по-usb).

Hardware measurements on one T-Display-S3 with RGB565. Times run from
the host request to completion. Deltas were isolated speed updates of
15 → 18 km/h on USB and 18 → 21 km/h on WS.

| Transfer | Bands | Decoded pixel bytes | First band | Complete |
| --- | ---: | ---: | ---: | ---: |
| USB full | 29 | 108,800 | 122 ms | 1,858 ms |
| USB speed | 11 | 42,240 | 124 ms | 743 ms |
| WS full | 29 | 108,800 | 58 ms | 950 ms |
| WS speed | 10 | 38,400 | 85 ms | 386 ms |
| WS page change | 29 | 108,800 | 77 ms | 944 ms |

Both deltas reproduced the pixels of a fresh full capture. A pointer click
after the third WS packet cancelled the old scene after four bands; the
next update sent the new scene in full. The bound statusbar text matched
the address assigned by DHCP. Windows Designer was checked on both saved
connections. Pointer navigation produced full frames, the live generator
produced smaller updates, and the visible canvas was not cleared on a
page change.

The current PlatformIO application images are 1,019,904 bytes for `lilygo`
and 1,672,464 bytes for `lilygo-ws`. The WS build includes Wi-Fi, lwIP and
NaWServer. Sizes exclude the bootloader and partition files.

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
