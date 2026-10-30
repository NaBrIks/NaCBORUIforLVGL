// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "common.hpp"
#include <algorithm>
#include <cmath>
#include <cstdio>
namespace lab_widgets::drawing
{
	inline lv_point_t polar(int x, int y, float radius, float degrees)
	{
		const float angle = degrees * 0.01745329252f;
		return {x + int32_t(std::lround(std::cos(angle) * radius)), y + int32_t(std::lround(std::sin(angle) * radius))};
	}

	inline void line(lv_layer_t *layer, lv_point_t a, lv_point_t b, uint32_t tint, int width = 1, int opa = 255)
	{
		lv_draw_line_dsc_t d; lv_draw_line_dsc_init(&d);
		d.p1 = {lv_value_precise_t(a.x), lv_value_precise_t(a.y)};
		d.p2 = {lv_value_precise_t(b.x), lv_value_precise_t(b.y)};
		d.color = color(tint); d.width = width; d.opa = opa; lv_draw_line(layer, &d);
	}

	inline void arc(lv_layer_t *layer, int x, int y, int radius, float start, float end, uint32_t tint, int width,
	    int opa = 255)
	{
		if(end - start < 0.01f) return;

		if(start >= 360){start -= 360; end -= 360;}

		if(end > 360)
		{
			arc(layer, x, y, radius, start, 360, tint, width, opa);
			arc(layer, x, y, radius, 0, end - 360, tint, width, opa); return;
		}

		lv_draw_arc_dsc_t d; lv_draw_arc_dsc_init(&d); d.center = {x, y}; d.radius = radius;
		d.start_angle = start; d.end_angle = end; d.color = color(tint); d.width = width; d.opa = opa;
		lv_draw_arc(layer, &d);
	}

	inline void circle(lv_layer_t *layer, int x, int y, int radius, uint32_t tint, int opa = 255)
	{
		lv_draw_rect_dsc_t d; lv_draw_rect_dsc_init(&d); d.radius = LV_RADIUS_CIRCLE;
		d.bg_color = color(tint); d.bg_opa = opa; lv_area_t a{x - radius, y - radius, x + radius, y + radius};
		lv_draw_rect(layer, &d, &a);
	}

	inline void text(lv_layer_t *layer, const char *value, int x, int y, int width, uint32_t tint = ink,
	    const lv_font_t *font = LV_FONT_DEFAULT, lv_text_align_t align = LV_TEXT_ALIGN_LEFT)
	{
		lv_draw_label_dsc_t d; lv_draw_label_dsc_init(&d); d.text = value; d.text_local = 1;
		d.font = font; d.color = color(tint); d.align = align;
		lv_area_t a{x, y, x + width - 1, y + lv_font_get_line_height(font) + 2}; lv_draw_label(layer, &d, &a);
	}

}
