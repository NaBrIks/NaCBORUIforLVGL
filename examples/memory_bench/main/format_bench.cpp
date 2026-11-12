// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "number_format.hpp"
#include "lvgl_cbor/data_registry.hpp"
#include "esp_heap_caps.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <cinttypes>
#include <cstdio>
#include <cstring>
#include <limits>
#if BENCH_APP_STREAMS
#include <iomanip>
#include <locale>
#include <sstream>
#endif

namespace
{
	constexpr unsigned samples = 2048;
	constexpr unsigned rounds = 5;
	constexpr uint32_t internal = MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT;
	constexpr uint32_t external = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT;
	constexpr double cases[] = {
		0, -0.0, 0.5, -0.5, 1.005, -1.005, 1.125, -1.125, 2.675, -2.675,
		0.0001, 0.0000999999999999999, -0.000000001, 1e15, 1e21, -1e21,
		999999999999999.5, 999999999999999868928.0, 9007199254740991.0,
		std::numeric_limits<double>::max(), std::numeric_limits<double>::lowest(),
		std::numeric_limits<double>::min(), std::numeric_limits<double>::denorm_min(),
		std::numeric_limits<double>::infinity(), -std::numeric_limits<double>::infinity(),
		std::numeric_limits<double>::quiet_NaN(),
	};

	enum class Workload { Binding, Fixed, Json };
	struct Sample {
		uint32_t hash = 2166136261u;
		int64_t time{};
		size_t before_internal{}, after_internal{}, min_internal{};
		size_t before_external{}, after_external{}, min_external{};
		size_t stack{};
	};

	uint32_t hash_text(uint32_t hash, const std::string &text)
	{
		for(unsigned char c : text) hash = (hash ^ c) * 16777619u;
		return (hash ^ 255u) * 16777619u;
	}

	double number(unsigned index, uint64_t &state, Workload kind)
	{
		if(index < sizeof(cases) / sizeof(cases[0]))
		{
			const double value = cases[index];
			return kind != Workload::Json && !std::isfinite(value) ? 0.0 : value;
		}

		state ^= state << 13;
		state ^= state >> 7;
		state ^= state << 17;
		if(kind == Workload::Fixed || index % 3 == 0)
			return (int64_t(state % 20000000001ull) - 10000000000ll) / 1000000.0;

		uint64_t bits = state;
		if((bits & 0x7ff0000000000000ull) == 0x7ff0000000000000ull)
			bits ^= 0x0010000000000000ull;

		double value;
		std::memcpy(&value, &bits, sizeof(value));
		return value;
	}

	Sample measure(Workload kind)
	{
		Sample result;
		uint64_t state = 0xd1342543de82ef95ull;
		result.before_internal = heap_caps_get_free_size(internal);
		result.before_external = heap_caps_get_free_size(external);
		heap_caps_monitor_local_minimum_free_size_start();
		constexpr unsigned batch = 64;
		for(unsigned first = 0; first < samples; first += batch)
		{
			const auto start = esp_timer_get_time();
			for(unsigned i = first; i < first + batch; ++i)
			{
				const auto value = number(i, state, kind);
				const auto text = kind == Workload::Json ? lvgl_cbor::data_value_json(value) :
				    lvgl_cbor::detail::format_binding_number(value, kind == Workload::Fixed ? int(i % 7) : -1);
				result.hash = hash_text(result.hash, text);
			}
			result.time += esp_timer_get_time() - start;
			vTaskDelay(1);
		}
		result.min_internal = heap_caps_get_minimum_free_size(internal);
		result.min_external = heap_caps_get_minimum_free_size(external);
		heap_caps_monitor_local_minimum_free_size_stop();
		result.after_internal = heap_caps_get_free_size(internal);
		result.after_external = heap_caps_get_free_size(external);
		result.stack = uxTaskGetStackHighWaterMark(nullptr);
		return result;
	}

#if BENCH_APP_STREAMS
	uint32_t app_log_signature(int64_t elapsed)
	{
		std::ostringstream log;
		log.imbue(std::locale::classic());
		log << "Application sensor " << std::fixed << std::setprecision(3) << double(elapsed) / 1000;
		return hash_text(0, log.str());
	}
#endif
}

extern "C" void app_main()
{
	uint32_t app_signature{};
#if BENCH_APP_STREAMS
	app_signature = app_log_signature(esp_timer_get_time());
#endif
	Sample results[rounds][3];
	for(auto &round : results)
	{
		round[0] = measure(Workload::Binding);
		round[1] = measure(Workload::Fixed);
		round[2] = measure(Workload::Json);
		vTaskDelay(pdMS_TO_TICKS(15));
	}

	while(true)
	{
		std::printf("FORMAT_BENCH backend=%d app_streams=%d samples=%u app_signature=%" PRIu32 "\n",
		    LVGL_CBOR_NUMBER_FORMAT, BENCH_APP_STREAMS, samples, app_signature);
		constexpr const char *names[]{"binding", "fixed", "json"};
		for(unsigned round = 0; round < rounds; ++round)
		{
			for(unsigned workload = 0; workload < 3; ++workload)
			{
				const auto &r = results[round][workload];
				std::printf("FORMAT_SAMPLE workload=%s round=%u us=%" PRId64 " hash=%" PRIu32
				    " ram_before=%u ram_after=%u ram_min=%u psram_before=%u psram_after=%u psram_min=%u stack=%u\n",
				    names[workload], round, r.time, r.hash, unsigned(r.before_internal), unsigned(r.after_internal),
				    unsigned(r.min_internal), unsigned(r.before_external), unsigned(r.after_external),
				    unsigned(r.min_external), unsigned(r.stack));
			}
		}
		std::puts("FORMAT_DONE");
		vTaskDelay(pdMS_TO_TICKS(2000));
	}
}
