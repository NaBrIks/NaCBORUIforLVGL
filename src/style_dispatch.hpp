// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "cbor.h"
#include "lvgl_cbor/style_runtime.hpp"
#include "lvgl_cbor/style_service.hpp"
#include <list>
#include <vector>
namespace lvgl_cbor::detail {
using ::lvgl_cbor::StyleStorage;
struct StyleResult {
  unsigned count{};
  uint16_t opcode{};
  const char *error{};
};
bool apply_style_methods(const CborValue &map, lv_style_t *target, const Resource *resources,
                         size_t resource_count, StyleResult &result,
                         StyleStorage *screen_storage = nullptr);
} // namespace lvgl_cbor::detail
