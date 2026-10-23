#pragma once
#include <string>
namespace lvgl_cbor { class DataRegistry; }
namespace lab_ble {
// All calls are made by the application UI task. begin() follows NVS initialization.
bool register_data(lvgl_cbor::DataRegistry &, std::string &error);
void begin();
void process();
} // namespace lab_ble
