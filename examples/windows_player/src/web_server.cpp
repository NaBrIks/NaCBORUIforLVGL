// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "web_server.hpp"
#include "application.hpp"
#include "project_api.hpp"
#if LVGL_CBOR_NATIVE_MCP
#include "native_mcp.hpp"
extern "C" unsigned lodepng_encode24(unsigned char **, size_t *, const unsigned char *, unsigned, unsigned);
#endif
#include "lvgl_cbor/contract.hpp"
#include <NaWServer/backends/windows_tcp.h>
#include <NaWServer/backends/tcp.h>
#include <NaWServer/http_server.h>
#include <NaWServer/request.h>
#include <NaWServer/websocket.h>
#include "cbor.h"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstring>
#include <deque>
#include <fstream>
#include <iomanip>
#include <random>
#include <sstream>
#include <stdexcept>
using namespace lvgl_cbor;
namespace
{
	using Object = DataValue::Object;
	using namespace NaWServer;
	uint64_t clock_ms()
	{
		return uint64_t(std::chrono::duration_cast<std::chrono::milliseconds>(
					   std::chrono::steady_clock::now().time_since_epoch()).count());
	}

	std::string token()
	{
		std::random_device random; std::ostringstream value; for(int i = 0; i < 4; ++i)
			value << std::hex << std::setw(8) << std::setfill('0') << uint32_t(random());
		return value.str();
	}

	struct UiLock { UiLock()
					{
						lv_lock();
					}

		            ~UiLock()
					{
						lv_unlock();
					}
	};
	struct Failure : std::runtime_error { int status; Failure(int status, const std::string &message)
											: std::runtime_error(message), status(status)
										  {
										  }
	};
	int status_for(const std::string &message)
	{
		if(message.find("revision_conflict") != std::string::npos || message == "data_catalog_revision") return 409;

		if(message.find("read_only") != std::string::npos || message.find("policy") != std::string::npos) return 403;

		if(message.find("not_found") != std::string::npos) return 404;

		if(message.find("limit") != std::string::npos || message.find("size") != std::string::npos) return 413;

		return 400;
	}

	std::string query(Request &request, const char *name)
	{
		const auto value = request.query(name); return value ? std::string(*value) : std::string{};
	}

	const Object &object(const DataValue &value)
	{
		auto p = std::get_if<Object>(&value.value); if(!p)
			throw Failure(400, "request_object");

		return *p;
	}

	std::string text(const Object &value, const char *name, size_t max = 63, bool required = false)
	{
		auto i = value.find(name); if(i == value.end())
		{
			if(required)
				throw Failure(400, std::string("request_") + name);

			return {};
		}

		auto s = std::get_if<std::string>(&i->second.value);
		if(!s || s->size() > max || s->find('\0') != std::string::npos || (required && s->empty()))
			throw Failure(400, std::string("request_") + name);

		return *s;
	}

	void keys(const Object &value, std::initializer_list<const char *> allowed)
	{
		for(const auto &field:value)
		{
			bool found = false; for(auto key:allowed)
				found = found || field.first == key;
			if(!found)
				throw Failure(400, "request_fields");
		}
	}

	DataValue decode(NaWServer::ByteView bytes)
	{
		DataValue value; std::string error; if(!decode_data_value(bytes.data(), bytes.size(), value, error, 4096, 12))
			throw Failure(400, error);

		return value;
	}

	struct HttpReply {
		int status = 200; std::string type = "application/json", text, revision; std::vector<uint8_t> bytes;
	};
	struct Payload { std::string text; std::vector<uint8_t> bytes; const uint8_t *data()const
					 {
						 return text.empty() ? bytes.data() : reinterpret_cast<const uint8_t *>(text.data());
					 }

		             size_t size()const
					 {
						 return text.empty() ? bytes.size() : text.size();
					 }
	};
	void send(Response &response, HttpReply reply)
	{
		(void)response.header("Cache-Control", "no-store"); (void)response.header("X-Content-Type-Options", "nosniff");
		if(!reply.revision.empty()) (void)response.header("X-Project-Revision", reply.revision);

		auto *payload = new Payload{std::move(reply.text), std::move(reply.bytes)};
		ResponseSource source{payload, payload->size(), [](void *context, size_t offset, uint8_t *out, size_t capacity){
								  const auto &p = *static_cast<Payload *>(context); if(offset >= p.size())
									  return BodyReadResult{BodyReadStatus::End, 0};

								  const auto n = std::min(capacity, p.size() - offset);
								  std::memcpy(out, p.data() + offset, n);
								  return BodyReadResult{BodyReadStatus::Data, n};
							  }};
		(void)response.sendOwnedSource(reply.status, reply.type.c_str(), OwnedResponseSource(source, [](void *p){
			delete static_cast<Payload *>(p);
		}));
	}

