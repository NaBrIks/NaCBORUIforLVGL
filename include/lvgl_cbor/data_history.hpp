// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#ifndef LVGL_CBOR_HAS_HISTORY
#define LVGL_CBOR_HAS_HISTORY 0
#endif
#if LVGL_CBOR_HAS_HISTORY
#include "data_registry.hpp"
#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
namespace lvgl_cbor
{
	inline constexpr size_t data_history_max_channels = 8;
	inline constexpr size_t data_history_max_points = 1024;
	inline constexpr size_t data_history_max_capacity = 256;
	struct DataHistoryLimits {
		size_t channels = data_history_max_channels;
		size_t points = data_history_max_points;
	};
	struct DataHistoryConfig {
		std::string source;
		DataPath path;
		std::string output;
		std::string group, title, description, unit;
		uint64_t period_ms = 1000;
		size_t capacity = 60;
	};
// Optional application-owned sampler. All calls use the registry's serialized
// UI context; no threads, observers, timers or LVGL objects are created here.
// The registry must outlive this object. Output descriptors remain registered
// for the registry lifetime. Start explicitly with set_enabled(true).
	class DataHistory
	{
	public:
		explicit DataHistory(DataRegistry &, DataHistoryLimits = {});
		~DataHistory();
		DataHistory(const DataHistory &) = delete;
		DataHistory &operator=(const DataHistory &) = delete;
		// Register a readonly output: {label, history, timeMs, periodMs, count, mean}.
		// History has fixed capacity, chronological order and leading null gaps.
		// Count includes filled gap slots; mean ignores gaps and is null if none are valid.
		bool add(DataHistoryConfig, std::string &error);
		// Disabling releases sample rings and queues unknown output snapshots.
		// The caller's normal registry.flush() releases old committed snapshots.
		// Enabling again starts a fresh timeline on the next tick.
		bool set_enabled(bool, std::string &error);
		// Sample the committed Known finite input at the last due time slot.
		// Missed slots are null, not invented repeated values. Nondecreasing
		// monotonic milliseconds must fit the shared safe integer range.
		// No registry.flush() is performed; callers retain batch ownership.
		bool tick(uint64_t monotonic_ms, std::string &error);
		bool enabled() const;
		size_t channel_count() const;
		size_t allocated_points() const;
	private:
		struct Impl;
		std::unique_ptr<Impl> impl_;
	};
} // namespace lvgl_cbor
#endif
