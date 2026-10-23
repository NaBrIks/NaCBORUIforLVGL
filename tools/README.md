# Tools

Каталог и файловая система проекта: `project_image.mjs` готовит ROM-базу TPMS/GPS и независимые файлы начального каталога; `build_project_fs.ps1` упаковывает SPIFFS 4 МиБ. `deploy_s3.ps1` по умолчанию пишет только приложение, а `-ProvisionFilesystem` явно заменяет FS и обновляет таблицу разделов. `project_persistence.mjs http://DEVICE prepare|verify` проверяет сохранение нового экрана/стиля через перезапуск. [Формат, пути, команды и ограничения](../docs/readme_project_storage_ru.md).

Биндинги: `binding_contract.mjs` проверяет общий контракт, `binding_fixtures.mjs` готовит пакеты настоящего JS-кодека для нативного теста.

Для миграции ABI экспортировать целый проект, собрать `build_s3.ps1 -ProjectJson PATH`, затем `build_project_fs.ps1`. Только явный `deploy_s3.ps1 -Port COMx -ExpectedMac MAC -UpdateFilesystem` заменяет приложение и существующий каталог по фиксированным адресам, требуя побайтно совпадающую таблицу разделов. Он не пишет bootloader, NVS, PHY или таблицу. Это отдельная операция с предварительным сохранением проекта, а не обычная app-only прошивка. Последующие обновления без миграции выполняются без обоих filesystem-флагов.

Модули и размеры: `check_optional_modules.mjs` собирает files-only/css-only/minimal и проверяет удаление JS и CSS отключённых модулей. `pack_assets.mjs` пишет размеры встроенных файлов в assets.manifest.generated.json; справочники ПК туда не входят. `check_embedded_assets.mjs http://DEVICE` побайтно сверяет все файлы с устройством. `build_s3.ps1 -WithoutEditor` собирает отдельный s3-no-editor без массивов сайта.

См. [курсорный исполнитель экранов v3 и стили v2](../docs/readme_fast_executor_ru.md). `extension_fixtures.mjs` и `check_native_extensions.mjs` проверяют runtime-регистрацию через реальный C++-каталог.

- `node tools/build_style_matrix.mjs` — матрица LVGL 9.6.0 из официальных исходников с хешами источников; shared-сигнатуры совпадают с ABI.
- `node tools/style_contract.mjs` — проверка фиксированного ABI и генерация C++/JS/таблиц индексов и полей редактора.
- Текущие контракты style v2 и screen v3 редактируются явно; `npm run contract` генерирует производные файлы, `npm run contract:check` проверяет их. Метод стиля локален сигнатуре, метод компонента — своему обработчику. Старые версии сохраняются как история.
- `npm test` — кодек, ABI и модель редактора; `node tools/native_fixtures.mjs` — CBOR для нативного интеграционного теста.
- `npm run build` и `node tools/pack_assets.mjs` — веб-редактор и встроенные HTTP assets.
- `./tools/build_s3.ps1` — сборка ESP32-S3 с локальным IDF Component Manager 2.5.2; соседнее Python-окружение не обновляется.

Переиспользуемое преобразование JSON↔CBOR находится в `packages/style-codec`, без зависимостей от Vue и ESP32.

- `node tools/build_widget_reference.mjs [путь-к-LVGL]` — офлайн-каталог публичных свойств/функций LVGL 9.6.0 вне style setters: HTML и JSON с хешами источников.
- `node tools/build_screen_schema.mjs` — схема и пример браузерного черновика экранов. Не меняет style ABI.
- `/reference/widget_api_lvgl_9_6.html` — каталог через Vite и в desktop dist. `pack_assets.mjs` переносит на МК только index/assets, справочники остаются на ПК.

- `node tools/screen_contract.mjs` — генерация числовых фабрик/операций screen ABI с проверкой lock.
- `node tools/screen_examples.mjs` — семь исходников JSON и native CBOR fixtures (включая повреждённые).
- `node tools/encode_screen.mjs input.json output.cbor` — компиляция экрана без Vue.
- `./tools/test_native.ps1` — воспроизводимая нативная регрессия стилей и экранов.

- `node tools/cursor_fixtures.mjs` — вложенный поток, возврат к родителю/соседу, пустые тела, границы команд и пользовательский тип по имени.

- `node tools/project_fixtures.mjs` — целые JSON/CBOR-проекты для нативной регрессии и базовый const-пакет S3.
- `node tools/project_hardware.mjs http://DEVICE` — аппаратная проверка полного проекта больше 4096 B: preview/save/readback, revision, загрузка по имени, незавершённая передача. Меняет тестовый проект и дисплей, затем восстанавливает исходный проект, если его версия не была изменена другим клиентом.
- `tools/build_s3.ps1 -WithoutProjectApi` — сервис остаётся внутри прошивки, HTTP-адаптер исключён. `-WithoutProject` — сервис и его HTTP API исключены. Отдельные профили/артефакты не прошиваются автоматически.
