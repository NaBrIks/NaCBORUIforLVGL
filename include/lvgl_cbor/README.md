# Public headers

`style_runtime.hpp` contains the original named StyleRuntime and typed Resource registry.
`screen_runtime.hpp` contains independent ScreenRuntime instances with load/mount/unload/find.
`contract.hpp` and `screen_contract.hpp` are generated ABI fingerprints.
`binding_contract.hpp` is generated from `contracts/binding-api-v1.json`.
`data_registry.hpp` owns typed source/action schemas and snapshots. Publication queues complete
source replacements; `flush()` commits the batch before notifying screen bindings. All registry
operations run in the application's serialized UI context. The registry outlives its runtimes;
cross-task delivery belongs to the application adapter. Demand leases are independent of NVS.

All LVGL operations and destruction occur in the application's UI context. Each mounted instance owns its tree and retained input data; externally supplied Resource pointers remain owned by the application.

See [the runtime guide](../../docs/readme_screen_runtime_ru.md).

`style_service.hpp` owns the shared static/dynamic global registry and screen scopes. Runtimes may share an explicitly application-owned service; the service outlives those runtimes. `capabilities.hpp` publishes the compiled catalog and application resource/layout/transport constraints. See docs/readme_runtime_services_ru.md for lifetime, cache and canonical roundtrip rules.

`DataRegistry` also exposes immutable `DataView` pages for group/source/action/field/value
queries. Descriptors carry group, title, description and units; schemas may be nullable.
`data_history.hpp` is optional (`LVGL_CBOR_HAS_HISTORY`), application-owned and explicitly
ticked; it publishes ordinary readonly time-series sources. See
[the catalog and history guide](../../docs/readme_data_catalog_ru.md) for bounds and ownership.

FileProjectSource and FileProjectStore paths are UTF-8. Windows opens them through
wide CRT paths; other platforms keep their native fopen integration. The Windows
HTTP adapter invokes the same ProjectService preview/save/show/reset methods and
serializes native UI work through the existing player bridge.

LayoutDebugOptions controls transient native-style diagnostics: independent outlines/digits, opacity and all or selected actual LVGL tree depths. ScreenRuntime/ProjectService preserve it through page loading/refresh; it does not enter project JSON/CBOR. See docs/readme_layout_debug_ru.md.

LayoutDebugOptions::layout_type selects a large G/F marker instead of the depth digit.
The enabled debug pass reads the effective LVGL layout through its public getter;
objects without Grid/Flex receive no type marker. Shared masks remain immutable
A1 resources (twelve 16x16 masks, 384 bytes). Diagnostic styles do not set layout.
