// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include <NaWServer/mcp.h>
#include "lvgl_cbor/data_registry.hpp"
#include <functional>
#include <memory>
namespace lvgl_cbor
{
	bool native_json_value(std::string_view, DataValue &, std::string &);
// Native tools compose application-owned services. No process or HTTP forwarding.
	class NativeMcp final : public NaWServer::HandlerBase
	{
	public:
		using Execute = std::function<DataValue (const std::string &, const DataValue &)>;
		explicit NativeMcp(Execute, NaWServer::mcp::OriginPolicy = nullptr, void *origin_context = nullptr);
		~NativeMcp();
		NaWServer::RouteDescriptors routes() const override;
		void handleRequest(NaWServer::Request *, NaWServer::Response &) override;
	private:
		struct Impl; std::unique_ptr<Impl> impl_;
	};
}
