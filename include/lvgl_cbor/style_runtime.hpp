#pragma once
#include "lvgl.h"
#include "style_service.hpp"
#include <cstddef>
#include <cstdint>

namespace lvgl_cbor {
struct Resource {
  const char *name;
  const char *type;
  const void *value;
};
struct Reply {
  char id[48]{};
  char error[160]{};
  bool ok{};
  unsigned methods{};
};
// All calls (including destruction) run in the application's LVGL context.
// Resources and their names must outlive the runtime and every style using them.
// A valid target can be rebound; nullptr temporarily detaches it. Deletion clears the weak handle.
class StyleRuntime {
public:
  explicit StyleRuntime(lv_obj_t *target, const Resource *resources = nullptr,
                        size_t resource_count = 0, StyleService *service = nullptr);
  ~StyleRuntime();
  StyleRuntime(const StyleRuntime &) = delete;
  StyleRuntime &operator=(const StyleRuntime &) = delete;
  bool apply(const uint8_t *packet, size_t length, Reply &reply);
  void set_target(lv_obj_t *target);
  lv_obj_t *target() const {
    return target_;
  }

  StyleService &service() {
    return *service_;
  }
  void set_screen_scope(std::shared_ptr<StyleScope> scope) {
    screen_ = scope ? std::move(scope) : service_->create_scope(8);
  }

private:
  std::unique_ptr<StyleService> owned_service_;
  StyleService *service_;
  std::shared_ptr<StyleScope> screen_;
  lv_obj_t *target_;
  StyleHandle attached_;
  const Resource *resources_;
  size_t resource_count_;
  static void target_deleted(lv_event_t *event);
};
} // namespace lvgl_cbor
