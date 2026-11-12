// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "application.hpp"
#include "history_plot.hpp"
#if LVGL_CBOR_HAS_GRAPHICS_GALLERY
#include "graphics_gallery.hpp"
#include "polygon_button.hpp"
#endif
#include "project_api.hpp"
#include "base_migration.hpp"
#include "../../common/sample_image.hpp"
#include <fstream>
#include <array>
#include <stdexcept>
using namespace lvgl_cbor;
namespace
{
	const DataValue &field(const DataValue &v, const char *name)
	{
		const auto &object = std::get<DataValue::Object>(v.value);
		auto it = object.find(name); if(it == object.end()) throw std::runtime_error(std::string("Missing ") + name);

		return it->second;
	}

	std::string text(const DataValue &v)
	{
		return std::get<std::string>(v.value);
	}

	const std::array<uint8_t, 24 * 24> sample_pixels = [] {
			std::array<uint8_t, 24 * 24> data{};
			for(size_t y = 0; y < 24; ++y)
				for(size_t x = 0; x < 24; ++x)
					data[y * 24 + x] = ((x / 6 + y / 6) % 2) ? 255 : 40;
			return data;
		}();
	const lv_image_dsc_t sample_image = [] {
			lv_image_dsc_t image{}; image.header.magic = LV_IMAGE_HEADER_MAGIC; image.header.cf = LV_COLOR_FORMAT_A8;
			image.header.w = 24; image.header.h = 24; image.header.stride = 24;
			image.data_size = uint32_t(sample_pixels.size()); image.data = sample_pixels.data(); return image;
		}();
	void snapshot(lv_obj_t *root, const std::filesystem::path &path)
	{
		if(!root) throw std::runtime_error("No project");

		lv_obj_update_layout(root);
		auto *image = lv_snapshot_take(root, LV_COLOR_FORMAT_XRGB8888);
		if(!image) throw std::runtime_error("LVGL snapshot failed");

		const auto width = image->header.w, height = image->header.h;
		std::vector<uint8_t> header(54, 0);
		const auto put = [&](size_t at, uint32_t n){
				for(int i = 0; i < 4; ++i)
					header[at + i] = uint8_t(n >> (8 * i));
			};
		header[0] = 'B'; header[1] = 'M'; put(2, 54 + width * height * 4); put(10, 54); put(14, 40);
		put(18, width); put(22, uint32_t(-int32_t(height))); header[26] = 1; header[28] = 32;
		std::ofstream file(path, std::ios::binary);
		file.write(reinterpret_cast<const char *>(header.data()), header.size());
		for(uint32_t y = 0; y < height; ++y)
			file.write(reinterpret_cast<const char *>(image->data + y * image->header.stride), width * 4);
		lv_draw_buf_destroy(image);
		if(!file) throw std::runtime_error("Snapshot file write failed");
	}

}
Application::Application(bool graphics)
  : resources_(appearance.resources()), graphics_(graphics), layout_debug_(data.registry, [this]{
	return project_.get();
})
{
	std::string error;
	if(!data.begin(error)) throw std::runtime_error(error);
	if(!graphics_) metrics = std::make_unique<SystemMetrics>(data.registry);

	if(auto *display = lv_display_get_default())
	{
		view_pointer_ = std::make_unique<native_view::Pointer>(display);
		if(!view_pointer_->ready()) view_pointer_.reset();
	}

	if(!history_plot::register_widget(widgets_)) throw std::runtime_error("Cannot register history plot");

#if LVGL_CBOR_HAS_GRAPHICS_GALLERY
	if(!graphics_gallery::register_widget(widgets_)) throw std::runtime_error("Cannot register graphics sample");

	graphics_gallery::append_resources(resources_);
	if(!polygon_button::register_widget(widgets_))throw std::runtime_error("Cannot register polygon button");

#endif

	resources_.push_back({"montserrat_12", "const lv_font_t *", &lv_font_montserrat_12});
	resources_.push_back({"montserrat_14", "const lv_font_t *", &lv_font_montserrat_14});
	resources_.push_back({"montserrat_20", "const lv_font_t *", &lv_font_montserrat_20});
	resources_.push_back({"montserrat_28", "const lv_font_t *", &lv_font_montserrat_28});
	resources_.push_back({"ui_20", "const lv_font_t *", fonts_.small()});
	resources_.push_back({"ui_14", "const lv_font_t *", fonts_.compact()});
	resources_.push_back({"ui_28", "const lv_font_t *", fonts_.large()});
	resources_.push_back({"ui_sample_image", "const void *", &sample_image});
	resources_.push_back({"ui_sample_image_small", "const void *", &demo_small_image::image});
	if(!data.registry.add_group({"host", "Application host", "Actual endpoints of this application", ""}, error) ||
	    !data.registry.add_source({"host.connection",
	                               DataSchema::object({{"site", DataSchema::text(256)},
									   {"editor", DataSchema::text(256)}, {"mcp", DataSchema::text(128)}}), {},
	                               "Host connection", "MCP is hosted inside this application by NaWServer", "host"},
	    error))
		throw std::runtime_error(error);

	data.registry.publish("host.connection",
	    DataValue::Object{{"site", "API disabled"}, {"editor", "API disabled"},
			{"mcp", LVGL_CBOR_NATIVE_MCP ? "API disabled" : "Not compiled"}}, error);
	if(!data.registry.add_group({"ui", "Interface", "Appearance choices and UI commands", ""}, error) ||
	    !data.registry.add_source({"ui.scheme", DataSchema::object({{"id", DataSchema::text(12)},
									   {"title", DataSchema::text(256)}}), {}, "Current scheme",
	                               "Selected interface palette", "ui"}, error) ||
	    !data.registry.add_action({"ui.select_scheme", DataSchema::text(12),
	                               [this](const DataValue &value, std::string &e){
									   return select_scheme(std::get<std::string>(value.value), e);
								   }, "Select scheme", Appearance::project_action_description, "ui"}, error))
		throw std::runtime_error(error);

	if(!layout_debug_.install(error))throw std::runtime_error(error);
}

