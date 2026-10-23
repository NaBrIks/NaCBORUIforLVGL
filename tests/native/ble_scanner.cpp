#include "../../examples/s3_style_lab/main/ble_scanner/reducer.hpp"
#include <cstdlib>
#include <iostream>
#include <string>
static void require(bool value, const char *message) {
  if (!value) { std::cerr << "FAILED: " << message << '\n'; std::exit(1); }
}
int main() {
  lab_ble::DeviceTable table;
  lab_ble::Observation report;
  report.address[5] = 1; report.rssi = -80; report.received_ms = 10;
  lab_ble::copy_name(report.name, "Sensor", 6); report.manufacturer = 0x1234;
  table.observe(report); require(table.size() == 1 && table[0].packets == 1, "first observation");
  report.rssi = -42; report.received_ms = 20; report.name.fill(0); report.manufacturer = -1;
  table.observe(report);
  require(table.size() == 1 && table[0].packets == 2 && table[0].rssi == -42, "address updates stable slot");
  require(std::string(table[0].name.data()) == "Sensor" && table[0].manufacturer == 0x1234, "missing AD fields retain prior values");
  report.address_type = 1; table.observe(report);
  require(table.size() == 2, "same bytes with different address type remain distinct");
  for (unsigned i = 2; i <= 16; ++i) {
    report.address[5] = static_cast<uint8_t>(i); report.received_ms = 20 + i;
    table.observe(report);
  }
  require(table.size() == lab_ble::device_capacity, "fixed device capacity");
  bool oldest_present = false;
  for (size_t i = 0; i < table.size(); ++i)
    oldest_present |= table[i].address[5] == 1 && table[i].address_type == 0;
  require(!oldest_present, "least recently seen entry evicted");
  require(report.address[5] == 16 && !report.name[0], "observation remains caller owned");
  std::array<char, lab_ble::name_capacity + 1> name;
  const std::string long_name(80, 'X'); lab_ble::copy_name(name, long_name.data(), long_name.size());
  require(std::strlen(name.data()) == 32 && name.back() == 0, "bounded name with terminator");
  const std::string utf8 = std::string(31, 'A') + "\xc2\xb0";
  lab_ble::copy_name(name, utf8.data(), utf8.size());
  require(std::strlen(name.data()) == 31, "UTF-8 truncated between code points");
  const char dirty[]{'A', '\n', char(0xff), 'B'}; lab_ble::copy_name(name, dirty, sizeof(dirty));
  require(std::string(name.data()) == "A ?B", "invalid UTF-8 and control bytes sanitized");
  lab_ble::copy_name(name, nullptr, 20); require(!name[0], "missing name");
  table.clear(); require(table.size() == 0, "clear table");
  table.observe(report); require(table.size() == 1 && table[0].packets == 1, "clear resets packet history");
  std::cout << "BLE scanner reducer checks passed\n";
}
