// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "demo_data.hpp"
#include "appearance.hpp"
#include "host_fonts.hpp"
#include "system_metrics.hpp"
#include "host_agent.hpp"
#include "native_view.hpp"
#include "lvgl_cbor/capabilities.hpp"
#include "lvgl_cbor/project_service.hpp"
#include <filesystem>
#include <memory>

class Application
{
	HostFonts fonts_;
public:
	static constexpr size_t project_limit = 2 * 1024 * 1024;
	Appearance appearance;
	DemoData data;
	std::unique_ptr<SystemMetrics> metrics;
	std::unique_ptr<HostAgent> agent;
	void tick();
	explicit Application(bool graphics = false);
	bool graphics() const
	{
		return graphics_;
	}

	void start_metrics();
	void connection(const std::string &);
	bool host_request(lvgl_cbor::DataValue &);
	std::vector<uint8_t> view_frame();
	void view_input(int32_t, int32_t, bool);
	void load_schemes(const std::filesystem::path &, const std::string &);
	std::string capabilities() const;
	void configure_store(const std::filesystem::path &prefix);
	void configure_base_recovery(const std::filesystem::path &path)
	{
		base_recovery_ = path;
	}

	bool load(const std::filesystem::path &, const std::string &entry, std::string &error,
	    const std::filesystem::path *store_override = nullptr);
	lvgl_cbor::DataValue command(const lvgl_cbor::DataValue &);
	lvgl_cbor::ProjectService *project_service() const
	{
		return project_.get();
	}

	uint64_t workspace_epoch() const
	{
		return workspace_epoch_;
	}

private:
	bool graphics_{}, layout_debug_{};
	lvgl_cbor::LayoutDebugOptions layout_options_;
	bool publish_layout_debug(std::string &);
	std::unique_ptr<native_view::Pointer> view_pointer_;
	lvgl_cbor::WidgetRegistry widgets_;
	std::vector<lvgl_cbor::Resource> resources_;
	std::vector<uint8_t> bytes_;
	std::unique_ptr<lvgl_cbor::ConstProjectSource> source_;
	std::unique_ptr<lvgl_cbor::ProjectStore> store_;
	std::filesystem::path store_prefix_, base_recovery_;
	uint64_t workspace_epoch_ = 0;
	std::unique_ptr<lvgl_cbor::ProjectService> project_;
	bool select_scheme(const std::string &, std::string &);
};
