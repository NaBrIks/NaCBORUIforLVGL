// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "contract.hpp"
#include "lvgl.h"
#include <list>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace lvgl_cbor {
struct Resource;
struct StyleStorage {
  std::list<std::vector<int32_t>> tracks;
  size_t values{};
};
// A stable LVGL address and the storage borrowed by its current property values.
struct StyleValue {
  lv_style_t value;
  std::string id;
  std::shared_ptr<StyleStorage> storage = std::make_shared<StyleStorage>();
  std::vector<std::shared_ptr<StyleStorage>> retained;
  StyleValue();
  ~StyleValue();
  StyleValue(const StyleValue &) = delete;
  void compose(const StyleValue &source, bool copy);
  void replace(const StyleValue &source);
};
struct StyleHandle {
  const lv_style_t *value{};
  std::shared_ptr<StyleValue> owner;
  explicit operator bool() const {
    return value != nullptr;
  }
};
class StyleScope {
public:
  explicit StyleScope(size_t capacity = 256) : capacity_(capacity) {}
  StyleHandle find(const std::string &name) const;
  std::shared_ptr<StyleValue> put(const std::string &name, const StyleValue &source);
  bool adopt(const std::string &name, const std::shared_ptr<StyleValue> &value);
  size_t size() const {
    return styles_.size();
  }
  size_t trim_unused();

private:
  size_t capacity_;
  std::map<std::string, std::shared_ptr<StyleValue>> styles_;
};
enum class ScreenStyleRetention { Release, Cache };
// Application-owned service. All mutation and use occur in the serialized LVGL context.
// Resolution: screen -> dynamic global -> static global. Explicit references can select a tier.
// Resources/static styles outlive the service; the service outlives its runtimes.
class StyleService {
public:
  explicit StyleService(const Resource *resources = nullptr, size_t count = 0,
                        size_t global_capacity = global_style_capacity);
  bool register_static(const char *name, const lv_style_t *value);
  StyleHandle resolve(const std::string &reference,
                      const std::shared_ptr<StyleScope> &screen = {}) const;
  std::shared_ptr<StyleValue> put_global(const std::string &name, const StyleValue &source);
  std::shared_ptr<StyleScope> create_scope(size_t capacity = 256) const;
  void cache_scope(const std::string &key, const std::shared_ptr<StyleScope> &scope);
  std::shared_ptr<StyleScope> cached_scope(const std::string &key) const;
  size_t cached_scopes() const {
    return cache_.size();
  }
  size_t trim_unused();

private:
  mutable StyleValue base_;
  mutable bool base_ready_{};
  StyleScope globals_;
  std::map<std::string, const lv_style_t *> static_;
  std::map<std::string, std::shared_ptr<StyleScope>> cache_;
};
} // namespace lvgl_cbor
