// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "lvgl_cbor/data_history.hpp"
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <limits>
#include <string>
using namespace lvgl_cbor;
namespace
{
	void require(bool condition, const char *message)
	{
		if(!condition) { std::fprintf(stderr, "DataHistory: %s\n", message); std::abort(); }
	}

	DataHistoryConfig config(std::string output = "history", size_t capacity = 4)
	{
		DataHistoryConfig value;
		value.source = "value";
		value.output = std::move(output);
		value.capacity = capacity;
		value.period_ms = 1000;
		value.title = "A history";
		value.description = "Periodic latest numeric samples";
		value.unit = "u";
		return value;
	}

	void value(DataRegistry &data, DataValue next, DataState state = DataState::Known)
	{
		std::string error;
		require(data.publish("value", std::move(next), error, state), error.c_str());
		data.flush();
	}

	void tick(DataHistory &history, DataRegistry &data, uint64_t time)
	{
		std::string error;
		require(history.tick(time, error), error.c_str());
		data.flush();
	}

	const DataValue &field(DataRegistry &data, const char *name, const std::string &source = "history")
	{
		auto *result = data.read(source, {std::string(name)});
		require(result != nullptr, name);
		return *result;
	}

	const DataValue::Array &points(DataRegistry &data, const std::string &source = "history")
	{
		return std::get<DataValue::Array>(field(data, "history", source).value);
	}

	bool missing(const DataValue &sample)
	{
		return std::holds_alternative<std::monostate>(sample.value);
	}

	void expect_points(DataRegistry &data, std::initializer_list<DataValue> expected)
	{
		require(points(data) == DataValue::Array(expected), "chronological null-padded history");
	}

