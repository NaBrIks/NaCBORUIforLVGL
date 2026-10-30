// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "style_dispatch.hpp"
#include "cbor_reader.hpp"
#include <cstring>
#include <tuple>
#include <type_traits>
#include <utility>
namespace lvgl_cbor::detail {
namespace {
struct StyleDecodeContext {
  const Resource *resources;
  size_t resource_count;
  StyleStorage *storage;
};
// Resource relocation is instance-specific. Names/types belong to the application
// resource registry, not to the function-pointer tables.
template <class T> const char *resource_type();
#define RESOURCE_TYPE(T)                                                                           \
  template <> const char *resource_type<T>() {                                                     \
    return #T;                                                                                     \
  }
RESOURCE_TYPE(const void *)
RESOURCE_TYPE(const int32_t *)
RESOURCE_TYPE(const lv_anim_t *)
RESOURCE_TYPE(const lv_color_filter_dsc_t *)
RESOURCE_TYPE(const lv_font_t *)
RESOURCE_TYPE(const lv_grad_dsc_t *)
RESOURCE_TYPE(const lv_image_colorkey_t *)
RESOURCE_TYPE(const lv_style_transition_dsc_t *)
#undef RESOURCE_TYPE

bool read_tracks(const CborValue &value, StyleStorage &storage, const int32_t *&pointer) {
  size_t count;
  CborValue it;
  if (cbor_value_get_array_length(&value, &count) != CborNoError || count > style_grid_max_tracks ||
      storage.values + count + 1 > style_storage_values ||
      cbor_value_enter_container(&value, &it) != CborNoError)
    return false;
  std::vector<int32_t> array;
  array.reserve(count + 1);
  for (size_t i = 0; i < count; ++i) {
    int64_t n;
    if (!integer(it, n) || cbor_value_advance(&it) != CborNoError)
      return false;
    array.push_back(int32_t(n));
  }
  array.push_back(LV_GRID_TEMPLATE_LAST);
  storage.values += array.size();
  storage.tracks.push_back(std::move(array));
  pointer = storage.tracks.back().data();
  return true;
}

template <class T> bool read_argument(const CborValue &value, T &out, StyleDecodeContext &context) {
  if constexpr (std::is_same_v<T, bool>) {
    return cbor_value_is_boolean(&value) && cbor_value_get_boolean(&value, &out) == CborNoError;
  } else if constexpr (std::is_same_v<T, lv_color_t>) {
    int64_t n;
    if (!integer(value, n))
      return false;
    out = lv_color_hex(uint32_t(n));
    return true;
  } else if constexpr (std::is_pointer_v<T>) {
    if constexpr (std::is_same_v<T, const int32_t *>) {
      if (context.storage && cbor_value_is_array(&value))
        return read_tracks(value, *context.storage, out);
    }
    char name[64];
    if (!text(value, name, sizeof(name)))
      return false;
    for (size_t i = 0; i < context.resource_count; ++i) {
      const auto &resource = context.resources[i];
      if (!std::strcmp(resource.name, name) && !std::strcmp(resource.type, resource_type<T>()) &&
          resource.value) {
        out = static_cast<T>(resource.value);
        return true;
      }
    }
    return false;
  } else {
    int64_t n;
    if (!integer(value, n))
      return false;
    out = static_cast<T>(n);
    return true;
  }
}

template <class... A, size_t... I>
bool read_arguments(const CborValue &value, std::tuple<A...> &args, StyleDecodeContext &context,
                    std::index_sequence<I...>) {
  if constexpr (sizeof...(A) == 1) {
    return read_argument(value, std::get<0>(args), context);
  } else {
    size_t count;
    CborValue it;
    if (!cbor_value_is_array(&value) ||
        cbor_value_get_array_length(&value, &count) != CborNoError || count != sizeof...(A) ||
        cbor_value_enter_container(&value, &it) != CborNoError)
      return false;
    return (
        (read_argument(it, std::get<I>(args), context) && cbor_value_advance(&it) == CborNoError) &&
        ...);
  }
}

template <class... A, size_t N>
bool invoke(void (*const (&methods)[N])(lv_style_t *, A...), unsigned index, lv_style_t *target,
            const CborValue &value, StyleDecodeContext &context) {
  if (index >= N || !methods[index])
    return false;
  std::tuple<A...> args;
  if (!read_arguments(value, args, context, std::index_sequence_for<A...>{}))
    return false;
  std::apply([&](A... values) { methods[index](target, values...); }, args);
  return true;
}
#include "style_methods.inc"
} // namespace

bool apply_style_methods(const CborValue &map, lv_style_t *target, const Resource *resources,
                         size_t resource_count, StyleResult &out, StyleStorage *storage) {
  out = {};
  auto fail = [&](const char *error) {
    out.error = error;
    out.count = 0;
    return false;
  };
  size_t count;
  CborValue it;
  if (!cbor_value_is_map(&map) || cbor_value_get_map_length(&map, &count) != CborNoError ||
      count > 256 || cbor_value_enter_container(&map, &it) != CborNoError)
    return fail("methods_map");
  StyleDecodeContext context{resources, resource_count, storage};
  for (size_t i = 0; i < count; ++i) {
    int64_t opcode;
    if (!integer(it, opcode) || opcode < 0 || opcode > 65535)
      return fail("opcode");
    out.opcode = uint16_t(opcode);
    if (cbor_value_advance(&it) != CborNoError)
      return fail("method_value");
    if (!execute_style(unsigned(opcode) >> 8, unsigned(opcode) & 255, target, it, context))
      return fail("style_operation");
    ++out.count;
    if (cbor_value_advance(&it) != CborNoError)
      return fail("method_advance");
  }
  return cbor_value_at_end(&it) || fail("method_count");
}
} // namespace lvgl_cbor::detail
