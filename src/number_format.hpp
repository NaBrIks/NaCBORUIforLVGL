// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include <cmath>
#include <string>

#ifndef LVGL_CBOR_NUMBER_FORMAT
#define LVGL_CBOR_NUMBER_FORMAT 0
#endif

#if LVGL_CBOR_NUMBER_FORMAT == 0
#include <iomanip>
#include <locale>
#include <sstream>
#elif LVGL_CBOR_NUMBER_FORMAT == 1
#include <charconv>
#elif LVGL_CBOR_NUMBER_FORMAT == 2
#include <clocale>
#include <cstdio>
#else
#error Invalid LVGL_CBOR_NUMBER_FORMAT
#endif

namespace lvgl_cbor::detail
{
	inline std::string format_decimal(double value, int precision, bool fixed = false)
	{
		if(value == 0) value = 0; // Normalize negative zero at both call sites.

#if LVGL_CBOR_NUMBER_FORMAT == 0
		std::ostringstream out;
		out.imbue(std::locale::classic());
		if(fixed) out << std::fixed;

		out << std::setprecision(precision) << value;
		return out.str();
#elif LVGL_CBOR_NUMBER_FORMAT == 1
		char buffer[64];
		const auto result = std::to_chars(buffer, buffer + sizeof(buffer), value,
		    fixed ? std::chars_format::fixed : std::chars_format::general, precision);
		return result.ec == std::errc{} ? std::string(buffer, result.ptr) : std::string{};
#else
		char buffer[64];
		const auto count = std::snprintf(buffer, sizeof(buffer), fixed ? "%.*f" : "%.*g", precision, value);
		if(count < 0 || size_t(count) >= sizeof(buffer)) return {};

		std::string result(buffer, size_t(count));
		// The wire format and binding expressions use a decimal point regardless of the process locale.
		const char *decimal = std::localeconv()->decimal_point;
		if(decimal && *decimal && !(decimal[0] == '.' && decimal[1] == '\0'))
		{
			const auto position = result.find(decimal);
			if(position != std::string::npos)
				result.replace(position, std::char_traits<char>::length(decimal), 1, '.');
		}

		return result;
#endif
	}

	// A negative precision selects the binding ABI's 15 significant digit format.
	inline std::string format_binding_number(double value, int precision)
	{
		if(precision >= 0)
		{
			if(std::fabs(value) >= 1e21) return {};

			const auto scale = std::pow(10.0, precision);
			return format_decimal(std::round(value * scale) / scale, precision, true);
		}

		if(value != 0)
		{
			const auto scale = std::pow(10.0, 14 - std::floor(std::log10(std::fabs(value))));
			if(std::isfinite(scale) && scale > 0 && std::isfinite(value * scale))
				value = std::round(value * scale) / scale;
		}

		return format_decimal(value, 15);
	}
}
