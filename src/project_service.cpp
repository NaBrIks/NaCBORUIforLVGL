// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "project_internal.hpp"
#include "cbor_reader.hpp"
#include <algorithm>
#include <cstdio>
#include <mutex>
#include <functional>

namespace lvgl_cbor {
using namespace project_detail;
namespace {
void replace(std::vector<ProjectDocument> &docs, const ProjectDocument &value) {
  for (auto it = docs.begin(); it != docs.end(); ++it) if (it->name == value.name) { if (value.bytes.size) *it = value; else docs.erase(it); return; }
  if (value.bytes.size) docs.push_back(value);
}
std::vector<ProjectDocument> changes(const std::vector<ProjectDocument> &base, const std::vector<ProjectDocument> &next) {
  std::vector<ProjectDocument> delta;
  for (const auto &doc : next) { const auto *old = project_detail::find(base, doc.name); if (!old || !equal(old->bytes, doc.bytes)) delta.push_back(doc); }
  for (const auto &doc : base) if (!project_detail::find(next, doc.name)) delta.push_back({doc.name, {}});
  return delta;
}
bool reorder(const CborValue &root, const char *key, std::vector<ProjectDocument> &docs, size_t max_items) {
  CborValue array, item; size_t count{};
  if (!detail::field(root, key, array) || !cbor_value_is_array(&array) || cbor_value_get_array_length(&array, &count) != CborNoError || count != docs.size() || count > max_items || cbor_value_enter_container(&array, &item) != CborNoError) return false;
  std::vector<ProjectDocument> ordered;
  for (size_t i = 0; i < count; ++i) { char name[64]; if (!detail::text(item, name, sizeof(name)) || project_detail::find(ordered, name)) return false; const auto *doc = project_detail::find(docs, name); if (!doc) return false; ordered.push_back(*doc); if (cbor_value_advance(&item) != CborNoError) return false; }
  docs = std::move(ordered); return true;
}
} // namespace
struct ProjectService::Impl {
  const ProjectSource &source; ProjectStore *store; ProjectPolicy policy; ProjectLimits limits;
  const Resource *resources; size_t count; WidgetRegistry *registry; DataRegistry *data;
  ScreenViewport viewport;
  std::vector<ProjectStorageInfo> media;
  mutable std::mutex mutex;
  ProjectBundle base, effective; std::string base_revision, revision; bool ready{}, changed{};
  std::string displayed_screen, displayed_revision; bool displaying_preview{};
  uint32_t displayed_instance{};
  bool presenting{};
  std::vector<ScreenViewStatus> displayed_views;
  struct Presentation : ScreenResolver {
    ProjectBundle bundle;
    StyleService styles;
    ScreenRuntime runtime;
    std::function<void()> changed;
    Presentation(ProjectBundle project, const Resource *r, size_t n, WidgetRegistry *registry, DataRegistry *data, ScreenViewport viewport)
      : bundle(std::move(project)), styles(r, n, 128), runtime(r, n, {}, &styles, ScreenStyleRetention::Release, registry, data, this, {}, viewport) {}
    bool resolve_screen(const std::string &name, const uint8_t *&bytes, size_t &size) const override {
      auto *doc = project_detail::find(bundle.screens, name);
      if (!doc) return false;
      bytes = doc->bytes.data; size = doc->bytes.size; return true;
    }
    void composition_changed() override { if (changed) changed(); }
  };
  std::unique_ptr<Presentation> presentation;
  Impl(const ProjectSource &s, ProjectStore *w, ProjectPolicy p, ProjectLimits l, const Resource *r, size_t n, WidgetRegistry *registry, std::vector<ProjectStorageInfo> media, DataRegistry *data, ScreenViewport viewport)
    : source(s), store(w), policy(p), limits(l), resources(r), count(n), registry(registry), data(data), viewport(viewport), media(std::move(media)) {}
  std::vector<uint8_t> delta(const ProjectBundle &next) const {
    Writer w; w.head(5, 7); w.text("format"); w.text("lvgl-project-overlay-1"); w.text("base"); w.text(base_revision);
    w.text("manifest"); w.bytes(next.manifest); w.text("screens"); w.docs(changes(base.screens, next.screens), true); w.text("styles"); w.docs(changes(base.styles, next.styles), true);
    w.text("screenOrder"); w.names(next.screens); w.text("styleOrder"); w.names(next.styles); return std::move(w.data);
  }
  bool restore(ProjectBytes bytes, std::string &error) {
    ProjectBundle overlay;
    if (!parse(bytes, overlay, error, limits, true)) return false;
    CborParser parser; CborValue root; std::string base_hash;
    if (!map(bytes, parser, root) || !string(root, "base", base_hash, 16) || base_hash != base_revision) return fail(error, "project_base_mismatch");
    ProjectBundle next = overlay; next.screens = base.screens; next.styles = base.styles;
    for (const auto &doc : overlay.screens) replace(next.screens, doc);
    for (const auto &doc : overlay.styles) replace(next.styles, doc);
    if (!reorder(root, "screenOrder", next.screens, limits.items) || !reorder(root, "styleOrder", next.styles, limits.items) || !valid(next, error, limits)) return fail(error, "project_overlay");
    if (!allowed(next, error)) return false;
    effective = std::move(next); return true;
  }
  bool allowed(const ProjectBundle &next, std::string &error) const {
    if (!store || !store->writable()) return fail(error, "project_read_only");
    if (next.id != effective.id && !(policy.replace && policy.add && policy.remove)) return fail(error, "project_identity");
    if (!policy.replace && !equal(next.manifest, effective.manifest)) return fail(error, "project_replace_disabled");
    for (bool styles : {false, true}) {
      const auto &old = styles ? effective.styles : effective.screens, &docs = styles ? next.styles : next.screens;
      for (const auto &doc : docs) { const auto *previous = project_detail::find(old, doc.name); if (!previous && !policy.add) return fail(error, "project_add_disabled"); if (previous && !policy.replace && !equal(previous->bytes, doc.bytes)) return fail(error, "project_replace_disabled"); }
      if (!policy.remove) for (const auto &doc : old) if (!project_detail::find(docs, doc.name)) return fail(error, "project_remove_disabled");
    }
    return true;
  }
  bool save(ProjectBundle &&next, std::string &error, const std::string &expected) {
    if (!ready) return fail(error, "project_not_ready");
    if (!expected.empty() && expected != revision) return fail(error, "project_revision_conflict");
    if (!valid(next, error, limits) || !allowed(next, error)) return false;
    auto encoded = encode_project(next); if (encoded.size() > limits.bytes) return fail(error, "project_size");
    auto encoded_delta = delta(next); if (encoded_delta.size() > limits.bytes) return fail(error, "project_delta_size");
    if (!store->commit(encoded_delta, error)) return false;
    revision = fingerprint(encoded); changed = revision != base_revision; effective = std::move(next); return true;
  }
  bool show(ProjectBundle bundle, const std::string &name, ScreenReply &reply, bool preview = false) {
    if (presenting || (presentation && presentation->runtime.busy())) {
      reply = {}; std::snprintf(reply.error, sizeof(reply.error), "runtime_busy"); return false;
    }
    presenting = true;
    struct PresentationGuard { bool &busy; ~PresentationGuard() { busy = false; } } guard{presenting};
    reply = {}; const auto *document = project_detail::find(bundle.screens, name.empty() ? bundle.entry : name);
    if (!document) { std::snprintf(reply.error, sizeof(reply.error), "project_screen_not_found"); return false; }
    const auto bytes = document->bytes;
    const auto screen_name = document->name, shown_revision = fingerprint(encode_project(bundle));
    auto next = std::make_unique<Presentation>(std::move(bundle), resources, count, registry, data, viewport);
    StyleRuntime compiler(nullptr, resources, count, &next->styles);
    for (const auto &style : next->bundle.styles) { Reply result; if (!compiler.apply(style.bytes.data, style.bytes.size, result)) { std::snprintf(reply.error, sizeof(reply.error), "project style %s: %.100s", style.name.c_str(), result.error); return false; } }
    if (!next->runtime.load(bytes.data, bytes.size, reply)) return false;
    presentation = std::move(next);
    presentation->changed = [this]() {
      auto views = presentation->runtime.view_status();
      std::lock_guard<std::mutex> lock(mutex); displayed_views = std::move(views);
    };
    auto views = presentation->runtime.view_status();
    { std::lock_guard<std::mutex> lock(mutex); displayed_screen = screen_name; displayed_revision = shown_revision; displaying_preview = preview;
      displayed_instance = presentation->runtime.instance_id(); displayed_views = std::move(views); }
    return true;
  }
};
ProjectService::ProjectService(const ProjectSource &source, ProjectStore *store, ProjectPolicy policy, ProjectLimits limits, const Resource *resources, size_t count, WidgetRegistry *registry, std::vector<ProjectStorageInfo> media, DataRegistry *data, ScreenViewport viewport)
  : impl_(std::make_unique<Impl>(source, store, policy, limits, resources, count, registry, std::move(media), data, viewport)) {}
ProjectService::~ProjectService() = default;
bool ProjectService::begin(std::string &error) {
  auto &p = *impl_; std::lock_guard<std::mutex> lock(p.mutex);
  if (p.ready) return fail(error, "project_already_started");
  if (!p.source.read(p.base, error, p.limits)) return false;
  p.base_revision = fingerprint(encode_project(p.base)); p.effective = p.base;
  if (p.store) { std::vector<uint8_t> bytes; if (!p.store->load(bytes, p.limits.bytes, error)) return false; if (!bytes.empty() && !p.restore(owned(std::move(bytes)), error)) return false; }
  p.revision = fingerprint(encode_project(p.effective)); p.changed = p.revision != p.base_revision; p.ready = true; return true;
}
ProjectStatus ProjectService::status() const {
  const auto &p = *impl_; std::lock_guard<std::mutex> lock(p.mutex); ProjectStatus out;
  out.id = p.effective.id; out.name = p.effective.name; out.entry = p.effective.entry; out.revision = p.revision; out.base_revision = p.base_revision;
  out.displayed_screen = p.displayed_screen; out.displayed_revision = p.displayed_revision; out.preview = p.displaying_preview;
  out.root_instance = p.displayed_instance; out.views = p.displayed_views;
  out.base_storage = p.source.storage_info(); out.changes_storage = p.store ? p.store->storage_info() : ProjectStorageInfo{}; out.media = p.media;
  out.writable = p.ready && p.store && p.store->writable(); out.persistent = p.store && p.store->persistent(); out.storage = p.store ? p.store->description() : "read-only";
  out.replace = out.writable && p.policy.replace; out.add = out.writable && p.policy.add; out.remove = out.writable && p.policy.remove; out.changed = p.changed; out.max_bytes = p.limits.bytes;
  for (const auto &doc : p.effective.screens) out.screens.push_back(doc.name);
  for (const auto &doc : p.effective.styles) out.styles.push_back(doc.name);
  if (p.store) out.catalog_format = p.store->catalog_format();
  for (bool styles : {false, true}) for (const auto &doc : styles ? p.effective.styles : p.effective.screens) {
    const auto *base = project_detail::find(styles ? p.base.styles : p.base.screens, doc.name);
    const bool changed = !base || !equal(base->bytes, doc.bytes);
    const std::string kind = styles ? "styles" : "screens";
    out.documents.push_back({kind, doc.name, changed ? "changes" : "base",
      changed && p.store ? p.store->document_location(kind, doc.name) : out.base_storage.location + "#" + kind + "/" + doc.name, doc.bytes.size});
  }
  return out;
}
ProjectLimits ProjectService::limits() const { return impl_->limits; }
std::string ProjectService::revision() const { const auto &p = *impl_; std::lock_guard<std::mutex> lock(p.mutex); return p.revision; }
bool ProjectService::persistent() const { const auto &p = *impl_; std::lock_guard<std::mutex> lock(p.mutex); return p.store && p.store->persistent(); }
bool ProjectService::writable() const { const auto &p = *impl_; std::lock_guard<std::mutex> lock(p.mutex); return p.ready && p.store && p.store->writable(); }
ProjectBundle ProjectService::snapshot() const { const auto &p = *impl_; std::lock_guard<std::mutex> lock(p.mutex); return p.effective; }
bool ProjectService::read_screen(const std::string &name, ProjectBytes &out, std::string &error) const { const auto &p = *impl_; std::lock_guard<std::mutex> lock(p.mutex); const auto *doc = project_detail::find(p.effective.screens, name); if (!doc) return fail(error, "project_screen_not_found"); out = doc->bytes; return true; }
bool ProjectService::read_style(const std::string &name, ProjectBytes &out, std::string &error) const { const auto &p = *impl_; std::lock_guard<std::mutex> lock(p.mutex); const auto *doc = project_detail::find(p.effective.styles, name); if (!doc) return fail(error, "project_style_not_found"); out = doc->bytes; return true; }
bool ProjectService::save_project(ProjectBytes bytes, std::string &error, const std::string &expected, std::string *committed) {
  auto &p = *impl_; if (!bytes.data || !bytes.size || bytes.size > p.limits.bytes) return fail(error, "project_size");
  auto next = std::make_unique<ProjectBundle>(); if (!parse_project(owned(std::vector<uint8_t>(bytes.data, bytes.data + bytes.size)), *next, error, p.limits)) return false;
  std::lock_guard<std::mutex> lock(p.mutex);
  if (!p.save(std::move(*next), error, expected)) return false;
  if (committed) *committed = p.revision;
  return true;
}
bool ProjectService::write_screen(const std::string &name, ProjectBytes bytes, std::string &error) {
  auto &p = *impl_; if (!bytes.data || !bytes.size || bytes.size > p.limits.bytes) return fail(error, "project_size");
  std::lock_guard<std::mutex> lock(p.mutex); auto next = p.effective; replace(next.screens, {name, owned(std::vector<uint8_t>(bytes.data, bytes.data + bytes.size))}); return p.save(std::move(next), error, {});
}
bool ProjectService::write_style(const std::string &name, ProjectBytes bytes, std::string &error) {
  auto &p = *impl_; if (!bytes.data || !bytes.size || bytes.size > p.limits.bytes) return fail(error, "project_size");
  std::lock_guard<std::mutex> lock(p.mutex); auto next = p.effective; replace(next.styles, {name, owned(std::vector<uint8_t>(bytes.data, bytes.data + bytes.size))}); return p.save(std::move(next), error, {});
}
bool ProjectService::remove(const std::string &kind, const std::string &name, std::string &error) {
  auto &p = *impl_; std::lock_guard<std::mutex> lock(p.mutex); auto next = p.effective;
  if (kind != "screens" && kind != "styles") return fail(error, "project_kind");
  auto &docs = kind == "screens" ? next.screens : next.styles; if (!project_detail::find(docs, name)) return fail(error, "project_document_not_found"); replace(docs, {name, {}}); return p.save(std::move(next), error, {});
}
bool ProjectService::reset(const std::string &kind, const std::string &name, std::string &error, const std::string &expected, std::string *committed) {
  auto &p = *impl_; std::lock_guard<std::mutex> lock(p.mutex); auto next = p.effective;
  if (kind.empty() && name.empty()) next = p.base;
  else { if ((kind != "screens" && kind != "styles") || name.empty()) return fail(error, "project_kind"); auto &docs = kind == "screens" ? next.screens : next.styles; const auto *doc = project_detail::find(kind == "screens" ? p.base.screens : p.base.styles, name); replace(docs, doc ? *doc : ProjectDocument{name, {}}); }
  if (!p.save(std::move(next), error, expected)) return false;
  if (committed) *committed = p.revision;
  return true;
}
bool ProjectService::load_screen(const std::string &name, ScreenReply &reply) { return impl_->show(snapshot(), name, reply); }
bool ProjectService::preview(ProjectBytes bytes, const std::string &screen, ScreenReply &reply) {
  ProjectBundle bundle; std::string error;
  if (!parse_project(bytes, bundle, error, impl_->limits)) { reply = {}; std::snprintf(reply.error, sizeof(reply.error), "%s", error.c_str()); return false; }
  return impl_->show(std::move(bundle), screen, reply, true);
}
lv_obj_t *ProjectService::root() const { return impl_->presentation ? impl_->presentation->runtime.root() : nullptr; }
} // namespace lvgl_cbor

lv_obj_t *lvgl_cbor::ProjectService::find(const char *id) const { return impl_->presentation ? impl_->presentation->runtime.find(id) : nullptr; }
lv_obj_t *lvgl_cbor::ProjectService::find(uint32_t instance, const char *id) const { return impl_->presentation ? impl_->presentation->runtime.find(instance, id) : nullptr; }
