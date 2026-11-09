# Стили LVGL: полный справочник JSON

## overview

Ниже все 138 действующих методов оформления и все объявленные перечисления. Применимость конкретного свойства/ресурса проверяется по get_device. LVGL: https://docs.lvgl.io/

lv_style_set_X(style,value) → node.style:{X:value}; lv_obj_set_style_X(obj,value,selector) → node.styleRules:[{part,state,props:{X:value}}]. Собственный стиль node.style относится к MAIN/DEFAULT. Имена alias предпочтительны; полное имя lv_style_set_X тоже принимается в props стиля. Один параметр — значение, несколько — массив. Не задавайте в одном props одновременно составной метод и отдельные свойства, которые он устанавливает.

Цвет: "#RRGGBB" или число RGB. Непрозрачность: 0..255. Размер/позиция: пиксели, {pct:100} или "content" для размерных свойств; lv_pct(50) → {pct:50}, LV_SIZE_CONTENT → "content". Grid-треки: [100,"content",{fr:1}] или имя зарегистрированного массива. Указатели (шрифты, картинки, градиенты, переходы и др.) задаются именами ресурсов, не адресами и не структурами C.

## named-styles

Локальный: screen.styles:{accent:{props:{bg_color:"#336699"}}}; подключение node.styles:[{ref:"screen:accent"}]. Общий документ: {scope:"global",name:"accent",props:{...},attach:false}; подключение global-dynamic:accent. Зарегистрированные стили: global-static:имя; global:имя разрешает глобальный стиль. Несколько ссылок применяются в порядке styles; на каждой допустимы part/state. styleRules — локальные свойства выбранных части/состояния. Части/состояния перечислены в справочнике разметки.

Документ стиля поддерживает copy:"scope:name" и merge:["scope:name",...]: снимок копирования, последовательное слияние и собственные props. Это не live-наследование. global не копирует screen. attach управляет отдельной операцией стиля и не заменяет node.styles.

## arc_width

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_arc_width"` | `{"style":{"arc_width":0}}` | `["int32_t"]` |

## bg_grad_stop

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_bg_grad_stop"` | `{"style":{"bg_grad_stop":0}}` | `["int32_t"]` |

## bg_main_stop

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_bg_main_stop"` | `{"style":{"bg_main_stop":0}}` | `["int32_t"]` |

## border_width

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_border_width"` | `{"style":{"border_width":0}}` | `["int32_t"]` |

## grid_cell_column_pos

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_grid_cell_column_pos"` | `{"style":{"grid_cell_column_pos":0}}` | `["int32_t"]` |

Правила значений: `{"grid_cell_column_pos":{"min":0,"max":63}}`

## grid_cell_column_span

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_grid_cell_column_span"` | `{"style":{"grid_cell_column_span":1}}` | `["int32_t"]` |

Правила значений: `{"grid_cell_column_span":{"min":1,"max":64}}`

## grid_cell_row_pos

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_grid_cell_row_pos"` | `{"style":{"grid_cell_row_pos":0}}` | `["int32_t"]` |

Правила значений: `{"grid_cell_row_pos":{"min":0,"max":63}}`

## grid_cell_row_span

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_grid_cell_row_span"` | `{"style":{"grid_cell_row_span":1}}` | `["int32_t"]` |

Правила значений: `{"grid_cell_row_span":{"min":1,"max":64}}`

## height

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_height"` | `{"style":{"height":{"pct":100}}}` | `["int32_t"]` |

## length

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_length"` | `{"style":{"length":0}}` | `["int32_t"]` |

## line_dash_gap

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_line_dash_gap"` | `{"style":{"line_dash_gap":0}}` | `["int32_t"]` |

## line_dash_width

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_line_dash_width"` | `{"style":{"line_dash_width":0}}` | `["int32_t"]` |

## line_width

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_line_width"` | `{"style":{"line_width":0}}` | `["int32_t"]` |

