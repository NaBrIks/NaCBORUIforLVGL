// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/widget_execution.hpp"

// A runtime-registered native component. Its implementation is ordinary C++.
// compiler_json is supplied from meter.json; it is not used by the executor.
namespace meter_example
{
	inline void set_value(lv_obj_t *obj, int32_t value)
	{
		lv_label_set_text_fmt(obj, "%ld", long(value));
	}

	inline void set_alarm(lv_obj_t *obj, int32_t value)
	{
		lv_obj_set_style_border_width(obj, value, 0);
	}

	inline void set_reading(lv_obj_t *obj, int32_t value, const char *unit)
	{
		lv_label_set_text_fmt(obj, "%ld %s", long(value), unit);
		// Demonstrates borrowing an argument: instance storage outlives the object.
		lv_obj_set_user_data(obj, const_cast<char *>(unit));
	}

	inline bool execute(lv_obj_t *obj, uint16_t method, CborValue &cursor,
	    lvgl_cbor::WidgetContext &context)
	{
		switch(method)
		{
		case 256:
			return lvgl_cbor::invoke_widget(set_value, obj, cursor, context);
		case 257:
			return lvgl_cbor::invoke_widget(set_alarm, obj, cursor, context);
		case 258:
			return lvgl_cbor::invoke_widget(set_reading, obj, cursor, context);
		default:
			return false;
		}
	}

	inline bool register_meter(lvgl_cbor::WidgetRegistry &registry, std::string compiler_json)
	{
		return registry.add(
			{256, "example:meter", "meter-1", lv_label_create, execute, std::move(compiler_json)});
	}

} // namespace meter_example
