#pragma once
#include "lvgl_cbor/screen_runtime.hpp"
#include <atomic>
// Adapter between a replaceable widget instance and the existing named-style registry.
class ComponentPreview {
public:
  ComponentPreview(const lvgl_cbor::Resource *resources, size_t count, lvgl_cbor::StyleService *service = nullptr)
      : runtime_(resources, count, {}, service) {}
  bool apply(const uint8_t *, size_t, lv_obj_t *parent, lvgl_cbor::StyleRuntime &,
             lvgl_cbor::ScreenReply &);
  lv_obj_t *target() const {
    return runtime_.find("sample");
  }
  int type() const {
    return type_.load(std::memory_order_relaxed);
  }

private:
  lvgl_cbor::ScreenRuntime runtime_;
  std::atomic<int> type_{-1};
};
