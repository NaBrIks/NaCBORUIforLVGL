# Shared example modules (MIT)

These are optional application modules, outside the portable UI engine:

- `appearance`: stable named style roles, palette preparation using the existing
  project/style executor, and the standard LVGL dropdown popup theme extension.
  Input is a `ProjectBytes` span, either borrowed ROM or an owned desktop buffer.
  No filesystem, operating-system font, board or network dependency.
- `demo_data`: bounded demonstration sources/actions and an autonomous 25 Hz
  speed producer. Data enters the ordinary registry through CBOR. Local clock
  conversion uses the platform's libc; this module does not configure NTP.
- `layout_debug`: optional diagnostics for object outlines and tree depth.
- `native_view`: shared display transport metadata, frame helpers and bounded pointer queue.
- `sample_image.hpp`: a generated 18×18 alpha checker for component tests.

The Windows, 7-inch RGB S3 and T-Display-S3 examples reuse these modules where
applicable. Each example owns its display, input, storage and network adapters.
The shared color catalog lives in `appearance/schemes.json` and uses
the shared project codec.
