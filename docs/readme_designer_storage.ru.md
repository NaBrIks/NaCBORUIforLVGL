# Хранилища Designer и Windows-демки

## Designer (MAUI / SPLA)

| Данные | Хранение |
|---|---|
| Ключ LLM | MAUI SecureStorage, имя nacborui.openrouter.api-key |
| Провайдер, API, модель, MCP, язык/тема/ширина | MAUI Preferences |
| Чат, изображения, очередь | Память процесса; перезапуск очищает |
| Системные инструкции | EN resources Designer.Core, исходники tools/designer/prompts |
| Изменённый проект LVGL | На выбранном хосте/устройстве через явные MCP save-операции |

На unpackaged Windows это `%LOCALAPPDATA%/<publisher>/org.nacborui.designer/Settings/`:
securestorage.dat с зашифрованными значениями и соседний preferences.dat.
Сейчас publisher остаётся шаблонным `User Name` из Package.appxmanifest;
исправлять его нужно с миграцией существующих настроек, путь в этом изменении
не менялся. SecureStorage использует Windows DataProtectionProvider с LOCAL=user.
На Android ключ хранится в закрытом shared preferences контейнере приложения,
зашифрованном средствами MAUI/Android Keystore. В APK/репозиторий ключ не попадает.

## LVGL-демка

Агента, настроек LLM и хранилища ключа в демке больше нет. Её назначение —
рендеринг LVGL, источники/действия, события, MCP/API, кадры и независимый указатель.
Настройки демки — схемы, генератор и обычные demo-контролы.

Схема Windows хранится в `%LOCALAPPDATA%/NaCBORUIforLVGL/graphics-player.json`,
проекты — под projects/<project-hash>/ того же каталога. Прежний
`graphics-assistant.dpapi` больше не читается/создаётся; существующий файл можно
удалить без влияния на ключ Designer. В текущей локальной приёмке он удалён,
а неизменность отдельного SecureStorage Designer подтверждена сравнением хеша.

Реализованное разделение: агент — Designer.Core на SPLA, устройство — MCP/API.
Самостоятельная работа Designer не требует Codex, но облачная модель требует сети.
`/viewer` и `/editor/` на NaWServer остались браузерным просмотром и обычным
редактором проекта; собственного LLM-цикла там нет.

История старой реализации остаётся в Git. Общее требование AGENTS.md запрещает
создавать второй независимый стек/агент/хранилище без согласования с владельцем.

[Designer](../tools/designer/README.md),
[MAUI SecureStorage](https://learn.microsoft.com/dotnet/maui/platform-integration/storage/secure-storage?view=net-maui-10.0).
