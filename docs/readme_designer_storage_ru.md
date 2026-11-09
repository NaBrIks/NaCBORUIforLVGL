# Где хранятся данные Designer и Windows-демки

## Подтверждённая текущая реализация

| Данные | Designer (MAUI / SPLA) | Старый помощник графической демки |
|---|---|---|
| Ключ LLM | MAUI SecureStorage, логическое имя nacborui.openrouter.api-key | graphics-assistant.dpapi |
| Провайдер, API, модель, MCP | MAUI Preferences | Вместе с ключом в DPAPI-файле |
| Язык, тема, ширина панелей, reasoning | MAUI Preferences | Отдельные настройки демки |
| Чат, изображения, очередь | Память процесса; перезапуск очищает | Память Node-хоста |
| Системные инструкции | Встроенные EN resources Designer.Core | Общие файлы инструкций Windows player |
| Сам проект LVGL | На выбранном устройстве/хосте через явные MCP save-операции | Тот же ProjectService |

На Windows Designer собран unpackaged. MAUI 10.0.110 сохраняет зашифрованные
значения в `%LOCALAPPDATA%/<publisher>/org.nacborui.designer/Settings/securestorage.dat`,
обычные настройки — в соседнем preferences.dat. Папка Data — сестра Settings.
Сейчас publisher остался шаблонным `User Name` из Package.appxmanifest.
Исправление издателя должно сопровождаться переносом существующих настроек;
в этой проверке путь и ключи не менялись. SecureStorage использует Windows
DataProtectionProvider с LOCAL=user; dat-файл не является открытым API-ключом.

На Android ключ находится в закрытом shared preferences контейнере приложения
org.nacborui.designer, зашифрованном средствами MAUI/Android Keystore. Обычные
Preferences отделены от SecureStorage. Ничего из этого не включается в APK/репозиторий.

Windows-демка использует другой механизм: `%LOCALAPPDATA%/NaCBORUIforLVGL/graphics-assistant.dpapi`,
зашифрованный CryptProtectData для текущего пользователя. Модель и вызовы MCP
обрабатывает examples/windows_player/assistant.mjs в Node-хосте run.mjs; поля
на LVGL-экране и браузерная страница — интерфейсы к нему. Это не LLM-клиент внутри MCU.
После ранее разрешённого копирования ключа в Designer прежняя копия не удалялась.
Показатель «ключ сохранён» показывает наличие конфигурации, не раскрывает значение ключа.

Сохранённые проекты Windows player размещает под
`%LOCALAPPDATA%/NaCBORUIforLVGL/projects/<project-hash>/`, тему — в graphics-player.json.
Ключи, Preferences, активные проекты и история не пишутся в каталог исходников.

## Рекомендация, не выполненная миграция

Основной автономный агент — Designer.Core на SPLA в Windows/Android приложении.
Самостоятельность означает цикл prompt → модель → MCP → результат внутри приложения,
без внешнего Codex; доступ к облачной модели всё ещё требует сети.
LVGL runtime/MCU исполняет UI и предоставляет MCP/API, не нуждается в ключе LLM,
провайдере и собственной копии агентного движка.

Старый помощник демки полезен для проверки браузерного сценария, но сейчас это
второй движок/хранилище. Развивать два параллельно не рекомендуется. Следующий
отдельно согласованный шаг — убрать из обычного LVGL-примера настройки LLM либо
сделать их явно опциональными; браузерный UI затем подключить к общему SPLA-хосту.
Браузер, открытый прямо с MCU без такого хоста, требует собственного клиентского
исполнения агента (JS/WASM); перенос SPLA туда пока не исследован и не обещан.
В текущей проверке старый ключ не удалялся, агент демки не отключался.

Исходники MAUI: [tools/designer](../tools/designer/README.md). Обработка ключа:
App/Services/DesignerSessionAdapter.cs. Windows DPAPI: examples/windows_player/src/secret_protection.cpp.
Платформенный механизм: [MAUI SecureStorage](https://learn.microsoft.com/dotnet/maui/platform-integration/storage/secure-storage?view=net-maui-10.0).
