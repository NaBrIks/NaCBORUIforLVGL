# Разметка LVGL: полный справочник JSON

## overview

Все 12 встроенных типов и их поддерживаемые методы перечислены ниже. Это документация JSON-языка приложения, не бинарного протокола. Дополнительные нативные компоненты и фактическую доступность сообщает get_device. Методы LVGL, которых здесь нет и которые устройство не объявляет, пока не представлены в JSON.

LVGL: https://docs.lvgl.io/

Экран: {format:"lvgl-screen-draft-1",id,name,size:{width,height},theme:"device" или "none",styles:{имя:{props}},root:узел}. Узел: {id,type,props,common,flags,style,styles,styleRules,children,bindings,events,view}. id уникален внутри экрана. type создаёт объект; children создаются с этим объектом в качестве родителя. props вызывает методы компонента, common — общие методы объекта. Получатель метода и родитель не передаются отдельными JSON-аргументами. Один аргумент передаётся значением, несколько — массивом в порядке C-метода. Ресурсные аргументы — имена из каталога устройства.

style содержит свойства локального оформления. styles — упорядоченный список {ref,part?,state?}; styleRules — список {part?,state?,props}. Полный справочник оформления расположен в assistant-styles-reference.ru.md. size описывает проектный viewport; реальные размеры дисплея/контейнера узнаются из проекта и get_device.

Проект: {format:"lvgl-project-1",manifest:{id,name,entry},screens:{id:экран},styles:{имя:стиль}}. Ключи совпадают с идентификаторами документов. Сохранение и показ разделены инструментами.

## common

| LVGL | JSON | Параметры / допустимые значения |
| --- | --- | --- |
| `"lv_obj_add_flag"` | `{"common":{"add_flags":0}}` | `{"parameters":["lv_obj_flag_t"],"min":0,"max":2147483647}` |
| `"lv_obj_remove_flag"` | `{"common":{"remove_flags":0}}` | `{"parameters":["lv_obj_flag_t"],"min":0,"max":2147483647}` |
| `"lv_obj_add_state"` | `{"common":{"add_state":0}}` | `{"parameters":["lv_state_t"],"mask":62461}` |
| `"lv_obj_remove_state"` | `{"common":{"remove_state":0}}` | `{"parameters":["lv_state_t"],"mask":62461}` |
| `"lv_obj_set_scrollbar_mode"` | `{"common":{"scrollbar_mode":0}}` | `{"parameters":["lv_scrollbar_mode_t"],"values":[0,1,2,3]}` |
| `"lv_obj_set_scroll_dir"` | `{"common":{"scroll_dir":0}}` | `{"parameters":["lv_dir_t"],"min":0,"max":15}` |
| `"lv_obj_set_state"` | `{"common":{"state":[0,false]}}` | `{"parameters":["lv_state_t","bool"]}` |
| `"lv_obj_set_flag"` | `{"common":{"flag":[0,false]}}` | `{"parameters":["lv_obj_flag_t","bool"]}` |

common использует числовые маски/значения, не строки с именами C-констант. Удобная форма flags:{SCROLLABLE:false,CLICKABLE:true} использует имена из раздела flags.

## obj

Создание: `"lv_obj_create"` → `{"type":"obj"}`.

Методов props нет; общие методы и стили доступны.

События и тип event.value: `[{"name":"clicked"},{"name":"value_changed"},{"name":"ready"},{"name":"long_pressed"}]`

## label

Создание: `"lv_label_create"` → `{"type":"label"}`.

| LVGL | JSON | Параметры / допустимые значения |
| --- | --- | --- |
| `"lv_label_set_text"` | `{"props":{"text":""}}` | `{"parameters":["text"]}` |
| `"lv_label_set_long_mode"` | `{"props":{"long_mode":0}}` | `{"parameters":["lv_label_long_mode_t"],"values":[0,1,2,3,4]}` |
| `"lv_label_set_max_lines"` | `{"props":{"max_lines":0}}` | `{"parameters":["int32_t"],"min":0,"max":32767}` |

