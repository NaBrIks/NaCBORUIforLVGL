# Windows: необязательный native MCP PoC

Основной путь Designer — прямой HTTP API устройства с общими JS-кодеками в
MAUI/WebView. Он не требует MCP endpoint, процесса Node или прокси.
Этот отдельный эксперимент проверяет стоимость настоящего встроенного MCP.

## Сборка

`LVGL_CBOR_NATIVE_MCP` по умолчанию **OFF**. В обычной Windows-сборке нет
исходников NaWServer MCP/JSON, parser arena, tool registry или MCP PNG-адаптера.
Прежние HTTP/CBOR API, WebSocket и BMP-просмотр LVGL остаются.

Для эксперимента добавьте при конфигурации Windows CMake:

```powershell
cmake -S examples/windows_player -B local/windows-mcp-on -DLVGL_CBOR_NATIVE_MCP=ON
cmake --build local/windows-mcp-on --config Release --target nacborui_player
```

Пути LVGL/TinyCBOR/NaWServer передаются теми же параметрами, что обычному
проигрывателю. `/mcp` появляется на **том же адресе и порту**, что HTTP API,
а не в другом процессе/listener. Для проверки запускайте явный тестовый проект
и отдельный store. Текущий проект владельца не заменяйте.

## Реализованная граница

NaWServer владеет HTTP и MCP JSON-RPC/Streamable HTTP. Callback работает с теми же
Application, ProjectService и DataRegistry под существующей блокировкой LVGL;
самозапросов по HTTP, SDK-моста или отдельного движка нет.

Доступны 12 настоящих tools: `get_device`, `get_ui_reference`,
`get_project_status`, `get_data_catalog`, `get_data`, `get_display_frame`,
`show_project_screen`, `refresh_project_display`, `invoke_action`,
`write_source`, `send_event`, `send_view_input`. Шесть инструментов читают данные. Остальные выполняют
явные действия существующих сервисов. Для событий дочернего экрана нужен
`instance` из актуального статуса композиции.

**JSON-разметка не компилируется в этом endpoint.** Tools чтения/записи editable
Project/screen/style JSON, `preview_project` и `save_project` не объявляются.
Полноценное редактирование по описанию остаётся в Direct API режиме Designer.
Не выдавайте этот PoC за полный альтернативный конструктор.

`get_ui_reference` отдаёт существующие английские справочники поставки из
`tools/designer/prompts`, относительно web-root репозитория. Для переноса этого
PoC вне checkout эти файлы тоже должны быть доступны. Отсутствие/превышение
бюджета возвращает ошибку, а не урезанную инструкцию.

## Изображение и бюджеты

Кадр берётся из настоящего LVGL существующим snapshot-путём. Уже включённый
Windows LodePNG кодирует уменьшенный RGB-кадр в PNG; MCP использует стандартный
image content `image/png`. Он не требует JavaScript-кодера или внешнего процесса.
Размер ограничен максимумом 512 px по длинной стороне и 44000 байт PNG. При
необходимости разрешение уменьшается, формат PNG содержит фактические W/H.
Обычный `/api/view/frame` остаётся BMP с прежним отдельным лимитом.

PoC явно выделяет 65536 байт reader arena и 65535 байт output, плюс registry и
служебные структуры. JSON input ограничен 65535 байтами, глубина 32, 8192 values.
Windows managed response buffer увеличен с 8192 до 65535 байт только при ON,
поскольку base64 PNG не помещался в 8192: первое же большое изображение давало
503 `No client capacity`. Лимиты числа соединений/keep-alive не увеличивались.
HTTP body для `/api/*` сохраняет прежний предел 4096.

Это не полная оценка RAM. Временные snapshot BMP/XRGB, RGB preview и PNG/deflate
тоже занимают память и CPU; на Windows они используют host RAM. Эти расходы
не переносились и не объявляются приемлемыми для MCU.

В NaWServer сделано узкое расширение `mcp::Tool::image_mime`: null оставляет
прежний text callback, MIME включает стандартный image content с base64.
Общие лимиты/валидация ответа и механизм переполнения остались. Никаких
проприетарных контейнеров картинки поверх MCP не вводилось.

## Проверка

```powershell
node examples/windows_player/test-native-mcp.mjs PATH_TO_ON_EXE
node examples/windows_player/test-native-mcp.mjs PATH_TO_OFF_EXE --disabled
```

ON-тест проверяет initialize/negotiation, отсутствие неработающих JSON tools,
реальные status/reference/catalog и PNG, большую картинку первым tool-вызовом,
затем повторные большие/малые ответы и неизменность проекта. OFF-тест проверяет
отсутствие MCP и живой прямой API. Тесты создают скрытые экземпляры, временные
stores и не используют мышь/клавиатуру владельца.

Отдельный тест NaWServer `mcp_image_test` проверяет совместимость прежнего text,
image content и явную bounded error вместо урезанного большого ответа.
S3, её прошивка, Setup и NTP этим экспериментом не изменялись.

Проверка Release ON/OFF на одной версии исходников/зависимостей дала EXE
2521088 / 2297344 байта, разница 223744 байта. Это размер Windows executable,
не замер Flash МК и не универсальный benchmark. OFF-проект сборки дополнительно
проверен: исходники JSON/MCP и native_mcp.cpp отсутствуют в compile inventory.
OFF прошёл существующую нативную проверку кадров/указателя/биндингов.

`send_view_input {x,y,pressed}` передаёт указатель штатному LVGL indev: координаты исходного дисплея, включая отпускание после жеста. Это тот же Pointer и watchdog500мс, который используется прямым `/api/view/input` с CBOR.
