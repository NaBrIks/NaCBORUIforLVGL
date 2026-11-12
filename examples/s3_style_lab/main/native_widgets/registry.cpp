// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "registry.hpp"
#ifndef LVGL_CBOR_DEMO_NATIVE_WIDGETS
#define LVGL_CBOR_DEMO_NATIVE_WIDGETS 1
#endif
#if LVGL_CBOR_DEMO_NATIVE_WIDGETS
#include "appearance.hpp"
#include "signal.hpp"
#include "speedometer.hpp"
#include "radar.hpp"
#include "catalog.generated.hpp"
bool lab_widgets::register_examples(lvgl_cbor::WidgetRegistry &registry, const Appearance &appearance)
{
	for(auto &part : theme_parts) part.style = appearance.role_style(part.role);
	return register_catalog(registry);
}
#else
bool lab_widgets::register_examples(lvgl_cbor::WidgetRegistry &, const Appearance &)
{
	return true;
}

#endif
