// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "../../examples/s3_style_lab/main/demo_speed/model.hpp"
#include <cmath>
#include <cstdio>
#include <cstdlib>

static void require(bool ok, const char *why) {
  if (!ok) { std::fprintf(stderr, "FAILED: %s\n", why); std::exit(1); }
}
int main() {
  using namespace lab_demo_speed;
  require(speed_kmh(-1) == 0 && speed_kmh(0) == 0, "initial value");
  require(std::abs(speed_kmh(cycle_period_us / 2) - 180) < 1e-9, "trajectory reaches maximum");
  double previous = 0;
  for (int64_t us = 0; us <= cycle_period_us * 3; us += sample_period_us) {
    const auto value = speed_kmh(us);
    require(std::isfinite(value) && value >= 0 && value <= 180, "bounded finite speed");
    require(std::abs(value - previous) < 1.0, "25 Hz samples change by less than 1 km/h, including cycle wrap");
    previous = value;
  }
  require(std::abs(speed_kmh(cycle_period_us - 1) - speed_kmh(cycle_period_us + 1)) < 1e-9,
          "cycle boundary is continuous");
  const auto delayed = speed_kmh(cycle_period_us * 1000 + 1234567);
  require(std::abs(delayed - speed_kmh(1234567)) < 1e-9,
          "absolute time skips delayed intervals without catch-up state");
  std::puts("Demo speed: finite bounds, smooth 25 Hz samples, extrema and delayed absolute-time trajectory passed");
}
