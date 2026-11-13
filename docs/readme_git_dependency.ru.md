# Подключение NaCBORUIforLVGL из Git

Закрепляйте один и тот же коммит для компонента ESP-IDF и генераторов Node.
Пример ниже проверен на ESP-IDF 5.5.6 и LVGL 9.6.0.

## Прошивка

В `idf_component.yml` компонента приложения:

```yaml
dependencies:
  espressif/cbor: "0.6.1~4"
  lvgl/lvgl: "9.6.0"
  nacboruiforlvgl:
    git: https://github.com/NaBrIks/NaCBORUIforLVGL.git
    version: 533c2df4f6caf4b7ee0165cf55901c9b6770afd3
```

Компонент расположен в корне репозитория. Манифест добавляет зависимость
приложения. Имя компонента в CMake — `nacboruiforlvgl`. Для PlatformIO задайте
`framework = espidf` и запускайте `pio run`. Сохраняйте `dependencies.lock`
для зависимостей из Git и реестра компонентов.

Для необязательного общего класса оформления из примеров добавьте в CMake
компонента приложения после `idf_component_register(...)`:

```cmake
idf_component_get_property(nacbor_dir nacboruiforlvgl COMPONENT_DIR)
target_sources(${COMPONENT_LIB} PRIVATE "${nacbor_dir}/examples/common/appearance/appearance.cpp")
target_include_directories(${COMPONENT_LIB} PRIVATE "${nacbor_dir}/examples/common/appearance")
```

Приложение владеет экземпляром `Appearance` и передаёт скомпилированную палитру.

## PlatformIO Library Manager

Для `framework = espidf` на Espressif 32 можно подключить Git-ревизию
с корневым `library.json` через `platformio.ini`:

```ini
lib_deps =
    https://github.com/NaBrIks/NaCBORUIforLVGL.git#<commit-with-library-json>
```

Из примера выше оставьте в `idf_component.yml` компонента приложения
`espressif/cbor: "0.6.1~4"` и `lvgl/lvgl: "9.6.0"`. Уберите запись
`nacboruiforlvgl`, а также `REQUIRES nacboruiforlvgl` и путь к этой библиотеке
в `EXTRA_COMPONENT_DIRS`, если они были. PlatformIO компилирует `src` и
подключает заголовки из `include`. ESP-IDF загружает и собирает LVGL и TinyCBOR.
Опции CMake и пример подключения общего класса оформления выше относятся
к варианту с компонентом ESP-IDF.

[Git-зависимости в PlatformIO](https://docs.platformio.org/en/stable/librarymanager/dependencies.html)

## Генерация интерфейса через Node.js

Подключите Git-подмодуль в `vendor/nacborui` проекта-потребителя и закрепите
тот же коммит, что в прошивке. Выполните `git submodule update --init`, затем
`npm ci --prefix vendor/nacborui`. Пакеты кодеков входят в npm workspaces
этого репозитория. Корневой lock-файл задаёт их зависимости.

Импорты из скрипта приложения в `tools/`:

```js
import {createProject, encodeProject, decodeProject}
  from '../vendor/nacborui/packages/project-codec/index.js';
import {roleStyles, compileSchemes}
  from '../vendor/nacborui/examples/common/appearance/schemes.mjs';
```

Готовый каталог палитр расположен в `examples/common/appearance/schemes.json`.
Если утилите нужно читать произвольный CBOR, она может объявить `cborg`
в своём npm-пакете и импортировать его по имени. Кодек проекта уже умеет
читать CBOR интерфейса.

[Справочник Git-зависимостей ESP-IDF](https://docs.espressif.com/projects/idf-component-manager/en/latest/reference/manifest_file.html#git-dependencies)
