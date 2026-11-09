<!-- translation-source:assistant-layout-reference.ru.md -->

# LVGL layout: complete JSON reference

## overview

All 12 built-in types and their supported methods are listed below. This documents the application JSON language. get_device reports additional native components and actual availability. LVGL methods absent here and not advertised by the device are not currently exposed in JSON.

LVGL: https://docs.lvgl.io/

Screen: {format:"lvgl-screen-draft-1",id,name,size:{width,height},theme:"device" or "none",styles:{name:{props}},root:node}. Node: {id,type,props,common,flags,style,styles,styleRules,children,bindings,events,view}. id is unique within a screen. type creates the object; children are created with this object as parent. props calls component methods; common calls shared object methods. The receiver and parent are implicit, not separate JSON arguments. One argument is a value; multiple arguments form an array in C-method order. Resource arguments are names from the device catalog.

style contains local appearance properties. styles is an ordered list of {ref,part?,state?}; styleRules is a list of {part?,state?,props}. The complete appearance reference is assistant-styles-reference.md. size describes the design viewport; obtain actual display/container dimensions from the project and get_device.

Project: {format:"lvgl-project-1",manifest:{id,name,entry},screens:{id:screen},styles:{name:style}}. Keys match document identities. Saving and showing use separate tools.

## common

| LVGL | JSON | Parameters / allowed values |
| --- | --- | --- |
| `"lv_obj_add_flag"` | `{"common":{"add_flags":0}}` | `{"parameters":["lv_obj_flag_t"],"min":0,"max":2147483647}` |
| `"lv_obj_remove_flag"` | `{"common":{"remove_flags":0}}` | `{"parameters":["lv_obj_flag_t"],"min":0,"max":2147483647}` |
| `"lv_obj_add_state"` | `{"common":{"add_state":0}}` | `{"parameters":["lv_state_t"],"mask":62461}` |
| `"lv_obj_remove_state"` | `{"common":{"remove_state":0}}` | `{"parameters":["lv_state_t"],"mask":62461}` |
| `"lv_obj_set_scrollbar_mode"` | `{"common":{"scrollbar_mode":0}}` | `{"parameters":["lv_scrollbar_mode_t"],"values":[0,1,2,3]}` |
| `"lv_obj_set_scroll_dir"` | `{"common":{"scroll_dir":0}}` | `{"parameters":["lv_dir_t"],"min":0,"max":15}` |
| `"lv_obj_set_state"` | `{"common":{"state":[0,false]}}` | `{"parameters":["lv_state_t","bool"]}` |
| `"lv_obj_set_flag"` | `{"common":{"flag":[0,false]}}` | `{"parameters":["lv_obj_flag_t","bool"]}` |

common uses numeric masks/values, not strings naming C constants. The convenience form flags:{SCROLLABLE:false,CLICKABLE:true} uses names from the flags section.

## obj

Create: `"lv_obj_create"` → `{"type":"obj"}`.

No props methods; shared methods and styles remain available.

Events and event.value type: `[{"name":"clicked"},{"name":"value_changed"},{"name":"ready"},{"name":"long_pressed"}]`

## label

Create: `"lv_label_create"` → `{"type":"label"}`.

| LVGL | JSON | Parameters / allowed values |
| --- | --- | --- |
| `"lv_label_set_text"` | `{"props":{"text":""}}` | `{"parameters":["text"]}` |
| `"lv_label_set_long_mode"` | `{"props":{"long_mode":0}}` | `{"parameters":["lv_label_long_mode_t"],"values":[0,1,2,3,4]}` |
| `"lv_label_set_max_lines"` | `{"props":{"max_lines":0}}` | `{"parameters":["int32_t"],"min":0,"max":32767}` |

Events and event.value type: `[{"name":"clicked"},{"name":"value_changed"},{"name":"ready"},{"name":"long_pressed"}]`

## button

Create: `"lv_button_create"` → `{"type":"button"}`.

No props methods; shared methods and styles remain available.

Events and event.value type: `[{"name":"clicked"},{"name":"value_changed"},{"name":"ready"},{"name":"long_pressed"}]`

## bar

Create: `"lv_bar_create"` → `{"type":"bar"}`.

| LVGL | JSON | Parameters / allowed values |
| --- | --- | --- |
| `"lv_bar_set_range"` | `{"props":{"range":[0,0]}}` | `{"parameters":["int32_t","int32_t"],"constraint":"ascending"}` |
| `"lv_bar_set_value"` | `{"props":{"value":0}}` | `{"parameters":["int32_t"],"implicitArguments":["LV_ANIM_OFF"]}` |

Events and event.value type: `[{"name":"clicked"},{"name":"value_changed","value":{"type":"integer"}},{"name":"ready"},{"name":"long_pressed"}]`

## slider

Create: `"lv_slider_create"` → `{"type":"slider"}`.