	const char *mime(const std::filesystem::path &path)
	{
		const auto type = path.extension().string(); if(type == ".html")
			return "text/html; charset=utf-8";

		if(type == ".js" || type == ".mjs")
			return "text/javascript; charset=utf-8";

		if(type == ".css")
			return "text/css; charset=utf-8";

		if(type == ".json")
			return "application/json";

		if(type == ".svg")
			return "image/svg+xml";

		if(type == ".png")
			return "image/png";

		if(type == ".jpg" || type == ".jpeg")
			return "image/jpeg";

		if(type == ".ico")
			return "image/x-icon";

		if(type == ".woff2")
			return "font/woff2";

		if(type == ".woff")
			return "font/woff";

		if(type == ".ttf")
			return "font/ttf";

		if(type == ".txt")
			return "text/plain; charset=utf-8";

		return "application/octet-stream";
	}

	struct FileSource {std::ifstream file; size_t size{}; explicit FileSource(const std::filesystem::path &path)
						 : file(path, std::ios::binary | std::ios::ate)
					   {
						   if(!file)
							   throw Failure(404, "web_asset_not_found");

						   const auto n = file.tellg(); if(n < 0 || n > 16 * 1024 * 1024)
							   throw Failure(413, "web_asset_size");

						   size = size_t(n);
					   }
	};
	TcpOptions options(uint16_t port)
	{
		TcpOptions value; value.port = port; value.bind_address = "127.0.0.1"; value.max_websocket_clients = 4;
		value.websocket_tx_block_size = 32768;
		value.managed.websocket_tx_blocks_per_client = 2;
		value.http_memory.enabled = true; value.http_memory.initial_requests = 2;
		value.http_memory.maximum_requests = 8; value.managed.header_bytes = 8192;
		#if LVGL_CBOR_NATIVE_MCP
		value.managed.response_body_bytes = NAWSERVER_MCP_OUTPUT_BYTES;
#else
		value.managed.response_body_bytes = 8192;
#endif // RX, callback and two TX blocks plus bounded handshake metadata share each arena.
		value.managed.stream_bytes_per_client = 196608;
		value.managed.ingress_slots = 4; value.keep_alive.enabled = true; value.keep_alive.maximum_idle = 4;
		value.keep_alive.idle_timeout_ms = 1500; value.buffer_memory.max_bytes = 2 * 1024 * 1024; return value;
	}

	HttpLimits limits()
	{
		HttpLimits value; value.max_body_size = LVGL_CBOR_NATIVE_MCP ? 65535 : 4096; value.max_connections = 16;
		value.max_header_bytes = 8192;
		value.exchange_timeout_ms = 15000; return value;
	}

	WebSocketLimits ws_limits()
	{
		return {32768, 4, 4, 65536};
	}

