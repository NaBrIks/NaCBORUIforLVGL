// Generated from contracts/screen-api-v3.json. Local switch dispatch; no method tables.
static bool execute_common(lv_obj_t *obj, uint16_t method, CborValue &cursor, WidgetContext &context) {
  switch (method) {
  case 4: return invoke_widget(lv_obj_add_flag, obj, cursor, context);
  case 5: return invoke_widget(lv_obj_remove_flag, obj, cursor, context);
  case 6: return invoke_widget(lv_obj_add_state, obj, cursor, context);
  case 7: return invoke_widget(lv_obj_remove_state, obj, cursor, context);
  case 8: return invoke_widget(lv_obj_set_scrollbar_mode, obj, cursor, context);
  case 9: return invoke_widget(lv_obj_set_scroll_dir, obj, cursor, context);
  case 10: return invoke_widget(lv_obj_set_state, obj, cursor, context);
  case 11: return invoke_widget(lv_obj_set_flag, obj, cursor, context);
  default: return false;
  }
}
static bool execute_obj(lv_obj_t *obj, uint16_t method, CborValue &cursor, WidgetContext &context) {
  switch (method) {
  default: return false;
  }
}
#if LV_USE_LABEL
static bool execute_label(lv_obj_t *obj, uint16_t method, CborValue &cursor, WidgetContext &context) {
  switch (method) {
  case 256: return invoke_widget(lv_label_set_text, obj, cursor, context);
  case 257: return invoke_widget(lv_label_set_long_mode, obj, cursor, context);
  case 258: return invoke_widget(lv_label_set_max_lines, obj, cursor, context);
  default: return false;
  }
}
#endif
#if LV_USE_BUTTON
static bool execute_button(lv_obj_t *obj, uint16_t method, CborValue &cursor, WidgetContext &context) {
  switch (method) {
  default: return false;
  }
}
#endif
#if LV_USE_BAR
static void adapt_bar_257(lv_obj_t *obj, int32_t a0) { lv_bar_set_value(obj, a0, LV_ANIM_OFF); }
static bool execute_bar(lv_obj_t *obj, uint16_t method, CborValue &cursor, WidgetContext &context) {
  switch (method) {
  case 256: return invoke_widget(lv_bar_set_range, obj, cursor, context);
  case 257: return invoke_widget(adapt_bar_257, obj, cursor, context);
  default: return false;
  }
}
#endif
#if LV_USE_SLIDER
static void adapt_slider_257(lv_obj_t *obj, int32_t a0) { lv_slider_set_value(obj, a0, LV_ANIM_OFF); }
static void adapt_slider_258(lv_obj_t *obj, int32_t a0) { lv_slider_set_start_value(obj, a0, LV_ANIM_OFF); }
static bool execute_slider(lv_obj_t *obj, uint16_t method, CborValue &cursor, WidgetContext &context) {
  switch (method) {
  case 256: return invoke_widget(lv_slider_set_range, obj, cursor, context);
  case 257: return invoke_widget(adapt_slider_257, obj, cursor, context);
  case 258: return invoke_widget(adapt_slider_258, obj, cursor, context);
  default: return false;
  }
}
#endif
#if LV_USE_ARC
static bool execute_arc(lv_obj_t *obj, uint16_t method, CborValue &cursor, WidgetContext &context) {
  switch (method) {
  case 256: return invoke_widget(lv_arc_set_range, obj, cursor, context);
  case 257: return invoke_widget(lv_arc_set_value, obj, cursor, context);
  case 258: return invoke_widget(lv_arc_set_angles, obj, cursor, context);
  case 259: return invoke_widget(lv_arc_set_bg_angles, obj, cursor, context);
  case 260: return invoke_widget(lv_arc_set_rotation, obj, cursor, context);
  case 261: return invoke_widget(lv_arc_set_mode, obj, cursor, context);
  default: return false;
  }
}
#endif
#if LV_USE_LINE
static bool execute_line(lv_obj_t *obj, uint16_t method, CborValue &cursor, WidgetContext &context) {
  switch (method) {
  case 256: return invoke_widget(set_line_points, obj, cursor, context);
  default: return false;
  }
}
#endif
#if LV_USE_IMAGE
static bool execute_image(lv_obj_t *obj, uint16_t method, CborValue &cursor, WidgetContext &context) {
  switch (method) {
  case 256: return invoke_widget(lv_image_set_src, obj, cursor, context);
  case 257: return invoke_widget(lv_image_set_scale, obj, cursor, context);
  case 258: return invoke_widget(lv_image_set_rotation, obj, cursor, context);
  default: return false;
  }
}
#endif
#if LV_USE_CHECKBOX
static bool execute_checkbox(lv_obj_t *obj, uint16_t method, CborValue &cursor, WidgetContext &context) {
  switch (method) {
  case 256: return invoke_widget(lv_checkbox_set_text, obj, cursor, context);
  default: return false;
  }
}
#endif
#if LV_USE_SWITCH
static bool execute_switch(lv_obj_t *obj, uint16_t method, CborValue &cursor, WidgetContext &context) {
  switch (method) {
  default: return false;
  }
}
#endif
#if LV_USE_TEXTAREA
static bool execute_textarea(lv_obj_t *obj, uint16_t method, CborValue &cursor, WidgetContext &context) {
  switch (method) {
  case 256: return invoke_widget(lv_textarea_set_text, obj, cursor, context);
  case 257: return invoke_widget(lv_textarea_set_max_length, obj, cursor, context);
  case 258: return invoke_widget(lv_textarea_set_one_line, obj, cursor, context);
  case 259: return invoke_widget(lv_textarea_set_password_mode, obj, cursor, context);
  default: return false;
  }
}
#endif
#if LV_USE_DROPDOWN
static bool execute_dropdown(lv_obj_t *obj, uint16_t method, CborValue &cursor, WidgetContext &context) {
  switch (method) {
  case 256: return invoke_widget(lv_dropdown_set_options, obj, cursor, context);
  case 257: return invoke_widget(lv_dropdown_set_selected, obj, cursor, context);
  case 258: return invoke_widget(lv_dropdown_set_dir, obj, cursor, context);
  default: return false;
  }
}
#endif
static bool select_builtin(unsigned type, WidgetFactory &create, WidgetExecutor &execute) {
  switch (type) {
  case 0: create = lv_obj_create; execute = execute_obj; return true;
#if LV_USE_LABEL
  case 1: create = lv_label_create; execute = execute_label; return true;
#endif
#if LV_USE_BUTTON
  case 2: create = lv_button_create; execute = execute_button; return true;
#endif
#if LV_USE_BAR
  case 3: create = lv_bar_create; execute = execute_bar; return true;
#endif
#if LV_USE_SLIDER
  case 4: create = lv_slider_create; execute = execute_slider; return true;
#endif
#if LV_USE_ARC
  case 5: create = lv_arc_create; execute = execute_arc; return true;
#endif
#if LV_USE_LINE
  case 6: create = lv_line_create; execute = execute_line; return true;
#endif
#if LV_USE_IMAGE
  case 7: create = lv_image_create; execute = execute_image; return true;
#endif
#if LV_USE_CHECKBOX
  case 8: create = lv_checkbox_create; execute = execute_checkbox; return true;
#endif
#if LV_USE_SWITCH
  case 9: create = lv_switch_create; execute = execute_switch; return true;
#endif
#if LV_USE_TEXTAREA
  case 10: create = lv_textarea_create; execute = execute_textarea; return true;
#endif
#if LV_USE_DROPDOWN
  case 11: create = lv_dropdown_create; execute = execute_dropdown; return true;
#endif
  default: return false;
  }
}
static unsigned builtin_type(const char *name) {
  if (!std::strcmp(name, "obj")) return 0;
  if (!std::strcmp(name, "label")) return 1;
  if (!std::strcmp(name, "button")) return 2;
  if (!std::strcmp(name, "bar")) return 3;
  if (!std::strcmp(name, "slider")) return 4;
  if (!std::strcmp(name, "arc")) return 5;
  if (!std::strcmp(name, "line")) return 6;
  if (!std::strcmp(name, "image")) return 7;
  if (!std::strcmp(name, "checkbox")) return 8;
  if (!std::strcmp(name, "switch")) return 9;
  if (!std::strcmp(name, "textarea")) return 10;
  if (!std::strcmp(name, "dropdown")) return 11;
  return 65536;
}
