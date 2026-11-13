# Индексы общего стиля: ABI v2

Сгенерировано из [контракта](../contracts/style-api-v2.json); вручную не менять. Семейство: shared, LVGL 9.6.0. Старший байт числа — сигнатура, младший — индекс метода внутри выбранной сигнатуры. Номера других семейств независимы.

SHA256 исходного файла: `efdbe8aee4e961473bf8d671142361b1feb5ee8c582801d005acf1cd739acef2`.

## Сигнатуры

Количество аргументов здесь не включает получателя lv_style_t *. В HTML-матрице колонка «Парам.» считает полную C-сигнатуру, включая получателя.

| № сигн. | Аргументов в CBOR | Сигнатура C |
|---:|---:|---|
| 0 | 1 | `void (*fn)(lv_style_t * style, int32_t value);` |
| 1 | 1 | `void (*fn)(lv_style_t * style, lv_opa_t value);` |
| 2 | 1 | `void (*fn)(lv_style_t * style, lv_color_t value);` |
| 3 | 1 | `void (*fn)(lv_style_t * style, bool value);` |
| 4 | 1 | `void (*fn)(lv_style_t * style, lv_grid_align_t value);` |
| 5 | 1 | `void (*fn)(lv_style_t * style, const void * value);` |
| 6 | 1 | `void (*fn)(lv_style_t * style, lv_flex_align_t value);` |
| 7 | 1 | `void (*fn)(lv_style_t * style, const int32_t * value);` |
| 8 | 1 | `void (*fn)(lv_style_t * style, uint32_t value);` |
| 9 | 1 | `void (*fn)(lv_style_t * style, const lv_anim_t * value);` |
| 10 | 1 | `void (*fn)(lv_style_t * style, const lv_color_filter_dsc_t * value);` |
| 11 | 1 | `void (*fn)(lv_style_t * style, const lv_font_t * value);` |
| 12 | 1 | `void (*fn)(lv_style_t * style, const lv_grad_dsc_t * value);` |
| 13 | 1 | `void (*fn)(lv_style_t * style, const lv_image_colorkey_t * value);` |
| 14 | 1 | `void (*fn)(lv_style_t * style, const lv_style_transition_dsc_t * value);` |
| 15 | 2 | `void (*fn)(lv_style_t * style, int32_t width, int32_t height);` |
| 16 | 1 | `void (*fn)(lv_style_t * style, lv_align_t value);` |
| 17 | 1 | `void (*fn)(lv_style_t * style, lv_base_dir_t value);` |
| 18 | 1 | `void (*fn)(lv_style_t * style, lv_blend_mode_t value);` |
| 19 | 1 | `void (*fn)(lv_style_t * style, lv_border_side_t value);` |
| 20 | 1 | `void (*fn)(lv_style_t * style, lv_flex_flow_t value);` |
| 21 | 1 | `void (*fn)(lv_style_t * style, lv_grad_dir_t value);` |
| 22 | 1 | `void (*fn)(lv_style_t * style, lv_text_align_t value);` |
| 23 | 1 | `void (*fn)(lv_style_t * style, lv_text_decor_t value);` |
| 24 | 1 | `void (*fn)(lv_style_t * style, uint16_t value);` |
| 25 | 1 | `void (*fn)(lv_style_t * style, uint8_t value);` |
| 26 | 1 | `void (*fn)(lv_style_t * style, lv_blur_quality_t value);` |
| 27 | 1 | `void (*fn)(lv_style_t * style, lv_text_leading_trim_t value);` |

## Методы