## margin_all

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_margin_all"` | `{"style":{"margin_all":0}}` | `["int32_t"]` |

Устанавливает: `"margin_left"`, `"margin_right"`, `"margin_top"`, `"margin_bottom"`

## margin_bottom

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_margin_bottom"` | `{"style":{"margin_bottom":0}}` | `["int32_t"]` |

## margin_hor

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_margin_hor"` | `{"style":{"margin_hor":0}}` | `["int32_t"]` |

Устанавливает: `"margin_left"`, `"margin_right"`

## margin_left

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_margin_left"` | `{"style":{"margin_left":0}}` | `["int32_t"]` |

## margin_right

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_margin_right"` | `{"style":{"margin_right":0}}` | `["int32_t"]` |

## margin_top

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_margin_top"` | `{"style":{"margin_top":0}}` | `["int32_t"]` |

## margin_ver

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_margin_ver"` | `{"style":{"margin_ver":0}}` | `["int32_t"]` |

Устанавливает: `"margin_top"`, `"margin_bottom"`

## max_height

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_max_height"` | `{"style":{"max_height":{"pct":100}}}` | `["int32_t"]` |

## max_width

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_max_width"` | `{"style":{"max_width":{"pct":100}}}` | `["int32_t"]` |

## min_height

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_min_height"` | `{"style":{"min_height":{"pct":100}}}` | `["int32_t"]` |

## min_width

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_min_width"` | `{"style":{"min_width":{"pct":100}}}` | `["int32_t"]` |

## outline_pad

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_outline_pad"` | `{"style":{"outline_pad":0}}` | `["int32_t"]` |

## outline_width

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_outline_width"` | `{"style":{"outline_width":0}}` | `["int32_t"]` |

## pad_all

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_pad_all"` | `{"style":{"pad_all":0}}` | `["int32_t"]` |

Устанавливает: `"pad_left"`, `"pad_right"`, `"pad_top"`, `"pad_bottom"`

## pad_bottom

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_pad_bottom"` | `{"style":{"pad_bottom":0}}` | `["int32_t"]` |

## pad_column

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_pad_column"` | `{"style":{"pad_column":0}}` | `["int32_t"]` |

## pad_gap

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_pad_gap"` | `{"style":{"pad_gap":0}}` | `["int32_t"]` |

Устанавливает: `"pad_row"`, `"pad_column"`

## pad_hor

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_pad_hor"` | `{"style":{"pad_hor":0}}` | `["int32_t"]` |

Устанавливает: `"pad_left"`, `"pad_right"`

## pad_left

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_pad_left"` | `{"style":{"pad_left":0}}` | `["int32_t"]` |

## pad_radial

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_pad_radial"` | `{"style":{"pad_radial":0}}` | `["int32_t"]` |

## pad_right

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_pad_right"` | `{"style":{"pad_right":0}}` | `["int32_t"]` |

## pad_row

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_pad_row"` | `{"style":{"pad_row":0}}` | `["int32_t"]` |

## pad_top

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_pad_top"` | `{"style":{"pad_top":0}}` | `["int32_t"]` |

## pad_ver

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_pad_ver"` | `{"style":{"pad_ver":0}}` | `["int32_t"]` |

Устанавливает: `"pad_top"`, `"pad_bottom"`

## radial_offset

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_radial_offset"` | `{"style":{"radial_offset":0}}` | `["int32_t"]` |

## radius

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_radius"` | `{"style":{"radius":0}}` | `["int32_t"]` |

## shadow_offset_x

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_shadow_offset_x"` | `{"style":{"shadow_offset_x":0}}` | `["int32_t"]` |

## shadow_offset_y

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_shadow_offset_y"` | `{"style":{"shadow_offset_y":0}}` | `["int32_t"]` |

## shadow_spread

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_shadow_spread"` | `{"style":{"shadow_spread":0}}` | `["int32_t"]` |

