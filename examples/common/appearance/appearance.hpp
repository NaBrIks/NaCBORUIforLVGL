// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/project_service.hpp"
#include "lvgl_cbor/style_runtime.hpp"
#include <map>

// Application-owned style resources. Every page uses the same stable addresses.
class Appearance
{
public:
	struct Choice {std::string id, title; std::vector<lvgl_cbor::StyleHandle> styles;};
	Appearance();
	~Appearance();
	Appearance(const Appearance &) = delete;
	Appearance &operator=(const Appearance &) = delete;
	void install_popup_theme(lv_display_t *, const lv_font_t *, int32_t popup_spacing = -1);
	std::vector<lvgl_cbor::Resource> resources() const;
	void load(lvgl_cbor::ProjectBytes, const std::string &initial,
	    const lvgl_cbor::Resource *, size_t);
	void select(const std::string &);
	const std::vector<Choice> &choices() const
	{
		return choices_;
	}

	const std::string &selected() const
	{
		return selected_;
	}

private:
	std::vector<std::string> roles_;
	std::map<std::string, std::shared_ptr<lvgl_cbor::StyleValue> > active_;
	std::vector<Choice> choices_;
	std::string selected_;
	lv_display_t *display_{};
	lv_theme_t *theme_{}, *parent_theme_{};
	const lv_font_t *popup_font_{};
	int32_t popup_spacing_{-1};
	static void apply_popup_theme(lv_theme_t *, lv_obj_t *);
};
