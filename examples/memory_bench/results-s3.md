# ESP32-S3 screen loading and memory benchmarks

[Detailed report and raw measurement tables in Russian](results-s3.ru.md)

Tests ran on a 7″ ESP32-S3 at 240 MHz with ESP-IDF 5.5.6 and LVGL 9.6.0.
The two comparison scenes each contain 100 nodes. The baseline uses
debug-friendly compiler optimization and matches the SDK configuration
between direct LVGL and CBOR for each scene. Screen construction time
covers the build and activation calls. The first render is measured separately.

| Original paired benchmark | Direct LVGL | CBOR | CBOR / direct |
| --- | ---: | ---: | ---: |
| Repeated widgets | 63.37 ms | 195.82 ms | 3.09× |
| Varied widgets | 69.90 ms | 209.78 ms | 3.00× |

The first-frame hashes matched within each pair. CBOR lets applications
load different screen definitions with the same firmware. The tables
measure screen construction and do not measure subsequent binding updates.

## What we tested

| Experiment | Result on this board |
| --- | --- |
| Reuse identical inline styles as named styles | Repeated scene: 100 → 23 style objects, 140.89 → 134.26 ms, about 6 KiB more free PSRAM after construction. Varied scene: 100 → 58, 154.98 → 152.23 ms, about 3.3 KiB more free PSRAM. Full-frame hashes matched. |
| Trusted loading of firmware-embedded CBOR | Saved about 5 ms against checked loading on both the 100-node scene and the full demo's initial nested screen. Editor uploads and storage changes still use checked loading. |
| Pre-scan the trusted CBOR envelope | Removed after the test. Recursively skipping `root` alone cost about 5.14 ms before command execution. Ordinary TinyCBOR field lookup was restored. |
| Compile out command-length checks | With size optimization, saved 0.82 ms across screen construction and 114 B in our linked code and constants. With speed optimization, saved 514 B and added 2.87 ms. Static RAM was identical within each pair. Neither scene exercised local named-style key checks. |
| Optimize the whole build for speed | With checks enabled, saved 3.60 ms on construction. The application image grew by 100.4 KiB, including about 9 KiB in NaCBORUIforLVGL and 79 KiB in LVGL. |
| Optimize only the decoder and dispatch source files for speed | Saved 0.71 ms on total construction. Our linked code and constants grew by about 5.2 KiB. The first-frame hash matched. |

The object-creation timer includes both our CBOR executor and the LVGL
calls it makes. It does not isolate the cost of either layer. The phase
times above come from separate paired experiments, each with its own
configuration. The linked size breakdown for the size-optimized checked
baseline used a rebuild whose application file differed by 400 B.

## Conclusion

Reuse named styles where they repeat. Keep the normal trusted loading
path for firmware-embedded screens and checked loading for editor
uploads. Keep the current compiler and validation defaults. The smaller
experiments showed less than a millisecond of end-to-end gain with size
optimization. If page changes become visibly slow, measure time from
input to the first visible frame on that screen before changing the executor.

The [14-stage matrix](results-s3.ru.md#итоговый-прогон-после-оптимизаций)
records application Flash, static RAM, free RAM and PSRAM, and time to the
first frame from boot. The complete benchmark with editor and display
feedback used 1,850,912 B of application Flash and 43,876 B of static RAM.
HTTP delivered a frame. The WebSocket check stopped at connection setup
in that run.
