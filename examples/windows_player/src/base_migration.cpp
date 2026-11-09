// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "base_migration.hpp"
#include "cbor.h"
#include <algorithm>
#include <chrono>
#include <fstream>
using namespace lvgl_cbor;
namespace
{
	bool fail(std::string &error, const char *message)
	{
		error = message; return false;
	}

	bool read_packet(const std::filesystem::path &path, size_t limit, std::vector<uint8_t> &bytes, std::string &error)
	{
		std::ifstream file(path, std::ios::binary | std::ios::ate);
		if(!file) return fail(error, "project_recovery_file_open");

		const auto size = file.tellg(); if(size <= 0 || size > std::streamoff(limit))
			return fail(error, "project_recovery_size");

		bytes.resize(size_t(size)); file.seekg(0);
		return bool(file.read(reinterpret_cast<char *>(bytes.data()), size)) || fail(error,
		           "project_recovery_file_read");
	}

	bool base_metadata(const ProjectSource &source, ProjectLimits limits, std::vector<uint8_t> &packet,
	    std::string &revision, std::string &id, std::string &error)
	{
		MemoryProjectStore empty; ProjectService project(source, &empty, {}, limits);
		if(!project.begin(error)) return false;

		const auto status = project.status(); revision = status.base_revision; id = status.id;
		packet = encode_project(project.snapshot());
		return packet.size() <= limits.bytes || fail(error, "project_base_cache_size");
	}

	bool overlay_base(const std::vector<uint8_t> &bytes, std::string &revision, std::string &error)
	{
		CborParser parser; CborValue root, field; char text[17]; size_t length = sizeof(text);
		if(cbor_parser_init(bytes.data(), bytes.size(), 0, &parser,
		    &root) != CborNoError || !cbor_value_is_map(&root) ||
		    cbor_value_map_find_value(&root, "base", &field) != CborNoError || !cbor_value_is_text_string(&field) ||
		    cbor_value_copy_text_string(&field, text, &length, nullptr) != CborNoError || length != 16)
			return fail(error, "project_base_cache_metadata");

		revision.assign(text, length);
		return std::all_of(revision.begin(), revision.end(), [](char c){
			return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
		}) ||
		       fail(error, "project_base_cache_metadata");
	}

	bool cache_base(const std::string &prefix, const std::string &revision, const std::vector<uint8_t> &packet,
	    ProjectLimits limits, std::string &error)
	{
		const auto name = prefix + ".base." + revision;
		FileProjectStore cache(name, "desktop-base-cache"); std::vector<uint8_t> previous;
		if(!cache.load(previous, limits.bytes, error))
		{
			if(error != "project_store_corrupt") return false;

			// This is a reproducible cache, never the owner's changes store. Preserve
			// torn cache banks as evidence and reconstruct only from a verified base.
			std::error_code ec;
			const auto tag = std::to_string(std::chrono::steady_clock::now().time_since_epoch().count());
			for(unsigned slot = 0; slot < 2; ++slot)
			{
				const auto bank = std::filesystem::u8path(name + "." + std::to_string(slot));
				if(!std::filesystem::exists(bank, ec))
				{
					if(ec)
						return fail(error, "project_base_cache_stat");

					continue;
				}

				std::filesystem::rename(bank,
				    std::filesystem::u8path(name + ".torn." + tag + "." + std::to_string(slot)), ec);
				if(ec) return fail(error, "project_base_cache_preserve");
			}
			if(!cache.load(previous, limits.bytes, error)) return false;
		}

		if(!previous.empty())
		{
			ConstProjectSource source(previous.data(), previous.size()); std::vector<uint8_t> canonical;
			std::string hash, id;
			if(!base_metadata(source, limits, canonical, hash, id, error) || hash != revision || canonical != packet)
				return fail(error, "project_base_cache_mismatch");

			return true;
		}

		return cache.commit(packet, error);
	}

}
WindowsProjectStore::WindowsProjectStore(const std::filesystem::path &prefix, ProjectLimits limits)
  : prefix_(prefix.u8string()), limits_(limits), disk_(prefix_, "desktop-filesystem")
{
}

bool WindowsProjectStore::prepare(const ProjectSource &source, const std::filesystem::path &recovery,
    std::string &error)
{
	std::vector<uint8_t> current, changes; std::string revision, identity;
	if(!base_metadata(source, limits_, current, revision, identity, error) || !disk_.load(changes, limits_.bytes,
	    error)) return false;

	MemoryProjectStore existing; existing.commit(changes, error); ProjectService probe(source, &existing, {}, limits_);
	if(probe.begin(error)) return cache_base(prefix_, revision, current, limits_, error);

	if(error != "project_base_mismatch") return false;

	std::string expected; if(!overlay_base(changes, expected, error)) return false;

	FileProjectStore cached(prefix_ + ".base." + expected, "desktop-base-cache"); std::vector<uint8_t> old;
	if(!cached.load(old, limits_.bytes, error))
	{
		if(error != "project_store_corrupt" || recovery.empty()) return false;

		old.clear();
	}

	if(old.empty() && (recovery.empty() || !read_packet(recovery, limits_.bytes, old, error)))
		return fail(error, "project_base_mismatch_recovery_required");

	ConstProjectSource previous_source(old.data(), old.size()); std::vector<uint8_t> canonical;
	std::string old_revision, old_identity;
	if(!base_metadata(previous_source, limits_, canonical, old_revision, old_identity, error)) return false;

	if(old_revision != expected) return fail(error, "project_recovery_base_mismatch");

	if(old_identity != identity) return fail(error, "project_recovery_identity_mismatch");

	// begin/export only: the old project's LVGL screens and events are never run.
	MemoryProjectStore legacy_changes; legacy_changes.commit(changes, error);
	ProjectService legacy(previous_source, &legacy_changes, {}, limits_); if(!legacy.begin(error)) return false;

	auto effective = encode_project(legacy.snapshot());
	MemoryProjectStore rebased; ProjectService next(source, &rebased, {}, limits_);
	if(!next.begin(error) || !next.save_project({effective.data(), effective.size(), {}}, error, next.revision()) ||
	    !rebased.load(staged_, limits_.bytes, error)) return false;

	// Immutable revision-addressed caches close both crash windows: before the
	// overlay commit the old base remains, after it the new base is already durable.
	if(!cache_base(prefix_, old_revision, canonical, limits_, error) || !cache_base(prefix_, revision, current, limits_,
	    error)) return false;

	migrating_ = true; error.clear(); return true;
}

bool WindowsProjectStore::load(std::vector<uint8_t> &bytes, size_t limit, std::string &error)
{
	if(!migrating_) return disk_.load(bytes, limit, error);

	if(staged_.size() > limit) return fail(error, "project_store_size");

	bytes = staged_; return true;
}

bool WindowsProjectStore::commit(const std::vector<uint8_t> &bytes, std::string &error)
{
	if(migrating_) return fail(error, "project_migration_not_activated");

	return disk_.commit(bytes, error);
}

bool WindowsProjectStore::finalize(std::string &error)
{
	if(!migrating_) return true;

	if(!disk_.commit(staged_, error)) return false;

	staged_.clear(); migrating_ = false; return true;
}
