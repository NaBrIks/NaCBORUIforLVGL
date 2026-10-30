// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "screen_internal.hpp"
namespace lvgl_cbor::detail
{
	struct ScreenBindings;
	void deactivate_bindings(ScreenPlan &);
	void activate_bindings(ScreenPlan &, bool);
	bool prepare_bindings(ScreenPlan &, const CborValue &, const Resource *, size_t,
	    const ScreenLimits &, ScreenReply &);
	bool execute_bound_method(ScreenNode &, uint16_t, CborValue &, WidgetContext &);
} // namespace lvgl_cbor::detail
