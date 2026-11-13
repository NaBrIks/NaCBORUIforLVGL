# Runtime-registered native component

`meter.hpp` is ordinary application C++. One component-local switch dispatches methods 256 (`value`), 257 (`alarm`) and 258 (`reading`). `invoke_widget` decodes and consumes one argument value, then directly calls the selected function; no signature-indexed arrays or method descriptors are involved.

Register with `meter_example::register_meter(registry, compiler_json)` after constructing a ScreenRuntime with that registry. Supply the contents of `meter.json` as `compiler_json`, from an embedded literal or application storage. Publish the same registry with `runtime_capabilities_json(resources, count, limits, &registry)`.

The component is `example:meter`, ID 256, ABI `meter-1`. Methods are `value`, `alarm`, and `reading`, for example `{"reading":[42,"kPa"]}`. The PC receives its method metadata in capabilities.extensions and passes capabilities to encodeScreen/decodeScreen. `registry.remove(256)` prevents new instances; existing instances and their borrowed strings remain valid.

The factory and function code must already be available and remain loaded while instances exist. No executable code is received in CBOR. See `tests/native/screens.cpp`, `tools/extension_fixtures.mjs`, and [the execution guide](../../docs/readme_fast_executor.ru.md).

Screen ABI v3 creation accepts `[0, [256, "meter-1"], body]` or the registered name in place of 256. The handler is selected once per creation. It must consume exactly one CBOR argument value; the caller closes the enclosing command. Common commands 1..255 are handled by the runtime for every native component.
