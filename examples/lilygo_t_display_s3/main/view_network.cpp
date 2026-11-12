// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "view_network.hpp"
#include "board.hpp"
#include "frame_packets.hpp"
#include "input_queue.hpp"
#include "lvgl_cbor/data_registry.hpp"
#include <NaWServer/backends/esp_idf_tcp.h>
#include <NaWServer/backends/esp_idf_memory.h>
#include <NaWServer/backends/tcp.h>
#include <NaWServer/http_server.h>
#include <NaWServer/route.h>
#include <NaWServer/request.h>
#include <NaWServer/response.h>
#include <NaWServer/websocket.h>
#include <atomic>
#include <charconv>
#include <cstdio>
#include <cstring>
#include <mutex>
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "nvs_flash.h"

#if __has_include("wifi_secret.hpp")
#include "wifi_secret.hpp"
#else
#define LILYGO_WIFI_SSID ""
#define LILYGO_WIFI_PASSWORD ""
#endif

namespace
{
	using namespace NaWServer;
	using namespace native_view;

	std::atomic<uint32_t> ipv4{};
	std::atomic<unsigned> wifi_reason{};
	std::atomic<bool> input_ready{};
	std::mutex guard;
	InputQueue input_queue;
	// One TX block per client. Let the next offer reach the pool and wait there
	// instead of closing the connection on the endpoint's pending-byte limit.
	WebSocketEndpoint socket{"/api/view/ws",{4092,4,1,8192}};
	std::weak_ptr<WebSocketSession> peer;
	enum class State {idle, waiting, streaming, end};
	State state{};
	uint32_t since{}, started{};
	DisplayBands plan{};
	bool capturing{}, peer_changed{};
	uint8_t *packet{};
	size_t packet_size{};
	unsigned band{};

	void reset()
	{
		if(capturing) display_capture_release();

		capturing=false;
		packet=nullptr;
		state=State::idle;
	}

	bool send(WebSocketSession &client,const void *data,size_t length,bool binary)
	{
		const auto result=client.sendCopy(static_cast<const uint8_t *>(data),length,binary);
		if(result==WebSocketSendResult::Queued) return true;

		if(result!=WebSocketSendResult::Busy && result!=WebSocketSendResult::QueueFull &&
		   result!=WebSocketSendResult::GlobalFull) reset();

		return false;
	}

	bool send_text(WebSocketSession &client,const char *text)
	{
		return send(client,text,std::strlen(text),false);
	}

	void receive(WebSocketClient *client,const uint8_t *data,size_t size,bool binary)
	{
		if(binary || !size || size>10) return;

		const auto *text=reinterpret_cast<const char *>(data);
		uint32_t requested{};
		const auto result=std::from_chars(text,text+size,requested);
		if(result.ec!=std::errc{} || result.ptr!=text+size) return;

		std::lock_guard<std::mutex> lock(guard);
		const auto session=client->outputSession().lock();
		if(!session) return;

		// A new viewer can replace a dropped/reconnected client.
		const bool changed=peer.lock()!=session;
		if(!changed && state!=State::idle) return;

		peer_changed |= changed;

		peer=session;
		since=requested;
		started=lv_tick_get();
		state=State::waiting;
	}

	SendResult info(Response &response)
	{
		char body[384];
		const auto size=std::snprintf(body,sizeof(body),
			"{\"source\":\"device\",\"name\":\"T-Display-S3\",\"native_view\":true,"
			"\"native_view_packets\":true,\"native_view_packet_version\":2,"
			"\"native_view_ws\":true,\"native_view_ws_only\":true,\"native_view_input\":%s,"
			"\"display\":{\"width\":%u,\"height\":%u,\"mode\":\"partial\",\"pixelFormat\":\"RGB565\"}}",
			input_ready.load()?"true":"false",display_width,display_height);
		return response.send(200,"application/json",{reinterpret_cast<const uint8_t *>(body),size_t(size)});
	}

