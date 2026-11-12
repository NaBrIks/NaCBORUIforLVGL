// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "board.hpp"
#include "esp_cpu.h"
#include "esp_heap_caps.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lvgl.h"
#include <array>
#include <cinttypes>
#include <cstdio>
#include <cstdlib>
#if BENCH_SCREEN_PHASES
#include <cstring>

namespace
{
	constexpr const char *phase_names[]{"parse", "objects", "layout", "named_styles"};
	uint32_t phase_cycles[std::size(phase_names)]{};
}

extern "C" void nacbor_bench_screen_phase(const char *name, uint32_t cycles)
{
	for(size_t i = 0; i < std::size(phase_names); ++i)
		if(std::strcmp(name, phase_names[i]) == 0)
		{
			phase_cycles[i] = cycles;
			break;
		}
}
#endif

#define BENCH_DIRECT (BENCH_PROFILE == 1 || BENCH_PROFILE == 3)
#if BENCH_PROFILE > 0 && !BENCH_DIRECT
#include "lvgl_cbor/screen_runtime.hpp"
#endif
#include "stages.hpp"

namespace
{
	constexpr uint32_t internal_caps = MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT;
	constexpr uint32_t psram_caps = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT;

	struct Sample {
		const char *phase;
		int64_t time;
		unsigned ram, ram_largest, ram_min, psram, psram_largest, psram_min;
	};
	Sample *samples{};
	unsigned sample_count{};
	uint32_t scene_fingerprint{};
	unsigned scene_nodes{}, description_bytes{}, photo_colors{}, gif_colors{};

#if BENCH_PROFILE > 0 && BENCH_PROFILE < 5
	uint32_t scene_cycles{};

	template<typename Build>
	auto measure_scene(Build build)
	{
		const auto priority = uxTaskPriorityGet(nullptr);
		vTaskPrioritySet(nullptr, priority + 2);
		const auto begin = esp_cpu_get_cycle_count();
		auto result = build();
		scene_cycles = esp_cpu_get_cycle_count() - begin;
		vTaskPrioritySet(nullptr, priority);
		return result;
	}
#endif

	void mark(const char *phase)
	{
		if(sample_count >= 40) return;

		samples[sample_count++] = {phase, esp_timer_get_time(),
		    unsigned(heap_caps_get_free_size(internal_caps)),
		    unsigned(heap_caps_get_largest_free_block(internal_caps)),
		    unsigned(heap_caps_get_minimum_free_size(internal_caps)),
		    unsigned(heap_caps_get_free_size(psram_caps)),
		    unsigned(heap_caps_get_largest_free_block(psram_caps)),
		    unsigned(heap_caps_get_minimum_free_size(psram_caps))};
	}

	void print_samples()
	{
		for(unsigned index = 0; index < sample_count; ++index)
		{
			const auto &s = samples[index];
			std::printf("BENCH profile=%d phase=%s us=%" PRId64 " ram=%u ram_largest=%u ram_min=%u psram=%u psram_largest=%u psram_min=%u\n",
			    BENCH_PROFILE, s.phase, s.time, s.ram, s.ram_largest, s.ram_min,
			    s.psram, s.psram_largest, s.psram_min);
		}

		std::printf("BENCH_TREE profile=%d actual_nodes=%u declared_nodes=%u cbor=%u\n",
		    BENCH_PROFILE, scene_nodes, BENCH_PROFILE > 0 ? 100 : 0, description_bytes);
		std::printf("BENCH_FRAME profile=%d fingerprint=%08" PRIx32 "\n", BENCH_PROFILE, scene_fingerprint);
		std::printf("BENCH_MEDIA profile=%d photo_colors=%u gif_colors=%u\n",
		    BENCH_PROFILE, photo_colors, gif_colors);
#if BENCH_PROFILE > 0 && BENCH_PROFILE < 5
		std::printf("BENCH_CYCLES profile=%d build=%" PRIu32 "\n", BENCH_PROFILE, scene_cycles);
#endif
#if BENCH_SCREEN_PHASES
		std::printf("BENCH_PHASES profile=%d", BENCH_PROFILE);
		for(size_t i = 0; i < std::size(phase_names); ++i)
			std::printf(" %s=%" PRIu32, phase_names[i], phase_cycles[i]);
		std::putchar('\n');
#endif
		std::printf("BENCH_DONE profile=%d\n", BENCH_PROFILE);
	}

	uint32_t tick()
	{
		return uint32_t(esp_timer_get_time() / 1000);
	}

#if BENCH_PROFILE > 0
	lv_image_dsc_t portrait{}, robot{};
	lv_obj_t *last_gif{};
	bool decode_gif_during_mount{};

