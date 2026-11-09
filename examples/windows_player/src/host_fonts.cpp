// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "host_fonts.hpp"
#include <windows.h>
#include <filesystem>
#include <fstream>
#include <stdexcept>

HostFonts::HostFonts()
{
	wchar_t directory[MAX_PATH]{};
	if(!GetWindowsDirectoryW(directory, MAX_PATH)) throw std::runtime_error("Cannot locate Windows fonts");

	auto path = std::filesystem::path(directory) / "Fonts" / "segoeui.ttf";
	std::ifstream file(path, std::ios::binary | std::ios::ate);
	auto size = file ? file.tellg() : std::streampos(-1);
	if(size <= 0 || size > 8 * 1024 * 1024) throw std::runtime_error("Segoe UI font is unavailable");

	bytes_.resize(size_t(size)); file.seekg(0);
	if(!file.read(reinterpret_cast<char *>(bytes_.data()), size)) throw std::runtime_error("Cannot read Segoe UI");

	small_ = lv_tiny_ttf_create_data(bytes_.data(), bytes_.size(), 20);
	large_ = lv_tiny_ttf_create_data(bytes_.data(), bytes_.size(), 28);
	compact_ = lv_tiny_ttf_create_data(bytes_.data(), bytes_.size(), 14);
	lv_font_glyph_dsc_t glyph{};
	if(!small_ || !large_ || !compact_ || !lv_font_get_glyph_dsc(small_, &glyph, 0x041d, 0) || glyph.is_placeholder)
	{
		lv_tiny_ttf_destroy(small_); lv_tiny_ttf_destroy(large_); lv_tiny_ttf_destroy(compact_);
		throw std::runtime_error("Cyrillic font initialization failed");
	}

	// Segoe UI provides text; LVGL's bundled font supplies private-use symbols.
	small_->fallback = &lv_font_montserrat_20;
	large_->fallback = &lv_font_montserrat_28;
	compact_->fallback = &lv_font_montserrat_14;

}

HostFonts::~HostFonts()
{
	lv_tiny_ttf_destroy(small_); lv_tiny_ttf_destroy(large_); lv_tiny_ttf_destroy(compact_);
}
