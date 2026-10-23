#pragma once
#include "lvgl_cbor/widget_execution.hpp"
#include <new>

namespace lab_widgets {
constexpr uint32_t background = 0x182c38, muted = 0x91adbc, ink = 0xe9f3f6;
constexpr uint32_t green = 0x38d6ae, amber = 0xffc166, red = 0xff6e76;
inline lv_color_t color(uint32_t value) { return lv_color_hex(value); }
inline lv_obj_t *frame(lv_obj_t *parent, int width, int height) {
  auto *obj = lv_obj_create(parent);
  lv_obj_remove_style_all(obj);
  lv_obj_set_scrollable(obj, false);
  lv_obj_set_size(obj, width, height);
  lv_obj_set_style_bg_color(obj, color(background), 0);
  lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(obj, color(0x375363), 0);
  lv_obj_set_style_border_width(obj, 1, 0);
  lv_obj_set_style_radius(obj, 6, 0);
  lv_obj_set_style_pad_all(obj, 12, 0);
  lv_obj_set_style_text_font(obj, &lv_font_montserrat_20, 0);
  lv_obj_set_style_text_color(obj, color(ink), 0);
  return obj;
}
inline lv_obj_t *label(lv_obj_t *parent, const char *text, int x, int y,
                       uint32_t tint = ink) {
  auto *obj = lv_label_create(parent);
  lv_label_set_text(obj, text);
  lv_obj_set_pos(obj, x, y);
  lv_obj_set_style_text_color(obj, color(tint), 0);
  return obj;
}
inline lv_obj_t *bar(lv_obj_t *parent, int x, int y, int width, int height) {
  auto *obj = lv_bar_create(parent);
  lv_obj_set_pos(obj, x, y);
  lv_obj_set_size(obj, width, height);
  lv_obj_set_style_bg_color(obj, color(0x304956), LV_PART_MAIN);
  lv_obj_set_style_bg_color(obj, color(green), LV_PART_INDICATOR);
  lv_obj_set_style_radius(obj, 2, LV_PART_MAIN);
  lv_obj_set_style_radius(obj, 2, LV_PART_INDICATOR);
  return obj;
}
template<class State> inline State &state(lv_obj_t *obj) {
  return *static_cast<State *>(lv_obj_get_user_data(obj));
}
template<class State> inline bool own(lv_obj_t *obj, State *data) {
  if (!data) { lv_obj_delete(obj); return false; }
  lv_obj_set_user_data(obj, data);
  lv_obj_add_event_cb(obj, [](lv_event_t *event) {
    delete static_cast<State *>(lv_event_get_user_data(event));
  }, LV_EVENT_DELETE, data);
  return true;
}
} // namespace lab_widgets
