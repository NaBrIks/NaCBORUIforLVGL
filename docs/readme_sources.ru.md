# Внешние источники и лицензии

**Текущее решение 2026-10-30:** собственный код правообладателя Oleg Kozhevnikov
предлагается под MIT, включая его прежние frontend/RGB-адаптации из собственного
ESP32-yaidfws. Root и вложенные LICENSE/metadata обновлены по прямому решению
владельца. Таблицы и записи GPL ниже описывают предыдущие состояния на свои даты.
Лицензии сторонних материалов не менялись; действующий [реестр исключений](../LICENSES.md)
сохраняет Tabler, LilyGO, LVGL, шрифты и условия внешних зависимостей.

Для перенесённых RGB reset/init-фрагментов отдельно сохранена перефайловая
CC0-1.0 Espressif 2022 из Waveshare, а не корневая Apache производителя:
[pinned источник, цепочка происхождения и полный CC0](../THIRD_PARTY_NOTICES.md).
`board.cpp` отмечен `MIT AND CC0-1.0`; собственные остальные части — MIT.

Исследовательские источники и реестр фактически используемых зависимостей. XML-движок в собственный исполнитель не переносился.

- [LVGL 9.4 XML: исходники](https://github.com/lvgl/lvgl/tree/v9.4.0/src/others/xml).
- [LVGL 9.4: MIT](https://github.com/lvgl/lvgl/blob/v9.4.0/LICENCE.txt).
- [Встроенный Expat LVGL 9.4](https://github.com/lvgl/lvgl/tree/v9.4.0/src/libs/expat).
- [Изменение статуса XML с LVGL 9.5](https://lvgl.io/blog/announcement-lv_xml-removal-from-v9-5).
- [TinyCBOR](https://github.com/intel/tinycbor) и [MIT-лицензия](https://github.com/intel/tinycbor/blob/main/LICENSE).
- [Компонент espressif/cbor](https://components.espressif.com/components/espressif/cbor).

Собственная реализация исполнителя с TinyCBOR и LVGL не требует XML-движка Pro. При включении стороннего кода необходимо учитывать лицензию именно выбранной версии и сохранять обязательные уведомления. Преобразование формата не отменяет лицензию скопированного кода.

Для текущего дерева см. [MIT и реестр исключений](../LICENSES.md). Датированные записи ниже сохраняют сведения о происхождении и прежнем лицензировании.

## Первая реализация, 2026-10-21

| Часть | Версия / происхождение | Лицензия и место уведомления |
|---|---|---|
| LVGL | 9.6.0, IDF managed component `lvgl/lvgl` | MIT, `managed_components/lvgl__lvgl/LICENCE.txt` |
| TinyCBOR | `espressif/cbor` 0.6.1~4, IDF managed component | MIT, LICENSE компонента и `tinycbor/LICENSE` |
| HTTP/WS сервер | Историческое имя компонента `ESP32-yaidfws`, ныне [NaWServer](https://github.com/KOE73/NaWServer) | На дату этой реализации GPL-3.0-only, `idf_component.yml` и LICENSE исходного проекта |
| Плата и дисплей демки | Адаптация `examples/touch_lcd7/main/board.cpp`, `graphics.cpp` того же проекта, текущая интеграция LVGL 9.6 | GPL-3.0-only, `examples/s3_style_lab/LICENSE` |
| Оболочка фронтенда | Адаптированы themes, appearance state/menu, Icon, tooltip и CSS из `examples/touch_lcd7/frontend/src` | GPL-3.0-only, `frontend/LICENSE`; CSS сокращён до нужной заготовки |
| Локальные иконки Tabler | Перенесены вместе с исходной оболочкой | Уведомление `frontend/src/design/icons/LICENSE.txt` |
| JS CBOR | cborg 6.1.3 (style/screen) и 4.5.8 (project), из npm lock | Apache-2.0, copyright 2020 Rod Vagg; одинаковые package notices, `LICENSES/Apache-2.0.txt` |
| UI и сборка | Vue 3.5.22, Vite 7.1.12, @vitejs/plugin-vue 6.0.1 | Уведомления соответствующих npm-пакетов; точные зависимости в package-lock.json |

На дату первой реализации GPL относилась к серверу и тогдашним версиям
адаптированных файлов. Позже правообладатель предоставил свой код под MIT,
сохранив сторонние уведомления.

## Граница прикладных библиотек, 2026-10-23

Ранее проверявшийся Bluetooth-пример удалён из проекта UI по решению владельца. Его исходники, тесты и руководство передаются в проект соответствующей библиотеки. Bluetooth-кода и зависимости от библиотеки сканирования в текущем дереве нет. Исторические отчёты описывают прежний эксперимент, а не текущую функциональность.

Touch использует `espressif/esp_lcd_touch` 1.2.1 и `espressif/esp_lcd_touch_gt911` 1.1.3 (Apache-2.0; уведомления в managed components). Подключение и разводка адаптированы из того же GPL-примера `ESP32-yaidfws/examples/touch_lcd7`; исходники самого драйвера не копировались.

## Каталог API, 2026-10-22

`widget_api_lvgl_9_6.html` и `.data.json` сгенерированы из публичных заголовков и таблиц операций локального LVGL 9.6.0. Имена, сигнатуры и англоязычные пояснения происходят из LVGL (MIT); [исходники и уведомление LVGL](https://github.com/lvgl/lvgl/blob/v9.6.0/LICENCE.txt). Точные файлы и SHA256 перечислены в данных каталога. Русская классификация наборов и генератор написаны в этом проекте.

## Миграция сервера, 2026-10-23

Зависимость переименована из ESP32-yaidfws в NaWServer. Адаптеры находятся
в `integrations/nawserver`. Старая ревизия сервера имела GPL-3.0-only.
Условия выбранной ревизии внешнего сервера определяет его LICENSE.

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

## Подготовка переноса в NaBrIks, 2026-10-30

Собственные frontend/RGB-адаптации включены в решение правообладателя
о MIT от 2026-10-30. Уведомления и условия сторонних материалов сохранены
в [реестре исключений](../LICENSES.md) и [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
