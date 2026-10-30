#pragma once
#include "lvgl.h"
#include <vector>
#include <cstdint>

// Uses the installed Windows font; no operating-system font is redistributed.
class HostFonts {
public:
  HostFonts();
  ~HostFonts();
  HostFonts(const HostFonts &)=delete;
  HostFonts &operator=(const HostFonts &)=delete;
  const lv_font_t *small() const {return small_;}
  const lv_font_t *large() const {return large_;}
private:
  std::vector<uint8_t> bytes_;
  lv_font_t *small_{},*large_{};
};
