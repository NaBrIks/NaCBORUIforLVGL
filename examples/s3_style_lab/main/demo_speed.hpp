// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include <cstddef>
#include <cstdint>
#include <string>

namespace lvgl_cbor { class DataRegistry; }
namespace lab_demo_speed
{
// Application-owned service. Register before loading bound pages; begin starts
// an independent 25 Hz producer. The source remains active without any viewers.
	bool register_data(lvgl_cbor::DataRegistry &, std::string &error);
	bool begin(std::string &error);
// Call only from the serialized UI loop, before DataRegistry::flush().
	void process();
	uint32_t dropped_events();
} // namespace lab_demo_speed
