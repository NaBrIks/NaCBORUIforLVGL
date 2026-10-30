// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "screen_internal.hpp"
#include "screen_bindings.hpp"
#include "screen_views.hpp"
#include <cstdio>
#if LV_USE_OBJ_PROPERTY_NAME
#error Disable LV_USE_OBJ_PROPERTY_NAME: the screen runtime dispatches numeric opcodes only
#endif
namespace lvgl_cbor {
namespace {
uint32_t next_instance_id() {
  static uint32_t id{};
  if (!++id) ++id;
  return id;
}
}
struct ScreenRuntime::Impl {
  detail::ScreenPlan plan;
  std::shared_ptr<detail::CompositionState> composition;
  ScreenStyleRetention retention = ScreenStyleRetention::Release;
  ~Impl() {
    detail::deactivate_views(plan);
    detail::deactivate_bindings(plan);
    detail::delete_tree(plan.root.get());
    if (retention == ScreenStyleRetention::Cache && plan.service)
      plan.service->cache_scope(plan.id, plan.scope);
    if (composition) --composition->instances;
  }
};
ScreenRuntime::ScreenRuntime(const Resource *r, size_t n, ScreenLimits limits,
                             StyleService *service, ScreenStyleRetention retention,
                             WidgetRegistry *registry, DataRegistry *data, ScreenResolver *resolver,
                             CompositionLimits composition, ScreenViewport viewport)
    : owned_service_(service ? nullptr : std::make_unique<StyleService>(r, n)),
      service_(service ? service : owned_service_.get()), retention_(retention), resources_(r),
      resource_count_(n), limits_(limits), viewport_(viewport), registry_(registry), data_(data), resolver_(resolver),
      composition_(detail::composition_state(composition)) {
  instance_id_ = next_instance_id();
}
ScreenRuntime::~ScreenRuntime() {
  lv_async_call_cancel(release_deleted, this);
  unload();
  // A parent may retire an inactive child during a guarded composition operation.
  // Remove the observer before forced teardown so DELETE cannot queue this dying runtime.
  if (impl_) {
    busy_ = true;
    if (root()) lv_obj_remove_event_cb_with_user_data(root(), root_deleted, this);
    impl_.reset();
  }
  forget_fallback();
}
lv_obj_t *ScreenRuntime::root() const {
  return impl_ && impl_->plan.root ? impl_->plan.root->object : nullptr;
}
lv_obj_t *ScreenRuntime::find(const char *id) const {
  return impl_ ? detail::find_object(impl_->plan.root.get(), id) : nullptr;
}
lv_obj_t *ScreenRuntime::find(uint32_t instance, const char *id) const {
  if (!instance || instance == instance_id_) return find(id);
  return impl_ ? detail::find_view_instance(impl_->plan, instance, id) : nullptr;
}
std::vector<ScreenViewStatus> ScreenRuntime::view_status() const {
  std::vector<ScreenViewStatus> out;
  if (impl_) detail::collect_view_status(impl_->plan, out);
  return out;
}
std::unique_ptr<ScreenRuntime> ScreenRuntime::make_child(const std::string &name) {
  auto child = std::make_unique<ScreenRuntime>(resources_, resource_count_, limits_, service_,
      ScreenStyleRetention::Release, registry_, data_, resolver_);
  child->composition_ = composition_;
  child->composition_depth_ = composition_depth_ + 1;
  child->ancestors_ = ancestors_;
  child->ancestors_.push_back(name);
  return child;
}
namespace {
void native_activation(detail::ScreenNode *node, bool active) {
  if (!node || !node->object) return;
  if (node->extension && node->extension->activate)
    node->extension->activate(node->object, active);
  if (!node->object) return;
  for (auto &child : node->children) native_activation(child.get(), active);
}
}
void ScreenRuntime::set_active(bool active) {
  if (busy_ || active_ == active) return;
  busy_ = true;
  ++composition_->operations;
  active_ = active;
  if (impl_) {
    if (!active) detail::activate_bindings(impl_->plan, false);
    detail::activate_views(impl_->plan, active);
    native_activation(impl_->plan.root.get(), active);
    if (active) detail::activate_bindings(impl_->plan, true);
  }
  --composition_->operations;
  busy_ = false;
}
bool ScreenRuntime::navigate(const char *view, const char *screen, ScreenReply &reply) {
  reply = {};
  return impl_ && detail::navigate_view(impl_->plan, view, screen, reply);
}
std::shared_ptr<StyleScope> ScreenRuntime::style_scope() const {
  return impl_ ? impl_->plan.scope : nullptr;
}
void ScreenRuntime::fallback_deleted(lv_event_t *event) {
  static_cast<ScreenRuntime *>(lv_event_get_user_data(event))->fallback_ = nullptr;
}
void ScreenRuntime::forget_fallback() {
  if (fallback_) {
    lv_obj_remove_event_cb_with_user_data(fallback_, fallback_deleted, this);
    fallback_ = nullptr;
  }
}
bool ScreenRuntime::load(const uint8_t *p, size_t n, ScreenReply &r) {
  if (!active_) {
    r = {}; std::snprintf(r.error, sizeof(r.error), "runtime_inactive"); return false;
  }
  if (composition_->operations) {
    r = {}; std::snprintf(r.error, sizeof(r.error), "runtime_busy"); return false;
  }
  return replace(p, n, nullptr, true, r);
}
bool ScreenRuntime::busy() const { return busy_ || composition_->operations; }
bool ScreenRuntime::mount(const uint8_t *p, size_t n, lv_obj_t *parent, ScreenReply &r) {
  if (!active_) {
    r = {}; std::snprintf(r.error, sizeof(r.error), "runtime_inactive"); return false;
  }
  if (composition_->operations) {
    r = {}; std::snprintf(r.error, sizeof(r.error), "runtime_busy"); return false;
  }
  if (!parent) {
    r = {};
    std::snprintf(r.error, sizeof(r.error), "mount_parent");
    return false;
  }
  return replace(p, n, parent, false, r);
}
bool ScreenRuntime::replace(const uint8_t *packet, size_t length, lv_obj_t *parent, bool activate,
                            ScreenReply &reply) {
  reply = {};
  auto fail = [&](const char *s) {
    std::snprintf(reply.error, sizeof(reply.error), "%s", s);
    return false;
  };
  if (busy_)
    return fail("runtime_busy");
  busy_ = true;
  struct Guard {
    bool &v;
    ~Guard() {
      v = false;
    }
  } guard{busy_};
  if (parent && !lv_obj_is_valid(parent))
    return fail("mount_parent");
  for (auto *p = parent; p; p = lv_obj_get_parent(p))
    if (p == root())
      return fail("parent_owned_by_replaced_instance");
  auto staged = std::make_unique<Impl>();
  if (composition_->instances >= composition_->limits.instances)
    return fail("composition_instances");
  staged->composition = composition_;
  ++composition_->instances;
  auto &plan = staged->plan;
  plan.service = service_;
  plan.registry = registry_;
  plan.data = data_;
  plan.scope = service_->create_scope(limits_.styles);
  if (!detail::decode_screen(packet, length, plan, resources_, resource_count_, limits_, reply))
    return false;
  if (activate) {
    auto *display = lv_display_get_default();
    if (!display)
      return fail("standalone_root_or_display");
    if (viewport_ == ScreenViewport::Declared &&
        (lv_display_get_horizontal_resolution(display) != plan.width ||
         lv_display_get_vertical_resolution(display) != plan.height))
      return fail("display_size_mismatch");
  }
  detail::DecodeContext execution{plan, resources_, resource_count_, limits_, reply};
  if (!detail::execute_screen(plan.program, parent, execution, activate)) {
    if (!reply.error[0])
      fail("object_execution_failed");
    return false;
  }
  if (!plan.root || !plan.root->object)
    return fail("object_deleted_during_execution");
  if (!detail::prepare_views(plan, plan.binding_envelope, *this, reply))
    return false;
  if (!plan.root->object)
    return fail("object_deleted_during_views");
  if(!detail::prepare_bindings(plan,plan.binding_envelope,resources_,resource_count_,limits_,reply))
    return false;
  if (!plan.root->object)
    return fail("object_deleted_during_binding");
  native_activation(plan.root.get(), active_);
  if (!plan.root->object)
    return fail("object_deleted_during_activation");
  plan.binding_envelope={};
  plan.program = {};
  plan.parser = {};
  auto *display = lv_obj_get_display(plan.root->object);
  lv_obj_set_size(plan.root->object,
                 activate && viewport_ == ScreenViewport::Display ? lv_display_get_horizontal_resolution(display) : plan.width,
                 activate && viewport_ == ScreenViewport::Display ? lv_display_get_vertical_resolution(display) : plan.height);
  lv_obj_update_layout(plan.root->object);
  if (activate) {
    auto *previous = lv_screen_active();
    if (previous != root()) {
      forget_fallback();
      fallback_ = previous;
      lv_obj_add_event_cb(fallback_, fallback_deleted, LV_EVENT_DELETE, this);
    }
    lv_screen_load(plan.root->object);
  }
  // If a mounted replacement is requested while the old standalone root is active, preserve a valid
  // active screen before retiring that old root. Normal component mounts don't switch screens.
  else if (root() && lv_screen_active() == root()) {
    if (fallback_)
      lv_screen_load(fallback_);
    else {
      auto *blank = lv_obj_create(nullptr);
      lv_screen_load(blank);
    }
  }
  staged->retention = retention_;
  if (root())
    lv_obj_remove_event_cb_with_user_data(root(), root_deleted, this);
  impl_.swap(staged);
  lv_obj_add_event_cb(root(), root_deleted, LV_EVENT_DELETE, this);
  reply.nodes = plan.node_count;
  reply.styles = unsigned(plan.styles.size());
  reply.methods = plan.method_count;
  reply.node[0] = 0;
  reply.opcode = 0;
  reply.ok = true;
  return true;
}
void ScreenRuntime::root_deleted(lv_event_t *event) {
  auto *owner = static_cast<ScreenRuntime *>(lv_event_get_user_data(event));
  // LVGL sends DELETE before children are gone. Release the plan on the next UI turn.
  if (!owner->busy_)
    lv_async_call(release_deleted, owner);
}
void ScreenRuntime::release_deleted(void *context) {
  auto *owner = static_cast<ScreenRuntime *>(context);
  if (!owner->busy_ && !owner->root())
    owner->unload();
}
void ScreenRuntime::unload() {
  if (busy())
    return;
  busy_ = true;
  if (root() && lv_screen_active() == root()) {
    if (fallback_)
      lv_screen_load(fallback_);
    else {
      auto *blank = lv_obj_create(nullptr);
      lv_screen_load(blank);
    }
  }
  lv_async_call_cancel(release_deleted, this);
  impl_.reset();
  forget_fallback();
  busy_ = false;
}
} // namespace lvgl_cbor
