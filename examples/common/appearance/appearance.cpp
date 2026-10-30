// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "appearance.hpp"
#include "lvgl_cbor/data_registry.hpp"
#include <stdexcept>
using namespace lvgl_cbor;
Appearance::Appearance()
  : roles_{"canvas", "panel", "status", "text", "muted", "button",
        "button_pressed", "button_focus", "focus_outline", "button_disabled", "indicator", "track", "knob", "arc_track",
        "arc_value"}
{
	for(const auto &role:roles_)
		active_.emplace("ui." + role, std::make_shared<StyleValue>());
}

Appearance::~Appearance()
{
	if(theme_)
	{
		if(lv_display_get_theme(display_) == theme_) lv_display_set_theme(display_, parent_theme_);

		lv_theme_delete(theme_);
	}
}

void Appearance::install_popup_theme(lv_display_t *display, const lv_font_t *font, int32_t popup_spacing)
{
	if(theme_ || !display) return;

	display_ = display; popup_font_ = font; popup_spacing_ = popup_spacing;
	parent_theme_ = lv_display_get_theme(display);
	theme_ = lv_theme_create(); if(!theme_) throw std::runtime_error("Cannot create appearance theme");

	if(parent_theme_) lv_theme_copy(theme_, parent_theme_);

	lv_theme_set_parent(theme_, parent_theme_); lv_theme_set_user_data(theme_, this);
	lv_theme_set_apply_cb(theme_, apply_popup_theme); lv_display_set_theme(display, theme_);
}

void Appearance::apply_popup_theme(lv_theme_t *theme, lv_obj_t *obj)
{
	// Dropdown owns a separate popup object, not a node in the authoring tree.
	if(!lv_obj_check_type(obj, &lv_dropdownlist_class)) return;

	auto &self = *static_cast<Appearance *>(lv_theme_get_user_data(theme));
	const auto attach = [&](const char *role, lv_style_selector_t selector){
			lv_obj_add_style(obj, &self.active_.at(std::string("ui.") + role)->value, selector);
		};
	attach("panel", LV_PART_MAIN); attach("panel", LV_PART_SELECTED);
	attach("button", LV_PART_SELECTED | LV_STATE_CHECKED);
	attach("button_pressed", LV_PART_SELECTED | LV_STATE_PRESSED);
	attach("button_pressed", LV_PART_SELECTED | LV_STATE_CHECKED | LV_STATE_PRESSED);
	lv_obj_set_style_text_font(obj, self.popup_font_, LV_PART_MAIN);
	if(self.popup_spacing_ >= 0)
	{
		lv_obj_set_style_text_line_space(obj, self.popup_spacing_, LV_PART_MAIN);
		lv_obj_set_style_pad_all(obj, self.popup_spacing_, LV_PART_MAIN);
	}
}

std::vector<Resource> Appearance::resources() const
{
	std::vector<Resource> result;
	for(const auto &item:active_)
		result.push_back({item.first.c_str(), "const lv_style_t *", &item.second->value});
	return result;
}

void Appearance::load(ProjectBytes bytes, const std::string &initial, const Resource *resources, size_t count)
{
	if(!bytes.data || !bytes.size || bytes.size > 256 * 1024) throw std::runtime_error("Appearance packet size");

	ProjectBundle bundle; std::string error;
	if(!parse_project(std::move(bytes), bundle, error, {256 * 1024, 128}) || bundle.id != "windows-schemes")
		throw std::runtime_error("Appearance project: " + error);

	// Prepare all variants using the existing style executor before replacing any live style.
	StyleService prepared(resources, count, 128); StyleRuntime compiler(nullptr, resources, count, &prepared);
	for(const auto &style:bundle.styles)
	{
		Reply reply{};
		if(!compiler.apply(style.bytes.data, style.bytes.size, reply))
			throw std::runtime_error(std::string("Appearance style: ") + reply.error);
	}
	std::vector<Choice> choices;
	if(bundle.screens.empty() || bundle.screens.size() > 8) throw std::runtime_error("Appearance choice count");

	for(const auto &screen:bundle.screens)
	{
		DataValue metadata;
		if(!decode_data_value(screen.bytes.data, screen.bytes.size, metadata, error, 32768))
			throw std::runtime_error(error);

		auto &object = std::get<DataValue::Object>(metadata.value);
		Choice choice{screen.name, std::get<std::string>(object.at("title").value), {}};
		for(const auto &role:roles_)
		{
			auto handle = prepared.resolve("global-dynamic:" + choice.id + "." + role);
			if(!handle) throw std::runtime_error("Missing appearance role: " + role);

			choice.styles.push_back(std::move(handle));
		}
		choices.push_back(std::move(choice));
	}
	bool found = false; for(const auto &choice:choices)
		found |= choice.id == initial;
	if(!found) throw std::runtime_error("Unknown initial scheme: " + initial);

	choices_ = std::move(choices); selected_.clear(); select(initial);
}

void Appearance::select(const std::string &id)
{
	const Choice *choice = nullptr;
	for(const auto &candidate:choices_)
		if(candidate.id == id){choice = &candidate; break;}

	if(!choice) throw std::runtime_error("Unknown scheme: " + id);

	if(selected_ == id) return;

	// Serialized UI context: no frame can render a half-applied palette. No object is recreated.
	for(size_t i = 0; i < roles_.size(); ++i)
		active_.at("ui." + roles_[i])->replace(*choice->styles[i].owner);
	selected_ = id;
}
