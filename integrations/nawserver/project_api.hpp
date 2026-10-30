// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/project_service.hpp"
#include "cbor.h"
#include <NaWServer/handler.h>
#include <NaWServer/request.h>
#include <NaWServer/response.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <functional>
#include <memory>

// Optional adapter. The application calls process() in its LVGL task; HTTP never calls LVGL.
class ProjectApi final : public NaWServer::HandlerBase {
public:
  explicit ProjectApi(lvgl_cbor::ProjectService &);
  bool begin();
  // Configure before serving requests. Called after a successful storage commit.
  void onChanged(std::function<void(const std::string &)> fn) { changed_ = std::move(fn); }
  void process();
  bool canHandle(NaWServer::Request *) override;
  void handleRequest(NaWServer::Request *, NaWServer::Response &) override;
private:
  struct Transfer { std::string token, intent, revision, screen; size_t expected{}; int64_t deadline{}; std::vector<uint8_t> bytes; } transfer_;
  struct Job;
  lvgl_cbor::ProjectService &project_;
  QueueHandle_t jobs_{};
  uint64_t token_{};
  std::function<void(const std::string &)> changed_;
  bool run(std::function<bool(lvgl_cbor::ScreenReply &)> task, lvgl_cbor::ScreenReply &, std::string &error);
  void handle_get(NaWServer::Request *, NaWServer::Response &, const std::string &action);
  void handle_transfer(NaWServer::Request *, NaWServer::Response &, const std::string &action, int64_t now);
  void begin_transfer(const CborValue &, NaWServer::Response &, int64_t now);
  void handle_command(const CborValue &, NaWServer::Response &, const std::string &action);
};
