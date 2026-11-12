// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "appearance.hpp"
#include <fstream>
#include <stdexcept>
void load_appearance_file(Appearance &appearance, const std::filesystem::path &path,
    const std::string &initial, const lvgl_cbor::Resource *resources, size_t count)
{
	std::ifstream file(path, std::ios::binary | std::ios::ate);
	const auto size = file ? file.tellg() : std::streampos(-1);
	if(size <= 0 || size > 256 * 1024) throw std::runtime_error("Appearance file size");

	auto bytes = std::make_shared<std::vector<uint8_t> >(size_t(size)); file.seekg(0);
	if(!file.read(reinterpret_cast<char *>(bytes->data()), size)) throw std::runtime_error("Appearance file read");

	std::string error;
	if(!appearance.load({bytes->data(), bytes->size(), bytes}, initial, resources, count, error))
		throw std::runtime_error(error);
}
