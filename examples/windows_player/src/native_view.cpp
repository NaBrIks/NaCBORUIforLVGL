// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "native_view.hpp"
#include <algorithm>
#include <cstring>
#include <memory>
#include <stdexcept>

namespace native_view
{
	std::vector<uint8_t> frame(lv_obj_t *root)
	{
		if(!root) throw std::runtime_error("view_project_not_ready");

		lv_obj_update_layout(root);
		const auto width = lv_obj_get_width(root), height = lv_obj_get_height(root);
		constexpr uint64_t max_pixels = 2 * 1024 * 1024, max_bytes = max_pixels * 4;
		if(width <= 0 || height <= 0 || uint64_t(width) * uint64_t(height) > max_pixels)
			throw std::runtime_error("view_frame_pixel_limit");

		const auto stride = lv_draw_buf_width_to_stride(uint32_t(width), LV_COLOR_FORMAT_XRGB8888);
		if(stride < uint64_t(width) * 4 || uint64_t(stride) * uint64_t(height) > max_bytes)
			throw std::runtime_error("view_frame_byte_limit");

		// Allocate only the bounded viewport. Public snapshot APIs reshape this
		// buffer or reject; they cannot allocate an unbounded root-shadow extent.
		std::unique_ptr<lv_draw_buf_t, decltype(&lv_draw_buf_destroy)> image(
			lv_draw_buf_create(uint32_t(width), uint32_t(height), LV_COLOR_FORMAT_XRGB8888, stride),
			&lv_draw_buf_destroy);
		if(!image || lv_snapshot_take_to_draw_buf(root, LV_COLOR_FORMAT_XRGB8888, image.get()) != LV_RESULT_OK)
			throw std::runtime_error("view_snapshot_failed");

		if(image->header.w != uint32_t(width) || image->header.h != uint32_t(height))
			throw std::runtime_error("view_snapshot_extent");

		const auto row_bytes = size_t(width) * 4;
		std::vector<uint8_t> bytes(54 + row_bytes * size_t(height), 0);
		const auto put = [&](size_t at, uint32_t value) {
				for(unsigned i = 0; i < 4; ++i)
					bytes[at + i] = uint8_t(value >> (8 * i));
			};
		bytes[0] = 'B'; bytes[1] = 'M'; put(2, uint32_t(bytes.size())); put(10, 54); put(14, 40);
		put(18, uint32_t(width)); put(22, uint32_t(-int32_t(height))); bytes[26] = 1; bytes[28] = 32;
		for(int32_t y = 0; y < height; ++y)
			std::memcpy(bytes.data() + 54 + size_t(y) * row_bytes,
			    image->data + size_t(y) * image->header.stride, row_bytes);
		return bytes;
	}

}
