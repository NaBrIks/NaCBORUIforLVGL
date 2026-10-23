# Модули редактора, файлы, CSS и MCP

## Где хранится редактор

Vue-приложение собирается в HTML, JavaScript и CSS. `tools/pack_assets.mjs` сжимает HTML и `dist/assets` gzip и создаёт `assets.generated.hpp`. S3 хранит массивы `const uint8_t` во Flash и отправляет их по HTTP с `Content-Encoding: gzip`. Распаковка и редактор исполняются в браузере. Полного распакованного редактора в RAM S3 нет; HTTP/WS используют рабочие буферы и соединения. Документы сохраняются в localStorage браузера и в явно выгруженных файлах, не записываются автоматически во Flash устройства.

Справочники `dist/reference` доступны на ПК и не включаются в прошивку. `assets.manifest.generated.json` после упаковки перечисляет каждый встроенный файл, его размер до сжатия и во Flash. Измерения: [отчёт](reviews/REVIEW_20261022_modules-files-css-mcp.md).

## Независимые части

| Модуль | Ответственность |
|---|---|
| packages/style-codec, packages/screen-codec | Общая проверка и двусторонние wire-кодеки |
| packages/document-io | Документ ↔ JSON/CBOR bytes, без файлового API |
| packages/css-codec | Ограниченный CSS ↔ свойства документа, без DOM/сети |
| frontend/src/modules/document-files | Загрузка и сохранение файла в браузере |
| frontend/src/modules/css-transfer | CSS из файла/буфера, диагностика и применение |
| integrations/mcp | Отдельный необязательный процесс на ПК; свой npm lock |
| src, include/lvgl_cbor | Нативное ядро LVGL/TinyCBOR, без редактора/MCP |

App.vue остаётся композицией. Кодеки не зависят от Vue. Файлы, MCP и браузер используют одну проверку и сериализацию. ABI v3/v2, runtime-регистрация компонентов и cursor executor не менялись.

## JSON и CBOR

В экране и именованном стиле есть выбор JSON/CBOR, «Сохранить ↓» и «Загрузить ↑». Загрузчик принимает оба формата независимо от выбранного формата сохранения. JSON содержит редактируемый документ; CBOR — нативный пакет текущего ABI, пригодный для передачи исполнителю. Импорт восстанавливает редактируемый документ, включая сгенерированные подписи кнопок.

Файл полностью проверяется перед заменой документа. При ошибке исходный документ сохраняется. JSON ограничен 2 MiB, CBOR — лимитом пакета протокола; с подключённой платой проверяются её возможности и лимиты. Обрезанные, чужие, повреждённые, невалидные UTF-8 данные отклоняются. Непредставимый декларативным JSON порядок произвольных команд не меняется молча.

Файл содержит один экран либо один именованный стиль, не архив всего рабочего пространства. Загрузка меняет документ редактора. При включённом «Автоприменении» затем отправляется обычным путём на устройство; иначе нужна кнопка «Применить на МК».

## CSS

Открыть «CSS · импорт / экспорт». Вставить Ctrl+V либо открыть `.css`. Панель показывает готовые свойства или ошибки с селектором, свойством и строкой. «Применить CSS» работает только после успешной проверки всего ввода. Экспорт сохраняет `.css` и показывает текст; «Копировать» использует clipboard API. Если браузер его запрещает, выделить текст и нажать Ctrl+C.

Селекторы: `#node_id`, имя типа (`label`, `button`, `obj`), `*`, `:root`, списки через запятую. Разрешены `:pressed`, `:checked`, `:focused`, `:focus-visible`, `:disabled`, `:user-1..4`; части `::main`, `::scrollbar`, `::indicator`, `::knob`, `::selected`, `::items`, `::cursor`. Комбинаторы, классы и атрибуты не поддерживаются. ID состоит из букв, цифр, `_`, `-`. Для именованного стиля — декларации без селектора или блок `:root`/`*`; состояния и части относятся к объекту.

Поддерживаемое подмножество:

- width/height, min/max, left/top: целые px, проценты; fit-content для LVGL content-размерности.
- padding/margin и стороны, gap/row-gap/column-gap, border-width/radius, outline-width/offset, letter-spacing: целые px (ноль без единицы).
- color/background-color/border-color/outline-color: hex 3/4/6/8 цифр, rgb/rgba с целыми RGB, black/white/red/green/blue/yellow/gray/grey/transparent. Альфа преобразуется в соответствующую opacity LVGL.
- border: `<px> solid <color>`, opacity 0..1, text-align, direction.
- display block/flex/grid задаёт layout. Grid-дорожки задаются редактором/JSON; неправильный Grid отклоняет общий валидатор.
- flex-direction, flex-flow с wrap/wrap-reverse, flex-grow, justify-content, align-items, align-content. Stretch и сложные сочетания обратных направлений не имитируются.
- font-family — точное имя зарегистрированного ресурса. font-size 14/20/28px выбирает default/montserrat_20/montserrat_28; наличие ресурса проверяется по возможностям платы.

