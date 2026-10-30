// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "../../examples/s3_style_lab/main/system_status/model.hpp"
#include <cstdlib>
#include <cstring>
#include <iostream>
static void require(bool ok, const char *message) {
  if (!ok) { std::cerr << "FAILED: " << message << '\n'; std::exit(1); }
}
int main() {
  lab_system::ClockHistory clock;
  require(!clock.synchronized, "time unknown until this boot receives synchronization");
  require(!std::strcmp(clock.state(false, true, false), "unsynced"), "offline initial state");
  require(!std::strcmp(clock.state(true, true, false), "syncing"), "network does not prove synchronized time");
  require(!std::strcmp(clock.state(true, false, false), "unavailable"), "service init remains explicit");
  clock.confirm(10000000);
  require(clock.synchronized && clock.age_seconds(14000000) == 4, "sync age uses monotonic elapsed time");
  require(!std::strcmp(clock.state(false, true, false), "holdover"), "network loss preserves clock validity");
  require(clock.age_seconds(9000000) == 0, "age cannot underflow");
  clock.confirm(16000000);
  require(clock.age_seconds(17000000) == 1, "next synchronization resets age");
  require(!std::strcmp(clock.state(true, true, true), "error") && clock.synchronized,
      "service error does not fabricate a loss of previously synchronized clock");
  std::cout << "System clock state checks passed\n";
}
