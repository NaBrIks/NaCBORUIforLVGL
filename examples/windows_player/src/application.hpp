#pragma once
#include "demo_data.hpp"
#include "appearance.hpp"
#include "lvgl_cbor/capabilities.hpp"
#include "lvgl_cbor/project_service.hpp"
#include <filesystem>
#include <memory>

class Application {
public:
  static constexpr size_t project_limit=2*1024*1024;
  Appearance appearance;
  DemoData data;
  Application();
  void load_schemes(const std::filesystem::path &,const std::string &);
  std::string capabilities() const;
  bool load(const std::filesystem::path &,const std::string &entry,std::string &error);
  lvgl_cbor::DataValue command(const lvgl_cbor::DataValue &);
private:
  std::vector<lvgl_cbor::Resource> resources_;
  std::vector<uint8_t> bytes_;
  std::unique_ptr<lvgl_cbor::ConstProjectSource> source_;
  std::unique_ptr<lvgl_cbor::ProjectService> project_;
};
