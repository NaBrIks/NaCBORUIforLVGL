#pragma once
#include "lvgl_cbor/screen_runtime.hpp"
#include "lvgl_cbor/widget_registry.hpp"
#include "style_dispatch.hpp"
#include <memory>
#include <string>
#include <vector>
namespace lvgl_cbor::detail {
struct ScreenBindings;
struct ScreenViews;
using OwnedStyle = ::lvgl_cbor::StyleValue;
struct ScreenNode {
  std::string id;
  unsigned type{};
  lv_obj_t *object{};
  std::shared_ptr<const NativeWidget> extension;
  WidgetExecutor execute{};
  std::vector<std::shared_ptr<StyleValue>> style_owners;
  std::vector<std::unique_ptr<ScreenNode>> children;
};
struct ScreenPlan {
  CborParser parser{}; // Command views borrow the caller buffer only during synchronous load/mount.
  CborValue program{};
  CborValue binding_envelope{};
  DataRegistry *data{};
  std::shared_ptr<ScreenBindings> bindings;
  std::shared_ptr<ScreenViews> views;
  WidgetStorage widget_storage;
  WidgetRegistry *registry{};
  std::string id;
  int width{}, height{};
  bool theme = true;
  std::shared_ptr<StyleStorage> storage = std::make_shared<StyleStorage>();
  std::shared_ptr<StyleScope> scope;
  StyleService *service{};
  std::vector<std::shared_ptr<OwnedStyle>> styles;
  std::unique_ptr<ScreenNode> root;
  unsigned node_count{}, method_count{};
};
struct DecodeContext {
  ScreenPlan &plan;
  const Resource *resources;
  size_t resource_count;
  ScreenLimits limits;
  ScreenReply &reply;
};
WidgetFactory widget_factory(unsigned id);
size_t widget_factory_count();
bool decode_screen(const uint8_t *, size_t, ScreenPlan &, const Resource *, size_t,
                   const ScreenLimits &, ScreenReply &);
bool execute_screen(CborValue &, lv_obj_t *, DecodeContext &, bool standalone);
bool own_style(const CborValue &, DecodeContext &, lv_style_t *&);
void delete_tree(ScreenNode *);
lv_obj_t *find_object(ScreenNode *, const char *);
} // namespace lvgl_cbor::detail