	std::string packet_id(const uint8_t *bytes, size_t length)
	{
		CborParser parser; CborValue root, value; char id[129]; size_t n = sizeof(id);
		if(cbor_parser_init(bytes, length, 0, &parser,
		    &root) != CborNoError || !cbor_value_is_map(&root) || cbor_value_map_find_value(&root, "id",
		    &value) != CborNoError || !cbor_value_is_text_string(&value) || cbor_value_copy_text_string(&value, id, &n,
		    nullptr) != CborNoError)
			return {};

		return std::string(id, n);
	}

}
struct WindowsWebServer::Impl : NaWServer::HandlerBase {
	Application &app; std::filesystem::path web_root; std::string boot = "win-" + token().substr(0, 16);
	NaWServer::tcp::WindowsTransport transport; NaWServer::TcpHttpBackend backend;
	NaWServer::WebSocketEndpoint ws{"/ws", ws_limits()}, screen_ws{"/screen-ws", ws_limits()},
	component_ws{"/component-ws", ws_limits()};
	std::shared_ptr<const std::string> origin = std::make_shared<const std::string>();
	struct Gate {Impl &owner;
		         NaWServer::Result operator()(NaWServer::HeaderContext &context, NaWServer::HeaderNext &next)
				 {
					 const auto url = std::atomic_load(&owner.origin);
					 const auto host = context.request.header("Host"), from = context.request.header("Origin");
					 if(url->empty() || !host || *host != url->substr(7) || (from && *from != *url))
						 return NaWServer::responseResult(context.response.text(403, "api_host_or_origin"));

					 if(!(LVGL_CBOR_NATIVE_MCP && context.request.path() == "/mcp") &&
					     context.request.contentLength() > 4096)
						 return NaWServer::responseResult(context.response.text(413, "request_body_limit"));

					 if(!(LVGL_CBOR_NATIVE_MCP && context.request.path() == "/mcp") &&
					     context.request.method() == NaWServer::HttpMethod::Post &&
					     (context.request.path() == "/api/data" || context.request.contentLength()))
					 {
						 const auto type = context.request.header("Content-Type");
						 if(!type || type->compare(0, 16, "application/cbor") != 0)
							 return NaWServer::responseResult(context.response.text(415, "request_content_type"));
					 }

					 return next();
				 }
	} gate{*this};
	decltype(NaWServer::makeHeaderChain(gate)) headers{gate};
	NaWServer::HandlerBase *handlers[4]{&ws, &screen_ws, &component_ws, this};
	NaWServer::HttpServer server;
	struct Transfer {std::shared_ptr<std::vector<uint8_t> > bytes; size_t size{}, offset{};
		             uint64_t epoch{}, deadline{}; std::string intent, revision, screen, token;};
#if LVGL_CBOR_NATIVE_MCP
	lvgl_cbor::NativeMcp native_mcp{[this](const std::string &name, const DataValue &args){
										UiLock lock; return mcp_tool(name, args);
									}, [](void *context, std::string_view from){
										const auto &owner = *static_cast<Impl *>(context);
										return from == *std::atomic_load(&owner.origin);
									}, this};
#endif
	std::unique_ptr<Transfer> transfer;
	struct Queued {uint64_t id{}, epoch{}; std::vector<uint8_t> bytes;};
	std::deque<Queued> commands; std::deque<DataValue> receipts; uint64_t next_command{}, queue_rejected{};
	struct Stream {std::string name; bool dirty = true; uint64_t next{}; DataRegistry::Subscription watch;};
	std::vector<Stream> streams; std::atomic<bool> resync{true}; uint64_t catalog_revision{}, epoch{};
	std::string project_revision; size_t stream_cursor{};
	bool project_pending = true, catalog_pending = true, started = false;
	Impl(Application &app, uint16_t port, std::filesystem::path root)
	  : app(app), web_root(std::filesystem::weakly_canonical(root)), backend(transport, options(port)),
	    server(backend, handlers, limits(), {}, {}, headers.view())
	{
		if(port == 443)throw std::runtime_error("API port 443 is reserved");

		if(!std::filesystem::is_regular_file(web_root / "index.html"))
			throw std::runtime_error("Web root must contain the built editor index.html");

		auto connected = [this](NaWServer::WebSocketClient *){
				resync = true;
			}; ws.onConnect(connected);
		auto invalid = [](NaWServer::WebSocketClient *client, const uint8_t *bytes, size_t n, bool){
				auto ack = encode_data_value(Object{{"v", 1}, {"id", packet_id(bytes, n)}, {"ok", false},
							{"error", "project_preview_required"}, {"contract_sha256", contract_sha256},
							{"abi", screen_contract_sha256}});
				// The client is borrowed only inside this callback. On pressure,
				// disconnect explicitly instead of retaining it or silently losing the reply.
				const auto sent = client->send_binary(ack.data(), ack.size());
				if(sent != NaWServer::WebSocketSendResult::Queued)
				{
					client->transportSession().invalidate();
				}
			};
		ws.onMessage(invalid); screen_ws.onMessage(invalid); component_ws.onMessage(invalid);
	}

	~Impl()
	{
		(void)server.end(); (void)transport.stop();
		UiLock lock; streams.clear();
	}

	NaWServer::RouteDescriptors routes()const override
	{
		static const NaWServer::RouteDescriptor route{"/", NaWServer::HttpMethod::Any, NaWServer::RouteMatch::Prefix};
		return {&route, 1};
	}

