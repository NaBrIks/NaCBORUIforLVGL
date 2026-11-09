// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/data_registry.hpp"
#include "lvgl_cbor/project_service.hpp"
#include <string>
#include <filesystem>

// Windows transport serialization only. Storage, revisions, parsing and screen
// ownership stay in the same portable ProjectService used by the MCU adapter.
std::string windows_project_status_json(const lvgl_cbor::ProjectStatus &);
lvgl_cbor::DataValue windows_project_command(lvgl_cbor::ProjectService &, const lvgl_cbor::DataValue &);
void windows_data_command(lvgl_cbor::ProjectService *, lvgl_cbor::DataRegistry &, const lvgl_cbor::DataValue &);

// Production transport passes original CBOR through a private temporary file.
void windows_data_command_file(lvgl_cbor::ProjectService *, lvgl_cbor::DataRegistry &, const std::filesystem::path &);

// File-free HTTP adapter shares these same service operations with the bridge.
lvgl_cbor::DataValue windows_project_request(lvgl_cbor::ProjectService &, const lvgl_cbor::DataValue &,
    lvgl_cbor::ProjectBytes input = {}, std::vector<uint8_t> *output = nullptr);
void windows_data_command_packet(lvgl_cbor::ProjectService *, lvgl_cbor::DataRegistry &, const uint8_t *, size_t);
