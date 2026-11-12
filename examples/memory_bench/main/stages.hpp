// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once

#if BENCH_PROFILE >= 6
#include "lvgl_cbor/data_registry.hpp"
#include "lvgl_cbor/data_history.hpp"
#endif
#if BENCH_PROFILE >= 7
#include "appearance.hpp"
#include "appearance.generated.hpp"
#endif
#if BENCH_PROFILE >= 9
#include "esp_spiffs.h"
#include <algorithm>
#include <cstring>
#include "lvgl_cbor/project_service.hpp"
#endif
#if BENCH_PROFILE >= 10
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "nvs_flash.h"
#include "freertos/event_groups.h"
#if __has_include("wifi_secret.hpp")
#include "wifi_secret.hpp"
#else
#define STYLE_LAB_WIFI_SSID ""
#define STYLE_LAB_WIFI_PASSWORD ""
#endif
#endif
#if BENCH_PROFILE >= 11
#include "data_api.hpp"
#include "project_api.hpp"
#include "lvgl_cbor/capabilities.hpp"
#include <NaWServer/backends/esp_idf_memory.h>
#include <NaWServer/backends/esp_idf_tcp.h>
#include <NaWServer/backends/tcp.h>
#include <NaWServer/http_server.h>
#include <NaWServer/route.h>
#endif
#if BENCH_PROFILE >= 12
#include "assets.generated.hpp"
#endif
#if BENCH_PROFILE >= 13
#include "frame_api.hpp"
#endif

namespace
{
#if BENCH_PROFILE >= 5 && BENCH_PROFILE < 9
	struct PageBytes { const uint8_t *data; size_t size; };

	class FlashPages final : public lvgl_cbor::ScreenResolver
	{
	public:
		FlashPages(PageBytes dashboard, PageBytes alternate, PageBytes released)
		  : dashboard_(dashboard), alternate_(alternate), released_(released)
		{
		}

		bool resolve_screen(const std::string &name, const uint8_t *&packet, size_t &size) const override
		{
			const auto *data = name == "dashboard" ? &dashboard_ :
			    name == "alternate" ? &alternate_ : name == "released" ? &released_ : nullptr;
			if(!data) return false;

			packet = data->data;
			size = data->size;
			return true;
		}

	private:
		PageBytes dashboard_, alternate_, released_;
	};
#endif

#if BENCH_PROFILE >= 6
	void check(bool ok, const char *operation, const std::string &error)
	{
		if(ok) return;

		std::printf("BENCH_ERROR operation=%s detail=%s\n", operation, error.c_str());
		std::abort();
	}
#endif

#if BENCH_PROFILE >= 9
	constexpr const char *fs_path = "/bench/bench-layout-v1.cbor";

	void mount_benchmark_fs()
	{
		esp_vfs_spiffs_conf_t config{};
		config.base_path = "/bench";
		config.partition_label = "project";
		config.max_files = 6;
		config.format_if_mount_failed = false;
		ESP_ERROR_CHECK(esp_vfs_spiffs_register(&config));
	}

	bool existing_layout_matches(const uint8_t *bytes, size_t size)
	{
		auto *file = std::fopen(fs_path, "rb");
		if(!file) return false;

		uint8_t chunk[256];
		size_t offset{};
		while(offset < size)
		{
			const auto length = std::min(sizeof(chunk), size - offset);
			if(std::fread(chunk, 1, length, file) != length ||
			    std::memcmp(bytes + offset, chunk, length)) break;

			offset += length;
		}
		const bool same = offset == size && std::fgetc(file) == EOF && !std::ferror(file);
		std::fclose(file);
		return same;
	}

	void provision_benchmark_file(const uint8_t *bytes, size_t size)
	{
		if(existing_layout_matches(bytes, size)) return;

		const char *pending = "/bench/bench-layout-v1.tmp";
		auto *file = std::fopen(pending, "wb");
		if(!file) std::abort();

		const size_t written = std::fwrite(bytes, 1, size, file);
		const int closed = std::fclose(file);
		if(written != size || closed) std::abort();

		// SPIFFS rename rejects an existing destination.
		(void)std::remove(fs_path);
		if(std::rename(pending, fs_path)) std::abort();
	}
#endif

#if BENCH_PROFILE >= 10
	EventGroupHandle_t network{};
	constexpr EventBits_t has_ip = 1;

