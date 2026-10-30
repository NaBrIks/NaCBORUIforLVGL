// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/data_registry.hpp"
#include <memory>

// Windows sampling owns its thread and latest bounded mailbox. Only drain() touches
// the registry, in the application's serialized UI context.
class SystemMetrics
{
public:
	explicit SystemMetrics(lvgl_cbor::DataRegistry &);
	~SystemMetrics();
	void start();
	void drain();
	SystemMetrics(const SystemMetrics &) = delete;
	SystemMetrics &operator=(const SystemMetrics &) = delete;
private:
	struct Impl;
	std::unique_ptr<Impl> impl_;
};
