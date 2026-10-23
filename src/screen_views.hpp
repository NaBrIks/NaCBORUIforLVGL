#pragma once
#include "screen_internal.hpp"
#include <functional>
#include <set>

namespace lvgl_cbor::detail {
struct CompositionState {
  CompositionLimits limits;
  size_t instances{};
  uint64_t clock{};
  size_t operations{};
  std::set<ScreenViews *> owners;
};
std::shared_ptr<CompositionState> composition_state(CompositionLimits);
bool prepare_views(ScreenPlan &, const CborValue &, ScreenRuntime &, ScreenReply &);
void deactivate_views(ScreenPlan &);
void activate_views(ScreenPlan &, bool);
std::function<void()> navigation(ScreenPlan &, ScreenNode &, const std::string &,
                                 const std::string &, std::string &);
bool navigate_view(ScreenPlan &, const char *, const char *, ScreenReply &);
lv_obj_t *find_view_instance(const ScreenPlan &, uint32_t, const char *);
void collect_view_status(const ScreenPlan &, std::vector<ScreenViewStatus> &);
} // namespace lvgl_cbor::detail
