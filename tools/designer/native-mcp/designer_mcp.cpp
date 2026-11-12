// SPDX-License-Identifier: MIT
#include <NaWServer/backends/tcp.h>
#include <NaWServer/backends/windows_tcp.h>
#include <NaWServer/mcp.h>
#include <NaWServer/http_server.h>
#include <NaWServer/request.h>
#include <NaWServer/response.h>
#include <array>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
using namespace NaWServer;
using Call = int (*)(const char *, const char *, int, char *, int, int *);
constexpr int wire_bytes = 65535;

TcpOptions options(uint16_t port)
{
	TcpOptions result;
	result.port = port;
	result.bind_address = "127.0.0.1";
	result.http_memory.enabled = true;
	result.http_memory.initial_requests = 1;
	result.http_memory.maximum_requests = 3;
	result.managed.header_bytes = 8192;
	result.managed.response_body_bytes = wire_bytes;
	result.no_progress_timeout_ms = 5000;
	result.keep_alive.enabled = true;
	result.keep_alive.maximum_idle = 3;
	result.keep_alive.idle_timeout_ms = 5000;
	result.buffer_memory.max_bytes = 2 * 1024 * 1024;
	return result;
}

HttpLimits limits()
{
	HttpLimits result;
	result.max_body_size = wire_bytes;
	result.max_connections = 4;
	result.max_header_bytes = 8192;
	result.exchange_timeout_ms = 90000;
	return result;
}

std::string text(const json::Document &document, json::Value value, size_t bound)
{
	std::string result(bound, '\0');
	size_t count{};
	if(!document.decode(value, result.data(), result.size(), count))
		throw std::runtime_error("Invalid Designer MCP tool metadata");
	result.resize(count);
	return result;
}

class Host final : public HandlerBase
{
	struct Record {Call call; std::string name, description, schema; bool read_only;};
	std::vector<Record> records_;
	std::vector<mcp::Tool> tools_;
	alignas(std::max_align_t) std::array<unsigned char, NAWSERVER_JSON_WORKSPACE_BYTES> reader_{};
	std::array<char, wire_bytes> output_{};
	mcp::Workspace workspace_{reader_.data(), reader_.size(), output_.data(), output_.size()};
	std::unique_ptr<mcp::Endpoint> endpoint_;
	tcp::WindowsTransport transport_;
	TcpHttpBackend backend_;
	HandlerBase *handlers_[1]{this};
	HttpServer server_;
	std::string host_, localhost_;

	static mcp::ToolResult invoke(void *context, const json::Document &document,
	    json::Value args, json::Writer &writer, bool &is_error)
	{
		try
		{
			auto &record = *static_cast<Record *>(context);
			std::vector<char> argument_bytes(wire_bytes), reply(wire_bytes - 512);
			json::Writer arguments(argument_bytes.data(), argument_bytes.size());
			if(!(args ? arguments.value(document, args) : arguments.append("{}")))
				return mcp::ToolResult::InvalidArguments;
			const auto input = arguments.fragment();
			int error{};
			const auto count = record.call(record.name.c_str(), input.data(), int(input.size()),
			    reply.data(), int(reply.size()), &error);
			is_error = error != 0;
			return count > 0 && size_t(count) <= reply.size() && writer.append({reply.data(), size_t(count)})
			    ? mcp::ToolResult::Success : mcp::ToolResult::Failed;
		}
		catch(...) { return mcp::ToolResult::Failed; }
	}

public:
	Host(uint16_t port, std::string_view manifest, Call call)
	  : backend_(transport_, options(port)), server_(backend_, handlers_, limits())
	{
		json::Document document(reader_.data(), reader_.size());
		if(document.parse(manifest) != json::Error::None || document.root().type() != json::Type::Array)
			throw std::runtime_error("Invalid Designer MCP manifest");
		const auto count = document.size(document.root());
		if(!count || count > 64) throw std::runtime_error("Invalid Designer MCP catalog size");
		for(size_t i = 0; i < count; ++i)
		{
			const auto item = document.element(document.root(), i);
			const auto schema = document.member(item, "schema");
			std::array<char, 8192> serialized{};
			json::Writer writer(serialized.data(), serialized.size());
			bool read_only{};
			if(!schema || schema.type() != json::Type::Object || !writer.value(document, schema) ||
			    !document.boolean(document.member(item, "readOnly"), read_only))
				throw std::runtime_error("Invalid Designer MCP tool schema");
			records_.push_back({call, text(document, document.member(item, "name"), 64),
			    text(document, document.member(item, "description"), 4096), std::string(writer.fragment()), read_only});
		}
		for(auto &record : records_)
			tools_.push_back({record.name.c_str(), record.description.c_str(), record.schema.c_str(), nullptr,
			    &record, record.read_only, nullptr, invoke});
		endpoint_ = std::make_unique<mcp::Endpoint>(tools_.data(), tools_.size(), workspace_);
		host_ = "127.0.0.1:" + std::to_string(port);
		localhost_ = "localhost:" + std::to_string(port);
	}

	bool start() { return transport_.start().status == tcp::Status::Ok && server_.begin() == HttpError::Ok; }
	~Host() { (void)server_.end(); (void)transport_.stop(); }
	RouteDescriptors routes() const override { return endpoint_ ? endpoint_->routes() : RouteDescriptors{}; }
	void handleRequest(Request *request, Response &response) override
	{
		const auto host = request->header("Host");
		if(!host || (*host != host_ && *host != localhost_))
		{
			(void)response.text(403, "Loopback Host required");
			return;
		}
		endpoint_->handleRequest(request, response);
	}
};
}

extern "C" __declspec(dllexport) void *designer_mcp_start(uint16_t port, const char *manifest, Call call)
{
	if(!port || port == 443 || !manifest || !call) return nullptr;
	try
	{
		auto host = std::make_unique<Host>(port, manifest, call);
		return host->start() ? host.release() : nullptr;
	}
	catch(...) { return nullptr; }
}

extern "C" __declspec(dllexport) void designer_mcp_stop(void *host) { delete static_cast<Host *>(host); }
