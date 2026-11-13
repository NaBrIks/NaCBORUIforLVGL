// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "../../examples/s3_style_lab/main/native_widgets/registry.hpp"
#include "../../examples/s3_style_lab/main/native_widgets/signal.hpp"
#include "../../examples/s3_style_lab/main/native_widgets/speedometer.hpp"
#include "../../examples/s3_style_lab/main/native_widgets/radar.hpp"
#include "lvgl_cbor/capabilities.hpp"
#include "lvgl_cbor/screen_runtime.hpp"
#include "lvgl_cbor/project_service.hpp"
#include "lvgl_cbor/data_registry.hpp"
#include "appearance.hpp"
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>
#include <set>
static void require(bool ok, const char *why)
{
	if(!ok)
	{
		std::fprintf(stderr, "FAILED: %s\n", why); std::exit(1);
	}
}

// Test actual LVGL geometry, including labels/internal native children. Disabling
// scroll is not evidence that an overflowing child is visible.
static void contained(lv_obj_t *parent)
{
	lv_area_t p; lv_obj_get_coords(parent, &p);
	for(uint32_t i = 0; i < lv_obj_get_child_count(parent); ++i)
	{
		auto *child = lv_obj_get_child(parent, i); if(lv_obj_has_flag(child, LV_OBJ_FLAG_HIDDEN)) continue;

		lv_area_t c; lv_obj_get_coords(child, &c);
		if(c.x1 < p.x1 || c.y1 < p.y1 || c.x2 > p.x2 || c.y2 > p.y2)
		{
			std::fprintf(stderr, "Outside parent: child [%ld,%ld,%ld,%ld], parent [%ld,%ld,%ld,%ld]\n", long(c.x1),
			    long(c.y1), long(c.x2), long(c.y2), long(p.x1), long(p.y1), long(p.x2), long(p.y2));
			require(false, "complete component containment");
		}

		contained(child);
	}
}

