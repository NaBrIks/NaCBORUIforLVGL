// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "cbor.h"
#include <cstdint>
#include <cstring>
namespace lvgl_cbor::detail
{
	inline bool text(const CborValue &v, char *out, size_t capacity)
	{
		if(!cbor_value_is_text_string(&v) || !cbor_value_is_length_known(&v))
			return false;

		size_t size = capacity;
		return cbor_value_copy_text_string(&v, out, &size, nullptr) == CborNoError && size < capacity &&
		       std::strlen(out) == size;
	}

	inline bool integer(const CborValue &v, int64_t &out)
	{
		return cbor_value_is_integer(&v) && cbor_value_get_int64_checked(&v, &out) == CborNoError;
	}

	inline bool field(const CborValue &map, const char *key, CborValue &out)
	{
		return cbor_value_map_find_value(&map, key, &out) == CborNoError && cbor_value_is_valid(&out);
	}

// Reject duplicate and unknown structural fields; numeric operation maps have their own validators.
	inline bool keys(const CborValue &map, const char *const *allowed, size_t count)
	{
		if(!cbor_value_is_map(&map) || count > 32)
			return false;

		CborValue it;
		if(cbor_value_enter_container(&map, &it) != CborNoError)
			return false;

		uint32_t seen = 0;
		while(!cbor_value_at_end(&it))
		{
			char key[32];
			if(!text(it, key, sizeof(key)))
				return false;

			size_t i = 0;
			for(; i < count && std::strcmp(key, allowed[i]); ++i)
			{
			}
			if(i == count || (seen & (1u << i)))
				return false;

			seen |= 1u << i;
			if(cbor_value_advance(&it) != CborNoError || cbor_value_at_end(&it) ||
			    cbor_value_advance(&it) != CborNoError)
				return false;
		}
		return true;
	}

// Check nesting before TinyCBOR's recursive complete/UTF-8 validation.
	inline bool bounded_cbor(CborValue &it, unsigned depth = 0)
	{
		if(depth > 40 || cbor_value_is_tag(&it))
			return false;

		if(cbor_value_is_container(&it))
		{
			if(!cbor_value_is_length_known(&it))
				return false;

			CborValue child;
			if(cbor_value_enter_container(&it, &child) != CborNoError)
				return false;

			while(!cbor_value_at_end(&child))
				if(!bounded_cbor(child, depth + 1))
					return false;

			return cbor_value_leave_container(&it, &child) == CborNoError;
		}

		return cbor_value_advance(&it) == CborNoError;
	}

} // namespace lvgl_cbor::detail
