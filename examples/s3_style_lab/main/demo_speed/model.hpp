#pragma once
#include <cmath>
#include <cstdint>

namespace lab_demo_speed {
// Absolute-time trajectory: delayed dispatch skips samples instead of replaying
// an ever-growing backlog. Zero derivative at both ends and the cycle boundary.
inline constexpr int64_t sample_period_us = 40000;
inline constexpr int64_t cycle_period_us = 24000000;
inline double speed_kmh(int64_t elapsed_us) {
  if (elapsed_us <= 0) return 0;
  const double phase = double(elapsed_us % cycle_period_us) / double(cycle_period_us);
  return 90.0 * (1.0 - std::cos(6.2831853071795864769 * phase));
}
} // namespace lab_demo_speed
