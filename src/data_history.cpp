// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "lvgl_cbor/data_history.hpp"
#if LVGL_CBOR_HAS_HISTORY
#include <algorithm>
#include <cmath>
#include <limits>
#include <utility>
#include <vector>
namespace lvgl_cbor
{
	namespace
	{
		constexpr uint64_t max_time = 9007199254740991ULL;
		double gap()
		{
			return std::numeric_limits<double>::quiet_NaN();
		}

		bool fail(std::string &error, const char *message)
		{
			error = message;
			return false;
		}

		DataValue point(double value)
		{
			return std::isfinite(value) ? DataValue(value) : DataValue(nullptr);
		}

		double numeric(const DataValue *value)
		{
			if(!value) return gap();

			if(const auto *number = std::get_if<double>(&value->value))
				return std::isfinite(*number) ? *number : gap();

			if(const auto *integer = std::get_if<int64_t>(&value->value))
				return double(*integer);

			return gap();
		}

		DataSchema nullable_number(const std::string &unit)
		{
			auto schema = DataSchema::number();
			schema.nullable = true;
			schema.unit = unit;
			return schema;
		}

	}
	struct DataHistory::Impl {
		struct Channel {
			DataHistoryConfig config;
			std::vector<double> ring;
			size_t head{}, filled{};
			uint64_t next_due{}, time_ms{};
			bool started{};
			void reset(bool allocate)
			{
				head = filled = 0;
				next_due = time_ms = 0;
				started = false;
				if(allocate) ring.assign(config.capacity, gap());
				else std::vector<double>().swap(ring);
			}

			void append(double value)
			{
				ring[head] = value;
				head = (head + 1) % ring.size();
				filled = std::min(filled + 1, ring.size());
			}

			DataValue snapshot() const
			{
				DataValue::Array history;
				history.reserve(ring.size());
				for(size_t i = filled; i < ring.size(); ++i)
					history.emplace_back(nullptr);
				const size_t start = filled == ring.size() ? head : 0;
				double scale = 0;
				size_t valid = 0;
				for(size_t i = 0; i < filled; ++i)
				{
					const double value = ring[(start + i) % ring.size()];
					history.push_back(point(value));
					if(std::isfinite(value))
					{
						scale = std::max(scale, std::abs(value));
						++valid;
					}
				}
				DataValue mean(nullptr);
				if(valid)
				{
					double normalized = 0;
					if(scale)
					{
						for(size_t i = 0; i < filled; ++i)
						{
							const double value = ring[(start + i) % ring.size()];
							if(std::isfinite(value)) normalized += value / scale;
						}
					}

					mean = scale ? std::clamp(normalized / double(valid), -1.0, 1.0) * scale : 0.0;
				}

				return DataValue::Object{
					{"history", std::move(history)}, {"timeMs", time_ms},
					{"periodMs", config.period_ms}, {"count", filled}, {"mean", std::move(mean)},
					{"label", config.title.empty() ? config.output : config.title}};
			}

		};
		DataRegistry &registry;
		DataHistoryLimits limits;
		std::vector<Channel> channels;
		size_t points{};
		bool enabled{}, clock_set{};
		uint64_t last_tick{};
		Impl(DataRegistry &registry, DataHistoryLimits limits)
		  : registry(registry), limits(limits)
		{
			this->limits.channels = std::min(limits.channels, data_history_max_channels);
			this->limits.points = std::min(limits.points, data_history_max_points);
		}

	};
	DataHistory::DataHistory(DataRegistry &registry, DataHistoryLimits limits)
	  : impl_(std::make_unique<Impl>(registry, limits))
	{
	}

	DataHistory::~DataHistory()
	{
		std::string ignored;
		set_enabled(false, ignored);
	}