## shadow_width

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_shadow_width"` | `{"style":{"shadow_width":0}}` | `["int32_t"]` |

## text_letter_space

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_text_letter_space"` | `{"style":{"text_letter_space":0}}` | `["int32_t"]` |

## text_line_space

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_text_line_space"` | `{"style":{"text_line_space":0}}` | `["int32_t"]` |

## text_outline_stroke_width

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_text_outline_stroke_width"` | `{"style":{"text_outline_stroke_width":0}}` | `["int32_t"]` |

## transform_height

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_transform_height"` | `{"style":{"transform_height":0}}` | `["int32_t"]` |

## transform_pivot_x

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_transform_pivot_x"` | `{"style":{"transform_pivot_x":0}}` | `["int32_t"]` |

## transform_pivot_y

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_transform_pivot_y"` | `{"style":{"transform_pivot_y":0}}` | `["int32_t"]` |

## transform_rotation

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_transform_rotation"` | `{"style":{"transform_rotation":0}}` | `["int32_t"]` |

## transform_scale

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_transform_scale"` | `{"style":{"transform_scale":0}}` | `["int32_t"]` |

Устанавливает: `"transform_scale_x"`, `"transform_scale_y"`

## transform_scale_x

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_transform_scale_x"` | `{"style":{"transform_scale_x":0}}` | `["int32_t"]` |

## transform_scale_y

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_transform_scale_y"` | `{"style":{"transform_scale_y":0}}` | `["int32_t"]` |

## transform_skew_x

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_transform_skew_x"` | `{"style":{"transform_skew_x":0}}` | `["int32_t"]` |

## transform_skew_y

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_transform_skew_y"` | `{"style":{"transform_skew_y":0}}` | `["int32_t"]` |

## transform_width

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_transform_width"` | `{"style":{"transform_width":0}}` | `["int32_t"]` |

## translate_radial

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_translate_radial"` | `{"style":{"translate_radial":0}}` | `["int32_t"]` |

## translate_x

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_translate_x"` | `{"style":{"translate_x":0}}` | `["int32_t"]` |

## translate_y

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_translate_y"` | `{"style":{"translate_y":0}}` | `["int32_t"]` |

## width

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_width"` | `{"style":{"width":{"pct":100}}}` | `["int32_t"]` |

## x

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_x"` | `{"style":{"x":{"pct":100}}}` | `["int32_t"]` |

## y

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_y"` | `{"style":{"y":{"pct":100}}}` | `["int32_t"]` |

## arc_opa

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_arc_opa"` | `{"style":{"arc_opa":255}}` | `["lv_opa_t"]` |

## bg_grad_opa

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_bg_grad_opa"` | `{"style":{"bg_grad_opa":255}}` | `["lv_opa_t"]` |

## bg_image_opa

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_bg_image_opa"` | `{"style":{"bg_image_opa":255}}` | `["lv_opa_t"]` |

## bg_image_recolor_opa

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_bg_image_recolor_opa"` | `{"style":{"bg_image_recolor_opa":255}}` | `["lv_opa_t"]` |

## bg_main_opa

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_bg_main_opa"` | `{"style":{"bg_main_opa":255}}` | `["lv_opa_t"]` |

## bg_opa

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_bg_opa"` | `{"style":{"bg_opa":255}}` | `["lv_opa_t"]` |

## border_opa

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_border_opa"` | `{"style":{"border_opa":255}}` | `["lv_opa_t"]` |

## color_filter_opa

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_color_filter_opa"` | `{"style":{"color_filter_opa":255}}` | `["lv_opa_t"]` |

## image_opa

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_image_opa"` | `{"style":{"image_opa":255}}` | `["lv_opa_t"]` |

## image_recolor_opa

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_image_recolor_opa"` | `{"style":{"image_recolor_opa":255}}` | `["lv_opa_t"]` |

