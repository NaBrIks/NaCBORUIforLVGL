// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "cbor.h"

namespace lvgl_cbor::detail
{
	inline bool enter_embedded_command(CborValue &command, CborValue &fields)
	{
		return cbor_value_is_array(&command) && cbor_value_enter_container(&command, &fields) == CborNoError;
	}
} // namespace lvgl_cbor::detail
