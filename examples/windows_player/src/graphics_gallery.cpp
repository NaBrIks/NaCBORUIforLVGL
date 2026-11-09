// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "graphics_gallery.hpp"
#include "graphics_assets.generated.hpp"
#include "lvgl_cbor/widget_execution.hpp"
#include <algorithm>
#include <cmath>
#include <new>
#include <stdexcept>

namespace graphics_gallery
{
	namespace
	{
		constexpr int width = 160, height = 80;
		lv_image_dsc_t descriptor(const uint8_t *bytes, size_t size, lv_color_format_t format,
		    unsigned w = gallery_assets::width, unsigned h = gallery_assets::height, unsigned stride = 0)
		{
			lv_image_dsc_t image{};
			image.header.magic = LV_IMAGE_HEADER_MAGIC; image.header.cf = format;
			image.header.w = w; image.header.h = h; image.header.stride = stride;
			image.data = bytes; image.data_size = uint32_t(size);
			return image;
		}

		const auto rgb565 = descriptor(gallery_assets::rgb565, sizeof(gallery_assets::rgb565), LV_COLOR_FORMAT_RGB565,
		        96, 64, 192);
		const auto rgb888 = descriptor(gallery_assets::rgb888, sizeof(gallery_assets::rgb888), LV_COLOR_FORMAT_RGB888,
		        96, 64, 288);
		const auto xrgb = descriptor(gallery_assets::xrgb8888, sizeof(gallery_assets::xrgb8888),
		        LV_COLOR_FORMAT_XRGB8888, 96, 64, 384);
		const auto argb = descriptor(gallery_assets::argb8888, sizeof(gallery_assets::argb8888),
		        LV_COLOR_FORMAT_ARGB8888, 96, 64, 384);
		const auto alpha = descriptor(gallery_assets::a8, sizeof(gallery_assets::a8), LV_COLOR_FORMAT_A8, 96, 64, 96);
		const auto indexed = descriptor(gallery_assets::i4, sizeof(gallery_assets::i4), LV_COLOR_FORMAT_I4, 96, 64, 48);
		const auto png = descriptor(gallery_assets::png, sizeof(gallery_assets::png), LV_COLOR_FORMAT_RAW_ALPHA);
		const auto jpeg = descriptor(gallery_assets::jpeg, sizeof(gallery_assets::jpeg), LV_COLOR_FORMAT_RAW);
		const auto gif = descriptor(gallery_assets::gif, sizeof(gallery_assets::gif), LV_COLOR_FORMAT_RAW);
		const auto heart = descriptor(gallery_assets::tabler_heart, sizeof(gallery_assets::tabler_heart),
		        LV_COLOR_FORMAT_RAW_ALPHA, 96, 96);
		const auto cloud = descriptor(gallery_assets::tabler_cloud, sizeof(gallery_assets::tabler_cloud),
		        LV_COLOR_FORMAT_RAW_ALPHA, 96, 96);
		const auto checker = descriptor(gallery_assets::checker, sizeof(gallery_assets::checker),
		        LV_COLOR_FORMAT_RGB565, 176, 108, 352);
		const auto landscape = descriptor(gallery_assets::landscape_svg, sizeof(gallery_assets::landscape_svg),
		        LV_COLOR_FORMAT_RAW_ALPHA, 160, 96);
		lv_fs_path_ex_t bmp_path{}, bin_path{};
		struct State { unsigned mode{}; double progress{}; lv_obj_t *child{}; lv_draw_buf_t *buffer{}; };
		lv_fpoint_t cubic(float t)
		{
			const float a = 1 - t;
			return {8 * a * a * a + 3 * 50 * a * a * t + 3 * 110 * a * t * t + 152 * t * t * t,
			        64 * a * a * a + 3 * 0 * a * a * t + 3 * 80 * a * t * t + 16 * t * t * t};
		}

