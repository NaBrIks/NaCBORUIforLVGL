# Внешние источники и лицензии

Исследовательские источники и реестр фактически используемых зависимостей. XML-движок в собственный исполнитель не переносился.

- [LVGL 9.4 XML: исходники](https://github.com/lvgl/lvgl/tree/v9.4.0/src/others/xml).
- [LVGL 9.4: MIT](https://github.com/lvgl/lvgl/blob/v9.4.0/LICENCE.txt).
- [Встроенный Expat LVGL 9.4](https://github.com/lvgl/lvgl/tree/v9.4.0/src/libs/expat).
- [Изменение статуса XML с LVGL 9.5](https://lvgl.io/blog/announcement-lv_xml-removal-from-v9-5).
- [TinyCBOR](https://github.com/intel/tinycbor) и [MIT-лицензия](https://github.com/intel/tinycbor/blob/main/LICENSE).
- [Компонент espressif/cbor](https://components.espressif.com/components/espressif/cbor).

Собственная реализация исполнителя с TinyCBOR и LVGL не требует XML-движка Pro. При включении стороннего кода необходимо учитывать лицензию именно выбранной версии и сохранять обязательные уведомления. Преобразование формата не отменяет лицензию скопированного кода.

Самостоятельный код NaCBORUIforLVGL распространяется по [MIT](../LICENSE), по решению владельца от 2026-10-23. [Области действия и исключения](../LICENSES.md) сохраняют GPL-3.0-only адаптированных фронтенда и аппаратного примера, а также уведомления прочих зависимостей.

## Первая реализация, 2026-10-21

| Часть | Версия / происхождение | Лицензия и место уведомления |
|---|---|---|
| LVGL | 9.6.0, IDF managed component `lvgl/lvgl` | MIT, `managed_components/lvgl__lvgl/LICENCE.txt` |
| TinyCBOR | `espressif/cbor` 0.6.1~4, IDF managed component | MIT, LICENSE компонента и `tinycbor/LICENSE` |
| HTTP/WS сервер | Компонент `ESP32-yaidfws`, [исходный проект](https://github.com/KOE73/ESP32-yaidfws) | GPL-3.0-only, `idf_component.yml` и LICENSE исходного проекта |
| Плата и дисплей демки | Адаптация `examples/touch_lcd7/main/board.cpp`, `graphics.cpp` того же проекта, текущая интеграция LVGL 9.6 | GPL-3.0-only, `examples/s3_style_lab/LICENSE` |
| Оболочка фронтенда | Адаптированы themes, appearance state/menu, Icon, tooltip и CSS из `examples/touch_lcd7/frontend/src` | GPL-3.0-only, `frontend/LICENSE`; CSS сокращён до нужной заготовки |
| Локальные иконки Tabler | Перенесены вместе с исходной оболочкой | Уведомление `frontend/src/design/icons/LICENSE.txt` |
| JS CBOR | cborg 6.1.3 из npm | MIT, `node_modules/cborg/LICENSE` |
| UI и сборка | Vue 3.5.22, Vite 7.1.12, @vitejs/plugin-vue 6.0.1 | Уведомления соответствующих npm-пакетов; точные зависимости в package-lock.json |

Кодек и C++-исполнитель написаны отдельно; они вызывают публичные API LVGL и TinyCBOR. GPL-демка использует GPL-сервер и адаптированные файлы, поэтому её нельзя описывать как полностью независимый MIT-пример. Для самостоятельных исходников ядра 2026-10-23 выбрана MIT. Сторонний и адаптированный код не перелицензирован; публикация репозитория пока не выполнялась.

## Граница прикладных библиотек, 2026-10-23

Ранее проверявшийся Bluetooth-пример удалён из проекта UI по решению владельца. Его исходники, тесты и руководство передаются в проект соответствующей библиотеки. Bluetooth-кода и зависимости от библиотеки сканирования в текущем дереве нет. Исторические отчёты описывают прежний эксперимент, а не текущую функциональность.

Touch использует `espressif/esp_lcd_touch` 1.2.1 и `espressif/esp_lcd_touch_gt911` 1.1.3 (Apache-2.0; уведомления в managed components). Подключение и разводка адаптированы из того же GPL-примера `ESP32-yaidfws/examples/touch_lcd7`; исходники самого драйвера не копировались.

## Каталог API, 2026-10-22

`widget_api_lvgl_9_6.html` и `.data.json` сгенерированы из публичных заголовков и таблиц операций локального LVGL 9.6.0. Имена, сигнатуры и англоязычные пояснения происходят из LVGL (MIT); [исходники и уведомление LVGL](https://github.com/lvgl/lvgl/blob/v9.6.0/LICENCE.txt). Точные файлы и SHA256 перечислены в данных каталога. Русская классификация наборов и генератор написаны в этом проекте.

## Миграция сервера, 2026-10-23

Текущая зависимость — NaWServer, переименованный ESP32-yaidfws. Компонент, include и namespace обновлены; адаптеры находятся в `integrations/nawserver`. Репозиторий NaWServer пока приватный. Его `idf_component.yml` по-прежнему объявляет GPL-3.0-only; переименование не меняет лицензию и происхождение ранее адаптированных файлов. Самостоятельное ядро, кодеки и MCP — MIT; фронтенд и аппаратная демка сохраняют GPL.

## Обновление UI-зависимостей, 2026-10-23

Текущие версии: Vue 3.5.44 и Vite 7.3.7; @vitejs/plugin-vue 6.0.1 сохранён. Связанные @vue/* обновлены согласованно. Исправлены отмеченные npm audit записи; [advisory, область применимости и результаты проверок](reviews/REVIEW_20261023_vue-vite-security.md). Лицензии и происхождение кода не меняются.

## Независимый T-Display-S3 target, 2026-10-30

`examples/lilygo_t_display_s3` и `examples/common` — MIT. Распиновка и параметры
инициализации ST7789 адаптированы из официальных MIT-материалов
[LilyGo-Display-IDF](https://github.com/Xinyuan-LilyGO/LilyGo-Display-IDF/blob/master/main/display_s3.c)
и [T-Display-S3](https://github.com/Xinyuan-LilyGO/T-Display-S3/blob/main/examples/tft/pin_config.h).
Авторское уведомление и текст MIT сохранены в `examples/lilygo_t_display_s3/NOTICE`.
Драйвер использует публичный esp_lcd ESP-IDF 5.5.6 (Apache-2.0); GPL-адаптация
большой RGB-платы и оболочка редактора в этот target не входят.

LVGL 9.6.0 / espressif-cbor 0.6.1~4 переиспользуются как исходные компоненты;
новых копий библиотек в Git нет. Общие Appearance и DemoData написаны в этом
проекте. Для USB-тестов используется внешний pyserial (BSD-3-Clause), устанавливаемый
в окружение Python; его исходники не копируются в репозиторий.

## Системные показатели Windows (добавлено 2026-10-30)

Пример `examples/windows_player/src/system_metrics.cpp` — собственный MIT-код,
использующий штатные Windows SDK API PDH/DXGI/GlobalMemoryStatusEx. Сторонние
реализации, vendor SDK, WMI и новые пакеты не добавлялись; системные DLL и файлы
Segoe UI в репозиторий не копируются. Первичные API-справочники и семантика
показателей перечислены в [отчёте](reviews/REVIEW_20261030_windows-system.md).
