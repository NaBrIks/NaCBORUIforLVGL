// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "esp_err.h"
#include <cstdint>
#include <cstddef>
#include <array>
esp_err_t initialize_display();
// Read only from the same LVGL task, after synchronous refresh.
uint32_t display_frame_count();
uint16_t display_pixel(int32_t x, int32_t y);
bool display_touch_available();
uint32_t display_touch_errors();

bool display_copy_frame(uint8_t *, size_t stride, uint32_t width, uint32_t height);

struct DisplayRegion { uint32_t x{}, y{}, width{}, height{}, revision{}; };
struct DisplayRegions
{
	std::array<DisplayRegion, 12> items{};
	size_t count{};
	uint32_t revision{};
};
struct DisplayConfig
{
	bool direct{true};
	uint8_t buffers{2};
	bool cyclic{};
	bool rle{};
	bool rle_buffer{true};
};
bool display_transfer_available(bool cyclic);
DisplayConfig display_config();
DisplayConfig display_config_saved();
esp_err_t display_config_save(DisplayConfig config);
bool display_frame_snapshot(uint32_t since, DisplayRegion &region);
bool display_frame_regions(uint32_t since, DisplayRegions &regions);
bool display_with_region(const DisplayRegion &, void *, void (*)(void *, const uint16_t *, size_t));
bool display_copy_region(const DisplayRegion &, size_t offset, uint8_t *out, size_t count);
