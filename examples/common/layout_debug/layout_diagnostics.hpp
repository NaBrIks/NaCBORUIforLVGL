// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/project_service.hpp"
#include "lvgl_cbor/data_registry.hpp"
#include <functional>
#include <optional>
namespace example_ui
{
// Only application registration/state. Drawing remains in ProjectService/ScreenRuntime.
	class LayoutDiagnostics
	{
		lvgl_cbor::DataRegistry &data_;
		std::function<lvgl_cbor::ProjectService *()> project_;
		bool enabled_ = false;
		uint64_t generation_{};
		lvgl_cbor::LayoutDebugOptions options_;
		std::optional<lvgl_cbor::DataValue> published_;
		void apply_current();
	public:
		LayoutDiagnostics(lvgl_cbor::DataRegistry &, std::function<lvgl_cbor::ProjectService *()>);
		uint64_t generation() const {return generation_;}
		bool install(std::string &);
		bool publish(std::string &);
		void apply(lvgl_cbor::ProjectService &) const;
	};
}
