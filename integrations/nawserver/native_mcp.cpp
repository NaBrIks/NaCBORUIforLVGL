// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "native_mcp.hpp"
#include <array>
#include <stdexcept>
#include <utility>
namespace lvgl_cbor
{
	namespace
	{
		using namespace NaWServer;
		std::string decoded(const json::Document &document, json::Value value)
		{
			std::array<char, 1024> small{}; size_t size = 0;
			if(document.decode(value, small.data(), small.size(), size)) return {small.data(), size};

			std::vector<char> text(NAWSERVER_JSON_STRING_BYTES);
			if(!document.decode(value, text.data(), text.size(), size)) throw std::runtime_error("mcp_string_limit");

			return {text.data(), size};
		}

		DataValue value(const json::Document &d, json::Value v, unsigned depth = 0)
		{
			if(!v) return DataValue::Object{};

			if(depth > 32) throw std::runtime_error("mcp_depth_limit");

			switch(v.type())
			{
			case json::Type::Object: {DataValue::Object out; for(size_t i = 0; i < d.size(v); ++i)
									  {
										  auto m = d.memberAt(v, i);
										  out.emplace(decoded(d, m.key), value(d, m.value, depth + 1));
									  }
				                      return out;}
			case json::Type::Array: {DataValue::Array out; for(size_t i = 0; i < d.size(v); ++i)
										 out.push_back(value(d, d.element(v, i), depth + 1));
				                     return out;}
			case json::Type::String: return decoded(d, v);
			case json::Type::Boolean: {bool out = false; if(!d.boolean(v, out))
										   throw std::runtime_error("mcp_boolean");

				                       return out;}
			case json::Type::Signed: case json::Type::Unsigned: {int64_t out = 0; if(!d.signedInteger(v, out))
																	 throw std::runtime_error("mcp_integer");

				                                                 return out;}
			case json::Type::Real: {double out = 0; if(!d.real(v, out))
										throw std::runtime_error("mcp_real");

				                    return out;}
			default: return nullptr;
			}
		}

		struct Definition {const char *name, *description, *schema; bool readonly; const char *mime = nullptr;};
		const Definition definitions[]{
			{"get_device", "Real device metadata and display; the application owns capabilities.",
			 R"({"type":"object","properties":{"section":{"type":"string"},"name":{"type":"string"},"offset":{"type":"integer"},"limit":{"type":"integer"}}})",
			 true},
			{"get_ui_reference",
			 "LVGL JSON authoring reference; request kind screen/style and topic index/layout/styles/bindings/events.",
			 R"({"type":"object","properties":{"kind":{"type":"string"},"topic":{"type":"string"}}})", true},
			{"get_project_status", "Stored project, named screens/styles, current display and child instances.",
			 R"({"type":"object","properties":{},"additionalProperties":false})", true},
			{"get_data_catalog",
			 "Discover the real available data groups, sources, actions and fields, with bounded selective queries.",
			 R"({"type":"object","properties":{"kind":{"type":"string"},"name":{"type":"string"},"group":{"type":"string"},"prefix":{"type":"string"},"detail":{"type":"boolean"},"offset":{"type":"integer"},"limit":{"type":"integer"},"maxBytes":{"type":"integer"}}})",
			 true},
			{"get_data", "Read actual current data values; select name/group/path or bounded snapshot.",
			 R"({"type":"object","properties":{"name":{"type":"string"},"path":{"type":"string"},"group":{"type":"string"},"detail":{"type":"boolean"},"snapshot":{"type":"boolean"},"maxBytes":{"type":"integer"}}})",
			 true},
            {"send_view_input", "Send a pointer press, move or release to the real display. Coordinates use display pixels.",
             R"({"type":"object","properties":{"x":{"type":"integer","minimum":0},"y":{"type":"integer","minimum":0},"pressed":{"type":"boolean"}},"required":["x","y","pressed"],"additionalProperties":false})",false},
			{"get_display_frame",
			 "Actual LVGL-rendered display as a bounded PNG; no project mutation. The image may be reduced to fit the endpoint budget.",
			 R"({"type":"object","properties":{"maxEdge":{"type":"integer","minimum":64,"maximum":1024}}})", true,
			 "image/png"},
			{"show_project_screen", "Explicitly display a saved root screen.",
			 R"({"type":"object","properties":{"screen":{"type":"string"}},"required":["screen"]})", false},
			{"refresh_project_display", "Refresh current saved composition while retaining valid selected child pages.",
			 R"({"type":"object","properties":{}})", false},
			{"invoke_action",
			 "Invoke an application-declared action; arguments are validated by the existing DataRegistry.",
			 R"({"type":"object","properties":{"name":{"type":"string"},"args":{}},"required":["name"]})", false},
			{"write_source", "Write an application-declared writable source using its existing setter.",
			 R"({"type":"object","properties":{"source":{"type":"string"},"path":{"type":"array"},"value":{}},"required":["source","value"]})",
			 false},
			{"send_event",
			 "Send an ordinary LVGL event; use the actual child instance from project status for nested pages.",
			 R"({"type":"object","properties":{"node":{"type":"string"},"event":{"type":"string"},"instance":{"type":"integer"}},"required":["node","event"]})",
			 false}
		};
	}
	bool native_json_value(std::string_view input, DataValue &out, std::string &error)
	{
		try{std::vector<std::max_align_t> storage((NAWSERVER_JSON_WORKSPACE_BYTES + sizeof(std::max_align_t) - 1) /
			    sizeof(std::max_align_t));
			NaWServer::json::Document document(storage.data(), storage.size() * sizeof(std::max_align_t));
			if(document.parse(input) != NaWServer::json::Error::None){error = "native_json_parse_limit"; return false;}

			out = value(document, document.root()); return true;}catch(const std::exception &e){error = e.what();
			                                                                                    return false;}
	}