| LVGL | JSON | Parameters / allowed values |
| --- | --- | --- |
| `"lv_slider_set_range"` | `{"props":{"range":[0,0]}}` | `{"parameters":["int32_t","int32_t"],"constraint":"ascending"}` |
| `"lv_slider_set_value"` | `{"props":{"value":0}}` | `{"parameters":["int32_t"],"implicitArguments":["LV_ANIM_OFF"]}` |
| `"lv_slider_set_start_value"` | `{"props":{"start_value":0}}` | `{"parameters":["int32_t"],"implicitArguments":["LV_ANIM_OFF"]}` |

Events and event.value type: `[{"name":"clicked"},{"name":"value_changed","value":{"type":"integer"}},{"name":"ready"},{"name":"long_pressed"}]`

## arc

Create: `"lv_arc_create"` → `{"type":"arc"}`.

| LVGL | JSON | Parameters / allowed values |
| --- | --- | --- |
| `"lv_arc_set_range"` | `{"props":{"range":[0,0]}}` | `{"parameters":["int32_t","int32_t"],"constraint":"ascending"}` |
| `"lv_arc_set_value"` | `{"props":{"value":0}}` | `{"parameters":["int32_t"]}` |
| `"lv_arc_set_angles"` | `{"props":{"angles":[0,0]}}` | `{"parameters":["lv_value_precise_t","lv_value_precise_t"],"min":0,"max":360}` |
| `"lv_arc_set_bg_angles"` | `{"props":{"bg_angles":[0,0]}}` | `{"parameters":["lv_value_precise_t","lv_value_precise_t"],"min":0,"max":360}` |
| `"lv_arc_set_rotation"` | `{"props":{"rotation":0}}` | `{"parameters":["int32_t"],"min":0,"max":360}` |
| `"lv_arc_set_mode"` | `{"props":{"mode":0}}` | `{"parameters":["lv_arc_mode_t"],"values":[0,1,2]}` |

Events and event.value type: `[{"name":"clicked"},{"name":"value_changed","value":{"type":"integer"}},{"name":"ready"},{"name":"long_pressed"}]`

## line

Create: `"lv_line_create"` → `{"type":"line"}`.

| LVGL | JSON | Parameters / allowed values |
| --- | --- | --- |
| `"lv_line_set_points"` | `{"props":{"points":[[0,0],[1,1]]}}` | `{"parameters":["points"]}` |

Events and event.value type: `[{"name":"clicked"},{"name":"value_changed"},{"name":"ready"},{"name":"long_pressed"}]`

## image

Create: `"lv_image_create"` → `{"type":"image"}`.

| LVGL | JSON | Parameters / allowed values |
| --- | --- | --- |
| `"lv_image_set_src"` | `{"props":{"src":"registered_resource"}}` | `{"parameters":["resource"]}` |
| `"lv_image_set_scale"` | `{"props":{"scale":1}}` | `{"parameters":["uint32_t"],"min":1,"max":65535}` |
| `"lv_image_set_rotation"` | `{"props":{"rotation":0}}` | `{"parameters":["int32_t"],"min":-3600,"max":3600}` |

Events and event.value type: `[{"name":"clicked"},{"name":"value_changed"},{"name":"ready"},{"name":"long_pressed"}]`

## checkbox

Create: `"lv_checkbox_create"` → `{"type":"checkbox"}`.

| LVGL | JSON | Parameters / allowed values |
| --- | --- | --- |
| `"lv_checkbox_set_text"` | `{"props":{"text":""}}` | `{"parameters":["text"]}` |

Events and event.value type: `[{"name":"clicked"},{"name":"value_changed","value":{"type":"bool"}},{"name":"ready"},{"name":"long_pressed"}]`

## switch

Create: `"lv_switch_create"` → `{"type":"switch"}`.

No props methods; shared methods and styles remain available.

Events and event.value type: `[{"name":"clicked"},{"name":"value_changed","value":{"type":"bool"}},{"name":"ready"},{"name":"long_pressed"}]`

## textarea

Create: `"lv_textarea_create"` → `{"type":"textarea"}`.

| LVGL | JSON | Parameters / allowed values |
| --- | --- | --- |
| `"lv_textarea_set_text"` | `{"props":{"text":""}}` | `{"parameters":["text"]}` |
| `"lv_textarea_set_max_length"` | `{"props":{"max_length":0}}` | `{"parameters":["uint32_t"],"max":65535}` |
| `"lv_textarea_set_one_line"` | `{"props":{"one_line":false}}` | `{"parameters":["bool"]}` |
| `"lv_textarea_set_password_mode"` | `{"props":{"password_mode":false}}` | `{"parameters":["bool"]}` |

Events and event.value type: `[{"name":"clicked"},{"name":"value_changed","value":{"type":"text"}},{"name":"ready"},{"name":"long_pressed"}]`

## dropdown

Create: `"lv_dropdown_create"` → `{"type":"dropdown"}`.

| LVGL | JSON | Parameters / allowed values |
| --- | --- | --- |
| `"lv_dropdown_set_options"` | `{"props":{"options":["One","Two"]}}` | `{"parameters":["text"]}` |
| `"lv_dropdown_set_selected"` | `{"props":{"selected":0}}` | `{"parameters":["uint32_t"],"max":65535}` |
| `"lv_dropdown_set_dir"` | `{"props":{"direction":1}}` | `{"parameters":["lv_dir_t"],"values":[1,2,4,8]}` |

