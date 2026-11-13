// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "../../examples/native_widget/meter.hpp"
#include "../../examples/s3_style_lab/main/component_preview.hpp"
#include "lvgl_cbor/capabilities.hpp"
#include "lvgl_cbor/screen_runtime.hpp"
#include "lvgl_cbor/contract.hpp"
#include "lvgl_cbor/data_registry.hpp"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>
#if LV_USE_OBJ_PROPERTY_NAME
#error Screen runtime must not use LVGL property names
#endif
static void require(bool ok, const char *message)
{
	if(!ok)
	{
		std::fprintf(stderr, "FAILED: %s\n", message);
		std::exit(1);
	}
}

static std::vector<uint8_t> fixture(const std::string &dir, const char *name)
{
	std::ifstream file(dir + "/" + name + ".cbor", std::ios::binary);
	require(file.good(), name);
	return {std::istreambuf_iterator<char>(file), {}};
}

// Construct raw wire packets without the PC authoring validator.
static std::vector<uint8_t> raw_line_packet(size_t count)
{
	using Array = lvgl_cbor::DataValue::Array;
	using Object = lvgl_cbor::DataValue::Object;
	Array points;
	for(size_t i = 0; i < count; ++i)
		points.emplace_back(Array{int64_t(i), int64_t(i % 100)});
	const Array line{0, 6, Array{Array{1, "trace"}, Array{256, std::move(points)}}};
	const Array root{0, 0, Array{lvgl_cbor::DataValue(line)}};
	return lvgl_cbor::encode_data_value(Object{
		{"v", lvgl_cbor::screen_contract_version}, {"kind", "screen"}, {"id", "raw-line"},
		{"name", "raw-line"}, {"abi", lvgl_cbor::screen_contract_sha256},
		{"style_abi", lvgl_cbor::contract_sha256}, {"size", Array{800, 480}}, {"root", root}});
}

struct Reentry {
	lvgl_cbor::ScreenRuntime *same, *other;
	const std::vector<uint8_t> *packet;
	lv_obj_t *left, *right;
	bool called{}, other_ok{}, same_rejected{};
};
static void nested_mount(lv_event_t *event)
{
	auto &c = *static_cast<Reentry *>(lv_event_get_user_data(event));
	if(c.called)
		return;

	c.called = true;
	lvgl_cbor::ScreenReply reply;
	c.same_rejected = !c.same->mount(c.packet->data(), c.packet->size(), c.left, reply) &&
	    std::string(reply.error) == "runtime_busy";
	c.other_ok = c.other->mount(c.packet->data(), c.packet->size(), c.right, reply);
}

