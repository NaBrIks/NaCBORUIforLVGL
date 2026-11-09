// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/widget_registry.hpp"
namespace polygon_button
{
// Optional LVGL vector profile; geometry and events are supplied by the Project.
	bool register_widget(lvgl_cbor::WidgetRegistry &);
}
