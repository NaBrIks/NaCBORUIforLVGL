// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl.h"
#include <cstdint>
#include <vector>

namespace native_view
{
// All calls, including construction/destruction, belong to the application's
// existing LVGL lock. No OS input or background rendering thread is created.
	std::vector<uint8_t> frame(lv_obj_t *root);

	class Pointer
	{
	public:
		explicit Pointer(lv_display_t *display);
		~Pointer();
		Pointer(const Pointer &) = delete;
		Pointer &operator=(const Pointer &) = delete;
		void input(int32_t x, int32_t y, bool pressed);
		void tick();
	private:
		lv_display_t *display_{};
		lv_indev_t *device_{};
		int32_t x_{}, y_{};
		bool pressed_{};
		uint32_t last_input_{};
		static void read(lv_indev_t *, lv_indev_data_t *);
	};
}