## line_opa

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_line_opa"` | `{"style":{"line_opa":255}}` | `["lv_opa_t"]` |

## opa

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_opa"` | `{"style":{"opa":255}}` | `["lv_opa_t"]` |

## opa_layered

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_opa_layered"` | `{"style":{"opa_layered":255}}` | `["lv_opa_t"]` |

## outline_opa

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_outline_opa"` | `{"style":{"outline_opa":255}}` | `["lv_opa_t"]` |

## recolor_opa

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_recolor_opa"` | `{"style":{"recolor_opa":255}}` | `["lv_opa_t"]` |

## shadow_opa

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_shadow_opa"` | `{"style":{"shadow_opa":255}}` | `["lv_opa_t"]` |

## text_opa

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_text_opa"` | `{"style":{"text_opa":255}}` | `["lv_opa_t"]` |

## text_outline_stroke_opa

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_text_outline_stroke_opa"` | `{"style":{"text_outline_stroke_opa":255}}` | `["lv_opa_t"]` |

## arc_color

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_arc_color"` | `{"style":{"arc_color":"#336699"}}` | `["lv_color_t"]` |

## bg_color

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_bg_color"` | `{"style":{"bg_color":"#336699"}}` | `["lv_color_t"]` |

## bg_grad_color

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_bg_grad_color"` | `{"style":{"bg_grad_color":"#336699"}}` | `["lv_color_t"]` |

## bg_image_recolor

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_bg_image_recolor"` | `{"style":{"bg_image_recolor":"#336699"}}` | `["lv_color_t"]` |

## border_color

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_border_color"` | `{"style":{"border_color":"#336699"}}` | `["lv_color_t"]` |

## image_recolor

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_image_recolor"` | `{"style":{"image_recolor":"#336699"}}` | `["lv_color_t"]` |

## line_color

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_line_color"` | `{"style":{"line_color":"#336699"}}` | `["lv_color_t"]` |

## outline_color

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_outline_color"` | `{"style":{"outline_color":"#336699"}}` | `["lv_color_t"]` |

## recolor

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_recolor"` | `{"style":{"recolor":"#336699"}}` | `["lv_color_t"]` |

## shadow_color

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_shadow_color"` | `{"style":{"shadow_color":"#336699"}}` | `["lv_color_t"]` |

## text_color

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_text_color"` | `{"style":{"text_color":"#336699"}}` | `["lv_color_t"]` |

## text_outline_stroke_color

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_text_outline_stroke_color"` | `{"style":{"text_outline_stroke_color":"#336699"}}` | `["lv_color_t"]` |

## arc_rounded

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_arc_rounded"` | `{"style":{"arc_rounded":true}}` | `["bool"]` |

## bg_image_tiled

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_bg_image_tiled"` | `{"style":{"bg_image_tiled":true}}` | `["bool"]` |

## border_post

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_border_post"` | `{"style":{"border_post":true}}` | `["bool"]` |

## clip_corner

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_clip_corner"` | `{"style":{"clip_corner":true}}` | `["bool"]` |

## line_rounded

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_line_rounded"` | `{"style":{"line_rounded":true}}` | `["bool"]` |

## grid_cell_x_align

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_grid_cell_x_align"` | `{"style":{"grid_cell_x_align":"LV_GRID_ALIGN_START"}}` | `["lv_grid_align_t"]` |

## grid_cell_y_align

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_grid_cell_y_align"` | `{"style":{"grid_cell_y_align":"LV_GRID_ALIGN_START"}}` | `["lv_grid_align_t"]` |

## grid_column_align

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_grid_column_align"` | `{"style":{"grid_column_align":"LV_GRID_ALIGN_START"}}` | `["lv_grid_align_t"]` |

## grid_row_align

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_grid_row_align"` | `{"style":{"grid_row_align":"LV_GRID_ALIGN_START"}}` | `["lv_grid_align_t"]` |