	void static_file(NaWServer::Request &request, NaWServer::Response &response)
	{
		if(request.method() != NaWServer::HttpMethod::Get)throw Failure(405, "web_method");

		auto name = std::string(request.path());
		if(name == "/" && app.graphics())
		{
			(void)response.header("Location", "/editor/"); (void)response.text(302, ""); return;
		}

		if(name == "/viewer" || name == "/viewer/" || name == "/editor/" || name == "/editor")name = "/index.html";

		if(name == "/")name = "/index.html";

		if(name.empty() || name[0] != '/' || name.find('%') != std::string::npos ||
		    name.find('\\') != std::string::npos || name.find(':') != std::string::npos) throw Failure(400, "web_path");

		const auto path = std::filesystem::weakly_canonical(web_root / std::filesystem::u8path(name.substr(1)));
		const auto relative = path.lexically_relative(web_root); if(relative.empty() || *relative.begin() == "..")
			throw Failure(403, "web_path");

		auto file = std::make_unique<FileSource>(path);
		NaWServer::ResponseSource source{file.get(), file->size,
			                             [](void *context, size_t offset, uint8_t *out, size_t capacity){
											 auto &f =
											     *static_cast<FileSource *>(context); if(offset >= f.size)
												 return NaWServer::
												        BodyReadResult{NaWServer::BodyReadStatus::End, 0};

											 const auto n =
											     std::min(capacity, f.size - offset);
											 f.file.seekg(std::streamoff(offset));
											 if(!f.file.read(reinterpret_cast<char *>(out), std::streamsize(n)))
												 return NaWServer::
												        BodyReadResult{NaWServer::BodyReadStatus::TransportError, 0};

											 return NaWServer::
											        BodyReadResult{NaWServer::BodyReadStatus::Data, n};
										 }};
		(void)response.header("X-Content-Type-Options", "nosniff"); (void)response.header("Cache-Control", "no-cache");
		NaWServer::OwnedResponseSource owned(source, [](void *p){
		    delete static_cast<FileSource *>(p);
			}); file.release();
		(void)response.sendOwnedSource(200, mime(path), std::move(owned));
	}

#if LVGL_CBOR_NATIVE_MCP
	std::string png_frame(size_t edge)
	{
		const auto bmp = app.view_frame();
		const auto width = uint32_t(lv_display_get_horizontal_resolution(nullptr)),
		    height = uint32_t(lv_display_get_vertical_resolution(nullptr));
		if(!width || !height)throw std::runtime_error("frame_dimensions");

		for(edge = std::clamp<size_t>(edge, 64, 512); edge >= 64; edge /= 2)
		{
			const auto scale = std::min(1., double(edge) / std::max(width, height));
			const auto w = std::max(1u, uint32_t(width * scale)), h = std::max(1u, uint32_t(height * scale));
			std::vector<unsigned char> rgb(size_t(w) * h * 3);
			for(uint32_t y = 0; y < h; ++y)
				for(uint32_t x = 0; x < w; ++x)
				{
					auto from = 54 + size_t(std::min(height - 1,
					    uint32_t((y + .5) / scale))) * width * 4 + size_t(std::min(width - 1,
					    uint32_t((x + .5) / scale))) * 4;
					auto to = (size_t(y) * w + x) * 3; rgb[to] = bmp[from + 2]; rgb[to + 1] = bmp[from + 1];
					rgb[to + 2] = bmp[from];
				}
			unsigned char *png = nullptr; size_t size = 0;
			auto code = lodepng_encode24(&png, &size, rgb.data(), w, h);
			if(code){lv_free(png); throw std::runtime_error("frame_png_encode");}

			if(size > 44000){lv_free(png); continue;}

			static const char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
			std::string encoded; encoded.reserve((size + 2) / 3 * 4);
			for(size_t i = 0; i < size; i += 3)
			{
				const uint32_t a = png[i], b = i + 1 < size ? png[i + 1] : 0, c = i + 2 < size ? png[i + 2] : 0;
				const uint32_t v = (uint32_t(a) << 16) | (uint32_t(b) << 8) | uint32_t(c);
				encoded.push_back(alphabet[(v >> 18) & 63]); encoded.push_back(alphabet[(v >> 12) & 63]);
				encoded.push_back(i + 1 < size ? alphabet[(v >> 6) & 63] : '=');
				encoded.push_back(i + 2 < size ? alphabet[v & 63] : '=');
			}
			lv_free(png); return encoded;
		}
		throw std::runtime_error("frame_mcp_output_limit");
	}

