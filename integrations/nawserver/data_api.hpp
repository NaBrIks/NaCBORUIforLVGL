// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/data_registry.hpp"
#include "lvgl.h"
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <NaWServer/handler.h>
#include <NaWServer/request.h>
#include <NaWServer/response.h>
#include <atomic>
#include <deque>
#include <functional>
#include <memory>
#include <string>

// Optional demo adapter. HTTP sees immutable snapshots and enqueues owned CBOR;
// only process(), called by the application's UI task, touches data or LVGL.
// A 202 response acknowledges queueing. The last eight completed commands are
// included in the next GET snapshot, separately from confirmed application data.
class DataApi final : public NaWServer::HandlerBase {
public:
  using Lookup = std::function<lv_obj_t *(const char *)>;
  using InstanceLookup = std::function<lv_obj_t *(uint32_t, const char *)>;
  explicit DataApi(lvgl_cbor::DataRegistry &, Lookup = {}, InstanceLookup = {});
  ~DataApi();
  bool begin();
  void process();
  bool canHandle(NaWServer::Request *) override;
  void handleRequest(NaWServer::Request *, NaWServer::Response &) override;
private:
  struct Command;
  struct Result { uint32_t id; bool ok; std::string error; };
  lvgl_cbor::DataRegistry &data_;
  Lookup lookup_;
  InstanceLookup instance_lookup_;
  QueueHandle_t queue_{};
  std::atomic<uint32_t> next_id_{0}, rejected_{0};
  std::shared_ptr<const std::string> snapshot_;
  std::deque<Result> results_;
  int64_t next_snapshot_{};
  bool execute(const Command &, std::string &);
  void publish_snapshot();
};
