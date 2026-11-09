// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/widget_registry.hpp"
namespace graphics_gallery
{
	bool register_widget(lvgl_cbor::WidgetRegistry &);
	void append_resources(std::vector<lvgl_cbor::Resource> &);
}
