// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "screen_internal.hpp"
#include "layout_debug.hpp"
#include <functional>
#include <set>

namespace lvgl_cbor::detail
{
	struct CompositionState {
		CompositionLimits limits;
		std::unique_ptr<LayoutDebugStyles> layout_debug;
		LayoutDebugOptions layout_options;
		size_t instances{};
		uint64_t clock{};
		size_t operations{};
		std::set<ScreenViews *> owners;
	};
	std::shared_ptr<CompositionState> composition_state(CompositionLimits);
	bool prepare_views(ScreenPlan &, const CborValue &, ScreenRuntime &, ScreenReply &,
	    const std::vector<ScreenViewSelection> &);
	void deactivate_views(ScreenPlan &);
	void activate_views(ScreenPlan &, bool);
	std::function<void()> navigation(ScreenPlan &, ScreenNode &, const std::string &,
	    const std::string &, std::string &);
	bool navigate_view(ScreenPlan &, const char *, const char *, ScreenReply &);
	lv_obj_t *find_view_instance(const ScreenPlan &, uint32_t, const char *);
	std::vector<ScreenViewSelection> collect_view_selections(const ScreenPlan &);
	void collect_view_status(const ScreenPlan &, std::vector<ScreenViewStatus> &);
} // namespace lvgl_cbor::detail