	SendResult pointer_input(Request &request,Response &response)
	{
		const auto body=request.body();
		const auto mime=request.header("Content-Type");
		lvgl_cbor::DataValue value;
		std::string error;
		bool valid=mime && mime->compare(0,16,"application/cbor")==0 && body.size()<=128 &&
			lvgl_cbor::decode_data_value(body.data(),body.size(),value,error,128,2);
		const auto *fields=valid ? std::get_if<lvgl_cbor::DataValue::Object>(&value.value) : nullptr;
		if(fields && fields->size()==3 && fields->count("x") && fields->count("y") && fields->count("pressed"))
		{
			const auto *x=std::get_if<int64_t>(&fields->at("x").value);
			const auto *y=std::get_if<int64_t>(&fields->at("y").value);
			const auto *pressed=std::get_if<bool>(&fields->at("pressed").value);
			if(input_ready.load() && x && y && pressed && *x>=0 && *x<display_width && *y>=0 && *y<display_height)
			{
				std::lock_guard<std::mutex> lock(guard);
				if(input_queue.push(int32_t(*x),int32_t(*y),*pressed))
					return response.text(200,"{\"ok\":true}");

				return response.text(503,"{\"error\":\"view_input_busy\"}");
			}
		}

		return response.text(400,"{\"error\":\"view_input_invalid\"}");
	}

	void wifi_event(void *,esp_event_base_t base,int32_t id,void *data)
	{
		if(base==IP_EVENT && id==IP_EVENT_STA_GOT_IP)
			ipv4.store(static_cast<ip_event_got_ip_t *>(data)->ip_info.ip.addr);
		else if(base==IP_EVENT && id==IP_EVENT_STA_LOST_IP)
			ipv4.store(0);

		if(base==WIFI_EVENT && (id==WIFI_EVENT_STA_START || id==WIFI_EVENT_STA_DISCONNECTED))
		{
			ipv4.store(0);
			if(id==WIFI_EVENT_STA_DISCONNECTED)
				wifi_reason.store(static_cast<wifi_event_sta_disconnected_t *>(data)->reason);
			(void)esp_wifi_connect();
		}
	}

	TcpOptions tcp_options()
	{
		TcpOptions value;
		value.bind_address="0.0.0.0";
		value.port=80;
		value.max_websocket_clients=1;
		value.http_memory.enabled=true;
		value.http_memory.maximum_requests=3;
		value.buffer_memory.allocator=espIdfBufferAllocator(EspIdfMemoryPolicy::PreferPsram);
		value.managed.ingress_slots=2;
		value.managed.response_header_bytes=512;
		value.managed.response_body_bytes=512;
		value.managed.io_slice_bytes=4096;
		value.keep_alive.enabled=false;
		return value;
	}
}

void start_view_network(bool pointer_ready)
{
	if(!std::strlen(LILYGO_WIFI_SSID)) return;

	ESP_ERROR_CHECK(nvs_flash_init());
	ESP_ERROR_CHECK(esp_netif_init());
	ESP_ERROR_CHECK(esp_event_loop_create_default());
	esp_netif_create_default_wifi_sta();
	wifi_init_config_t init=WIFI_INIT_CONFIG_DEFAULT();
	ESP_ERROR_CHECK(esp_wifi_init(&init));
	ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT,ESP_EVENT_ANY_ID,wifi_event,nullptr));
	ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT,ESP_EVENT_ANY_ID,wifi_event,nullptr));
	wifi_config_t config{};
	strlcpy(reinterpret_cast<char *>(config.sta.ssid),LILYGO_WIFI_SSID,sizeof(config.sta.ssid));
	strlcpy(reinterpret_cast<char *>(config.sta.password),LILYGO_WIFI_PASSWORD,sizeof(config.sta.password));
	ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));
	ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
	ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA,&config));
	ESP_ERROR_CHECK(esp_wifi_start());
	ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));

	input_ready.store(pointer_ready);
	socket.onMessage(receive);
	static Route device_info("/api/info",HttpMethod::Get,info);
	static Route pointer_route("/api/view/input",HttpMethod::Post,pointer_input);
	static HandlerBase *const routes[]{&device_info,&pointer_route,&socket};
	static tcp::IdfTransport transport;
	if(transport.start().status!=tcp::Status::Ok)
	{
		ESP_LOGE("lilygo_view","TCP transport startup failed");
		return;
	}

	static TcpHttpBackend backend(transport,tcp_options());
	HttpLimits limits;
	limits.max_connections=4;
	limits.max_header_bytes=4096;
	limits.max_body_size=128;
	static HttpServer server(backend,routes,limits);
	const auto status=server.begin();
	if(status!=HttpError::Ok)
	{
		const auto diagnostic=backend.diagnostics();
		ESP_LOGE("lilygo_view","NaWServer startup failed: %u/%u, native=%d",
		    unsigned(status),unsigned(diagnostic.last_failure),diagnostic.native_error);
	}
}

