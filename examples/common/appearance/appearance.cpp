// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "appearance.hpp"
#include "lvgl_cbor/data_registry.hpp"
using namespace lvgl_cbor;
Appearance::Appearance(std::initializer_list<const char *> optional_roles)
  : roles_{"canvas", "panel", "status", "text", "text_accent", "muted", "button",
        "button_pressed", "button_focus", "focus_outline", "button_disabled", "indicator", "track", "knob", "arc_track",
        "arc_value"}
{
	required_roles_ = roles_.size();
	roles_.insert(roles_.end(), optional_roles.begin(), optional_roles.end());
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

bool Appearance::install_popup_theme(lv_display_t *display, const lv_font_t *font, int32_t popup_spacing)
{
	if(theme_) return true;
	if(!display) return false;
	theme_ = lv_theme_create();
	if(!theme_) return false;

	display_ = display; popup_font_ = font; popup_spacing_ = popup_spacing;
	parent_theme_ = lv_display_get_theme(display);

	if(parent_theme_) lv_theme_copy(theme_, parent_theme_);

	lv_theme_set_parent(theme_, parent_theme_); lv_theme_set_user_data(theme_, this);
	lv_theme_set_apply_cb(theme_, apply_popup_theme); lv_display_set_theme(display, theme_);
	return true;
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

const lv_style_t *Appearance::role_style(const char *role) const
{
	const auto found = active_.find(std::string("ui.") + role);
	return found == active_.end() ? nullptr : &found->second->value;
}

std::vector<Resource> Appearance::resources() const
{
	std::vector<Resource> result;
	for(const auto &item:active_)
		result.push_back({item.first.c_str(), "const lv_style_t *", &item.second->value});
	return result;
}

bool Appearance::load(ProjectBytes bytes, const std::string &initial, const Resource *resources, size_t count,
    std::string &error)
{
	if(!bytes.data || !bytes.size || bytes.size > 256 * 1024) {error = "Appearance packet size"; return false;}

	ProjectBundle bundle;
	if(!parse_project(std::move(bytes), bundle, error, {256 * 1024, 128}) || bundle.id != "windows-schemes")
		{error = "Invalid appearance project: " + error; return false;}

	// Prepare all variants using the existing style executor before replacing any live style.
	StyleService prepared(resources, count, 128); StyleRuntime compiler(nullptr, resources, count, &prepared);
	for(const auto &style:bundle.styles)
	{
		Reply reply{};
		if(!compiler.apply(style.bytes.data, style.bytes.size, reply))
			{error = std::string("Appearance style: ") + reply.error; return false;}
	}
	std::vector<Choice> choices;
	if(bundle.screens.empty() || bundle.screens.size() > 8) {error = "Appearance choice count"; return false;}

	for(const auto &screen:bundle.screens)
	{
		DataValue metadata;
		if(!decode_data_value(screen.bytes.data, screen.bytes.size, metadata, error, 32768))
			return false;

		const auto *object = std::get_if<DataValue::Object>(&metadata.value);
		if(!object){error = "Invalid appearance metadata"; return false;}
		const auto title_field = object->find("title");
		const auto *title = title_field == object->end() ? nullptr : std::get_if<std::string>(&title_field->second.value);
		if(!title || title->empty()){error = "Missing appearance title"; return false;}
		Choice choice{screen.name, *title, {}};
		for(const auto &role:roles_)
		{
			auto handle = prepared.resolve("global-dynamic:" + choice.id + "." + role);
			if(!handle && role == "text_accent")
				handle = prepared.resolve("global-dynamic:" + choice.id + ".text");

			if(!handle && choice.styles.size() < required_roles_) {error = "Missing appearance role: " + role; return false;}

			choice.styles.push_back(std::move(handle));
		}
		choices.push_back(std::move(choice));
	}
	bool found = false; for(const auto &choice:choices)
		found |= choice.id == initial;
	if(!found) {error = "Unknown initial scheme: " + initial; return false;}

	choices_ = std::move(choices); initial_ = initial; selected_.clear(); return select(initial, error);
}

bool Appearance::select(const std::string &id, std::string &error, const StyleLookup &project_style)
{
	const Choice *choice = nullptr, *fallback = nullptr;
	for(const auto &candidate:choices_)
	{
		if(candidate.id == id) choice = &candidate;
		if(candidate.id == initial_) fallback = &candidate;
	}
	const auto is_letter = [](char c){return c >= 'a' && c <= 'z';};
	bool valid_id = !id.empty() && id.size() <= 8 && is_letter(id.front());
	for(char c : id) valid_id &= is_letter(c) || (c >= '0' && c <= '9') || c == '_';
	const std::string prefix = "theme." + id + ".";
	const bool custom = valid_id && project_style && bool(project_style(prefix + "canvas"));
	if(!choice && (!custom || !fallback)) {error = "Unknown scheme: " + id; return false;}
	if(selected_ == id && !custom && !selected_from_project_) return true;

	const auto &base = choice ? *choice : *fallback;
	const StyleValue empty;
	// Stable LVGL addresses are retained for every role throughout the switch.
	for(size_t i = 0; i < roles_.size(); ++i)
	{
		const auto &role = roles_[i];
		auto &active = *active_.at("ui." + role);
		auto overlay = custom ? project_style(prefix + role) : StyleHandle{};
		if(custom && !overlay && role == "text_accent")
			overlay = project_style(prefix + "text");
		const auto &base_style = base.styles[i];
		if(!overlay) {active.replace(base_style ? *base_style.owner : empty); continue;}
		if(!base_style) {active.replace(*overlay.owner); continue;}
		StyleValue merged;
		merged.compose(*base_style.owner, true);
		merged.compose(*overlay.owner, false);
		active.replace(merged);
	}
	selected_ = id;
	selected_title_ = choice ? choice->title : id;
	selected_from_project_ = custom;
	return true;
}
