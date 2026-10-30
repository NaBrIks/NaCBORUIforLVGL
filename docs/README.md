# Документация NaCBORUIforLVGL

- [Windows: реальные CPU/RAM/GPU и история по логическим процессорам](reviews/REVIEW_20261030_windows-system.md)

- [T-Display-S3: общие схемы, полный flash и аппаратная проверка 320×170](reviews/REVIEW_20261030_lilygo.md)

- [Windows-проигрыватель: настоящий LVGL, JSON/CBOR, общие биндинги и события](readme_windows_player_ru.md)
- [Проверка четырёх цветовых схем в Windows](reviews/REVIEW_20261029_windows-schemes.md)
- [Схемы оформления: проверка идеи, состояния и границы переносимости](reviews/REVIEW_20261029_appearance-design.md)

- [SeMaps: архитектура, потоки данных и локальные MCP](readme_semaps_ru.md)

- [Сборка на новом TCP-стеке NaWServer](readme_nawserver_tcp_ru.md)
- [Компоновка 800×408 и автономные CBOR-события скорости](readme_demo_events_ru.md)
- [Полная прошивка S3 и аппаратная проверка TCP HTTP/WS, MCP и вложенных страниц](reviews/REVIEW_20261028_tcp-hardware.md)

[English overview](../README.md) · [Обзор на русском](../readme.ru.md) · [Лицензии](../LICENSES.md)

Сетевые адреса, серийные порты и MAC в публичных примерах и отчётах условные. Для запуска подставьте параметры своего устройства; исходные журналы и снимки конкретного окружения не публикуются.

- [NaWServer, лицензии и подготовка исходного коммита](reviews/REVIEW_20261023_nawserver.md)
- [Обновление Vue/Vite и проверка безопасности редактора](reviews/REVIEW_20261023_vue-vite-security.md)
- [Переименование NaCBORUIforLVGL и подготовка чистой истории](reviews/REVIEW_20261023_livecbor.md)

- [Граница UI и передача прежнего прикладного примера](reviews/REVIEW_20261023_remove-bluetooth.md)

Статус: реализованы общий сервис стилей, двусторонние кодеки, возможности подключённой прошивки и исполнитель экранов/вложенных компонентов. Добавлены типизированный реестр данных, привязки и события. Проверенные результаты отделены от предложений.

- [Возможности устройства, сервис стилей, двусторонние кодеки и модульный сайт](readme_runtime_services_ru.md)
- [ADR: возможности, уровни стилей и обратимость](adr/ADR_20261022_lvgl-cbor_capabilities-style-service-roundtrip.md)
- [Проверки общих сервисов, обратимости и модульного редактора](reviews/REVIEW_20261022_runtime-services.md)
- [Требования](readme_requirements_ru.md)
- [Проект целиком, ProjectService, хранение, API и MCP](readme_projects_ru.md)
- [Проверка подхвата внешних изменений проекта без перезагрузки браузера](reviews/REVIEW_20261023_project-live-sync.md)
- [Прошивка S3, приёмка MCP → WS → браузер и возврат на главный экран](reviews/REVIEW_20261023_mcp-ws-hardware.md)
- [Каталог независимых экранов/стилей, SPIFFS 4 МиБ и базовый TPMS/GPS](readme_project_storage_ru.md)
- [Проверка постоянного каталога, прошивки и TPMS/GPS на настоящем LCD](reviews/REVIEW_20261022_project-storage.md)
- [ADR: проект и независимый предпросмотр](adr/ADR_20261022_project-service.md)
- [Проверки ProjectService, файлов, редактора и S3](reviews/REVIEW_20261022_project-service.md)
- [LVGL 9.6.0: матрица свойств стилей и вкладка групп функций по параметрам](style_matrix_lvgl_9_6.html)
- [Архитектурное направление и открытые вопросы](readme_architecture_ru.md)
- [Биндинги и события: реестр, зависимости, постоянные и экранные привязки](readme_bindings_ru.md)
- [Страницы внутри страниц: контейнеры, навигация, пауза и кэш](readme_page_composition_ru.md)
- [Пассивный выбор страницы, отдельный показ и показ в контейнере: браузер и S3](reviews/REVIEW_20261023_page-preview-modes.md)
- [ADR: владение вложенными экземплярами страниц](adr/ADR_20261023_page-composition.md)
- [Проверка вложенных страниц, редактора и статусбара на S3](reviews/REVIEW_20261023_page-composition.md)
- [Проверка сетевой синхронизации времени на МК](reviews/REVIEW_20261023_ntp.md)
- [MCP: живые данные, события и вложенные страницы](readme_mcp_ru.md)
- [Проверка MCP runtime и загрузки стартового экрана](reviews/REVIEW_20261023_mcp-runtime.md)
- [ADR: типизированные данные, привязки и отложенные события](adr/ADR_20261022_data-bindings-events.md)
- [Проверки биндингов, событий и их интеграции в ProjectService, редактор и MCP](reviews/REVIEW_20261023_bindings-events.md)
- [Рабочий вариант: привязки к CBOR/JSON-сообщениям из очереди или потока](ideas/IDEA_20261020_lvgl-cbor_event-message-bindings.md)
- [Внешние источники и лицензии](readme_sources_ru.md)
- [Принятое направление проекта](adr/ADR_20261020_lvgl-cbor_runtime-symbolic-names.md)
- [План проектирования](plans/PLAN_20261020_lvgl-cbor_documentation.md)
- [Реализованный протокол стилей и сравнение таблиц методов](readme_style_protocol_ru.md)
- [Индексы методов и сигнатур ABI v1](readme_style_indices_ru.md) · [JSON-контракт](../contracts/style-api-v2.json)
- [S3 Style Lab](../examples/s3_style_lab/README.md)
- [ADR: индексация инструкций стилей](adr/ADR_20261021_lvgl-cbor_style-opcode-contract.md)
- [ADR: неизменяемые номера, расширение и зарезервированные дыры ABI](adr/ADR_20261021_lvgl-cbor_append-only-style-abi.md)
- [Проверки первой реализации](reviews/REVIEW_20261021_style-lab.md)
- [Визуальный редактор: поля, схема отступов и применение](readme_style_editor_ru.md)
- [Встраивание разделов и отдельных групп Vue, общая обработка и CSS](readme_vue_components_ru.md)
- [Экраны: два предпросмотра, JSON и проект исполнителя на МК](readme_screen_model_ru.md)
- [Исполнитель экранов и компонентов: MVP, файлы, ABI и проверки](readme_screen_runtime_ru.md)
- [Проверка первого MVP экранов, компонентов и реентерабельности](reviews/REVIEW_20261022_screen-mvp.md)
- [Редактор: общая панель, выбор виджета и аппаратная проверка S3](reviews/REVIEW_20261022_editor-component-hardware.md)
- [LVGL 9.6: свойства виджетов, функции и наборы API помимо стилей](widget_api_lvgl_9_6.html)
- [Реальная S3: прошивка, LCD и графический редактор](reviews/REVIEW_20261021_s3-hardware-visual.md)
- [Переход на LVGL 9.6.0: ABI, таблицы, тесты и проверка S3](reviews/REVIEW_20261021_lvgl-9_6.md)

