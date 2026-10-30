// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/data_registry.hpp"
#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace lab_data
{
// Optional application adapter. Registry and this object share the UI context;
// call process after flush. No HTTP/WebSocket implementation or core changes.
	class Events
	{
	public:
		// Return false for transport backpressure; the latest snapshot is retried.
		// Bytes are borrowed during this call and must be copied before retention.
		using Emit = std::function<bool (const uint8_t *, size_t)>;
		Events(lvgl_cbor::DataRegistry &, std::vector<std::string> sources, Emit,
		    size_t max_frame_bytes = 3584);
		Events(const Events &) = delete;
		Events &operator=(const Events &) = delete;
		bool begin(std::string &error);
		void process(int64_t monotonic_us);
		uint32_t rejected_frames() const
		{
			return rejected_;
		}

	private:
		struct Entry { std::string source; bool dirty = true; lvgl_cbor::DataRegistry::Subscription watch; };
		lvgl_cbor::DataRegistry &data_;
		std::vector<Entry> entries_;
		Emit emit_;
		size_t max_frame_bytes_;
		int64_t next_emit_us_ = 0;
		uint32_t rejected_ = 0;
		bool active_ = false;
	};
} // namespace lab_data
