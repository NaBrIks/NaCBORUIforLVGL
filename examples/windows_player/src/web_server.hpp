// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include <cstdint>
#include <filesystem>
#include <memory>
#include <string>
class Application;
// Native NaWServer transport. HTTP and UI callbacks share the existing LVGL lock.
// stop() must run outside that lock, before the Application is destroyed.
class WindowsWebServer
{
public:
	WindowsWebServer(Application &, uint16_t port, std::filesystem::path web_root);
	~WindowsWebServer();
	WindowsWebServer(const WindowsWebServer &) = delete;
	WindowsWebServer &operator=(const WindowsWebServer &) = delete;
	void start();
	void stop();
	std::string url() const;
	// Called by main under its existing UI lock. Processes at most one queued
	// application data command, then emits current bounded WS state.
	void poll();
private:
	struct Impl;
	std::unique_ptr<Impl> impl_;
};
