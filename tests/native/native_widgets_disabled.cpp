// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "../../examples/s3_style_lab/main/native_widgets/registry.hpp"
#include <cstdio>
int main() {
  lvgl_cbor::WidgetRegistry registry;
  if(!lab_widgets::register_examples(registry) || !registry.entries().empty()) return 1;
  std::puts("Native demo module disabled: no registrations");
}