События и тип event.value: `[{"name":"clicked"},{"name":"value_changed"},{"name":"ready"},{"name":"long_pressed"}]`

## button

Создание: `"lv_button_create"` → `{"type":"button"}`.

Методов props нет; общие методы и стили доступны.

События и тип event.value: `[{"name":"clicked"},{"name":"value_changed"},{"name":"ready"},{"name":"long_pressed"}]`

## bar

Создание: `"lv_bar_create"` → `{"type":"bar"}`.

| LVGL | JSON | Параметры / допустимые значения |
| --- | --- | --- |
| `"lv_bar_set_range"` | `{"props":{"range":[0,0]}}` | `{"parameters":["int32_t","int32_t"],"constraint":"ascending"}` |
| `"lv_bar_set_value"` | `{"props":{"value":0}}` | `{"parameters":["int32_t"],"implicitArguments":["LV_ANIM_OFF"]}` |

События и тип event.value: `[{"name":"clicked"},{"name":"value_changed","value":{"type":"integer"}},{"name":"ready"},{"name":"long_pressed"}]`

## slider

Создание: `"lv_slider_create"` → `{"type":"slider"}`.

| LVGL | JSON | Параметры / допустимые значения |
| --- | --- | --- |
| `"lv_slider_set_range"` | `{"props":{"range":[0,0]}}` | `{"parameters":["int32_t","int32_t"],"constraint":"ascending"}` |
| `"lv_slider_set_value"` | `{"props":{"value":0}}` | `{"parameters":["int32_t"],"implicitArguments":["LV_ANIM_OFF"]}` |
| `"lv_slider_set_start_value"` | `{"props":{"start_value":0}}` | `{"parameters":["int32_t"],"implicitArguments":["LV_ANIM_OFF"]}` |

События и тип event.value: `[{"name":"clicked"},{"name":"value_changed","value":{"type":"integer"}},{"name":"ready"},{"name":"long_pressed"}]`

## arc

Создание: `"lv_arc_create"` → `{"type":"arc"}`.

| LVGL | JSON | Параметры / допустимые значения |
| --- | --- | --- |
| `"lv_arc_set_range"` | `{"props":{"range":[0,0]}}` | `{"parameters":["int32_t","int32_t"],"constraint":"ascending"}` |
| `"lv_arc_set_value"` | `{"props":{"value":0}}` | `{"parameters":["int32_t"]}` |
| `"lv_arc_set_angles"` | `{"props":{"angles":[0,0]}}` | `{"parameters":["lv_value_precise_t","lv_value_precise_t"],"min":0,"max":360}` |
| `"lv_arc_set_bg_angles"` | `{"props":{"bg_angles":[0,0]}}` | `{"parameters":["lv_value_precise_t","lv_value_precise_t"],"min":0,"max":360}` |
| `"lv_arc_set_rotation"` | `{"props":{"rotation":0}}` | `{"parameters":["int32_t"],"min":0,"max":360}` |
| `"lv_arc_set_mode"` | `{"props":{"mode":0}}` | `{"parameters":["lv_arc_mode_t"],"values":[0,1,2]}` |

События и тип event.value: `[{"name":"clicked"},{"name":"value_changed","value":{"type":"integer"}},{"name":"ready"},{"name":"long_pressed"}]`

## line

Создание: `"lv_line_create"` → `{"type":"line"}`.

| LVGL | JSON | Параметры / допустимые значения |
| --- | --- | --- |
| `"lv_line_set_points"` | `{"props":{"points":[[0,0],[1,1]]}}` | `{"parameters":["points"]}` |

События и тип event.value: `[{"name":"clicked"},{"name":"value_changed"},{"name":"ready"},{"name":"long_pressed"}]`

## image

Создание: `"lv_image_create"` → `{"type":"image"}`.

