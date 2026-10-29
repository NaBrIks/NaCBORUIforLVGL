#pragma once
#include "lvgl_cbor/project_service.hpp"
#include "lvgl_cbor/style_runtime.hpp"
#include <filesystem>
#include <map>

// Application-owned style resources. Every page uses the same stable addresses.
class Appearance {
public:
  struct Choice {std::string id,title;std::vector<lvgl_cbor::StyleHandle> styles;};
  Appearance();
  std::vector<lvgl_cbor::Resource> resources() const;
  void load(const std::filesystem::path &,const std::string &initial,
            const lvgl_cbor::Resource *,size_t);
  void select(const std::string &);
  const std::vector<Choice> &choices() const {return choices_;}
  const std::string &selected() const {return selected_;}
private:
  std::vector<std::string> roles_;
  std::map<std::string,std::shared_ptr<lvgl_cbor::StyleValue>> active_;
  std::vector<Choice> choices_;
  std::string selected_;
};
