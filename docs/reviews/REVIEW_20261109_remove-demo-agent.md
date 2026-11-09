# Удаление агента из LVGL-демки

Удалены Node tool loop/чат, C++ HostAgent, registry assistant.*, формы LLM/ключа
в LVGL и браузере, DPAPI adapter/crypt32 linkage, --assistant-store, неиспользуемый
assistant-budget и тесты/руководства только прежнего помощника. Датированные
reviews остаются историей, не инструкциями текущей работы.

Сохранены ProjectService/DataRegistry, схемы, генератор, события, вложенные
страницы, графика, NaWServer HTTP/WS, MCP, native frame/pointer и base migration.
/viewer — просмотр, /editor/ — общий редактор без собственного agent loop.

Инструкции и JSON-справочники EN/RU перенесены без изменения текста в
`tools/designer/prompts`. Designer.Core встраивает их оттуда; get_ui_reference
и tools/assistant_reference.mjs используют те же документы. LLM/agent/MCP
исполнение остаётся в SPLA. AGENTS.md закрепляет согласование независимых
подсистем и нового стека; демо/прототип/тест не являются исключением.

## Проверки

- 357 JS-тестов, contract:check и frontend production build прошли. ABI не менялся.
- Native Windows Release собран. Прежнее предупреждение size_t в sample_image.hpp
  не связано с изменением и не исправлялось.
- test-graphics: пять страниц, 19 образцов, четыре схемы, пульт, MCP-авторство
  пустого холста и события работают.
- test-native-view: NaWServer, BMP/frame, pointer hit-test, MCP-события и изменение
  пикселей через биндинг, watchdog и лимит кадра прошли. Assistant sources/actions
  отсутствуют; protect/unprotect operations недоступны.
- test-layout-debug и test-base-migration прошли: geometry/revision, refresh и
  сохранность user project не нарушены.
- 40 SPLA Core assertions прошли; Windows Designer собран после переноса ресурсов.
  Реальный SPLA HTTP MCP: 20 инструментов, project status, get_ui_reference и PNG.
  Запросов к LLM-провайдеру не было. Android ARM64 собран; физический телефон
  в этой приёмке не использовался.

## Живой проект и ключи

Обновление базы намеренно сохраняет точный прежний пользовательский проект.
Поэтому старая Settings стала override со ссылками на удалённые assistant.*.
Сохранённый каталог до обновления подтвердил origin=base для этой страницы.
Через существующий reset_project_changes сброшен только screens/settings,
затем refresh. Полный проект/changes не сбрасывались.

Хеш пользовательского canvas до/после совпал; выбранная settings и диагностика
сохранены. Новая страница проверена кадром, Designer подключён без ошибок.
MCP gateway перезапущен для нового пути справочников.

Удалён только graphics-assistant.dpapi в стандартной папке Windows-демки;
повторно он не создаётся. Хеш отдельного SecureStorage Designer до/после совпал.
Значение ключа не выводилось и не переносилось. Проекты и схемы не удалялись.
Измерения и снимки — только ignored local/. MCU/S3/NTP не затрагивались.

SeMaps e_windows_player обновлён через MCP; оба view unsaved=[], check прошёл.