| LVGL | JSON | Параметры / допустимые значения |
| --- | --- | --- |
| `"lv_image_set_src"` | `{"props":{"src":"registered_resource"}}` | `{"parameters":["resource"]}` |
| `"lv_image_set_scale"` | `{"props":{"scale":1}}` | `{"parameters":["uint32_t"],"min":1,"max":65535}` |
| `"lv_image_set_rotation"` | `{"props":{"rotation":0}}` | `{"parameters":["int32_t"],"min":-3600,"max":3600}` |

События и тип event.value: `[{"name":"clicked"},{"name":"value_changed"},{"name":"ready"},{"name":"long_pressed"}]`

## checkbox

Создание: `"lv_checkbox_create"` → `{"type":"checkbox"}`.

| LVGL | JSON | Параметры / допустимые значения |
| --- | --- | --- |
| `"lv_checkbox_set_text"` | `{"props":{"text":""}}` | `{"parameters":["text"]}` |

События и тип event.value: `[{"name":"clicked"},{"name":"value_changed","value":{"type":"bool"}},{"name":"ready"},{"name":"long_pressed"}]`

## switch

Создание: `"lv_switch_create"` → `{"type":"switch"}`.

Методов props нет; общие методы и стили доступны.

События и тип event.value: `[{"name":"clicked"},{"name":"value_changed","value":{"type":"bool"}},{"name":"ready"},{"name":"long_pressed"}]`

## textarea

Создание: `"lv_textarea_create"` → `{"type":"textarea"}`.

| LVGL | JSON | Параметры / допустимые значения |
| --- | --- | --- |
| `"lv_textarea_set_text"` | `{"props":{"text":""}}` | `{"parameters":["text"]}` |
| `"lv_textarea_set_max_length"` | `{"props":{"max_length":0}}` | `{"parameters":["uint32_t"],"max":65535}` |
| `"lv_textarea_set_one_line"` | `{"props":{"one_line":false}}` | `{"parameters":["bool"]}` |
| `"lv_textarea_set_password_mode"` | `{"props":{"password_mode":false}}` | `{"parameters":["bool"]}` |

События и тип event.value: `[{"name":"clicked"},{"name":"value_changed","value":{"type":"text"}},{"name":"ready"},{"name":"long_pressed"}]`

## dropdown

Создание: `"lv_dropdown_create"` → `{"type":"dropdown"}`.

| LVGL | JSON | Параметры / допустимые значения |
| --- | --- | --- |
| `"lv_dropdown_set_options"` | `{"props":{"options":["One","Two"]}}` | `{"parameters":["text"]}` |
| `"lv_dropdown_set_selected"` | `{"props":{"selected":0}}` | `{"parameters":["uint32_t"],"max":65535}` |
| `"lv_dropdown_set_dir"` | `{"props":{"direction":1}}` | `{"parameters":["lv_dir_t"],"values":[1,2,4,8]}` |

События и тип event.value: `[{"name":"clicked"},{"name":"value_changed","value":{"type":"integer"}},{"name":"ready"},{"name":"long_pressed"}]`

## authoring-shortcuts

button.props.text создаёт дочернюю центрированную label; явные children тоже поддерживаются. checkbox/switch.props.checked — boolean начального состояния. bar/slider/arc.props.min и max задают range; также поддерживается props.range:[min,max], одновременно обе формы не задаются. dropdown.props.options — массив строк, selected — индекс с нуля. image.props.src — имя доступного ресурса; пустой src пропускается. textarea — текстовый ввод, one_line и max_length поддерживаются. Число вводится как строка и проверяется приложением; отдельного spinbox, фильтра accepted_chars и автоматического преобразования text→number сейчас нет. Встроенная экранная клавиатура не создаётся автоматически.

## enumerations

В props/common перечисления сейчас передаются ЧИСЛАМИ. Таблицы ниже объясняют соответствие имён LVGL этим значениям; строки имён здесь не принимаются. В style символические имена поддерживаются, см. справочник стилей.

### lv_label_long_mode_t

