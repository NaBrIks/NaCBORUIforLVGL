#pragma once
#include "../../common/appearance/appearance.hpp"
#include <filesystem>
void load_appearance_file(Appearance &,const std::filesystem::path &,const std::string &,
                          const lvgl_cbor::Resource *,size_t);
