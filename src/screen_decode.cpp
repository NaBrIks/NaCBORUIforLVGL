// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "cbor_reader.hpp"
#include "lvgl_cbor/contract.hpp"
#include "lvgl_cbor/screen_contract.hpp"
#include "screen_internal.hpp"
#include <cstdio>
#include <cstring>
namespace lvgl_cbor::detail
{
	namespace
	{
		bool fail(DecodeContext &c, const char *error)
		{
			std::snprintf(c.reply.error, sizeof(c.reply.error), "%s", error);
			return false;
		}

		bool empty_reserved(const CborValue &map, DecodeContext &c)
		{
			c.plan.binding_envelope = map;
			return true;
		}

		bool array(const CborValue &v, size_t max, size_t &n, CborValue &it)
		{
			return cbor_value_is_array(&v) && cbor_value_get_array_length(&v, &n) == CborNoError &&
			       n <= max && cbor_value_enter_container(&v, &it) == CborNoError;
		}

	} // namespace
	bool decode_screen(const uint8_t *bytes, size_t length, ScreenPlan &plan, const Resource *resources,
	    size_t resource_count, const ScreenLimits &limits, ScreenReply &reply)
	{
		DecodeContext c{plan, resources, resource_count, limits, reply};
		if(!bytes || !length || length > limits.packet_bytes)
			return fail(c, "packet_size");

		auto &parser = plan.parser;
		CborValue map;
		if(cbor_parser_init(bytes, length, 0, &parser, &map) != CborNoError || !cbor_value_is_map(&map))
			return fail(c, "invalid_cbor_map");

		CborValue bounded = map;
		if(!bounded_cbor(bounded) || cbor_value_get_next_byte(&bounded) != bytes + length)
			return fail(c, "invalid_or_deep_cbor");

		const char *const allowed[]{"v", "kind", "id", "abi", "style_abi", "name", "size",
			                        "theme", "styles", "root", "bindings", "title", "captions", "bindings_version",
			                        "events", "views_version", "views"};
		if(!keys(map, allowed, 17))
			return fail(c, "envelope_unknown_or_duplicate_field");

		CborValue value;
		int64_t v;
		char text_value[80];
		if(!field(map, "id", value) || !text(value, reply.id, sizeof(reply.id)))
			return fail(c, "request_id");

		if(!field(map, "v", value) || !integer(value, v) || v != screen_contract_version ||
		    !field(map, "kind", value) || !text(value, text_value, sizeof(text_value)) ||
		    std::strcmp(text_value, "screen"))
			return fail(c, "screen_version");

		if(!field(map, "abi", value) || !text(value, text_value, sizeof(text_value)) ||
		    std::strcmp(text_value, screen_contract_sha256))
			return fail(c, "screen_abi_mismatch");

		if(!field(map, "style_abi", value) || !text(value, text_value, sizeof(text_value)) ||
		    std::strcmp(text_value, contract_sha256))
			return fail(c, "style_abi_mismatch");

		if(!field(map, "name", value) || !text(value, text_value, 64) || !text_value[0])
			return fail(c, "screen_name");

		plan.id = text_value;
		if(field(map, "title", value))
		{
			char title[129];
			if(!text(value, title, sizeof(title)) || !title[0])
				return fail(c, "screen_title");
		}

		size_t count;
		CborValue item;
		if(!field(map, "size", value) || !array(value, 2, count, item) || count != 2 ||
		    !integer(item, v) || v < 1 || v > 8192)
			return fail(c, "screen_size");

		plan.width = int(v);
		if(cbor_value_advance(&item) != CborNoError || !integer(item, v) || v < 1 || v > 8192)
			return fail(c, "screen_size");

		plan.height = int(v);
		if(field(map, "theme", value) && (!cbor_value_is_boolean(&value) ||
		    cbor_value_get_boolean(&value, &plan.theme) != CborNoError))
			return fail(c, "theme_boolean");

		if(!empty_reserved(map, c))
			return false;

		if(field(map, "styles", value))
		{
			if(!array(value, limits.styles, count, item))
				return fail(c, "styles_array");

			for(size_t i = 0; i < count; ++i)
			{
				const char *const keys_allowed[]{"id", "methods"};
				CborValue methods, id;
				char name[64];
				lv_style_t *style;
				if(!keys(item, keys_allowed, 2) || !field(item, "id", id) || !text(id, name, sizeof(name)) ||
				    !name[0] || !field(item, "methods", methods))
					return fail(c, "style_definition");

				if(!own_style(methods, c, style))
					return false;

				plan.styles.back()->id = name;
				if(!plan.scope->adopt(name, plan.styles.back()))
					return fail(c, "style_definition");

				if(cbor_value_advance(&item) != CborNoError)
					return fail(c, "styles_array");
			}
		}

		if(!field(map, "root", value))
			return fail(c, "root_missing");

		plan.program = value;
		reply.node[0] = 0;
		reply.opcode = 0;
		return true;
	}

} // namespace lvgl_cbor::detail
