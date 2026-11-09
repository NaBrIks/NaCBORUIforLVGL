# ADR: единый NaWServer API для Windows и МК

Статус: принято по прямому поручению владельца 2026-11-07.

Весь прикладной HTTP/WS и сквозные сетевые проверки используют NaWServer на
каждой платформе. Windows-проигрыватель линкуется с его штатным Windows backend.
Построенный общий веб-редактор отдаётся этим же сервером с одного origin.

Существующие ProjectClient/DataClient и stdio MCP используют /api/info,
/api/capabilities, /api/data, /api/project. На /ws передаются CBOR-события проекта,
каталога и данных. NaWServer отвечает за TCP/HTTP/WebSocket и управление сетью;
ProjectService/DataRegistry/StyleService сохраняют прикладную логику.

Короткие callbacks сериализуются lv_lock с работой LVGL. Data POST возвращает
202 и попадает в ограниченную очередь, выполняемую приложением. ProjectService
разделяет preview/save/show, проверяет revision; FileProjectStore сохраняет
два поколения изменений. Остановка сервера предшествует уничтожению приложения
и не выполняется под GUI-lock. Произвольного deferred HTTP не вводится.

Компилятор frontend, общие JSON/CBOR-кодеки и stdio MCP остаются host-инструментами.
Они не создают сетевых listener продукта или тестов. Unit-проверки используют
in-memory транспорт; сетевые end-to-end проверки — настоящий NaWServer.

По умолчанию Windows слушает 127.0.0.1:5300, порт 443 запрещён. Постоянный store
и его существующие UTF-8 пути сохраняются. Автоматического переноса данных нет:
используется тот же префикс исходного проекта.

Руководство: [Windows API](../readme_windows_api_ru.md).
