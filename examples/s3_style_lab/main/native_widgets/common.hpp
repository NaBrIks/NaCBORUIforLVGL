// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/widget_execution.hpp"
#include <new>

namespace lab_widgets
{
	constexpr uint32_t background = 0x182c38, muted = 0x91adbc, ink = 0xe9f3f6;
	constexpr uint32_t green = 0x38d6ae, amber = 0xffc166, red = 0xff6e76;
	inline lv_color_t color(uint32_t value)
	{
		return lv_color_hex(value);
	}

	struct ThemePart { const char *role; lv_part_t part; const lv_style_t *style{}; };
	inline ThemePart theme_parts[]{
		{"inst_main", LV_PART_MAIN}, {"inst_items", LV_PART_ITEMS}, {"inst_value", LV_PART_INDICATOR},
		{"inst_warn", LV_PART_SELECTED}, {"inst_fault", LV_PART_KNOB}
	};

	template<uint32_t Tint> inline void default_text(lv_obj_t *obj, lv_part_t part)
	{
		static lv_style_t style = []{
			lv_style_t style;
			lv_style_init(&style);
			lv_style_set_text_color(&style, color(Tint));
			return style;
		}();
		lv_obj_add_style(obj, &style, part);
	}

	inline void attach_theme(lv_obj_t *obj)
	{
		for(const auto &part : theme_parts)
			if(part.style) lv_obj_add_style(obj, part.style, part.part);
	}

	inline lv_color_t paint(lv_obj_t *obj, lv_part_t part, lv_style_prop_t property, uint32_t fallback)
	{
		if(lv_obj_has_style_prop(obj, part | lv_obj_get_state(obj), property))
			return lv_obj_get_style_prop(obj, part, property).color;
		return color(fallback);
	}

	inline lv_obj_t *frame(lv_obj_t *parent, int width, int height)
	{
		auto *obj = lv_obj_create(parent);
		lv_obj_remove_style_all(obj);
		lv_obj_set_scrollable(obj, false);
		lv_obj_set_size(obj, width, height);
		static lv_style_t style = []{
			lv_style_t style;
			lv_style_init(&style);
			lv_style_set_bg_color(&style, color(background));
			lv_style_set_bg_opa(&style, LV_OPA_COVER);
			lv_style_set_border_color(&style, color(0x375363));
			lv_style_set_border_width(&style, 1);
			lv_style_set_radius(&style, 6);
			lv_style_set_pad_all(&style, 12);
			lv_style_set_text_font(&style, &lv_font_montserrat_20);
			lv_style_set_text_color(&style, color(ink));
			return style;
		}();
		lv_obj_add_style(obj, &style, LV_PART_MAIN);
		return obj;
	}

	template<class State> inline State &state(lv_obj_t *obj)
	{
		return *static_cast<State *>(lv_obj_get_user_data(obj));
	}

	template<class State> inline bool own(lv_obj_t *obj, State *data)
	{
		if(!data) { lv_obj_delete(obj); return false; }

		lv_obj_set_user_data(obj, data);
		lv_obj_add_event_cb(obj, [](lv_event_t *event) {
			delete static_cast<State *>(lv_event_get_user_data(event));
		}, LV_EVENT_DELETE, data);
		return true;
	}

} // namespace lab_widgets
