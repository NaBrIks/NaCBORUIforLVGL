// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "lvgl_cbor/project_service.hpp"
#include "lvgl_cbor/data_registry.hpp"
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <cassert>
#include <cstdio>
#include <fstream>
#include <filesystem>
#include <iterator>
#include <string>
#include <vector>
using namespace lvgl_cbor;
static std::vector<uint8_t> read(const std::string &path) { std::ifstream file(path, std::ios::binary); return {std::istreambuf_iterator<char>(file), {}}; }
static ProjectBytes bytes(const std::vector<uint8_t> &data) { return {data.data(), data.size(), {}}; }
struct FaultStore : ProjectStore {
  MemoryProjectStore delegate; bool fail{};
  bool load(std::vector<uint8_t> &out, size_t max, std::string &error) override { return delegate.load(out, max, error); }
  bool commit(const std::vector<uint8_t> &data, std::string &error) override { if (fail) { error = "injected_write_failure"; return false; } return delegate.commit(data, error); }
  bool persistent() const override { return false; }
  const char *description() const override { return "fault test"; }
};
int main(int argc, char **argv) {
  if (argc != 2) return 2;
  const std::string path = argv[1]; auto base = read(path + "/base.cbor"), edited = read(path + "/edited.cbor"), extended = read(path + "/extended.cbor"), wrong = read(path + "/wrong.cbor"), preview = read(path + "/badPreview.cbor");
  assert(!base.empty()); ConstProjectSource source(base.data(), base.size()); std::string error;
  lv_init(); static lv_color_t framebuffer[800 * 480]; auto *display = lv_display_create(800, 480); lv_display_set_buffers(display, framebuffer, nullptr, sizeof(framebuffer), LV_DISPLAY_RENDER_MODE_DIRECT); lv_display_set_flush_cb(display, [](lv_display_t *d, const lv_area_t *, uint8_t *) { lv_display_flush_ready(d); });
  {
    ProjectService readonly(source); if (!readonly.begin(error)) { std::fprintf(stderr, "Project begin: %s\n", error.c_str()); return 1; } assert(!readonly.status().writable); assert(readonly.status().base_storage.kind == "firmware"); assert(readonly.status().base_storage.persistent); assert(!readonly.save_project(bytes(edited), error)); assert(error == "project_read_only"); ScreenReply reply; assert(readonly.load_screen("", reply)); assert(readonly.status().displayed_screen == "main");
  }
  MemoryProjectStore store;
  {
    ProjectService service(source, &store); assert(service.begin(error)); const auto revision = service.status().revision;
    ScreenReply reply; assert(service.load_screen("main", reply)); auto *original = service.root();
    assert(service.save_project(bytes(edited), error, revision)); assert(service.root() == original); assert(service.status().revision != revision);
    assert(!service.save_project(bytes(extended), error, revision)); assert(error == "project_revision_conflict");
    const auto saved = service.status().revision; assert(service.preview(bytes(preview), "main", reply)); assert(service.status().revision == saved);
    assert(std::string(lv_label_get_text(lv_obj_get_child(service.root(), 0))) == "Uncommitted preview");
    assert(service.load_screen("main", reply)); assert(service.status().changed);
    auto *label = lv_obj_get_child(service.root(), 0);
    assert(std::string(lv_label_get_text(label)) == "Saved edit");
    assert((lv_color_to_u32(lv_obj_get_style_text_color(label, LV_PART_MAIN)) & 0xffffff) == 0xeebb22);
    auto bad = edited; bad.pop_back(); auto *active = service.root(); assert(!service.preview(bytes(bad), "main", reply)); assert(service.root() == active);
  }
  {
    ProjectService restored(source, &store); assert(restored.begin(error)); assert(restored.status().changed); assert(restored.reset("", "", error)); assert(!restored.status().changed);
    assert(restored.save_project(bytes(extended), error)); assert(restored.status().screens.size() == 2); assert(restored.remove("screens", "extra", error)); assert(restored.status().screens.size() == 1);
  }
  {
    MemoryProjectStore fixedStore; ProjectService fixed(source, &fixedStore, {true, false, false}); assert(fixed.begin(error)); assert(fixed.save_project(bytes(edited), error)); assert(!fixed.save_project(bytes(extended), error)); assert(error == "project_add_disabled"); assert(!fixed.save_project(bytes(wrong), error)); assert(error == "project_identity");
  }
  {
    FaultStore fault; ProjectService service(source, &fault); assert(service.begin(error)); auto revision = service.status().revision;
    ProjectBytes view; assert(service.read_screen("main", view, error)); assert(!view.owner); assert(view.data >= base.data() && view.data < base.data() + base.size());
    fault.fail = true; assert(!service.save_project(bytes(edited), error)); assert(service.status().revision == revision); assert(!service.status().changed);
    fault.fail = false; assert(service.save_project(bytes(edited), error));
    ConstProjectSource updated(extended.data(), extended.size()); ProjectService incompatible(updated, &fault); assert(!incompatible.begin(error)); assert(error == "project_base_mismatch");
  }
  {
    ConstProjectSource extendedSource(extended.data(), extended.size()); MemoryProjectStore delta;
    { ProjectService service(extendedSource, &delta); assert(service.begin(error)); assert(service.remove("screens", "extra", error)); }
    { ProjectService service(extendedSource, &delta); assert(service.begin(error)); assert(service.status().screens.size() == 1); assert(service.reset("screens", "extra", error)); assert(service.status().screens.size() == 2); }
  }
  {
    const auto prefix = path + "/changes-test"; std::remove((prefix + ".0").c_str()); std::remove((prefix + ".1").c_str());
    { FileProjectStore files(prefix); ProjectService service(source, &files); assert(service.begin(error)); assert(service.save_project(bytes(edited), error)); assert(service.save_project(bytes(extended), error)); }
    { std::ofstream corrupt(prefix + ".1", std::ios::trunc); corrupt << "partial write"; }
    { FileProjectStore files(prefix); ProjectService service(source, &files); assert(service.begin(error)); assert(service.status().changed); assert(service.status().screens.size() == 1); }
    std::remove((prefix + ".0").c_str()); std::remove((prefix + ".1").c_str());
  }
  {
    namespace fs = std::filesystem;
    const auto directory = path + "/catalog-test";
    fs::create_directories(directory);
    for (const auto &entry : fs::directory_iterator(directory)) fs::remove(entry.path());
    for (const auto &entry : fs::directory_iterator(path + "/catalog")) fs::copy_file(entry.path(), fs::path(directory) / entry.path().filename(), fs::copy_options::overwrite_existing);
    { CatalogProjectStore files(directory); ProjectService service(source, &files); assert(service.begin(error)); assert(service.status().screens.size() == 2); assert(service.status().catalog_format == "lvgl-project-catalog-1"); assert(service.status().documents[1].origin == "changes"); assert(service.status().documents[1].location == directory + "/0s000.cbor");
      assert(service.save_project(bytes(edited), error));
      { std::ofstream stale(directory + "/0s127.cbor"); stale << "unused slot"; }
      { std::ofstream unrelated(directory + "/application.txt"); unrelated << "keep"; }
      assert(service.save_project(bytes(extended), error)); assert(!fs::exists(directory + "/0s127.cbor")); assert(fs::exists(directory + "/application.txt")); }
    // A complete index with a torn referenced packet must fall back too, not just
    // an index whose own checksum failed. The prior bank must remain untouched.
    { std::ofstream corrupt(directory + "/0s000.cbor", std::ios::trunc); corrupt << "partial document"; }
    { CatalogProjectStore files(directory); ProjectService service(source, &files); assert(service.begin(error)); assert(service.status().screens.size() == 1); ScreenReply reply; assert(service.load_screen("main", reply)); assert(std::string(lv_label_get_text(lv_obj_get_child(service.root(), 0))) == "Saved edit"); }
    { std::ofstream corrupt(directory + "/catalog.1", std::ios::trunc); corrupt << "partial index"; }
    { CatalogProjectStore files(directory); ProjectService service(source, &files); assert(!service.begin(error)); assert(error == "project_catalog_corrupt"); }
    { CatalogProjectStore unavailable(directory); unavailable.enabled(false); ProjectService service(source, &unavailable); assert(service.begin(error)); assert(!service.writable()); assert(service.status().changes_storage.state == "unavailable"); assert(!service.save_project(bytes(edited), error)); assert(error == "project_read_only"); }
    for (const auto &entry : fs::directory_iterator(directory)) fs::remove(entry.path()); fs::remove(directory);
  }
  {
    const auto bound_base = read(path + "/bindings-base.cbor");
    const auto bound_edit = read(path + "/bindings-edited.cbor");
    const auto bound_preview = read(path + "/bindings-preview.cbor");
    assert(!bound_base.empty() && !bound_edit.empty() && !bound_preview.empty());
    DataRegistry data;
    int reading = 7, actions = 0;
    assert(data.add_source({"app.measurement", DataSchema::object({{"value", DataSchema::integer(0, 1000)}})}, error));
    assert(data.add_action({"app.advance", DataSchema::integer(1, 100),
      [&](const DataValue &argument, std::string &message) {
        reading += int(std::get<int64_t>(argument.value)); ++actions;
        return data.publish("app.measurement", DataValue::Object{{"value", reading}}, message);
      }}, error));
    assert(data.publish("app.measurement", DataValue::Object{{"value", reading}}, error)); data.flush();
    assert(data.demand("app.measurement") == 0);
    ConstProjectSource bound_source(bound_base.data(), bound_base.size());
    MemoryProjectStore changes;
    std::vector<uint8_t> exported;
    {
      ProjectService service(bound_source, &changes, {}, {}, nullptr, 0, nullptr, {}, &data);
      assert(service.begin(error)); const auto base_revision = service.revision();
      ScreenReply reply; assert(service.load_screen("overview", reply));
      const auto text = [&]() { return std::string(lv_label_get_text(service.find("reading"))); };
      assert(text() == "Base 7" && data.demand("app.measurement") == 1);
      reading = 8; assert(data.publish("app.measurement", DataValue::Object{{"value", reading}}, error)); data.flush();
      assert(text() == "Base 8");
      lv_obj_send_event(service.find("advance"), LV_EVENT_CLICKED, nullptr);
      assert(actions == 0); data.flush(); assert(actions == 1 && text() == "Base 9");

      // An event from the retired named screen must not execute on the next UI turn.
      lv_obj_send_event(service.find("advance"), LV_EVENT_CLICKED, nullptr);
      assert(service.load_screen("detail", reply)); data.flush();
      assert(actions == 1 && text() == "Detail 9" && data.demand("app.measurement") == 1);
      lv_obj_send_event(service.find("advance"), LV_EVENT_CLICKED, nullptr); data.flush();
      assert(actions == 2 && text() == "Detail 19");

      const auto before_preview = encode_project(service.snapshot());
      assert(service.preview(bytes(bound_preview), "overview", reply));
      assert(service.revision() == base_revision && encode_project(service.snapshot()) == before_preview);
      assert(service.status().preview && text() == "Preview 19" && data.demand("app.measurement") == 1);
      lv_obj_send_event(service.find("advance"), LV_EVENT_CLICKED, nullptr); data.flush();
      assert(actions == 3 && text() == "Preview 22");

      auto *shown = service.root(); const auto preview_revision = service.status().displayed_revision;
      std::string saved_revision;
      assert(service.save_project(bytes(bound_edit), error, base_revision, &saved_revision));
      assert(service.root() == shown && service.status().preview &&
             service.status().displayed_revision == preview_revision && service.revision() == saved_revision);
      reading = 23; assert(data.publish("app.measurement", DataValue::Object{{"value", reading}}, error)); data.flush();
      assert(text() == "Preview 23");
      exported = encode_project(service.snapshot()); assert(exported == bound_edit);
      ProjectBundle parsed; assert(parse_project(bytes(exported), parsed, error));
      assert(encode_project(parsed) == exported);

      lv_obj_send_event(service.find("advance"), LV_EVENT_CLICKED, nullptr);
      assert(service.load_screen("overview", reply)); data.flush();
      assert(actions == 3 && text() == "Saved 23" && !service.status().preview &&
             service.status().displayed_revision == saved_revision && data.demand("app.measurement") == 1);
      lv_obj_send_event(service.find("advance"), LV_EVENT_CLICKED, nullptr); data.flush();
      assert(actions == 4 && text() == "Saved 25");
      // Destruction cancels events and releases the source subscription too.
      lv_obj_send_event(service.find("advance"), LV_EVENT_CLICKED, nullptr);
    }
    data.flush(); assert(actions == 4 && reading == 25 && data.demand("app.measurement") == 0);
    {
      ConstProjectSource readback(exported.data(), exported.size());
      ProjectService restored(readback, nullptr, {}, {}, nullptr, 0, nullptr, {}, &data);
      assert(restored.begin(error)); ScreenReply reply;
      assert(restored.load_screen("overview", reply));
      assert(std::string(lv_label_get_text(restored.find("reading"))) == "Saved 25");
      lv_obj_send_event(restored.find("advance"), LV_EVENT_CLICKED, nullptr); data.flush();
      assert(actions == 5 && std::string(lv_label_get_text(restored.find("reading"))) == "Saved 27");
      assert(restored.load_screen("detail", reply));
      assert(std::string(lv_label_get_text(restored.find("reading"))) == "Detail 27" && data.demand("app.measurement") == 1);
      lv_obj_send_event(restored.find("advance"), LV_EVENT_CLICKED, nullptr); data.flush();
      assert(actions == 6 && std::string(lv_label_get_text(restored.find("reading"))) == "Detail 37");
    }
    assert(data.demand("app.measurement") == 0);
  }
  std::puts("Project service: base/overlay, persistence, policy, named load, isolated preview, catalog banks, revisions and binding/event roundtrip passed"); lv_deinit();
}
