// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "screen_runtime.hpp"
#include <string>
#include <vector>
namespace lvgl_cbor {
struct CapabilityLimits {
  ScreenLimits screen;
  size_t style_packet_bytes = 8192, screen_packet_bytes = 32768;
  size_t screen_websocket_packet_bytes{};
  // Application-registered layouts can be added to this list before publishing a snapshot.
  std::vector<unsigned> extra_layouts;
};
// Immutable build catalog + actually compiled widget factories + application resources/limits.
// The application may republish this snapshot after changing its resource/layout registry.
std::string runtime_capabilities_json(const Resource *, size_t, CapabilityLimits limits = {},
                                      const WidgetRegistry *registry = nullptr,
                                      const DataRegistry *data = nullptr);
} // namespace lvgl_cbor