		void curve(lv_layer_t *layer, int x, int y, bool quadratic, lv_color_t tint)
		{
			auto *d = lv_draw_vector_dsc_create(layer);
			auto *path = lv_vector_path_create(LV_VECTOR_PATH_QUALITY_HIGH);
			if(!d || !path)
			{
				if(d)
					lv_draw_vector_dsc_delete(d);

				if(path)
					lv_vector_path_delete(path);

				return;
			}

			lv_fpoint_t start{float(x + 8), float(y + 64)}, a{float(x + 50), float(y)},
			b{float(x + 110), float(y + 80)}, end{float(x + 152), float(y + 16)};
			lv_vector_path_move_to(path, &start);
			if(quadratic) lv_vector_path_quad_to(path, &a, &end);
			else lv_vector_path_cubic_to(path, &a, &b, &end);

			lv_draw_vector_dsc_set_fill_opa(d, LV_OPA_TRANSP);
			lv_draw_vector_dsc_set_stroke_color(d, tint);
			lv_draw_vector_dsc_set_stroke_opa(d, LV_OPA_COVER);
			lv_draw_vector_dsc_set_stroke_width(d, 3);
			lv_draw_vector_dsc_set_stroke_cap(d, LV_VECTOR_STROKE_CAP_ROUND);
			lv_draw_vector_dsc_add_path(d, path); lv_draw_vector(d);
			lv_vector_path_delete(path); lv_draw_vector_dsc_delete(d);
		}

		void clear(State &state)
		{
			if(state.child){lv_obj_delete(state.child); state.child = nullptr;}

			if(state.buffer){lv_draw_buf_destroy(state.buffer); state.buffer = nullptr;}
		}

		void center(lv_event_t *event)
		{
			auto &state = *static_cast<State *>(lv_event_get_user_data(event));
			if(state.child) lv_obj_center(state.child);
		}

		bool install(lv_obj_t *obj, State &state, unsigned mode)
		{
			clear(state); state.mode = mode;
			if(mode == 5)
			{
				state.child = lv_gif_create(obj);
				if(!state.child) return false;

				lv_gif_set_src(state.child, &gif);
				if(!lv_gif_is_loaded(state.child)) return false;

				lv_obj_center(state.child);
			}

			if(mode == 3 || mode == 4)
			{
				state.buffer = lv_draw_buf_create(width, height, LV_COLOR_FORMAT_ARGB8888, LV_STRIDE_AUTO);
				if(!state.buffer) return false;

				state.child = lv_canvas_create(obj);
				if(!state.child) return false;

				lv_canvas_set_draw_buf(state.child, state.buffer);
				lv_canvas_fill_bg(state.child, lv_color_black(), LV_OPA_TRANSP);
				lv_layer_t layer; lv_canvas_init_layer(state.child, &layer);
				if(mode == 4)
				{
					lv_draw_rect_dsc_t rect; lv_draw_rect_dsc_init(&rect);
					rect.radius = 14; rect.bg_color = lv_color_hex(0x268abc); rect.bg_opa = 190;
					lv_area_t area{6, 8, 100, 64}; lv_draw_rect(&layer, &rect, &area);
					rect.radius = LV_RADIUS_CIRCLE; rect.bg_color = lv_color_hex(0xd89928); rect.bg_opa = 210;
					area = {65, 12, 145, 72}; lv_draw_rect(&layer, &rect, &area);
				}

				curve(&layer, 0, 0, false, lv_obj_get_style_line_color(obj, LV_PART_INDICATOR));
				lv_canvas_finish_layer(state.child, &layer); lv_obj_center(state.child);
			}

			lv_obj_invalidate(obj); return true;
		}

		void draw(lv_event_t *event)
		{
			auto *obj = lv_event_get_target_obj(event);
			auto &state = *static_cast<State *>(lv_event_get_user_data(event));
			const auto code = lv_event_get_code(event);
			if(code == LV_EVENT_DELETE){clear(state); delete &state; return;}

			lv_area_t area; lv_obj_get_content_coords(obj, &area);
			const int x = area.x1 + (lv_area_get_width(&area) - width) / 2,
			    y = area.y1 + (lv_area_get_height(&area) - height) / 2;
			auto *layer = lv_event_get_layer(event);
			const auto tint = lv_obj_get_style_line_color(obj, LV_PART_INDICATOR);
			if(code == LV_EVENT_DRAW_MAIN)
			{
				if(state.mode == 0 || state.mode == 1) curve(layer, x, y, state.mode == 0, tint);

				if(state.mode == 2)
				{
					lv_draw_line_dsc_t d; lv_draw_line_dsc_init(&d); d.color = tint; d.width = 3;
					auto previous = cubic(0);
					for(unsigned i = 1; i <= 40; ++i)
					{
						const auto point = cubic(float(i) / 40);
						d.p1 = {lv_value_precise_t(x + previous.x), lv_value_precise_t(y + previous.y)};
						d.p2 = {lv_value_precise_t(x + point.x), lv_value_precise_t(y + point.y)};
						lv_draw_line(layer, &d); previous = point;
					}
				}
			}

			if(code == LV_EVENT_DRAW_POST && state.mode < 4)
			{
				const float t = float(state.progress / 240), a = 1 - t;
				const auto point = state.mode == 0 ? lv_fpoint_t{8 * a * a + 2 * 50 * a * t + 152 * t * t,
					                                             64 * a * a + 16 * t * t} : cubic(t);
				lv_draw_rect_dsc_t marker; lv_draw_rect_dsc_init(&marker);
				marker.radius = LV_RADIUS_CIRCLE; marker.bg_color = lv_obj_get_style_text_color(obj, LV_PART_MAIN);
				marker.bg_opa = LV_OPA_COVER;
				lv_area_t dot{x + int(point.x) - 3, y + int(point.y) - 3, x + int(point.x) + 3, y + int(point.y) + 3};
				lv_draw_rect(layer, &marker, &dot);
			}
		}

