// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "demo_data.hpp"
#include <cmath>
#include <ctime>
using namespace lvgl_cbor;
#if LVGL_CBOR_HAS_HISTORY
namespace
{
	const std::string history_source = "demo.level_history";
	const std::string plot_source = "demo.level_plot";
}
#endif
DemoData::DemoData()
#if LVGL_CBOR_HAS_HISTORY
  : history(registry)
#endif
{}

bool DemoData::begin(std::string &error)
{
	using S = DataSchema;
	if(!registry.add_group({"demo", "Demo controls", "Autonomous speed and editable example values", {}}, error)) return false;
	if(!registry.add_group({"system", "System", "Host-provided system information", {}}, error)) return false;
#if LVGL_CBOR_HAS_HISTORY
	if(!registry.add_group({"history", "Sample history", "Optional bounded time-series sampling", {}}, error)) return false;
#endif
	auto speed = S::number(0, 180);
	speed.title = "Speed";
	speed.description = "Smooth autonomous demonstration signal";
	speed.unit = "km/h";
	if(!registry.add_source({"demo.speed", S::object({{"kmh", speed},
									 {"unit", S::text(8)}, {"sequence", S::integer(0)}}), {}, "Demo speed",
	                             "Autonomous 25 Hz speed generator, independent of the displayed page", "demo"},
	    error)) return false;
	if(!registry.add_source({"demo.running", S::boolean(),
	                             [this](const DataPath &, const DataValue &value, std::string &e) {
									 running_ = std::get<bool>(value.value);
									 return registry.publish("demo.running", running_, e);
								 }, "Speed generator enabled",
	                             "Controls speed generation; history and system sampling remain independent", "demo"},
	    error)) return false;
	if(!registry.add_source({"demo.clicks", S::integer(0), {}, "Click counter",
	                             "Confirmed result of the step and reset actions", "demo"}, error)) return false;
	auto local_time = S::text(8);
	local_time.title = "Local time";
	local_time.description = "Current host-local time in HH:mm:ss format";
	if(!registry.add_source({"system.clock", S::object({{"localTime", local_time}}), {},
	                             "Clock", "System wall clock supplied by the platform", "system"}, error)) return false;
	for(auto source : std::vector<DataSource>{
		{"demo.level", S::integer(0, 100), {}, "Level", "Editable level; also sampled by optional history", "demo"},
		{"demo.checked", S::boolean(), {}, "Checkbox", "Confirmed editable checkbox state", "demo"},
		{"demo.choice", S::integer(0, 2), {}, "Choice", "Editable selection index from zero to two", "demo"},
		{"demo.text", S::text(128), {}, "Text", "Editable bounded UTF-8 text", "demo"}})
	{
		const auto name = source.name;
		source.write = [this, name](const DataPath &, const DataValue &value, std::string &e) {
				return registry.publish(name, value, e);
			};
		if(!registry.add_source(std::move(source), error)) return false;
	}
	if(!registry.publish("demo.level", 65, error)) return false;
	if(!registry.publish("demo.checked", true, error)) return false;
	if(!registry.publish("demo.choice", 0, error)) return false;
	if(!registry.publish("demo.text", "Текст", error)) return false;
	if(!registry.add_action({"demo.step", S::integer(1, 100),
	                             [this](const DataValue &value, std::string &e) {
									 clicks_ += std::get<int64_t>(value.value);
									 return registry.publish("demo.clicks", clicks_, e);
								 }, "Increment counter", "Add the positive integer argument to the click counter",
	                             "demo"}, error)) return false;
	if(!registry.add_action({"demo.reset", S::null(),
	                             [this](const DataValue &, std::string &e) {
									 clicks_ = 0;
									 return registry.publish("demo.clicks", clicks_, e);
								 }, "Reset counter", "Set the click counter to zero", "demo"}, error)) return false;
#if LVGL_CBOR_HAS_HISTORY
	DataHistoryConfig samples;
	samples.source = "demo.level";
	samples.output = history_source;
	samples.group = "history";
	samples.title = "Level / 200 ms";
	samples.description = "Thirty-two latest-value time slots; null gaps and valid-point mean";
	samples.unit = "%";
	samples.capacity = 32;
	samples.period_ms = 200;
	if(!history.add(std::move(samples), error)) return false;
	if(!registry.add_source({plot_source, S::object({{"label", S::text(255)},
									 {"history", S::array(S::integer(-1, 100), 32, 32)}}), {}, "Level plot adapter",
	                             "Example-only conversion to the registered percent plot; -1 denotes an undrawn point",
	                             "history"}, error)) return false;
	if(!registry.add_source({"demo.history_enabled", S::boolean(),
	                             [this](const DataPath &, const DataValue &value, std::string &e) {
									 const bool enabled = std::get<bool>(value.value);
									 const bool was_enabled = history.enabled();
// Reserve the confirmed flag before mutating sampler state. At a full
// snapshot budget this may fail; the running sampler must stay unchanged.
									 if(!registry.publish("demo.history_enabled", enabled, e)) return false;

									 if((!enabled && !registry.invalidate(plot_source,
									 e)) || !history.set_enabled(enabled, e))
									 {
										 const std::string failure = e;
										 std::string ignored;
										 // This replaces the same one-byte pending bool, so it fits the
										 // reservation above and preserves the original command error.
										 (void)registry.publish("demo.history_enabled", was_enabled, ignored);
										 e = failure;
										 return false;
									 }

									 if(!enabled || !was_enabled) history_plot_known_ = false;

									 return true;
								 }, "History enabled", "Disabling frees sample rings; enabling starts a fresh timeline",
	                             "history"}, error)) return false;
	if(!history.set_enabled(true, error)) return false;
	if(!registry.publish("demo.history_enabled", true, error)) return false;
#endif
	if(!registry.publish("demo.running", true, error)) return false;
	if(!registry.publish("demo.clicks", 0, error)) return false;
	return tick(error);
}