uint32_t view_network_ipv4()
{
	return ipv4.load();
}

unsigned view_network_wifi_reason()
{
	return wifi_reason.load();
}

void process_view_input(native_view::Pointer &pointer)
{
	for(unsigned i=0;i<16;++i)
	{
		Input input;
		{
			std::lock_guard<std::mutex> lock(guard);
			if(!input_queue.pop(input)) break;
		}

		(void)pointer.input(input.x,input.y,input.pressed);
	}
}

void process_view_socket(uint32_t generation)
{
	std::lock_guard<std::mutex> lock(guard);
	if(peer_changed)
	{
		reset();
		state=State::waiting;
		peer_changed=false;
	}

	if(state==State::idle) return;

	const auto client=peer.lock();
	if(!client)
	{
		reset();
		return;
	}

	if(lv_tick_elaps(started)>=10000)
	{
		client->invalidate();
		reset();
		return;
	}

	if(state==State::waiting)
	{
		display_update_scene(generation);
		plan=display_bands_since(since);
		if(!plan.mask)
		{
			if(lv_tick_elaps(started)>=3000 && send_text(*client,"idle")) reset();
			return;
		}

		band=__builtin_ctz(plan.mask);
		const auto first=band*display_band_rows;
		const auto last=31u-__builtin_clz(plan.mask);
		const auto height=last*display_band_rows+display_rows_in_band(last)-first;
		char header[128];
		std::snprintf(header,sizeof(header),"begin,%lu,%lu,0,%u,%u,%u,%u,%u,%zu,%u",
			(unsigned long)plan.revision,(unsigned long)plan.scene,first,display_width,display_height,
			display_width,height,display_band_bytes(plan.mask),unsigned(plan.full));
		if(!send_text(*client,header)) return;

		state=State::streaming;
	}

	if(plan.scene!=display_scene_id(generation))
	{
		if(send_text(*client,"cancel")) reset();
		return;
	}

	if(state==State::end)
	{
		if(send_text(*client,"end")) reset();
		return;
	}

	const auto y=band*display_band_rows;
	const auto rows=display_rows_in_band(band);
	if(!capturing)
	{
		capturing=display_capture_begin(y,rows,false,generation);
		return;
	}

	if(!packet)
	{
		if(!display_capture_poll(packet,packet_size,generation)) return;

		if(!packet)
		{
			if(send_text(*client,"cancel")) reset();
			return;
		}

		const uint32_t remaining=plan.mask & (plan.mask-1);
		// The retained capture is owned by this socket until sendCopy succeeds.
		write_packet(packet,
			{uint32_t(packet_size-packet_header_bytes),plan.revision,plan.scene,0,uint16_t(y),display_width,
			 uint16_t(rows),display_width,display_height,rgb565_le,remaining?uint16_t(0):last_packet},true);
	}

	if(!send(*client,packet,packet_size,true)) return;

	display_capture_release();
	capturing=false;
	packet=nullptr;
	plan.mask&=plan.mask-1;
	if(plan.mask) band=__builtin_ctz(plan.mask);
	else state=State::end;
}