	DataValue mcp_tool(const std::string &name, const DataValue &arguments)
	{
		auto *project = app.project_service(); if(!project)throw std::runtime_error("project_not_ready");

		const auto &args = object(arguments);
        if(name == "send_view_input")
        {
            keys(args,{"x","y","pressed"});
            const auto x=std::get<int64_t>(args.at("x").value),y=std::get<int64_t>(args.at("y").value);
            if(x<0 || y<0 || x>4095 || y>4095)throw Failure(400,"pointer_coordinates");
            app.view_input(int32_t(x),int32_t(y),std::get<bool>(args.at("pressed").value));
            return Object{{"ok",true}};
        }
		if(name == "get_display_frame")
		{
			size_t edge = 512; auto it = args.find("maxEdge"); if(it != args.end())
				edge = size_t(std::get<int64_t>(it->second.value));

			return png_frame(edge);
		}

		if(name == "get_project_status")
		{
			DataValue result; std::string error;
			if(!native_json_value(windows_project_status_json(project->status()), result, error))
				throw std::runtime_error(error);

			return result;
		}

		if(name == "get_device")
		{
			const auto section = text(args, "section", 16), selected = text(args, "name", 63);
			DataValue parsed; std::string error; if(!native_json_value(app.capabilities(), parsed, error))
				throw std::runtime_error(error);

			const auto &caps = object(parsed);
			if(section.empty() || section == "summary")
				return Object{{"section", "summary"}, {"platform", "windows"}, {"server", "NaWServer"},
					{"lvgl", "9.6.0"}, {"native_mcp", true}, {"native_view", true}, {"native_view_input", app.view_input_available()}, {"mcp", "/mcp"},
					{"sections", DataValue::Array{"widgets", "styles", "resources", "limits"}},
					{"display",
					 Object{{"width", lv_display_get_horizontal_resolution(nullptr)},
						 {"height", lv_display_get_vertical_resolution(nullptr)}}}};

			if(section == "limits")return caps.at("limits");

			DataValue::Array all;
			if(section == "widgets")
			{
				all = std::get<DataValue::Array>(object(caps.at("screen")).at("widgets").value);
				const auto extra = caps.find("extensions"); if(extra != caps.end())
					for(const auto &widget:std::get<DataValue::Array>(extra->second.value))
						all.push_back(widget);
			}
			else if(section == "styles") all = std::get<DataValue::Array>(object(caps.at("style")).at("methods").value);
			else if(section == "resources")all = std::get<DataValue::Array>(caps.at("resources").value);
			else throw std::runtime_error("device_section");

			DataValue::Array filtered; for(const auto &item:all)
			{
				if(selected.empty() || text(object(item), "name", 79) == selected)
					filtered.push_back(item);
			}
			size_t offset = 0, limit = 16; if(args.count("offset"))
				offset = size_t(std::get<int64_t>(args.at("offset").value));

			if(args.count("limit")) limit = size_t(std::get<int64_t>(args.at("limit").value));

			if(limit < 1 || limit > 64 || offset > filtered.size())throw std::runtime_error("device_page_limit");

			const auto end = std::min(filtered.size(), offset + limit);
			DataValue::Array page(filtered.begin() + offset, filtered.begin() + end);
			return Object{{"section", section}, {"items", page}, {"total", filtered.size()}, {"nextOffset", end},
				{"hasMore", end < filtered.size()}};
		}

		if(name == "get_ui_reference")
		{
			const auto kind = text(args, "kind", 16); const auto topic = text(args, "topic", 63);
			const auto guide = web_root.parent_path().parent_path() / "tools/designer/prompts" / (kind ==
			    "style" ? "assistant-styles-reference.md" : "assistant-layout-reference.md");
			std::ifstream stream(guide, std::ios::binary);
			std::string markdown((std::istreambuf_iterator<char>(stream)), {});
			if(markdown.empty() || markdown.size() > 48000)
				throw std::runtime_error("reference_missing_or_output_limit");

			return Object{{"kind", kind}, {"topic", topic.empty() ? "index" : topic}, {"version", "native-1"},
				{"topics", DataValue::Array{"index", "layout", "styles", "bindings", "events"}},
				{"markdown", markdown}};
		}

		if(name == "get_data" || name == "get_data_catalog")
		{
			auto query_args = args; query_args.erase("snapshot");
			if(name == "get_data" && args.count("snapshot") && std::get<bool>(args.at("snapshot").value))
			{
				DataValue result; std::string error;
				if(!native_json_value(app.data.registry.snapshot_json(), result, error))
					throw std::runtime_error(error);

				return result;
			}

			if(!query_args.count("kind"))query_args["kind"] = name == "get_data" ? "values" : "groups";

			DataQuery q; std::string output, error;
			if(!parse_data_query(query_args, q, error) || !app.data.registry.query_json(q, output, error))
				throw std::runtime_error(error);

			DataValue result; if(!native_json_value(output, result, error))
				throw std::runtime_error(error);

			return result;
		}

		if(name == "show_project_screen" || name == "refresh_project_display")
		{
			Object command{{"action", name == "show_project_screen" ? "show" : "refresh"}};
			if(name == "show_project_screen")command["screen"] = text(args, "screen", 63, true);

			return windows_project_request(*project, command);
		}

		if(name == "invoke_action" || name == "write_source" || name == "send_event")
		{
			Object command = args; command.erase("wait");
			command["kind"] = name == "invoke_action" ? "action" : name == "write_source" ? "write" : "event";
			windows_data_command(project, app.data.registry, command); app.data.registry.flush();
			return Object{{"state", "completed"}, {"result", Object{{"ok", true}}}};
		}

		throw std::runtime_error("unknown_native_tool");
	}

#endif
	HttpReply api(NaWServer::Request &request)
	{
		auto *project = app.project_service(); if(!project)throw Failure(503, "project_not_ready");

		const auto path = request.path(); HttpReply out;
		if(request.method() == NaWServer::HttpMethod::Options){out.status = 204; return out;}

		if(path == "/api/info" && request.method() == NaWServer::HttpMethod::Get)
		{
			out.text = data_value_json(Object{{"source", "device"}, {"platform", "windows"}, {"server", "NaWServer"},
						{"name", "NaCBORUIforLVGL Windows"}, {"boot_id", boot}, {"lvgl", "9.6.0"},
						{"contract_sha256", contract_sha256}, {"screen_contract_sha256", screen_contract_sha256},
						{"profile", app.graphics() ? "graphics" : "system"}, {"native_view", true}, {"native_view_input", app.view_input_available()},
						{"native_mcp", bool(LVGL_CBOR_NATIVE_MCP)}, {"component_preview", false}}); return out;
		}

		if(path == "/api/view/frame" && request.method() == NaWServer::HttpMethod::Get)
		{
			out.type = "image/bmp"; out.bytes = app.view_frame(); return out;
		}

		if(path == "/api/view/input" && request.method() == NaWServer::HttpMethod::Post)
		{
			const auto decoded = decode(request.body()); const auto &v = object(decoded);
			keys(v, {"x", "y", "pressed"});
			const auto x = std::get<int64_t>(v.at("x").value), y = std::get<int64_t>(v.at("y").value);
			if(x < 0 || y < 0 || x > 4095 || y > 4095)throw Failure(400, "pointer_coordinates");

			app.view_input(int32_t(x), int32_t(y), std::get<bool>(v.at("pressed").value)); out.text = "{\"ok\":true}";
			return out;
		}

		if(path == "/api/capabilities" && request.method() == NaWServer::HttpMethod::Get)
		{
			out.text = app.capabilities(); return out;
		}

		if(path == "/api/data")
		{
			if(request.method() == NaWServer::HttpMethod::Get)
			{
				if(request.query("kind"))
				{
					Object params;
					for(const char *key:{"kind", "group", "prefix", "name", "path", "descendants", "detail", "offset",
					                     "limit", "maxBytes", "catalogRevision"})
						if(auto value = request.query(key)) params[key] = std::string(*value);

					DataQuery query; std::string error;
					if(!parse_data_query(params, query, error) || !app.data.registry.query_json(query, out.text, error))
						throw Failure(status_for(error), error);

					return out;
				}

				if(!request.rawQuery().empty())throw Failure(400, "data_query_kind");

				out.text = app.data.registry.snapshot_json(); out.text.pop_back(); out.text += ",\"commands\":[";
				bool comma = false; for(const auto &receipt:receipts)
				{
					if(comma)
						out.text += ',';

					comma = true; out.text += data_value_json(receipt);
				}
				out.text += "],\"queueRejected\":" + std::to_string(queue_rejected) + "}"; return out;
			}

			if(request.method() != NaWServer::HttpMethod::Post)throw Failure(405, "data_method");

			if(request.body().empty() || request.body().size() > 4096)throw Failure(413, "data_command_size");

			if(commands.size() >= 4){++queue_rejected; throw Failure(429, "data_queue_full");}

			if(next_command >= 9007199254740991ULL)throw Failure(503, "data_command_ids");

			Queued command; command.id = ++next_command; command.epoch = app.workspace_epoch();
			command.bytes.assign(request.body().data(), request.body().data() + request.body().size());
			commands.push_back(std::move(command)); out.status = 202;
			out.text = data_value_json(Object{{"queued", true}, {"id", next_command}}); return out;
		}

		if(path != "/api/project")throw Failure(404, "api_route");

		auto action = query(request, "action"); if(action.empty())action = "info";

		if(request.method() == NaWServer::HttpMethod::Get)
		{
			Object args{{"action", action}};
			if(action != "info" && action != "read" && action != "screen" && action != "style")
				throw Failure(400, "project_action");

			if(action == "screen" || action == "style")args["name"] = query(request, "name");

			auto result = windows_project_request(*project, args, {}, &out.bytes); const auto &value = object(result);
			if(action == "info")out.text = text(value, "projectJson", 512 * 1024, true);
			else
			{
				out.type = "application/cbor"; out.revision = text(value, "revision", 32, true);
			}

			return out;
		}

		if(request.method() != NaWServer::HttpMethod::Post)throw Failure(405, "project_method");

		if(transfer && (clock_ms() > transfer->deadline || transfer->epoch != app.workspace_epoch()))transfer.reset();

		if(action == "chunk" || action == "finish" || action == "cancel")
		{
			if(!transfer || query(request, "token") != transfer->token)throw Failure(400, "project_transfer_not_found");

			if(action == "cancel"){transfer.reset(); out.text = "{\"ok\":true}"; return out;}

			if(action == "chunk")
			{
				auto bytes = request.body();
				if(query(request,
				    "offset") != std::to_string(transfer->offset) || bytes.empty() || bytes.size() > 2048 ||
				    bytes.size() > transfer->size - transfer->offset)
					throw Failure(400, "project_chunk_offset_or_size");

				std::memcpy(transfer->bytes->data() + transfer->offset, bytes.data(), bytes.size());
				transfer->offset += bytes.size(); transfer->deadline = clock_ms() + 30000; out.text = "{\"ok\":true}";
				return out;
			}

			if(!request.body().empty())throw Failure(400, "project_finish_body");

			if(transfer->offset != transfer->size)throw Failure(400, "project_transfer_incomplete");

			auto done = std::move(transfer); std::shared_ptr<const std::vector<uint8_t> > owner = done->bytes;
			out.text = data_value_json(windows_project_request(*project,
			        Object{{"action", done->intent}, {"screen", done->screen}, {"revision", done->revision}},
			        {owner->data(), owner->size(), owner})); return out;
		}

		auto decoded = decode(request.body()); const auto &value = object(decoded);
		if(action == "begin")
		{
			keys(value, {"intent", "size", "revision", "screen"}); if(transfer)
				throw Failure(409, "project_transfer_busy");

			auto item = std::make_unique<Transfer>(); item->intent = text(value, "intent", 8, true);
			item->revision = text(value, "revision", 32); item->screen = text(value, "screen", 63, true);
			const auto size = value.find("size");
			const auto *n = size == value.end() ? nullptr : std::get_if<int64_t>(&size->second.value);
			if((item->intent != "save" && item->intent != "preview") || !n || *n < 1 ||
			    uint64_t(*n) > Application::project_limit) throw Failure(400, "project_transfer_parameters");

			if(item->intent == "save" && item->revision.empty())throw Failure(400, "project_revision_required");

			item->size = size_t(*n); item->bytes = std::make_shared<std::vector<uint8_t> >(item->size);
			item->epoch = app.workspace_epoch(); item->deadline = clock_ms() + 30000; item->token = token();
			out.text = data_value_json(Object{{"token", item->token}, {"chunkBytes", 2048}});
			transfer = std::move(item); return out;
		}

		Object args;
		if(action == "show")
		{
			keys(value, {"screen"}); args = {{"action", action}, {"screen", text(value, "screen", 63, true)}};
		}
		else if(action == "refresh")
		{
			keys(value, {}); args = {{"action", action}};
		}
		else if(action == "reset")
		{
			keys(value, {"kind", "name", "revision"});
			args = {{"action", action}, {"kind", text(value, "kind", 16)}, {"name", text(value, "name", 63)},
				{"revision", text(value, "revision", 32, true)}};
		}
		else throw Failure(400, "project_action");

		out.text = data_value_json(windows_project_request(*project, args)); return out;
	}

