// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "screen_endpoint.hpp"
#include "board.hpp"
#include "cbor.h"
#include "esp_log.h"
#include "lvgl_cbor/screen_contract.hpp"
#include <cstring>
#include <memory>
ScreenEndpoint::ScreenEndpoint(const lvgl_cbor::Resource *r, size_t n, lvgl_cbor::StyleService *service,
                               lvgl_cbor::WidgetRegistry *registry, lvgl_cbor::DataRegistry *data)
    : runtime_(r, n, {}, service, lvgl_cbor::ScreenStyleRetention::Release, registry, data), preview_(r, n, service) {}
void ScreenEndpoint::begin(lv_obj_t *parent, lvgl_cbor::StyleRuntime *styles) {
  preview_parent_ = parent;
  styles_ = styles;
  queue_ = xQueueCreateStatic(2, sizeof(Packet), queue_bytes_, &queue_storage_);
  configASSERT(queue_);
  socket_.onMessage([this](NaWServer::WebSocketClient *client, const uint8_t *bytes, size_t size,
                           bool binary) { receive(client, bytes, size, binary, false); });
  component_socket_.onMessage([this](NaWServer::WebSocketClient *client, const uint8_t *bytes,
                                     size_t size,
                                     bool binary) { receive(client, bytes, size, binary, true); });
}
void ScreenEndpoint::receive(NaWServer::WebSocketClient *client, const uint8_t *bytes, size_t size,
                             bool binary, bool component) {
  if (!binary || !size || size > max_packet) {
    (void)client->send("screen: binary CBOR, max 3584 bytes");
    return;
  }
  auto packet = std::make_unique<Packet>();
  packet->size = size;
  packet->component = component;
  std::memcpy(packet->data, bytes, size);
  if (xQueueSend(queue_, packet.get(), 0) != pdTRUE) {
    (void)client->send("screen queue full");
    return;
  }
  received_.fetch_add(1, std::memory_order_relaxed);
}
void ScreenEndpoint::process() {
  if (!queue_ || xQueueReceive(queue_, &current_, 0) != pdTRUE)
    return;
  lvgl_cbor::ScreenReply reply;
  const bool ok = current_.component ? preview_.apply(current_.data, current_.size, preview_parent_,
                                                      *styles_, reply)
                                     : runtime_.load(current_.data, current_.size, reply);
  if (ok) {
    applied_.fetch_add(1, std::memory_order_relaxed);
    lv_refr_now(nullptr);
  } else
    ESP_LOGW("screen_lab", "Rejected node=%s opcode=%u: %s", reply.node, unsigned(reply.opcode),
             reply.error);
  respond(reply, current_.component, current_.component ? preview_.target() : runtime_.root());
}
void ScreenEndpoint::respond(const lvgl_cbor::ScreenReply &reply, bool component, lv_obj_t *root) {
  uint8_t bytes[768];
  CborEncoder encoder, map;
  cbor_encoder_init(&encoder, bytes, sizeof(bytes), 0);
  cbor_encoder_create_map(&encoder, &map, 13);
  auto key = [&](const char *s) { cbor_encode_text_stringz(&map, s); };
  key("v");
  cbor_encode_uint(&map, 1);
  key("id");
  cbor_encode_text_stringz(&map, reply.id);
  key("ok");
  cbor_encode_boolean(&map, reply.ok);
  key("error");
  cbor_encode_text_stringz(&map, reply.error);
  key("node");
  cbor_encode_text_stringz(&map, reply.node);
  key("opcode");
  cbor_encode_uint(&map, reply.opcode);
  key("nodes");
  cbor_encode_uint(&map, reply.nodes);
  key("styles");
  cbor_encode_uint(&map, reply.styles);
  key("methods");
  cbor_encode_uint(&map, reply.methods);
  key("abi");
  cbor_encode_text_stringz(&map, lvgl_cbor::screen_contract_sha256);
  key("bindings");
  cbor_encode_boolean(&map, false);
  key("frame_count");
  cbor_encode_uint(&map, display_frame_count());
  key("bounds");
  if (reply.ok && root) {
    CborEncoder array;
    cbor_encoder_create_array(&map, &array, 4);
    cbor_encode_int(&array, lv_obj_get_x(root));
    cbor_encode_int(&array, lv_obj_get_y(root));
    cbor_encode_int(&array, lv_obj_get_width(root));
    cbor_encode_int(&array, lv_obj_get_height(root));
    cbor_encoder_close_container(&map, &array);
  } else
    cbor_encode_null(&map);
  if (cbor_encoder_close_container(&encoder, &map) == CborNoError)
    (void)(component ? component_socket_ : socket_)
        .send_binary(bytes, cbor_encoder_get_buffer_size(&encoder, bytes));
}
