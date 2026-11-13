# Встраивание редактора стилей Vue

`StyleSection.vue` — самостоятельный раздел первого уровня. `StyleGroup.vue` — самостоятельная группа второго уровня. Они не зависят от `App.vue`, HTTP/WS, localStorage или контроллера. Связь и автоприменение остаются задачей содержащего приложения.

`v-model` — объект свойств, например `{width:420,height:150}`. В него не входят `scope`, имя стиля и остальные поля пакета. Компоненты создают новый объект, сохраняют свойства вне редактируемого блока и снимают свойство при очистке. Принятый формат имён — тот же, что у кодека.

```vue
<script setup>
import {ref} from 'vue';
import StyleSection from './components/StyleSection.vue';
import StyleGroup from './components/StyleGroup.vue';
import './design/themes.css';
import './design/editor.css';
import './design/ui-tooltip.css';
import './design/ui-tooltip.js';
import './number-wheel.js';
const properties=ref({width:420,height:150});
</script>

<template>
  <!-- Вся геометрия -->
  <StyleSection section="geometry" v-model="properties" />

  <!-- Только размеры, без левой полосы и сворачивания -->
  <StyleGroup group="size" v-model="properties"
    :show-side="false" :collapsible="false" />

  <!-- Только данные и заголовки колонок тоже скрыты -->
  <StyleGroup group="size" v-model="properties"
    :show-side="false" :collapsible="false" :show-header="false" />
</template>
```

Пути импортов приведены относительно `frontend/src`; в другом приложении их нужно адаптировать. Нужны Vue, пакет `@lvgl-cbor/style-codec` и поддержка нативного CSS nesting (как в текущей Vite-сборке).

Разделы: `geometry`, `appearance`, `graphics`, `effects`, `layout`. Группы: `size`, `position`, `transform`, `padding`, `margin`, `background`, `border` и остальные ID из `editor-schema.js`. Группы с общей матрицей (`padding/margin`, `border/outline/shadow`) объединяются внутри раздела. Для изолированного отображения одной из таких групп можно передать `groups` с нужным набором описаний из `editorGroups`.

Параметры рамки: `showSide` — левая полоса и угловая ячейка; `collapsible` — кнопка сворачивания; `showHeader` — верхняя полоса. По умолчанию всё отображается и развёрнуто. При `showHeader=false` или `collapsible=false` данные остаются доступны даже если блок ранее был свёрнут. Скрытие левой стороны также скрывает кнопку в углу.

У раздела есть `query`, `group`, `onlyActive`, `resources`, а также `groupShowSide` и `groupCollapsible` для вложенных групп. На изменение `v-model` хост может реагировать отправкой CBOR. Поведение с ожиданием ответа и объединением новых изменений остаётся в `App.vue`.

## Общие правила обработки и CSS

- `field-input.js` — единая проверка чисел, HEX-цветов и битовых флагов. Пусто снимает значение, `0` сохраняется. Незаконченный или недопустимый числовой ввод не отправляется как удаление.
- `StyleValue.vue` — общий редактор по типу. `OptionalStyleValue.vue` — совместимая тонкая обёртка с `nullable=true`. Быстрые поля сохраняют прежний обязательный режим, матрицы — возможность очистки.
- `CornerFrame.vue` — общая рамка Grid 2×2, цвета уровней и сворачивание.
- `design/editor.css` — вложенный CSS только редактора; `design/shell.css` — оболочка приложения. `style.css` собирает импорты.
- `--editor-number-width`, `--editor-control-height`, `--editor-row-height`, `--editor-side-width`, `--editor-label-width` — общие размеры. Цвета уровней находятся в `design/themes.css`.

Для изолированного встраивания оболочка сайта и её меню не нужны. Шрифт/основные стили ввода задаются редактором через класс `style-controls`; хост может переопределить токены на своём контейнере.

## Экран и предпросмотр

`VirtualScreen.vue` принимает `screen`, `width`, `height`, `grid` (0 выключено), `zoom` (0 авто, иначе проценты) и `selected`. Выдаёт `select` с ID. ResizeObserver и масштаб принадлежат компоненту, сеть и localStorage — хосту.

`PreviewPanel.vue` добавляет управление разрешением/масштабом/сеткой. `PreviewNode.vue` рекурсивно отображает дерево через чистое преобразование `preview-style.js`. `ScreenEditor.vue` редактирует документ и выбор узла; хранение списка экранов вынесено в `state/screen-workspace.js`.

`DeviceTasks.vue` независим от состояния оболочки: получает `tasks`, `online`, `language` (ru/en). Сам сортирует строки; не опрашивает устройство.

`StyleSection` дополнительно принимает `excludeGroups` и `excludeFields`, чтобы хост мог заменить отдельные редакторы размерностей/массивов без копирования всех разделов.

`ScreenEditor` располагает дерево и свойства в отдельных колонках на всю высоту, с независимой прокруткой и разделителем ширины дерева. `ScreenNodeProperties` оформляет данные виджета, флаги, геометрию и компоновку общими `CornerFrame`. `StyleSection` предоставляет слот `before-groups` для размерностей с `%`/`content` и специальных редакторов компоновки.

`ScreenDimensionValue` принимает пиксели, проценты и `content`. Числовая часть меняется общей обработкой `number-wheel.js`: шаг 1, Shift — 10. `%` сохраняется; неполный ввод и `content` колесом не заменяются. Текст для встроенных образцов и создаваемых виджетов — латиница, без расширения шрифтов прошивки.

`PreviewActions` — общая панель применения, автоприменения и проверки. Подключается к слоту `PreviewPanel.actions` и не знает HTTP/CBOR или вида документа. Автоприменение стилей сохраняет прежнюю настройку; у экранов — отдельная настройка, изначально выключенная. Новые правки во время обработки пакета объединяются и отправляются после ACK.

`component-preview-link.js` согласует создание выбранного вида виджета на МК через `/component-ws` и последующее применение именованного стиля. Одновременно создаётся один экземпляр; ожидающие изменения получают последний выбранный тип/текст/размер. Тип и текст образца сохраняются вместе с настройками предпросмотра.