## arc_image_src

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_arc_image_src"` | `{"style":{"arc_image_src":"registered_resource"}}` | `["const void *"]` |

## bg_image_src

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_bg_image_src"` | `{"style":{"bg_image_src":"registered_resource"}}` | `["const void *"]` |

## bitmap_mask_src

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_bitmap_mask_src"` | `{"style":{"bitmap_mask_src":"registered_resource"}}` | `["const void *"]` |

## flex_cross_place

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_flex_cross_place"` | `{"style":{"flex_cross_place":"LV_FLEX_ALIGN_START"}}` | `["lv_flex_align_t"]` |

## flex_main_place

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_flex_main_place"` | `{"style":{"flex_main_place":"LV_FLEX_ALIGN_START"}}` | `["lv_flex_align_t"]` |

## flex_track_place

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_flex_track_place"` | `{"style":{"flex_track_place":"LV_FLEX_ALIGN_START"}}` | `["lv_flex_align_t"]` |

## grid_column_dsc_array

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_grid_column_dsc_array"` | `{"style":{"grid_column_dsc_array":[{"fr":1},{"fr":1}]}}` | `["const int32_t *"]` |

## grid_row_dsc_array

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_grid_row_dsc_array"` | `{"style":{"grid_row_dsc_array":[{"fr":1},{"fr":1}]}}` | `["const int32_t *"]` |

## anim_duration

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_anim_duration"` | `{"style":{"anim_duration":0}}` | `["uint32_t"]` |

## rotary_sensitivity

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_rotary_sensitivity"` | `{"style":{"rotary_sensitivity":0}}` | `["uint32_t"]` |

## anim

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_anim"` | `{"style":{"anim":"registered_resource"}}` | `["const lv_anim_t *"]` |

## color_filter_dsc

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_color_filter_dsc"` | `{"style":{"color_filter_dsc":"registered_resource"}}` | `["const lv_color_filter_dsc_t *"]` |

## text_font

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_text_font"` | `{"style":{"text_font":"registered_resource"}}` | `["const lv_font_t *"]` |

## bg_grad

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_bg_grad"` | `{"style":{"bg_grad":"registered_resource"}}` | `["const lv_grad_dsc_t *"]` |

## image_colorkey

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_image_colorkey"` | `{"style":{"image_colorkey":"registered_resource"}}` | `["const lv_image_colorkey_t *"]` |

## transition

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_transition"` | `{"style":{"transition":"registered_resource"}}` | `["const lv_style_transition_dsc_t *"]` |

## size

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_size"` | `{"style":{"size":[{"pct":100},{"pct":100}]}}` | `["int32_t","int32_t"]` |

Устанавливает: `"width"`, `"height"`

## align

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_align"` | `{"style":{"align":"LV_ALIGN_DEFAULT"}}` | `["lv_align_t"]` |

## base_dir

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_base_dir"` | `{"style":{"base_dir":"LV_BASE_DIR_LTR"}}` | `["lv_base_dir_t"]` |

## blend_mode

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_blend_mode"` | `{"style":{"blend_mode":"LV_BLEND_MODE_NORMAL"}}` | `["lv_blend_mode_t"]` |

## border_side

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_border_side"` | `{"style":{"border_side":"LV_BORDER_SIDE_NONE"}}` | `["lv_border_side_t"]` |

## flex_flow

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_flex_flow"` | `{"style":{"flex_flow":"LV_FLEX_FLOW_ROW"}}` | `["lv_flex_flow_t"]` |

## bg_grad_dir

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_bg_grad_dir"` | `{"style":{"bg_grad_dir":"LV_GRAD_DIR_NONE"}}` | `["lv_grad_dir_t"]` |

## text_align

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_text_align"` | `{"style":{"text_align":"LV_TEXT_ALIGN_AUTO"}}` | `["lv_text_align_t"]` |

