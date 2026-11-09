# Сборка на общем TCP-стеке NaWServer

Обновление 2026-10-28. Пример S3 использует `NaWServer::HttpServer`,
`TcpHttpBackend` и `tcp::IdfTransport`. Прежний `<NaWServer/server.h>` /
`Server` был совместимой оболочкой native HTTPD и больше не используется.

- Выбор `CONFIG_NAWSERVER_BACKEND_TCP=y` и WebSocket закреплён в defaults.
- HTTP worker использует 12 КиБ стека (`CONFIG_NAWSERVER_TCP_HTTP_STACK_SIZE=12288`):
  богатые обработчики каталога UI требуют больше минимального профиля сервера.
- Сборочный скрипт согласует эти параметры в ранее созданных sdkconfig,
  не заменяя остальные локальные параметры платы и хранилища.
- Transport запускается после инициализации сетевой подсистемы приложением.
  Ошибки запуска проверяются как `tcp::Status` и `HttpError`.
- Сохранены HTTP `/api/info`, `/api/capabilities`, `/api/project`, `/api/data`
  и WS `/ws`, `/screen-ws`, `/component-ws`; схемы JSON/CBOR и ABI не менялись.
- ROM gzip-ресурсы передаются через `sendImmutable`: их память статична
  и живёт дольше backend. Динамические JSON-снимки используют обычный send;
  их нельзя объявлять бессрочно immutable.
- Прикладные ограничения: 12 TCP-соединений, HTTP headers до 4096 Б,
  HTTP body до 4096 Б. WS использует ограниченные настройки библиотеки.
  Адрес/порт приложения сохранены. Admission/QoS, API-reserve и SSE не
  включаются без потребности приложения.

Сборка: `npm run build`, `node tools/pack_assets.mjs`, `./tools/build_s3.ps1`.
SDK — выбранный ранее общий профиль ESP-IDF 5.5.6; переход на IDF 6.x
для использования общего TCP-стека не требуется. Подробности SDK:
[общая среда](readme_shared_idf_ru.md).

Использована текущая рабочая копия NaWServer поверх 632dafd с локальными
доработками. Точное состояние и исходные журналы сохранены локально;
проверка не означает, что те же незакоммиченные доработки доступны в удалённом
репозитории. Соседняя библиотека в этой задаче не изменяется.

Проверки: 298 тестов JS, 8 MCP, contract:check и production build — PASS.
Выполнена полная прошивка S3 и аппаратная приёмка HTTP/WS, MCP, биндингов,
вложенной навигации и встроенного редактора. [Условия и результаты](reviews/REVIEW_20261028_tcp-hardware.md).

Полная сборка S3: PASS. ELF содержит HttpServer::begin, TcpHttpBackend::start
и tcp::IdfTransport::start; EspIdfHttpBackend::startNative отсутствует.
CMake early selection и итоговый sdkconfig подтверждают TCP. Линкер:
84436 Б static RAM, 1945345 Б Flash; это не измерение свободной RAM в работе.
Проверка миграции sdkconfig и её идемпотентности: PASS.

Повторная сборка с уже созданным профилем через обновлённый скрипт: PASS.

## Прошивка и стартовая страница

`tools/project_image.mjs` без входного JSON создаёт демопроект со стартовой
страницей `shell`: обычные компоненты статусбара сверху, центрального контейнера
и кнопок снизу. Явный `--project-json` сохраняет выбранную автором стартовую
страницу. Добавление оболочки не изменяет размеры её дочерних страниц:
превышение области видно в предпросмотре и даёт прокрутку контейнера.

```powershell
./tools/build_s3.ps1
./tools/build_project_fs.ps1
./tools/deploy_s3.ps1 -Port '<serial-port>' -ExpectedMac '<device-mac>' -FullImage
```

`-FullImage` пишет bootloader, таблицу разделов, приложение и SPIFFS;
проверяет chip/MAC, сохранение NVS/PHY/factory-разделов, размер Flash и хеши
всех четырёх записанных областей. Эта команда заменяет проектный SPIFFS.
Обычный запуск без ключа остаётся обновлением только приложения.

Аппаратная проверка без постоянного сохранения проекта:

```powershell
node tools/http_ws_hardware.mjs http://192.0.2.10
node integrations/mcp/hardware-smoke.mjs http://192.0.2.10
```

Адрес условный. Первая команда временно показывает тестовые экраны и в `finally`
возвращает сохранённую стартовую страницу; вывод содержит приватную диагностику,
его следует сохранять в ignored `local/`.

## Обновление API 2026-11-07

Текущий NaWServer выбирает обработчики по декларативным `RouteDescriptor` через
`HandlerBase::routes() const`; `canHandle` удалён. Адаптеры DataApi/ProjectApi и
таблица встраиваемых assets переведены на этот интерфейс. URL и прикладные
JSON/CBOR-протоколы сохранены. Старые `CONFIG_NAWSERVER_BACKEND_TCP/HTTPD`
больше не задаются; WebSocket и размер стека остаются явными настройками.
Фактическая приёмка и границы проверки — [в отчёте](reviews/REVIEW_20261107_web-stack-s3.md).
