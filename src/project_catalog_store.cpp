// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "project_internal.hpp"
#include "cbor_reader.hpp"
#include <algorithm>
#include <cerrno>
#include <cstdio>
#include <cstring>
#include <limits>
#ifdef _WIN32
#include <io.h>
#else
#include <unistd.h>
#include <dirent.h>
#endif

namespace lvgl_cbor {
using namespace project_detail;
namespace {
uint64_t hash(const uint8_t *p, size_t n) { uint64_t h = 14695981039346656037ULL; while (n--) { h ^= *p++; h *= 1099511628211ULL; } return h; }
uint64_t number(const uint8_t *p) { uint64_t n{}; for (unsigned i = 0; i < 8; ++i) n = (n << 8) | p[i]; return n; }
void number(std::vector<uint8_t> &out, uint64_t n) { for (unsigned i = 8; i; --i) out.push_back(uint8_t(n >> (8 * (i - 1)))); }
std::string filename(unsigned bank, bool styles, size_t index) { char out[16]; std::snprintf(out, sizeof(out), "%u%c%03u.cbor", bank, styles ? 't' : 's', unsigned(index)); return out; }
bool read(const std::string &path, std::vector<uint8_t> &out, size_t max, bool &missing) {
  missing = false; out.clear(); FILE *file = std::fopen(path.c_str(), "rb");
  if (!file) { missing = errno == ENOENT; return missing; }
  uint8_t block[512]; bool ok = true;
  for (;;) { const auto n = std::fread(block, 1, sizeof(block), file); if (n > max - out.size()) { ok = false; break; } out.insert(out.end(), block, block + n); if (n < sizeof(block)) { ok = !std::ferror(file); break; } }
  return std::fclose(file) == 0 && ok;
}
bool write(const std::string &path, const uint8_t *data, size_t size) {
  FILE *file = std::fopen(path.c_str(), "wb"); if (!file) return false;
  bool ok = std::fwrite(data, 1, size, file) == size && std::fflush(file) == 0;
#ifdef _WIN32
  if (ok) ok = _commit(_fileno(file)) == 0;
#else
  if (ok) ok = fsync(fileno(file)) == 0;
#endif
  return std::fclose(file) == 0 && ok;
}
bool copy_field(Writer &w, const CborValue &root, const char *key) {
  CborValue value; if (!detail::field(root, key, value)) return false;
  const auto *begin = cbor_value_get_next_byte(&value);
  if (cbor_value_advance(&value) != CborNoError) return false;
  w.text(key); w.data.insert(w.data.end(), begin, cbor_value_get_next_byte(&value)); return true;
}
using Locations = std::vector<ProjectDocumentInfo>;
// Enumerate once: probing all 256 absent slot names costs seconds on SPIFFS.
// Collect first, then delete, since unlinking can invalidate a directory cursor.
bool list(const std::string &root, std::vector<std::string> &names) {
#ifdef _WIN32
  _finddata_t entry; const intptr_t handle = _findfirst((root + "/*").c_str(), &entry);
  if (handle == -1) return errno == ENOENT;
  do { names.emplace_back(entry.name); } while (_findnext(handle, &entry) == 0);
  const bool ok = errno == ENOENT; _findclose(handle); return ok;
#else
  DIR *directory = opendir(root.c_str()); if (!directory) { std::perror("project_catalog_opendir"); return false; }
  bool ok{};
  for (;;) {
    // Allocating a name may change errno (e.g. an internal heap fallback).
    // Only errno from the terminating readdir belongs to the iteration result.
    errno = 0; auto *entry = readdir(directory);
    // ESP-IDF 5.4 SPIFFS can report stale END_OF_OBJECT from an earlier fread
    // as EIO on the first directory EOF, then clears it. Retry that read once;
    // a genuine persistent I/O failure still aborts before publishing anything.
    if (!entry && errno == EIO) { errno = 0; entry = readdir(directory); }
    if (!entry) { ok = errno == 0; if (!ok) std::perror("project_catalog_readdir"); break; }
    names.emplace_back(entry->d_name);
  }
  return closedir(directory) == 0 && ok;
#endif
}
bool slot(const std::string &name, unsigned bank, bool &styles, size_t &index) {
  if (name.size() != 10 || name[0] != char('0' + bank) || (name[1] != 's' && name[1] != 't') || name.substr(5) != ".cbor") return false;
  index = 0;
  for (unsigned i = 2; i < 5; ++i) { if (name[i] < '0' || name[i] > '9') return false; index = 10 * index + unsigned(name[i] - '0'); }
  styles = name[1] == 't'; return index < 128;
}
} // namespace
struct CatalogProjectStore::Impl {
  struct Commit {
    ProjectBundle overlay;
    ProjectBytes owner;
    CborParser parser; CborValue root;
    std::string base;
    Locations where;
    Writer writer;
    std::vector<std::string> files;
    std::vector<uint8_t> envelope;
  };
  std::string root, medium;
  uint64_t generation{}; unsigned bank{}; size_t max{};
  bool enabled = true, loaded{};
  Locations locations;
  std::string path(const std::string &name) const { return root + "/" + name; }
  bool expand(const std::vector<uint8_t> &index, unsigned slot, std::vector<uint8_t> &out, Locations &where) const {
    auto owner = owned(index); CborParser parser; CborValue root_map, value; std::string format, base;
    const char *keys[]{"format", "base", "manifest", "screens", "styles", "screenOrder", "styleOrder"};
    if (!map(owner, parser, root_map) || !detail::keys(root_map, keys, 7) || !string(root_map, "format", format, 32) || format != "lvgl-project-catalog-1" || !string(root_map, "base", base, 16)) return false;
    Writer w; w.head(5, 7); w.text("format"); w.text("lvgl-project-overlay-1"); w.text("base"); w.text(base);
    if (!copy_field(w, root_map, "manifest")) return false;
    size_t budget = 0;
    for (bool styles : {false, true}) {
      const char *kind = styles ? "styles" : "screens"; CborValue items; size_t count{};
      if (!detail::field(root_map, kind, value) || !cbor_value_is_map(&value) || cbor_value_get_map_length(&value, &count) != CborNoError || count > 128 || cbor_value_enter_container(&value, &items) != CborNoError) return false;
      w.text(kind); w.head(5, count);
      for (size_t i = 0; i < count; ++i) {
        char name[64]; if (!detail::text(items, name, sizeof(name)) || !name[0] || cbor_value_advance(&items) != CborNoError) return false;
        w.text(name);
        if (cbor_value_is_null(&items)) w.data.push_back(0xf6);
        else {
          std::string file, digest; CborValue size_value; uint64_t size{};
          const char *reference_keys[]{"file", "bytes", "hash"};
          if (!cbor_value_is_map(&items) || !detail::keys(items, reference_keys, 3) || !string(items, "file", file, 10) || file != filename(slot, styles, i) || !string(items, "hash", digest, 16) || !detail::field(items, "bytes", size_value) || !cbor_value_is_unsigned_integer(&size_value) || cbor_value_get_uint64(&size_value, &size) != CborNoError || !size || size > max - std::min(max, budget)) return false;
          std::vector<uint8_t> packet; bool missing{};
          if (!read(path(file), packet, size_t(size), missing) || missing || packet.size() != size || fingerprint(packet) != digest) return false;
          budget += packet.size(); w.bytes({packet.data(), packet.size(), {}});
          where.push_back({kind, name, "changes", path(file), packet.size()});
        }
        if (cbor_value_advance(&items) != CborNoError) return false;
      }
    }
    if (!copy_field(w, root_map, "screenOrder") || !copy_field(w, root_map, "styleOrder") || w.data.size() > max) return false;
    ProjectBundle check; std::string error;
    if (!parse(owned(w.data), check, error, {max, 128}, true)) return false;
    out = std::move(w.data); return true;
  }
};
CatalogProjectStore::CatalogProjectStore(std::string root, std::string medium) : impl_(std::make_unique<Impl>()) {
  while (!root.empty() && root.back() == '/') root.pop_back();
  impl_->root = std::move(root); impl_->medium = std::move(medium);
}
CatalogProjectStore::~CatalogProjectStore() = default;
void CatalogProjectStore::enabled(bool value) { impl_->enabled = value; }
bool CatalogProjectStore::writable() const { return impl_->enabled && impl_->loaded; }
ProjectStorageInfo CatalogProjectStore::storage_info() const { const auto &p = *impl_; return {p.medium, p.path("catalog.{0,1}"), true, writable(), !p.enabled ? "unavailable" : p.loaded ? "available" : "unknown"}; }
std::string CatalogProjectStore::document_location(const std::string &kind, const std::string &name) const {
  for (const auto &doc : impl_->locations) if (doc.kind == kind && doc.name == name) return doc.location;
  return {};
}
bool CatalogProjectStore::load(std::vector<uint8_t> &out, size_t max, std::string &error) {
  auto &p = *impl_; out.clear(); p.generation = 0; p.max = max; p.loaded = false; p.locations.clear();
  if (!p.enabled) return true;
  unsigned present{};
  for (unsigned slot = 0; slot < 2; ++slot) {
    std::vector<uint8_t> bytes, overlay; bool missing{}; Locations where;
    const bool ok = read(p.path("catalog." + std::to_string(slot)), bytes, max + 32, missing);
    if (missing) continue;
    ++present;
    if (!ok || bytes.size() < 32 || std::memcmp(bytes.data(), "LVPROJ01", 8)) continue;
    const uint64_t generation = number(bytes.data() + 8), size = number(bytes.data() + 16);
    if (!generation || generation <= p.generation || size != bytes.size() - 32 || hash(bytes.data(), bytes.size() - 8) != number(bytes.data() + bytes.size() - 8)) continue;
    const std::vector<uint8_t> index(bytes.begin() + 24, bytes.end() - 8);
    if (!p.expand(index, slot, overlay, where)) continue;
    p.generation = generation; p.bank = slot; out = std::move(overlay); p.locations = std::move(where);
  }
  if (present && !p.generation) return fail(error, "project_catalog_corrupt");
  p.loaded = true; return true;
}
bool CatalogProjectStore::commit(const std::vector<uint8_t> &bytes, std::string &error) {
  auto &p = *impl_; if (!writable() || p.generation == std::numeric_limits<uint64_t>::max()) return fail(error, "project_catalog_not_ready");
  // File/VFS calls already need a deep stack. Keep the transaction's metadata
  // off small transport task stacks; this does not allocate an execution tree.
  auto transaction = std::make_unique<Impl::Commit>();
  auto &overlay = transaction->overlay; auto &owner = transaction->owner;
  auto &root = transaction->root; auto &base = transaction->base;
  auto &where = transaction->where; auto &files = transaction->files;
  auto &w = transaction->writer; auto &envelope = transaction->envelope;
  owner = owned(bytes);
  if (!parse(owner, overlay, error, {p.max, 128}, true) || !map(owner, transaction->parser, root) || !string(root, "base", base, 16)) return fail(error, "project_catalog_overlay");
  const unsigned next = p.generation ? 1 - p.bank : 0;
  if (!list(p.root, files)) return fail(error, "project_catalog_directory");
  for (const auto &file : files) {
    bool styles{}; size_t index{}; if (!slot(file, next, styles, index)) continue;
    const auto &docs = styles ? overlay.styles : overlay.screens;
    if ((index >= docs.size() || !docs[index].bytes.size) && std::remove(p.path(file).c_str()) && errno != ENOENT) return fail(error, "project_catalog_document_remove");
  }
  w.head(5, 7); w.text("format"); w.text("lvgl-project-catalog-1"); w.text("base"); w.text(base); w.text("manifest"); w.bytes(overlay.manifest);
  for (bool styles : {false, true}) {
    const char *kind = styles ? "styles" : "screens"; const auto &docs = styles ? overlay.styles : overlay.screens;
    w.text(kind); w.head(5, docs.size());
    for (size_t i = 0; i < docs.size(); ++i) {
      const auto &doc = docs[i]; w.text(doc.name);
      if (!doc.bytes.size) { w.data.push_back(0xf6); continue; }
      const auto file = filename(next, styles, i); const auto path = p.path(file);
      if (!write(path, doc.bytes.data, doc.bytes.size)) return fail(error, "project_catalog_document_write");
      w.head(5, 3); w.text("file"); w.text(file); w.text("bytes"); w.head(0, doc.bytes.size); w.text("hash"); w.text(fingerprint(std::vector<uint8_t>(doc.bytes.data, doc.bytes.data + doc.bytes.size)));
      where.push_back({kind, doc.name, "changes", path, doc.bytes.size});
    }
  }
  if (!copy_field(w, root, "screenOrder") || !copy_field(w, root, "styleOrder") || w.data.size() > p.max) return fail(error, "project_catalog_index");
  // Never truncate the active bank. A torn document/index leaves it readable.
  envelope = {'L','V','P','R','O','J','0','1'}; number(envelope, p.generation + 1); number(envelope, w.data.size()); envelope.insert(envelope.end(), w.data.begin(), w.data.end()); number(envelope, hash(envelope.data(), envelope.size()));
  if (!write(p.path("catalog." + std::to_string(next)), envelope.data(), envelope.size())) return fail(error, "project_catalog_index_write");
  ++p.generation; p.bank = next; p.locations = std::move(where); return true;
}
} // namespace lvgl_cbor