- [Курсорный исполнитель экранов v3, стили v2 и runtime-регистрация компонентов](readme_fast_executor_ru.md)
- [ADR: плотные таблицы по сигнатурам и проверенный код](adr/ADR_20261022_signature-pointer-executor-v2.md)
- [Проверка ABI v2, runtime-регистрации и размеров таблиц в ELF](reviews/REVIEW_20261022_pointer-executor-v2.md)

- [ADR: вложенные команды, локальные методы и курсорный исполнитель v3](adr/ADR_20261022_cursor-component-executor-v3.md)

- [Проверка курсорного исполнителя v3](reviews/REVIEW_20261022_cursor-executor-v3.md)
- [Прошивка S3 и сравнение размеров и сложности с HEAD](reviews/REVIEW_20261022_flash-and-head-comparison.md)
- [Модули редактора, JSON/CBOR, CSS и необязательный MCP на ПК](readme_modules_files_css_mcp_ru.md)
- [Проверки модулей, файлов, CSS/MCP и размеров полной/минимальной S3](reviews/REVIEW_20261022_modules-files-css-mcp.md)
- [Три именованных нативных компонента, каталог с S3 и универсальные поля редактора](readme_native_components_ru.md)
- [Аппаратная и браузерная проверка трёх нативных компонентов](reviews/REVIEW_20261022_native-components.md)
- [Собственная нативная графика: спидометр, анимированный радар и физическая проверка](reviews/REVIEW_20261022_native-graphics.md)

## Жизненный цикл

| Место | Назначение |
|---|---|
| `../agents/` | Действующие инструкции агентам, на английском |
| `readme_*_ru.md` | Актуальные руководства на русском |
| `adr/ADR_YYYYMMDD_zone_short-name.md` | Принятые решения; изменение новым ADR |
| `plans/PLAN_YYYYMMDD_zone_short-name.md` | Редактируемые планы |
| `ideas/IDEA_YYYYMMDD_zone_short-name.md` | Предложения, ещё не принятые решения |
| `reviews/` | Анализ, проверки и результаты с указанием условий |

Документация должна различать требование, гипотезу, реализацию и проверенный результат. Оценки памяти не выдаются за измерения ESP32.

- [Общая ESP-IDF 5.5.6 и конфигурация сборки](readme_shared_idf_ru.md).

- [Рекомендуемая структура и версии окружения, перенос между рабочими местами](readme_development_environment_ru.md).