| LVGL-константа | JSON-значение |
| --- | --- |
| `"LV_LABEL_LONG_MODE_WRAP"` | `0` |
| `"LV_LABEL_LONG_MODE_DOTS"` | `1` |
| `"LV_LABEL_LONG_MODE_SCROLL"` | `2` |
| `"LV_LABEL_LONG_MODE_SCROLL_CIRCULAR"` | `3` |
| `"LV_LABEL_LONG_MODE_CLIP"` | `4` |

### lv_scrollbar_mode_t

| LVGL-константа | JSON-значение |
| --- | --- |
| `"LV_SCROLLBAR_MODE_OFF"` | `0` |
| `"LV_SCROLLBAR_MODE_ON"` | `1` |
| `"LV_SCROLLBAR_MODE_ACTIVE"` | `2` |
| `"LV_SCROLLBAR_MODE_AUTO"` | `3` |

### lv_arc_mode_t

| LVGL-константа | JSON-значение |
| --- | --- |
| `"LV_ARC_MODE_NORMAL"` | `0` |
| `"LV_ARC_MODE_SYMMETRICAL"` | `1` |
| `"LV_ARC_MODE_REVERSE"` | `2` |

### lv_dir_t

| LVGL-константа | JSON-значение |
| --- | --- |
| `"LV_DIR_NONE"` | `0` |
| `"LV_DIR_LEFT"` | `1` |
| `"LV_DIR_RIGHT"` | `2` |
| `"LV_DIR_TOP"` | `4` |
| `"LV_DIR_BOTTOM"` | `8` |
| `"LV_DIR_HOR"` | `3` |
| `"LV_DIR_VER"` | `12` |
| `"LV_DIR_ALL"` | `15` |

### lv_obj_flag_t

| LVGL-константа | JSON-значение |
| --- | --- |
| `"LV_OBJ_FLAG_HIDDEN"` | `1` |
| `"LV_OBJ_FLAG_CLICKABLE"` | `2` |
| `"LV_OBJ_FLAG_CLICK_FOCUSABLE"` | `4` |
| `"LV_OBJ_FLAG_CHECKABLE"` | `8` |
| `"LV_OBJ_FLAG_SCROLLABLE"` | `16` |
| `"LV_OBJ_FLAG_SCROLL_ELASTIC"` | `32` |
| `"LV_OBJ_FLAG_SCROLL_MOMENTUM"` | `64` |
| `"LV_OBJ_FLAG_SCROLL_ONE"` | `128` |
| `"LV_OBJ_FLAG_SCROLL_CHAIN_HOR"` | `256` |
| `"LV_OBJ_FLAG_SCROLL_CHAIN_VER"` | `512` |
| `"LV_OBJ_FLAG_SCROLL_ON_FOCUS"` | `1024` |
| `"LV_OBJ_FLAG_SCROLL_WITH_ARROW"` | `2048` |
| `"LV_OBJ_FLAG_SNAPPABLE"` | `4096` |
| `"LV_OBJ_FLAG_PRESS_LOCK"` | `8192` |
| `"LV_OBJ_FLAG_EVENT_BUBBLE"` | `16384` |
| `"LV_OBJ_FLAG_GESTURE_BUBBLE"` | `32768` |
| `"LV_OBJ_FLAG_ADV_HITTEST"` | `65536` |
| `"LV_OBJ_FLAG_IGNORE_LAYOUT"` | `131072` |
| `"LV_OBJ_FLAG_FLOATING"` | `262144` |
| `"LV_OBJ_FLAG_SEND_DRAW_TASK_EVENTS"` | `524288` |
| `"LV_OBJ_FLAG_OVERFLOW_VISIBLE"` | `1048576` |
| `"LV_OBJ_FLAG_EVENT_TRICKLE"` | `2097152` |
| `"LV_OBJ_FLAG_STATE_TRICKLE"` | `4194304` |
| `"LV_OBJ_FLAG_FLEX_IN_NEW_TRACK"` | `8388608` |
| `"LV_OBJ_FLAG_USER_1"` | `134217728` |
| `"LV_OBJ_FLAG_USER_2"` | `268435456` |
| `"LV_OBJ_FLAG_USER_3"` | `536870912` |
| `"LV_OBJ_FLAG_USER_4"` | `1073741824` |

