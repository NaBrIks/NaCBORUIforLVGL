// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "polygon_button.hpp"
#include "polygon_button_catalog.hpp"
#include "lvgl_cbor/widget_execution.hpp"
#include <lvgl_private.h>
#include <algorithm>
#include <cmath>

namespace polygon_button
{
	namespace
	{
		constexpr size_t max_points = 128;
		const lv_point_precise_t rectangle[]{{0, 0}, {1000, 0}, {1000, 1000}, {0, 1000}};
		struct Object { lv_button_t button; lvgl_cbor::PointSpan points; };
		lvgl_cbor::PointSpan points(lv_obj_t *obj)
		{
			return reinterpret_cast<Object *>(obj)->points;
		}

		lv_fpoint_t screen_point(lv_obj_t *obj, const lv_point_precise_t &p)
		{
			lv_area_t a; lv_obj_get_coords(obj, &a);
			return {float(a.x1) + float(p.x) * float(std::max(0, lv_area_get_width(&a) - 1)) / 1000,
			        float(a.y1) + float(p.y) * float(std::max(0, lv_area_get_height(&a) - 1)) / 1000};
		}

// The same scaled segments define vector fill, border and pointer ownership.
		bool contains(lv_obj_t *obj, const lv_point_t &point)
		{
			const auto polygon = points(obj); bool inside = false;
			const double tolerance = std::max(.5, double(lv_obj_get_style_border_width(obj, LV_PART_MAIN)) / 2);
			const double px = point.x, py = point.y;
			for(size_t i = 0, j = polygon.size - 1; i < polygon.size; j = i++)
			{
				const auto a = screen_point(obj, polygon.data[j]), b = screen_point(obj, polygon.data[i]);
				const double dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
				const double t = length ? std::clamp(((px - a.x) * dx + (py - a.y) * dy) / length, 0., 1.) : 0;
				const double ex = px - (a.x + t * dx), ey = py - (a.y + t * dy);
				if(ex * ex + ey * ey <= tolerance * tolerance) return true;

				if((a.y > py) != (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) inside = !inside;
			}
			return inside;
		}

		void draw(lv_obj_t *obj, lv_layer_t *layer)
		{
			const auto polygon = points(obj); if(polygon.size < 3) return;

			auto *descriptor = lv_draw_vector_dsc_create(layer);
			auto *path = lv_vector_path_create(LV_VECTOR_PATH_QUALITY_HIGH);
			if(!descriptor || !path)
			{
				if(descriptor) lv_draw_vector_dsc_delete(descriptor);

				if(path) lv_vector_path_delete(path);

				return;
			}

			auto first = screen_point(obj, polygon.data[0]); lv_vector_path_move_to(path, &first);
			for(size_t i = 1; i < polygon.size; ++i)
			{
				auto p = screen_point(obj, polygon.data[i]); lv_vector_path_line_to(path, &p);
			}
			lv_vector_path_close(path);
			lv_draw_vector_dsc_set_fill_rule(descriptor, LV_VECTOR_FILL_EVENODD);
			lv_draw_vector_dsc_set_fill_color(descriptor, lv_obj_get_style_bg_color(obj, LV_PART_MAIN));
			lv_draw_vector_dsc_set_fill_opa(descriptor, lv_obj_get_style_bg_opa(obj, LV_PART_MAIN));
			const auto border = lv_obj_get_style_border_width(obj, LV_PART_MAIN);
			const auto outline = lv_obj_get_style_outline_width(obj, LV_PART_MAIN);
			// Generic focus decoration follows the polygon; it does not enlarge pointer ownership.
			// outline_pad is deliberately not an offset polygon operation.
			lv_draw_vector_dsc_set_stroke_color(descriptor, outline ?
			    lv_obj_get_style_outline_color(obj, LV_PART_MAIN) : lv_obj_get_style_border_color(obj, LV_PART_MAIN));
			lv_draw_vector_dsc_set_stroke_width(descriptor, float(std::max(border, outline)));
			lv_draw_vector_dsc_set_stroke_opa(descriptor, outline ? lv_obj_get_style_outline_opa(obj, LV_PART_MAIN) :
			    border ? lv_obj_get_style_border_opa(obj, LV_PART_MAIN) : LV_OPA_TRANSP);
			lv_draw_vector_dsc_add_path(descriptor, path); lv_draw_vector(descriptor);
			lv_vector_path_delete(path); lv_draw_vector_dsc_delete(descriptor);
		}

		void event(const lv_obj_class_t *class_p, lv_event_t *e)
		{
			auto *obj = lv_event_get_current_target_obj(e); const auto code = lv_event_get_code(e);
			if(code == LV_EVENT_DRAW_MAIN){draw(obj, lv_event_get_layer(e)); return;}

			if(code == LV_EVENT_DRAW_MAIN_END || code == LV_EVENT_DRAW_POST) return; // No rectangular background/outline.

			if(code == LV_EVENT_COVER_CHECK){lv_event_set_cover_res(e, LV_COVER_RES_NOT_COVER); return;}

			if(code == LV_EVENT_HIT_TEST)
			{
				auto *hit = lv_event_get_hit_test_info(e); hit->res = hit->res && contains(obj, *hit->point); return;
			}

			(void)lv_obj_event_base(class_p, e); // Standard focus, key, click and pressed-state behavior.
		}

		const lv_obj_class_t object_class = [] {
				lv_obj_class_t c{}; c.base_class = &lv_button_class; c.event_cb = event;
				c.instance_size = sizeof(Object);
				c.width_def = 160; c.height_def = 160; c.group_def = LV_OBJ_CLASS_GROUP_DEF_TRUE;
				c.name = "polygon_button"; return c;
			}();
		lv_obj_t *create(lv_obj_t *parent)
		{
			auto *obj = lv_obj_class_create_obj(&object_class, parent); if(!obj) return nullptr;

			reinterpret_cast<Object *>(obj)->points = {rectangle, 4}; lv_obj_class_init_obj(obj);
			lv_obj_remove_style_all(obj); lv_obj_set_scrollable(obj, false); lv_obj_set_clickable(obj, true);
			lv_obj_set_adv_hittest(obj, true);
			return obj;
		}

		bool execute(lv_obj_t *obj, uint16_t method, CborValue &cursor, lvgl_cbor::WidgetContext &context)
		{
			if(method != 256) return false;

			size_t count; CborValue point;
			// Enforce this component's cardinality and normalized coordinates before PointSpan allocation.
			if(!cbor_value_is_array(&cursor) || cbor_value_get_array_length(&cursor,
			    &count) != CborNoError || count < 3 || count > max_points || cbor_value_enter_container(&cursor,
			    &point) != CborNoError) return false;

			for(size_t i = 0; i < count; ++i)
			{
				size_t dimensions; CborValue coordinate; int64_t x, y;
				if(!cbor_value_is_array(&point) || cbor_value_get_array_length(&point,
				    &dimensions) != CborNoError || dimensions != 2 ||
				    cbor_value_enter_container(&point,
				    &coordinate) != CborNoError || !lvgl_cbor::execution::read_integer(coordinate, x) ||
				    cbor_value_advance(&coordinate) != CborNoError || !lvgl_cbor::execution::read_integer(coordinate,
				    y) ||
				    x < 0 || x > 1000 || y < 0 || y > 1000 || cbor_value_advance(&point) != CborNoError) return false;
			}
			lvgl_cbor::PointSpan value;
			if(!lvgl_cbor::execution::read(cursor, value, context) || cbor_value_advance(&cursor) != CborNoError)
				return false;

			reinterpret_cast<Object *>(obj)->points = value; lv_obj_invalidate(obj); return true;
		}

	}
	bool register_widget(lvgl_cbor::WidgetRegistry &registry)
	{
		return registry.add({514, "ui:polygon_button", "polygon-1", create, execute, polygon_button_catalog});
	}

}
