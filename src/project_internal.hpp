#pragma once
#include "lvgl_cbor/project_service.hpp"
#include "cbor.h"
namespace lvgl_cbor::project_detail {
bool fail(std::string &, const char *);
bool map(ProjectBytes, CborParser &, CborValue &);
bool string(const CborValue &, const char *, std::string &, size_t);
bool blob(const CborValue &, const ProjectBytes &, ProjectBytes &);
bool parse(ProjectBytes, ProjectBundle &, std::string &, ProjectLimits, bool overlay);
bool valid(const ProjectBundle &, std::string &, ProjectLimits);
const ProjectDocument *find(const std::vector<ProjectDocument> &, const std::string &);
bool equal(ProjectBytes, ProjectBytes);
std::string fingerprint(const std::vector<uint8_t> &);
ProjectBytes owned(std::vector<uint8_t>);
struct Writer {
  std::vector<uint8_t> data;
  void head(unsigned, uint64_t);
  void text(const std::string &);
  void bytes(ProjectBytes);
  void docs(const std::vector<ProjectDocument> &, bool nullable = false);
  void names(const std::vector<ProjectDocument> &);
};
} // namespace lvgl_cbor::project_detail