	void handleRequest(NaWServer::Request *request, NaWServer::Response &response)override
	{
		try{
#if LVGL_CBOR_NATIVE_MCP
			if(request->path() == "/mcp"){native_mcp.handleRequest(request, response); return;}

#endif
			if(request->path().substr(0, 5) != "/api/")
			{
				static_file(*request, response); return;
			}

			HttpReply reply; {UiLock lock; reply = api(*request);} send(response, std::move(reply));
		}
		catch(const Failure &error){send(response,
			                            HttpReply{error.status, "application/json",
			                                      data_value_json(Object{{"error", error.what()}}), {}, {}});}
		catch(const std::exception &error){send(response,
			                                   HttpReply{status_for(error.what()), "application/json",
			                                             data_value_json(Object{{"error", error.what()}}), {}, {}});}
	}

	bool emit(const DataValue &event)
	{
		const auto bytes = encode_data_value(event);
		return bytes.size() <= 32768 && ws.send_binary(bytes.data(), bytes.size()).rejected == 0;
	}

	void rebuild_streams()
	{
		streams.clear(); const auto names = app.data.registry.source_names(); streams.reserve(names.size());
		for(const auto &name:names)
		{
			const auto i = streams.size(); streams.push_back({name});
			streams.back().watch = app.data.registry.observe({name}, [this, i]{
				streams[i].dirty = true;
			});
		}
		stream_cursor = 0;
	}

