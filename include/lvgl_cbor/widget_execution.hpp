// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "widget_registry.hpp"
#include "screen_contract.hpp"
#include <cstring>
#include <cmath>
#include <limits>
#include <tuple>
#include <type_traits>
#include <utility>
namespace lvgl_cbor
{
	namespace execution
	{
		inline bool read_integer(const CborValue &value, int64_t &number)
		{
			return cbor_value_is_integer(&value) &&
			       cbor_value_get_int64_checked(&value, &number) == CborNoError;
		}

		inline bool consume_points(CborValue &value, PointSpan &out, WidgetContext &context)
		{
			size_t size;
			CborValue point;
			if(!cbor_value_is_array(&value) || cbor_value_get_array_length(&value, &size) != CborNoError ||
			    size > (context.max_bytes - context.storage.bytes) / sizeof(lv_point_precise_t) ||
			    cbor_value_enter_container(&value, &point) != CborNoError)
				return false;

			std::vector<lv_point_precise_t> points;
			points.reserve(size);
			for(size_t i = 0; i < size; ++i)
			{
				size_t count;
				CborValue xy;
				int64_t x, y;
				if(!cbor_value_is_array(&point) ||
				    cbor_value_get_array_length(&point, &count) != CborNoError || count != 2 ||
				    cbor_value_enter_container(&point, &xy) != CborNoError || !read_integer(xy, x) ||
				    cbor_value_advance(&xy) != CborNoError || !read_integer(xy, y) ||
				    cbor_value_advance(&xy) != CborNoError ||
				    cbor_value_leave_container(&point, &xy) != CborNoError)
					return false;

				if(x < line_point_min || x > line_point_max || y < line_point_min || y > line_point_max)
					return false;

				points.push_back({lv_value_precise_t(x), lv_value_precise_t(y)});
			}
			if(cbor_value_leave_container(&value, &point) != CborNoError)
				return false;

			context.storage.bytes += size * sizeof(lv_point_precise_t);
			context.storage.points.push_back(std::move(points));
			out = {context.storage.points.back().data(), uint32_t(size)};
			return true;
		}

		template <class T> bool read(const CborValue &value, T &out, WidgetContext &context)
		{
			if constexpr(std::is_same_v<T, bool>)
			{
				return cbor_value_is_boolean(&value) && cbor_value_get_boolean(&value, &out) == CborNoError;
			}
			else if constexpr(std::is_same_v<T, const char *>)
			{
				size_t size;
				if(!cbor_value_is_text_string(&value) ||
				    cbor_value_calculate_string_length(&value, &size) != CborNoError ||
				    size + 1 > context.max_bytes - context.storage.bytes)
					return false;

				std::string text(size + 1, '\0');
				size_t capacity = size + 1;
				if(cbor_value_copy_text_string(&value, text.data(), &capacity, nullptr) != CborNoError)
					return false;

				text.resize(size);
				context.storage.bytes += size + 1;
				context.storage.strings.push_back(std::move(text));
				out = context.storage.strings.back().c_str();
				return true;
			}
			else if constexpr(std::is_same_v<T, const void *>)
			{
				char name[64];
				size_t capacity = sizeof(name);
				if(!cbor_value_is_text_string(&value) ||
				    cbor_value_copy_text_string(&value, name, &capacity, nullptr) != CborNoError)
					return false;

				for(size_t i = 0; i < context.resource_count; ++i)
				{
					const auto &r = context.resources[i];
					if(!std::strcmp(r.name, name) && !std::strcmp(r.type, "const void *") && r.value)
					{
						out = r.value;
						return true;
					}
				}
				return false;
			}
			else if constexpr(std::is_same_v<T, PointSpan>)
			{
				auto cursor = value;
				return consume_points(cursor, out, context);
			}
			else if constexpr(std::is_floating_point_v<T>)
			{
				double number;
				if(cbor_value_is_double(&value))
				{
					if(cbor_value_get_double(&value, &number) != CborNoError)
						return false;
				}
				else if(cbor_value_is_float(&value) || cbor_value_is_half_float(&value))
				{
					float f;
					if((cbor_value_is_float(&value) ? cbor_value_get_float(&value,
					    &f) : cbor_value_get_half_float_as_float(&value, &f)) != CborNoError)
						return false;

					number = f;
				}
				else
				{
					int64_t n; if(!read_integer(value, n))
						return false;

					number = double(n);
				}

				if(!std::isfinite(number) || number < -std::numeric_limits<T>::max() ||
				    number > std::numeric_limits<T>::max()) return false;

				out = static_cast<T>(number); return true;
			}
			else
			{
				int64_t number;
				if(!read_integer(value, number))
					return false;

				if constexpr(std::is_enum_v<T>)
				{
					using U = std::underlying_type_t<T>;
					if constexpr(std::is_unsigned_v<U>)
					{
						if(number < 0 || uint64_t(number) > uint64_t(std::numeric_limits<U>::max()))
							return false;
					}
					else if(number < int64_t(std::numeric_limits<U>::lowest()) ||
					    number > int64_t(std::numeric_limits<U>::max())) return false;
				}
				else if constexpr(std::is_integral_v<T>)
				{
					if constexpr(std::is_unsigned_v<T>)
					{
						if(number < 0 || uint64_t(number) > uint64_t(std::numeric_limits<T>::max()))
							return false;
					}
					else if(number < int64_t(std::numeric_limits<T>::lowest()) ||
					    number > int64_t(std::numeric_limits<T>::max())) return false;
				}

				out = static_cast<T>(number);
				return true;
			}
		}

		template<class T>
		bool consume_argument(CborValue &value, T &out, WidgetContext &context)
		{
			if constexpr(std::is_same_v<T, PointSpan>)
				return consume_points(value, out, context);
			else
				return read(value, out, context) && cbor_value_advance(&value) == CborNoError;
		}

		template <class ... A, size_t... I>
		bool read_arguments(CborValue &value, std::tuple<A...> &args, WidgetContext &context,
		    std::index_sequence<I...>)
		{
			if constexpr(sizeof...(A) == 1)
				return consume_argument(value, std::get<0>(args), context);
			else
			{
				size_t count;
				CborValue it;
				if(!cbor_value_is_array(&value) ||
				    cbor_value_get_array_length(&value, &count) != CborNoError || count != sizeof...(A) ||
				    cbor_value_enter_container(&value, &it) != CborNoError)
					return false;

				return (consume_argument(it, std::get<I>(args), context) && ...) &&
				       cbor_value_leave_container(&value, &it) == CborNoError;
			}
		}

	} // namespace execution
// Direct typed call for simple methods. Complex handlers can read cursor themselves.
// Both forms consume exactly one argument value, with no runtime signature tables.
	template <class ... A>
	bool invoke_widget(void (*method)(lv_obj_t *, A...), lv_obj_t *obj, CborValue &cursor,
	    WidgetContext &context)
	{
		std::tuple<A...> args;
		if(!execution::read_arguments(cursor, args, context, std::index_sequence_for<A...>{}))
			return false;

		std::apply([&](A... values) {
			method(obj, values ...);
		}, args);
		return true;
	}

} // namespace lvgl_cbor