### lv_state_t

| LVGL-константа | JSON-значение |
| --- | --- |
| `"LV_STATE_DEFAULT"` | `0` |
| `"LV_STATE_ALT"` | `1` |
| `"LV_STATE_CHECKED"` | `4` |
| `"LV_STATE_FOCUSED"` | `8` |
| `"LV_STATE_FOCUS_KEY"` | `16` |
| `"LV_STATE_EDITED"` | `32` |
| `"LV_STATE_HOVERED"` | `64` |
| `"LV_STATE_PRESSED"` | `128` |
| `"LV_STATE_SCROLLED"` | `256` |
| `"LV_STATE_DISABLED"` | `512` |
| `"LV_STATE_USER_1"` | `4096` |
| `"LV_STATE_USER_2"` | `8192` |
| `"LV_STATE_USER_3"` | `16384` |
| `"LV_STATE_USER_4"` | `32768` |

## parts

Форма: `{"part":"INDICATOR"}`.

| LVGL | Имя в JSON |
| --- | --- |
| `"LV_PART_MAIN"` | `"MAIN"` |
| `"LV_PART_SCROLLBAR"` | `"SCROLLBAR"` |
| `"LV_PART_INDICATOR"` | `"INDICATOR"` |
| `"LV_PART_KNOB"` | `"KNOB"` |
| `"LV_PART_SELECTED"` | `"SELECTED"` |
| `"LV_PART_ITEMS"` | `"ITEMS"` |
| `"LV_PART_CURSOR"` | `"CURSOR"` |

## states

Форма: `{"state":["CHECKED"]}`.

| LVGL | Имя в JSON |
| --- | --- |
| `"LV_STATE_ALT"` | `"ALT"` |
| `"LV_STATE_CHECKED"` | `"CHECKED"` |
| `"LV_STATE_FOCUSED"` | `"FOCUSED"` |
| `"LV_STATE_FOCUS_KEY"` | `"FOCUS_KEY"` |
| `"LV_STATE_EDITED"` | `"EDITED"` |
| `"LV_STATE_HOVERED"` | `"HOVERED"` |
| `"LV_STATE_PRESSED"` | `"PRESSED"` |
| `"LV_STATE_SCROLLED"` | `"SCROLLED"` |
| `"LV_STATE_DISABLED"` | `"DISABLED"` |
| `"LV_STATE_USER_1"` | `"USER_1"` |
| `"LV_STATE_USER_2"` | `"USER_2"` |
| `"LV_STATE_USER_3"` | `"USER_3"` |
| `"LV_STATE_USER_4"` | `"USER_4"` |

DEFAULT задаётся пустым state:[]; префиксы LV_PART_ и LV_STATE_ тоже принимаются в селекторах.

## flags

Форма: `{"flags":{"SCROLLABLE":false}}`.

