// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "cbor_reader.hpp"
#include "lvgl_cbor/widget_execution.hpp"
#include "screen_internal.hpp"
#include <cstdio>
#include <cstring>
namespace lvgl_cbor::detail {
namespace {
#if LV_USE_LINE
void set_line_points(lv_obj_t *obj, PointSpan points) {
  lv_line_set_points(obj, points.data, points.size);
}
#endif
#include "widget_methods.inc"

bool enter(CborValue &cursor, CborValue &child, size_t &length) {
  return cbor_value_is_array(&cursor) &&
         cbor_value_get_array_length(&cursor, &length) == CborNoError &&
         cbor_value_enter_container(&cursor, &child) == CborNoError;
}
bool leave(CborValue &cursor, CborValue &child) {
  return cbor_value_at_end(&child) && cbor_value_leave_container(&cursor, &child) == CborNoError;
}
bool next(CborValue &cursor) {
  return cbor_value_advance(&cursor) == CborNoError;
}
bool read_code(CborValue &cursor, uint16_t &code) {
  int64_t number;
  if (!integer(cursor, number) || number < 0 || number > 65535 || !next(cursor))
    return false;
  code = uint16_t(number);
  return true;
}
void node_deleted(lv_event_t *event) {
  static_cast<ScreenNode *>(lv_event_get_user_data(event))->object = nullptr;
}
// Resolve the type/factory/handler once. No method invocation searches this registry.
bool select_type(CborValue &cursor, ScreenNode &node, WidgetFactory &create,
                 WidgetExecutor &execute, DecodeContext &ctx) {
  CborValue descriptor;
  size_t length;
  const bool extension = cbor_value_is_array(&cursor);
  if (extension && (!enter(cursor, descriptor, length) || length != 2))
    return false;
  CborValue &type = extension ? descriptor : cursor;
  unsigned id;
  if (cbor_value_is_text_string(&type)) {
    char name[64];
    if (!text(type, name, sizeof(name)))
      return false;
    if (extension)
      node.extension = ctx.plan.registry ? ctx.plan.registry->find(name) : nullptr;
    id = extension ? (node.extension ? node.extension->id : 65536) : builtin_type(name);
  } else {
    int64_t number;
    if (!integer(type, number) || number < 0 || number > 65535)
      return false;
    id = unsigned(number);
    if (extension)
      node.extension = ctx.plan.registry ? ctx.plan.registry->find(id) : nullptr;
  }
  if (!next(type))
    return false;
  node.type = id;
  if (extension) {
    char abi[64];
    if (!node.extension || !text(descriptor, abi, sizeof(abi)) || node.extension->abi != abi ||
        !next(descriptor) || !leave(cursor, descriptor))
      return false;
    create = node.extension->create;
    execute = node.extension->execute;
    return true;
  }
  return select_builtin(id, create, execute);
}

bool execute_create(CborValue &, lv_obj_t *, std::unique_ptr<ScreenNode> &, size_t, DecodeContext &,
                    bool);

bool execute_object_command(uint16_t method, CborValue &argument, ScreenNode &node,
                            WidgetExecutor handler, DecodeContext &ctx) {
  WidgetContext values{ctx.resources, ctx.resource_count, ctx.plan.widget_storage,
                       ctx.limits.text_bytes};
  if (method == screen_command_set_id) {
    char id[64];
    if (!text(argument, id, sizeof(id)) || !next(argument))
      return false;
    node.id = id;
    std::snprintf(ctx.reply.node, sizeof(ctx.reply.node), "%s", id);
    return true;
  }
  if (method == screen_command_style || method == screen_command_style_ref) {
    CborValue fields;
    size_t length;
    int64_t selector;
    if (!enter(argument, fields, length) || length != 2 || !integer(fields, selector) ||
        !next(fields))
      return false;
    lv_style_t *style;
    std::shared_ptr<StyleValue> owner;
    if (method == screen_command_style) {
      // Pass the complete nested map to the independent style executor.
      if (!own_style(fields, ctx, style))
        return false;
    } else {
      char ref[80];
      if (!text(fields, ref, sizeof(ref)))
        return false;
      auto found = ctx.plan.service->resolve(ref, ctx.plan.scope);
      if (!found)
        return false;
      style = const_cast<lv_style_t *>(found.value);
      owner = found.owner;
    }
    if (!next(fields) || !leave(argument, fields))
      return false;
    if (owner)
      node.style_owners.push_back(std::move(owner));
    lv_obj_add_style(node.object, style, lv_style_selector_t(selector));
    return true;
  }
  return method <= 255 ? execute_common(node.object, method, argument, values)
                       : handler(node.object, method, argument, values);
}

bool execute_body(CborValue &cursor, ScreenNode &node, WidgetExecutor handler, size_t depth,
                  DecodeContext &ctx) {
  CborValue commands;
  size_t length;
  if (!enter(cursor, commands, length))
    return false;
  while (!cbor_value_at_end(&commands)) {
    CborValue fields;
    size_t fields_count;
    uint16_t method;
    if (!enter(commands, fields, fields_count) || !read_code(fields, method))
      return false;
    ctx.reply.opcode = method;
    std::snprintf(ctx.reply.node, sizeof(ctx.reply.node), "%s", node.id.c_str());
    if (method == screen_command_create) {
      if (fields_count != 3)
        return false;
      node.children.push_back(std::make_unique<ScreenNode>());
      if (!execute_create(fields, node.object, node.children.back(), depth + 1, ctx, false))
        return false;
    } else {
      if (fields_count != 2 || !execute_object_command(method, fields, node, handler, ctx))
        return false;
      if (!node.object)
        return false;
      ++ctx.plan.method_count;
    }
    // The selected handler consumed its argument. Leaving advances past this command,
    // without scanning or replaying the nested object's already-executed body.
    if (!leave(commands, fields))
      return false;
  }
  return leave(cursor, commands);
}
bool execute_create(CborValue &fields, lv_obj_t *parent, std::unique_ptr<ScreenNode> &slot,
                    size_t depth, DecodeContext &ctx, bool standalone) {
  if (depth > ctx.limits.depth || ctx.plan.node_count >= ctx.limits.nodes)
    return false;
  if (!slot)
    slot = std::make_unique<ScreenNode>();
  auto &node = *slot;
  WidgetFactory create{};
  WidgetExecutor handler{};
  if (!select_type(fields, node, create, handler, ctx) || (standalone && node.type != 0))
    return false;
  node.execute = handler;
  if (!(node.object = create(parent)))
    return false;
  ++ctx.plan.node_count;
  lv_obj_add_event_cb(node.object, node_deleted, LV_EVENT_DELETE, &node);
  if (!ctx.plan.theme)
    lv_obj_remove_style_all(node.object);
  return execute_body(fields, node, handler, depth, ctx);
}
} // namespace
bool execute_bound_method(ScreenNode &node,uint16_t method,CborValue &value,WidgetContext &context) {
  if(!node.object||method<4)return false;
  return method<=255?execute_common(node.object,method,value,context):node.execute&&node.execute(node.object,method,value,context);
}
WidgetFactory widget_factory(unsigned id) {
  WidgetFactory create{};
  WidgetExecutor execute{};
  return select_builtin(id, create, execute) ? create : nullptr;
}
size_t widget_factory_count() {
  return screen_widget_count;
}
bool execute_screen(CborValue &cursor, lv_obj_t *parent, DecodeContext &ctx, bool standalone) {
  CborValue fields;
  size_t count;
  uint16_t method;
  if (!enter(cursor, fields, count) || count != 3 || !read_code(fields, method) ||
      method != screen_command_create)
    return false;
  return execute_create(fields, parent, ctx.plan.root, 1, ctx, standalone) && leave(cursor, fields);
}
void delete_tree(ScreenNode *node) {
  if (node && node->object)
    lv_obj_delete(node->object);
  // Reparenting does not transfer instance ownership.
  if (node)
    for (auto &child : node->children)
      delete_tree(child.get());
}
lv_obj_t *find_object(ScreenNode *node, const char *id) {
  if (!node || !node->object || !id)
    return nullptr;
  if (node->id == id)
    return node->object;
  for (auto &child : node->children)
    if (auto *obj = find_object(child.get(), id))
      return obj;
  return nullptr;
}
} // namespace lvgl_cbor::detail
