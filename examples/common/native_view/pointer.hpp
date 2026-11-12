// SPDX-License-Identifier: MIT
#pragma once
#include "lvgl.h"
#include <cstdint>
namespace native_view
{
	class Pointer
	{
	public:
		explicit Pointer(lv_display_t *display);
		~Pointer();
		Pointer(const Pointer &) = delete;
		Pointer &operator=(const Pointer &) = delete;
		bool input(int32_t x, int32_t y, bool pressed);
		void tick();
		bool ready() const { return device_ != nullptr; }
	private:
		lv_display_t *display_{};
		lv_indev_t *device_{};
		int32_t x_{}, y_{};
		bool pressed_{};
		uint32_t last_input_{};
		static void read(lv_indev_t *, lv_indev_data_t *);
	};
}
