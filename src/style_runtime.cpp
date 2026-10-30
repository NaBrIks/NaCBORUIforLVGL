// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "lvgl_cbor/style_runtime.hpp"
#include "cbor.h"
#include "cbor_reader.hpp"
#include "style_dispatch.hpp"
#include <cstdio>
#include <cstring>
#include <limits>

namespace lvgl_cbor
{
	using detail::field;
	using detail::integer;
	using detail::text;
	StyleRuntime::StyleRuntime(lv_obj_t *target, const Resource *resources, size_t count,
	    StyleService *service)
	  : owned_service_(service ? nullptr : std::make_unique<StyleService>(resources, count)),
	    service_(service ? service : owned_service_.get()), screen_(service_->create_scope(8)),
	    target_(nullptr), resources_(resources), resource_count_(count)
	{
		set_target(target);
	}

	StyleRuntime::~StyleRuntime()
	{
		set_target(nullptr);
	}

	void StyleRuntime::target_deleted(lv_event_t *event)
	{
		static_cast<StyleRuntime *>(lv_event_get_user_data(event))->target_ = nullptr;
	}

	void StyleRuntime::set_target(lv_obj_t *target)
	{
		if(target_ == target)
			return;

		if(target_)
		{
			if(attached_)
				lv_obj_remove_style(target_, attached_.value, LV_PART_ANY | LV_STATE_ANY);

			lv_obj_remove_event_cb_with_user_data(target_, target_deleted, this);
		}

		target_ = target;
		if(target_)
		{
			lv_obj_add_event_cb(target_, target_deleted, LV_EVENT_DELETE, this);
			if(attached_)
				lv_obj_add_style(target_, attached_.value, 0);
		}
	}

	bool StyleRuntime::apply(const uint8_t *packet, size_t length, Reply &reply)
	{
		reply = {};
		auto fail = [&](const char *message) {
				reply.methods = 0;
				std::snprintf(reply.error, sizeof(reply.error), "%s", message);
				return false;
			};
		if(!packet || !length || length > style_packet_bytes)
			return fail("packet_size");

		CborParser parser;
		CborValue root;
		if(cbor_parser_init(packet, length, 0, &parser, &root) != CborNoError ||
		    !cbor_value_is_map(&root))
			return fail("invalid_cbor_map");

		CborValue bounded = root;
		if(!detail::bounded_cbor(bounded) || cbor_value_get_next_byte(&bounded) != packet + length)
			return fail("invalid_cbor");

		// Reject duplicate/unknown envelope keys. Values are validated by the typed schema below.
		CborValue envelope;
		if(cbor_value_enter_container(&root, &envelope) != CborNoError)
			return fail("invalid_envelope");

		unsigned key_mask = 0;
		const char *allowed[]{"v", "id", "scope", "name", "copy", "merge", "methods", "attach"};
		while(!cbor_value_at_end(&envelope))
		{
			char key[20];
			if(!text(envelope, key, sizeof(key)))
				return fail("invalid_key");

			unsigned index = 0;
			for(; index < 8 && std::strcmp(allowed[index], key); ++index)
			{
			}
			if(index == 8 || (key_mask & (1u << index)))
				return fail("unknown_or_duplicate_key");

			key_mask |= 1u << index;
			if(cbor_value_advance(&envelope) != CborNoError || cbor_value_at_end(&envelope) ||
			    cbor_value_advance(&envelope) != CborNoError)
				return fail("invalid_envelope");
		}
		CborValue value;
		int64_t version;
		if(!field(root, "id", value) || !text(value, reply.id, sizeof(reply.id)))
			return fail("request_id");

		if(!field(root, "v", value) || !integer(value, version) || version != style_contract_version)
			return fail("contract_version");

		char scope[12], name[32];
		if(!field(root, "scope", value) || !text(value, scope, sizeof(scope)) ||
		    (std::strcmp(scope, "global") && std::strcmp(scope, "screen")))
			return fail("style_scope");

		if(!field(root, "name", value) || !text(value, name, sizeof(name)) || !name[0])
			return fail("style_name");

		const bool is_global = !std::strcmp(scope, "global");
		bool attach = true;
		if(field(root, "attach", value))
		{
			if(!cbor_value_is_boolean(&value) || cbor_value_get_boolean(&value, &attach) != CborNoError)
				return fail("attach_boolean");
		}

		StyleValue staged;
		auto staged_fail = [&](const char *message) {
				return fail(message);
			};
		if(field(root, "copy", value) && !cbor_value_is_null(&value))
		{
			char source[80];
			if(!text(value, source, sizeof(source)))
				return staged_fail("copy_reference");

			auto slot = service_->resolve(source, screen_);
			if(!slot || (is_global && !std::strncmp(source, "screen:", 7)))
				return staged_fail("copy_source");

			if(slot.owner)
				staged.compose(*slot.owner, true);
			else
				lv_style_copy(&staged.value, slot.value);
		}

		if(field(root, "merge", value))
		{
			size_t count;
			if(!cbor_value_is_array(&value) ||
			    cbor_value_get_array_length(&value, &count) != CborNoError || count > 8)
				return staged_fail("merge_array");

			CborValue item;
			if(cbor_value_enter_container(&value, &item) != CborNoError)
				return staged_fail("merge_array");

			for(size_t i = 0; i < count; ++i)
			{
				char source[80];
				if(!text(item, source, sizeof(source)))
					return staged_fail("merge_reference");

				auto slot = service_->resolve(source, screen_);
				if(!slot || (is_global && !std::strncmp(source, "screen:", 7)))
					return staged_fail("merge_source");

				if(slot.owner)
					staged.compose(*slot.owner, false);
				else
					lv_style_merge(&staged.value, slot.value);

				if(cbor_value_advance(&item) != CborNoError)
					return staged_fail("merge_array");
			}
		}

		if(!field(root, "methods", value))
			return staged_fail("methods_map");

		detail::StyleResult result;
		if(!detail::apply_style_methods(value, &staged.value, resources_, resource_count_, result,
		    staged.storage.get()))
			return staged_fail(result.error);

		reply.methods = result.count;
		auto destination = is_global ? service_->put_global(name, staged) : screen_->put(name, staged);
		if(!destination)
			return staged_fail("style_capacity");

		if(attach)
		{
			if(target_ && attached_)
				lv_obj_remove_style(target_, attached_.value, 0);

			attached_ = {&destination->value, destination};
			if(target_)
				lv_obj_add_style(target_, attached_.value, 0);
		}

		lv_obj_report_style_change(&destination->value);
		reply.ok = true;
		return true;
	}

} // namespace lvgl_cbor
