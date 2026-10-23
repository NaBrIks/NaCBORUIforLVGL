#pragma once
#include "component_preview.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "lvgl_cbor/screen_runtime.hpp"
#include <atomic>
#include <NaWServer/websocket.h>
// Transport owns its bounded queue; only process() (the UI task) calls LVGL.
class ScreenEndpoint {
public:
  static constexpr size_t max_packet = 3584;
  ScreenEndpoint(const lvgl_cbor::Resource *, size_t, lvgl_cbor::StyleService *service = nullptr,
                 lvgl_cbor::WidgetRegistry *registry = nullptr, lvgl_cbor::DataRegistry *data = nullptr);
  NaWServer::WebSocketEndpoint &endpoint() {
    return socket_;
  }
  NaWServer::WebSocketEndpoint &component_endpoint() {
    return component_socket_;
  }
  int component_type() const {
    return preview_.type();
  }
  void begin(lv_obj_t *preview_parent, lvgl_cbor::StyleRuntime *styles);
  void process();
  lv_obj_t *find(const char *id) const { return runtime_.find(id); }
  lv_obj_t *find(uint32_t instance, const char *id) const { return runtime_.find(instance, id); }
  unsigned received() const {
    return received_.load(std::memory_order_relaxed);
  }
  unsigned applied() const {
    return applied_.load(std::memory_order_relaxed);
  }

private:
  struct Packet {
    size_t size;
    bool component;
    uint8_t data[max_packet];
  };
  NaWServer::WebSocketEndpoint socket_{"/screen-ws"};
  NaWServer::WebSocketEndpoint component_socket_{"/component-ws"};
  lvgl_cbor::ScreenRuntime runtime_;
  ComponentPreview preview_;
  lv_obj_t *preview_parent_{};
  lvgl_cbor::StyleRuntime *styles_{};
  StaticQueue_t queue_storage_{};
  alignas(4) uint8_t queue_bytes_[2 * sizeof(Packet)]{};
  QueueHandle_t queue_{};
  Packet current_{};
  std::atomic<unsigned> received_{0}, applied_{0};
  void receive(NaWServer::WebSocketClient *, const uint8_t *, size_t, bool, bool component);
  void respond(const lvgl_cbor::ScreenReply &, bool component, lv_obj_t *root);
};
