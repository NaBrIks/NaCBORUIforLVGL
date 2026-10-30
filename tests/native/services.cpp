// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "lvgl_cbor/capabilities.hpp"
#include "lvgl_cbor/style_service.hpp"
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

static void require(bool ok, const char *message) {
  if (!ok) {
    std::fprintf(stderr, "FAILED: %s\n", message);
    std::exit(1);
  }
}
static std::vector<uint8_t> fixture(const std::string &directory, const char *name) {
  std::ifstream stream(directory + '/' + name + ".cbor", std::ios::binary);
  require(stream.good(), name);
  return {std::istreambuf_iterator<char>(stream), {}};
}
int main(int argc, char **argv) {
  require(argc == 2, "fixture directory or --capabilities");
  lv_init();
  auto *display = lv_display_create(800, 480);
  const lvgl_cbor::Resource resources[]{
      {"montserrat_28", "const lv_font_t *", &lv_font_montserrat_28},
      {"montserrat_20", "const lv_font_t *", &lv_font_montserrat_20}};
  if (std::string(argv[1]) == "--capabilities") {
    lvgl_cbor::CapabilityLimits limits;
    limits.style_packet_bytes = limits.screen_packet_bytes = 3584;
    std::puts(lvgl_cbor::runtime_capabilities_json(resources, 2, limits).c_str());
    lv_display_delete(display);
    lv_deinit();
    return 0;
  }
  {
    lvgl_cbor::StyleService service(resources, 2);
    lvgl_cbor::StyleValue fixed;
    lv_style_set_text_color(&fixed.value, lv_color_hex(0x55aa00));
    require(service.register_static("palette", &fixed.value), "register static style");
    require(!service.register_static("palette", &fixed.value), "static tier is immutable");
    auto *target = lv_label_create(lv_screen_active());
    lvgl_cbor::StyleRuntime editor(target, resources, 2, &service);
    lvgl_cbor::Reply style_reply;
    auto apply = [&](const char *name) {
      auto bytes = fixture(std::string(argv[1]) + "/../native-fixtures", name);
      require(editor.apply(bytes.data(), bytes.size(), style_reply), name);
    };
    apply("global");
    auto dynamic = service.resolve("global:palette");
    require(dynamic && dynamic.value != &fixed.value &&
                service.resolve("global-static:palette").value == &fixed.value,
            "dynamic globals shadow static; explicit static remains accessible");
    lvgl_cbor::ScreenRuntime runtime(resources, 2, {}, &service);
    lvgl_cbor::ScreenReply reply;
    auto bytes = fixture(argv[1], "service_bridge");
    require(runtime.load(bytes.data(), bytes.size(), reply), reply.error);
    auto *label = runtime.find("global_label");
    require(lv_color_to_u32(lv_obj_get_style_text_color(label, LV_PART_MAIN)) == 0xffff0000,
            "screen resolves the editor's dynamic global");
    apply("replace_global");
    require(service.resolve("global:palette").value == dynamic.value &&
                lv_color_to_u32(lv_obj_get_style_text_color(label, LV_PART_MAIN)) == 0xff0000ff,
            "global replacement preserves address and updates live screen");
    require(lv_color_to_u32(lv_obj_get_style_text_color(runtime.find("static_label"),
                                                        LV_PART_MAIN)) == 0xff55aa00,
            "static explicit attachment is independent");
    editor.set_target(runtime.find("local_label"));
    editor.set_screen_scope(runtime.style_scope());
    apply("screen_shared_update");
    require(lv_color_to_u32(lv_obj_get_style_text_color(runtime.find("local_label"),
                                                        LV_PART_MAIN)) == 0xffabcdef,
            "editor updates a live named screen style through the same service");
    editor.set_target(target);
    editor.set_screen_scope(nullptr);
    std::weak_ptr<lvgl_cbor::StyleScope> weak_scope = runtime.style_scope();
    runtime.unload();
    require(weak_scope.expired(), "default unload releases screen style scope");
    {
      lvgl_cbor::ScreenRuntime cached(resources, 2, {}, &service,
                                      lvgl_cbor::ScreenStyleRetention::Cache);
      require(cached.load(bytes.data(), bytes.size(), reply), reply.error);
      cached.unload();
      auto pinned = service.cached_scope("service_bridge");
      require(pinned && pinned->find("local"), "explicit screen cache retains named styles");
      service.trim_unused();
      require(service.cached_scope("service_bridge") != nullptr, "pinned cache cannot be evicted");
      pinned.reset();
      service.trim_unused();
      require(!service.cached_scope("service_bridge"), "unused cache can be evicted");
    }
    auto *parent = lv_obj_create(lv_screen_active());
    require(runtime.mount(bytes.data(), bytes.size(), parent, reply), reply.error);
    weak_scope = runtime.style_scope();
    auto *escaped = runtime.find("local_label");
    bool escaped_deleted = false;
    lv_obj_add_event_cb(
        escaped,
        [](lv_event_t *event) { *static_cast<bool *>(lv_event_get_user_data(event)) = true; },
        LV_EVENT_DELETE, &escaped_deleted);
    lv_obj_set_parent(escaped, lv_screen_active());
    lv_obj_delete(parent);
    lv_tick_inc(10);
    lv_timer_handler();
    require(weak_scope.expired(), "external DELETE releases scope after children teardown");
    require(escaped_deleted, "reparented objects retain their runtime owner");

    apply("tracks_source");
    apply("tracks_copy");
    apply("tracks_replace");
    const auto *tracks = lv_obj_get_style_grid_column_dsc_array(target, LV_PART_MAIN);
    require(tracks && tracks[0] == 100 && tracks[1] == LV_GRID_FR(1),
            "snapshot copy retains old borrowed arrays after source replacement");
    lv_obj_delete(target);
  }
  lv_display_delete(display);
  lv_deinit();
  std::puts("Native services passed: shared tiers, replacement, screen DELETE, cache and borrowed "
            "snapshots.");
}
