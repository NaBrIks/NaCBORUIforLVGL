// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "cbor.h"
#include "lvgl_cbor/data_registry.hpp"
#include <cmath>
#include <cstring>
#include <iomanip>
#include <sstream>
namespace lvgl_cbor
{
	namespace
	{
		bool utf8(const std::string &s)
		{
			size_t i = 0;
			while(i < s.size())
			{
				uint32_t c = uint8_t(s[i++]);
				if(c < 0x80)
					continue;

				unsigned n = c >= 0xc2 && c <= 0xdf ? 1
				 : c >= 0xe0 && c <= 0xef ? 2
				 : c >= 0xf0 && c <= 0xf4 ? 3
				                          : 0;
				if(!n || i + n > s.size())
					return false;

				uint32_t cp = c & ((1u << (6 - n)) - 1);
				for(unsigned j = 0; j < n; ++j)
				{
					unsigned next = uint8_t(s[i++]);
					if((next & 0xc0) != 0x80)
						return false;

					cp = (cp << 6) | (next & 63);
				}
				if(cp < (n == 1 ? 0x80
			  : n == 2 ? 0x800
				       : 0x10000) ||
				    cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff))
					return false;
			}
			return true;
		}

		bool numeric(const DataValue &v, double &n)
		{
			if(auto p = std::get_if<int64_t>(&v.value))
			{
				n = double(*p);
				return true;
			}

			if(auto p = std::get_if<double>(&v.value))
			{
				n = *p;
				return std::isfinite(n);
			}

			return false;
		}

		bool fail(std::string &e, const char *s)
		{
			e = s;
			return false;
		}

		bool decode(CborValue &it, DataValue &v, size_t depth, size_t max_depth)
		{
			if(depth > max_depth)
				return false;

			if(cbor_value_is_null(&it))
				v = {};
			else if(cbor_value_is_boolean(&it))
			{
				bool b;
				if(cbor_value_get_boolean(&it, &b) != CborNoError)
					return false;

				v = b;
			}
			else if(cbor_value_is_integer(&it))
			{
				int64_t n;
				if(cbor_value_get_int64_checked(&it, &n) != CborNoError || n < -9007199254740991LL ||
				    n > 9007199254740991LL)
					return false;

				v = n;
			}
			else if((cbor_value_is_double(&it) || cbor_value_is_float(&it) ||
			    cbor_value_is_half_float(&it)))
			{
				double n;
				CborError error;
				if(cbor_value_is_double(&it))
					error = cbor_value_get_double(&it, &n);
				else
				{
					float f;
					error = cbor_value_is_float(&it) ? cbor_value_get_float(&it, &f)
					                   : cbor_value_get_half_float_as_float(&it, &f);
					n = f;
				}

				if(error != CborNoError || !std::isfinite(n))
					return false;

				v = n == 0 ? 0.0 : n;
			}
			else if(cbor_value_is_text_string(&it))
			{
				size_t n;
				if(!cbor_value_is_length_known(&it) ||
				    cbor_value_calculate_string_length(&it, &n) != CborNoError ||
				    n > binding_contract::textBytes)
					return false;

				std::string text(n + 1, '\0');
				size_t cap = n + 1;
				if(cbor_value_copy_text_string(&it, text.data(), &cap, nullptr) != CborNoError)
					return false;

				text.resize(n);
				if(text.find('\0') != std::string::npos || !utf8(text))
					return false;

				v = std::move(text);
			}
			else if(cbor_value_is_array(&it) || cbor_value_is_map(&it))
			{
				if(!cbor_value_is_length_known(&it))
					return false;

				CborValue child;
				if(cbor_value_enter_container(&it, &child) != CborNoError)
					return false;

				if(cbor_value_is_array(&it))
				{
					DataValue::Array values;
					while(!cbor_value_at_end(&child))
					{
						if(values.size() >= binding_contract::arrayItems)
							return false;

						DataValue x;
						if(!decode(child, x, depth + 1, max_depth))
							return false;

						values.push_back(std::move(x));
					}
					v = std::move(values);
				}
				else
				{
					DataValue::Object values;
					while(!cbor_value_at_end(&child))
					{
						DataValue key, x;
						if(!decode(child, key, depth + 1, max_depth))
							return false;

						auto p = std::get_if<std::string>(&key.value);
						if(!p || p->empty() || p->size() > 63 || *p == "__proto__" || *p == "constructor" ||
						    *p == "prototype" || values.count(*p) ||
						    values.size() >= binding_contract::objectFields ||
						    !decode(child, x, depth + 1, max_depth))
							return false;

						values.emplace(*p, std::move(x));
					}
					v = std::move(values);
				}

				return cbor_value_leave_container(&it, &child) == CborNoError;
			}
			else
				return false;

			return cbor_value_advance(&it) == CborNoError;
		}