	void source(DataRegistry &data)
	{
		std::string error;
		require(data.add_source({"value", DataSchema::number()}, error), error.c_str());
	}

}
int main()
{
	std::string error;
	{
		DataRegistry data;
		source(data);
		value(data, 7);
		DataHistory history(data);
		require(history.add(config(), error), error.c_str());
		require(!history.enabled() && history.allocated_points() == 0, "disabled by default, no rings");
		tick(history, data, 1000);
		require(!data.read("history"), "no samples while disabled");
		require(history.set_enabled(true, error), error.c_str());
		require(history.allocated_points() == 4, "fixed ring allocated on enable");
		tick(history, data, 1000);
		expect_points(data, {nullptr, nullptr, nullptr, 7});
		require(field(data, "count") == DataValue(1), "filled slot count");
		require(field(data, "mean") == DataValue(7), "first mean");
		require(field(data, "periodMs") == DataValue(1000), "period metadata");
		require(field(data, "label") == DataValue("A history"), "plot label");
		tick(history, data, 1999);
		require(field(data, "count") == DataValue(1), "not sampled before due");
		tick(history, data, 2000);
		tick(history, data, 3000);
		expect_points(data, {nullptr, 7, 7, 7});
		require(field(data, "count") == DataValue(3), "constant values still sampled");
		tick(history, data, 6000);
		expect_points(data, {7, nullptr, nullptr, 7});
		require(field(data, "count") == DataValue(4), "missed slots count as filled");
		require(field(data, "mean") == DataValue(7), "mean ignores gaps");
		require(field(data, "timeMs") == DataValue(6000), "last due time");
		require(!history.tick(5999, error) && error == "history_time_backwards", "reject backwards clock");
		require(!history.tick(std::numeric_limits<uint64_t>::max(), error), "reject unsafe integer time");
		expect_points(data, {7, nullptr, nullptr, 7});
		tick(history, data, 1000000000000ULL);
		expect_points(data, {nullptr, nullptr, nullptr, 7});
		require(history.allocated_points() == 4, "huge time jump has bounded work and ring");
		require(history.set_enabled(false, error), error.c_str());
		require(history.allocated_points() == 0, "disable frees rings");
		data.flush();
		require(!data.read("history"), "disable invalidates output");
		value(data, 9);
		tick(history, data, 1000000010000ULL);
		require(!data.read("history") && history.allocated_points() == 0, "no hidden sampling while disabled");
		require(history.set_enabled(true, error), error.c_str());
		tick(history, data, 20);
		expect_points(data, {nullptr, nullptr, nullptr, 9});
		require(field(data, "count") == DataValue(1) && field(data, "timeMs") == DataValue(20),
		    "enable restarts timeline");
		require(data.source("history")->schema.fields.at("history").items->nullable, "nullable history schema");
		require(data.source("history")->schema.fields.at("mean").unit == "u", "series units exposed");
		require(!data.source("history")->write, "derived output readonly");
	}
	{
		DataRegistry data;
		source(data);
		DataHistory history(data);
		require(history.add(config(), error) && history.set_enabled(true, error), error.c_str());
		tick(history, data, 0);
		expect_points(data, {nullptr, nullptr, nullptr, nullptr});
		require(missing(field(data, "mean")), "no invented first value");
		value(data, 10);
		tick(history, data, 1000);
		value(data, 20, DataState::Stale);
		tick(history, data, 2000);
		value(data, 30);
		tick(history, data, 3000);
		expect_points(data, {nullptr, 10, nullptr, 30});
		require(field(data, "mean") == DataValue(20), "mean of valid points after recovery");
		require(data.invalidate("value", error), error.c_str());
		data.flush();
		tick(history, data, 4000);
		expect_points(data, {10, nullptr, 30, nullptr});
		value(data, -1);
		tick(history, data, 5000);
		expect_points(data, {nullptr, 30, nullptr, -1});
		require(field(data, "mean") == DataValue(14.5), "negative sample is data, not gap sentinel");
	}
	{
		DataRegistry data;
		source(data);
		value(data, std::numeric_limits<double>::max());
		DataHistory history(data);
		require(history.add(config(), error) && history.set_enabled(true, error), error.c_str());
		tick(history, data, 0);
		tick(history, data, 1000);
		require(field(data, "mean") == DataValue(std::numeric_limits<double>::max()), "mean avoids sum overflow");
		value(data, -std::numeric_limits<double>::max());
		tick(history, data, 2000);
		require(std::isfinite(std::get<double>(field(data, "mean").value)), "mixed extreme mean finite");
	}
	{
		DataRegistry data;
		source(data);
		require(data.add_source({"text", DataSchema::text()}, error), error.c_str());
		require(data.add_source({"object", DataSchema::object({{"level", DataSchema::integer()}})}, error),
		    error.c_str());
		DataHistory history(data, {2, 5});
		auto bad = config(); bad.capacity = 0;
		require(!history.add(bad, error), "zero capacity rejected");
		bad = config(); bad.capacity = 257;
		require(!history.add(bad, error), "hard capacity rejected");
		bad = config(); bad.period_ms = 0;
		require(!history.add(bad, error), "zero period rejected");
		bad = config(); bad.source = "text";
		require(!history.add(bad, error), "nonnumeric input rejected");
		bad = config(); bad.source = "absent";
		require(!history.add(bad, error), "unknown input rejected");
		bad = config(); bad.output = "value";
		require(!history.add(bad, error), "self source rejected");
		require(history.add(config("history", 3), error), error.c_str());
		require(!history.add(config("over_points", 3), error), "aggregate points budget");
		auto nested = config("object_history", 2); nested.source = "object"; nested.path = {std::string("level")};
		require(history.add(nested, error), error.c_str());
		require(!history.add(config("over_channels", 1), error), "channel limit");
		require(history.channel_count() == 2 && history.allocated_points() == 0, "failed add does not allocate");
		require(history.set_enabled(true, error), error.c_str());
		require(history.allocated_points() == 5, "aggregate allocation bounded");
	}
	{
		DataRegistry data;
		source(data);
		DataHistory history(data, {999, 99999});
		for(size_t i = 0; i < data_history_max_channels; ++i)
			require(history.add(config("history" + std::to_string(i), 1), error), error.c_str());
		require(!history.add(config("extra", 1), error), "custom limits cannot raise hard channel cap");
	}
	{
		DataRegistry data;
		source(data);
		DataHistory history(data, {999, 99999});
		for(size_t i = 0; i < 4; ++i)
			require(history.add(config("history" + std::to_string(i), 256), error), error.c_str());
		require(!history.add(config("extra", 1), error), "custom limits cannot raise hard points cap");
		require(history.set_enabled(true, error), error.c_str());
		require(history.allocated_points() == data_history_max_points, "hard allocation cap");
	}
	{
		size_t full_budget = 0;
		{
			DataRegistry reference;
			source(reference);
			value(reference, 1);
			DataHistory sampler(reference);
			require(sampler.add(config("history", 1), error) && sampler.set_enabled(true, error), error.c_str());
			tick(sampler, reference, 0);
			full_budget = encode_data_value(*reference.read("value")).size() +
			    encode_data_value(*reference.read("history")).size();
		}
		DataLimits limits;
		limits.snapshot_bytes = full_budget;
		DataRegistry data(limits);
		source(data);
		value(data, 1);
		DataHistory sampler(data);
		require(sampler.add(config("history", 1), error) && sampler.set_enabled(true, error), error.c_str());
		tick(sampler, data, 0);
		require(data.read("history") != nullptr, "history fills exact logical snapshot budget");
		require(sampler.set_enabled(false, error), "disable at full budget must not need payload space");
		require(!sampler.enabled() && sampler.allocated_points() == 0, "disable at full budget frees ring");
		data.flush();
		require(!data.read("history") && *data.read("value") == DataValue(1),
		    "full-budget invalidation preserves original source");
	}
	std::puts(
		"DataHistory: periodic constants, missing/stale gaps, bounded time jumps, means, limits and enable lifecycle passed");
}