bool Application::publish_layout_debug(std::string &error)
{
	return layout_debug_.publish(error);
}

bool Application::select_scheme(const std::string &id, std::string &error)
{
	if(!appearance.select(id, error, [this](const std::string &name){
	    return project_ ? project_->display_style(name) : StyleHandle{};
	})) return false;
	return data.registry.publish("ui.scheme", DataValue::Object{{"id", id},
	    {"title", appearance.selected_title()}}, error);
}

void Application::load_schemes(const std::filesystem::path &path, const std::string &initial)
{
	load_appearance_file(appearance, path, initial, resources_.data(), resources_.size());
	if(!appearance.install_popup_theme(lv_display_get_default(), fonts_.small()))
		throw std::runtime_error("Cannot create appearance theme");
	std::string error; if(!select_scheme(initial, error)) throw std::runtime_error(error);

	data.registry.flush();
}

std::string Application::capabilities() const
{
	auto json = runtime_capabilities_json(resources_.data(), resources_.size(), {}, &widgets_, &data.registry);
	json.pop_back();
	json += ",\"project\":{\"format\":\"lvgl-project-service-1\",\"events\":[\"project_changed\"],\"maxBytes\":" +
	    std::to_string(project_limit) +
	    "},\"dataQuery\":{\"format\":\"lvgl-data-page-1\",\"maxBytes\":16384,\"maxItems\":64},\"historyAvailable\":";
#if LVGL_CBOR_HAS_HISTORY
	json += "true}";
#else
	json += "false}";
#endif
	return json;
}

void Application::tick()
{
	if(metrics)metrics->drain();

	if(view_pointer_)view_pointer_->tick();

	std::string error;
	if(!data.tick(error)) throw std::runtime_error(error);
}

void Application::configure_store(const std::filesystem::path &prefix)
{
	if(project_) throw std::runtime_error("Store configuration requires a new project load");

	store_prefix_ = prefix;
}

bool Application::load(const std::filesystem::path &path, const std::string &entry, std::string &error,
    const std::filesystem::path *store_override)
{
	std::ifstream input(path, std::ios::binary | std::ios::ate);
	if(!input) {error = "Cannot open project"; return false;}

	auto size = input.tellg(); if(size <= 0 || size > std::streamoff(project_limit))
	{
		error = "Project size"; return false;
	}

	std::vector<uint8_t> candidate(size_t(size), 0); input.seekg(0);
	if(!input.read(reinterpret_cast<char *>(candidate.data()), size)) {error = "Cannot read project"; return false;}

	// Keep the old service alive through prepare/activation. Failed input preserves it.
	auto source = std::make_unique<ConstProjectSource>(candidate.data(), candidate.size(),
	        ProjectStorageInfo{"desktop", "opened document", false, false, "available"});
	const auto prefix = store_override ? *store_override : store_prefix_;
	std::unique_ptr<ProjectStore> store;
	if(prefix.empty()) store = std::make_unique<MemoryProjectStore>();
	else
	{
		auto persistent = std::make_unique<WindowsProjectStore>(prefix, ProjectLimits{project_limit, 128});
		if(!persistent->prepare(*source, base_recovery_, error)) return false;

		store = std::move(persistent);
	}

	auto project = std::make_unique<ProjectService>(*source, store.get(), ProjectPolicy{},
	        ProjectLimits{project_limit, 128}, resources_.data(), resources_.size(), &widgets_,
	        std::vector<ProjectStorageInfo>{}, &data.registry, ScreenViewport::Display);
	if(!project->begin(error)) return false;

	layout_debug_.apply(*project);

	ScreenReply reply{};
	if(!project->load_screen(entry.empty() ? project->status().entry : entry, reply))
	{
		error = reply.error; return false;
	}

	if(auto *persistent = dynamic_cast<WindowsProjectStore *>(store.get()))
		if(!persistent->finalize(error))
		{
			if(project_ && project_->root()) lv_screen_load(project_->root());

			return false;
		}

	project_ = std::move(project); store_ = std::move(store); source_ = std::move(source);
	bytes_ = std::move(candidate); store_prefix_ = prefix; ++workspace_epoch_;
	return true;
}

