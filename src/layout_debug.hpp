// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl.h"
#include <array>
#include <algorithm>
#include "lvgl_cbor/screen_runtime.hpp"

namespace lvgl_cbor::detail
{
	// Own 5x6 glyphs enlarged 2x into transparent 16x16 A1 tiles; 32 bytes each.
	inline constexpr uint8_t debug_glyphs[12][6] = {
		{14, 17, 21, 17, 17, 14}, {4, 12, 4, 4, 4, 14},
		{14, 17, 2, 4, 8, 31}, {30, 1, 6, 1, 17, 14},
		{2, 6, 10, 18, 31, 2}, {31, 16, 30, 1, 17, 14},
		{14, 16, 30, 17, 17, 14}, {31, 1, 2, 4, 8, 8},
		{14, 17, 14, 17, 17, 14}, {14, 17, 17, 15, 1, 14},
		{14, 17, 16, 23, 17, 14}, {31, 16, 30, 16, 16, 16} // G, F
	};

	constexpr auto debug_tiles()
	{
		std::array<std::array<uint8_t, 32>, 12> tiles{};
		for(size_t digit = 0; digit < 12; ++digit)
			for(size_t y = 0; y < 12; ++y)
				for(size_t x = 0; x < 10; ++x)
					if(debug_glyphs[digit][y / 2] & (16 >> (x / 2)))
					{
						const size_t px = x + 3, py = y + 2;
						tiles[digit][py * 2 + px / 8] |= uint8_t(0x80 >> (px % 8));
					}

		return tiles;
	}

	inline constexpr auto layout_debug_tiles = debug_tiles();
	static_assert(sizeof(layout_debug_tiles) == 384, "Ten digits and G/F: twelve 16x16 A1 masks");

	constexpr auto debug_images()
	{
		std::array<lv_image_dsc_t, 12> images{};
		for(size_t i = 0; i < images.size(); ++i)
		{
			auto &image = images[i];
			image.header.magic = LV_IMAGE_HEADER_MAGIC;
			image.header.cf = LV_COLOR_FORMAT_A1;
			image.header.w = image.header.h = 16;
			image.header.stride = 2;
			image.data_size = 32;
			image.data = layout_debug_tiles[i].data();
		}
		return images;
	}

	inline constexpr auto layout_debug_images = debug_images();

	inline size_t layout_depth(lv_obj_t *object)
	{
		size_t depth = 0;
		for(auto *parent = lv_obj_get_parent(object); parent; parent = lv_obj_get_parent(parent))
			++depth;
		return depth;
	}

	inline size_t maximum_layout_depth(lv_obj_t *object, size_t depth = 0)
	{
		if(!object) return 0;

		size_t maximum = depth;
		for(uint32_t i = 0; i < lv_obj_get_child_count(object); ++i)
			maximum = std::max(maximum, maximum_layout_depth(lv_obj_get_child(object, int32_t(i)), depth + 1));
		return maximum;
	}

	struct LayoutDebugStyles {
		struct Entry {
			lv_style_t style{};
			explicit Entry(const LayoutDebugLevel &level, size_t glyph, const LayoutDebugOptions &options)
			{
				lv_style_init(&style);
				if(level.outline)
				{
					lv_style_set_outline_width(&style, options.outline_width);
					lv_style_set_outline_pad(&style, -int32_t(options.outline_width));
					lv_style_set_outline_opa(&style, LV_OPA_COVER);
					lv_style_set_outline_color(&style, lv_color_hex(level.outline_color));
				}

				if(level.digit && options.opacity && glyph < layout_debug_images.size())
				{
					lv_style_set_bg_image_src(&style, &layout_debug_images[glyph]);
					lv_style_set_bg_image_tiled(&style, true);
					lv_style_set_bg_image_opa(&style, options.opacity);
					lv_style_set_bg_image_recolor(&style, lv_color_hex(level.digit_color));
					lv_style_set_bg_image_recolor_opa(&style, LV_OPA_COVER);
				}
			}

			~Entry()
			{
				lv_style_reset(&style);
			}

		};
		using Variants = std::array<std::unique_ptr<Entry>, 3>; // No layout, Grid, Flex.
		std::vector<Variants> styles;
		bool enabled = false;
		LayoutDebugOptions options;

		void configure(const LayoutDebugOptions &value)
		{
			// The runtime detaches these styles before replacing them.
			styles.clear(); options = value;
		}

		void apply(lv_obj_t *root)
		{
			if(root) apply_tree(root, layout_depth(root));
		}

	private:
		void apply_tree(lv_obj_t *object, size_t depth)
		{
			for(auto &variants : styles)
				for(auto &entry : variants)
					if(entry) lv_obj_remove_style(object, &entry->style, LV_PART_MAIN);

			if(enabled)
			{
				LayoutDebugLevel level(depth);
				if(depth < options.levels.size()) level = options.levels[depth];
				else if(options.levels.empty()) level.outline = true;

				// Inspect the effective LVGL layout, including shared/local/state styles.
				size_t variant = 0;
				if(options.layout_type && level.digit && options.opacity)
				{
					const auto layout = lv_obj_get_style_layout(object, LV_PART_MAIN);
#if LV_USE_GRID
					if(layout == LV_LAYOUT_GRID) variant = 1;

#endif
#if LV_USE_FLEX
					if(layout == LV_LAYOUT_FLEX) variant = 2;

#endif
				}

				const size_t glyph = options.layout_type ? (variant ? 9 + variant : 12) : depth % 10;
				if(level.outline || (level.digit && options.opacity && glyph < 12))
				{
					if(styles.size() <= depth) styles.resize(depth + 1);

					auto &entry = styles[depth][variant];
					if(!entry) entry = std::make_unique<Entry>(level, glyph, options);

					lv_obj_add_style(object, &entry->style, LV_PART_MAIN);
				}
			}

			for(uint32_t i = 0; i < lv_obj_get_child_count(object); ++i)
				apply_tree(lv_obj_get_child(object, int32_t(i)), depth + 1);
		}

	};
}
