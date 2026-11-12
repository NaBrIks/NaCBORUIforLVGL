# SeMaps: архитектура проекта

`nacboruiforlvgl.semaps` открывает workspace `docs/diagrams` относительно корня
checkout. Модель `nacborui` содержит четыре авторских вида:

| Вид | Назначение |
|---|---|
| `v_architecture` | Редактор, кодеки, нативные API/сервисы, хранение и LVGL |
| `v_live_data` | Автономный генератор → CBOR event queue → DataRegistry → биндинги/LVGL и WS |
| `v_readme_overview` | Обзор для README. Редакторы, общий формат, LVGL runtime и платформы |
| `v_readme_live_flow` | Схема для README. Поток значений в LVGL и обратный путь действий |

Это авторская логическая модель, не автоматически извлечённый C++ symbol graph.
Контракты описаны в [проектах](readme_projects_ru.md),
[биндингах](readme_bindings_ru.md), [композиции](readme_page_composition_ru.md)
и [демособытиях](readme_demo_events_ru.md).

## Запуск SeMaps

```powershell
semaps nacboruiforlvgl.semaps
semaps check nacboruiforlvgl.semaps
```

В проектном файле задан отдельный порт 42761. Настоящий URL и доступность нужно
проверять после запуска. Не занимать локальный порт 443 и не останавливать чужие
службы ради порта карты.

## Изменение модели

Редактировать модель следует через MCP самого SeMaps. Перед записью проверить,
что `list_projects` указывает на `nacborui`, прочитать relevant views и сравнить
описания с исходниками. После изменения сохранить модель, проверить unsaved,
отрисовать изменённый вид и выполнить `semaps check`. Registry/view JSON вручную
не редактируются. MCP SeMaps управляет архитектурой, а не UI target.

## Экспорт и актуальность

Виды README сохранены в модели и экспортированы через `render_view`
в [обзор](images/readme-overview.png) и [поток данных](images/readme-live-flow.png).
Короткие английские подписи подходят для обеих версий README. В схеме потока
сплошные стрелки показывают значения, пунктирные — события.

Модель учитывает Direct API, опциональный встроенный MCP Windows и
loopback MCP Designer с завершёнными кадрами предпросмотра.
Подробности в [руководстве MCP](readme_mcp_ru.md) и
[описании передачи кадров](readme_display_feedback_ru.md).
