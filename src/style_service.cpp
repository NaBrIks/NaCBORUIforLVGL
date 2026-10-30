// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "lvgl_cbor/style_service.hpp"
#include "lvgl_cbor/style_runtime.hpp"
#include <cstring>

namespace lvgl_cbor {
StyleValue::StyleValue() {
  lv_style_init(&value);
}
StyleValue::~StyleValue() {
  lv_style_reset(&value);
}
void StyleValue::compose(const StyleValue &source, bool copy) {
  if (this == &source)
    return;
  if (copy) {
    lv_style_copy(&value, &source.value);
    retained.clear();
  } else
    lv_style_merge(&value, &source.value);
  retained.push_back(source.storage);
  retained.insert(retained.end(), source.retained.begin(), source.retained.end());
}
void StyleValue::replace(const StyleValue &source) {
  if (this == &source)
    return;
  lv_style_copy(&value, &source.value);
  storage = source.storage;
  retained = source.retained;
  lv_obj_report_style_change(&value);
}
StyleHandle StyleScope::find(const std::string &name) const {
  const auto it = styles_.find(name);
  return it == styles_.end() ? StyleHandle{} : StyleHandle{&it->second->value, it->second};
}
std::shared_ptr<StyleValue> StyleScope::put(const std::string &name, const StyleValue &source) {
  auto it = styles_.find(name);
  if (it == styles_.end()) {
    if (styles_.size() >= capacity_)
      return {};
    it = styles_.emplace(name, std::make_shared<StyleValue>()).first;
    it->second->id = name;
  }
  it->second->replace(source);
  return it->second;
}
bool StyleScope::adopt(const std::string &name, const std::shared_ptr<StyleValue> &value) {
  if (styles_.count(name) || styles_.size() >= capacity_)
    return false;
  styles_.emplace(name, value);
  return true;
}
size_t StyleScope::trim_unused() {
  size_t count = 0;
  for (auto it = styles_.begin(); it != styles_.end();) {
    if (it->second.use_count() == 1) {
      it = styles_.erase(it);
      ++count;
    } else
      ++it;
  }
  return count;
}
StyleService::StyleService(const Resource *resources, size_t count, size_t capacity)
    : globals_(capacity) {
  register_static("base", &base_.value);
  for (size_t i = 0; i < count; ++i)
    if (resources[i].value && !std::strcmp(resources[i].type, "const lv_style_t *"))
      register_static(resources[i].name, static_cast<const lv_style_t *>(resources[i].value));
}
bool StyleService::register_static(const char *name, const lv_style_t *value) {
  if (!name || !*name || !value || static_.count(name))
    return false;
  static_.emplace(name, value);
  return true;
}
StyleHandle StyleService::resolve(const std::string &reference,
                                  const std::shared_ptr<StyleScope> &screen) const {
  const auto separator = reference.find(':');
  const auto scope = separator == std::string::npos ? "" : reference.substr(0, separator);
  const auto name = separator == std::string::npos ? reference : reference.substr(separator + 1);
  if (name.empty() || name.find(':') != std::string::npos)
    return {};
  if ((scope.empty() || scope == "screen") && screen) {
    auto found = screen->find(name);
    if (found || scope == "screen")
      return found;
  }
  if (scope.empty() || scope == "global" || scope == "global-dynamic") {
    auto found = globals_.find(name);
    if (found || scope == "global-dynamic")
      return found;
  }
  if (scope.empty() || scope == "global" || scope == "global-static") {
    const auto it = static_.find(name);
    if (it != static_.end()) {
      if (it->second == &base_.value && !base_ready_) {
        lv_style_set_text_color(&base_.value, lv_color_white());
        lv_style_set_text_font(&base_.value, LV_FONT_DEFAULT);
        base_ready_ = true;
      }
      return {it->second, {}};
    }
  }
  return {};
}
std::shared_ptr<StyleValue> StyleService::put_global(const std::string &name,
                                                     const StyleValue &source) {
  return globals_.put(name, source);
}
std::shared_ptr<StyleScope> StyleService::create_scope(size_t capacity) const {
  return std::make_shared<StyleScope>(capacity);
}
void StyleService::cache_scope(const std::string &key, const std::shared_ptr<StyleScope> &scope) {
  if (scope && scope->size())
    cache_[key] = scope;
}
std::shared_ptr<StyleScope> StyleService::cached_scope(const std::string &key) const {
  auto it = cache_.find(key);
  return it == cache_.end() ? nullptr : it->second;
}
size_t StyleService::trim_unused() {
  size_t count = globals_.trim_unused();
  for (auto it = cache_.begin(); it != cache_.end();) {
    if (it->second.use_count() == 1) {
      it = cache_.erase(it);
      ++count;
    } else
      ++it;
  }
  return count;
}
} // namespace lvgl_cbor
