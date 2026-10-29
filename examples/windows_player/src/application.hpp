#pragma once
#include "demo_data.hpp"
#include "lvgl_cbor/capabilities.hpp"
#include "lvgl_cbor/project_service.hpp"
#include <filesystem>
#include <memory>

class Application {
public:
  static constexpr size_t project_limit=2*1024*1024;
  DemoData data;
  std::string capabilities() const;
  bool load(const std::filesystem::path &,const std::string &entry,std::string &error);
  lvgl_cbor::DataValue command(const lvgl_cbor::DataValue &);
private:
  std::vector<uint8_t> bytes_;
  std::unique_ptr<lvgl_cbor::ConstProjectSource> source_;
  std::unique_ptr<lvgl_cbor::ProjectService> project_;
  const lvgl_cbor::Resource resources_[2]{{"montserrat_20","const lv_font_t *",&lv_font_montserrat_20},
    {"montserrat_28","const lv_font_t *",&lv_font_montserrat_28}};
};
