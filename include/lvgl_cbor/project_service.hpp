#pragma once
#include "screen_runtime.hpp"
#include <memory>
#include <string>
#include <vector>

namespace lvgl_cbor {
// A view into flash or an owned immutable packet. The owner accompanies borrowed entries.
struct ProjectBytes {
  const uint8_t *data{};
  size_t size{};
  std::shared_ptr<const std::vector<uint8_t>> owner;
};
struct ProjectDocument { std::string name; ProjectBytes bytes; };
struct ProjectBundle {
  ProjectBytes manifest;
  std::string id, name, entry;
  std::vector<ProjectDocument> screens, styles;
};
struct ProjectLimits { size_t bytes = 262144, items = 128; };
struct ProjectStorageInfo {
  std::string kind, location;
  bool persistent{}, writable{};
  std::string state = "available";
};
bool parse_project(ProjectBytes, ProjectBundle &, std::string &error, ProjectLimits = {});
std::vector<uint8_t> encode_project(const ProjectBundle &);

// Sources own their lifetime. A const bundle can borrow PROGMEM directly.
class ProjectSource {
public:
  virtual ~ProjectSource() = default;
  virtual bool read(ProjectBundle &, std::string &error, ProjectLimits) const = 0;
  virtual ProjectStorageInfo storage_info() const { return {"custom", "", false, false, "unknown"}; }
};
class ConstProjectSource final : public ProjectSource {
  ProjectBytes bytes_;
  ProjectStorageInfo info_;
public:
  ConstProjectSource(const uint8_t *data, size_t size, ProjectStorageInfo info = {"firmware", "compiled project", true, false, "available"}) : bytes_{data, size, {}}, info_(std::move(info)) {}
  bool read(ProjectBundle &, std::string &, ProjectLimits) const override;
  ProjectStorageInfo storage_info() const override { return info_; }
};
class FileProjectSource final : public ProjectSource {
  std::string path_;
  std::string medium_;
public:
  explicit FileProjectSource(std::string path, std::string medium = "filesystem") : path_(std::move(path)), medium_(std::move(medium)) {}
  bool read(ProjectBundle &, std::string &, ProjectLimits) const override;
  ProjectStorageInfo storage_info() const override { return {medium_, path_, true, false, "available"}; }
};
// One optional changes store. commit publishes one complete delta, never a partial edit.
// load returns true with empty bytes only when no saved changes exist; IO errors are failures.
class ProjectStore {
public:
  virtual ~ProjectStore() = default;
  virtual bool load(std::vector<uint8_t> &, size_t max_bytes, std::string &error) = 0;
  virtual bool commit(const std::vector<uint8_t> &, std::string &error) = 0;
  virtual bool persistent() const = 0;
  virtual bool writable() const { return true; }
  virtual std::string catalog_format() const { return {}; }
  virtual std::string document_location(const std::string &, const std::string &) const { return {}; }
  virtual const char *description() const = 0;
  virtual ProjectStorageInfo storage_info() const { return {description(), "", persistent(), true, "available"}; }
};
class MemoryProjectStore final : public ProjectStore {
  std::vector<uint8_t> bytes_;
public:
  bool load(std::vector<uint8_t> &, size_t, std::string &) override;
  bool commit(const std::vector<uint8_t> &, std::string &) override;
  bool persistent() const override { return false; }
  const char *description() const override { return "RAM"; }
};
// Uses two checksummed generations at prefix.0/prefix.1 on an application-mounted FS/SD.
// No mount, path selection, SD driver, HTTP or ESP dependency in this adapter.
class FileProjectStore final : public ProjectStore {
  std::string prefix_;
  std::string medium_;
  uint64_t generation_{};
  unsigned slot_{};
  bool loaded_{};
public:
  explicit FileProjectStore(std::string prefix, std::string medium = "filesystem") : prefix_(std::move(prefix)), medium_(std::move(medium)) {}
  bool load(std::vector<uint8_t> &, size_t, std::string &) override;
  bool commit(const std::vector<uint8_t> &, std::string &) override;
  bool persistent() const override { return true; }
  const char *description() const override { return "filesystem"; }
  ProjectStorageInfo storage_info() const override { return {medium_, prefix_, true, true, loaded_ ? "available" : "unknown"}; }
};
// One directory/catalog layer, with independent screen/style packets. The inactive
// bank is written first; its checksummed catalog is published last. Works on flat
// filesystems too (filenames <= 10 bytes). The application mounts/provisions it.
class CatalogProjectStore final : public ProjectStore {
  struct Impl;
  std::unique_ptr<Impl> impl_;
public:
  explicit CatalogProjectStore(std::string directory, std::string medium = "filesystem");
  ~CatalogProjectStore();
  void enabled(bool); // Set before begin(); failed mount can leave the ROM base read-only.
  bool load(std::vector<uint8_t> &, size_t, std::string &) override;
  bool commit(const std::vector<uint8_t> &, std::string &) override;
  bool persistent() const override { return true; }
  bool writable() const override;
  const char *description() const override { return "catalog"; }
  ProjectStorageInfo storage_info() const override;
  std::string catalog_format() const override { return "lvgl-project-catalog-1"; }
  std::string document_location(const std::string &, const std::string &) const override;
};
struct ProjectPolicy { bool replace = true, add = true, remove = true; };
struct ProjectDocumentInfo { std::string kind, name, origin, location; size_t bytes{}; };
struct ProjectStatus {
  std::string id, name, entry, revision, base_revision, storage;
  std::string displayed_screen, displayed_revision;
  std::vector<std::string> screens, styles;
  bool writable{}, persistent{}, replace{}, add{}, remove{}, changed{};
  bool preview{};
  uint32_t root_instance{};
  std::vector<ScreenViewStatus> views;
  ProjectStorageInfo base_storage, changes_storage;
  std::vector<ProjectStorageInfo> media;
  std::string catalog_format;
  std::vector<ProjectDocumentInfo> documents;
  size_t max_bytes{};
};
// Application-owned high-level service. Storage calls are serialized internally.
// load_screen/preview/destruction run only in the application's serialized LVGL context.
// The source, store, resources and native registry outlive this service. No global singleton.
class ProjectService {
public:
  ProjectService(const ProjectSource &, ProjectStore *changes = nullptr,
                 ProjectPolicy = {}, ProjectLimits = {}, const Resource * = nullptr,
                 size_t resource_count = 0, WidgetRegistry * = nullptr,
                 std::vector<ProjectStorageInfo> media = {}, DataRegistry *data = nullptr);
  ~ProjectService();
  ProjectService(const ProjectService &) = delete;
  ProjectService &operator=(const ProjectService &) = delete;
  bool begin(std::string &error);
  ProjectStatus status() const;
  std::string revision() const;
  bool persistent() const;
  ProjectLimits limits() const;
  bool writable() const;
  ProjectBundle snapshot() const;
  bool read_screen(const std::string &, ProjectBytes &, std::string &error) const;
  bool read_style(const std::string &, ProjectBytes &, std::string &error) const;
  bool save_project(ProjectBytes, std::string &error, const std::string &expected_revision = {},
                    std::string *committed_revision = nullptr);
  bool write_screen(const std::string &, ProjectBytes, std::string &error);
  bool write_style(const std::string &, ProjectBytes, std::string &error);
  bool remove(const std::string &kind, const std::string &name, std::string &error);
  bool reset(const std::string &kind, const std::string &name, std::string &error,
             const std::string &expected_revision = {}, std::string *committed_revision = nullptr);
  bool load_screen(const std::string &name, ScreenReply &);
  bool preview(ProjectBytes complete_project, const std::string &screen, ScreenReply &);
  lv_obj_t *root() const;
  lv_obj_t *find(const char *id) const;
  lv_obj_t *find(uint32_t instance, const char *id) const;
private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
} // namespace lvgl_cbor