Events and event.value type: `[{"name":"clicked"},{"name":"value_changed","value":{"type":"integer"}},{"name":"ready"},{"name":"long_pressed"}]`

## authoring-shortcuts

button.props.text creates a centered child label; explicit children are also supported. checkbox/switch.props.checked is the initial boolean state. bar/slider/arc.props.min and max set the range; props.range:[min,max] is also supported, but do not use both forms together. dropdown.props.options is an array of strings; selected is a zero-based index. image.props.src is an available resource name; an empty src is skipped. textarea supports text entry, one_line and max_length. A number is entered as a string and validated by the application; no separate spinbox, accepted_chars filter or automatic text-to-number conversion is currently exposed. An on-screen keyboard is not created automatically.

## enumerations

props/common currently take enumerations as NUMBERS. The tables map LVGL names to these values; name strings are not accepted here. style supports symbolic names, as documented in the style reference.

### lv_label_long_mode_t

| LVGL constant | JSON value |
| --- | --- |
| `"LV_LABEL_LONG_MODE_WRAP"` | `0` |
| `"LV_LABEL_LONG_MODE_DOTS"` | `1` |
| `"LV_LABEL_LONG_MODE_SCROLL"` | `2` |
| `"LV_LABEL_LONG_MODE_SCROLL_CIRCULAR"` | `3` |
| `"LV_LABEL_LONG_MODE_CLIP"` | `4` |

### lv_scrollbar_mode_t

| LVGL constant | JSON value |
| --- | --- |
| `"LV_SCROLLBAR_MODE_OFF"` | `0` |
| `"LV_SCROLLBAR_MODE_ON"` | `1` |
| `"LV_SCROLLBAR_MODE_ACTIVE"` | `2` |
| `"LV_SCROLLBAR_MODE_AUTO"` | `3` |

### lv_arc_mode_t

| LVGL constant | JSON value |
| --- | --- |
| `"LV_ARC_MODE_NORMAL"` | `0` |
| `"LV_ARC_MODE_SYMMETRICAL"` | `1` |
| `"LV_ARC_MODE_REVERSE"` | `2` |

### lv_dir_t

| LVGL constant | JSON value |
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

| LVGL constant | JSON value |
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

| LVGL constant | JSON value |
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

Form: `{"part":"INDICATOR"}`.

| LVGL | JSON name |
| --- | --- |
| `"LV_PART_MAIN"` | `"MAIN"` |
| `"LV_PART_SCROLLBAR"` | `"SCROLLBAR"` |
| `"LV_PART_INDICATOR"` | `"INDICATOR"` |
| `"LV_PART_KNOB"` | `"KNOB"` |
| `"LV_PART_SELECTED"` | `"SELECTED"` |
| `"LV_PART_ITEMS"` | `"ITEMS"` |
| `"LV_PART_CURSOR"` | `"CURSOR"` |

## states

Form: `{"state":["CHECKED"]}`.

| LVGL | JSON name |
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

DEFAULT uses an empty state:[]; selectors also accept LV_PART_ and LV_STATE_ prefixes.

## flags

Form: `{"flags":{"SCROLLABLE":false}}`.

| LVGL | JSON name |
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

bindings and events belong to a screen node. get_data_catalog reports actual sources, actions, writable and types: first groups, then sources/actions by group; detail:true returns the schema. get_data reads current known/value. Names are application-defined, not a fixed language vocabulary.

Binding: `{"bindings":[{"method":"text","value":{"source":"example.reading"},"format":{"precision":1,"suffix":" °C","unknown":"--"}}]}`. method is an alias from props; scope:"common" selects common. Multiple arguments are an array of expressions. format applies to text methods.

Expressions: {source:"name",path:["field",0]}, {literal:value}, {event:"value"} (events only), [expressions], {object:{field:expression}}, {op:name,args:[expressions]}. Operations: eq/ne/lt/le/gt/ge/and/or/not/select/add/sub/mul/div/round.

Action: `{"events":[{"event":"clicked","action":"example.apply","args":{"literal":null}}]}`. Write: `{"events":[{"event":"value_changed","write":{"source":"example.enabled"},"value":{"event":"value"}}]}`. Sources must be writable; path is optional. Each rule has exactly one action, write or navigate. Events: clicked/value_changed/ready/long_pressed. event.value has the component reader type (checkbox: bool, textarea: text); no arbitrary JavaScript or automatic type coercion. Programmatic binding updates do not create event feedback loops.

## view

Any container node can embed pages: `{"view":{"pages":[{"screen":"details","retention":"cache"}],"initial":"details","sizing":"fill"}}`. retention: release/cache/retain; sizing: fill/design. Navigation: `{"events":[{"event":"clicked","navigate":{"view":"content","screen":"details"}}]}`. view is a local container id in this screen; screen must be declared in its pages. Nested pages retain their own bindings/events and local ids.
