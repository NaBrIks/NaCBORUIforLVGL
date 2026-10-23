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