		void head(std::vector<uint8_t> &out, unsigned major, uint64_t n)
		{
			if(n < 24)
			{
				out.push_back(uint8_t((major << 5) | n));
				return;
			}

			unsigned bytes = n <= 255 ? 1 : n <= 65535 ? 2 : n <= 0xffffffff ? 4 : 8;
			out.push_back(uint8_t((major << 5) | (bytes == 1 ? 24 : bytes == 2 ? 25 : bytes == 4 ? 26 : 27)));
			for(int i = int(bytes) - 1; i >= 0; --i)
				out.push_back(uint8_t(n >> (i * 8)));
		}

		void encode(const DataValue &v, std::vector<uint8_t> &out)
		{
			if(std::holds_alternative<std::monostate>(v.value))
				out.push_back(0xf6);
			else if(auto p = std::get_if<bool>(&v.value))
				out.push_back(*p ? 0xf5 : 0xf4);
			else if(auto p = std::get_if<int64_t>(&v.value))
			{
				if(*p >= 0)
					head(out, 0, uint64_t(*p));
				else
					head(out, 1, uint64_t(-(*p + 1)));
			}
			else if(auto p = std::get_if<double>(&v.value))
			{
				double n = *p == 0 ? 0 : *p;
				if(std::isfinite(n) && std::trunc(n) == n && n >= -9007199254740991.0 &&
				    n <= 9007199254740991.0)
				{
					encode(DataValue(int64_t(n)), out);
					return;
				}

				uint64_t bits;
				std::memcpy(&bits, &n, 8);
				out.push_back(0xfb);
				for(int i = 7; i >= 0; --i)
					out.push_back(uint8_t(bits >> (i * 8)));
			}
			else if(auto p = std::get_if<std::string>(&v.value))
			{
				head(out, 3, p->size());
				out.insert(out.end(), p->begin(), p->end());
			}
			else if(auto p = std::get_if<DataValue::Array>(&v.value))
			{
				head(out, 4, p->size());
				for(const auto &x : *p)
					encode(x, out);
			}
			else
			{
				const auto &o = std::get<DataValue::Object>(v.value);
				head(out, 5, o.size());
				for(const auto &x : o)
				{
					encode(x.first, out);
					encode(x.second, out);
				}
			}
		}

