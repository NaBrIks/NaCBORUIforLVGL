#include "component_preview.hpp"
#include "../../../src/cbor_reader.hpp"
#include "cbor.h"
#include <cstdio>
#include <cstring>

namespace {
using lvgl_cbor::detail::field;
bool creation_body(const CborValue &command, CborValue &body, int &type) {
  CborValue it;
  size_t count;
  int opcode;
  return cbor_value_is_array(&command) &&
         cbor_value_get_array_length(&command, &count) == CborNoError && count == 3 &&
         cbor_value_enter_container(&command, &it) == CborNoError && cbor_value_is_integer(&it) &&
         cbor_value_get_int_checked(&it, &opcode) == CborNoError &&
         opcode == lvgl_cbor::screen_command_create && cbor_value_advance(&it) == CborNoError &&
         cbor_value_is_integer(&it) && cbor_value_get_int_checked(&it, &type) == CborNoError &&
         cbor_value_advance(&it) == CborNoError && cbor_value_is_array(&it) &&
         cbor_value_enter_container(&it, &body) == CborNoError;
}
bool command_fields(const CborValue &command, int &opcode, CborValue &args) {
  return cbor_value_is_array(&command) &&
         cbor_value_enter_container(&command, &args) == CborNoError &&
         cbor_value_is_integer(&args) &&
         cbor_value_get_int_checked(&args, &opcode) == CborNoError &&
         cbor_value_advance(&args) == CborNoError;
}
bool sample_shape(const uint8_t *bytes, size_t size, int &type) {
  CborParser parser;
  CborValue document, root, commands;
  int root_type;
  if (!bytes || !size || size > 3584 ||
      cbor_parser_init(bytes, size, 0, &parser, &document) != CborNoError)
    return false;
  auto bounded = document;
  if (!lvgl_cbor::detail::bounded_cbor(bounded) ||
      cbor_value_get_next_byte(&bounded) != bytes + size || !field(document, "root", root) ||
      !creation_body(root, commands, root_type) || root_type != 0)
    return false;
  unsigned children = 0;
  bool sample = false;
  while (!cbor_value_at_end(&commands)) {
    CborValue args;
    int opcode;
    if (!command_fields(commands, opcode, args))
      return false;
    if (opcode == lvgl_cbor::screen_command_create) {
      if (++children > 1)
        return false;
      CborValue body;
      if (!creation_body(commands, body, type))
        return false;
      while (!cbor_value_at_end(&body)) {
        if (!command_fields(body, opcode, args))
          return false;
        if (opcode == lvgl_cbor::screen_command_set_id) {
          char name[64];
          if (!lvgl_cbor::detail::text(args, name, sizeof(name)))
            return false;
          sample = std::strcmp(name, "sample") == 0;
        }
        if (cbor_value_advance(&body) != CborNoError)
          return false;
      }
    }
    if (cbor_value_advance(&commands) != CborNoError)
      return false;
  }
  return children == 1 && sample;
}
} // namespace
bool ComponentPreview::apply(const uint8_t *bytes, size_t size, lv_obj_t *parent,
                             lvgl_cbor::StyleRuntime &styles, lvgl_cbor::ScreenReply &reply) {
  int next_type;
  if (!sample_shape(bytes, size, next_type)) {
    reply = {};
    std::snprintf(reply.error, sizeof(reply.error), "component_shape");
    return false;
  }
  auto *previous = styles.target();
  auto *legacy = target() ? nullptr : previous;
  styles.set_target(nullptr);
  if (!runtime_.mount(bytes, size, parent, reply)) {
    styles.set_target(previous);
    return false;
  }
  styles.set_target(target());
  if (legacy)
    lv_obj_set_hidden(legacy, true);
  type_ = next_type;
  lv_screen_load(lv_obj_get_screen(parent));
  lv_obj_update_layout(parent);
  return true;
}