#if LVGL_CBOR_HAS_HISTORY
bool DemoData::publish_history_plot(std::string &error)
{
	const auto *value = registry.read(history_source);
	if(!value)
	{
		if(history_plot_known_)
		{
			history_plot_known_ = false;
			return registry.invalidate(plot_source, error);
		}

		return true;
	}

	const auto &object = std::get<DataValue::Object>(value->value);
	const auto time = uint64_t(std::get<int64_t>(object.at("timeMs").value));
	if(history_plot_known_ && time == history_plot_time_) return true;

	const auto &samples = std::get<DataValue::Array>(object.at("history").value);
	DataValue::Array points;
	points.reserve(samples.size());
	for(const auto &sample : samples)
	{
		int point = -1;
		if(const auto *number = std::get_if<double>(&sample.value))
		{
			if(std::isfinite(*number) && *number >= 0 && *number <= 100)
				point = int(std::lround(*number));
		}
		else if(const auto *integer = std::get_if<int64_t>(&sample.value))
		{
			if(*integer >= 0 && *integer <= 100) point = int(*integer);
		}

		points.emplace_back(point);
	}
	// The engine sees only the existing native component payload. This adapter
	// is deliberately example-owned, and serializes only once per new time slot.
	const auto bytes = encode_data_value(DataValue::Object{
		{"label", object.at("label")}, {"history", std::move(points)}});
	if(!registry.publish_cbor(plot_source, bytes.data(), bytes.size(), error)) return false;

	history_plot_time_ = time;
	history_plot_known_ = true;
	return true;
}

#endif

bool DemoData::tick(std::string &error)
{
	const auto now = std::chrono::steady_clock::now();
	if(now < next_) return true;

	next_ = now + std::chrono::milliseconds(40);
	if(running_)
	{
		const double seconds = std::chrono::duration<double>(now - start_).count();
		speed_ = 90.0 * (1.0 - std::cos(seconds * 0.4));
		// Exercise the same CBOR ingress as an application/transport data adapter.
		const auto bytes = encode_data_value(DataValue::Object{{"kmh", speed_}, {"unit", "km/h"},
					{"sequence", ++sequence_}});
		if(!registry.publish_cbor("demo.speed", bytes.data(), bytes.size(), error)) return false;
	}

	std::time_t seconds = std::time(nullptr);
	std::tm local{};
#ifdef _WIN32
	localtime_s(&local, &seconds);
#else
	localtime_r(&seconds, &local);
#endif
	char text[9]{};
	std::strftime(text, sizeof(text), "%H:%M:%S", &local);
	if(clock_ != text)
	{
		if(!registry.publish("system.clock", DataValue::Object{{"localTime", text}}, error)) return false;
		clock_ = text;
	}

	registry.flush();
#if LVGL_CBOR_HAS_HISTORY
	const auto monotonic_ms = uint64_t(std::chrono::duration_cast<std::chrono::milliseconds>(now - start_).count());
	if(!history.tick(monotonic_ms, error)) return false;

	registry.flush();
	if(!publish_history_plot(error)) return false;

	registry.flush();
#endif
	return true;
}