		std::string quote(const std::string &s)
		{
			std::string out = "\"";
			const char hex[] = "0123456789abcdef";
			for(unsigned char c : s)
			{
				if(c == '"' || c == '\\')
				{
					out += '\\';
					out += char(c);
				}
				else if(c < 32)
				{
					out += "\\u00";
					out += hex[c >> 4];
					out += hex[c & 15];
				}
				else
					out += char(c);
			}
			return out + '"';
		}

	} // namespace
	bool DataValue::operator==(const DataValue &o) const
	{
		double a, b;
		if(numeric(*this, a) && numeric(o, b))
			return a == b;

		return value == o.value;
	}

	DataSchema DataSchema::null()
	{
		return {};
	}

	DataSchema DataSchema::boolean()
	{
		DataSchema s;
		s.type = Type::Bool;
		return s;
	}

	DataSchema DataSchema::integer(double lo, double hi)
	{
		DataSchema s;
		s.type = Type::Integer;
		s.min = lo;
		s.max = hi;
		return s;
	}

	DataSchema DataSchema::number(double lo, double hi)
	{
		DataSchema s;
		s.type = Type::Number;
		s.min = lo;
		s.max = hi;
		return s;
	}

	DataSchema DataSchema::text(size_t n)
	{
		DataSchema s;
		s.type = Type::Text;
		s.max_bytes = n;
		return s;
	}

	DataSchema DataSchema::object(std::map<std::string, DataSchema> f)
	{
		DataSchema s;
		s.type = Type::Object;
		s.fields = std::move(f);
		return s;
	}

	DataSchema DataSchema::array(DataSchema item, size_t max, size_t min)
	{
		DataSchema s;
		s.type = Type::Array;
		s.items = std::make_shared<DataSchema>(std::move(item));
		s.min_items = min;
		s.max_items = max;
		return s;
	}

	bool decode_data_value(const uint8_t *p, size_t n, DataValue &v, std::string &e, size_t max_bytes,
	    size_t max_depth)
	{
		CborParser parser;
		CborValue it;
		DataValue next;
		if(!p || !n || n > max_bytes || cbor_parser_init(p, n, 0, &parser, &it) != CborNoError ||
		    !decode(it, next, 0, max_depth) || cbor_value_get_next_byte(&it) != p + n)
			return fail(e, "invalid_data_cbor");

		v = std::move(next);
		e.clear();
		return true;
	}

	std::vector<uint8_t> encode_data_value(const DataValue &v)
	{
		std::vector<uint8_t> out;
		encode(v, out);
		return out;
	}

	std::string data_value_json(const DataValue &v)
	{
		if(std::holds_alternative<std::monostate>(v.value))
			return "null";

		if(auto p = std::get_if<bool>(&v.value))
			return *p ? "true" : "false";

		if(auto p = std::get_if<int64_t>(&v.value))
			return std::to_string(*p);

		if(auto p = std::get_if<double>(&v.value))
		{
			if(!std::isfinite(*p))
				return "null";

			std::ostringstream o;
			o << std::setprecision(17) << (*p == 0 ? 0 : *p);
			return o.str();
		}

		if(auto p = std::get_if<std::string>(&v.value))
			return quote(*p);

		std::string out;
		bool comma = false;
		if(auto p = std::get_if<DataValue::Array>(&v.value))
		{
			out = "[";
			for(const auto &x : *p)
			{
				if(comma)
					out += ',';

				comma = true;
				out += data_value_json(x);
			}
			return out + ']';
		}

		out = "{";
		for(const auto &x : std::get<DataValue::Object>(v.value))
		{
			if(comma)
				out += ',';

			comma = true;
			out += quote(x.first) + ':' + data_value_json(x.second);
		}
		return out + '}';
	}

	const DataValue *data_path(const DataValue &v, const DataPath &path)
	{
		const DataValue *p = &v;
		for(const auto &part : path)
		{
			if(auto key = std::get_if<std::string>(&part))
			{
				auto o = std::get_if<DataValue::Object>(&p->value);
				if(!o)
					return nullptr;

				auto it = o->find(*key);
				if(it == o->end())
					return nullptr;

				p = &it->second;
			}
			else
			{
				auto a = std::get_if<DataValue::Array>(&p->value);
				auto i = std::get<size_t>(part);
				if(!a || i >= a->size())
					return nullptr;

				p = &(*a)[i];
			}
		}
		return p;
	}

	bool validate_data_value(const DataValue &v, const DataSchema &s, std::string &e)
	{
		if(s.nullable && std::holds_alternative<std::monostate>(v.value)) { e.clear(); return true; }

		bool ok = false;
		double n;
		switch(s.type)
		{
		case DataSchema::Type::Null:
			ok = std::holds_alternative<std::monostate>(v.value);
			break;
		case DataSchema::Type::Bool:
			ok = std::holds_alternative<bool>(v.value);
			break;
		case DataSchema::Type::Integer:
			ok = numeric(v, n) && std::trunc(n) == n && n >= s.min && n <= s.max &&
			    n >= -9007199254740991.0 && n <= 9007199254740991.0;
			break;
		case DataSchema::Type::Number:
			ok = numeric(v, n) && n >= s.min && n <= s.max;
			break;
		case DataSchema::Type::Text:
			if(auto p = std::get_if<std::string>(&v.value))
				ok = p->size() <= s.max_bytes && p->find('\0') == std::string::npos && utf8(*p);

			break;
		case DataSchema::Type::Array:
			if(auto p = std::get_if<DataValue::Array>(&v.value))
			{
				ok = s.items && p->size() >= s.min_items && p->size() <= s.max_items;
				if(ok)
					for(const auto &x : *p)
						if(!validate_data_value(x, *s.items, e))
							return false;
			}

			break;
		case DataSchema::Type::Object:
			if(auto p = std::get_if<DataValue::Object>(&v.value))
			{
				ok = true;
				for(const auto &x : *p)
				{
					auto f = s.fields.find(x.first);
					if(f == s.fields.end() || !validate_data_value(x.second, f->second, e))
						return fail(e, "data_object_field");
				}
			}

			break;
		}
		if(!ok)
			return fail(e, "data_schema_type_or_range");

		e.clear();
		return true;
	}

} // namespace lvgl_cbor