| LVGL | Имя в JSON |
| --- | --- |
| `"LV_OBJ_FLAG_HIDDEN"` | `"HIDDEN"` |
| `"LV_OBJ_FLAG_CLICKABLE"` | `"CLICKABLE"` |
| `"LV_OBJ_FLAG_CLICK_FOCUSABLE"` | `"CLICK_FOCUSABLE"` |
| `"LV_OBJ_FLAG_CHECKABLE"` | `"CHECKABLE"` |
| `"LV_OBJ_FLAG_SCROLLABLE"` | `"SCROLLABLE"` |
| `"LV_OBJ_FLAG_SCROLL_ELASTIC"` | `"SCROLL_ELASTIC"` |
| `"LV_OBJ_FLAG_SCROLL_MOMENTUM"` | `"SCROLL_MOMENTUM"` |
| `"LV_OBJ_FLAG_SCROLL_ONE"` | `"SCROLL_ONE"` |
| `"LV_OBJ_FLAG_SCROLL_CHAIN_HOR"` | `"SCROLL_CHAIN_HOR"` |
| `"LV_OBJ_FLAG_SCROLL_CHAIN_VER"` | `"SCROLL_CHAIN_VER"` |
| `"LV_OBJ_FLAG_SCROLL_ON_FOCUS"` | `"SCROLL_ON_FOCUS"` |
| `"LV_OBJ_FLAG_SCROLL_WITH_ARROW"` | `"SCROLL_WITH_ARROW"` |
| `"LV_OBJ_FLAG_SNAPPABLE"` | `"SNAPPABLE"` |
| `"LV_OBJ_FLAG_PRESS_LOCK"` | `"PRESS_LOCK"` |
| `"LV_OBJ_FLAG_EVENT_BUBBLE"` | `"EVENT_BUBBLE"` |
| `"LV_OBJ_FLAG_GESTURE_BUBBLE"` | `"GESTURE_BUBBLE"` |
| `"LV_OBJ_FLAG_ADV_HITTEST"` | `"ADV_HITTEST"` |
| `"LV_OBJ_FLAG_IGNORE_LAYOUT"` | `"IGNORE_LAYOUT"` |
| `"LV_OBJ_FLAG_FLOATING"` | `"FLOATING"` |
| `"LV_OBJ_FLAG_SEND_DRAW_TASK_EVENTS"` | `"SEND_DRAW_TASK_EVENTS"` |
| `"LV_OBJ_FLAG_OVERFLOW_VISIBLE"` | `"OVERFLOW_VISIBLE"` |
| `"LV_OBJ_FLAG_EVENT_TRICKLE"` | `"EVENT_TRICKLE"` |
| `"LV_OBJ_FLAG_STATE_TRICKLE"` | `"STATE_TRICKLE"` |
| `"LV_OBJ_FLAG_FLEX_IN_NEW_TRACK"` | `"FLEX_IN_NEW_TRACK"` |
| `"LV_OBJ_FLAG_USER_1"` | `"USER_1"` |
| `"LV_OBJ_FLAG_USER_2"` | `"USER_2"` |
| `"LV_OBJ_FLAG_USER_3"` | `"USER_3"` |
| `"LV_OBJ_FLAG_USER_4"` | `"USER_4"` |

## bindings-events

bindings и events принадлежат узлу экрана. Реальные источники, действия, writable и типы выдаёт get_data_catalog: сначала groups, затем sources/actions по группе; detail:true возвращает схему. get_data читает текущее known/value. Имена прикладные, не фиксированный список языка.

Привязка: `{"bindings":[{"method":"text","value":{"source":"example.reading"},"format":{"precision":1,"suffix":" °C","unknown":"--"}}]}`. method — alias из props; scope:"common" выбирает common. Значение нескольких аргументов — массив выражений. format применим к текстовому методу.

Выражения: {source:"имя",path:["поле",0]}, {literal:значение}, {event:"value"} (только событие), [выражения], {object:{поле:выражение}}, {op:имя,args:[выражения]}. Операции eq/ne/lt/le/gt/ge/and/or/not/select/add/sub/mul/div/round.

Вызов: `{"events":[{"event":"clicked","action":"example.apply","args":{"literal":null}}]}`. Запись: `{"events":[{"event":"value_changed","write":{"source":"example.enabled"},"value":{"event":"value"}}]}`. Только writable-источники; path необязателен. У одного правила ровно один action, write или navigate. События clicked/value_changed/ready/long_pressed. event.value имеет тип reader компонента (checkbox — bool, textarea — text); произвольного JS и автоматического приведения типов нет. Программное обновление биндинга не создаёт обратный цикл событий.

## view

Любой узел-контейнер может вставлять страницы: `{"view":{"pages":[{"screen":"details","retention":"cache"}],"initial":"details","sizing":"fill"}}`. retention: release/cache/retain; sizing: fill/design. Навигация: `{"events":[{"event":"clicked","navigate":{"view":"content","screen":"details"}}]}`. view — id локального контейнера этого экрана, screen должен быть объявлен в его pages. Вложенные страницы сохраняют собственные биндинги/события и локальные id.
