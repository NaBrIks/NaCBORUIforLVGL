// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "screen_internal.hpp"
#include <cstdio>
namespace lvgl_cbor::detail {
namespace {
bool fail(DecodeContext &c, const char *error) {
  std::snprintf(c.reply.error, sizeof(c.reply.error), "%s", error);
  return false;
}
} // namespace
bool own_style(const CborValue &map, DecodeContext &c, lv_style_t *&result) {
  if (c.plan.styles.size() >= c.limits.styles)
    return fail(c, "style_capacity");
  auto style = std::make_shared<OwnedStyle>();
  style->storage = c.plan.storage;
  StyleResult response;
  if (!apply_style_methods(map, &style->value, c.resources, c.resource_count, response,
                           c.plan.storage.get())) {
    c.reply.opcode = response.opcode;
    return fail(c, response.error);
  }
  c.plan.method_count += response.count;
  result = &style->value;
  c.plan.styles.push_back(std::move(style));
  return true;
}
} // namespace lvgl_cbor::detail
