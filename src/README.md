# Implementation

- `style_service.cpp`: application-owned style tiers, stable addresses, snapshot storage and explicit cache eviction.
- `capabilities.cpp`: compiled factory availability and application capability snapshot.
- `style_runtime.cpp`: named-style replacement/copy/merge; uses shared ABI v2.
- `style_dispatch.cpp`: typed pointer-array execution, shared by both runtimes.
- `screen_decode.cpp`: bounded CBOR envelope preflight, named style definitions and a borrowed root command cursor.
- `widget_registry.cpp`: application-owned runtime registration of native components.
- `include/lvgl_cbor/widget_execution.hpp`: typed argument decoding and calls shared with extensions.
- `widget_dispatch.cpp`: nested cursor execution, common commands, creation-time handler selection and ownership tracking.
- `screen_styles.cpp`: shared creation of owned styles through the independent style executor.
- `screen_runtime.cpp`: per-instance load/mount/commit/unload and lookup.
- `data_value.cpp`: owned scalar/object/array values, bounded CBOR codecs and schema validation.
- `data_registry.cpp`: application-owned source/action catalog, atomic snapshot batches, demand leases and bounded deferred events.
- `binding_expression.cpp`: bounded expressions and symbolic source/path resolution; no scripting language.
- `screen_bindings.cpp`: instance-owned bindings, replaceable native argument storage and weak event ownership.
- `cbor_reader.hpp`, `screen_internal.hpp`: private implementation types.
- `*_methods.inc`: generated from the versioned contracts; do not edit by hand.

See [the Russian runtime guide](../docs/readme_screen_runtime.ru.md). No global mutable parser or instance registry; no LVGL property-name dispatch.
