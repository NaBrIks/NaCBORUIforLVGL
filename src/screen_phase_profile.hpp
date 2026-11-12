// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once

#if defined(LVGL_CBOR_BENCH_SCREEN_PHASES)
#include "esp_cpu.h"

extern "C" void nacbor_bench_screen_phase(const char *name, uint32_t cycles);

namespace lvgl_cbor::detail
{
	struct ScreenPhaseTimer {
		const char *name;
		uint32_t start = esp_cpu_get_cycle_count();

		~ScreenPhaseTimer()
		{
			nacbor_bench_screen_phase(name, esp_cpu_get_cycle_count() - start);
		}
	};
}

#define LVGL_CBOR_MEASURE_PHASE(name, operation) ([&]() { \
	lvgl_cbor::detail::ScreenPhaseTimer timer{name}; \
	return (operation); \
}())
#define LVGL_CBOR_PHASE_SCOPE(name) lvgl_cbor::detail::ScreenPhaseTimer phase_timer{name}
#else
#define LVGL_CBOR_PHASE_SCOPE(name)
#define LVGL_CBOR_MEASURE_PHASE(name, operation) (operation)
#endif
