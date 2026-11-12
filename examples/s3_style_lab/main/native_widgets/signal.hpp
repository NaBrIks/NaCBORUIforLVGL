// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "drawing.hpp"
namespace lab_widgets::signal
{
	struct State { const char *title = "FEED PUMP"; int32_t value = 1; };

	inline void draw(lv_event_t *event)
	{
		auto *obj = lv_event_get_target_obj(event);
		auto *layer = lv_event_get_layer(event);
		const auto &s = state<State>(obj);
		constexpr lv_part_t parts[]{LV_PART_ITEMS, LV_PART_INDICATOR, LV_PART_SELECTED, LV_PART_KNOB};
		constexpr uint32_t colors[]{muted, green, amber, red};
		const char *names[]{"STOP", "RUN", "WARN", "FAULT"};
		const auto part = parts[s.value];
		lv_area_t area;
		lv_obj_get_content_coords(obj, &area);
		const auto heading = lv_obj_get_style_text_color(obj, LV_PART_ITEMS);
		const auto status_color = lv_obj_get_style_text_color(obj, part);
		drawing::text(layer, s.title, area.x1, area.y1, lv_area_get_width(&area), heading,
		    lv_obj_get_style_text_font(obj, LV_PART_MAIN));
		lv_draw_rect_dsc_t dot;
		lv_draw_rect_dsc_init(&dot);
		dot.radius = LV_RADIUS_CIRCLE;
		dot.bg_opa = LV_OPA_COVER;
		dot.bg_color = paint(obj, part, LV_STYLE_BG_COLOR, colors[s.value]);
		const lv_area_t bounds{area.x1, area.y1 + 42, area.x1 + 21, area.y1 + 63};
		lv_draw_rect(layer, &dot, &bounds);
		drawing::text(layer, names[s.value], area.x1 + 36, area.y1 + 40,
		    std::max<int32_t>(1, lv_area_get_width(&area) - 36), status_color, &lv_font_montserrat_28);
	}

	inline void title(lv_obj_t *obj, const char *text)
	{
		state<State>(obj).title = text;
		lv_obj_invalidate(obj);
	}

	inline void status(lv_obj_t *obj, int32_t value)
	{
		state<State>(obj).value = value;
		lv_obj_invalidate(obj);
	}

	inline lv_obj_t *create(lv_obj_t *parent)
	{
		auto *obj = frame(parent, 220, 100);
		if(!own(obj, new(std::nothrow) State{})) return nullptr;
		default_text<muted>(obj, LV_PART_ITEMS);
		default_text<green>(obj, LV_PART_INDICATOR);
		default_text<amber>(obj, LV_PART_SELECTED);
		default_text<red>(obj, LV_PART_KNOB);
		attach_theme(obj);
		lv_obj_add_event_cb(obj, draw, LV_EVENT_DRAW_MAIN, nullptr);
		return obj;
	}

	inline bool execute(lv_obj_t *obj, uint16_t method, CborValue &cursor, lvgl_cbor::WidgetContext &context)
	{
		switch(method)
		{
		case 256: return lvgl_cbor::invoke_widget(title, obj, cursor, context);
		case 257: return lvgl_cbor::invoke_widget(status, obj, cursor, context);
		default: return false;
		}
	}

}
