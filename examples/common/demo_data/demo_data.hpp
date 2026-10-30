// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/data_registry.hpp"
#include <chrono>

// Application-owned example capabilities. The UI engine remains in ../../.. /src.
class DemoData {
public:
  lvgl_cbor::DataRegistry registry;
  DemoData();
  void tick();
private:
  std::chrono::steady_clock::time_point start_ = std::chrono::steady_clock::now(), next_{};
  bool running_ = true;
  int64_t clicks_{}, sequence_{};
  double speed_{};
  std::string clock_;
};