## text_decor

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_text_decor"` | `{"style":{"text_decor":"LV_TEXT_DECOR_NONE"}}` | `["lv_text_decor_t"]` |

## layout

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_layout"` | `{"style":{"layout":"LV_LAYOUT_NONE"}}` | `["uint16_t"]` |

Правила значений: `{"layout":{"min":0,"max":65535,"symbols":{"LV_LAYOUT_NONE":0,"LV_LAYOUT_FLEX":1,"LV_LAYOUT_GRID":2}}}`

## flex_grow

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_flex_grow"` | `{"style":{"flex_grow":255}}` | `["uint8_t"]` |

## blur_radius

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_blur_radius"` | `{"style":{"blur_radius":0}}` | `["int32_t"]` |

## drop_shadow_offset_x

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_drop_shadow_offset_x"` | `{"style":{"drop_shadow_offset_x":0}}` | `["int32_t"]` |

## drop_shadow_offset_y

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_drop_shadow_offset_y"` | `{"style":{"drop_shadow_offset_y":0}}` | `["int32_t"]` |

## drop_shadow_radius

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_drop_shadow_radius"` | `{"style":{"drop_shadow_radius":0}}` | `["int32_t"]` |

## drop_shadow_opa

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_drop_shadow_opa"` | `{"style":{"drop_shadow_opa":255}}` | `["lv_opa_t"]` |

## drop_shadow_color

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_drop_shadow_color"` | `{"style":{"drop_shadow_color":"#336699"}}` | `["lv_color_t"]` |

## blur_backdrop

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_blur_backdrop"` | `{"style":{"blur_backdrop":true}}` | `["bool"]` |

## blur_quality

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_blur_quality"` | `{"style":{"blur_quality":"LV_BLUR_QUALITY_AUTO"}}` | `["lv_blur_quality_t"]` |

## drop_shadow_quality

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_drop_shadow_quality"` | `{"style":{"drop_shadow_quality":"LV_BLUR_QUALITY_AUTO"}}` | `["lv_blur_quality_t"]` |

## text_leading_trim

| LVGL | JSON | Аргументы |
| --- | --- | --- |
| `"lv_style_set_text_leading_trim"` | `{"style":{"text_leading_trim":"LV_TEXT_LEADING_TRIM_NONE"}}` | `["lv_text_leading_trim_t"]` |

## enumerations

В style принимаются символические строки или соответствующие числа. Для lv_border_side_t и lv_text_decor_t можно объединять имена через |.

### lv_blend_mode_t

| LVGL / JSON-строка | JSON-число |
| --- | --- |
| `"LV_BLEND_MODE_NORMAL"` | `0` |
| `"LV_BLEND_MODE_ADDITIVE"` | `1` |
| `"LV_BLEND_MODE_SUBTRACTIVE"` | `2` |
| `"LV_BLEND_MODE_MULTIPLY"` | `3` |
| `"LV_BLEND_MODE_DIFFERENCE"` | `4` |

### lv_text_decor_t

| LVGL / JSON-строка | JSON-число |
| --- | --- |
| `"LV_TEXT_DECOR_NONE"` | `0` |
| `"LV_TEXT_DECOR_UNDERLINE"` | `1` |
| `"LV_TEXT_DECOR_STRIKETHROUGH"` | `2` |

### lv_border_side_t

| LVGL / JSON-строка | JSON-число |
| --- | --- |
| `"LV_BORDER_SIDE_NONE"` | `0` |
| `"LV_BORDER_SIDE_BOTTOM"` | `1` |
| `"LV_BORDER_SIDE_TOP"` | `2` |
| `"LV_BORDER_SIDE_LEFT"` | `4` |
| `"LV_BORDER_SIDE_RIGHT"` | `8` |
| `"LV_BORDER_SIDE_FULL"` | `15` |
| `"LV_BORDER_SIDE_INTERNAL"` | `16` |

### lv_blur_quality_t

