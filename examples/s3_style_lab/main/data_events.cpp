#include "data_events.hpp"
#include <set>
#include <utility>

namespace lab_data {
Events::Events(lvgl_cbor::DataRegistry &data, std::vector<std::string> sources, Emit emit,
               size_t max_frame_bytes)
    : data_(data), emit_(std::move(emit)), max_frame_bytes_(max_frame_bytes) {
  for (auto &source : sources) entries_.push_back({std::move(source), true, {}});
}
bool Events::begin(std::string &error) {
  if (active_) return true;
  if (!emit_ || entries_.size() > data_.limits().sources || max_frame_bytes_ == 0) {
    error = "data_events_options"; return false;
  }
  std::set<std::string> unique;
  for (const auto &entry : entries_)
    if (!data_.source(entry.source) || !unique.insert(entry.source).second) {
      error = "data_events_source"; return false;
    }
  for (size_t i = 0; i < entries_.size(); ++i) {
    entries_[i].watch = data_.observe({entries_[i].source}, [this, i] { entries_[i].dirty = true; });
    if (!entries_[i].watch) {
      for (auto &entry : entries_) entry.watch = {};
      error = "data_events_observe"; return false;
    }
  }
  active_ = true; return true;
}
void Events::process(int64_t monotonic_us) {
  if (!active_ || monotonic_us < next_emit_us_) return;
  bool attempted = false;
  for (auto &entry : entries_) {
    if (!entry.dirty) continue;
    attempted = true;
    lvgl_cbor::DataState state;
    const auto *value = data_.read(entry.source, {}, &state);
    const char *status = state == lvgl_cbor::DataState::Known ? "known"
                       : state == lvgl_cbor::DataState::Stale ? "stale" : "unknown";
    auto bytes = lvgl_cbor::encode_data_value(lvgl_cbor::DataValue::Object{
        {"v", 1}, {"event", "data_changed"}, {"source", entry.source}, {"state", status},
        {"revision", data_.revision()}, {"value", value ? *value : lvgl_cbor::DataValue{}}});
    entry.dirty = false;
    if (bytes.empty() || bytes.size() > max_frame_bytes_) { ++rejected_; continue; }
    if (!emit_(bytes.data(), bytes.size())) entry.dirty = true;
  }
  // Slow or disconnected consumers receive the latest state, never a backlog.
  if (attempted) next_emit_us_ = monotonic_us + 100000;
}
} // namespace lab_data