static void separate(lv_obj_t *root)
{
	for(uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
		for(uint32_t j = i + 1; j < lv_obj_get_child_count(root); ++j)
		{
			lv_area_t a, b; lv_obj_get_coords(lv_obj_get_child(root, i), &a);
			lv_obj_get_coords(lv_obj_get_child(root, j), &b);
			require(a.x2 < b.x1 || b.x2 < a.x1 || a.y2 < b.y1 || b.y2 < a.y1,
			    "demo sibling components must not overlap");
		}
}

int main(int argc, char **argv)
{
	require(argc == 2 || (argc == 3 && std::string(argv[2]) == "--interfaces"), "fixture directory");
	lv_init(); auto *display = lv_display_create(800, 480);
	std::vector<uint8_t> pixels(800 * 480 * 2);
	lv_display_set_color_format(display, LV_COLOR_FORMAT_RGB565);
	lv_display_set_buffers(display, pixels.data(), nullptr, pixels.size(), LV_DISPLAY_RENDER_MODE_FULL);
	lv_display_set_flush_cb(display, [](lv_display_t *d, const lv_area_t *, uint8_t *){
		lv_display_flush_ready(d);
	});
	const lvgl_cbor::Resource resources[]{{"montserrat_20", "const lv_font_t *", &lv_font_montserrat_20},
		{"montserrat_28", "const lv_font_t *", &lv_font_montserrat_28}};
	Appearance appearance{"inst_main", "inst_items", "inst_value", "inst_warn", "inst_fault"};
	lvgl_cbor::WidgetRegistry registry;
	require(lab_widgets::register_examples(registry, appearance), "register three native components");
	require(registry.revision() == 3, "catalog publication revision");
	require(!lab_widgets::register_examples(registry, appearance), "duplicate registration rejected");
	require(registry.revision() == 3, "failed registration does not publish a change");
	{std::ofstream out(std::string(argv[1]) + "/native-capabilities.json");
	 out << lvgl_cbor::runtime_capabilities_json(resources, 2, {}, &registry);}
	if(argc == 3)
	{
		const std::string path = argv[1];
		std::ifstream file(path + "/interfaces.cbor", std::ios::binary);
		std::vector<uint8_t> bytes{std::istreambuf_iterator<char>(file), {}};
		lvgl_cbor::ConstProjectSource source(bytes.data(), bytes.size());
		lvgl_cbor::DataRegistry data;
		using S = lvgl_cbor::DataSchema;
		std::string error;
		require(data.add_source({"demo.speed", S::object({{"kmh", S::number(0, 180)}, {"unit", S::text(16)}})}, error), error.c_str());
		require(data.add_source({"system.clock", S::object({{"localTime", S::text(8)}, {"syncState", S::text(16)}})}, error), error.c_str());
		require(data.add_source({"system.network", S::object({{"ip", S::text(15)}})}, error), error.c_str());
		auto cockpitResources = appearance.resources();
		cockpitResources.insert(cockpitResources.end(), std::begin(resources), std::end(resources));
		std::ifstream appearanceFile(path + "/appearance.cbor", std::ios::binary);
		std::vector<uint8_t> appearanceBytes{std::istreambuf_iterator<char>(appearanceFile), {}};
		require(appearance.load({appearanceBytes.data(), appearanceBytes.size(), {}}, "cream", cockpitResources.data(),
		    cockpitResources.size(), error), error.c_str());
		lvgl_cbor::ProjectService project(source, nullptr, {}, {}, cockpitResources.data(), cockpitResources.size(),
		    &registry, {}, &data);
		require(project.begin(error), error.c_str());
		lvgl_cbor::ScreenReply reply;
		require(project.load_screen("", reply), reply.error);
		auto select = [&](const char *id) {
			auto *control = project.find(id);
			if(!control)
				for(const auto &slot : project.status().views)
					if(slot.node == "interface") control = project.find(slot.page_instance, id);
			require(control, id);
			lv_obj_send_event(control, LV_EVENT_CLICKED, nullptr);
			data.flush();
			lv_refr_now(display);
			lv_obj_update_layout(lv_screen_active());
		};
		auto page = [&](const char *view, const char *screen) {
			for(const auto &slot : project.status().views)
				if(slot.node == view && slot.selected == screen && slot.error.empty()) return true;
			return false;
		};
		require(page("interface", "shell"), "classic interface is selected at boot");
		select("nav-1");
		require(page("content", "radar"), "classic radar tab");
		require(data.publish("system.clock", lvgl_cbor::DataValue::Object{{"localTime", "12:34:56"},
		    {"syncState", "synced"}}, error), error.c_str());
		require(data.publish("system.network", lvgl_cbor::DataValue::Object{{"ip", "192.0.2.20"}}, error), error.c_str());
		data.flush();
		select("to-cockpit");
		require(page("interface", "cockpit") && page("readouts", "cockpit-lcd"), "cockpit and LCD");
		lv_area_t visible{}, hidden{};
		lv_obj_get_coords(project.find("to-classic"), &visible);
		lv_obj_get_coords(project.find("to-cockpit"), &hidden);
		require(visible.x1 == 736 && visible.y1 == 436 && hidden.x1 >= 800, "only return button in the viewport");
		for(const auto &slot : project.status().views)
			if(slot.node == "interface")
			{
				auto *clock = project.find(slot.page_instance, "clock");
				auto *ip = project.find(slot.page_instance, "ip");
				require(clock && std::string(lv_label_get_text(clock)) == "12:34:56", "radio clock binding");
				require(ip && std::string(lv_label_get_text(ip)) == "192.0.2.20", "radio IP binding");
			}
		auto capture = [&](const char *name) {
			lv_refr_now(display);
			std::ofstream out(path + name, std::ios::binary);
			out.write(reinterpret_cast<const char *>(pixels.data()), pixels.size());
		};
		for(const auto &slot : project.status().views)
			if(slot.node == "interface") contained(project.find(slot.page_instance, "cockpit"));
		capture("/cockpit-lcd.rgb565");
		select("led");
		require(page("readouts", "cockpit-led"), "LED readouts selected");
		capture("/cockpit-led.rgb565");
		select("lcd");
		require(page("readouts", "cockpit-lcd"), "LCD readouts restored");
		select("to-classic");
		require(page("interface", "shell") && page("content", "radar"), "classic interface and tab restored");
		lv_obj_get_coords(project.find("to-cockpit"), &visible);
		lv_obj_get_coords(project.find("to-classic"), &hidden);
		require(visible.x1 == 736 && visible.y1 == 436 && hidden.x1 >= 800, "only flight button in the viewport");
		return 0;
	}

	std::ifstream file(std::string(argv[1]) + "/demo.cbor", std::ios::binary);
	std::vector<uint8_t> packet{std::istreambuf_iterator<char>(file), {}}; require(!packet.empty(), "packet");
	auto *original = lv_screen_active();
	{
		lvgl_cbor::ScreenRuntime runtime(resources, 2, {}, nullptr, lvgl_cbor::ScreenStyleRetention::Release,
		    &registry);
		lvgl_cbor::ScreenReply reply;
		require(runtime.load(packet.data(), packet.size(), reply), reply.error);
		require(reply.nodes == 5, "only authoring nodes counted");
		auto &pump = lab_widgets::state<lab_widgets::signal::State>(runtime.find("signal"));
		require(pump.value == 1, "simple scalar handler");
		auto &gauge = lab_widgets::state<lab_widgets::speedometer::State>(runtime.find("speedometer"));
		require(gauge.value == 87 && std::string(gauge.unit) == "km/h" && gauge.high == 240, "tuple handler");
		auto &radar = lab_widgets::state<lab_widgets::radar::State>(runtime.find("radar"));
		require(radar.count == 4 && std::string(radar.targets[1].name) == "BRAVO" && radar.targets[1].bearing == 122,
		    "nested CBOR cursor");
		require(std::string(radar.targets[3].name) == "DELTA" && radar.targets[3].strength == 45,
		    "cursor reaches last target");
		require(lv_obj_get_width(runtime.find("radar")) == 416 && lv_obj_get_y(runtime.find("radar")) == 48,
		    "common styles apply to native root");
		lv_refr_now(display);
		auto colors = [&](int x, int y, int w, int h){
				std::set<uint16_t> unique; for(int row = y; row < y + h; ++row)
					for(int col = x; col < x + w; ++col)
					{
						auto offset = (row * 800 + col) * 2;
						unique.insert(uint16_t(pixels[offset]) | (uint16_t(pixels[offset + 1]) << 8));
					}
				return unique.size();
			};
		require(colors(16, 168, 340, 292) > 12 && colors(368, 48, 416, 412) > 12,
		    "native drawing rasterizes scale, needle and radar");
		{std::ofstream raster(std::string(argv[1]) + "/native-raster.rgb565", std::ios::binary);
		 raster.write(reinterpret_cast<const char *>(pixels.data()), pixels.size());}
		auto first = pixels; lv_tick_inc(110); lv_timer_handler(); lv_refr_now(display);
		require(radar.sweep == 48 && pixels != first, "native timer changes sweep and rendered pixels");
		auto native = registry.find(260); require(native && native->activate, "registered native activation hook");
		native->activate(runtime.find("radar"), false); auto paused = radar.sweep;
		lv_tick_inc(110); lv_timer_handler(); require(radar.sweep == paused, "inactive cached radar pauses its timer");
		lab_widgets::radar::running(runtime.find("radar"), false);
		native->activate(runtime.find("radar"), true); lv_tick_inc(110); lv_timer_handler();
		require(radar.sweep == paused && !radar.running, "resume preserves explicit stopped state");
		lab_widgets::radar::running(runtime.find("radar"), true); lv_tick_inc(110); lv_timer_handler();
		require(radar.sweep != paused, "desired running and active owner resume the timer");
		auto retained = registry.find(260); require(registry.remove(260), "runtime removal");
		require(registry.revision() == 4, "runtime removal publishes a change");
		require(std::string(radar.targets[0].name) == "ALPHA", "live instance survives unregister");
		auto *previous = runtime.root();
		require(!runtime.load(packet.data(), packet.size(), reply) && runtime.root() == previous,
		    "unregistered replacement rolls back");
		require(registry.add(*retained), "runtime re-registration");
		for(int i = 0; i < 100; ++i)
			require(runtime.load(packet.data(), packet.size(), reply), "replace and delete internal tree");
		auto overwritten = packet; packet.assign(packet.size(), 0);
		auto &after = lab_widgets::state<lab_widgets::radar::State>(runtime.find("radar"));
		require(std::string(after.targets[1].name) == "BRAVO", "text survives input buffer release");
	}
	require(lv_screen_active() == original && lv_obj_get_child_count(original) == 0, "complete native object teardown");

	{
		std::ifstream file(std::string(argv[1]) + "/layout.cbor", std::ios::binary);
		std::vector<uint8_t> bytes{std::istreambuf_iterator<char>(file), {}};
		lvgl_cbor::ConstProjectSource source(bytes.data(), bytes.size());
		lvgl_cbor::DataRegistry data; std::string error; using S = lvgl_cbor::DataSchema;
		require(data.add_source({"demo.speed",
		                         S::object({{"kmh", S::number(0, 180)}, {"unit", S::text(16)},
									 {"sequence", S::integer(0)}})}, error), error.c_str());
		require(data.add_source({"system.clock", S::object({{"localTime", S::text(8)}, {"syncState", S::text(16)}})},
		    error), error.c_str());
		require(data.add_source({"system.network", S::object({{"ip", S::text(15)}})}, error), error.c_str());
		lvgl_cbor::ProjectService project(source, nullptr, {}, {}, resources, 2, &registry, {}, &data);
		require(project.begin(error), error.c_str()); lvgl_cbor::ScreenReply reply;
		require(project.load_screen("", reply), reply.error);
		for(int tab = 0; tab < 3; ++tab)
		{
			require(lv_obj_send_event(project.find(("nav-" + std::to_string(tab)).c_str()), LV_EVENT_CLICKED,
			    nullptr) == LV_RESULT_OK, "navigation event");
			data.flush(); lv_obj_update_layout(lv_screen_active());
			auto status = project.status();
			require(status.views.size() == 1 && status.views[0].error.empty(), "mounted page");
			auto *content = project.find("content");
			require(lv_obj_get_width(content) == 800 && lv_obj_get_height(content) == 408,
			    "actual shell content dimensions");
			separate(project.find(status.views[0].page_instance, "root"));
			contained(lv_screen_active());
			require(lv_obj_get_scroll_bottom(content) == 0 && lv_obj_get_scroll_right(content) == 0,
			    "no hidden overflow behind disabled scroll");
			if(tab != 1)
			{
				const double value = tab ? 179.625 : 43.125;
				require(data.publish("demo.speed",
				    lvgl_cbor::DataValue::Object{{"kmh", value}, {"unit", "km/h"}, {"sequence", tab + 1}}, error),
				    error.c_str()); data.flush();
				auto *obj = project.find(status.views[0].page_instance, tab ? "speed" : "gps_speed");
				require(obj && lab_widgets::state<lab_widgets::speedometer::State>(obj).value == value,
				    "CBOR binding preserves fractional needle position");
			}

			lv_refr_now(display);
			std::ofstream raster(std::string(argv[1]) + "/layout-" + std::to_string(tab) + ".rgb565", std::ios::binary);
			raster.write(reinterpret_cast<const char *>(pixels.data()), pixels.size());
		}
	}
	lv_display_delete(display); lv_deinit();
	std::puts(
		"Native graphics: rasterized dial/radar, animated pixels, cursor, registration, 100 replacements and timer teardown passed");

}