| LVGL / JSON-строка | JSON-число |
| --- | --- |
| `"LV_BLUR_QUALITY_AUTO"` | `0` |
| `"LV_BLUR_QUALITY_SPEED"` | `1` |
| `"LV_BLUR_QUALITY_PRECISION"` | `2` |

### lv_style_res_t

| LVGL / JSON-строка | JSON-число |
| --- | --- |
| `"LV_STYLE_RES_NOT_FOUND"` | `0` |
| `"LV_STYLE_RES_FOUND"` | `1` |

### lv_align_t

| LVGL / JSON-строка | JSON-число |
| --- | --- |
| `"LV_ALIGN_DEFAULT"` | `0` |
| `"LV_ALIGN_TOP_LEFT"` | `1` |
| `"LV_ALIGN_TOP_MID"` | `2` |
| `"LV_ALIGN_TOP_RIGHT"` | `3` |
| `"LV_ALIGN_BOTTOM_LEFT"` | `4` |
| `"LV_ALIGN_BOTTOM_MID"` | `5` |
| `"LV_ALIGN_BOTTOM_RIGHT"` | `6` |
| `"LV_ALIGN_LEFT_MID"` | `7` |
| `"LV_ALIGN_RIGHT_MID"` | `8` |
| `"LV_ALIGN_CENTER"` | `9` |
| `"LV_ALIGN_OUT_TOP_LEFT"` | `10` |
| `"LV_ALIGN_OUT_TOP_MID"` | `11` |
| `"LV_ALIGN_OUT_TOP_RIGHT"` | `12` |
| `"LV_ALIGN_OUT_BOTTOM_LEFT"` | `13` |
| `"LV_ALIGN_OUT_BOTTOM_MID"` | `14` |
| `"LV_ALIGN_OUT_BOTTOM_RIGHT"` | `15` |
| `"LV_ALIGN_OUT_LEFT_TOP"` | `16` |
| `"LV_ALIGN_OUT_LEFT_MID"` | `17` |
| `"LV_ALIGN_OUT_LEFT_BOTTOM"` | `18` |
| `"LV_ALIGN_OUT_RIGHT_TOP"` | `19` |
| `"LV_ALIGN_OUT_RIGHT_MID"` | `20` |
| `"LV_ALIGN_OUT_RIGHT_BOTTOM"` | `21` |

### lv_dir_t

| LVGL / JSON-строка | JSON-число |
| --- | --- |
| `"LV_DIR_NONE"` | `0` |
| `"LV_DIR_LEFT"` | `1` |
| `"LV_DIR_RIGHT"` | `2` |
| `"LV_DIR_TOP"` | `4` |
| `"LV_DIR_BOTTOM"` | `8` |
| `"LV_DIR_HOR"` | `3` |
| `"LV_DIR_VER"` | `12` |
| `"LV_DIR_ALL"` | `15` |

### lv_text_flag_t

| LVGL / JSON-строка | JSON-число |
| --- | --- |
| `"LV_TEXT_FLAG_NONE"` | `0` |
| `"LV_TEXT_FLAG_EXPAND"` | `1` |
| `"LV_TEXT_FLAG_FIT"` | `2` |
| `"LV_TEXT_FLAG_BREAK_ALL"` | `4` |
| `"LV_TEXT_FLAG_RECOLOR"` | `8` |

### lv_text_align_t

| LVGL / JSON-строка | JSON-число |
| --- | --- |
| `"LV_TEXT_ALIGN_AUTO"` | `0` |
| `"LV_TEXT_ALIGN_LEFT"` | `1` |
| `"LV_TEXT_ALIGN_CENTER"` | `2` |
| `"LV_TEXT_ALIGN_RIGHT"` | `3` |

### lv_text_leading_trim_t

