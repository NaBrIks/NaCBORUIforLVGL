// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "lvgl_cbor/project_service.hpp"
#include "lvgl_cbor/data_registry.hpp"
#include "lvgl_cbor/contract.hpp"
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <cassert>
#include <fstream>
#include <iterator>
#include <map>
#include <cstdio>
#include <functional>
using namespace lvgl_cbor;
static std::vector<uint8_t> read(const std::string &p)
{
	std::ifstream f(p, std::ios::binary); return {std::istreambuf_iterator<char>(f), {}};
}

static std::string text(lv_obj_t *o)
{
	assert(o); return lv_label_get_text(o);
}

struct Resolver : ScreenResolver {
	std::map<std::string, std::vector<uint8_t> > screens;
	bool resolve_screen(const std::string &s, const uint8_t *&p, size_t &n)const override
	{
		auto i = screens.find(s); if(i == screens.end())
			return false;

		p = i->second.data(); n = i->second.size(); return true;
	}

};
static void click(ScreenRuntime &r, DataRegistry &data, const char *id)
{
	auto *o = r.find(id); assert(o); lv_obj_send_event(o, LV_EVENT_CLICKED, nullptr); data.flush();
}

static uint32_t page(const ScreenRuntime &r)
{
	auto s = r.view_status(); assert(!s.empty()); return s.front().page_instance;
}

static std::function<void(lv_obj_t *, bool)> activation;
static void native_activate(lv_obj_t *o, bool enabled)
{
	if(activation)
		activation(o, enabled);
}

struct DebugGeometry {
	lv_obj_t *object;
	lv_area_t area;
	int32_t content_width, content_height, scroll_x, scroll_y;
	const void *background;
	int32_t outline;
};

static void debug_geometry(lv_obj_t *object, std::vector<DebugGeometry> &out)
{
	lv_area_t area; lv_obj_get_coords(object, &area);
	out.push_back({object, area, lv_obj_get_content_width(object), lv_obj_get_content_height(object),
	               lv_obj_get_scroll_x(object), lv_obj_get_scroll_y(object),
	               lv_obj_get_style_bg_image_src(object, LV_PART_MAIN),
	               lv_obj_get_style_outline_width(object, LV_PART_MAIN)});
	for(uint32_t i = 0; i < lv_obj_get_child_count(object); ++i)
		debug_geometry(lv_obj_get_child(object, int32_t(i)), out);
}

static void same_geometry(const std::vector<DebugGeometry> &before, bool restored)
{
	for(const auto &item : before)
	{
		lv_area_t area; lv_obj_get_coords(item.object, &area);
		assert(area.x1 == item.area.x1 && area.y1 == item.area.y1 &&
		    area.x2 == item.area.x2 && area.y2 == item.area.y2);
		assert(lv_obj_get_content_width(item.object) == item.content_width);
		assert(lv_obj_get_content_height(item.object) == item.content_height);
		assert(lv_obj_get_scroll_x(item.object) == item.scroll_x && lv_obj_get_scroll_y(item.object) == item.scroll_y);
		if(restored)
		{
			assert(lv_obj_get_style_bg_image_src(item.object, LV_PART_MAIN) == item.background);
			assert(lv_obj_get_style_outline_width(item.object, LV_PART_MAIN) == item.outline);
		}
	}
}

static void depth_tile(lv_obj_t *object)
{
	size_t depth = 0;
	for(auto *parent = lv_obj_get_parent(object); parent; parent = lv_obj_get_parent(parent))
		++depth;
	const auto *image = static_cast<const lv_image_dsc_t *>(lv_obj_get_style_bg_image_src(object, LV_PART_MAIN));
	assert(image && image->header.cf == LV_COLOR_FORMAT_A1 && image->header.w == 16 && image->header.h == 16);
	assert(image->data_size == 32 && image->header.stride == 2);
	const uint8_t first_row[10] = {14, 4, 14, 30, 2, 31, 14, 31, 14, 14};
	for(size_t x = 0; x < 16; ++x)
	{
		assert(image->data[x / 8] == 0 && image->data[15 * 2 + x / 8] == 0);
		const bool expected = x >= 3 && x < 13 && (first_row[depth % 10] & (16 >> ((x - 3) / 2)));
		assert(bool(image->data[2 * 2 + x / 8] & (0x80 >> (x % 8))) == expected);
	}
}