int main(int argc, char **argv)
{
	require(argc == 2, "fixture directory");
	const std::string dir = argv[1];
	lv_init();
	auto *display = lv_display_create(800, 480);
	auto *original = lv_screen_active();
	const lvgl_cbor::Resource resources[]{
		{"montserrat_28", "const lv_font_t *", &lv_font_montserrat_28},
		{"montserrat_20", "const lv_font_t *", &lv_font_montserrat_20}};
	{
		using namespace lvgl_cbor;
		using Array = DataValue::Array;
		auto slider_packet = [](int64_t value) {
			const Array slider{0, 4, Array{Array{1, "slider"}, Array{256, Array{0, 100}}, Array{257, value}}};
			return encode_data_value(DataValue::Object{
				{"v", screen_contract_version}, {"kind", "screen"}, {"id", "integer-range"},
				{"name", "integer-range"}, {"abi", screen_contract_sha256}, {"style_abi", contract_sha256},
				{"size", Array{800, 480}}, {"root", Array{0, 0, Array{DataValue(slider)}}}});
		};
		ScreenRuntime runtime(resources, 2);
		ScreenReply reply;
		const auto in_int32 = slider_packet(125);
		require(runtime.load(in_int32.data(), in_int32.size(), reply), "checked slider accepts int32");
		require(runtime.find("slider") && lv_slider_get_value(runtime.find("slider")) == 100,
		    "LVGL clamps an int32 value to the slider range");
		const auto packet = slider_packet(int64_t{4294967296} + 25);
		require(!runtime.load(packet.data(), packet.size(), reply), "checked slider rejects an out-of-range int32");
		require(runtime.load(packet.data(), packet.size(), reply, {}, ScreenValidation::TrustedEmbedded),
		    "trusted slider value skips the narrowing range check");
		require(runtime.find("slider") && lv_slider_get_value(runtime.find("slider")) == 25,
		    "LVGL sees the narrowed value");
		const auto shared = fixture(dir, "shared");
		require(runtime.load(shared.data(), shared.size(), reply, {}, ScreenValidation::TrustedEmbedded),
		    "embedded screen loads named and inline styles");
		require(lv_color_to_u32(lv_obj_get_style_bg_color(runtime.find("button_a"), LV_PART_MAIN)) ==
		    0xff246e8cu, "embedded screen resolves a named style");
		const auto interleaved = fixture(dir, "cursor_interleaved");
		require(runtime.load(interleaved.data(), interleaved.size(), reply, {}, ScreenValidation::TrustedEmbedded),
		    "embedded screen executes nested and interleaved commands");
		require(std::string(lv_label_get_text(runtime.find("parent"))) == "after" &&
		    std::string(lv_label_get_text(runtime.find("caption"))) == "inside",
		    "embedded command cursor resumes after nested objects");
	}
	{
		lvgl_cbor::ScreenRuntime runtime(resources, 2);
		lvgl_cbor::ScreenReply reply;
		for(size_t count : {size_t(2), size_t(256)})
		{
			const auto packet = raw_line_packet(count);
			const bool ok = runtime.load(packet.data(), packet.size(), reply);
			if(!ok)
				std::fprintf(stderr, "raw line %zu: node=%s opcode=%u %s\n", count, reply.node, reply.opcode,
				    reply.error);

			require(ok, "raw line boundary accepted");
			require(runtime.find("trace") && lv_line_get_point_count(runtime.find("trace")) == count,
			    "raw line retains every boundary point");
			require(lv_line_get_points(runtime.find("trace"))[count - 1].x == int32_t(count - 1),
			    "raw line boundary point values survive decode");
		}
		auto *live = runtime.root();
		auto *trace = runtime.find("trace");
		const auto valid = raw_line_packet(2);
		auto reject = [&](const std::vector<uint8_t> &packet, const char *error) {
			require(!runtime.load(packet.data(), packet.size(), reply) && std::strcmp(reply.error, error) == 0,
			    "strict envelope rejects malformed packet");
			require(runtime.root() == live && lv_screen_active() == live, "invalid envelope preserves live screen");
		};
		auto with_field = [&](const char *key, lvgl_cbor::DataValue value) {
			auto packet = valid;
			require(packet.front() == 0xa8, "raw fixture uses a short eight-field map");
			++packet.front();
			const auto extra = lvgl_cbor::encode_data_value(lvgl_cbor::DataValue::Object{{key, std::move(value)}});
			packet.insert(packet.end(), extra.begin() + 1, extra.end());
			return packet;
		};
		reject(with_field("id", "duplicate"), "envelope_unknown_or_duplicate_field");
		reject(with_field("unknown", 1), "envelope_unknown_or_duplicate_field");
		auto trailing = valid;
		trailing.push_back(0);
		reject(trailing, "invalid_or_deep_cbor");
		auto deep = with_field("captions", nullptr);
		deep.pop_back(); // Replace null with 41 nested one-item arrays.
		deep.insert(deep.end(), 41, 0x81);
		deep.push_back(0xf6);
		reject(deep, "invalid_or_deep_cbor");
		auto tagged = with_field("captions", nullptr);
		tagged.insert(tagged.end() - 1, 0xc0);
		reject(tagged, "invalid_or_deep_cbor");

		for(size_t count : {size_t(1), size_t(257)})
		{
			const auto packet = raw_line_packet(count);
			require(!runtime.load(packet.data(), packet.size(), reply) && reply.opcode == 256 &&
			    std::strcmp(reply.node, "trace") == 0,
			    "raw line outside cardinality contract rejected by method");
			require(runtime.root() == live && lv_screen_active() == live && runtime.find("trace") == trace &&
			    lv_line_get_point_count(trace) == 256, "raw line boundary failure preserves live screen");
		}
		std::puts("Raw CBOR line points: 2/256 accepted, 1/257 rejected with rollback.");
	}

	{
		lvgl_cbor::ScreenRuntime runtime(resources, 2);
		lvgl_cbor::ScreenReply reply;
		auto load = [&](const char *name, bool success) {
				auto bytes = fixture(dir, name);
				const bool result = runtime.load(bytes.data(), bytes.size(), reply);
				if(result != success)
					std::fprintf(stderr, "%s: node=%s opcode=%u %s\n", name, reply.node, reply.opcode,
					    reply.error);

				require(result == success, name);
				require(reply.ok == success, "screen status");
			};
		load("absolute", true);
		require(reply.nodes == 6, "absolute node count");
		require(lv_screen_active() == runtime.root(), "activation");
		auto *card = runtime.find("card");
		require(card && lv_obj_get_x(card) == 24 && lv_obj_get_width(card) == 320, "manual geometry");
		require(lv_obj_get_style_border_width(card, LV_PART_MAIN) == 2 &&
		    lv_obj_get_style_outline_width(card, LV_PART_MAIN) == 3 &&
		    lv_obj_get_style_shadow_width(card, LV_PART_MAIN) == 18,
		    "separate contours");
		require(lv_bar_get_value(runtime.find("level")) == 65, "widget value");
		require(lv_line_get_point_count(runtime.find("trace")) == 5 &&
		    lv_line_get_points(runtime.find("trace"))[2].y == 45,
		    "owned points after request buffer destruction");
		auto *before = runtime.root();
		for(const char *name : {"truncated", "bad_signature", "bad_binding", "bad_abi", "bad_style",
		                        "bad_resource", "bad_depth"})
		{
			load(name, false);
			require(runtime.root() == before && lv_screen_active() == before,
			    "failed replacement preserves live tree");
		}
		load("flex", true);
		auto *a = runtime.find("card_0"), *b = runtime.find("card_1");
		require(a && b, "flex nodes");
		require(lv_obj_get_x(b) > lv_obj_get_x(a) && lv_obj_get_width(a) > 160,
		    "flex grow and row layout");
		require(lv_obj_get_style_flex_flow(runtime.root(), LV_PART_MAIN) == LV_FLEX_FLOW_COLUMN,
		    "column enum beyond old style catalog");
		load("grid", true);
		const auto *tracks = lv_obj_get_style_grid_column_dsc_array(runtime.root(), LV_PART_MAIN);
		require(tracks && tracks[0] == 180 && tracks[1] == LV_GRID_FR(1) &&
		    tracks[3] == LV_GRID_TEMPLATE_LAST,
		    "stable compiled grid array");
		require(lv_obj_get_width(runtime.find("side")) == 180, "grid fixed track");
		require(lv_obj_get_width(runtime.find("title")) == 768, "grid span and stretch");
		load("nested", true);
		require(runtime.find("left/caption") && runtime.find("right/caption"),
		    "nested component namespace");
		load("shared", true);
		require(lv_color_to_u32(lv_obj_get_style_bg_color(runtime.find("button_a"), LV_PART_MAIN)) ==
		    0xff246e8cu,
		    "named shared style");
		require(lv_obj_has_state(runtime.find("checked"), LV_STATE_CHECKED), "initial checked state");
		lv_obj_add_state(runtime.find("button_a"), LV_STATE_PRESSED);
		require(lv_color_to_u32(lv_obj_get_style_bg_color(runtime.find("button_a"), LV_PART_MAIN)) ==
		    0xffd48522u,
		    "selected state style rule");
		load("widgets", true);
		require(lv_slider_get_value(runtime.find("slider")) == 35, "slider setters");
		require(lv_arc_get_value(runtime.find("arc")) == 70, "arc setters");
		require(std::string(lv_textarea_get_text(runtime.find("textarea"))) == "MVP text",
		    "textarea text after options");
		require(lv_dropdown_get_selected(runtime.find("dropdown")) == 1,
		    "dropdown options before selection");
		load("ordered_widgets", true);
		require(std::string(lv_textarea_get_text(runtime.find("textarea"))) == "abc",
		    "PC max_length before text");
		require(lv_slider_get_value(runtime.find("slider")) == 150,
		    "PC range before value outside default range");
		load("cursor_interleaved", true);
		require(std::string(lv_label_get_text(runtime.find("parent"))) == "after",
		    "parent handler resumes after nested button and label");
		require(lv_obj_get_parent(runtime.find("button")) == runtime.find("parent") &&
		    lv_obj_get_parent(runtime.find("caption")) == runtime.find("button"),
		    "nested creation attaches each child to current parent");
		require(std::string(lv_label_get_text(runtime.find("caption"))) == "inside" &&
		    std::string(lv_label_get_text(runtime.find("sibling"))) == "sibling",
		    "cursor return preserves child and sibling contexts");
		require(lv_obj_has_state(runtime.find("parent"), LV_STATE_DISABLED) &&
		    !lv_obj_has_state(runtime.find("caption"), LV_STATE_DISABLED),
		    "common operation targets restored parent context");
		require(lv_color_to_u32(lv_obj_get_style_bg_color(runtime.root(), LV_PART_MAIN)) == 0xff123456u,
		    "style block after child return reaches root style executor");
		load("cursor_empty", true);
		require(std::string(lv_label_get_text(runtime.find("sibling"))) == "after empty",
		    "empty body consumes its array and returns");
		load("cursor_max_depth", true);
		require(runtime.find("deep") != nullptr, "maximum supported depth executes");
		before = runtime.root();
		for(const char *name :
		    {"cursor_bad_reserved", "cursor_bad_unknown_local", "cursor_bad_wrong_component",
		     "cursor_bad_missing_argument", "cursor_bad_extra_argument", "cursor_bad_bad_create",
		     "cursor_bad_unknown_type", "cursor_bad_bad_style", "cursor_bad_bad_opcode",
		     "cursor_v2"})
		{
			load(name, false);
			if(std::strcmp(name, "cursor_bad_unknown_type") == 0)
				require(std::strcmp(reply.node, "root") == 0 && reply.opcode == 0,
				    "failed child factory reports parent ID and create opcode");

			if(std::strcmp(name, "cursor_bad_bad_style") == 0)
				require(std::strcmp(reply.node, "root") == 0 && std::strcmp(reply.error, "methods_map") == 0,
				    "style failure keeps its error and node ID");

			require(runtime.root() == before && lv_screen_active() == before,
			    "cursor failure after partial creation preserves live screen");
		}
		runtime.unload();
		require(lv_screen_active() == original, "restore original screen");
		require(!runtime.root(), "unloaded root");
	}
	{
		auto component = fixture(dir, "component");
		auto *left = lv_obj_create(original), *right = lv_obj_create(original);
		lvgl_cbor::ScreenRuntime first(resources, 2), second(resources, 2);
		lvgl_cbor::ScreenReply a, b;
		Reentry reentry{&first, &second, &component, left, right};
		lv_obj_add_event_cb(left, nested_mount, LV_EVENT_CHILD_CREATED, &reentry);
		require(first.mount(component.data(), component.size(), left, a), "mount first instance");
		require(reentry.called && reentry.other_ok && reentry.same_rejected,
		    "reentrant other instance; recursive replacement of busy owner rejected");
		require(first.find("caption") && second.find("caption") &&
		    first.find("caption") != second.find("caption"),
		    "ID lookup scoped to instance");
		lv_label_set_text(first.find("caption"), "changed");
		require(std::string(lv_label_get_text(second.find("caption"))) == "Repeated component",
		    "instances isolated");
		require(!first.mount(component.data(), component.size(), first.find("root"), a),
		    "reject parent owned by replaced instance");
		for(unsigned i = 0; i < 50; ++i)
		{
			require(first.mount(component.data(), component.size(), left, a), "repeated replacement");
			require(lv_obj_get_child_count(left) == 1, "old mounted tree removed");
			require(second.find("caption") != nullptr, "other instance survives");
		}
		lv_obj_delete(left);
		require(!first.root() && !first.find("caption"),
		    "external ancestor deletion invalidates handles");
		first.unload();
		second.unload();
		lv_obj_delete(right);
	}
	{
		auto packet = fixture(dir, "absolute");
		lvgl_cbor::ScreenRuntime first(resources, 2), second(resources, 2);
		lvgl_cbor::ScreenReply reply;
		require(first.load(packet.data(), packet.size(), reply) &&
		    second.load(packet.data(), packet.size(), reply),
		    "two standalone owners");
		first.unload();
		require(lv_screen_active() == second.root(),
		    "unloading inactive owner preserves current screen");
		second.unload();
		require(lv_screen_active() != nullptr, "deleted fallback replaced safely");
	}
	{
		auto *parent = lv_obj_create(lv_screen_active());
		lv_obj_set_size(parent, 800, 480);
		auto *legacy = lv_label_create(parent);
		lvgl_cbor::StyleRuntime styles(legacy, resources, 2);
		lvgl_cbor::Reply style_reply;
		auto style_packet = fixture(dir + "/../native-fixtures", "basic");
		require(styles.apply(style_packet.data(), style_packet.size(), style_reply),
		    "preview style setup");
		ComponentPreview preview(resources, 2);
		lvgl_cbor::ScreenReply reply;
		for(const auto *type : {"label", "slider", "button", "bar", "arc", "line", "checkbox",
		                        "switch", "textarea", "dropdown", "image", "obj", "label", "slider"})
		{
			auto packet = fixture(dir, (std::string("preview_") + type).c_str());
			require(preview.apply(packet.data(), packet.size(), parent, styles, reply), type);
			require(styles.target() == preview.target() && styles.target(),
			    "live style target follows widget");
			require(lv_obj_get_style_width(styles.target(), LV_PART_MAIN) == 420 &&
			    lv_obj_get_style_x(styles.target(), LV_PART_MAIN) == 60,
			    "same named style after widget replacement");
			if(std::string(type) == "slider")
				require(lv_obj_check_type(styles.target(), &lv_slider_class), "real Slider class");

			if(std::string(type) == "button")
				require(lv_obj_check_type(styles.target(), &lv_button_class), "real Button class");
		}
		auto *previous = preview.target();
		for(const auto *invalid : {"absolute", "preview_bad_resource"})
		{
			auto packet = fixture(dir, invalid);
			require(!preview.apply(packet.data(), packet.size(), parent, styles, reply),
			    "invalid component rejected");
			require(styles.target() == previous && preview.target() == previous,
			    "failed replacement preserves target and style");
		}
		lv_obj_delete(parent);
		require(!styles.target() && !preview.target(),
		    "external preview destruction clears both owners");
	}
	{
		lvgl_cbor::WidgetRegistry registry;
		lvgl_cbor::ScreenRuntime runtime(resources, 2, {}, nullptr,
		    lvgl_cbor::ScreenStyleRetention::Release, &registry);
		lvgl_cbor::ScreenReply reply;
		auto packet = fixture(dir, "extension");
		require(!runtime.load(packet.data(), packet.size(), reply),
		    "extension absent before runtime registration");
		std::ifstream manifest_file(dir + "/extension-contract.json");
		std::string manifest{std::istreambuf_iterator<char>(manifest_file), {}};
		require(meter_example::register_meter(registry, manifest),
		    "register extension after runtime construction");
		require(!meter_example::register_meter(registry, manifest), "duplicate extension rejected");
		std::ofstream(dir + "/runtime-extension-capabilities.json")
		    << lvgl_cbor::runtime_capabilities_json(resources, 2, {}, &registry);
		require(runtime.load(packet.data(), packet.size(), reply), "execute registered extension");
		packet = fixture(dir, "extension_name");
		require(runtime.load(packet.data(), packet.size(), reply), "resolve registered type by name");
		auto *meter = runtime.find("meter");
		require(std::string(lv_label_get_text(meter)) == "42 kPa",
		    "unique mixed signature in PC order");
		require(lv_obj_get_style_border_width(meter, LV_PART_MAIN) == 3,
		    "component-local scalar method");
		packet.assign(packet.size(), 0);
		require(std::string(static_cast<const char *>(lv_obj_get_user_data(meter))) == "kPa",
		    "extension borrowed text survives input buffer destruction");
		require(registry.remove(256), "unregister while instance lives");
		require(std::string(lv_label_get_text(meter)) == "42 kPa",
		    "unregister preserves existing instance");
		packet = fixture(dir, "extension");
		require(!runtime.load(packet.data(), packet.size(), reply) && runtime.find("meter") == meter,
		    "unregistered replacement preserves old instance");
		require(registry.add({256, "example:meter", "meter-2", lv_label_create, meter_example::execute,
		                      manifest}),
		    "register replacement ABI");
		require(!runtime.load(packet.data(), packet.size(), reply), "stale extension ABI rejected");
		require(registry.remove(256) && meter_example::register_meter(registry, manifest),
		    "restore extension ABI");
		require(runtime.load(packet.data(), packet.size(), reply), "reload registered component");
		require(registry.remove(256), "remove before bad cursor handler");
		require(registry.add(
				{256, "example:meter", "meter-1", lv_label_create,
				 [](lv_obj_t *, uint16_t, CborValue &, lvgl_cbor::WidgetContext &) {
					 return true;
				 },
				 manifest}),
		    "register handler that fails to consume arguments");
		auto *live = runtime.root();
		require(!runtime.load(packet.data(), packet.size(), reply) && runtime.root() == live,
		    "non-consuming custom handler fails at command boundary with rollback");
	}
	{
		auto packet = fixture(dir, "absolute");
		lvgl_cbor::ScreenReply reply;
		lv_display_set_resolution(display, 1024, 768);
		lvgl_cbor::ScreenRuntime strict(resources, 2);
		require(!strict.load(packet.data(), packet.size(),
		    reply) && std::string(reply.error) == "display_size_mismatch",
		    "default viewport preserves declared display-size validation");
		lvgl_cbor::ScreenRuntime adaptive(resources, 2, {}, nullptr, lvgl_cbor::ScreenStyleRetention::Release,
		    nullptr, nullptr, nullptr, {}, lvgl_cbor::ScreenViewport::Display);
		require(adaptive.load(packet.data(), packet.size(), reply),
		    "display viewport accepts a different declared size");
		auto *root = adaptive.root(); const auto instance = adaptive.instance_id();
		lv_obj_update_layout(root);
		require(lv_obj_get_width(root) == 1024 && lv_obj_get_height(root) == 768,
		    "standalone root fills current display");
		lv_display_set_resolution(display, 1200, 800); lv_obj_update_layout(root);
		require(adaptive.root() == root && adaptive.instance_id() == instance && lv_obj_get_width(root) == 1200 &&
		    lv_obj_get_height(root) == 800,
		    "display resize preserves instance and follows LVGL screen sizing");
		require(adaptive.load(packet.data(), packet.size(), reply), "reload works in resized display viewport");
	}
	lv_display_delete(display);
	lv_deinit();
	std::puts("Native screen MVP passed: manual/Flex/Grid/nesting, instance isolation, owned "
	    "buffers, rollback and teardown.");
}
