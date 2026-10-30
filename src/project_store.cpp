// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "project_internal.hpp"
#include <cerrno>
#include <cstdio>
#include <cstring>
#include <limits>
#ifdef _WIN32
#include <io.h>
#else
#include <unistd.h>
#endif
namespace lvgl_cbor
{
	using namespace project_detail;
	namespace
	{
		bool read_file(const std::string &path, std::vector<uint8_t> &out, size_t max_bytes, bool &missing,
		    std::string &error)
		{
			missing = false; FILE *file = std::fopen(path.c_str(), "rb");
			if(!file)
			{
				missing = errno == ENOENT; if(missing)
				{
					out.clear(); return true;
				}

				return fail(error, "project_file_open");
			}

			uint8_t block[1024]; bool ok = true; out.clear();
			for(;;)
			{
				const size_t count = std::fread(block, 1, sizeof(block), file); if(count > max_bytes - out.size())
				{
					ok = false; break;
				}

				out.insert(out.end(), block, block + count); if(count < sizeof(block))
				{
					ok = !std::ferror(file); break;
				}
			}
			if(std::fclose(file))  ok = false;

			return ok || fail(error, "project_file_read_or_size");
		}

		uint64_t number(const uint8_t *bytes)
		{
			uint64_t value{}; for(unsigned i = 0; i < 8; ++i)
				value = (value << 8) | bytes[i];
			return value;
		}

		void append(std::vector<uint8_t> &bytes, uint64_t value)
		{
			for(unsigned i = 8; i; --i)
				bytes.push_back(uint8_t(value >> ((i - 1) * 8)));
		}

		uint64_t checksum(const uint8_t *bytes, size_t size)
		{
			uint64_t hash = 14695981039346656037ULL; for(size_t i = 0; i < size; ++i)
			{
				hash ^= bytes[i]; hash *= 1099511628211ULL;
			}
			return hash;
		}

		bool unpack(const std::vector<uint8_t> &bytes, uint64_t &generation, std::vector<uint8_t> &payload)
		{
			if(bytes.size() < 32 || std::memcmp(bytes.data(), "LVPROJ01", 8))  return false;

			generation = number(bytes.data() + 8); const auto size = number(bytes.data() + 16);
			if(!generation || size != bytes.size() - 32 || checksum(bytes.data(),
			    bytes.size() - 8) != number(bytes.data() + bytes.size() - 8))  return false;

			payload.assign(bytes.begin() + 24, bytes.end() - 8); return true;
		}

	} // namespace
	bool FileProjectSource::read(ProjectBundle &out, std::string &error, ProjectLimits limits) const
	{
		std::vector<uint8_t> bytes; bool missing{}; if(!read_file(path_, bytes, limits.bytes, missing, error))
			return false;

		if(missing)  return fail(error, "project_base_missing");

		return parse_project(owned(std::move(bytes)), out, error, limits);
	}

	bool MemoryProjectStore::load(std::vector<uint8_t> &out, size_t max, std::string &error)
	{
		if(bytes_.size() > max)
			return fail(error, "project_store_size");

		out = bytes_; return true;
	}

	bool MemoryProjectStore::commit(const std::vector<uint8_t> &bytes, std::string &)
	{
		bytes_ = bytes; return true;
	}

	bool FileProjectStore::load(std::vector<uint8_t> &out, size_t max, std::string &error)
	{
		out.clear(); generation_ = 0; unsigned present = 0;
		for(unsigned slot = 0; slot < 2; ++slot)
		{
			std::vector<uint8_t> bytes, payload; bool missing{};
			if(!read_file(prefix_ + "." + std::to_string(slot), bytes, max + 32, missing, error))
				return false;

			if(missing)
				continue;

			++present; uint64_t generation{}; if(!unpack(bytes, generation, payload))
				continue;

			if(generation > generation_)
			{
				generation_ = generation; slot_ = slot; out = std::move(payload);
			}
		}
		if(present && !generation_)  return fail(error, "project_store_corrupt");

		loaded_ = true; return true;
	}

	bool FileProjectStore::commit(const std::vector<uint8_t> &payload, std::string &error)
	{
		if(!loaded_ || generation_ == std::numeric_limits<uint64_t>::max())
			return fail(error, "project_store_not_loaded");

		std::vector<uint8_t> bytes{'L', 'V', 'P', 'R', 'O', 'J', '0', '1'}; append(bytes, generation_ + 1);
		append(bytes, payload.size()); bytes.insert(bytes.end(), payload.begin(), payload.end());
		append(bytes, checksum(bytes.data(), bytes.size()));
		const unsigned next_slot = generation_ ? 1 - slot_ : 0;
		FILE *file = std::fopen((prefix_ + "." + std::to_string(next_slot)).c_str(), "wb"); if(!file)
			return fail(error, "project_file_open_write");

		bool ok = std::fwrite(bytes.data(), 1, bytes.size(), file) == bytes.size() && std::fflush(file) == 0;
#ifdef _WIN32
		if(ok)  ok = _commit(_fileno(file)) == 0;

#else
		if(ok)  ok = fsync(fileno(file)) == 0;

#endif
		if(std::fclose(file))  ok = false;

		if(!ok)  return fail(error, "project_file_commit");

		++generation_; slot_ = next_slot; return true;
	}

} // namespace lvgl_cbor