	struct NativeMcp::Impl {
		Execute execute;
		struct Context {Impl *owner; const Definition *definition;};
		std::array<Context, std::size(definitions)> contexts{};
		std::array<NaWServer::mcp::Tool, std::size(definitions)> tools{};
		alignas(std::max_align_t) std::array<unsigned char, NAWSERVER_JSON_WORKSPACE_BYTES> reader{};
		std::array<char, NAWSERVER_MCP_OUTPUT_BYTES> output{};
		NaWServer::mcp::Workspace workspace{reader.data(), reader.size(), output.data(), output.size()};
		NaWServer::mcp::Endpoint endpoint;
		explicit Impl(Execute fn, NaWServer::mcp::OriginPolicy policy, void *context)
		  : execute(std::move(fn)), endpoint(tools.data(), tools.size(), workspace, "/mcp", policy, context)
		{
			for(size_t i = 0; i < tools.size(); ++i)
			{
				const auto &d = definitions[i]; contexts[i] = {this, &d};
				tools[i] = {d.name, d.description, d.schema, call, &contexts[i], d.readonly, d.mime};
			}
		}

		static NaWServer::mcp::ToolResult call(void *context, const NaWServer::json::Document &document,
		    NaWServer::json::Value args, NaWServer::json::Writer &writer)
		{
			const auto &c = *static_cast<Context *>(context);
			try{auto result = c.owner->execute(c.definition->name, value(document, args));
				const auto text = c.definition->mime ? std::get<std::string>(result.value) : data_value_json(result);
				return writer.string(text) ? NaWServer::mcp::ToolResult::Success : NaWServer::mcp::ToolResult::Failed;
			}catch(const std::exception &){return NaWServer::mcp::ToolResult::Failed;}
		}

	};
	NativeMcp::NativeMcp(Execute fn, NaWServer::mcp::OriginPolicy policy, void *context)
	  : impl_(std::make_unique<Impl>(std::move(fn), policy, context))
	{
	}

	NativeMcp::~NativeMcp() = default;
	NaWServer::RouteDescriptors NativeMcp::routes() const
	{
		return impl_->endpoint.routes();
	}

	void NativeMcp::handleRequest(NaWServer::Request *r, NaWServer::Response &s)
	{
		impl_->endpoint.handleRequest(r, s);
	}

}
