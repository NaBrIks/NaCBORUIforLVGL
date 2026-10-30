#pragma once
#include "lvgl.h"
#include <array>

// Independently generated 18x18 alpha test image, shared by the desktop and MCU.
namespace demo_small_image {
inline const std::array<uint8_t,18*18> pixels=[] {
  std::array<uint8_t,18*18> result{};
  for(size_t y=0;y<18;y++)for(size_t x=0;x<18;x++)result[y*18+x]=((x/3+y/3)%2)?255:40;
  return result;
}();
inline const lv_image_dsc_t image=[] {
  lv_image_dsc_t result{};result.header.magic=LV_IMAGE_HEADER_MAGIC;result.header.cf=LV_COLOR_FORMAT_A8;
  result.header.w=18;result.header.h=18;result.header.stride=18;
  result.data_size=pixels.size();result.data=pixels.data();return result;
}();
}
