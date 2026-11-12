// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "pointer.hpp"

void start_view_network(bool pointer_ready);
uint32_t view_network_ipv4();
unsigned view_network_wifi_reason();
void process_view_input(native_view::Pointer &pointer);
void process_view_socket(uint32_t generation);
