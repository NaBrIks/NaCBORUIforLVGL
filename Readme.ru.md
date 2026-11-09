# NaCBORUIforLVGL

[English](Readme.md) · Русский

**CBOR-based UI definitions for LVGL** — описания интерфейсов LVGL на основе CBOR.

Динамические интерфейсы LVGL из редактируемого JSON и скомпилированного CBOR:
экраны, общие стили, типизированные биндинги, события и вложенные страницы.
Редактор, MCP и Windows launcher используют общие кодеки; Windows и МК исполняют
одно ядро C++. Само ядро не привязано к ESP32.

Канонический репозиторий: [NaBrIks/NaCBORUIforLVGL](https://github.com/NaBrIks/NaCBORUIforLVGL).
Он приватный; для клонирования нужен разрешённый доступ.

## Модули и лицензии

| Часть | Назначение | Лицензия |
| --- | --- | --- |
| `include/lvgl_cbor`, `src` | Ядро C++17, стили, DataRegistry, ProjectService и хранилища | MIT |
| `packages` | JSON/CBOR-кодеки экранов/проектов/стилей и поддерживаемый CSS | MIT |
| `integrations/mcp` | Необязательный host stdio MCP-адаптер поверх API устройства | MIT |
| `examples/common` | Общие Appearance, демонстрационные источники/действия и изображение | MIT |
| `examples/windows_player` | Настоящий LVGL Win32, схемы и обзор CPU/RAM/GPU | MIT |
| `examples/lilygo_t_display_s3` | Независимый пример ST7789 T-Display-S3 | MIT с сохранённым upstream NOTICE |
| `frontend`, `examples/s3_style_lab` | Собственная оболочка редактора и RGB/touch-демка владельца | MIT; сторонние исключения в [реестре](LICENSES.md) |

Реализации Bluetooth и их примеры принадлежат своим проектам и UI-ядру не нужны.
Шрифты ОС, готовые SDK и сборки не включены. Сторонние библиотеки сохраняют
собственные лицензии и уведомления.

## Возможности и API

- Документ JSON/CBOR целиком: экраны, общие стили и стартовая страница.
- `ProjectService`: загрузка по имени, раздельные preview/save, база проекта и
  необязательное хранилище изменений. Подключение и выбор страницы пассивны.
- `DataRegistry`: символьные типизированные источники/действия. Приложение публикует
  принадлежащие реестру снимки либо CBOR; биндинги вызывают методы виджетов в UI-контексте.
- Страницы владеют биндингами/событиями и дочерними экземплярами. Политики:
  освобождение, кэширование, удержание. Неактивные биндинги могут быть на паузе;
  последнее значение и ограниченная история остаются у источника.
- `WidgetRegistry`: регистрируемые приложением нативные компоненты и их каталог.
- Возможности устройства, обновления WebSocket; host MCP использует общие API/кодеки.
- Настоящий LVGL Windows, изменение размера, Grid/Flex, четыре схемы и системные
  показатели через Windows SDK без SDK производителей GPU.

Приложение инициализирует LVGL/ресурсы, регистрирует источники/действия, создаёт
ProjectService и загружает скомпилированный проект. Работа реестра/LVGL сериализуется
в UI-контексте. См. [биндинги](docs/readme_bindings_ru.md),
[проекты/API](docs/readme_projects_ru.md) и [заголовки](include/lvgl_cbor/README.md).
Общие модули примеров доступны как исходники внешним приложениям, но корневой
IDF-компонент не подключает их автоматически.

## Сборка из чистого checkout

```sh
gh repo clone NaBrIks/NaCBORUIforLVGL
cd NaCBORUIforLVGL
npm ci
npm test
npm run contract:check
npm run build
```

GitHub CLI либо Git должен иметь доступ к репозиторию. Требование закреплённого
Vite к Node.js: `^20.19.0 || >=22.12.0`. `npm run sim` собирает редактор и запускает native target с NaWServer,
в Windows также есть `RunSimulator.cmd`. Этот CSS-предпросмотр **не исполняет LVGL**.

Для нативных тестов и Windows-проигрывателя нужны Visual Studio C++ Build Tools
с Windows SDK, CMake 3.24+, Git и Node.js. Зависимости LVGL, TinyCBOR и NaWServer скачиваются явно;
подготовленная S3-демка и ESP-IDF для этого варианта не нужны:

```powershell
git clone --depth 1 --branch v9.6.0 https://github.com/lvgl/lvgl.git local/deps/lvgl
git clone --depth 1 --branch v0.6.1 https://github.com/intel/tinycbor.git local/deps/tinycbor
git clone --depth 1 https://github.com/NaBrIks/NaWServer.git local/deps/NaWServer
./tools/test_native.ps1 -LvglSource "$PWD/local/deps/lvgl" -TinyCborSource "$PWD/local/deps/tinycbor"
./examples/windows_player/build.ps1 -LvglSource "$PWD/local/deps/lvgl" -TinyCborSource "$PWD/local/deps/tinycbor"
npm run player
npm run player:test
npm run player:test-system
npm run player:test-resize
```

Коммиты тегов: LVGL `80ca777e37a2b176770726a02e07a6fb79ef0b39`,
TinyCBOR `1e8296f94e40c6ac976d4c5a7b1db7f45978a83f`.
Открытие файла: `npm run player -- interface.json` либо `.cbor`, с `--watch` —
подхват сохранённых правок. Для GPU нужен подходящий Windows/WDDM-драйвер;
отсутствующие показатели не подменяются нулём. См. [руководство](examples/windows_player/README.md).

Необязательный MCP-адаптер имеет отдельный lock-файл и тесты:

```sh
npm --prefix integrations/mcp ci
npm --prefix integrations/mcp test
```

## Аппаратные интеграции

RGB S3-пример требует ESP-IDF 5.5.6, закреплённые managed components и отдельный
checkout **NaWServer** в соседней папке с разрешённым доступом. Корневой IDF-
компонент ожидает зависимости под именами `lvgl`/`cbor`; примеры содержат нужные
адаптеры имён и интеграцию. SDK/toolchain и приватные Wi-Fi-настройки задаёт приложение.
См. [RGB-пример](examples/s3_style_lab/README.md),
[T-Display-S3](examples/lilygo_t_display_s3/README.md) и
[среду разработки](docs/readme_development_environment_ru.md).
Успешная сборка на ПК не доказывает поведение LCD/touch. Deploy/hardware-smoke
меняют настоящее устройство и запускаются только на разрешённой плате.

## Границы

Цель — **LVGL 9.6.0**, курсорный ABI экранов **v3**, стили **v2**. Идентификаторы
`lvgl_cbor`, `LVGL_CBOR_*`, `@lvgl-cbor/*` сохранены. Имена данных — символьные строки
UTF-8. Число объектов, размеры значений, вложенность и очереди ограничены
контрактами/capabilities. Проект не загружает новый исполняемый код, датчики или
незарегистрированные нативные компоненты.

Биндинги — ограниченные выражения, не скрипты. Автогенерация строк массива, все
виджеты LVGL и произвольный HTML/CSS не обещаются. Windows явно выбирает
`ScreenViewport::Display`; `Declared` с проверкой размера остаётся режимом по
умолчанию. Пиксельную разметку чужого проекта нужно отдельно сделать адаптивной.
Проигрыватель раздаёт построенный редактор и HTTP/WS API через NaWServer.
[Датированные отчёты](docs/reviews/README.md) отделяют проверки ПК от аппаратных.

`npm run player:graphics` открывает отдельную страницу графики Windows-демки:
настоящие LVGL BIN/PNG/JPEG/BMP/GIF/SVG, пиксельные форматы и сравнение кривых.
[Руководство](docs/readme_graphics_ru.md); профиль галереи отключается через
`LVGL_CBOR_GRAPHICS_GALLERY=OFF`.

## Документация, лицензии и поддержка

[Указатель](docs/README.md), [вложенные страницы](docs/readme_page_composition_ru.md),
[MCP](integrations/mcp/README.md), [SeMaps](docs/readme_semaps_ru.md),
[источники и notices](docs/readme_sources_ru.md).

Для C/C++ принят [Uncrustify 0.83.0_f](agents/code_style.ru.md) с неизменённым
профилем NaWServer в `uncrustify.cfg`. Перед проверкой изменений выполнить
`.\uncrustify-check.cmd`; форматирование — `.\uncrustify-apply.cmd`,
справка — `.\uncrustify-apply.cmd --help`.
Генерируемые/сторонние файлы и другие языки исключены.

Собственный код — [MIT](LICENSE), включая собственные frontend/RGB-файлы,
ранее предложенные под GPL. Основание — прямое решение правообладателя
2026-10-30, а не перенос репозитория или изменение истории. Сторонние код,
иконки Tabler, параметры/уведомления LilyGO, справочники LVGL и внешние библиотеки
сохраняют свои условия. См. [реестр исключений](LICENSES.md); подтверждённые
сторонние copyright notices не заменяются.

Вклад в проект и добровольные донаты приветствуются. Платёжная ссылка не настроена;
донат необязателен и не меняет лицензионные условия.

Реестр содержит группы, описания и единицы измерения, выдаёт ограниченные страницы
через существующий HTTP/MCP API. Необязательный `DataHistory` публикует обычные
источники независимо от времени жизни страницы. См.
[каталог и историю](docs/readme_data_catalog_ru.md).
Проверка настоящего Windows LVGL и MCP: `npm run player:test-catalog`.

Собственные схемы через существующие MCP-операции проекта и стек стилей: [руководство](docs/readme_appearance_ru.md).

`npm run player` запускает также постоянный loopback API на `http://127.0.0.1:5300`.
Проектный MCP `nacborui_windows` использует тот же адаптер, что и устройство;
preview, сохранение с revision, стили, биндинги и события исполняются общими
нативными сервисами. Проверка: `npm run player:test-api`.
См. [Windows API](docs/readme_windows_api_ru.md).

- [Графика LVGL: форматы изображений, кривые и цена на МК](docs/readme_graphics_ru.md)

- [Две Windows-демки, нативный просмотр и внешний Designer](docs/readme_graphics_ru.md)

### MAUI-конструктор

[Штатное приложение Windows/Android](docs/readme_maui_designer_ru.md) поставляется
в `tools/designer`, отдельно от примеров: отображение
Blazor Hybrid, история/модель/MCP из SPLA. Для первого телефонного прототипа
используется native NaWServer MCP gateway к Windows LVGL; прямой MCP МК и голос
остаются планом.
