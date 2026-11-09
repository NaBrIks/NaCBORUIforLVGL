// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include <NaWServer/backends/windows_tcp.h>
#include <NaWServer/backends/tcp.h>
#include <NaWServer/http_server.h>
#include <NaWServer/request.h>
#include <algorithm>
#include <array>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstring>
#include <fcntl.h>
#include <io.h>
#include <map>
#include <memory>
#include <mutex>
#include <string>
using namespace NaWServer;
namespace
{
	constexpr uint32_t max_body = 4 * 1024 * 1024;
	std::mutex jobs_mutex, output_mutex;
	struct Reply { std::condition_variable changed; bool ready{}; int status{503}; std::string body; };
	std::map<uint32_t, std::shared_ptr<Reply> > jobs;
	uint32_t next_id{};
	bool stopped{};
	bool read_bytes(void *data, size_t length)
	{
		return std::fread(data, 1, length, stdin) == length;
	}

	void output(uint32_t id, uint32_t status, const std::string &body)
	{
		std::lock_guard<std::mutex> guard(output_mutex);
		const uint32_t header[]{id, status, uint32_t(body.size())};
		std::fwrite(header, sizeof(header), 1, stdout); if(!body.empty())
			std::fwrite(body.data(), 1, body.size(), stdout);

		std::fflush(stdout);
	}

	void send(Response &response, int status, std::string body)
	{
		auto *payload = new std::string(std::move(body));
		ResponseSource source{payload, payload->size(), [](void *context, size_t offset, uint8_t *out, size_t capacity){
								  const auto &text = *static_cast<std::string *>(context);
								  if(offset >= text.size()) return BodyReadResult{BodyReadStatus::End, 0};

								  const auto count = std::min(capacity, text.size() - offset);
								  std::memcpy(out, text.data() + offset, count);
								  return BodyReadResult{BodyReadStatus::Data, count};
							  }};
		(void)response.header("Cache-Control", "no-store");
		(void)response.sendOwnedSource(status, "application/json", OwnedResponseSource(source, [](void *p){
			delete static_cast<std::string *>(p);
		}));
	}

	struct Gateway : HandlerBase
	{
		RouteDescriptors routes()const override
		{
			static const RouteDescriptor route{"/mcp", HttpMethod::Any, RouteMatch::Exact}; return {&route, 1};
		}

		void handleRequest(Request *request, Response &response)override
		{
			if(request->method() != HttpMethod::Post){(void)response.text(405, "POST /mcp"); return;}

			if(request->header("Origin")){(void)response.text(403, "Native MCP clients only"); return;}

			const auto type = request->header("Content-Type");
			if(!type || type->compare(0, 16, "application/json") != 0)
			{
				(void)response.text(415, "application/json required"); return;
			}

			const auto input = request->body();
			if(input.size() > max_body){(void)response.text(413, "MCP request too large"); return;}

			auto reply = std::make_shared<Reply>(); uint32_t id;
			{std::lock_guard<std::mutex> lock(jobs_mutex); if(stopped || jobs.size() >= 4)
			 {
				 (void)response.text(503, "MCP gateway busy"); return;
			 }

			 id = ++next_id; jobs[id] = reply;}
			output(id, 0, std::string(reinterpret_cast<const char *>(input.data()), input.size()));
			std::unique_lock<std::mutex> lock(jobs_mutex);
			const bool ready = reply->changed.wait_for(lock, std::chrono::seconds(70), [&]{
				return reply->ready || stopped;
			});
			jobs.erase(id); lock.unlock();
			if(!ready || !reply->ready)
			{
				send(response, 504, "{\"error\":\"MCP host timeout; do not replay mutations automatically\"}"); return;
			}

			send(response, reply->status, std::move(reply->body));
		}

	};
}
int main(int argc, char **argv)
{
	_setmode(_fileno(stdin), _O_BINARY); _setmode(_fileno(stdout), _O_BINARY);
	const auto requested = argc > 1 ? std::stoul(argv[1]) : 5302;
	if(requested > 65535 || requested == 443) return 2;

	const std::string bind = argc > 2 ? argv[2] : "127.0.0.1";
	if(bind != "127.0.0.1")return 2;

	tcp::WindowsTransport transport; TcpOptions options; options.port = uint16_t(requested);
	options.bind_address = bind.c_str();
	options.http_memory.enabled = true; options.http_memory.initial_requests = 2;
	options.http_memory.maximum_requests = 4;
	options.managed.header_bytes = 8192; options.managed.response_body_bytes = 8192; options.managed.ingress_slots = 2;
	options.managed.stream_bytes_per_client = max_body + 65536; options.buffer_memory.max_bytes = 16 * 1024 * 1024;
	TcpHttpBackend backend(transport, options); Gateway handler; HandlerBase *handlers[]{&handler}; HttpLimits limits;
	limits.max_body_size = max_body; limits.max_header_bytes = 8192; limits.exchange_timeout_ms = 75000;
	HttpServer server(backend, handlers, limits);
	if(transport.start().status != tcp::Status::Ok || server.begin() != HttpError::Ok) return 3;

	output(0, backend.port(), "ready");
	uint32_t header[3];
	while(read_bytes(header, sizeof(header)))
	{
		if(header[2] > max_body) break;

		std::string body(header[2], '\0'); if(!read_bytes(body.data(), body.size())) break;

		std::lock_guard<std::mutex> lock(jobs_mutex); const auto found = jobs.find(header[0]);
		if(found != jobs.end())
		{
			found->second->status = int(header[1]); found->second->body = std::move(body); found->second->ready = true;
			found->second->changed.notify_all();
		}
	}
	{std::lock_guard<std::mutex> lock(jobs_mutex); stopped = true; for(auto &job:jobs)
		 job.second->changed.notify_all();
	}
	(void)server.end(); (void)transport.stop(); return 0;
}
