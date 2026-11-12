// SPDX-License-Identifier: MIT
#include "pointer.hpp"
#include <algorithm>
namespace native_view
{
	Pointer::Pointer(lv_display_t *display)
	  : display_(display)
	{
		if(!display_) return;

		device_ = lv_indev_create();
		if(!device_) return;

		lv_indev_set_type(device_, LV_INDEV_TYPE_POINTER);
		lv_indev_set_display(device_, display_);
		lv_indev_set_user_data(device_, this);
		lv_indev_set_read_cb(device_, &Pointer::read);
		lv_indev_set_mode(device_, LV_INDEV_MODE_EVENT);
	}

	Pointer::~Pointer()
	{
		if(device_) lv_indev_delete(device_);
	}

	void Pointer::read(lv_indev_t *device, lv_indev_data_t *data)
	{
		const auto &pointer = *static_cast<Pointer *>(lv_indev_get_user_data(device));
		data->point = {pointer.x_, pointer.y_};
		data->state = pointer.pressed_ ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
		data->continue_reading = false;
	}

	bool Pointer::input(int32_t x, int32_t y, bool pressed)
	{
		if(!device_) return false;
		const auto width = lv_display_get_horizontal_resolution(display_);
		const auto height = lv_display_get_vertical_resolution(display_);
		if(x < 0 || y < 0 || x >= width || y >= height)
			return false;

		x_ = x; y_ = y; pressed_ = pressed; last_input_ = lv_tick_get();
		lv_indev_read(device_);
		return true;
	}

	void Pointer::tick()
	{
		if(!pressed_) return;

		const auto width = lv_display_get_horizontal_resolution(display_);
		const auto height = lv_display_get_vertical_resolution(display_);
		if(width <= 0 || height <= 0) pressed_ = false;
		else {x_ = std::clamp(x_, int32_t(0), width - 1); y_ = std::clamp(y_, int32_t(0), height - 1);}

		if(lv_tick_elaps(last_input_) >= 500) pressed_ = false;

		lv_indev_read(device_);
	}

}