	lv_obj_t *make_gif(lv_obj_t *parent)
	{
		last_gif = lv_gif_create(parent);
		if(decode_gif_during_mount && last_gif) lv_gif_set_src(last_gif, &robot);
		return last_gif;
	}

#include "fixtures.hpp"

	lv_image_dsc_t compressed_asset(const uint8_t *data, size_t size, uint16_t width, uint16_t height)
	{
		lv_image_dsc_t result{};
		result.header.magic = LV_IMAGE_HEADER_MAGIC;
		result.header.cf = LV_COLOR_FORMAT_RAW;
		result.header.w = width;
		result.header.h = height;
		result.data = data;
		result.data_size = size;
		return result;
	}

	unsigned visible_colors(int x, int y)
	{
		std::array<uint16_t, 64> values{};
		unsigned count{};
		for(int row = 0; row < 8; ++row)
		{
			for(int column = 0; column < 8; ++column)
			{
				const auto pixel = display_pixel(x + 10 + column * 22, y + 8 + row * 14);
				unsigned index{};
				while(index < count && values[index] != pixel) ++index;
				if(index == count) values[count++] = pixel;
			}
		}
		return count;
	}

	unsigned count_nodes(const lv_obj_t *obj)
	{
		unsigned count = 1;
		for(unsigned index = 0; index < lv_obj_get_child_count(obj); ++index)
			count += count_nodes(lv_obj_get_child(obj, int(index)));

		return count;
	}
#endif
}

