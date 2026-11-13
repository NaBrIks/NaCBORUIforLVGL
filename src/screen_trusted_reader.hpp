// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "cbor.h"
#include <cstdint>
#include <cstring>

namespace lvgl_cbor::detail
{
	// Only used for immutable screens produced by the authoring tools.
	template <size_t N>
	bool read_embedded_fields(CborValue &map, const char *const (&names)[N],
	    CborValue (&fields)[N], uint32_t &seen)
	{
		CborValue item;
		if(cbor_value_enter_container(&map, &item) != CborNoError)
			return false;

		while(!cbor_value_at_end(&item))
		{
			unsigned index = N;
			char name[32];
			size_t length;
			if(cbor_value_is_text_string(&item) &&
			    cbor_value_get_string_length(&item, &length) == CborNoError && length < sizeof(name))
			{
				length = sizeof(name);
				if(cbor_value_copy_text_string(&item, name, &length, &item) != CborNoError)
					return false;

				for(unsigned i = 0; i < N; ++i)
				{
					if(std::strcmp(names[i], name) == 0)
					{
						index = i;
						break;
					}
				}
			}
			else if(cbor_value_advance(&item) != CborNoError)
				return false;

			if(cbor_value_at_end(&item))
				return false;

			if(index < N && !(seen & (1u << index)))
			{
				seen |= 1u << index;
				fields[index] = item;
			}

			if(cbor_value_advance(&item) != CborNoError)
				return false;
		}
		return true;
	}

	inline bool enter_embedded_command(CborValue &command, CborValue &fields)
	{
		return cbor_value_is_array(&command) && cbor_value_enter_container(&command, &fields) == CborNoError;
	}
} // namespace lvgl_cbor::detail
