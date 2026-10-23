#pragma once
// Portable, bounded application state. No BLE, LVGL or third-party dependency.
#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <limits>

namespace lab_ble {
constexpr size_t device_capacity = 16;
constexpr size_t name_capacity = 32;

// Advertising names are arbitrary bytes. Keep valid UTF-8, remove controls and
// truncate only between complete code points so the published document is valid.
inline void copy_name(std::array<char, name_capacity + 1> &out, const char *data, size_t length) {
  out.fill(0);
  size_t write = 0;
  for (size_t read = 0; data && read < length && write < name_capacity;) {
    const auto first = static_cast<unsigned char>(data[read]);
    if (!first) break;
    if (first < 0x80) {
      out[write++] = first < 32 || first == 127 ? ' ' : static_cast<char>(first);
      ++read;
      continue;
    }
    size_t count = first >= 0xc2 && first <= 0xdf ? 2 :
                   first >= 0xe0 && first <= 0xef ? 3 :
                   first >= 0xf0 && first <= 0xf4 ? 4 : 0;
    bool valid = count && read + count <= length;
    for (size_t i = 1; valid && i < count; ++i)
      valid = (static_cast<unsigned char>(data[read + i]) & 0xc0) == 0x80;
    if (valid && count >= 3) {
      const auto second = static_cast<unsigned char>(data[read + 1]);
      valid = !(first == 0xe0 && second < 0xa0) && !(first == 0xed && second >= 0xa0) &&
              !(first == 0xf0 && second < 0x90) && !(first == 0xf4 && second >= 0x90);
    }
    if (!valid) { out[write++] = '?'; ++read; continue; }
    if (write + count > name_capacity) break;
    std::memcpy(out.data() + write, data + read, count);
    write += count; read += count;
  }
}

struct Observation {
  std::array<uint8_t, 6> address{};
  uint8_t address_type{};
  int8_t rssi{};
  int32_t manufacturer = -1;
  uint64_t received_ms{};
  std::array<char, name_capacity + 1> name{};
};
struct Device : Observation { uint32_t packets{}; };

class DeviceTable {
public:
  void observe(const Observation &input) {
    size_t slot = 0;
    while (slot < size_ && (devices_[slot].address != input.address ||
                            devices_[slot].address_type != input.address_type)) ++slot;
    const bool existing = slot < size_;
    if (!existing) {
      if (size_ < device_capacity) ++size_;
      else slot = static_cast<size_t>(std::min_element(devices_.begin(), devices_.end(),
          [](const Device &a, const Device &b) { return a.received_ms < b.received_ms; }) - devices_.begin());
      devices_[slot] = Device{};
    }
    auto &device = devices_[slot];
    const auto previous_name = device.name;
    const auto previous_manufacturer = device.manufacturer;
    static_cast<Observation &>(device) = input;
    device.name.back() = 0;
    if (existing && !input.name[0]) device.name = previous_name;
    if (existing && input.manufacturer < 0) device.manufacturer = previous_manufacturer;
    if (device.packets != std::numeric_limits<uint32_t>::max()) ++device.packets;
  }
  void clear() { devices_ = {}; size_ = 0; }
  size_t size() const { return size_; }
  const Device &operator[](size_t index) const { return devices_[index]; }
private:
  std::array<Device, device_capacity> devices_{};
  size_t size_{};
};
} // namespace lab_ble
