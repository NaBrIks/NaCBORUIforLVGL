// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "layout_diagnostics.hpp"
#include <algorithm>
#include <utility>
using namespace lvgl_cbor;
namespace example_ui
{
	namespace
	{
		const DataValue &field(const DataValue &value, const char *key)
		{
			return std::get<DataValue::Object>(value.value).at(key);
		}

	}
	LayoutDiagnostics::LayoutDiagnostics(DataRegistry &data, std::function<ProjectService *()> project)
	  : data_(data), project_(std::move(project))
	{
	}

	void LayoutDiagnostics::apply(ProjectService &project) const
	{
		project.set_layout_debug_options(options_); project.set_layout_debug(enabled_);
	}

	void LayoutDiagnostics::apply_current()
	{
		++generation_;
		if(auto *project = project_())
			apply(*project);
	}

	bool LayoutDiagnostics::install(std::string &error)
	{
		const auto level = DataSchema::object({{"outline", DataSchema::boolean()}, {"digit", DataSchema::boolean()},
					{"outlineColor", DataSchema::integer(0, 0xffffff)},
					{"digitColor", DataSchema::integer(0, 0xffffff)}});
		const auto options = DataSchema::object({{"opacity", DataSchema::integer(0, 255)},
					{"layoutType", DataSchema::boolean()},
					{"outlineWidth", DataSchema::integer(1, 16)}, {"levels", DataSchema::array(level, 256)}});
		auto state = options; state.fields["maxDepth"] = DataSchema::integer(0, 255);
		if(!data_.add_source({"ui.layout_debug", state, {}, "Layout diagnostics options",
		                      "Independent outline/digit switches and colors for each tree depth", "ui"}, error))
			return false;

		if(!data_.add_action({"ui.layout_debug", DataSchema::boolean(), [this](const DataValue &value, std::string &e){
								  enabled_ = std::get<bool>(value.value); bool any = false;
								  for(const auto &level:options_.levels)
									  any = any || level.outline || level.digit;
								  if(enabled_ && !any)
								  {
									  const auto *p = project_();
									  const auto count = std::min(size_t(256),
									  (p ? p->layout_debug_max_depth() : 0) + 1);
									  while(options_.levels.size() < count)
										  options_.levels.emplace_back(options_.levels.size());
									  for(auto &level:options_.levels)
										  level.outline = true;
								  }

								  apply_current(); return publish(e);
							  }, "Layout diagnostics", "Master switch; level settings use ui.layout_debug_options",
		                      "ui"}, error)) return false;

		if(!data_.add_action({"ui.layout_debug_options", options, [this](const DataValue &value, std::string &e){
								  LayoutDebugOptions next;
								  next.opacity = uint8_t(std::get<int64_t>(field(value, "opacity").value));
								  next.outline_width = uint8_t(std::get<int64_t>(field(value, "outlineWidth").value));
								  const auto &fields = std::get<DataValue::Object>(value.value);
								  auto type = fields.find("layoutType");
								  next.layout_type = type != fields.end() && std::get<bool>(type->second.value);
								  bool any = false;
								  for(const auto &entry:std::get<DataValue::Array>(field(value, "levels").value))
								  {
									  LayoutDebugLevel level(next.levels.size());
									  level.outline = std::get<bool>(field(entry, "outline").value);
									  level.digit = std::get<bool>(field(entry, "digit").value);
									  level.outline_color = uint32_t(std::get<int64_t>(field(entry,
									  "outlineColor").value));
									  level.digit_color = uint32_t(std::get<int64_t>(field(entry, "digitColor").value));
									  any = any || level.outline || level.digit; next.levels.push_back(level);
								  }
								  options_ = std::move(next); enabled_ = any; apply_current(); return publish(e);
							  }, "Configure layout diagnostics",
		                      "Per-depth flags/colors, opacity and outline width; transient native styles", "ui"},
		    error)) return false;

		return publish(error);
	}

	bool LayoutDiagnostics::publish(std::string &error)
	{
		const auto *p = project_(); const auto count = std::min(size_t(256), (p ? p->layout_debug_max_depth() : 0) + 1);
		DataValue::Array levels; levels.reserve(count);
		for(size_t depth = 0; depth < count; ++depth)
		{
			LayoutDebugLevel level(depth);
			if(depth < options_.levels.size()) level = options_.levels[depth]; else if(options_.levels.empty())
				level.outline = true;

			levels.emplace_back(DataValue::Object{{"outline", enabled_ && level.outline},
					{"digit", enabled_ && level.digit},
					{"outlineColor", int64_t(level.outline_color)}, {"digitColor", int64_t(level.digit_color)}});
		}
		DataValue state = DataValue::Object{{"opacity", int(options_.opacity)},
			{"outlineWidth", int(options_.outline_width)},
			{"layoutType", options_.layout_type}, {"levels", std::move(levels)}, {"maxDepth", int64_t(count - 1)}};
		if(published_ && *published_ == state){error.clear(); return true;}

		if(!data_.publish("ui.layout_debug", state, error))
			return false;

		published_ = std::move(state); return true;
	}

}
