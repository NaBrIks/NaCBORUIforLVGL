# Vue/Vite: устранение уязвимостей зависимостей

Дата: 2026-10-23.

## Изменения

| Пакет | До | После |
|---|---|---|
| Vue | 3.5.22 | 3.5.44 |
| @vue/server-renderer и остальные связанные @vue/* | 3.5.22 | 3.5.44 |
| Vite | 7.1.12 | 7.3.7 |

Прямые версии закреплены точно в frontend/package.json, дерево и integrity обновлены в package-lock.json. Major-версии прямых Vue/Vite не менялись. Требуемые транзитивные зависимости также обновлены: esbuild 0.25.12 → 0.28.2 и entities 4.5.0 → 7.0.1; они зафиксированы в lock-файле. @vitejs/plugin-vue 6.0.1 совместим с выбранными Vue/Vite и сохранён. `npm audit fix --force` и отключение аудита не использовались.

## Что означали три high

Аудит сообщал о трёх уязвимых **пакетах**, а не трёх независимых дефектах:

1. `@vue/server-renderer`: XSS при серверном рендеринге объекта v-bind с CR в имени атрибута; уязвимый диапазон по npm advisory — до 3.5.42. Установленная версия 3.5.44 отклоняет CR в isSSRSafeAttrName. Браузерный редактор использует клиентский createApp, SSR в нём не подключён.
2. `vue`: зависимая high-запись из-за того же server-renderer; исправляется согласованным обновлением Vue и его подмодулей.
3. `vite`: несколько advisory для dev-сервера и launch-editor: обходы ограничений файловой системы, чтение файлов через WebSocket, обработка Windows-путей и запуск редактора. Сборка статических файлов не запускает Vite dev-server на МК. Штатный режим разработки слушает loopback; это ограничивает сетевую доступность, но не заменяет обновление.

Исходный npm audit перечислял следующие прямые advisory; их количество не равно количеству package-записей:

| Advisory | Уровень | Описание upstream |
|---|---|---|
| [GHSA-g2v6-rqmx-r4w6](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6) | high | @vue/server-renderer: XSS via missing CR in attribute-name blacklist |
| [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) | moderate | Vite Vulnerable to Path Traversal in Optimized Deps `.map` Handling |
| [GHSA-v2wj-q39q-566r](https://github.com/advisories/GHSA-v2wj-q39q-566r) | high | Vite: `server.fs.deny` bypassed with queries |
| [GHSA-p9ff-h696-f583](https://github.com/advisories/GHSA-p9ff-h696-f583) | high | Vite Vulnerable to Arbitrary File Read via Vite Dev Server WebSocket |
| [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) | moderate | launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows |
| [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | high | vite: `server.fs.deny` bypass on Windows alternate paths |
| [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv) | moderate | launch-editor: escapeCmdArgs() omits % escaping on Windows |
| [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) | moderate | launch-editor: Editor CLI flag misinterpretation causing arbitrary command execution for some editors |
| [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) | high | launch-editor: `fs.existsSync()` existence check can be bypassed on Windows |
| [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) | low | Vite: Cross origin script execution through Vite custom middleware |
| [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) | moderate | Vite: Files outside `server.fs.allow` could be served when project paths match system paths on non-Windows machine |

## Проверки

Симулятор не объявляет живой источник system.clock: ожидаемое сообщение о неизвестном источнике в форме биндинга не подтверждает работу часов или реального источника. Аппаратные биндинги, LCD и прошивка устройства в этой проверке не испытывались. Сетевые настройки и NTP не менялись.

Посторонняя локальная BLE-правка не включается в этот коммит; контрольная сумма файла проверяется до и после работы. Исходные audit JSON, локальные smoke-скрипты и снимок редактора остаются в игнорируемом local/, без параметров окружения в публичном отчёте.
