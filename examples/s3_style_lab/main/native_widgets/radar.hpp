// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "drawing.hpp"
namespace lab_widgets::radar
{
	struct Target { const char *name; int32_t bearing, distance, strength; };
	struct State {
		const char *title = "POLAR / CONTACT TRACKER"; lv_obj_t *obj{}; lv_timer_t *timer{};
		Target targets[8]{}; size_t count{}; int32_t sweep = 45, range = 12; bool running = true, owner_active = true;
		~State()
		{
			if(timer)
				lv_timer_delete(timer);
		}

	};
	inline void draw(lv_event_t *event)
	{
		auto *obj = lv_event_get_target_obj(event); auto &s = state<State>(obj);
		auto *layer = lv_event_get_layer(event);
		lv_area_t a; lv_obj_get_coords(obj, &a); int w = lv_area_get_width(&a), h = lv_area_get_height(&a);
		const int r = std::max(20, std::min((w - 52) / 2, (h - 114) / 2)), cx = a.x1 + w / 2, cy = a.y1 + 46 + r;
		const auto foreground = lv_obj_get_style_text_color(obj, LV_PART_MAIN);
		const auto secondary = lv_obj_get_style_text_color(obj, LV_PART_ITEMS);
		const auto status_color = lv_obj_get_style_text_color(obj, LV_PART_INDICATOR);
		const auto field = paint(obj, LV_PART_ITEMS, LV_STYLE_BG_COLOR, 0x081b21);
		const auto rings = paint(obj, LV_PART_MAIN, LV_STYLE_ARC_COLOR, 0x2a5558);
		const auto spokes = paint(obj, LV_PART_MAIN, LV_STYLE_LINE_COLOR, 0x23444b);
		const auto beam = paint(obj, LV_PART_INDICATOR, LV_STYLE_LINE_COLOR, green);
		const auto marker = paint(obj, LV_PART_INDICATOR, LV_STYLE_BG_COLOR, green);
		const auto echo = paint(obj, LV_PART_INDICATOR, LV_STYLE_ARC_COLOR, green);
		const auto center = paint(obj, LV_PART_KNOB, LV_STYLE_BG_COLOR, ink);
		drawing::text(layer, s.title, a.x1 + 12, a.y1 + 10, w - 24, secondary);
		drawing::circle(layer, cx, cy, r + 3, field);
		for(int i = 1; i <= 4; ++i)
			drawing::arc(layer, cx, cy, r * i / 4, 0, 360, rings, i == 4 ? 2 : 1);
		for(int i = 0; i < 360; i += 30)
			drawing::line(layer, {cx, cy}, drawing::polar(cx, cy, r, i), spokes);
		const char *compass[]{"N", "E", "S", "W"};
		for(int i = 0; i < 4; ++i)
		{
			auto p = drawing::polar(cx, cy, r + 15, float(i * 90 - 90));
			drawing::text(layer, compass[i], p.x - 10, p.y - 8, 20, secondary, LV_FONT_DEFAULT, LV_TEXT_ALIGN_CENTER);
		}
		for(int i = 22; i >= 0; --i)
			drawing::line(layer, {cx, cy}, drawing::polar(cx, cy, r, float(s.sweep - 90 - i * 2)), beam, 3,
			    8 + (22 - i) * 4);
		drawing::line(layer, {cx, cy}, drawing::polar(cx, cy, r, float(s.sweep - 90)), beam, 2);
		for(size_t i = 0; i < s.count; ++i)
		{
			const auto &t = s.targets[i];
			auto p = drawing::polar(cx, cy, r * t.distance / 100.0f, float(t.bearing - 90));
			const int age = (s.sweep - t.bearing + 360) % 360, brightness = age < 80 ? 255 - age * 2 : 95;
			drawing::circle(layer, p.x, p.y, 2 + t.strength / 25, marker, brightness);
			drawing::arc(layer, p.x, p.y, 8 + (age < 60 ? age / 15 : 0), 0, 360, echo, 1, brightness);
			drawing::text(layer, t.name, p.x + 10, p.y - 7, std::max<int32_t>(30, a.x2 - p.x - 10),
			    age < 80 ? foreground : secondary);
		}
		drawing::circle(layer, cx, cy, 3, center);
		char status[64];
		std::snprintf(status, sizeof(status), "%s   %03ld deg   %u CONTACTS   %ld km", s.running ? "SCAN" : "HOLD",
		    long(s.sweep), unsigned(s.count), long(s.range));
		drawing::text(layer, status, a.x1 + 12, a.y2 - 24, w - 24, status_color);
	}

