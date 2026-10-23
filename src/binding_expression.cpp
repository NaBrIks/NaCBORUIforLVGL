#include "binding_expression.hpp"
#include <cmath>
namespace lvgl_cbor::detail {
namespace {
const DataValue *field(const DataValue &v, const char *k) {
  auto o = std::get_if<DataValue::Object>(&v.value);
  if (!o)
    return nullptr;
  auto i = o->find(k);
  return i == o->end() ? nullptr : &i->second;
}
bool fail(std::string &e, const char *s) {
  e = s;
  return false;
}
bool keys(const DataValue::Object &o, std::initializer_list<const char *> allowed) {
  for (const auto &x : o) {
    bool found = false;
    for (auto k : allowed)
      found = found || x.first == k;
    if (!found)
      return false;
  }
  return true;
}
bool validate(const DataValue &v, DataRegistry &r, bool event, std::set<std::string> &deps,
              std::string &e, size_t depth, size_t &nodes) {
  if (depth > binding_contract::expressionDepth || ++nodes > binding_contract::expressionNodes)
    return fail(e, "binding_expression_limit");
  if (auto a = std::get_if<DataValue::Array>(&v.value)) {
    for (const auto &x : *a)
      if (!validate(x, r, event, deps, e, depth + 1, nodes))
        return false;
    return true;
  }
  auto o = std::get_if<DataValue::Object>(&v.value);
  if (!o)
    return fail(e, "binding_expression_object");
  if (auto l = field(v, "literal")) {
    auto bytes = encode_data_value(*l);
    DataValue checked;
    if (o->size() != 1 ||
        !decode_data_value(bytes.data(), bytes.size(), checked, e, r.limits().value_bytes))
      return fail(e, "binding_literal");
    return true;
  }
  if (auto source = field(v, "source")) {
    auto name = std::get_if<std::string>(&source->value);
    DataPath path;
    if (!keys(*o, {"source", "path"}) || !name || !r.source(*name))
      return fail(e, "binding_source_unknown");
    if (auto p = field(v, "path"))
      if (!binding_path(*p, path, e))
        return false;
    if (!data_schema_path(r.source(*name)->schema, path))
      return fail(e, "binding_source_path");
    deps.insert(*name);
    return true;
  }
  if (auto value = field(v, "event")) {
    auto name = std::get_if<std::string>(&value->value);
    return (event && o->size() == 1 && name && *name == "value") || fail(e, "binding_event_value");
  }
  if (auto object = field(v, "object")) {
    auto fields = std::get_if<DataValue::Object>(&object->value);
    if (o->size() != 1 || !fields || fields->size() > binding_contract::objectFields)
      return fail(e, "binding_object");
    for (const auto &x : *fields)
      if (x.first.size() > 63 || !validate(x.second, r, event, deps, e, depth + 1, nodes))
        return false;
    return true;
  }
  auto operation = field(v, "op"), arguments = field(v, "args");
  auto op = operation ? std::get_if<std::string>(&operation->value) : nullptr;
  auto args = arguments ? std::get_if<DataValue::Array>(&arguments->value) : nullptr;
  if (!op || !args || !keys(*o, {"op", "args"}) || o->size() != 2)
    return fail(e, "binding_operator");
  bool found = false;
  for (const auto &entry : binding_contract::operators)
    if (*op == entry.name)
      found = args->size() >= entry.min_args && args->size() <= entry.max_args;
  if (!found)
    return fail(e, "binding_operator_arity");
  for (const auto &x : *args)
    if (!validate(x, r, event, deps, e, depth + 1, nodes))
      return false;
  return true;
}
bool number(const DataValue &v, double &n) {
  if (auto p = std::get_if<int64_t>(&v.value)) {
    n = double(*p);
    return true;
  }
  if (auto p = std::get_if<double>(&v.value)) {
    n = *p;
    return std::isfinite(n);
  }
  return false;
}
BindingValue num(double n, std::string &e) {
  if (!std::isfinite(n)) {
    e = "binding_nonfinite";
    return {};
  }
  if (n == 0)
    n = 0;
  if (std::trunc(n) == n && n >= -9007199254740991.0 && n <= 9007199254740991.0)
    return {true, int64_t(n)};
  return {true, n};
}
} // namespace
bool binding_path(const DataValue &v, DataPath &path, std::string &e) {
  auto a = std::get_if<DataValue::Array>(&v.value);
  if (!a || a->size() > binding_contract::pathDepth)
    return fail(e, "binding_path");
  path.clear();
  for (const auto &x : *a) {
    if (auto s = std::get_if<std::string>(&x.value)) {
      if (s->empty() || s->size() > 63)
        return fail(e, "binding_path_key");
      path.emplace_back(*s);
    } else if (auto n = std::get_if<int64_t>(&x.value)) {
      if (*n < 0 || uint64_t(*n) > SIZE_MAX)
        return fail(e, "binding_path_index");
      path.emplace_back(size_t(*n));
    } else
      return fail(e, "binding_path_token");
  }
  return true;
}
bool validate_expression(const DataValue &v, DataRegistry &r, bool event,
                         std::set<std::string> &deps, std::string &e) {
  size_t nodes = 0;
  return validate(v, r, event, deps, e, 1, nodes);
}
BindingValue evaluate_expression(const DataValue &v, DataRegistry &r, const DataValue *event,
                                 std::string &e) {
  if (auto a = std::get_if<DataValue::Array>(&v.value)) {
    DataValue::Array out;
    for (const auto &x : *a) {
      auto value = evaluate_expression(x, r, event, e);
      if (!value.known)
        return {};
      out.push_back(std::move(value.value));
    }
    return {true, std::move(out)};
  }
  if (auto l = field(v, "literal"))
    return {true, *l};
  if (auto source = field(v, "source")) {
    DataPath path;
    if (auto p = field(v, "path"))
      if (!binding_path(*p, path, e))
        return {};
    auto name = std::get_if<std::string>(&source->value);
    auto value = name ? r.read(*name, path) : nullptr;
    return value ? BindingValue{true, *value} : BindingValue{};
  }
  if (field(v, "event"))
    return event ? BindingValue{true, *event} : BindingValue{};
  if (auto object = field(v, "object")) {
    DataValue::Object out;
    for (const auto &x : std::get<DataValue::Object>(object->value)) {
      auto value = evaluate_expression(x.second, r, event, e);
      if (!value.known)
        return {};
      out[x.first] = std::move(value.value);
    }
    return {true, std::move(out)};
  }
  const auto &op = std::get<std::string>(field(v, "op")->value);
  const auto &args = std::get<DataValue::Array>(field(v, "args")->value);
  if (op == "select") {
    auto test = evaluate_expression(args[0], r, event, e);
    if (!test.known)
      return {};
    auto b = std::get_if<bool>(&test.value.value);
    if (!b) {
      e = "binding_boolean";
      return {};
    }
    return evaluate_expression(args[*b ? 1 : 2], r, event, e);
  }
  if (op == "and" || op == "or") {
    bool unknown = false;
    for (const auto &x : args) {
      auto v = evaluate_expression(x, r, event, e);
      if (!v.known) {
        unknown = true;
        continue;
      }
      auto b = std::get_if<bool>(&v.value.value);
      if (!b) {
        e = "binding_boolean";
        return {};
      }
      if (op == "and" && !*b)
        return {true, false};
      if (op == "or" && *b)
        return {true, true};
    }
    return unknown ? BindingValue{} : BindingValue{true, op == "and"};
  }
  auto a = evaluate_expression(args[0], r, event, e);
  if (!a.known)
    return {};
  if (op == "not") {
    auto b = std::get_if<bool>(&a.value.value);
    if (!b) {
      e = "binding_boolean";
      return {};
    }
    return {true, !*b};
  }
  double x, y;
  if (op == "round") {
    if (!number(a.value, x)) {
      e = "binding_number";
      return {};
    }
    return num(std::round(x), e);
  }
  auto b = evaluate_expression(args[1], r, event, e);
  if (!b.known)
    return {};
  if (op == "eq" || op == "ne") {
    if (std::holds_alternative<DataValue::Array>(a.value.value) ||
        std::holds_alternative<DataValue::Object>(a.value.value) ||
        std::holds_alternative<DataValue::Array>(b.value.value) ||
        std::holds_alternative<DataValue::Object>(b.value.value)) {
      e = "binding_scalar_compare";
      return {};
    }
    bool equal = a.value == b.value;
    return {true, op == "eq" ? equal : !equal};
  }
  if (op == "lt" || op == "le" || op == "gt" || op == "ge") {
    int c;
    if (number(a.value, x) && number(b.value, y))
      c = x < y ? -1 : x > y ? 1 : 0;
    else {
      auto l = std::get_if<std::string>(&a.value.value),
           rr = std::get_if<std::string>(&b.value.value);
      if (!l || !rr) {
        e = "binding_compare_type";
        return {};
      }
      c = l->compare(*rr);
    }
    return {true, op == "lt" ? c < 0 : op == "le" ? c <= 0 : op == "gt" ? c > 0 : c >= 0};
  }
  if (!number(a.value, x) || !number(b.value, y)) {
    e = "binding_number";
    return {};
  }
  if (op == "div" && y == 0) {
    e = "binding_divide_zero";
    return {};
  }
  return num(op == "add" ? x + y : op == "sub" ? x - y : op == "mul" ? x * y : x / y, e);
}
} // namespace lvgl_cbor::detail