	void poll()
	{
		if(transfer && clock_ms() >= transfer->deadline) transfer.reset();

		if(!commands.empty())
		{
			auto command = std::move(commands.front()); commands.pop_front(); bool ok = false; std::string error;
			try{if(command.epoch != app.workspace_epoch())
					throw
					    std::runtime_error("player_project_changed");

				windows_data_command_packet
				    (app.project_service(), app.data.registry, command.bytes.data(), command.bytes.size()); ok = true;
			}catch(const std::exception &e){error = e.what();} if(receipts.size() == 8)
				receipts.pop_front();

			receipts.emplace_back(Object{{"id", command.id}, {"ok", ok}, {"error", error}});
		}

		const auto next_epoch = app.workspace_epoch(); const auto next_catalog = app.data.registry.catalog_revision();
		if(next_catalog != catalog_revision)
		{
			catalog_revision = next_catalog;
			if(ws.count()) rebuild_streams();
			else streams.clear();

			catalog_pending = true;
		}

		const auto revision = app.project_service() ? app.project_service()->revision() : std::string{};
		if(epoch != next_epoch || project_revision != revision)
		{
			epoch = next_epoch; project_revision = revision; project_pending = true;
			if(transfer && transfer->epoch != epoch)
				transfer.reset();
		}

		if(resync.exchange(false))
		{
			if(ws.count() && streams.empty()) rebuild_streams();

			project_pending = true; catalog_pending = true; for(auto &entry:streams)
				entry.dirty = true;
		}

		if(!ws.count()) { streams.clear(); return; }

		if(project_pending)
		{
			if(!emit(Object{{"v", 1}, {"event", "project_changed"}, {"revision", project_revision}}))
				return;

			project_pending = false;
		}

		if(catalog_pending)
		{
			if(!emit(Object{{"v", 1}, {"event", "data_catalog_changed"}, {"catalogRevision", catalog_revision}}))
				return;

			catalog_pending = false;
		}

		const auto now = clock_ms(); size_t sent = 0;
		for(size_t seen = 0; seen < streams.size() && sent < 1; ++seen)
		{
			auto &entry = streams[stream_cursor]; stream_cursor = (stream_cursor + 1) % streams.size();
			if(!entry.dirty || now < entry.next)
				continue;

			DataState state; const auto *value = app.data.registry.read(entry.name, {}, &state);
			if(!emit(Object{{"v", 1}, {"event", "data_changed"}, {"source", entry.name},
					{"state", state == DataState::Known ? "known" : state == DataState::Stale ? "stale" : "unknown"},
					{"revision", app.data.registry.revision()}, {"value", value ? *value : DataValue{}}})) break;

			entry.dirty = false; entry.next = now + 100; ++sent;
		}
	}

};
WindowsWebServer::WindowsWebServer(Application &app, uint16_t port, std::filesystem::path root)
  : impl_(std::make_unique<Impl>(app, port, std::move(root)))
{
}

WindowsWebServer::~WindowsWebServer() = default;
void WindowsWebServer::start()
{
	auto &p = *impl_; if(p.transport.start().status != NaWServer::tcp::Status::Ok)
		throw std::runtime_error("NaWServer Windows transport start failed");

	const auto http = p.server.begin();
	if(http != NaWServer::HttpError::Ok)
		throw std::runtime_error("NaWServer HTTP start failed: " + std::to_string(int(http)));

	std::atomic_store(&p.origin,
	    std::make_shared<const std::string>("http://127.0.0.1:" + std::to_string(p.backend.port()))); p.started = true;
}

void WindowsWebServer::stop()
{
	auto &p = *impl_; if(p.server.end() != NaWServer::HttpError::Ok)
		throw std::runtime_error("NaWServer HTTP stop failed");

	if(p.transport.stop().status != NaWServer::tcp::Status::Ok)
		throw std::runtime_error("NaWServer Windows transport stop failed");

	{UiLock lock; p.streams.clear();}
	p.started = false;
}

std::string WindowsWebServer::url()const
{
	return *std::atomic_load(&impl_->origin);
}

void WindowsWebServer::poll()
{
	impl_->poll();
}
