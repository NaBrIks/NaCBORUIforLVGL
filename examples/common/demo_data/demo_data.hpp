// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/data_registry.hpp"
#include "lvgl_cbor/data_history.hpp"
#include <chrono>

// Application-owned example capabilities. The UI engine remains in ../../.. /src.
class DemoData
{
public:
	lvgl_cbor::DataRegistry registry;
#if LVGL_CBOR_HAS_HISTORY
	lvgl_cbor::DataHistory history;
#endif
	DemoData();
	bool begin(std::string &error);
	bool tick(std::string &error);
private:
	std::chrono::steady_clock::time_point start_ = std::chrono::steady_clock::now(), next_{};
	bool running_ = true;
	int64_t clicks_{}, sequence_{};
	double speed_{};
	std::string clock_;
#if LVGL_CBOR_HAS_HISTORY
	bool history_plot_known_ = false;
	uint64_t history_plot_time_{};
	bool publish_history_plot(std::string &error);
#endif
};
