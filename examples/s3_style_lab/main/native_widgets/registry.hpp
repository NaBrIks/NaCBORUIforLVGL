// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/widget_registry.hpp"
class Appearance;
namespace lab_widgets { bool register_examples(lvgl_cbor::WidgetRegistry &registry, const Appearance &appearance); }
