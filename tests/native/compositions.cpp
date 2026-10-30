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
	assert(data.demand("app.value") == 0); data.flush(); lv_deinit();
	std::puts(
		"Composition: scoped instances, cache/release/retain, pause/resume, deferred cancellation, error view and project replacement passed");
}