	void network_event(void *, esp_event_base_t base, int32_t id, void *)
	{
		if(base == WIFI_EVENT && (id == WIFI_EVENT_STA_START || id == WIFI_EVENT_STA_DISCONNECTED))
			(void)esp_wifi_connect();

		if(base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) xEventGroupSetBits(network, has_ip);
	}

	bool start_wifi(void (*mark)(const char *))
	{
		ESP_ERROR_CHECK(nvs_flash_init());
		ESP_ERROR_CHECK(esp_netif_init());
		ESP_ERROR_CHECK(esp_event_loop_create_default());
		auto *netif = esp_netif_create_default_wifi_sta();
		network = xEventGroupCreate();
		if(!netif || !network) std::abort();

		mark("netif_ready");
		wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
		ESP_ERROR_CHECK(esp_wifi_init(&init));
		mark("wifi_initialized");
		ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));
		ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
		const bool credentials = STYLE_LAB_WIFI_SSID[0] != '\0';
		if(credentials)
		{
			wifi_config_t config{};
			strlcpy(reinterpret_cast<char *>(config.sta.ssid), STYLE_LAB_WIFI_SSID, sizeof(config.sta.ssid));
			strlcpy(reinterpret_cast<char *>(config.sta.password), STYLE_LAB_WIFI_PASSWORD, sizeof(config.sta.password));
			ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &config));
			ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, network_event, nullptr));
			ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, network_event, nullptr));
		}

		ESP_ERROR_CHECK(esp_wifi_start());
		mark("wifi_started");
		if(!credentials) return false;

		const auto ready = xEventGroupWaitBits(network, has_ip, pdFALSE, pdFALSE, pdMS_TO_TICKS(20000));
		if(!(ready & has_ip)) return false;

		esp_netif_ip_info_t address{};
		ESP_ERROR_CHECK(esp_netif_get_ip_info(netif, &address));
		std::printf("BENCH_IP " IPSTR "\n", IP2STR(&address.ip));
		mark("wifi_connected");
		return true;
	}
#endif

#if BENCH_PROFILE >= 11
	NaWServer::TcpOptions http_options()
	{
		NaWServer::TcpOptions options;
		options.port = 80;
		options.bind_address = "0.0.0.0";
#if CONFIG_NAWSERVER_TCP_MANAGED
		options.http_memory.enabled = true;
		options.http_memory.initial_requests = 2;
		options.http_memory.maximum_requests = 3;
		options.managed.ingress_slots = 2;
		options.managed.header_bytes = 4096;
		options.managed.response_header_bytes = 768;
		options.managed.response_body_bytes = 4096;
		options.managed.io_slice_bytes = 4096;
		options.keep_alive.enabled = false;
		options.buffer_memory.allocator = NaWServer::espIdfBufferAllocator(NaWServer::EspIdfMemoryPolicy::PreferPsram);
		options.buffer_memory.max_bytes = 256 * 1024;
#endif
		return options;
	}
#endif

#if BENCH_PROFILE >= 12
	class EditorAssets final : public NaWServer::HandlerBase
	{
	public:
		EditorAssets()
		{
			size_t index{};
			for(const auto &asset : assets) descriptors_[index++].path = asset.path;
		}

		NaWServer::RouteDescriptors routes() const override
		{
			return {descriptors_, sizeof(assets) / sizeof(assets[0])};
		}

		void handleRequest(NaWServer::Request *request, NaWServer::Response &response) override
		{
			for(const auto &asset : assets)
			{
				if(request->path() != asset.path) continue;

				(void)response.header("Content-Encoding", "gzip");
				(void)response.sendImmutable(200, asset.mime, {asset.data, asset.size});
				return;
			}
		}

	private:
		NaWServer::RouteDescriptor descriptors_[sizeof(assets) / sizeof(assets[0])]{};
	};
#endif
}