| LVGL / JSON-строка | JSON-число |
| --- | --- |
| `"LV_TEXT_LEADING_TRIM_NONE"` | `0` |
| `"LV_TEXT_LEADING_TRIM_CAPITAL_BASELINE"` | `1` |
| `"LV_TEXT_LEADING_TRIM_LOWER_BASELINE"` | `2` |
| `"LV_TEXT_LEADING_TRIM_CAPITAL"` | `3` |
| `"LV_TEXT_LEADING_TRIM_LOWER"` | `4` |

### lv_base_dir_t

| LVGL / JSON-строка | JSON-число |
| --- | --- |
| `"LV_BASE_DIR_LTR"` | `0` |
| `"LV_BASE_DIR_RTL"` | `1` |
| `"LV_BASE_DIR_AUTO"` | `2` |
| `"LV_BASE_DIR_NEUTRAL"` | `32` |
| `"LV_BASE_DIR_WEAK"` | `33` |

### lv_grad_dir_t

| LVGL / JSON-строка | JSON-число |
| --- | --- |
| `"LV_GRAD_DIR_NONE"` | `0` |
| `"LV_GRAD_DIR_VER"` | `1` |
| `"LV_GRAD_DIR_HOR"` | `2` |
| `"LV_GRAD_DIR_LINEAR"` | `3` |
| `"LV_GRAD_DIR_RADIAL"` | `4` |
| `"LV_GRAD_DIR_CONICAL"` | `5` |

### lv_grad_extend_t

| LVGL / JSON-строка | JSON-число |
| --- | --- |
| `"LV_GRAD_EXTEND_PAD"` | `0` |
| `"LV_GRAD_EXTEND_REPEAT"` | `1` |
| `"LV_GRAD_EXTEND_REFLECT"` | `2` |

### lv_flex_align_t

| LVGL / JSON-строка | JSON-число |
| --- | --- |
| `"LV_FLEX_ALIGN_START"` | `0` |
| `"LV_FLEX_ALIGN_END"` | `1` |
| `"LV_FLEX_ALIGN_CENTER"` | `2` |
| `"LV_FLEX_ALIGN_SPACE_EVENLY"` | `3` |
| `"LV_FLEX_ALIGN_SPACE_AROUND"` | `4` |
| `"LV_FLEX_ALIGN_SPACE_BETWEEN"` | `5` |

### lv_flex_flow_t

| LVGL / JSON-строка | JSON-число |
| --- | --- |
| `"LV_FLEX_FLOW_ROW"` | `0` |
| `"LV_FLEX_FLOW_COLUMN"` | `1` |
| `"LV_FLEX_FLOW_ROW_WRAP"` | `4` |
| `"LV_FLEX_FLOW_COLUMN_WRAP"` | `5` |
| `"LV_FLEX_FLOW_ROW_REVERSE"` | `8` |
| `"LV_FLEX_FLOW_COLUMN_REVERSE"` | `9` |
| `"LV_FLEX_FLOW_ROW_WRAP_REVERSE"` | `12` |
| `"LV_FLEX_FLOW_COLUMN_WRAP_REVERSE"` | `13` |

### lv_grid_align_t

| LVGL / JSON-строка | JSON-число |
| --- | --- |
| `"LV_GRID_ALIGN_START"` | `0` |
| `"LV_GRID_ALIGN_CENTER"` | `1` |
| `"LV_GRID_ALIGN_END"` | `2` |
| `"LV_GRID_ALIGN_STRETCH"` | `3` |
| `"LV_GRID_ALIGN_SPACE_EVENLY"` | `4` |
| `"LV_GRID_ALIGN_SPACE_AROUND"` | `5` |
| `"LV_GRID_ALIGN_SPACE_BETWEEN"` | `6` |

### layout

| LVGL / JSON-строка | JSON-число |
| --- | --- |
| `"LV_LAYOUT_NONE"` | `0` |
| `"LV_LAYOUT_FLEX"` | `1` |
| `"LV_LAYOUT_GRID"` | `2` |
