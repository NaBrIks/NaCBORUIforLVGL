// SPDX-License-Identifier: MIT
#pragma once
#include <NaWServer/handler.h>
#include <NaWServer/websocket.h>
#include <mutex>
#include <atomic>
#include <cstdint>
#include <array>
#include <memory>
#include "board.hpp"
#include "pointer.hpp"
#include "input_queue.hpp"
#include "rle565.hpp"
class FrameApi final : public NaWServer::HandlerBase
{
 native_view::InputQueue inputs_;
 std::unique_ptr<native_view::Pointer> pointer_;
 std::mutex mutex_;
 DisplayRegion region_{};
 std::array<uint8_t, 66> header_{};
 uint32_t width_{}, height_{};
 size_t bytes_{};
 DisplayRegions regions_{};
 DisplayRegion part_{};
 size_t region_index_{}, region_rows_{}, part_offset_{}, part_size_{};
 std::array<uint8_t,32> part_header_{};
 std::unique_ptr<uint8_t[]> rle_buffer_;
 native_view::Rle565 encoder_;
 bool version2_{}, rle_{}, compressed_{}, part_ready_{};
 struct Plan { DisplayRegion extent; size_t raw_bytes{}; bool full{}; };
 Plan prepare_regions(DisplayRegions);
 static constexpr size_t socket_fragment_bytes=4092;
 // One managed TX block per client. Leave room for the next offer to reach
 // the pool and return GlobalFull instead of closing on endpoint overload.
 NaWServer::WebSocketEndpoint socket_{"/api/view/ws",{socket_fragment_bytes,4,1,8192}};
 std::weak_ptr<NaWServer::WebSocketSession> socket_client_;
 std::array<uint8_t,socket_fragment_bytes> socket_packet_{};
 size_t socket_bytes_{};
 uint32_t socket_since_{}, socket_request_ms_{};
 bool socket_requested_{}, socket_active_{}, socket_complete_{};
 void begin_part();
 NaWServer::BodyReadResult read_regions(uint8_t *,size_t,size_t part_budget=4);
 bool leased_{}, packets_{};
 uint32_t leased_scene_{}, scene_revision_floor_{};
 std::atomic<uint32_t> scene_{0};
 size_t read_stream(size_t offset,uint8_t *out,size_t capacity);
public:
 static constexpr unsigned packet_version()
 {
#if CONFIG_NAWSERVER_TCP_MANAGED
  return 2;
#else
  return 1;
#endif
 }
 bool begin(uint32_t, uint32_t);
 void set_scene(uint32_t); // UI task, before rendering a new composition.
 void process(); // Called only by the LVGL task.
 void process_socket(uint32_t now);
 NaWServer::WebSocketEndpoint &socket() { return socket_; }
 bool input_ready() const { return bool(pointer_); }
 NaWServer::RouteDescriptors routes() const override;
 void handleRequest(NaWServer::Request *, NaWServer::Response &) override;
};
