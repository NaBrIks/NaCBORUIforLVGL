# NaCBORUIforLVGL

[English](Readme.md) · Русский

**CBOR-based UI definitions for LVGL** — описания интерфейсов LVGL на основе CBOR.

Динамические интерфейсы LVGL из редактируемого JSON и скомпилированного CBOR:
экраны, общие стили, типизированные биндинги, события и вложенные страницы.
Редактор и Windows launcher используют общие кодеки; Windows и МК исполняют
одно ядро C++. Само ядро не привязано к ESP32.

Канонический репозиторий: [NaBrIks/NaCBORUIforLVGL](https://github.com/NaBrIks/NaCBORUIforLVGL).
Он приватный; для клонирования нужен разрешённый доступ.

## Модули и лицензии

| Часть | Назначение | Лицензия |
| --- | --- | --- |
| `include/lvgl_cbor`, `src` | Ядро C++17, стили, DataRegistry, ProjectService и хранилища | MIT |
| `packages` | JSON/CBOR-кодеки экранов/проектов/стилей и поддерживаемый CSS | MIT |
| `examples/common` | Общие схемы, демоданные, диагностика раскладки и передача кадров | MIT |
| `examples/windows_player` | Настоящий LVGL Win32, схемы и обзор CPU/RAM/GPU | MIT |
| `examples/lilygo_t_display_s3` | Независимый пример ST7789 T-Display-S3 | MIT с сохранённым upstream NOTICE |
| `frontend`, `integrations/nawserver` | Веб-редактор и нативные HTTP/WS-адаптеры | MIT; сторонние уведомления в [реестре](LICENSES.md) |
| `examples/s3_style_lab` | 7″ RGB/touch-демо, вложенные страницы и диагностика дисплея | MIT с сохранёнными сторонними уведомлениями |
| `tools/designer` | Штатный конструктор Windows/Android, отдельно от примеров | MIT; внешняя зависимость от исходников SPLA |

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
- Возможности устройства и обновления WebSocket через нативный NaWServer API.
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
Vite к Node.js: `^20.19.0 || >=22.12.0`. Вкладка «Макет» использует CSS, а Windows-проигрыватель исполняет LVGL.

Для нативных тестов и Windows-проигрывателя нужны Visual Studio C++ Build Tools
с Windows SDK, CMake 3.24+, Git и Node.js. Зависимости LVGL, TinyCBOR и NaWServer скачиваются явно;
подготовленная S3-демка и ESP-IDF для этого варианта не нужны:

```powershell
git clone --depth 1 --branch v9.6.0 https://github.com/lvgl/lvgl.git local/deps/lvgl
git clone --depth 1 --branch v0.6.1 https://github.com/intel/tinycbor.git local/deps/tinycbor
git clone --depth 1 https://github.com/NaBrIks/NaWServer.git local/deps/NaWServer
./tools/test_native.ps1 -LvglSource "$PWD/local/deps/lvgl" -TinyCborSource "$PWD/local/deps/tinycbor"
./examples/windows_player/build.ps1 -LvglSource "$PWD/local/deps/lvgl" -TinyCborSource "$PWD/local/deps/tinycbor" -NaWServerSource "$PWD/local/deps/NaWServer"
npm run player
npm run player:test
npm run player:test-system
npm run player:test-resize
```

После сборки нативного проигрывателя `npm run sim` или `RunSimulator.cmd`
пересобирает редактор и запускает его через проигрыватель.

Коммиты тегов: LVGL `80ca777e37a2b176770726a02e07a6fb79ef0b39`,
TinyCBOR `1e8296f94e40c6ac976d4c5a7b1db7f45978a83f`.
Открытие файла: `npm run player -- interface.json` либо `.cbor`, с `--watch` —
подхват сохранённых правок. Для GPU нужен подходящий Windows/WDDM-драйвер;
отсутствующие показатели не подменяются нулём. См. [руководство](examples/windows_player/README.md).

## Примеры и Designer

| Пример | Что показывает |
| --- | --- |
| [Windows](examples/windows_player/README.md) | `npm run player` для телеметрии и схем, `npm run player:graphics` для растровой и векторной графики, пульта и холста. Оба профиля исполняют настоящий LVGL. |
| [7″ ESP32-S3 RGB](examples/s3_style_lab/README.md) | Вложенные страницы приборной панели, нативные приборы, веб-редактор и живой дисплей по HTTP/WS. |
| [LilyGO T-Display-S3](examples/lilygo_t_display_s3/README.md) | Маленький дисплей ST7789, кнопки, диагностика по USB и опциональный Wi-Fi-предпросмотр. |
| [Нативный компонент](examples/native_widget/README.md) | Переносимая регистрация C++-виджета и его метаданных для редактора. |

[Designer для Windows и Android](tools/designer/README.md) использует SPLA
для чата, подключения к модели и MCP. Основной режим — прямой API с общими
кодеками внутри приложения. Можно также подключиться к явно заданному MCP.
В Windows-проигрывателе есть опциональный встроенный MCP. Windows Designer
может открыть текущую сессию прямого API внешнему агенту через loopback.
Прошивка 7″ работает через прямой API и не раздаёт `/mcp`.
[Режимы и ограничения MCP](docs/readme_mcp_ru.md).

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

Графический профиль Windows показывает форматы LVGL BIN/PNG/JPEG/BMP/GIF/SVG,
пиксельные форматы и сравнение кривых.
[Руководство](docs/readme_graphics_ru.md); профиль галереи отключается через
`LVGL_CBOR_GRAPHICS_GALLERY=OFF`.

## Документация, лицензии и поддержка

[Указатель](docs/README.md), [вложенные страницы](docs/readme_page_composition_ru.md),
[Статус MCP](docs/readme_mcp_ru.md), [SeMaps](docs/readme_semaps_ru.md),
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
через существующий HTTP API. Необязательный `DataHistory` публикует обычные
источники независимо от времени жизни страницы. См.
[каталог и историю](docs/readme_data_catalog_ru.md).
Проверка настоящего Windows LVGL и нативного API: `npm run player:test-catalog`.

Собственные схемы через документы проекта и стек стилей: [руководство](docs/readme_appearance_ru.md).

`npm run player` запускает также постоянный loopback API на `http://127.0.0.1:5300`.
Preview, save с проверкой revision, стили, биндинги и события выполняются общими нативными сервисами.
См. [Windows API](docs/readme_windows_api_ru.md).