int main(int argc, char **argv)
{
	assert(argc == 2); const std::string directory = argv[1];
	lv_init(); static lv_color_t pixels[800 * 480]; auto *display = lv_display_create(800, 480);
	lv_display_set_buffers(display, pixels, nullptr, sizeof(pixels), LV_DISPLAY_RENDER_MODE_DIRECT);
	lv_display_set_flush_cb(display, [](lv_display_t *d, const lv_area_t *, uint8_t *){
		lv_display_flush_ready(d);
	});
	Resolver resolver; for(auto name:{"shell", "a", "b", "c", "d", "e", "nested", "missing"})
		resolver.screens[name] = read(directory + "/" + name + ".cbor");
	DataRegistry data; std::string error; int hits = 0;
	assert(data.add_source({"app.value", DataSchema::integer()}, error));
	assert(data.add_action({"app.hit", DataSchema::null(), [&](const DataValue &, std::string &){
								++hits; return true;
							}}, error));
	assert(data.publish("app.value", 1, error)); data.flush();
	ScreenReply reply;
	{
		ScreenRuntime r(nullptr, 0, {}, nullptr, ScreenStyleRetention::Release, nullptr, &data, &resolver);
		auto &wire = resolver.screens["shell"]; assert(r.load(wire.data(), wire.size(), reply));
		lv_obj_update_layout(r.root());
		std::vector<DebugGeometry> before; debug_geometry(r.root(), before);
		LayoutDebugOptions options;
		r.set_layout_debug(true);
		assert(lv_obj_get_style_outline_width(r.root(), LV_PART_MAIN) == 3);
		assert(!lv_obj_get_style_bg_image_src(r.root(), LV_PART_MAIN)); // Outlines alone leave backgrounds intact.
		for(size_t depth = 0; depth < 16; ++depth)
		{
			options.levels.emplace_back(depth); options.levels.back().digit = true;
		}
		options.opacity = 128;
		r.set_layout_debug_options(options); depth_tile(r.root());
		assert(lv_obj_get_style_outline_width(r.root(), LV_PART_MAIN) == before.front().outline);
		assert(lv_obj_get_style_bg_image_opa(r.root(), LV_PART_MAIN) == 128);
		// Same depth, different effective layouts: one large G/F mask or no marker.
		auto *grid = lv_obj_create(r.root()), *flex = lv_obj_create(r.root()), *plain = lv_obj_create(r.root());
		lv_obj_set_style_layout(grid, LV_LAYOUT_GRID, LV_PART_MAIN);
		lv_obj_set_style_layout(flex, LV_LAYOUT_FLEX, LV_PART_MAIN);
		lv_obj_set_style_layout(plain, LV_LAYOUT_NONE, LV_PART_MAIN);
		options.layout_type = true;
		r.set_layout_debug_options(options);
		const auto *g = static_cast<const lv_image_dsc_t *>(lv_obj_get_style_bg_image_src(grid, LV_PART_MAIN));
		const auto *f = static_cast<const lv_image_dsc_t *>(lv_obj_get_style_bg_image_src(flex, LV_PART_MAIN));
		assert(g && f && g != f && g->data_size == 32 && f->data_size == 32);
		assert(g->data[4] == 0x07 && g->data[5] == 0xe0); // G top row: 01110 doubled.
		assert(f->data[4] == 0x1f && f->data[5] == 0xf8); // F top row: 11111 doubled.
		assert(!lv_obj_get_style_bg_image_src(plain, LV_PART_MAIN));
		assert(lv_obj_get_style_layout(grid, LV_PART_MAIN) == LV_LAYOUT_GRID);
		assert(lv_obj_get_style_layout(flex, LV_PART_MAIN) == LV_LAYOUT_FLEX);
		lv_obj_delete(grid); lv_obj_delete(flex); lv_obj_delete(plain);
		options.layout_type = false;
		for(auto &level : options.levels)
			level.digit = false;
		options.levels[3].outline = true; options.levels[3].digit = true;
		options.levels[3].outline_color = 0x123456; options.levels[3].digit_color = 0xabcdef;
		r.set_layout_debug_options(options);
		assert(!lv_obj_get_style_bg_image_src(r.root(), LV_PART_MAIN));
		auto *reading = r.find(page(r), "reading"); depth_tile(reading);
		assert(lv_color_to_u32(lv_obj_get_style_outline_color(reading, LV_PART_MAIN)) % 0x1000000 == 0x123456);
		assert(lv_color_to_u32(lv_obj_get_style_bg_image_recolor(reading, LV_PART_MAIN)) % 0x1000000 == 0xabcdef);
		options.outline_width = 5; r.set_layout_debug_options(options);
		assert(lv_obj_get_style_outline_width(reading, LV_PART_MAIN) == 5);
		assert(lv_obj_get_style_outline_pad(reading, LV_PART_MAIN) == -5);
		assert(r.layout_debug_max_depth() >= 3);
		for(auto &level : options.levels)
		{
			level.outline = true; level.digit = true;
		}
		r.set_layout_debug_options(options);
		r.set_layout_debug(true); assert(r.layout_debug()); lv_obj_update_layout(r.root());
		same_geometry(before, false);
		depth_tile(r.root()); depth_tile(r.find("content")); depth_tile(r.find(page(r), "reading"));
		// Cached page retains diagnostics. Newly mounted nested pages continue the actual LVGL depth.
		click(r, data, "go_nested");
		for(const auto &view : r.view_status())
			if(view.page_instance) depth_tile(r.find(view.page_instance, "root"));

		click(r, data, "go_a");
		r.set_layout_debug(false); assert(!r.layout_debug()); lv_obj_update_layout(r.root());
		same_geometry(before, true);
		for(unsigned i = 0; i < 3; ++i)
		{
			r.set_layout_debug(true); r.set_layout_debug(false);
		}
		lv_obj_update_layout(r.root()); same_geometry(before, true);
		// Disabled diagnostics must not attach themselves to pages loaded later.
		assert(r.navigate("content", "b", reply));
		assert(!lv_obj_get_style_bg_image_src(r.find(page(r), "root"), LV_PART_MAIN));
	}
	{
		ScreenRuntime r(nullptr, 0, {}, nullptr, ScreenStyleRetention::Release, nullptr, &data, &resolver);
		auto &wire = resolver.screens["shell"]; assert(r.load(wire.data(), wire.size(), reply));
		auto a = page(r); auto *aText = r.find(a, "reading"); assert(text(aText) == "1");
		assert(data.demand("app.value") == 1);
		assert(lv_obj_has_state(r.find("go_a"), LV_STATE_CHECKED));
		assert(lv_obj_get_width(r.find(a, "root")) == lv_obj_get_content_width(r.find("content")));
		// Queue navigation before the old page's action: pause invalidates that event generation.
		lv_obj_send_event(r.find("go_b"), LV_EVENT_CLICKED, nullptr);
		lv_obj_send_event(r.find(a, "hit"), LV_EVENT_CLICKED, nullptr); data.flush();
		assert(hits == 0); auto b = page(r); assert(b != a); assert(data.demand("app.value") == 1);
		assert(data.publish("app.value", 2, error)); data.flush(); assert(text(aText) == "1");
		lv_obj_send_event(r.find(a, "hit"), LV_EVENT_CLICKED, nullptr); data.flush(); assert(hits == 0);
		click(r, data, "go_a"); assert(page(r) == a); assert(text(aText) == "2");
		click(r, data, "go_b"); assert(page(r) == b);
		click(r, data, "go_c"); click(r, data, "go_d"); click(r, data, "go_e");
		assert(!r.find(b, "reading")); // Three inactive cache pages evict the least recently used.
		auto e = page(r); click(r, data, "go_a"); assert(page(r) == a); assert(!r.find(e, "reading"));
		click(r, data, "go_e"); assert(page(r) != e); // release creates a fresh instance.
		click(r, data, "go_nested"); auto nested = page(r); auto statuses = r.view_status();
		assert(statuses.size() == 2);
		auto child = statuses[1].page_instance; assert(r.find(nested, "content") != r.find("content"));
		assert(child != a && r.find(child, "reading") != r.find(a, "reading"));
		assert(lv_obj_get_width(r.find(child, "root")) == 320); // design preserves declared dimensions.
		lv_obj_send_event(r.find(nested, "go_b"), LV_EVENT_CLICKED, nullptr); data.flush();
		assert(page(r) == nested); assert(r.view_status()[1].selected == "b");
		click(r, data, "go_shell"); assert(page(r) == 0); assert(r.view_status()[0].error == "composition_cycle");
		assert(lv_obj_has_state(r.find("go_shell"), LV_STATE_CHECKED));
		assert(lv_obj_get_child_count(r.find("content")) > 0); // Hidden retained roots plus visible error label.
		click(r, data, "go_a"); assert(page(r) == a); assert(r.view_status()[0].error.empty());
		r.set_active(false); assert(data.demand("app.value") == 0);
		assert(!r.load(wire.data(), wire.size(), reply)); assert(std::string(reply.error) == "runtime_inactive");
		assert(data.demand("app.value") == 0);
		assert(data.publish("app.value", 3, error)); data.flush(); assert(text(aText) == "2");
		r.set_active(true); assert(text(aText) == "3"); assert(data.demand("app.value") == 1);
		lv_obj_send_event(r.find(a, "hit"), LV_EVENT_CLICKED, nullptr);
		r.unload(); assert(data.demand("app.value") == 0); data.flush(); assert(hits == 0);
	}
	{
		auto &wire = resolver.screens["missing"];
		ScreenRuntime r(nullptr, 0, {}, nullptr, ScreenStyleRetention::Release, nullptr, &data, &resolver);
		assert(r.load(wire.data(), wire.size(), reply)); assert(!r.navigate("content", "absent", reply));
		assert(r.view_status()[0].selected == "absent"); assert(r.view_status()[0].error == "view_screen_not_found");
		auto *last = lv_obj_get_child(r.find("content"), -1);
		assert(std::string(lv_label_get_text(last)) == LV_SYMBOL_CLOSE);
	}
	assert(data.demand("app.value") == 0);
	for(auto limits : {CompositionLimits{1, 16, 2}, CompositionLimits{8, 1, 2}})
	{
		ScreenRuntime r(nullptr, 0, {}, nullptr, ScreenStyleRetention::Release, nullptr, &data, &resolver, limits);
		auto &wire = resolver.screens["shell"]; assert(r.load(wire.data(), wire.size(), reply));
		assert(r.view_status()[0].selected == "a" && page(r) == 0);
		assert(r.view_status()[0].error == (limits.depth == 1 ? "composition_depth" : "composition_instances"));
		assert(data.demand("app.value") == 0);
	}
	{
		// A lifecycle hook can request navigation or delete its own object. The current composition
		// operation remains alive and teardown removes all callbacks before freeing ScreenNodes.
		using A = DataValue::Array; using O = DataValue::Object;
		DataValue value = O{{"v", 3}, {"kind", "screen"}, {"id", "native"}, {"abi", screen_contract_sha256},
			{"style_abi", contract_sha256}, {"name", "a"}, {"size", A{320, 180}},
			{"root", A{0, 0, A{A{1, "root"}, A{0, 1, A{DataValue(A{1, "reading"})}},
						       A{0, 2, A{DataValue(A{1, "hit"})}},
						       A{0, A{256, "lifecycle-1"}, A{DataValue(A{1, "native"})}}}}},
			{"bindings_version", 1},
			{"bindings",
			 A{O{{"node", "reading"}, {"method", 256}, {"value", O{{"source", "app.value"}}}, {"format", O{}}}}}};
		auto old = resolver.screens["a"]; resolver.screens["a"] = encode_data_value(value);
		WidgetRegistry widgets; assert(widgets.add({256, "test:lifecycle", "lifecycle-1", lv_obj_create,
		                                            [](lv_obj_t *, uint16_t, CborValue &, WidgetContext &){
														return false;
													}, "{}", {}, native_activate}));
		ScreenRuntime r(nullptr, 0, {}, nullptr, ScreenStyleRetention::Release, &widgets, &data, &resolver);
		auto &wire = resolver.screens["shell"]; assert(r.load(wire.data(), wire.size(), reply)); int pauses = 0;
		activation = [&](lv_obj_t *obj, bool enabled){
				if(!enabled)
				{
					++pauses; r.unload(); assert(r.root());
					ScreenReply nested; assert(!r.navigate("content", "b", nested));
					assert(std::string(nested.error) == "runtime_busy"); lv_obj_delete(obj);
				}
			};
		click(r, data, "go_b"); assert(pauses == 1); click(r, data, "go_a");
		activation = {}; r.unload(); assert(data.demand("app.value") == 0); resolver.screens["a"] = std::move(old);
	}
	{
		const auto wire = read(directory + "/project.cbor"); ConstProjectSource source(wire.data(), wire.size());
		MemoryProjectStore store;
		ProjectService service(source, &store, {}, {}, nullptr, 0, nullptr, {}, &data); assert(service.begin(error));
		assert(service.load_screen("shell", reply));
		auto before = service.status(); auto first = before.views[0].page_instance;
		auto *old = service.find(first, "reading"); assert(old);
		lv_obj_send_event(service.find("go_b"), LV_EVENT_CLICKED, nullptr); data.flush();
		assert(service.status().views[0].selected == "b");
		auto *root = service.root(); assert(service.save_project({wire.data(), wire.size(), {}}, error));
		assert(service.root() == root);
		lv_obj_send_event(service.find(service.status().views[0].page_instance, "hit"), LV_EVENT_CLICKED, nullptr);
		assert(service.load_screen("shell", reply)); assert(service.status().views[0].selected == "a");
		assert(data.demand("app.value") == 1);
		data.flush(); assert(hits == 0);
		assert(service.status().root_instance != before.root_instance); assert(!service.find(first, "reading"));
		assert(service.find(0, "content") == service.find("content"));
	}
	{
		const auto wire = read(directory + "/refresh.cbor"); ConstProjectSource source(wire.data(), wire.size());
		MemoryProjectStore store;
		ProjectService service(source, &store, {}, {}, nullptr, 0, nullptr, {}, &data); assert(service.begin(error));
		assert(service.refresh(reply)); // With no presentation, refresh starts the saved entry.
		auto event = [&](uint32_t instance, const char *id) {
				auto *object = service.find(instance, id); assert(object);
				lv_obj_send_event(object, LV_EVENT_CLICKED, nullptr); data.flush();
			};
		auto view = [&](uint32_t instance, const char *node) {
				for(const auto &status : service.status().views)
					if(status.instance == instance && status.node == node)  return status;

				assert(false); return ScreenViewStatus{};
			};
		auto open = [&]() {
				event(0, "open_left"); event(0, "open_right");
				const auto root = service.status().root_instance;
				const auto left = view(root, "left").page_instance, right = view(root, "right").page_instance;
				event(left, "open_nested"); event(right, "open_nested");
				event(view(left, "content").page_instance, "go_b");
			};
		auto verify = [&](const char *left_page, const char *left_node = "content") {
				const auto root = service.status().root_instance;
				const auto left = view(root, "left"), right = view(root, "right");
				assert(left.selected == "section" && right.selected == "section");
				const auto left_child = view(left.page_instance, "content");
				const auto right_child = view(right.page_instance, "content");
				assert(left_child.selected == "nested" && right_child.selected == "nested");
				assert(view(left_child.page_instance, left_node).selected == left_page);
				assert(view(right_child.page_instance, left_node).selected == "a");
			};
		auto save = [&](const char *file) {
				const auto packet = read(directory + "/" + file);
				assert(service.save_project({packet.data(), packet.size(), {}}, error));
			};
		open(); verify("b");
		const auto first = service.status().root_instance;
		auto *root = service.root(); save("refresh-edited.cbor");
		assert(service.root() == root); verify("b"); // Saving has no visual side effects.
		const auto debug_revision = service.revision();
		LayoutDebugOptions debug_options;
		for(size_t depth = 0; depth < 16; ++depth)
		{
			debug_options.levels.emplace_back(depth); debug_options.levels.back().digit = true;
		}
		service.set_layout_debug_options(debug_options);
		service.set_layout_debug(true); assert(service.layout_debug()); depth_tile(service.root());
		assert(service.revision() == debug_revision);
		assert(service.refresh(reply)); verify("b");
		assert(service.layout_debug()); depth_tile(service.root());
		service.set_layout_debug(false); assert(!service.layout_debug());
		assert(service.status().root_instance != first && !service.find(first, "root"));
		assert(service.status().displayed_revision == service.revision() && !service.status().preview);
		const auto left = view(service.status().root_instance, "left");
		const auto nested_page = view(left.page_instance, "content");
		assert(service.find(view(nested_page.page_instance, "content").page_instance, "edited"));
		const auto preview = read(directory + "/refresh.cbor");
		assert(service.preview({preview.data(), preview.size(), {}}, "workspace", reply));
		for(const auto &status : service.status().views)
			assert(status.selected == "a");

		assert(service.status().preview); open(); verify("b");
		assert(service.refresh(reply)); verify("b");
		save("refresh-renamed.cbor"); assert(service.refresh(reply)); verify("a", "renamed");
		save("refresh-removed.cbor"); assert(service.refresh(reply));
		for(const auto &status : service.status().views)
			if(status.node == "content")  assert(status.selected == "a");

		root = service.root(); const auto before = service.status().root_instance;
		save("refresh-invalid.cbor"); assert(!service.refresh(reply));
		assert(service.root() == root && service.status().root_instance == before);
		save("refresh-edited.cbor"); assert(service.load_screen("workspace", reply));
		for(const auto &status : service.status().views)
			assert(status.selected == "a");

		open(); assert(service.reset({}, {}, error)); assert(service.refresh(reply)); verify("b");
		assert(service.load_screen("workspace", reply));
		for(const auto &status : service.status().views)
			assert(status.selected == "a");

		open(); save("refresh-other.cbor"); assert(service.refresh(reply));
		for(const auto &status : service.status().views)
			assert(status.selected == "a");

		save("refresh-edited.cbor"); assert(service.refresh(reply)); open();
		save("refresh-no-root.cbor"); assert(service.refresh(reply));
		assert(service.status().displayed_screen == "section");
		assert(service.status().views.size() == 1 && service.status().views[0].selected == "a");
	}
	assert(data.demand("app.value") == 0); data.flush(); lv_deinit();
	std::puts(
		"Composition: scoped instances, cache/release/retain, pause/resume, deferred cancellation, error view and project replacement passed");
}
