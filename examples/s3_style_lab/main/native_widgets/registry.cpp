// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "registry.hpp"
#ifndef LVGL_CBOR_DEMO_NATIVE_WIDGETS
#define LVGL_CBOR_DEMO_NATIVE_WIDGETS 1
#endif
#if LVGL_CBOR_DEMO_NATIVE_WIDGETS
#include "signal.hpp"
#include "speedometer.hpp"
#include "radar.hpp"
#include "catalog.generated.hpp"
#else
bool lab_widgets::register_examples(lvgl_cbor::WidgetRegistry &)
{
	return true;
}

#endif
