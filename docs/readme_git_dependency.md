# Consume NaCBORUIforLVGL from Git

Use the same pinned Git commit for the ESP-IDF component and the Node tools.
The example below uses a revision tested with ESP-IDF 5.5.6 and LVGL 9.6.0.

## Firmware

In the application component's `idf_component.yml`:

```yaml
dependencies:
  espressif/cbor: "0.6.1~4"
  lvgl/lvgl: "9.6.0"
  nacboruiforlvgl:
    git: https://github.com/NaBrIks/NaCBORUIforLVGL.git
    version: 533c2df4f6caf4b7ee0165cf55901c9b6770afd3
```

The component lives at the repository root. The manifest adds the application
dependency to ESP-IDF. Use `nacboruiforlvgl` as its CMake component name. With
PlatformIO, the environment uses `framework = espidf` and the normal build is
`pio run`. Keep the generated `dependencies.lock` for Git and registry dependencies.

For the optional shared demo appearance class, add the following to the
application component's CMake file after `idf_component_register(...)`:

```cmake
idf_component_get_property(nacbor_dir nacboruiforlvgl COMPONENT_DIR)
target_sources(${COMPONENT_LIB} PRIVATE "${nacbor_dir}/examples/common/appearance/appearance.cpp")
target_include_directories(${COMPONENT_LIB} PRIVATE "${nacbor_dir}/examples/common/appearance")
```

The application owns the `Appearance` instance and supplies the compiled palette.

## PlatformIO Library Manager

An alternative for `framework = espidf` on Espressif 32 is to put the Git
revision containing the root `library.json` in `platformio.ini`:

```ini
lib_deps =
    https://github.com/NaBrIks/NaCBORUIforLVGL.git#<commit-with-library-json>
```

Keep only `espressif/cbor: "0.6.1~4"` and `lvgl/lvgl: "9.6.0"` from the above
example in the application component's `idf_component.yml`. Remove the
`nacboruiforlvgl` entry and any CMake `REQUIRES nacboruiforlvgl` or
`EXTRA_COMPONENT_DIRS` entry for this library. PlatformIO compiles the
library's `src` with the public headers in `include`. ESP-IDF still
resolves and builds LVGL and TinyCBOR for the application. The CMake
feature options and the optional shared demo appearance recipe above
apply to the ESP-IDF component route.

[PlatformIO Git library dependencies](https://docs.platformio.org/en/stable/librarymanager/dependencies.html)

## UI generation with Node.js

Keep a Git submodule at `vendor/nacborui` in the consuming project and pin it to
the same commit as the firmware dependency. Initialize it with
`git submodule update --init` and run `npm ci --prefix vendor/nacborui`.
The codec packages are npm workspaces of this checkout. The root lockfile
installs their complete dependency graph.

From an application script in `tools/`:

```js
import {createProject, encodeProject, decodeProject}
  from '../vendor/nacborui/packages/project-codec/index.js';
import {roleStyles, compileSchemes}
  from '../vendor/nacborui/examples/common/appearance/schemes.mjs';
```

The default palette catalog is `examples/common/appearance/schemes.json`.
Tools that read raw CBOR can declare `cborg` directly in their own npm package
and import it by package name. The ProjectCodec already decodes project CBOR.

[ESP-IDF Git manifest reference](https://docs.espressif.com/projects/idf-component-manager/en/latest/reference/manifest_file.html#git-dependencies)
