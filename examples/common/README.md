# Shared example modules (MIT)

These are optional application modules, outside the portable UI engine:

- `appearance`: stable named style roles, palette preparation using the existing
  project/style executor, and the standard LVGL dropdown popup theme extension.
  Input is a `ProjectBytes` span, either borrowed ROM or an owned desktop buffer.
  No filesystem, operating-system font, board or network dependency.
- `demo_data`: bounded demonstration sources/actions and an autonomous 25 Hz
  speed producer. Data enters the ordinary registry through CBOR. Local clock
  conversion uses the platform's libc; this module does not configure NTP.
- `sample_image.hpp`: a generated 18×18 alpha checker for component tests.

Windows and T-Display-S3 link these exact sources. Windows owns file loading,
Segoe UI and its menus; the MCU owns LCD/buttons and its USB diagnostic transport.
These examples do not introduce another renderer, binding interpreter or theme
engine. The shared color catalog remains in `../windows_player/schemes.json` and
is compiled by the same `schemes.mjs` for both targets.