	bool DataHistory::add(DataHistoryConfig config, std::string &error)
	{
		auto &p = *impl_;
		if(p.channels.size() >= p.limits.channels) return fail(error, "history_channel_limit");

		if(!config.capacity || config.capacity > data_history_max_capacity ||
		    config.capacity > p.limits.points - p.points) return fail(error, "history_points_limit");

		if(!config.period_ms || config.period_ms > max_time) return fail(error, "history_period");

		if(config.source == config.output) return fail(error, "history_self_source");

		for(const auto &channel : p.channels)
			if(channel.config.output == config.source) return fail(error, "history_derived_input");

		const auto *source = p.registry.source(config.source);
		const auto *input = source ? data_schema_path(source->schema, config.path) : nullptr;
		if(!input || (input->type != DataSchema::Type::Integer && input->type != DataSchema::Type::Number))
			return fail(error, "history_numeric_source");

		const auto number = nullable_number(config.unit);
		DataSource output;
		output.name = config.output;
		output.title = config.title;
		output.description = config.description;
		output.group = config.group;
		output.schema = DataSchema::object({
			{"history", DataSchema::array(number, config.capacity, config.capacity)},
			{"timeMs", DataSchema::integer(0, double(max_time))},
			{"periodMs", DataSchema::integer(1, double(max_time))},
			{"count", DataSchema::integer(0, double(config.capacity))},
			{"mean", number}, {"label", DataSchema::text(128)}});
		if(!p.registry.add_source(std::move(output), error)) return false;

		Impl::Channel channel;
		channel.config = std::move(config);
		channel.reset(p.enabled);
		p.points += channel.config.capacity;
		p.channels.push_back(std::move(channel));
		error.clear();
		return true;
	}

	bool DataHistory::set_enabled(bool enabled, std::string &error)
	{
		auto &p = *impl_;
		if(enabled && p.enabled) { error.clear(); return true; }

		// Queue all invalidations before changing the sampler. Unknown snapshots
		// have no logical payload; a full payload budget still permits disable.
		if(!enabled)
		{
			for(const auto &channel : p.channels)
				if(!p.registry.invalidate(channel.config.output, error)) return false;
		}

		for(auto &channel : p.channels)
			channel.reset(enabled);
		p.enabled = enabled;
		p.clock_set = false;
		error.clear();
		return true;
	}

	bool DataHistory::tick(uint64_t monotonic_ms, std::string &error)
	{
		auto &p = *impl_;
		if(!p.enabled) { error.clear(); return true; }

		if(monotonic_ms > max_time) return fail(error, "history_time_range");

		if(p.clock_set && monotonic_ms < p.last_tick) return fail(error, "history_time_backwards");

		p.clock_set = true;
		p.last_tick = monotonic_ms;
		for(auto &channel : p.channels)
		{
			if(channel.started && monotonic_ms < channel.next_due) continue;

			const double value = numeric(p.registry.read(channel.config.source, channel.config.path));
			if(!channel.started)
			{
				channel.started = true;
				channel.time_ms = monotonic_ms;
			}
			else
			{
				const uint64_t due = (monotonic_ms - channel.next_due) / channel.config.period_ms + 1;
				if(due >= channel.ring.size())
				{
					std::fill(channel.ring.begin(), channel.ring.end(), gap());
					channel.head = 0;
					channel.filled = channel.ring.size();
				}
				else
				{
					for(uint64_t i = 1; i < due; ++i)
						channel.append(gap());
				}

				channel.time_ms = channel.next_due + (due - 1) * channel.config.period_ms;
			}

			channel.append(value);
			channel.next_due = channel.time_ms + channel.config.period_ms;
			if(!p.registry.publish(channel.config.output, channel.snapshot(), error)) return false;
		}
		error.clear();
		return true;
	}

	bool DataHistory::enabled() const
	{
		return impl_->enabled;
	}

	size_t DataHistory::channel_count() const
	{
		return impl_->channels.size();
	}

	size_t DataHistory::allocated_points() const
	{
		size_t total = 0;
		for(const auto &channel : impl_->channels)
			total += channel.ring.size();
		return total;
	}

} // namespace lvgl_cbor
#endif
