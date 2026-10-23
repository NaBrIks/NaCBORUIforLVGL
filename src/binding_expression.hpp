#pragma once
#include "lvgl_cbor/data_registry.hpp"
#include <set>
namespace lvgl_cbor::detail {
struct BindingValue {
  bool known{};
  DataValue value;
};
bool binding_path(const DataValue &, DataPath &, std::string &);
bool validate_expression(const DataValue &, DataRegistry &, bool event, std::set<std::string> &,
                         std::string &);
BindingValue evaluate_expression(const DataValue &, DataRegistry &, const DataValue *event,
                                 std::string &);
} // namespace lvgl_cbor::detail
