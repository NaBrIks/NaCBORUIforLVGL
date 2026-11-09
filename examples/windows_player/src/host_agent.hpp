// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/data_registry.hpp"
#include <deque>
#include <map>
#include <chrono>
#include <set>
class HostAgent
{
	lvgl_cbor::DataRegistry &registry_;
	std::deque<lvgl_cbor::DataValue> requests_;
	std::map<int64_t, std::chrono::steady_clock::time_point> pending_;
	struct ImageUpload {
		std::string id, name, mime, data;
		size_t expected{};
		bool ready{};
	};
	std::vector<ImageUpload> images_;
	std::set<int64_t> pending_prompts_;
	bool image_action(const std::string &, const lvgl_cbor::DataValue &, std::string &);
	int64_t next_{}, completed_{};
	std::function<std::string()> key_input_;
	std::vector<std::string> models_;
	bool submit(const std::string &, lvgl_cbor::DataValue, std::string &);
	void publish(const char *, lvgl_cbor::DataValue);
public:
	explicit HostAgent(lvgl_cbor::DataRegistry &, std::function<std::string()> key_input = {});
	bool take(lvgl_cbor::DataValue &);
	void reply(const lvgl_cbor::DataValue &);
	void tick();
};
