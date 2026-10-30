// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "lvgl_cbor/style_runtime.hpp"
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>
static void require(bool ok, const char *message)
{
	if(!ok)
	{
		std::fprintf(stderr, "FAILED: %s\n", message);
		std::exit(1);
	}
}

int main(int argc, char **argv)
{
	require(argc == 2, "fixture directory argument");
	lv_init();
	auto *display = lv_display_create(800, 480);
	auto *label = lv_label_create(lv_screen_active());
	lv_obj_remove_style_all(label);
	lv_label_set_text(label, "style test");
	const lvgl_cbor::Resource resources[]{
		{"montserrat_28", "const lv_font_t *", &lv_font_montserrat_28}};
	{
		lvgl_cbor::StyleRuntime runtime(label, resources, 1);
		lvgl_cbor::Reply reply;
		auto apply = [&](const char *name, bool expected) {
				std::ifstream file(std::string(argv[1]) + "/" + name + ".cbor", std::ios::binary);
				require(file.good(), name);
				std::vector<uint8_t> bytes{std::istreambuf_iterator<char>(file), {}};
				const bool result = runtime.apply(bytes.data(), bytes.size(), reply);
				if(result != expected)
					std::fprintf(stderr, "%s: %s\n", name, reply.error);

				require(result == expected, name);
				require(reply.ok == expected, "reply status");
				if(!expected)
					require(reply.methods == 0, "failed packet applied count");
			};
		apply("basic", true);
		lv_obj_update_layout(label);
		require(lv_obj_get_style_x(label, LV_PART_MAIN) == 60, "x setter");
		require(lv_obj_get_style_width(label, LV_PART_MAIN) == 420, "size setter");
		require(lv_color_to_u32(lv_obj_get_style_text_color(label, LV_PART_MAIN)) == 0xfff6e9c8u,
		    "RGB setter");
		require(lv_obj_get_style_text_font(label, LV_PART_MAIN) == &lv_font_montserrat_28,
		    "named font");
		for(const auto *name :
		    {"truncated", "signature", "old_abi", "missing_source", "missing_resource"})
		{
			apply(name, false);
			require(lv_obj_get_style_x(label, LV_PART_MAIN) == 60,
			    "atomic rejection preserves attached style");
		}
		apply("global", true);
		apply("merge", true);
		require(lv_color_to_u32(lv_obj_get_style_text_color(label, LV_PART_MAIN)) == 0xffff0000u,
		    "merge overrides copy");
		require(lv_obj_get_style_radius(label, LV_PART_MAIN) == 5, "merge radius");
		apply("replace_global", true);
		require(lv_obj_get_style_radius(label, LV_PART_MAIN) == 5,
		    "copy/merge snapshot has no live inheritance");
		apply("maximum_uint", true);
		require(lv_obj_get_style_anim_duration(label, LV_PART_MAIN) == 4294967295u, "uint32 range");
		apply("new_96", true);
		require(lv_obj_get_style_blur_radius(label, LV_PART_MAIN) == 3,
		    "9.6 appended method index 128");
		require(lv_obj_get_style_drop_shadow_offset_x(label, LV_PART_MAIN) == 7,
		    "9.6 drop shadow setter");
		require(lv_obj_get_style_blur_quality(label, LV_PART_MAIN) == LV_BLUR_QUALITY_SPEED,
		    "9.6 appended signature 26");
		require(lv_obj_get_style_text_leading_trim(label, LV_PART_MAIN) == LV_TEXT_LEADING_TRIM_CAPITAL,
		    "9.6 appended method 137 and signature 27");
		auto *old_target = label;
		label = lv_slider_create(lv_screen_active());
		runtime.set_target(label);
		require(runtime.target() == label && lv_obj_get_style_blur_radius(label, LV_PART_MAIN) == 3,
		    "retarget preserves attached named style");
		lv_obj_delete(old_target);
		apply("empty", true);
		require(lv_obj_get_style_x(label, LV_PART_MAIN) == 0, "replace removes omitted properties");
		lv_obj_delete(label);
		require(runtime.target() == nullptr, "external deletion clears style target");
		apply("basic", true);
		label = lv_label_create(lv_screen_active());
		runtime.set_target(label);
		require(lv_obj_get_style_width(label, LV_PART_MAIN) == 420,
		    "unbound style can be applied to a new target");
	}
	lv_display_delete(display);
	lv_deinit();
	std::puts("Native LVGL/TinyCBOR integration passed: setters, resources, copy/merge, replacement "
	    "and boundary rejection paths.");
}
