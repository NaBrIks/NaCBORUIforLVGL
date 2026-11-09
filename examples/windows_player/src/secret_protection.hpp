// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include <string>
// Windows account-bound DPAPI; used only by the private launcher stdio bridge.
std::string protect_secret(const std::string &, bool decrypt);
