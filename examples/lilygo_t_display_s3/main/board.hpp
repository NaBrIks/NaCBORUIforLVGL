// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl.h"
#include <cstdint>

lv_display_t *initialize_display();
uint32_t display_flush_count();
