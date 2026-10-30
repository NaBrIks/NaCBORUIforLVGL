// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "common.hpp"
namespace lab_widgets::signal {
struct State { lv_obj_t *title, *dot, *status; };
inline void title(lv_obj_t *obj, const char *text) { lv_label_set_text(state<State>(obj).title, text); }
inline void status(lv_obj_t *obj, int32_t value) {
  const uint32_t colors[]{muted, green, amber, red};
  const char *names[]{"STOP", "RUN", "WARN", "FAULT"};
  auto &s = state<State>(obj);
  lv_obj_set_style_bg_color(s.dot, color(colors[value]), 0);
  lv_obj_set_style_text_color(s.status, color(colors[value]), 0);
  lv_label_set_text(s.status, names[value]);
}
inline lv_obj_t *create(lv_obj_t *parent) {
  auto *obj = frame(parent, 220, 100);
  auto *s = new(std::nothrow) State{};
  if (!own(obj, s)) return nullptr;
  s->title = label(obj, "FEED PUMP", 0, 0, muted);
  lv_obj_set_width(s->title, lv_pct(100));
  s->dot = lv_obj_create(obj); lv_obj_remove_style_all(s->dot);
  lv_obj_set_size(s->dot, 22, 22); lv_obj_set_pos(s->dot, 0, 42);
  lv_obj_set_style_radius(s->dot, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_opa(s->dot, LV_OPA_COVER, 0);
  s->status = label(obj, "RUN", 36, 40);
  lv_obj_set_style_text_font(s->status, &lv_font_montserrat_28, 0);
  status(obj, 1); return obj;
}
inline bool execute(lv_obj_t *obj, uint16_t method, CborValue &cursor, lvgl_cbor::WidgetContext &context) {
  switch(method) {
  case 256: return lvgl_cbor::invoke_widget(title, obj, cursor, context);
  case 257: return lvgl_cbor::invoke_widget(status, obj, cursor, context);
  default: return false;
  }
}
}
