// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/project_service.hpp"
#include "lvgl_cbor/style_runtime.hpp"
#include <functional>
#include <map>
#include <initializer_list>

// Application-owned style resources. Every page uses the same stable addresses.
class Appearance
{
public:
	struct Choice {std::string id, title; std::vector<lvgl_cbor::StyleHandle> styles;};
	explicit Appearance(std::initializer_list<const char *> optional_roles = {});
	const lv_style_t *role_style(const char *role) const;
	~Appearance();
	Appearance(const Appearance &) = delete;
	Appearance &operator=(const Appearance &) = delete;
	bool install_popup_theme(lv_display_t *, const lv_font_t *, int32_t popup_spacing = -1);
	std::vector<lvgl_cbor::Resource> resources() const;
	bool load(lvgl_cbor::ProjectBytes, const std::string &initial,
	    const lvgl_cbor::Resource *, size_t, std::string &error);
	using StyleLookup = std::function<lvgl_cbor::StyleHandle(const std::string &)>;
	bool select(const std::string &, std::string &error, const StyleLookup &project_style = {});
	static constexpr const char *project_action_description =
	    "Select a scheme by plain text id. To author one, save global project styles theme.<id>.<role> "
	    "(id: 1-8 lowercase letters/digits/underscore, starts with a letter; canvas required), then refresh the "
	    "display. Roles: canvas, panel, status, text, text_accent, muted, button, button_pressed, button_focus, "
	    "focus_outline, button_disabled, indicator, track, knob, arc_track, arc_value. Missing properties inherit "
	    "from the base palette. Verify ui.scheme.";
	const std::vector<Choice> &choices() const
	{
		return choices_;
	}

	const std::string &selected() const
	{
		return selected_;
	}
	const std::string &selected_title() const { return selected_title_; }

private:
	std::vector<std::string> roles_;
	size_t required_roles_{};
	std::map<std::string, std::shared_ptr<lvgl_cbor::StyleValue> > active_;
	std::vector<Choice> choices_;
	std::string initial_, selected_, selected_title_;
	bool selected_from_project_{};
	lv_display_t *display_{};
	lv_theme_t *theme_{}, *parent_theme_{};
	const lv_font_t *popup_font_{};
	int32_t popup_spacing_{-1};
	static void apply_popup_theme(lv_theme_t *, lv_obj_t *);
};
