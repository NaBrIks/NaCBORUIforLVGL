// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/project_service.hpp"
#include <filesystem>

// Windows-only durable base upgrade. All overlay interpretation and rebasing stay
// in ProjectService. A staged overlay becomes durable only after UI activation.
class WindowsProjectStore final : public lvgl_cbor::ProjectStore
{
	std::string prefix_;
	lvgl_cbor::ProjectLimits limits_;
	lvgl_cbor::FileProjectStore disk_;
	std::vector<uint8_t> staged_;
	bool migrating_{};
public:
	WindowsProjectStore(const std::filesystem::path &, lvgl_cbor::ProjectLimits);
	bool prepare(const lvgl_cbor::ProjectSource &, const std::filesystem::path &recovery, std::string &error);
	bool finalize(std::string &error);
	bool load(std::vector<uint8_t> &, size_t, std::string &) override;
	bool commit(const std::vector<uint8_t> &, std::string &) override;
	bool persistent() const override
	{
		return true;
	}

	const char *description() const override
	{
		return disk_.description();
	}

	lvgl_cbor::ProjectStorageInfo storage_info() const override
	{
		return disk_.storage_info();
	}

};
