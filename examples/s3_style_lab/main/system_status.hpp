// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include <cstdint>
#include <string>
namespace lvgl_cbor { class DataRegistry; }
namespace lab_system
{
// Registry/LVGL-facing methods are called only by the application UI task.
	bool register_data(lvgl_cbor::DataRegistry &, std::string &error);
// Follows esp_netif_init; starts asynchronously after an acquired IPv4 address.
	bool begin_time();
	void process();
// Event-task callback: copies only POD into a fixed mailbox, never the registry.
	void network_changed(bool connected, uint32_t ipv4 = 0);
} // namespace lab_system