Учитываются !important, специфичность поддержанных селекторов и порядок правил. При слиянии разворачиваются составные LVGL setter-ы. CSS меняет оформление существующих объектов; структура и текст сохраняются. Неподдерживаемые свойства, @-правила, url/var/calc/expression, вложенные правила, неизвестные селекторы/ресурсы блокируют импорт. Ничего не загружается из сети. Экспорт тоже не теряет данные молча: стиль вне подмножества или с именованными style references требует JSON/CBOR.

Экспорт именованного стиля с copy/merge тоже требует JSON/CBOR: CSS не разворачивает наследуемые значения неизвестного базового стиля. Для самостоятельных CSS-деклараций сначала убрать композицию либо подготовить полный набор свойств. Импорт CSS сохраняет существующую композицию документа.

```css
#root { padding: 24px; background-color: #17252d; }
#content { border: 2px solid #36b58c; }
#level::indicator { background-color: #36b58c; }
#level:pressed::indicator { opacity: 0.7; }
```

## Отключение

Браузерная сборка, PowerShell:

```powershell
$env:VITE_LVGL_CBOR_FILES='false'
$env:VITE_LVGL_CBOR_CSS='false'
npm run build
```

Флаги независимы. При false сборщик удаляет динамический import и JS-chunk модуля. Удалить env-переменные перед полной сборкой. Общие базовые стили остаются в оболочке.

Полностью исключить встроенный сайт:

```powershell
./tools/build_s3.ps1 -WithoutEditor
# examples/s3_style_lab/.pio/build/s3-no-editor/firmware.bin
```

`LVGL_CBOR_EMBED_EDITOR=0` исключает массивы сайта и HTTP assets-handler. API, WS, исполнители и внешнее подключение с ПК остаются. В собственной интеграции можно вообще не включать демонстрационный HTTP-сервер: ядро от него не зависит. Полная сборка — npm run build, node tools/pack_assets.mjs, ./tools/build_s3.ps1.

## MCP на ПК

Выбран отдельный адаптер: МК уже предоставляет HTTP/CBOR-интерфейс, а проверка и компиляция находятся на ПК. MCP не увеличивает прошивку и не добавляет нативный JSON-RPC стек. Стандартный stdio запускается MCP-клиентом как дочерний процесс и не занимает TCP-порт.

```powershell
npm ci # из корня: общие кодеки и workspace-ссылки; сборка сайта не нужна
npm ci --prefix integrations/mcp
npm test --prefix integrations/mcp
```

Пример подключения — integrations/mcp/example.config.json. Конфигурация Codex/другого клиента автоматически не меняется. LVGL_CBOR_DEVICE задаёт один адрес платы при старте; без адреса доступны офлайн-кодеки. LVGL_CBOR_ALLOW_PREVIEW=1 добавляет предпросмотр, LVGL_CBOR_ALLOW_SAVE=1 независимо разрешает сохранение проекта. Прежний LVGL_CBOR_ALLOW_APPLY=1 — алиас только разрешения предпросмотра. По умолчанию обе группы отсутствуют в списке. LVGL_CBOR_MCP_CSS=0 исключает CSS-инструмент, сам CSS-модуль загружается только при вызове. LVGL_CBOR_MCP_ENABLED=0 завершает процесс без запуска. Весь MCP отключается удалением записи из конфигурации клиента; можно вовсе не устанавливать пакет.

Инструменты: get_contract, get_example (валидный образец JSON), compile_document, decode_document, опциональный convert_css; с адресом платы — get_device, get_project_status, read_project и read_project_document. Предпросмотр добавляет preview_project/show_project_screen, сохранение — save_project/write_project_document/reset_project_changes. Старого apply_document в списке нет. Адрес не принимается в аргументах инструмента. Запись требует актуальную revision проекта.

`get_device` возвращает и типизированный каталог `capabilities.binding`. Привязки/события узлов проходят compile/decode, preview, save и readback целого проекта через общие кодеки; неизвестные источники/действия отвергаются по каталогу устройства до передачи. MCP не создаёт отдельный формат биндингов и не добавляет специальные BLE-инструменты. [Проектный API](readme_projects_ru.md), [данные и события](readme_bindings_ru.md).

Runtime дополнен `get_data/get_data_command` и независимой группой `LVGL_CBOR_ALLOW_DATA=1`: `invoke_action/write_source/send_event`. Контракты binding/composition доступны через get_contract, живые instance/views — через get_project_status. Используется общий DataClient над существующим `/api/data`, навигация выполняется настроенным событием страницы. Полные аргументы, разграничение queued/completed/unconfirmed и ограничения — в [руководстве MCP](readme_mcp_ru.md).

Использован официальный SDK 2.3.1 и stdio factory из [документации MCP](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server). Форматы файлов и исполнение LVGL остаются собственными модулями проекта.