DataValue Application::command(const DataValue &request)
{
	const auto op = text(field(request, "op")); std::string error;
	if(op == "capabilities")
		return DataValue::Object{{"event", "result"}, {"op", op}, {"ok", true}, {"capabilitiesJson", capabilities()}};
	else if(op == "project")
	{
		if(!project_) throw std::runtime_error("No project");

		auto result = windows_project_command(*project_, request);
		data.registry.flush();
		return result;
	}
	else if(op == "data_snapshot")
		return DataValue::Object{{"event", "result"}, {"op", op}, {"ok", true},
			{"snapshotJson", data.registry.snapshot_json()}};
	else if(op == "data_command")
	{
		const auto &args = std::get<DataValue::Object>(request.value);
		const auto path = args.find("path");
		if(path != args.end())
			windows_data_command_file(project_.get(), data.registry, std::filesystem::u8path(text(path->second)));
		else windows_data_command(project_.get(), data.registry, field(request, "command"));

		return DataValue::Object{{"event", "result"}, {"op", op}, {"ok", true}};
	}
	else if(op == "data_query")
	{
		DataQuery query; std::string json;
		if(!parse_data_query(field(request, "query"), query, error) || !data.registry.query_json(query, json, error))
			throw std::runtime_error(error);

		return DataValue::Object{{"event", "result"}, {"op", op}, {"ok", true}, {"queryJson", json}};
	}
	else if(op == "load")
	{
		const auto &args = std::get<DataValue::Object>(request.value);
		const auto requested = args.find("store");
		std::filesystem::path prefix;
		if(requested != args.end()) prefix = std::filesystem::u8path(text(requested->second));

		if(!load(std::filesystem::u8path(text(field(request, "path"))), text(field(request, "entry")), error,
		    requested == args.end() ? nullptr : &prefix))
			throw std::runtime_error(error);
	}
	else if(op == "scheme")
	{
		if(!select_scheme(text(field(request, "scheme")), error)) throw std::runtime_error(error);

		data.registry.flush();
	}
	else if(op == "snapshot")
	{
		snapshot(project_ ? project_->root() : nullptr, std::filesystem::u8path(text(field(request, "path"))));
	}
	else if(op == "publish")
	{
		if(!data.registry.publish(text(field(request, "source")), field(request, "value"), error))
			throw std::runtime_error(error);

		data.registry.flush();
	}
	else if(op == "invoke")
	{
		if(!data.registry.invoke(text(field(request, "action")), field(request, "value"), error))
			throw std::runtime_error(error);

		data.registry.flush();
	}
	else if(op == "write")
	{
		DataPath path;
		const auto &object = std::get<DataValue::Object>(request.value);
		auto p = object.find("path");
		if(p != object.end())
			for(const auto &part:std::get<DataValue::Array>(p->second.value))
			{
				if(auto key = std::get_if<std::string>(&part.value)) path.emplace_back(*key);
				else
				{
					auto index = std::get<int64_t>(part.value);
					if(index < 0) throw std::runtime_error("Negative path index");

					path.emplace_back(size_t(index));
				}
			}

		if(!data.registry.write(text(field(request, "source")), path, field(request, "value"), error))
			throw std::runtime_error(error);

		data.registry.flush();
	}
	else if(op == "click" || op == "event")
	{
		if(!project_) throw std::runtime_error("No project");

		auto &obj = std::get<DataValue::Object>(request.value);
		auto instance = obj.find("instance");
		auto *node = instance == obj.end() ? project_->find(text(field(request, "node")).c_str()) :
		    project_->find(uint32_t(std::get<int64_t>(instance->second.value)), text(field(request, "node")).c_str());
		if(!node) throw std::runtime_error("Unknown node");

		lv_event_code_t code = LV_EVENT_CLICKED; uint32_t key = 0; bool dispatch = true;
		if(op == "event")
		{
			const auto name = text(field(request, "event"));
			if(name == "clicked") code = LV_EVENT_CLICKED;
			else if(name == "value_changed") code = LV_EVENT_VALUE_CHANGED;
			else if(name == "ready") code = LV_EVENT_READY;
			else if(name == "long_pressed") code = LV_EVENT_LONG_PRESSED;
			else if(name == "pressed") code = LV_EVENT_PRESSED;
			else if(name == "released") code = LV_EVENT_RELEASED;
			else if(name == "focus")
			{
				lv_group_focus_obj(node); dispatch = false;
			}
			else if(name == "key")
			{
				code = LV_EVENT_KEY; const auto &value = field(request, "key");
				if(auto number = std::get_if<int64_t>(&value.value))
				{
					if(*number < 1 || *number > 127) throw std::runtime_error("Test key must be ASCII or a named key");

					key = uint32_t(*number);
				}
				else
				{
					const std::map<std::string, uint32_t> keys{{"left", LV_KEY_LEFT}, {"right", LV_KEY_RIGHT},
						{"up", LV_KEY_UP}, {"down", LV_KEY_DOWN}, {"enter", LV_KEY_ENTER}, {"escape", LV_KEY_ESC},
						{"backspace", LV_KEY_BACKSPACE}};
					auto found = keys.find(text(value)); if(found == keys.end())
						throw std::runtime_error("Unknown test key");

					key = found->second;
				}
			}
			else throw std::runtime_error("Unknown test event");
		}

		if(dispatch) lv_obj_send_event(node, code, code == LV_EVENT_KEY ? &key : nullptr);

		data.registry.flush();
	}
	else if(op == "add_demo_sensor")
	{
		const auto name = text(field(request, "name"));
		auto schema = DataSchema::number(-100, 200); schema.title = "Temperature";
		schema.description = "Code-generated dynamic sensor"; schema.unit = "C";
		if(!data.registry.add_source({name, std::move(schema), {}, "Dynamic demo sensor",
		                              "Created through the Windows test adapter", "demo"}, error) ||
		    !data.registry.publish(name, 23.5, error))throw std::runtime_error(error);

		data.registry.flush();
	}
	else if(op != "inspect")throw std::runtime_error("Unknown player command");

	#if LVGL_CBOR_HAS_HISTORY
	const bool history_available = true, history_enabled = data.history.enabled();
	const size_t history_points = data.history.allocated_points();
#else
	const bool history_available = false, history_enabled = false;
	const size_t history_points = 0;
#endif
	DataValue::Array views, nodes;
	if(project_)
	{
		auto status = project_->status();
		for(const auto &v:status.views)
			views.emplace_back(DataValue::Object{{"instance", v.instance},
					{"pageInstance", v.page_instance}, {"node", v.node}, {"selected", v.selected}, {"error", v.error}});
		auto &object = std::get<DataValue::Object>(request.value); auto list = object.find("nodes");
		if(list != object.end())
			for(const auto &item:std::get<DataValue::Array>(list->second.value))
			{
				auto id = text(field(item, "id")); auto &spec = std::get<DataValue::Object>(item.value);
				auto instance = spec.find("instance");
				auto *node = instance == spec.end() ? project_->find(id.c_str()) :
				    project_->find(uint32_t(std::get<int64_t>(instance->second.value)), id.c_str());
				DataValue::Object result{{"id", id}, {"found", node != nullptr}};
				if(node)
				{
					lv_obj_update_layout(node); lv_area_t area; lv_obj_get_coords(node, &area);
					result["bounds"] = DataValue::Array{area.x1, area.y1, area.x2, area.y2};
					result["scrollBottom"] = lv_obj_get_scroll_bottom(node);
					result["scrollRight"] = lv_obj_get_scroll_right(node);
					result["fontHeight"] = lv_font_get_line_height(lv_obj_get_style_text_font(node, LV_PART_MAIN));
					if(auto *parent = lv_obj_get_parent(node))
					{
						lv_area_t bounds; lv_obj_get_coords(parent, &bounds);
						result["parentBounds"] = DataValue::Array{bounds.x1, bounds.y1, bounds.x2, bounds.y2};
					}

					result["state"] = int(lv_obj_get_state(node));
					result["radius"] = lv_obj_get_style_radius(node, LV_PART_MAIN);
					result["borderWidth"] = lv_obj_get_style_border_width(node, LV_PART_MAIN);
					result["outlineWidth"] = lv_obj_get_style_outline_width(node, LV_PART_MAIN);
					result["outlinePad"] = lv_obj_get_style_outline_pad(node, LV_PART_MAIN);
					result["background"] = lv_color_to_u32(lv_obj_get_style_bg_color(node, LV_PART_MAIN)) & 0xffffff;
					result["foreground"] = lv_color_to_u32(lv_obj_get_style_text_color(node, LV_PART_MAIN)) & 0xffffff;
					result["outlineColor"] = lv_color_to_u32(lv_obj_get_style_outline_color(node,
					        LV_PART_MAIN)) & 0xffffff;
					result["arcColor"] = lv_color_to_u32(lv_obj_get_style_arc_color(node,
					        LV_PART_INDICATOR)) & 0xffffff;
					result["indicatorOpacity"] = lv_obj_get_style_bg_opa(node, LV_PART_INDICATOR);
					result["indicatorColor"] = lv_color_to_u32(lv_obj_get_style_bg_color(node,
					        LV_PART_INDICATOR)) & 0xffffff;
					result["indicatorBorder"] = lv_color_to_u32(lv_obj_get_style_border_color(node,
					        LV_PART_INDICATOR)) & 0xffffff;
					result["knobColor"] = lv_color_to_u32(lv_obj_get_style_bg_color(node, LV_PART_KNOB)) & 0xffffff;
					result["lineColor"] = lv_color_to_u32(lv_obj_get_style_line_color(node, LV_PART_MAIN)) & 0xffffff;
					result["indicatorLineColor"] = lv_color_to_u32(lv_obj_get_style_line_color(node,
					        LV_PART_INDICATOR)) & 0xffffff;
					result["imageRecolor"] = lv_color_to_u32(lv_obj_get_style_image_recolor(node,
					        LV_PART_MAIN)) & 0xffffff;
					result["cursorBorder"] = lv_color_to_u32(lv_obj_get_style_border_color(node,
					        LV_PART_CURSOR)) & 0xffffff;
					if(lv_obj_check_type(node, &lv_label_class)) result["text"] = lv_label_get_text(node);

					if(lv_obj_check_type(node, &lv_arc_class)) result["value"] = lv_arc_get_value(node);

					if(lv_obj_check_type(node, &lv_slider_class)) result["value"] = lv_slider_get_value(node);

					if(lv_obj_check_type(node, &lv_bar_class)) result["value"] = lv_bar_get_value(node);

					if(lv_obj_check_type(node, &lv_textarea_class))
						result["text"] =
						    lv_textarea_get_password_mode(node) ? "[redacted]" : lv_textarea_get_text(node);

					if(lv_obj_check_type(node, &lv_dropdown_class))
					{
						result["value"] = lv_dropdown_get_selected(node); result["open"] = lv_dropdown_is_open(node);
						auto *popup = lv_dropdown_get_list(node);
						result["listBackground"] = lv_color_to_u32(lv_obj_get_style_bg_color(popup,
						        LV_PART_MAIN)) & 0xffffff;
						lv_area_t popup_area; lv_obj_get_coords(popup, &popup_area);
						result["listBounds"] = DataValue::Array{popup_area.x1, popup_area.y1, popup_area.x2,
							                                    popup_area.y2};
					}
				}

				nodes.emplace_back(std::move(result));
			}
	}

	return DataValue::Object{{"event", "result"}, {"op", op}, {"ok", true}, {"views", std::move(views)},
		{"historyAvailable", history_available}, {"historyEnabled", history_enabled},
		{"historyAllocatedPoints", history_points},
		{"nodes", std::move(nodes)}, {"dataJson", data.registry.snapshot_json()}, {"scheme", appearance.selected()}};
}

void Application::start_metrics()
{
	if(metrics)
		metrics->start();
}

void Application::connection(const std::string &url)
{
	std::string e;
	if(!data.registry.publish("host.connection",
	    DataValue::Object{{"site", url + "/viewer"},
			{"editor", url + "/editor/"},
			{"mcp", LVGL_CBOR_NATIVE_MCP ? url + "/mcp" : "Not compiled"}}, e))
		throw std::runtime_error(e);

	data.registry.flush();
}

std::vector<uint8_t> Application::view_frame()
{
	std::string error;
	if(!publish_layout_debug(error)) throw std::runtime_error(error);

	return native_view::frame(project_ ? project_->root() : nullptr);
}

void Application::view_input(int32_t x, int32_t y, bool pressed)
{
	if(!view_pointer_)
		throw std::runtime_error("Pointer unavailable");

	if(!view_pointer_->input(x, y, pressed)) throw std::runtime_error("view_input_bounds");
}
