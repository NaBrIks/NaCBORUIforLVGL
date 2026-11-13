# Прямой API и опциональный MCP

Основной путь Designer — прямой API устройства. Общие JS-кодеки выполняются
внутри приложения, а сеть — через его HttpClient. Node.js на телефоне не нужен.
Подробности: [режимы подключения и USB](readme_designer_connections.ru.md).

Два MCP-профиля используют один HTTP-клиент SPLA: встроенный endpoint целевой
программы и явно заданный внешний совместимый endpoint. Выбор профиля не запускает
сервер, не создаёт дополнительный listener и не включает автоматический fallback.
Удалённые JS/MCP SDK серверы не возвращены.

## Встроенный Windows proof of concept

Windows CMake `LVGL_CBOR_NATIVE_MCP=ON` включает `/mcp` в существующий NaWServer
внутри самой демки. По умолчанию OFF: в сборку не входят MCP/JSON исходники,
parser workspace и MCP PNG adapter. Обычный HTTP/CBOR API остаётся.

PoC предоставляет 12 инструментов для фактических capabilities, каталога данных,
состояния проекта, действий/событий и настоящего кадра. JSON-authoring компилятор
в native PoC не включён: для редактирования разметки используйте прямой режим
Designer. Каталог не объявляет отсутствующие функции.

[Сборка, ограничения и результаты Windows PoC](readme_windows_native_mcp.ru.md).
Для прошивки S3 предусмотрено подключение по прямому HTTP/CBOR API.

## Внешний MCP Designer на Windows

Опциональный локальный endpoint обслуживается внутри Designer на NaWServer.
Он открывается при явной настройке `NACBORUI_DESIGNER_MCP_PORT` и активном
подключении в режиме Direct API. Внешний агент получает инструменты выбранного
устройства через тот же слой, которым пользуется чат Designer.

`get_authoring_instructions` возвращает полный английский комплект инструкций.
`get_display_frame` возвращает завершённый кадр предпросмотра с метаданными сцены.
[Запуск](../tools/designer/README.md#optional-mcp-for-external-agents-on-windows) ·
[снимок после навигации](readme_maui_designer.ru.md#снимок-через-mcp-designer).

## Владение

ProjectService/DataRegistry/StyleService и LVGL исполняют те же данные независимо
от транспорта. Сохранение и preview различаются. Локальные инструменты получают
доступные источники/действия/виджеты из устройства, не из списка демо-предположений.
Системные инструкции и полный справочник JSON-методов принадлежат Designer.

История решения: [ADR трёх сетевых режимов](adr/ADR_20261110_designer-three-connection-modes.md).
