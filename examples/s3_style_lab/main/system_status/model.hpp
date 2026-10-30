// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include <cstdint>

namespace lab_system
{
// Synchronization validity belongs to this boot's application service, not to
// a plausible-looking RTC date. Wall-clock corrections never affect sync age.
	struct ClockHistory {
		bool synchronized{};
		int64_t last_sync_us{};
		void confirm(int64_t monotonic_us)
		{
			synchronized = true; last_sync_us = monotonic_us;
		}

		uint64_t age_seconds(int64_t monotonic_us) const
		{
			return synchronized && monotonic_us > last_sync_us ?
			       static_cast<uint64_t>((monotonic_us - last_sync_us) / 1000000) : 0;
		}

		const char *state(bool connected, bool service_ready, bool error) const
		{
			if(error)  return "error";

			if(!service_ready)  return "unavailable";

			if(!synchronized)  return connected ? "syncing" : "unsynced";

			return connected ? "synchronized" : "holdover";
		}

	};
} // namespace lab_system
