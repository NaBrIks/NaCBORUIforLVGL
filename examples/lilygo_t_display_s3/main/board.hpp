// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl.h"
#include <cstdint>

lv_display_t *initialize_display();
uint32_t display_flush_count();
uint32_t display_scene_id(uint32_t generation);
void display_update_scene(uint32_t generation);

inline constexpr unsigned display_width = 320, display_height = 170, display_band_rows = 6;
struct DisplayBands
{
	uint32_t scene{}, revision{}, mask{};
	bool full{};
};
DisplayBands display_bands_since(uint32_t revision);
unsigned display_rows_in_band(unsigned band);
size_t display_band_bytes(uint32_t mask);

// Observe real PARTIAL flushes, then optionally request missing data during idle.
bool display_capture_begin(uint16_t y,uint16_t rows,bool passive,uint32_t scene);
bool display_capture_poll(uint8_t *&bytes,size_t &size,uint32_t scene);
void display_capture_release();
