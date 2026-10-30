// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "../../src/binding_expression.hpp"
#include "lvgl_cbor/contract.hpp"
#include "lvgl_cbor/data_registry.hpp"
#include "lvgl_cbor/screen_runtime.hpp"
#include "lvgl_cbor/widget_execution.hpp"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iterator>
#include <limits>
using namespace lvgl_cbor;
using A = DataValue::Array;
using O = DataValue::Object;
static void require(bool ok, const char *why) {
  if (!ok) {
    std::fprintf(stderr, "FAILED: %s\n", why);
    std::exit(1);
  }
}
static DataValue literal(DataValue v) {
  return O{{"literal", std::move(v)}};
}
static DataValue ref(const char *source, A path = {}) {
  return O{{"source", source}, {"path", std::move(path)}};
}
static DataValue op(const char *name, A args) {
  return O{{"op", name}, {"args", std::move(args)}};
}
static size_t max_storage{}, calls{};
static std::function<void()> native_callback;
static std::function<void()> reader_callback;
static bool reader_result = true;
static size_t reader_calls{};
static bool delete_native_screen{};
static bool borrowed(lv_obj_t *obj, uint16_t method, CborValue &cursor, WidgetContext &ctx) {
  if (method != 256)
    return false;
  const char *text;
  if (!execution::read(cursor, text, ctx) || cbor_value_advance(&cursor) != CborNoError)
    return false;
  max_storage = std::max(max_storage, ctx.storage.bytes);
  ++calls;
  lv_obj_set_user_data(obj, const_cast<char *>(text));
  if (delete_native_screen) {
    lv_obj_delete(lv_obj_get_screen(obj));
    return true;
  }
  if (native_callback)
    native_callback();
  return true;
}
static bool native_event(lv_obj_t *obj, lv_event_t *, DataValue &v) {
  require(obj != nullptr, "event reader never receives a deleted object");
  ++reader_calls;
  v = 37;
  if (reader_callback)
    reader_callback();
  return reader_result;
}
static std::vector<uint8_t> packet(bool invalid = false, const char *navigation = nullptr) {
  A children{A{0, 1, A{A{1, "text"}, A{256, "static"}}}, A{0, 9, A{DataValue(A{1, "toggle"})}},
             A{0, 2, A{DataValue(A{1, "button"})}},
             A{0, A{256, "borrow-1"}, A{DataValue(A{1, "borrow"})}}};
  children.emplace_back(A{0, 1, A{DataValue(A{1, "numeric"})}});
  A root;
  root.emplace_back(A{1, "root"});
  for (auto &x : children)
    root.push_back(x);
  A bindings{O{{"node", "text"},
               {"method", 256},
               {"value", ref("sensor", A{"pressure"})},
               {"format", O{{"precision", 1}, {"suffix", " PSI"}}}},
             O{{"node", "toggle"},
               {"method", 10},
               {"value", A{literal(int(LV_STATE_CHECKED)), ref("enabled")}}},
             O{{"node", "borrow"}, {"method", 256}, {"value", ref("name")}, {"format", O{}}},
             O{{"node", "text"},
               {"method", 10},
               {"value", A{literal(4096), op("gt", A{ref("sensor", A{"pressure"}),
                                                     ref("sensor", A{"threshold"})})}}}};
  bindings.emplace_back(
      O{{"node", "numeric"}, {"method", 256}, {"value", ref("general")}, {"format", O{}}});
  bindings.emplace_back(O{{"node", "root"},
                          {"method", 11},
                          {"value", A{literal(int(LV_OBJ_FLAG_CLICKABLE)), ref("enabled")}}});
  A events{O{{"node", "toggle"},
             {"event", "value_changed"},
             {"write", O{{"source", "enabled"}, {"path", A{}}}},
             {"value", O{{"event", "value"}}}},
           O{{"node", "button"},
             {"event", "clicked"},
             {"action", "click"},
             {"args", O{{"object", O{{"threshold", ref("sensor", A{"threshold"})},
                                     {"enabled", literal(true)}}}}}},
           O{{"node", "borrow"},
             {"event", "clicked"},
             {"action", "native"},
             {"args", O{{"event", "value"}}}}};
  events.emplace_back(O{{"node", "borrow"},
                        {"event", "clicked"},
                        {"action", "native-object"},
                        {"args", O{{"object", O{{"literal", O{{"event", "value"}}}}}}}});
  if (navigation) {
    auto &event = std::get<O>(events[1].value);
    event["action"] = navigation;
    event["args"] = literal(nullptr);
  }
  if (invalid)
    std::get<O>(bindings[0].value)["value"] = ref("missing");
  return encode_data_value(O{{"v", 3},
                             {"kind", "screen"},
                             {"id", "bindings"},
                             {"abi", screen_contract_sha256},
                             {"style_abi", contract_sha256},
                             {"name", "bound"},
                             {"size", A{800, 480}},
                             {"theme", false},
                             {"styles", A{}},
                             {"root", A{0, 0, std::move(root)}},
                             {"bindings_version", 1},
                             {"bindings", std::move(bindings)},
                             {"events", std::move(events)}});
}
int main(int argc, char **argv) {
  std::string error;
  DataRegistry data;
  int writes = 0, clicks = 0, native_calls = 0;
  int object_calls = 0;
  require(
      data.add_source(
          {"sensor",
           DataSchema::object(
               {{"pressure", DataSchema::number()},
                {"threshold", DataSchema::number()},
                {"rows", DataSchema::array(DataSchema::object({{"v", DataSchema::integer()}}), 4)},
                {"a.b", DataSchema::text(20)}})},
          error),
      error.c_str());
  require(data.add_source({"enabled", DataSchema::boolean(),
                           [&](const DataPath &, const DataValue &, std::string &e) {
                             ++writes;
                             e = "application refused";
                             return false;
                           }},
                          error),
          error.c_str());
  require(data.add_source({"name", DataSchema::text(80)}, error), error.c_str());
  require(data.add_source({"general", DataSchema::number()}, error), error.c_str());
  require(data.add_source({"notready", DataSchema::integer()}, error), error.c_str());
  require(data.add_action({"click",
                           DataSchema::object({{"threshold", DataSchema::number()},
                                               {"enabled", DataSchema::boolean()}}),
                           [&](const DataValue &v, std::string &) {
                             require(data_path(v, {std::string("threshold")}) != nullptr,
                                     "object event args");
                             ++clicks;
                             return true;
                           }},
                          error),
          error.c_str());
  require(data.add_action({"native", DataSchema::integer(),
                           [&](const DataValue &v, std::string &) {
                             require(v == DataValue(37), "native reader value");
                             ++native_calls;
                             return true;
                           }},
                          error),
          error.c_str());
  require(!data.add_source({"name", DataSchema::text()}, error), "duplicate source");
  require(!data.add_source({"bad-title", DataSchema::text(), {}, std::string(129, 'x')}, error),
          "source metadata title bound");
  require(!data.add_action({"bad-title", DataSchema::null(),
                            [](const DataValue &, std::string &) { return true; },
                            std::string("bad\0title", 9)},
                           error),
          "action metadata embedded NUL rejected");
  require(
      data.add_action({"native-object", DataSchema::object({{"literal", DataSchema::integer()}}),
                       [&](const DataValue &v, std::string &) {
                         require(*data_path(v, {std::string("literal")}) == DataValue(37),
                                 "object field named literal still extracts event");
                         ++object_calls;
                         return true;
                       }},
                      error),
      error.c_str());
  {
    DataRegistry roots;
    require(roots.add_source({"array", DataSchema::array(DataSchema::integer(), 3)}, error),
            error.c_str());
    require(roots.add_source({"null", DataSchema::null()}, error), error.c_str());
    require(roots.add_source({"number", DataSchema::number()}, error), error.c_str());
    require(roots.add_source({"threshold", DataSchema::number()}, error), error.c_str());
    require(!roots.observe({"number"}, {}), "empty observer callback rejected");
    int observed = 0;
    auto observation = roots.observe({"number", "threshold"}, [&]() {
      ++observed;
      auto n = roots.read("number"), t = roots.read("threshold");
      if (n && t)
        require(*n == DataValue(9) && *t == DataValue(8),
                "batch observer sees both committed values");
    });
    require(roots.publish("array", A{0, 1, 2}, error) && roots.publish("null", nullptr, error) &&
                roots.publish("number", 9, error) && roots.publish("threshold", 8, error),
            error.c_str());
    roots.flush();
    require(observed == 1 && roots.read("array", {size_t(0)}) &&
                *roots.read("null") == DataValue(nullptr),
            "scalar array and known null roots");
    auto revision = roots.revision();
    require(roots.publish("number", 9.0, error), error.c_str());
    roots.flush();
    require(observed == 1 && roots.revision() == revision,
            "same numeric int double value skips observer");
    require(!roots.publish("array", A{0, 1, 2, 3}, error), "array source bounds");
    require(roots.publish("number", 9, error, DataState::Stale), error.c_str());
    roots.flush();
    DataState state;
    require(!roots.read("number", {}, &state) && state == DataState::Stale,
            "stale distinct from unknown and not displayed current");
    auto owner = std::make_shared<int>(1);
    require(!roots.defer(owner, 1, {}, error) && error == "data_event_callback",
            "empty deferred callback rejected");
    int deferred = 0;
    for (size_t i = 0; i < binding_contract::eventQueue; ++i)
      require(roots.defer(owner, 1, [&]() { ++deferred; }, error), error.c_str());
    require(!roots.defer(owner, 1, []() {}, error), "deferred queue bounded");
    owner.reset();
    roots.flush();
    require(deferred == 0 && roots.snapshot_json().find("\"queueDropped\":1") != std::string::npos,
            "expired owner cancels bounded queue");
    DataLimits small;
    small.snapshot_bytes = 3;
    DataRegistry bounded(small);
    require(bounded.add_source({"value", DataSchema::integer()}, error) &&
                bounded.publish("value", 100, error),
            error.c_str());
    bounded.flush();
    require(!bounded.publish("value", 101, error), "aggregate current plus pending bytes bounded");
    DataLimits low;
    low.value_bytes = 3;
    DataRegistry arguments(low);
    int applied = 0;
    require(arguments.add_source({"text", DataSchema::text(80),
                                  [&](const DataPath &, const DataValue &, std::string &) {
                                    ++applied;
                                    return true;
                                  }},
                                 error) &&
                arguments.add_action({"text", DataSchema::text(80),
                                      [&](const DataValue &, std::string &) {
                                        ++applied;
                                        return true;
                                      }},
                                     error),
            error.c_str());
    require(!arguments.invoke("text", "long", error) &&
                !arguments.write("text", {}, "long", error) && applied == 0,
            "configured value bytes bounds action and write arguments");
    std::set<std::string> literal_dependencies;
    require(!detail::validate_expression(literal("long"), arguments, false, literal_dependencies,
                                         error),
            "configured value bytes bounds binding literal");
  }
  require(!validate_data_value(DataValue(UINT64_MAX), DataSchema::integer(), error),
          "uint64 max never wraps to accepted negative");
  auto persistent = data.retain("sensor");
  require(data.demand("sensor") == 1, "persistent demand");
  require(data.publish("enabled", false, error) && !data.read("enabled"),
          "publication waits for flush");
  data.flush();
  require(data.read("enabled") && *data.read("enabled") == DataValue(false), "false is known");
  lv_init();
  auto *display = lv_display_create(800, 480);
  std::vector<uint8_t> pixels(800 * 480 * 2);
  lv_display_set_color_format(display, LV_COLOR_FORMAT_RGB565);
  lv_display_set_buffers(display, pixels.data(), nullptr, pixels.size(),
                         LV_DISPLAY_RENDER_MODE_FULL);
  lv_display_set_flush_cb(
      display, [](lv_display_t *d, const lv_area_t *, uint8_t *) { lv_display_flush_ready(d); });
  WidgetRegistry widgets;
  require(widgets.add({256, "test:borrow", "borrow-1", lv_obj_create, borrowed, "{\"methods\":[]}",
                       native_event}),
          "native registration");
  {
    ScreenRuntime runtime(nullptr, 0, {}, nullptr, ScreenStyleRetention::Release, &widgets, &data);
    ScreenReply reply;
    auto bytes = packet();
    if (!runtime.load(bytes.data(), bytes.size(), reply)) {
      std::fprintf(stderr, "load node=%s opcode=%u error=%s\n", reply.node, reply.opcode,
                   reply.error);
      return 1;
    }
    bytes.assign(bytes.size(), 0);
    require(std::strcmp(lv_label_get_text(runtime.find("text")), "--") == 0,
            "unknown text placeholder");
    require(data.demand("sensor") == 2, "screen demand aggregates once");
    require(!lv_obj_has_flag(runtime.root(), LV_OBJ_FLAG_CLICKABLE),
            "boolean flag setter removes prior flag");
    for (auto pair : {std::pair<double, const char *>{1.234567890123456, "1.23456789012346"},
                      {1e-6, "1e-06"},
                      {100000000000000.5, "100000000000001"}}) {
      require(data.publish("general", pair.first, error), error.c_str());
      data.flush();
      require(std::strcmp(lv_label_get_text(runtime.find("numeric")), pair.second) == 0,
              "general15 numeric text representation");
    }
    require(data.publish("sensor",
                         O{{"pressure", 12.5},
                           {"threshold", 10.0},
                           {"rows", A{O{{"v", 4}}}},
                           {"a.b", "punctuation"}},
                         error),
            error.c_str());
    data.flush();
    require(std::strcmp(lv_label_get_text(runtime.find("text")), "12.5 PSI") == 0,
            "formatted numeric text");
    require(lv_obj_has_state(runtime.find("text"), LV_STATE_USER_1), "comparison enables state");
    require(*data.read("sensor", {std::string("a.b")}) == DataValue("punctuation"),
            "token key is not dotted path");
    require(data.publish("sensor", O{{"pressure", 8.0}, {"threshold", 9.0}, {"rows", A{}}}, error),
            error.c_str());
    data.flush();
    require(!lv_obj_has_state(runtime.find("text"), LV_STATE_USER_1),
            "comparison disables prior state");
    require(!data.read("sensor", {std::string("rows"), size_t(0), std::string("v")}),
            "array shrink clears old element");
    for (auto pair : {std::pair<double, const char *>{1.25, "1.3 PSI"}, {-1.25, "-1.3 PSI"}}) {
      require(data.publish("sensor", O{{"pressure", pair.first}, {"threshold", 10}}, error),
              error.c_str());
      data.flush();
      require(std::strcmp(lv_label_get_text(runtime.find("text")), pair.second) == 0,
              "precision rounds half away from zero");
    }
    auto before = runtime.root();
    auto invalid = packet(true);
    require(!runtime.load(invalid.data(), invalid.size(), reply) && runtime.root() == before,
            "invalid binding replacement rollback");
    require(data.demand("sensor") == 2, "rollback leaves no demand leak");
    auto bad_packet = packet();
    DataValue bad_doc;
    require(decode_data_value(bad_packet.data(), bad_packet.size(), bad_doc, error, 32768, 32),
            error.c_str());
    auto &bad_rule =
        std::get<O>(std::get<A>(std::get<O>(bad_doc.value)["bindings"].value)[0].value);
    bad_rule["method"] = 65535;
    bad_rule["value"] = literal("unsupported");
    bad_packet = encode_data_value(bad_doc);
    require(!runtime.load(bad_packet.data(), bad_packet.size(), reply) &&
                runtime.root() == before && std::string(reply.error) == "binding_initial_argument",
            "known invalid initial binding rolls back");
    bad_rule["value"] = ref("notready");
    bad_rule.erase("format");
    bad_packet = encode_data_value(bad_doc);
    {
      ScreenRuntime deferred(nullptr, 0, {}, nullptr, ScreenStyleRetention::Release, &widgets,
                             &data);
      require(deferred.load(bad_packet.data(), bad_packet.size(), reply), reply.error);
      require(data.publish("notready", 1, error), error.c_str());
      data.flush();
      require(deferred.root() &&
                  data.snapshot_json().find("binding_method_argument") != std::string::npos,
              "unknown initial binding defers unavailable method to runtime diagnostics");
    }
    for (bool static_method : {false, true}) {
      auto deleting = packet();
      DataValue document;
      require(decode_data_value(deleting.data(), deleting.size(), document, error, 32768, 32),
              error.c_str());
      if (static_method) {
        auto &root = std::get<A>(std::get<O>(document.value)["root"].value);
        auto &body = std::get<A>(root[2].value);
        auto &native = std::get<A>(body[4].value);
        auto &methods = std::get<A>(native[2].value);
        methods.emplace_back(A{256, "delete staged screen"});
        methods.emplace_back(A{10, A{int(LV_STATE_CHECKED), true}});
      }
      deleting = encode_data_value(document);
      delete_native_screen = true;
      const auto loaded = runtime.load(deleting.data(), deleting.size(), reply);
      delete_native_screen = false;
      require(!loaded && runtime.root() == before && data.demand("sensor") == 2,
              "native deletion of staged root rolls back without touching old screen");
      lv_obj_update_layout(runtime.root());
      lv_refr_now(display);
    }
    auto *toggle = runtime.find("toggle");
    lv_obj_add_state(toggle, LV_STATE_CHECKED);
    lv_obj_send_event(toggle, LV_EVENT_VALUE_CHANGED, nullptr);
    require(writes == 0, "LVGL callback defers writes");
    data.flush();
    require(writes == 1 && !lv_obj_has_state(toggle, LV_STATE_CHECKED),
            "rejected write restores actual source without revision change");
    require(data.publish("enabled", true, error), error.c_str());
    data.flush();
    require(lv_obj_has_state(toggle, LV_STATE_CHECKED) && writes == 1,
            "programmatic setter doesn't write back");
    require(lv_obj_has_flag(runtime.root(), LV_OBJ_FLAG_CLICKABLE),
            "boolean flag setter enables flag");
    auto calls_before_loop = calls;
    for (int i = 0; i < 10000; ++i) {
      require(data.publish("name", std::string("value ") + std::to_string(i), error),
              error.c_str());
      data.flush();
      require(std::string(static_cast<char *>(lv_obj_get_user_data(runtime.find("borrow")))) ==
                  "value " + std::to_string(i),
              "borrowed args live until next setter");
    }
    require(max_storage < 32 && calls == calls_before_loop + 10000,
            "10k updates use replaceable bounded argument storage");
    lv_obj_send_event(runtime.find("borrow"), LV_EVENT_CLICKED, nullptr);
    data.flush();
    require(native_calls == 1 && object_calls == 1, "registered native event reader");
    lv_obj_send_event(runtime.find("button"), LV_EVENT_CLICKED, nullptr);
    data.flush();
    require(clicks == 1, "action object expression");
    lv_obj_send_event(runtime.find("button"), LV_EVENT_CLICKED, nullptr);
    lv_obj_delete(runtime.find("button"));
    data.flush();
    require(clicks == 1, "deleted node cancels pending event");
    lv_obj_send_event(runtime.find("borrow"), LV_EVENT_CLICKED, nullptr);
    runtime.unload();
    data.flush();
    require(native_calls == 1 && data.demand("sensor") == 1,
            "screen unload cancels events and demand");
  }
  {
    ScreenRuntime navigation(nullptr, 0, {}, nullptr, ScreenStyleRetention::Release, &widgets,
                             &data);
    ScreenReply reply;
    int closes = 0, replacements = 0;
    require(data.add_action({"close", DataSchema::null(),
                             [&](const DataValue &, std::string &) {
                               ++closes;
                               navigation.unload();
                               require(data.demand("sensor") == 1,
                                       "own action unload detaches demand immediately");
                               return true;
                             }},
                            error),
            error.c_str());
    auto close = packet(false, "close");
    require(navigation.load(close.data(), close.size(), reply), reply.error);
    auto *button = navigation.find("button");
    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
    data.flush();
    require(closes == 1 && !navigation.root(), "own action unload cancels remaining events safely");
    auto replacement = packet();
    require(
        data.add_action(
            {"replace", DataSchema::null(),
             [&](const DataValue &, std::string &) {
               ++replacements;
               require(navigation.load(replacement.data(), replacement.size(), reply), reply.error);
               require(data.demand("sensor") == 2, "own action replacement releases old demand");
               return true;
             }},
            error),
        error.c_str());
    auto replace = packet(false, "replace");
    require(navigation.load(replace.data(), replace.size(), reply), reply.error);
    button = navigation.find("button");
    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
    data.flush();
    require(replacements == 1 && navigation.root(),
            "own action replacement cancels old generation events");
    bool invoked = false;
    native_callback = [&]() {
      if (!invoked) {
        invoked = true;
        navigation.unload();
      }
    };
    require(data.publish("name", "delete from setter", error), error.c_str());
    data.flush();
    native_callback = {};
    require(invoked && !navigation.root() && data.demand("sensor") == 1,
            "native binding setter may unload its own instance");
    auto reader_packet = packet();
    require(navigation.load(reader_packet.data(), reader_packet.size(), reply), reply.error);
    reader_callback = [&]() { navigation.unload(); };
    reader_result = false;
    lv_obj_send_event(navigation.find("borrow"), LV_EVENT_CLICKED, nullptr);
    reader_callback = {};
    reader_result = true;
    data.flush();
    require(!navigation.root() && data.demand("sensor") == 1,
            "native event reader may unload own screen and return false");
  }
  for (bool result : {false, true}) {
    ScreenRuntime deletion(nullptr, 0, {}, nullptr, ScreenStyleRetention::Release, &widgets,
                           &data);
    ScreenReply reply;
    auto bytes = packet();
    require(deletion.load(bytes.data(), bytes.size(), reply), reply.error);
    auto *object = deletion.find("borrow");
    const auto before_readers = reader_calls;
    const auto before_actions = native_calls + object_calls;
    reader_result = result;
    reader_callback = [object]() { lv_obj_delete(object); };
    lv_obj_send_event(object, LV_EVENT_CLICKED, nullptr);
    reader_callback = {};
    reader_result = true;
    data.flush();
    require(reader_calls == before_readers + 1 && !deletion.find("borrow") &&
                native_calls + object_calls == before_actions,
            "reader self-deletion cancels both matching events regardless of return value");
    lv_obj_update_layout(deletion.root());
    lv_refr_now(display);
    deletion.unload();
    require(data.demand("sensor") == 1, "reader self-deletion permits complete runtime cleanup");
  }
  {
    ScreenRuntime deletion(nullptr, 0, {}, nullptr, ScreenStyleRetention::Release, &widgets,
                           &data);
    ScreenReply reply;
    auto bytes = packet();
    DataValue document;
    require(decode_data_value(bytes.data(), bytes.size(), document, error, 32768, 32),
            error.c_str());
    std::get<A>(std::get<O>(document.value)["bindings"].value)
        .emplace_back(O{{"node", "borrow"},
                        {"method", 10},
                        {"value", A{literal(int(LV_STATE_CHECKED)), ref("enabled")}}});
    bytes = encode_data_value(document);
    require(deletion.load(bytes.data(), bytes.size(), reply), reply.error);
    auto *object = deletion.find("borrow");
    const auto before_calls = calls;
    native_callback = [object]() { lv_obj_delete(object); };
    require(data.publish("name", "self deletion from setter", error), error.c_str());
    data.flush();
    native_callback = {};
    require(calls == before_calls + 1 && !deletion.find("borrow") && deletion.root(),
            "native setter self-deletion skips later rules for the deleted object");
    lv_obj_update_layout(deletion.root());
    lv_refr_now(display);
    deletion.unload();
    require(data.demand("sensor") == 1, "setter self-deletion permits complete runtime cleanup");
    require(data.publish("name", "delete from setter", error), error.c_str());
    data.flush();
  }
  require(data.invalidate("sensor", error), error.c_str());
  data.flush();
  require(!data.read("sensor"), "explicit unknown");
  require(!data.write("name", {}, "no", error), "read only source refuses writes");
  std::set<std::string> deps;
  auto lazy = op("select", A{literal(true), literal(7), op("div", A{literal(1), literal(0)})});
  require(detail::validate_expression(lazy, data, false, deps, error), error.c_str());
  auto value = detail::evaluate_expression(lazy, data, nullptr, error);
  require(value.known && value.value == DataValue(7), "select is lazy");
  auto round = detail::evaluate_expression(op("round", A{literal(-2.5)}), data, nullptr, error);
  require(round.known && round.value == DataValue(-3), "round half away from zero");
  DataValue decoded;
  auto raw = encode_data_value(O{{"a", A{1, 2.5, true, nullptr, "UTF-8 Я"}}});
  require(decode_data_value(raw.data(), raw.size(), decoded, error) &&
              decoded == DataValue(O{{"a", A{1, 2.5, true, nullptr, "UTF-8 Я"}}}),
          "value CBOR roundtrip");
  const uint8_t float32[]{0xfa, 0x3f, 0xc0, 0, 0};
  require(decode_data_value(float32, sizeof(float32), decoded, error) && decoded == DataValue(1.5),
          "float32 decoding");
  const uint8_t half[]{0xf9, 0x3e, 0};
  require(decode_data_value(half, sizeof(half), decoded, error) && decoded == DataValue(1.5),
          "half float decoding");
  const uint8_t duplicate[]{0xa2, 0x61, 'a', 0x01, 0x61, 'a', 0x02};
  require(!decode_data_value(duplicate, sizeof(duplicate), decoded, error),
          "duplicate object key rejected");
  const uint8_t bad_utf8[]{0x62, 0xc0, 0x80};
  require(!decode_data_value(bad_utf8, sizeof(bad_utf8), decoded, error), "invalid UTF8 rejected");
  const uint8_t unsafe_integer[]{0x1b, 0, 0x20, 0, 0, 0, 0, 0, 0};
  require(!decode_data_value(unsafe_integer, sizeof(unsafe_integer), decoded, error),
          "unsafe wire integer rejected");
  WidgetStorage storage;
  WidgetContext context{nullptr, 0, storage, 4096};
  for (auto bad : {DataValue(-1), DataValue(4294967296LL), DataValue(1.25)}) {
    auto b = encode_data_value(bad);
    CborParser p;
    CborValue c;
    cbor_parser_init(b.data(), b.size(), 0, &p, &c);
    uint32_t out;
    require(!execution::read(c, out, context), "checked uint rejects wrap/fraction");
  }
  persistent = {};
  require(data.demand("sensor") == 0, "persistent lease releases");
  if (argc > 1) {
    std::ifstream file(std::string(argv[1]) + "/pc-screen.cbor", std::ios::binary);
    std::vector<uint8_t> bytes{std::istreambuf_iterator<char>(file), {}};
    require(!bytes.empty(), "PC fixture exists");
    ScreenRuntime runtime(nullptr, 0, {}, nullptr, ScreenStyleRetention::Release, nullptr, &data);
    ScreenReply reply;
    require(runtime.load(bytes.data(), bytes.size(), reply), reply.error);
    require(std::strcmp(lv_label_get_text(runtime.find("pc-text")), "delete from setter") == 0,
            "actual PC codec binds native LVGL text");
    auto *toggle = runtime.find("pc-switch");
    lv_obj_remove_state(toggle, LV_STATE_CHECKED);
    lv_obj_send_event(toggle, LV_EVENT_VALUE_CHANGED, nullptr);
    data.flush();
    require(writes == 2 && lv_obj_has_state(toggle, LV_STATE_CHECKED),
            "actual PC codec event write reconciles native LVGL");
  }
  lv_display_delete(display);
  lv_deinit();
  std::puts("Bindings: scalar/struct/array snapshots, expressions, 10k retained args, weak events, "
            "rejected write reconciliation and teardown passed");
}
