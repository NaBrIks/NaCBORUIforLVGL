// Application services for the optional S3 example. No NTP/network dependency
// is introduced into the portable UI runtime or its binding expressions.
#include "system_status.hpp"
#include "system_status/model.hpp"
#include "lvgl_cbor/data_registry.hpp"
#include "esp_netif.h"
#include "esp_netif_sntp.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include <cstdio>
#include <cstdlib>
#include <ctime>

#if __has_include("system_status.local.hpp")
#include "system_status.local.hpp"
#endif
#ifndef STYLE_LAB_NTP_SERVER
#define STYLE_LAB_NTP_SERVER "ntp1.yandex.ru"
#endif
#ifndef STYLE_LAB_TIMEZONE
// POSIX TZ equivalent to Asia/Yekaterinburg (UTC+05:00, no DST).
#define STYLE_LAB_TIMEZONE "YEKT-5"
#endif
static_assert(CONFIG_LWIP_SNTP_MAX_SERVERS >= 3, "Style Lab SNTP requires CONFIG_LWIP_SNTP_MAX_SERVERS=3");

namespace lab_system {
namespace {
using namespace lvgl_cbor;
constexpr const char *tag = "system_status";
struct Mailbox {
  bool connected{}, synchronized{};
  uint32_t ipv4{}, network_revision{};
  int64_t last_sync_us{};
} mailbox;
portMUX_TYPE mailbox_lock = portMUX_INITIALIZER_UNLOCKED;
DataRegistry *data;
ClockHistory clock_history;
bool service_ready{}, service_started{};
uint32_t previous_network_revision{};
int64_t next_publish{};
std::string time_error;

Mailbox snapshot() {
  portENTER_CRITICAL(&mailbox_lock);
  const auto copy = mailbox;
  portEXIT_CRITICAL(&mailbox_lock);
  return copy;
}
void synchronized(struct timeval *) {
  const auto now = esp_timer_get_time();
  portENTER_CRITICAL(&mailbox_lock);
  mailbox.synchronized = true; mailbox.last_sync_us = now;
  portEXIT_CRITICAL(&mailbox_lock);
}
void publish(const Mailbox &actual, int64_t monotonic_us) {
  DataValue::Object network{{"connected", actual.connected}};
  if (actual.connected && actual.ipv4) {
    esp_ip4_addr_t address{}; address.addr = actual.ipv4;
    char ip[16]; std::snprintf(ip, sizeof(ip), IPSTR, IP2STR(&address));
    network.emplace("ip", ip);
  }
  DataValue::Object clock{{"syncState", clock_history.state(actual.connected, service_ready, !time_error.empty())},
      {"timezone", STYLE_LAB_TIMEZONE}, {"error", time_error}};
  if (clock_history.synchronized) {
    const auto now = std::time(nullptr);
    std::tm local{}; char text[9];
    if (now >= 0 && localtime_r(&now, &local) && std::strftime(text, sizeof(text), "%H:%M:%S", &local)) {
      clock.emplace("localTime", text); clock.emplace("unixSeconds", static_cast<int64_t>(now));
    }
    clock.emplace("lastSyncAgeSeconds", clock_history.age_seconds(monotonic_us));
  }
  std::string error;
  if (!data->publish("system.network", std::move(network), error) ||
      !data->publish("system.clock", std::move(clock), error))
    ESP_LOGE(tag, "Publish rejected: %s", error.c_str());
}
} // namespace
bool register_data(DataRegistry &registry, std::string &error) {
  data = &registry;
  if (!registry.add_source({"system.network", DataSchema::object({
        {"connected", DataSchema::boolean()}, {"ip", DataSchema::text(15)}}), {}, "Network status"}, error) ||
      !registry.add_source({"system.clock", DataSchema::object({
        {"syncState", DataSchema::text(16)}, {"timezone", DataSchema::text(63)},
        {"localTime", DataSchema::text(8)}, {"unixSeconds", DataSchema::integer(0)},
        {"lastSyncAgeSeconds", DataSchema::integer(0)}, {"error", DataSchema::text(96)}}), {}, "System clock"}, error))
    return false;
  const auto now = esp_timer_get_time();
  publish(snapshot(), now); next_publish = now + 1000000; return true;
}
bool begin_time() {
  if (service_ready) return true;
  if (!STYLE_LAB_NTP_SERVER[0] || setenv("TZ", STYLE_LAB_TIMEZONE, 1) != 0) {
    time_error = "NTP server or timezone unavailable"; return false;
  }
  tzset();
  // lwIP owns DNS, server failover and its bounded retry schedule.
  esp_sntp_config_t config = ESP_NETIF_SNTP_DEFAULT_CONFIG_MULTIPLE(3,
      ESP_SNTP_SERVER_LIST(STYLE_LAB_NTP_SERVER, "pool.ntp.org", "time.google.com"));
  config.start = false; config.wait_for_sync = false; config.sync_cb = synchronized;
  const auto result = esp_netif_sntp_init(&config);
  if (result != ESP_OK) {
    time_error = std::string("SNTP init: ") + esp_err_to_name(result);
    ESP_LOGW(tag, "%s", time_error.c_str()); return false;
  }
  service_ready = true; time_error.clear(); return true;
}
void network_changed(bool connected, uint32_t ipv4) {
  portENTER_CRITICAL(&mailbox_lock);
  mailbox.connected = connected && ipv4 != 0; mailbox.ipv4 = mailbox.connected ? ipv4 : 0;
  ++mailbox.network_revision;
  portEXIT_CRITICAL(&mailbox_lock);
}
void process() {
  if (!data) return;
  const auto actual = snapshot(); const auto now = esp_timer_get_time();
  if (actual.network_revision != previous_network_revision) {
    previous_network_revision = actual.network_revision; service_started = false;
  }
  if (actual.synchronized) clock_history.confirm(actual.last_sync_us);
  // Reacquiring an address restarts the asynchronous poll; no UI wait for NTP.
  if (!actual.connected) service_started = false;
  if (service_ready && actual.connected && !service_started) {
    const auto result = esp_netif_sntp_start();
    if (result == ESP_OK) { service_started = true; time_error.clear(); }
    else { service_started = true; time_error = std::string("SNTP start: ") + esp_err_to_name(result); }
  }
  if (now >= next_publish) { publish(actual, now); next_publish = now + 1000000; }
}
} // namespace lab_system