		void style_changed(lv_event_t *event)
		{
			auto &state = *static_cast<State *>(lv_event_get_user_data(event));
			if((state.mode == 3 || state.mode == 4) && state.buffer)
				(void)install(lv_event_get_target_obj(event), state, state.mode);
		}

		lv_obj_t *create(lv_obj_t *parent)
		{
			auto *obj = lv_obj_create(parent); auto *state = new(std::nothrow) State;
			if(!state){lv_obj_delete(obj); return nullptr;}

			lv_obj_set_user_data(obj, state); lv_obj_remove_style_all(obj);
			lv_obj_set_scrollable(obj, false); lv_obj_set_clickable(obj, false);
			lv_obj_add_event_cb(obj, draw, LV_EVENT_DRAW_MAIN, state);
			lv_obj_add_event_cb(obj, draw, LV_EVENT_DRAW_POST, state);
			lv_obj_add_event_cb(obj, draw, LV_EVENT_DELETE, state);
			lv_obj_add_event_cb(obj, center, LV_EVENT_SIZE_CHANGED, state);
			lv_obj_add_event_cb(obj, style_changed, LV_EVENT_STYLE_CHANGED, state);
			return obj;
		}

		bool execute(lv_obj_t *obj, uint16_t method, CborValue &cursor, lvgl_cbor::WidgetContext &context)
		{
			auto &state = *static_cast<State *>(lv_obj_get_user_data(obj));
			if(method == 256)
			{
				unsigned mode;
				if(!lvgl_cbor::execution::read(cursor, mode,
				    context) || mode > 5 || cbor_value_advance(&cursor) != CborNoError) return false;

				return install(obj, state, mode);
			}

			if(method == 257)
			{
				double progress;
				if(!lvgl_cbor::execution::read(cursor, progress,
				    context) || progress < 0 || progress > 240 || cbor_value_advance(&cursor) != CborNoError)
					return false;

				state.progress = progress; lv_obj_invalidate(obj); return true;
			}

			return false;
		}

	}
	bool register_widget(lvgl_cbor::WidgetRegistry &registry)
	{
		return registry.add({513, "demo:graphics_sample", "gallery-1", create, execute,
		                     gallery_assets::catalog});
	}

	void append_resources(std::vector<lvgl_cbor::Resource> &resources)
	{
		lv_fs_make_path_from_buffer(&bmp_path, 'M', gallery_assets::bmp, sizeof(gallery_assets::bmp), "bmp");
		lv_fs_make_path_from_buffer(&bin_path, 'M', gallery_assets::bin, sizeof(gallery_assets::bin), "bin");
		const lvgl_cbor::Resource entries[]{
			{"gallery.rgb565", "const void *", &rgb565}, {"gallery.rgb888", "const void *", &rgb888},
			{"gallery.xrgb8888", "const void *", &xrgb}, {"gallery.argb8888", "const void *", &argb},
			{"gallery.a8", "const void *", &alpha}, {"gallery.i4", "const void *", &indexed},
			{"gallery.png", "const void *", &png}, {"gallery.jpeg", "const void *", &jpeg},
			{"gallery.bin", "const void *", &bin_path}, {"gallery.bmp", "const void *", &bmp_path},
			{"gallery.tabler_heart", "const void *", &heart},
			{"gallery.tabler_cloud", "const void *", &cloud},
			{"gallery.checker", "const void *", &checker},
			{"gallery.landscape_svg", "const void *", &landscape}};
		for(const auto &entry:entries)
		{
			lv_image_header_t header{};
			if(lv_image_decoder_get_info(entry.value, &header) != LV_RESULT_OK)
				throw std::runtime_error(std::string("Gallery decoder unavailable: ") + entry.name);

			resources.push_back(entry);
		}
	}

}
