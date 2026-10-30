// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "../../examples/s3_style_lab/main/data_events.hpp"
#include <cstdio>
#include <cstdlib>

using namespace lvgl_cbor;
static void require(bool ok, const char *why) {
  if (!ok) { std::fprintf(stderr, "FAILED: %s\n", why); std::exit(1); }
}
static const DataValue &field(const DataValue &value, const char *key) {
  return std::get<DataValue::Object>(value.value).at(key);
}
static double number(const DataValue &value) {
  if (auto real = std::get_if<double>(&value.value)) return *real;
  return double(std::get<int64_t>(value.value));
}
static void run() {
  DataRegistry data; std::string error;
  require(data.add_source({"value", DataSchema::number(0, 180)}, error), "source");
  std::vector<DataValue> frames;
  bool accepted = true;
  {
    lab_data::Events events(data, {"value"}, [&](const uint8_t *bytes, size_t size) {
      DataValue frame;
      require(decode_data_value(bytes, size, frame, error), "shared CBOR round trip");
      frames.push_back(std::move(frame)); return accepted;
    });
    require(events.begin(error), "begin");
    require(data.demand("value") == 1, "adapter subscription lifetime");
    events.process(0);
    require(frames.size() == 1 && std::get<std::string>(field(frames.back(), "state").value) == "unknown",
            "initial unknown state explicit");
    require(data.publish("value", 42.5, error), "publish");
    events.process(100000);
    require(frames.size() == 1, "pending uncommitted data is not emitted");
    data.flush(); events.process(100000);
    require(frames.size() == 2 && number(field(frames.back(), "value")) == 42.5,
            "committed value and CBOR event");
    require(std::get<std::string>(field(frames.back(), "event").value) == "data_changed", "event kind");
    for (int i = 0; i < 9; ++i) { require(data.publish("value", i + 0.5, error), "burst"); data.flush(); }
    events.process(150000); require(frames.size() == 2, "10 Hz throttle");
    events.process(200000);
    require(frames.size() == 3 && number(field(frames.back(), "value")) == 8.5,
            "burst coalesces to latest snapshot");
    events.process(300000); require(frames.size() == 3, "unchanged source is quiet");
    accepted = false; require(data.publish("value", 10.0, error), "backpressure publish"); data.flush();
    events.process(400000); require(frames.size() == 4, "transport attempt");
    require(data.publish("value", 11.0, error), "latest retry publish"); data.flush();
    accepted = true; events.process(500000);
    require(frames.size() == 5 && number(field(frames.back(), "value")) == 11.0,
            "backpressure retries latest snapshot");
    require(data.invalidate("value", error), "invalidate"); data.flush(); events.process(600000);
    require(std::get<std::string>(field(frames.back(), "state").value) == "unknown" &&
            std::holds_alternative<std::monostate>(field(frames.back(), "value").value), "invalidated value clears browser state");
    require(data.publish("value", 11.0, error, DataState::Stale), "stale publish"); data.flush(); events.process(700000);
    require(std::get<std::string>(field(frames.back(), "state").value) == "stale" &&
            std::holds_alternative<std::monostate>(field(frames.back(), "value").value), "stale state is explicit");
  }
  require(data.demand("value") == 0, "adapter teardown releases subscriptions");
  {
    lab_data::Events bounded(data, {"value"}, [](const uint8_t *, size_t) { return true; }, 8);
    require(bounded.begin(error), "bounded adapter"); bounded.process(0); bounded.process(100000);
    require(bounded.rejected_frames() == 1, "oversize frame rejected without retry storm");
  }
  std::puts("Data events: committed CBOR snapshots, initial/unknown states, coalescing, backpressure, bounds and teardown passed");
}
int main() {
  try { run(); }
  catch (const std::exception &error) { std::fprintf(stderr, "FAILED: %s\n", error.what()); return 1; }
}
