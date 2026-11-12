// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include <NaWServer/handler.h>
#include <atomic>
#include <cstdint>
#include <mutex>
#include "board.hpp"
#include "lvgl_cbor/data_registry.hpp"

class DisplayConfigApi final : public NaWServer::HandlerBase
{
	std::atomic<uint32_t> reboot_at_ms_{};
	std::mutex save_mutex_;
	DisplayConfig draft_;
	lvgl_cbor::DataRegistry *registry_{};
	bool publish(std::string &error);
	bool persist_and_restart(DisplayConfig config, std::string &error);
public:
	bool install(lvgl_cbor::DataRegistry &registry, std::string &error);
	NaWServer::RouteDescriptors routes() const override;
	void handleRequest(NaWServer::Request *, NaWServer::Response &) override;
	void process();
};