	inline void title(lv_obj_t *obj, const char *value)
	{
		state<State>(obj).title = value; lv_obj_invalidate(obj);
	}

	inline void schedule(State &s)
	{
		if(s.running && s.owner_active)
			lv_timer_resume(s.timer);
		else
			lv_timer_pause(s.timer);
	}

	inline void running(lv_obj_t *obj, bool value)
	{
		auto &s = state<State>(obj); s.running = value; schedule(s); lv_obj_invalidate(obj);
	}

	inline void activate(lv_obj_t *obj, bool active)
	{
		auto &s = state<State>(obj); s.owner_active = active; schedule(s);
	}

	inline void sweep(lv_obj_t *obj, int32_t value)
	{
		state<State>(obj).sweep = value; lv_obj_invalidate(obj);
	}

	inline void range(lv_obj_t *obj, int32_t value)
	{
		state<State>(obj).range = value; lv_obj_invalidate(obj);
	}

	inline bool targets(lv_obj_t *obj, CborValue &cursor, lvgl_cbor::WidgetContext &context)
	{
		using namespace lvgl_cbor::execution; CborValue it; size_t count;
		if(!cbor_value_is_array(&cursor) || cbor_value_get_array_length(&cursor,
		    &count) != CborNoError || count > 8 || cbor_value_enter_container(&cursor, &it) != CborNoError)
			return false;

		auto &s = state<State>(obj); s.count = count;
		for(size_t i = 0; i < count; ++i)
		{
			CborValue args; size_t n; auto &t = s.targets[i];
			if(!cbor_value_is_array(&it) || cbor_value_get_array_length(&it,
			    &n) != CborNoError || n != 4 || cbor_value_enter_container(&it, &args) != CborNoError ||
			    !read(args, t.name, context) || cbor_value_advance(&args) != CborNoError || !read(args, t.bearing,
			    context) || cbor_value_advance(&args) != CborNoError ||
			    !read(args, t.distance, context) || cbor_value_advance(&args) != CborNoError || !read(args, t.strength,
			    context) || cbor_value_advance(&args) != CborNoError ||
			    cbor_value_leave_container(&it, &args) != CborNoError) return false;
		}
		lv_obj_invalidate(obj); return cbor_value_leave_container(&cursor, &it) == CborNoError;
	}

	inline lv_obj_t *create(lv_obj_t *parent)
	{
		auto *obj = frame(parent, 416, 412); auto *s = new(std::nothrow) State{}; if(!own(obj, s))
			return nullptr;

		default_text<muted>(obj, LV_PART_ITEMS);
		default_text<green>(obj, LV_PART_INDICATOR);
		attach_theme(obj);
		s->obj = obj;
		s->timer = lv_timer_create([](lv_timer_t *timer){
			auto &data = *static_cast<State *>(lv_timer_get_user_data(timer)); if(data.running && data.owner_active)
			{
				data.sweep = (data.sweep + 3) % 360; lv_obj_invalidate(data.obj);
			}
		}, 100, s);
		if(!s->timer){lv_obj_delete(obj); return nullptr;}

		lv_obj_add_event_cb(obj, draw, LV_EVENT_DRAW_MAIN, nullptr); return obj;
	}

	inline bool execute(lv_obj_t *obj, uint16_t method, CborValue &cursor, lvgl_cbor::WidgetContext &context)
	{
		switch(method)
		{
		case 256: return lvgl_cbor::invoke_widget(title, obj, cursor, context);
		case 257: return lvgl_cbor::invoke_widget(running, obj, cursor, context);
		case 258: return targets(obj, cursor, context);
		case 259: return lvgl_cbor::invoke_widget(sweep, obj, cursor, context);
		case 260: return lvgl_cbor::invoke_widget(range, obj, cursor, context);
		default: return false;
		}
	}

}
