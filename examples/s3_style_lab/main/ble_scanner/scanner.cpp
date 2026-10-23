// Optional GPL demo adapter. Uses the owner's external yabt parsing library;
// the portable lvgl-cbor core has no BLE/yabt dependency.
#include "scanner.hpp"
#include "reducer.hpp"
#include "lvgl_cbor/data_registry.hpp"
#include "yabt_utils.hpp"
#include "esp_bt.h"
#include "esp_bt_main.h"
#include "esp_gap_ble_api.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include <atomic>
#include <cstdio>
#include <cstring>

namespace lab_ble {
namespace {
using namespace lvgl_cbor;
constexpr const char *tag = "ble_scanner";
constexpr size_t queue_capacity = 32;
// HCI report bit 4 is the legacy-PDU flag. Public IDF legacy event constants
// (0x13/0x15/0x12/0x10/0x1b/0x1a) and its property flag use that same bit.
constexpr uint8_t legacy_report_mask = ESP_BLE_GAP_SET_EXT_ADV_PROP_LEGACY;
static_assert(legacy_report_mask == 0x10 && (ESP_BLE_LEGACY_ADV_TYPE_IND & legacy_report_mask));
struct QueuedObservation { Observation value; uint32_t generation; };
StaticQueue_t queue_storage;
alignas(4) uint8_t queue_bytes[queue_capacity * sizeof(QueuedObservation)];
QueueHandle_t queue;
DataRegistry *data;
DeviceTable table;
std::atomic<uint32_t> reports{0}, dropped{0}, generation{0};
enum class Completion { None, Parameters, Start, Stop };
struct Mailbox {
  bool ready{}, running{};
  int status{};
  Completion completion{};
  unsigned revision{};
} mailbox;
portMUX_TYPE mailbox_lock = portMUX_INITIALIZER_UNLOCKED;
bool initialized{}, desired_running = true, dirty = true;
Completion pending = Completion::None;
unsigned previous_revision{};
int64_t next_publish{};
std::string last_error;

Mailbox status_snapshot() {
  portENTER_CRITICAL(&mailbox_lock);
  const auto snapshot = mailbox;
  portEXIT_CRITICAL(&mailbox_lock);
  return snapshot;
}
void complete(Completion kind, esp_bt_status_t status) {
  portENTER_CRITICAL(&mailbox_lock);
  mailbox.completion = kind; mailbox.status = status; ++mailbox.revision;
  if (status == ESP_BT_STATUS_SUCCESS) {
    if (kind == Completion::Parameters) mailbox.ready = true;
    if (kind == Completion::Start) mailbox.running = true;
    if (kind == Completion::Stop) mailbox.running = false;
  }
  portEXIT_CRITICAL(&mailbox_lock);
}
void cleanup_initialization() {
  // Only undo stages this optional adapter successfully reached. The SDK
  // unwinds a failed controller init itself; its IDLE state needs no deinit.
  auto warn = [](esp_err_t result, const char *operation) {
    if (result != ESP_OK) ESP_LOGW(tag, "%s: %s", operation, esp_err_to_name(result));
  };
  if (esp_bluedroid_get_status() == ESP_BLUEDROID_STATUS_ENABLED)
    warn(esp_bluedroid_disable(), "host disable after init failure");
  if (esp_bluedroid_get_status() == ESP_BLUEDROID_STATUS_INITIALIZED)
    warn(esp_bluedroid_deinit(), "host deinit after init failure");
  if (esp_bt_controller_get_status() == ESP_BT_CONTROLLER_STATUS_ENABLED)
    warn(esp_bt_controller_disable(), "controller disable after init failure");
  if (esp_bt_controller_get_status() == ESP_BT_CONTROLLER_STATUS_INITED)
    warn(esp_bt_controller_deinit(), "controller deinit after init failure");
  initialized = false; pending = Completion::None; dirty = true;
  portENTER_CRITICAL(&mailbox_lock);
  mailbox.ready = false; mailbox.running = false; mailbox.status = ESP_BT_STATUS_SUCCESS;
  mailbox.completion = Completion::None; ++mailbox.revision;
  portEXIT_CRITICAL(&mailbox_lock);
}
void gap(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t *param) {
  switch (event) {
  case ESP_GAP_BLE_SET_EXT_SCAN_PARAMS_COMPLETE_EVT:
    complete(Completion::Parameters, param->set_ext_scan_params.status); return;
  case ESP_GAP_BLE_EXT_SCAN_START_COMPLETE_EVT:
    complete(Completion::Start, param->ext_scan_start.status); return;
  case ESP_GAP_BLE_EXT_SCAN_STOP_COMPLETE_EVT:
    complete(Completion::Stop, param->ext_scan_stop.status); return;
  case ESP_GAP_BLE_EXT_ADV_REPORT_EVT: {
    const auto epoch = generation.load(std::memory_order_relaxed);
    reports.fetch_add(1, std::memory_order_relaxed);
    const auto &raw = param->ext_adv_report.params;
    // yabt is a transient view. Validate the outer buffer before constructing it,
    // and copy only bounded, owned values before this callback returns.
    if (raw.adv_data_len > sizeof(raw.adv_data)) {
      dropped.fetch_add(1, std::memory_order_relaxed); return;
    }
    QueuedObservation output{}; output.generation = epoch;
    auto &observation = output.value;
    std::copy(std::begin(raw.addr), std::end(raw.addr), observation.address.begin());
    observation.address_type = raw.addr_type; observation.rssi = raw.rssi;
    observation.received_ms = static_cast<uint64_t>(esp_timer_get_time() / 1000);
    // IDF forwards extended advertising fragments without reassembly. A final
    // fragment can also be marked COMPLETE, so parsing that fragment as a fresh
    // AD sequence could invent metadata. Keep all addresses/RSSI/counts, but
    // decode names/manufacturer only from complete legacy PDUs.
    if ((raw.event_type & legacy_report_mask) && raw.data_status == ESP_BLE_GAP_EXT_ADV_DATA_COMPLETE) {
      const yabt::BleGapExtAdvReport report(raw);
      auto name = report.getCompleteLocalName();
      if (!name) name = report.getShortenedLocalName();
      if (name) copy_name(observation.name, name->data(), name->size());
      const auto manufacturer = report.getManufacturerData();
      // yabt::getManufacturerId currently assumes at least two bytes. Avoid
      // that accessor for malformed one-byte manufacturer AD segments.
      if (manufacturer && manufacturer->size() >= 2)
        observation.manufacturer = (*manufacturer)[0] | (uint16_t((*manufacturer)[1]) << 8);
    }
    if (xQueueSend(queue, &output, 0) != pdTRUE) dropped.fetch_add(1, std::memory_order_relaxed);
    return;
  }
  default: return;
  }
}
bool request_running(bool enabled, std::string &error) {
  if (!initialized) { error = "scanner_unavailable"; return false; }
  desired_running = enabled; dirty = true; return true;
}
bool clear(const DataValue &, std::string &) {
  generation.fetch_add(1, std::memory_order_relaxed);
  reports.store(0, std::memory_order_relaxed); dropped.store(0, std::memory_order_relaxed);
  table.clear(); dirty = true; return true;
}
DataValue devices() {
  DataValue::Array result; result.reserve(table.size());
  for (size_t i = 0; i < table.size(); ++i) {
    const auto &device = table[i];
    char address[18];
    std::snprintf(address, sizeof(address), "%02X:%02X:%02X:%02X:%02X:%02X", device.address[0],
        device.address[1], device.address[2], device.address[3], device.address[4], device.address[5]);
    result.emplace_back(DataValue::Object{{"address", address}, {"addressType", device.address_type},
        {"name", device.name.data()}, {"rssi", device.rssi}, {"manufacturer", device.manufacturer},
        {"packets", device.packets}, {"lastSeenMs", device.received_ms}});
  }
  return result;
}
void publish(const Mailbox &actual) {
  const char *state = !last_error.empty() ? "error" : !initialized ? "unavailable" :
      !actual.ready ? "initializing" : pending == Completion::Start ? "starting" :
      pending == Completion::Stop ? "stopping" : actual.running ? "scanning" : "stopped";
  DataValue status(DataValue::Object{{"state", state}, {"packets", reports.load(std::memory_order_relaxed)},
      {"dropped", dropped.load(std::memory_order_relaxed)}, {"count", table.size()}, {"error", last_error}});
  std::string error;
  if (!data->publish("ble.scan.enabled", actual.running, error) ||
      !data->publish("ble.scan.status", std::move(status), error) ||
      !data->publish("ble.scan.devices", devices(), error)) ESP_LOGE(tag, "Publish rejected: %s", error.c_str());
}
} // namespace

bool register_data(DataRegistry &registry, std::string &error) {
  data = &registry;
  auto write_enabled = [](const DataPath &path, const DataValue &value, std::string &failure) {
    const auto *enabled = std::get_if<bool>(&value.value);
    if (!path.empty() || !enabled) { failure = "scanner_enabled_requires_boolean_root"; return false; }
    return request_running(*enabled, failure);
  };
  const auto device = DataSchema::object({{"address", DataSchema::text(17)},
      {"addressType", DataSchema::integer(0, 255)}, {"name", DataSchema::text(name_capacity)},
      {"rssi", DataSchema::integer(-128, 127)}, {"manufacturer", DataSchema::integer(-1, 65535)},
      {"packets", DataSchema::integer(0, 4294967295.0)}, {"lastSeenMs", DataSchema::integer(0)}});
  if (!registry.add_source({"ble.scan.enabled", DataSchema::boolean(), write_enabled, "BLE scanning"}, error) ||
      !registry.add_source({"ble.scan.status", DataSchema::object({{"state", DataSchema::text(16)},
        {"packets", DataSchema::integer(0, 4294967295.0)}, {"dropped", DataSchema::integer(0, 4294967295.0)},
        {"count", DataSchema::integer(0, device_capacity)}, {"error", DataSchema::text(96)}}), {}, "BLE scanner status"}, error) ||
      !registry.add_source({"ble.scan.devices", DataSchema::array(device, device_capacity), {}, "Nearby BLE devices"}, error) ||
      !registry.add_action({"ble.scan.start", DataSchema::null(), [](const DataValue &, std::string &failure) { return request_running(true, failure); }, "Start BLE scan"}, error) ||
      !registry.add_action({"ble.scan.stop", DataSchema::null(), [](const DataValue &, std::string &failure) { return request_running(false, failure); }, "Stop BLE scan"}, error) ||
      !registry.add_action({"ble.scan.clear", DataSchema::null(), clear, "Clear discovered devices"}, error)) return false;
  publish(status_snapshot()); return true;
}
void begin() {
  queue = xQueueCreateStatic(queue_capacity, sizeof(QueuedObservation), queue_bytes, &queue_storage);
  if (!queue) { last_error = "observation queue unavailable"; return; }
  auto check = [](esp_err_t result, const char *operation) {
    if (result == ESP_OK) return true;
    last_error = std::string(operation) + ": " + esp_err_to_name(result); dirty = true;
    ESP_LOGE(tag, "%s", last_error.c_str()); cleanup_initialization(); return false;
  };
  esp_bt_controller_config_t config = BT_CONTROLLER_INIT_CONFIG_DEFAULT();
  if (!check(esp_bt_controller_init(&config), "controller init") ||
      !check(esp_bt_controller_enable(ESP_BT_MODE_BLE), "controller enable") ||
      !check(esp_bluedroid_init(), "host init") || !check(esp_bluedroid_enable(), "host enable") ||
      !check(esp_ble_gap_register_callback(gap), "GAP callback")) return;
  static esp_ble_ext_scan_params_t parameters{};
  parameters.own_addr_type = BLE_ADDR_TYPE_PUBLIC;
  parameters.filter_policy = BLE_SCAN_FILTER_ALLOW_ALL;
  parameters.scan_duplicate = BLE_SCAN_DUPLICATE_DISABLE;
  parameters.cfg_mask = ESP_BLE_GAP_EXT_SCAN_CFG_UNCODE_MASK;
  parameters.uncoded_cfg.scan_type = BLE_SCAN_TYPE_PASSIVE;
  parameters.uncoded_cfg.scan_interval = 0x80; parameters.uncoded_cfg.scan_window = 0x30;
  if (!check(esp_ble_gap_set_ext_scan_params(&parameters), "scan parameters")) return;
  initialized = true; dirty = true;
}
void process() {
  if (!data) return;
  auto actual = status_snapshot();
  if (actual.revision != previous_revision) {
    previous_revision = actual.revision; dirty = true;
    if (actual.completion == Completion::Start || actual.completion == Completion::Stop) pending = Completion::None;
    if (actual.status != ESP_BT_STATUS_SUCCESS) {
      last_error = "GAP operation failed: " + std::to_string(actual.status);
      desired_running = actual.running;
      if (actual.completion == Completion::Parameters) cleanup_initialization();
    } else if (initialized) last_error.clear();
  }
  QueuedObservation observation;
  for (size_t n = 0; queue && n < queue_capacity && xQueueReceive(queue, &observation, 0) == pdTRUE; ++n)
    if (observation.generation == generation.load(std::memory_order_relaxed)) table.observe(observation.value);
  if (initialized && actual.ready && pending == Completion::None && desired_running != actual.running) {
    pending = desired_running ? Completion::Start : Completion::Stop; last_error.clear();
    const auto result = desired_running ? esp_ble_gap_start_ext_scan(0, 0) : esp_ble_gap_stop_ext_scan();
    if (result != ESP_OK) {
      pending = Completion::None; desired_running = actual.running;
      last_error = std::string("scan request: ") + esp_err_to_name(result);
    }
    dirty = true;
  }
  const auto now = esp_timer_get_time();
  if (dirty || now >= next_publish) { publish(actual); next_publish = now + 250000; dirty = false; }
}
} // namespace lab_ble