| Индекс | № сигн. | Opcode hex | Opcode uint | Имя JSON | Функция |
|---:|---:|---:|---:|---|---|
| 0 | 0 | 0x0000 | 0 | arc_width | lv_style_set_arc_width |
| 1 | 0 | 0x0001 | 1 | bg_grad_stop | lv_style_set_bg_grad_stop |
| 2 | 0 | 0x0002 | 2 | bg_main_stop | lv_style_set_bg_main_stop |
| 3 | 0 | 0x0003 | 3 | border_width | lv_style_set_border_width |
| 4 | 0 | 0x0004 | 4 | grid_cell_column_pos | lv_style_set_grid_cell_column_pos |
| 5 | 0 | 0x0005 | 5 | grid_cell_column_span | lv_style_set_grid_cell_column_span |
| 6 | 0 | 0x0006 | 6 | grid_cell_row_pos | lv_style_set_grid_cell_row_pos |
| 7 | 0 | 0x0007 | 7 | grid_cell_row_span | lv_style_set_grid_cell_row_span |
| 8 | 0 | 0x0008 | 8 | height | lv_style_set_height |
| 9 | 0 | 0x0009 | 9 | length | lv_style_set_length |
| 10 | 0 | 0x000a | 10 | line_dash_gap | lv_style_set_line_dash_gap |
| 11 | 0 | 0x000b | 11 | line_dash_width | lv_style_set_line_dash_width |
| 12 | 0 | 0x000c | 12 | line_width | lv_style_set_line_width |
| 13 | 0 | 0x000d | 13 | margin_all | lv_style_set_margin_all |
| 14 | 0 | 0x000e | 14 | margin_bottom | lv_style_set_margin_bottom |
| 15 | 0 | 0x000f | 15 | margin_hor | lv_style_set_margin_hor |
| 16 | 0 | 0x0010 | 16 | margin_left | lv_style_set_margin_left |
| 17 | 0 | 0x0011 | 17 | margin_right | lv_style_set_margin_right |
| 18 | 0 | 0x0012 | 18 | margin_top | lv_style_set_margin_top |
| 19 | 0 | 0x0013 | 19 | margin_ver | lv_style_set_margin_ver |
| 20 | 0 | 0x0014 | 20 | max_height | lv_style_set_max_height |
| 21 | 0 | 0x0015 | 21 | max_width | lv_style_set_max_width |
| 22 | 0 | 0x0016 | 22 | min_height | lv_style_set_min_height |
| 23 | 0 | 0x0017 | 23 | min_width | lv_style_set_min_width |
| 24 | 0 | 0x0018 | 24 | outline_pad | lv_style_set_outline_pad |
| 25 | 0 | 0x0019 | 25 | outline_width | lv_style_set_outline_width |
| 26 | 0 | 0x001a | 26 | pad_all | lv_style_set_pad_all |
| 27 | 0 | 0x001b | 27 | pad_bottom | lv_style_set_pad_bottom |
| 28 | 0 | 0x001c | 28 | pad_column | lv_style_set_pad_column |
| 29 | 0 | 0x001d | 29 | pad_gap | lv_style_set_pad_gap |
| 30 | 0 | 0x001e | 30 | pad_hor | lv_style_set_pad_hor |
| 31 | 0 | 0x001f | 31 | pad_left | lv_style_set_pad_left |
| 32 | 0 | 0x0020 | 32 | pad_radial | lv_style_set_pad_radial |
| 33 | 0 | 0x0021 | 33 | pad_right | lv_style_set_pad_right |
| 34 | 0 | 0x0022 | 34 | pad_row | lv_style_set_pad_row |
| 35 | 0 | 0x0023 | 35 | pad_top | lv_style_set_pad_top |
| 36 | 0 | 0x0024 | 36 | pad_ver | lv_style_set_pad_ver |
| 37 | 0 | 0x0025 | 37 | radial_offset | lv_style_set_radial_offset |
| 38 | 0 | 0x0026 | 38 | radius | lv_style_set_radius |
| 39 | 0 | 0x0027 | 39 | shadow_offset_x | lv_style_set_shadow_offset_x |
| 40 | 0 | 0x0028 | 40 | shadow_offset_y | lv_style_set_shadow_offset_y |
| 41 | 0 | 0x0029 | 41 | shadow_spread | lv_style_set_shadow_spread |
| 42 | 0 | 0x002a | 42 | shadow_width | lv_style_set_shadow_width |
| 43 | 0 | 0x002b | 43 | text_letter_space | lv_style_set_text_letter_space |
| 44 | 0 | 0x002c | 44 | text_line_space | lv_style_set_text_line_space |
| 45 | 0 | 0x002d | 45 | text_outline_stroke_width | lv_style_set_text_outline_stroke_width |
| 46 | 0 | 0x002e | 46 | transform_height | lv_style_set_transform_height |
| 47 | 0 | 0x002f | 47 | transform_pivot_x | lv_style_set_transform_pivot_x |
| 48 | 0 | 0x0030 | 48 | transform_pivot_y | lv_style_set_transform_pivot_y |
| 49 | 0 | 0x0031 | 49 | transform_rotation | lv_style_set_transform_rotation |
| 50 | 0 | 0x0032 | 50 | transform_scale | lv_style_set_transform_scale |
| 51 | 0 | 0x0033 | 51 | transform_scale_x | lv_style_set_transform_scale_x |
| 52 | 0 | 0x0034 | 52 | transform_scale_y | lv_style_set_transform_scale_y |
| 53 | 0 | 0x0035 | 53 | transform_skew_x | lv_style_set_transform_skew_x |
| 54 | 0 | 0x0036 | 54 | transform_skew_y | lv_style_set_transform_skew_y |
| 55 | 0 | 0x0037 | 55 | transform_width | lv_style_set_transform_width |
| 56 | 0 | 0x0038 | 56 | translate_radial | lv_style_set_translate_radial |
| 57 | 0 | 0x0039 | 57 | translate_x | lv_style_set_translate_x |
| 58 | 0 | 0x003a | 58 | translate_y | lv_style_set_translate_y |
| 59 | 0 | 0x003b | 59 | width | lv_style_set_width |
| 60 | 0 | 0x003c | 60 | x | lv_style_set_x |
| 61 | 0 | 0x003d | 61 | y | lv_style_set_y |
| 0 | 1 | 0x0100 | 256 | arc_opa | lv_style_set_arc_opa |
| 1 | 1 | 0x0101 | 257 | bg_grad_opa | lv_style_set_bg_grad_opa |
| 2 | 1 | 0x0102 | 258 | bg_image_opa | lv_style_set_bg_image_opa |
| 3 | 1 | 0x0103 | 259 | bg_image_recolor_opa | lv_style_set_bg_image_recolor_opa |
| 4 | 1 | 0x0104 | 260 | bg_main_opa | lv_style_set_bg_main_opa |
| 5 | 1 | 0x0105 | 261 | bg_opa | lv_style_set_bg_opa |
| 6 | 1 | 0x0106 | 262 | border_opa | lv_style_set_border_opa |
| 7 | 1 | 0x0107 | 263 | color_filter_opa | lv_style_set_color_filter_opa |
| 8 | 1 | 0x0108 | 264 | image_opa | lv_style_set_image_opa |
| 9 | 1 | 0x0109 | 265 | image_recolor_opa | lv_style_set_image_recolor_opa |
| 10 | 1 | 0x010a | 266 | line_opa | lv_style_set_line_opa |
| 11 | 1 | 0x010b | 267 | opa | lv_style_set_opa |
| 12 | 1 | 0x010c | 268 | opa_layered | lv_style_set_opa_layered |
| 13 | 1 | 0x010d | 269 | outline_opa | lv_style_set_outline_opa |
| 14 | 1 | 0x010e | 270 | recolor_opa | lv_style_set_recolor_opa |
| 15 | 1 | 0x010f | 271 | shadow_opa | lv_style_set_shadow_opa |
| 16 | 1 | 0x0110 | 272 | text_opa | lv_style_set_text_opa |
| 17 | 1 | 0x0111 | 273 | text_outline_stroke_opa | lv_style_set_text_outline_stroke_opa |
| 0 | 2 | 0x0200 | 512 | arc_color | lv_style_set_arc_color |
| 1 | 2 | 0x0201 | 513 | bg_color | lv_style_set_bg_color |
| 2 | 2 | 0x0202 | 514 | bg_grad_color | lv_style_set_bg_grad_color |
| 3 | 2 | 0x0203 | 515 | bg_image_recolor | lv_style_set_bg_image_recolor |
| 4 | 2 | 0x0204 | 516 | border_color | lv_style_set_border_color |
| 5 | 2 | 0x0205 | 517 | image_recolor | lv_style_set_image_recolor |
| 6 | 2 | 0x0206 | 518 | line_color | lv_style_set_line_color |
| 7 | 2 | 0x0207 | 519 | outline_color | lv_style_set_outline_color |
| 8 | 2 | 0x0208 | 520 | recolor | lv_style_set_recolor |
| 9 | 2 | 0x0209 | 521 | shadow_color | lv_style_set_shadow_color |
| 10 | 2 | 0x020a | 522 | text_color | lv_style_set_text_color |
| 11 | 2 | 0x020b | 523 | text_outline_stroke_color | lv_style_set_text_outline_stroke_color |
| 0 | 3 | 0x0300 | 768 | arc_rounded | lv_style_set_arc_rounded |
| 1 | 3 | 0x0301 | 769 | bg_image_tiled | lv_style_set_bg_image_tiled |
| 2 | 3 | 0x0302 | 770 | border_post | lv_style_set_border_post |
| 3 | 3 | 0x0303 | 771 | clip_corner | lv_style_set_clip_corner |
| 4 | 3 | 0x0304 | 772 | line_rounded | lv_style_set_line_rounded |
| 0 | 4 | 0x0400 | 1024 | grid_cell_x_align | lv_style_set_grid_cell_x_align |
| 1 | 4 | 0x0401 | 1025 | grid_cell_y_align | lv_style_set_grid_cell_y_align |
| 2 | 4 | 0x0402 | 1026 | grid_column_align | lv_style_set_grid_column_align |
| 3 | 4 | 0x0403 | 1027 | grid_row_align | lv_style_set_grid_row_align |
| 0 | 5 | 0x0500 | 1280 | arc_image_src | lv_style_set_arc_image_src |
| 1 | 5 | 0x0501 | 1281 | bg_image_src | lv_style_set_bg_image_src |
| 2 | 5 | 0x0502 | 1282 | bitmap_mask_src | lv_style_set_bitmap_mask_src |
| 0 | 6 | 0x0600 | 1536 | flex_cross_place | lv_style_set_flex_cross_place |
| 1 | 6 | 0x0601 | 1537 | flex_main_place | lv_style_set_flex_main_place |
| 2 | 6 | 0x0602 | 1538 | flex_track_place | lv_style_set_flex_track_place |
| 0 | 7 | 0x0700 | 1792 | grid_column_dsc_array | lv_style_set_grid_column_dsc_array |
| 1 | 7 | 0x0701 | 1793 | grid_row_dsc_array | lv_style_set_grid_row_dsc_array |
| 0 | 8 | 0x0800 | 2048 | anim_duration | lv_style_set_anim_duration |
| 1 | 8 | 0x0801 | 2049 | rotary_sensitivity | lv_style_set_rotary_sensitivity |
| 0 | 9 | 0x0900 | 2304 | anim | lv_style_set_anim |
| 0 | 10 | 0x0a00 | 2560 | color_filter_dsc | lv_style_set_color_filter_dsc |
| 0 | 11 | 0x0b00 | 2816 | text_font | lv_style_set_text_font |
| 0 | 12 | 0x0c00 | 3072 | bg_grad | lv_style_set_bg_grad |
| 0 | 13 | 0x0d00 | 3328 | image_colorkey | lv_style_set_image_colorkey |
| 0 | 14 | 0x0e00 | 3584 | transition | lv_style_set_transition |
| 0 | 15 | 0x0f00 | 3840 | size | lv_style_set_size |
| 0 | 16 | 0x1000 | 4096 | align | lv_style_set_align |
| 0 | 17 | 0x1100 | 4352 | base_dir | lv_style_set_base_dir |
| 0 | 18 | 0x1200 | 4608 | blend_mode | lv_style_set_blend_mode |
| 0 | 19 | 0x1300 | 4864 | border_side | lv_style_set_border_side |
| 0 | 20 | 0x1400 | 5120 | flex_flow | lv_style_set_flex_flow |
| 0 | 21 | 0x1500 | 5376 | bg_grad_dir | lv_style_set_bg_grad_dir |
| 0 | 22 | 0x1600 | 5632 | text_align | lv_style_set_text_align |
| 0 | 23 | 0x1700 | 5888 | text_decor | lv_style_set_text_decor |
| 0 | 24 | 0x1800 | 6144 | layout | lv_style_set_layout |
| 0 | 25 | 0x1900 | 6400 | flex_grow | lv_style_set_flex_grow |
| 62 | 0 | 0x003e | 62 | blur_radius | lv_style_set_blur_radius |
| 63 | 0 | 0x003f | 63 | drop_shadow_offset_x | lv_style_set_drop_shadow_offset_x |
| 64 | 0 | 0x0040 | 64 | drop_shadow_offset_y | lv_style_set_drop_shadow_offset_y |
| 65 | 0 | 0x0041 | 65 | drop_shadow_radius | lv_style_set_drop_shadow_radius |
| 18 | 1 | 0x0112 | 274 | drop_shadow_opa | lv_style_set_drop_shadow_opa |
| 12 | 2 | 0x020c | 524 | drop_shadow_color | lv_style_set_drop_shadow_color |
| 5 | 3 | 0x0305 | 773 | blur_backdrop | lv_style_set_blur_backdrop |
| 0 | 26 | 0x1a00 | 6656 | blur_quality | lv_style_set_blur_quality |
| 1 | 26 | 0x1a01 | 6657 | drop_shadow_quality | lv_style_set_drop_shadow_quality |
| 0 | 27 | 0x1b00 | 6912 | text_leading_trim | lv_style_set_text_leading_trim |
