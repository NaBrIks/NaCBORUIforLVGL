// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/project_service.hpp"
#include "project.generated.hpp"
#include "esp_spiffs.h"
#include "esp_log.h"

// Board/application configuration, outside the portable ProjectService.
// ROM base + exactly one filesystem catalog layer. Change these paths/backends for SD.
namespace lab_project
{
	inline lvgl_cbor::ConstProjectSource base(initial_project_packet, sizeof(initial_project_packet));
	inline lvgl_cbor::CatalogProjectStore changes("/project");
	inline constexpr lvgl_cbor::ProjectPolicy policy{true, true, true};
	inline constexpr lvgl_cbor::ProjectLimits limits{262144, 128};
// The mounted filesystem is reported by changes.storage_info(). SD is not configured;
// this is not a statement about physical card presence.
	inline const std::vector<lvgl_cbor::ProjectStorageInfo> media{
		{"RAM", "", false, true, "available"},
		{"SD", "", true, false, "not-configured"}
	};
	inline void mount()
	{
		esp_vfs_spiffs_conf_t config{}; config.base_path = "/project"; config.partition_label = "project";
		config.max_files = 4; config.format_if_mount_failed = false;
		const auto result = esp_vfs_spiffs_register(&config);
		changes.enabled(result == ESP_OK);
		if(result != ESP_OK)
		{
			ESP_LOGE("project_fs", "Mount failed: %s; ROM project read-only (no auto-format)", esp_err_to_name(result));
			return;
		}

		size_t total{}, used{}; esp_spiffs_info("project", &total, &used);
		ESP_LOGI("project_fs", "Mounted /project; usable %u, used %u bytes", unsigned(total), unsigned(used));
	}

} // namespace lab_project