extern "C" void app_main()
{
	Sample records[40];
	samples = records;
	mark("entry");
	DisplayConfig display_config;
	display_config.rle = BENCH_PROFILE >= 13;
	ESP_ERROR_CHECK(initialize_display(display_config, mark));
	lv_tick_set_cb(tick);
	mark("display_ready");

#if BENCH_PROFILE > 0
	static_assert(sizeof(portrait_bytes) == 192 * 192 * 2);
	portrait = compressed_asset(portrait_bytes, sizeof(portrait_bytes), 192, 192);
	portrait.header.cf = LV_COLOR_FORMAT_RGB565;
	portrait.header.stride = 192 * 2;
	robot = compressed_asset(robot_bytes, sizeof(robot_bytes), 192, 128);

	mark("assets_ready");
#if BENCH_PROFILE >= 6
	lvgl_cbor::DataRegistry data;
	std::string error;
	unsigned hits{};
	check(data.add_source({"bench.value", lvgl_cbor::DataSchema::integer(0, 100)}, error), "source", error);
	check(data.add_action({"bench.hit", lvgl_cbor::DataSchema::null(),
	    [&](const auto &, auto &) { ++hits; return true; }}, error), "action", error);
	check(data.publish("bench.value", 35, error), "publish", error);
	data.flush();
	mark("registry_ready");
	auto *registry = &data;
#elif !BENCH_DIRECT
	constexpr lvgl_cbor::DataRegistry *registry = nullptr;
#endif
#if BENCH_PROFILE >= 8
	lvgl_cbor::DataHistory history(data);
	check(history.add({"bench.value", {}, "bench.series", {}, {}, {}, {}, 100, 64}, error), "history_add", error);
	check(history.set_enabled(true, error), "history_enable", error);
	mark("history_ready");
#endif

#if BENCH_DIRECT
	heap_caps_monitor_local_minimum_free_size_start();
	auto *root = measure_scene(build_direct);
#else
	lvgl_cbor::WidgetRegistry widgets;
	if(!widgets.add({514, "bench:gif", "lvgl-gif-1", make_gif,
	    [](lv_obj_t *, uint16_t, CborValue &, lvgl_cbor::WidgetContext &) { return false; },
	    gif_metadata}))
	{
		std::printf("BENCH_ERROR GIF registration\n");
		return;
	}

#if BENCH_PROFILE >= 7
	Appearance appearance;
	check(appearance.load({appearance_packet, sizeof(appearance_packet), {}}, "dark", nullptr, 0, error), "schemes_load", error);
#if BENCH_PROFILE >= 13
	check(data.add_action({"bench.scheme", lvgl_cbor::DataSchema::text(8),
	    [&](const auto &value, auto &why) {
		    return appearance.select(std::get<std::string>(value.value), why);
	    }}, error), "scheme_action", error);
#endif
	const lvgl_cbor::Resource resources[]{{"bench.portrait", "const void *", &portrait},
	    {"ui.panel", "const lv_style_t *", appearance.role_style("panel")}
#if BENCH_PROFILE >= 13
	    , {"ui.canvas", "const lv_style_t *", appearance.role_style("canvas")}
	    , {"ui.text", "const lv_style_t *", appearance.role_style("text")}
	    , {"ui.button", "const lv_style_t *", appearance.role_style("button")}
#endif
	};
	mark("schemes_ready");
#else
	const lvgl_cbor::Resource resources[]{{"bench.portrait", "const void *", &portrait}};
#endif
	constexpr auto resource_count = sizeof(resources) / sizeof(resources[0]);
	lvgl_cbor::ScreenReply reply;
#if BENCH_PROFILE >= 9
	heap_caps_monitor_local_minimum_free_size_start();
	mount_benchmark_fs();
	mark("fs_mounted");
	provision_benchmark_file(project_cbor, sizeof(project_cbor));
	mark("fs_seeded");
	lvgl_cbor::FileProjectSource source(fs_path, "spiffs");
	lvgl_cbor::FileProjectStore store("/bench/bench-changes-v1", "spiffs");
	lvgl_cbor::ProjectService runtime(source, &store, {}, {}, resources, resource_count, &widgets, {}, registry);
	check(runtime.begin(error), "project_read", error);
	mark("project_read");
	heap_caps_monitor_local_minimum_free_size_stop();
	heap_caps_monitor_local_minimum_free_size_start();
	const bool loaded = runtime.load_screen("shell", reply);
	description_bytes = sizeof(project_cbor);
#else
#if BENCH_PROFILE >= 5
	FlashPages pages({screen_cbor, sizeof(screen_cbor)}, {alternate_cbor, sizeof(alternate_cbor)},
	    {released_cbor, sizeof(released_cbor)});
	auto *resolver = &pages;
	const auto &packet = shell_cbor;
#else
	constexpr lvgl_cbor::ScreenResolver *resolver = nullptr;
	const auto &packet = screen_cbor;
#endif
	heap_caps_monitor_local_minimum_free_size_start();
	lvgl_cbor::ScreenRuntime runtime(resources, resource_count, {}, nullptr,
	    lvgl_cbor::ScreenStyleRetention::Release, &widgets, registry, resolver);
#if BENCH_PROFILE < 5
	const bool loaded = measure_scene([&]() {
		return runtime.load(packet, sizeof(packet), reply, {}, BENCH_TRUSTED_CBOR ?
		           lvgl_cbor::ScreenValidation::TrustedEmbedded : lvgl_cbor::ScreenValidation::Checked);
	});
#else
	const bool loaded = runtime.load(packet, sizeof(packet), reply);
#endif
	description_bytes = sizeof(packet);
#endif
	if(!loaded)
	{
		std::printf("BENCH_ERROR CBOR node=%s error=%s\n", reply.node, reply.error);
		return;
	}

	auto *root = runtime.root();
#endif

	mark("screen_built");
	heap_caps_monitor_local_minimum_free_size_stop();

	if(!last_gif)
	{
		std::printf("BENCH_ERROR GIF missing\n");
		return;
	}

	heap_caps_monitor_local_minimum_free_size_start();
	lv_gif_set_src(last_gif, &robot);
	if(!lv_gif_is_loaded(last_gif))
	{
		std::printf("BENCH_ERROR GIF decoder unavailable\n");
		return;
	}

	lv_gif_pause(last_gif);
	mark("gif_decoded");
	heap_caps_monitor_local_minimum_free_size_stop();
	scene_nodes = count_nodes(root);
#endif

	heap_caps_monitor_local_minimum_free_size_start();
	lv_refr_now(nullptr);
	mark("first_frame");
	heap_caps_monitor_local_minimum_free_size_stop();
#if BENCH_PROFILE > 0
	uint32_t fingerprint = 2166136261u;
#if BENCH_SCREEN_PHASES
	constexpr int pixel_step = 1;
#else
	constexpr int pixel_step = 3;
#endif
	for(int y = 0; y < 480; y += pixel_step)
		for(int x = 0; x < 800; x += pixel_step)
			fingerprint = (fingerprint ^ display_pixel(x, y)) * 16777619u;

	scene_fingerprint = fingerprint;
	photo_colors = visible_colors(592, 39);
	gif_colors = visible_colors(592, 251);
	if(photo_colors < 10 || gif_colors < 2)
	{
		std::printf("BENCH_ERROR media not drawn photo_colors=%u gif_colors=%u\n", photo_colors, gif_colors);
		return;
	}
	lv_gif_resume(last_gif);
	decode_gif_during_mount = true;
#endif

#if BENCH_PROFILE >= 5
	const auto switch_page = [&](const char *page, const char *phase)
	{
		heap_caps_monitor_local_minimum_free_size_start();
#if BENCH_PROFILE >= 6
		auto *obj = runtime.find((std::string("go_") + page).c_str());
		if(!obj) std::abort();

		lv_obj_send_event(obj, LV_EVENT_CLICKED, nullptr);
		data.flush();
#else
		if(!runtime.navigate("content", page, reply)) std::abort();
#endif
		lv_refr_now(nullptr);
		mark(phase);
		heap_caps_monitor_local_minimum_free_size_stop();
	};
	switch_page("alternate", "page_cache");
	switch_page("released", "page_release");
	switch_page("dashboard", "page_back");
#endif
#if BENCH_PROFILE >= 6
	heap_caps_monitor_local_minimum_free_size_start();
	const auto run_data = [&] {
		const auto value = int(tick() / 100 % 101);
		check(data.publish("bench.value", value, error), "publish", error);
		data.flush();
#if BENCH_PROFILE >= 8
		check(history.tick(tick(), error), "history_tick", error);
		data.flush();
#endif
	};
	run_data();
#if BENCH_PROFILE < 9
	if(auto *value = runtime.find(runtime.view_status().at(0).page_instance, "g0_value_0"))
		lv_obj_send_event(value, LV_EVENT_CLICKED, nullptr);
#endif
	data.flush();
	mark("bindings_updated");
	heap_caps_monitor_local_minimum_free_size_stop();
#endif
#if BENCH_PROFILE >= 7
	heap_caps_monitor_local_minimum_free_size_start();
	check(appearance.select("cream", error), "scheme_select", error);
	lv_refr_now(nullptr);
	mark("scheme_changed");
	heap_caps_monitor_local_minimum_free_size_stop();
#endif
#if BENCH_PROFILE >= 10
	heap_caps_monitor_local_minimum_free_size_start();
	const bool connected = start_wifi(mark);
	if(!connected) std::printf("BENCH_NETWORK disconnected\n");
	heap_caps_monitor_local_minimum_free_size_stop();
#endif

#if BENCH_PROFILE >= 11
	using namespace NaWServer;
	heap_caps_monitor_local_minimum_free_size_start();
	ProjectApi project_api(runtime);
	DataApi data_api(data, [&](const char *id) { return runtime.find(id); });
	check(project_api.begin() && data_api.begin(), "api_start", error);
	const auto catalog = lvgl_cbor::runtime_capabilities_json(resources, resource_count, {}, &widgets, &data);
	auto capabilities_reply = [&](Response &response) {
			(void)response.header("Access-Control-Allow-Origin", "*");
			return response.sendImmutable(200, "application/json", {reinterpret_cast<const uint8_t *>(catalog.data()), catalog.size()});
		};
	Route capabilities("/api/capabilities", HttpMethod::Get, EndpointRef{capabilities_reply});
	auto info_reply = [](Response &response) {
			static constexpr char body[] = "{\"platform\":\"esp32s3-memory-bench\",\"width\":800,\"height\":480}";
			return response.sendImmutable(200, "application/json", {reinterpret_cast<const uint8_t *>(body), sizeof(body) - 1});
		};
	Route info("/api/info", HttpMethod::Get, EndpointRef{info_reply});
#if BENCH_PROFILE >= 12
	EditorAssets editor;
#endif
#if BENCH_PROFILE >= 13
	auto frame_api = std::make_unique<FrameApi>();
	check(frame_api->begin(800, 480), "frame_api", error);
#endif
	HandlerBase *const routes[]{&info, &capabilities, &project_api, &data_api
#if BENCH_PROFILE >= 12
		, &editor
#endif
#if BENCH_PROFILE >= 13
		, frame_api.get(), &frame_api->socket()
#endif
	};
	mark("http_routes");
	tcp::IdfTransport transport;
	TcpHttpBackend backend(transport, http_options());
	HttpServer server(backend, routes);
	check(transport.start().status == tcp::Status::Ok && server.begin() == HttpError::Ok, "http_start", error);
	mark("http_ready");
	heap_caps_monitor_local_minimum_free_size_stop();
#endif

#if BENCH_PROFILE >= 6
	auto next_data = tick();
#endif
	const auto animation_end = esp_timer_get_time() + 2400000;
	auto next_report = animation_end;
	heap_caps_monitor_local_minimum_free_size_start();
	while(true)
	{
		lv_timer_handler();
#if BENCH_PROFILE >= 6
		if(tick() >= next_data)
		{
			run_data();
			next_data = tick() + 100;
		}
#endif
#if BENCH_PROFILE >= 11
		project_api.process();
		data_api.process();
#endif
#if BENCH_PROFILE >= 13
		frame_api->set_scene(runtime.display_generation());
		frame_api->process();
		frame_api->process_socket(tick());
#endif
		const auto now = esp_timer_get_time();
		if(now >= next_report)
		{
			if(next_report == animation_end)
			{
				mark("steady");
				heap_caps_monitor_local_minimum_free_size_stop();
			}
			print_samples();
			next_report = now + 2000000;
		}
		vTaskDelay(pdMS_TO_TICKS(5));
	}
}
