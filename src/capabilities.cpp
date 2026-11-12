// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "lvgl_cbor/capabilities.hpp"
#include "lvgl_cbor/data_registry.hpp"
#include "screen_internal.hpp"
#include <algorithm>
namespace lvgl_cbor
{
	namespace
	{
#include "capabilities_catalog.inc"
		std::string quoted(const char *text)
		{
			std::string out = "\"";
			for(const unsigned char *p = reinterpret_cast<const unsigned char *>(text); *p; ++p)
			{
				if(*p == '"' || *p == '\\')
				{
					out += '\\';
					out += char(*p);
				}
				else if(*p < 32)
				{
					const char hex[] = "0123456789abcdef";
					out += "\\u00";
					out += hex[*p >> 4];
					out += hex[*p & 15];
				}
				else
					out += char(*p);
			}
			return out + '"';
		}

	} // namespace
	std::string runtime_capabilities_json(const Resource *resources, size_t count,
	    CapabilityLimits limits, const WidgetRegistry *registry,
	    const DataRegistry *data)
	{
		std::string out = capabilities_catalog;
		out.pop_back();
		out += ",\"availableWidgets\":[";
		bool comma = false;
		for(unsigned id = 0; id < detail::widget_factory_count(); ++id)
		{
			if(!detail::widget_factory(id))
				continue;

			if(comma)
				out += ',';

			comma = true;
			out += std::to_string(id);
		}
		if(registry)
			for(const auto &entry : registry->entries())
			{
				if(comma)
					out += ',';

				comma = true;
				out += std::to_string(entry->id);
			}

		out += "],\"extensions\":[";
		comma = false;
		if(registry)
			for(const auto &entry : registry->entries())
			{
				if(comma)
					out += ',';

				comma = true;
				out += "{\"id\":" + std::to_string(entry->id) + ",\"name\":" + quoted(entry->name.c_str()) +
				    ",\"abi\":" + quoted(entry->abi.c_str()) + ",\"contract\":" + entry->compiler_json +
				    "}";
			}

		out += "],\"layouts\":[0";
#if LV_USE_FLEX
		out += ",1";
#endif
#if LV_USE_GRID
		out += ",2";
#endif
		for(const auto id : limits.extra_layouts)
			out += ',' + std::to_string(id);
		out += "],\"resources\":[";
		comma = false;
		for(size_t i = 0; i < count; ++i)
		{
			if(!resources[i].value)
				continue;

			if(comma)
				out += ',';

			comma = true;
			out +=
			    "{\"name\":" + quoted(resources[i].name) + ",\"type\":" + quoted(resources[i].type) + '}';
		}
		out += "],\"limits\":{\"stylePacketBytes\":" +
		    std::to_string(std::min(size_t(8192), limits.style_packet_bytes));
		out += ",\"screenPacketBytes\":" +
		    std::to_string(std::min(limits.screen.packet_bytes, limits.screen_packet_bytes));
		if(limits.screen_websocket_packet_bytes)
			out += ",\"screenWebSocketPacketBytes\":" + std::to_string(limits.screen_websocket_packet_bytes);

		out += ",\"nodes\":" + std::to_string(limits.screen.nodes) +
		    ",\"depth\":" + std::to_string(limits.screen.depth);
		out += ",\"styles\":" + std::to_string(limits.screen.styles) +
		    ",\"textBytes\":" + std::to_string(limits.screen.text_bytes) + "}";
#if !defined(LVGL_CBOR_HAS_DATA_BINDINGS) || LVGL_CBOR_HAS_DATA_BINDINGS
		DataRegistry empty;
		out += ",\"binding\":" + (data ? data->catalog_json() : empty.catalog_json());
#else
		(void)data;
#endif
#if !defined(LVGL_CBOR_HAS_COMPOSITION) || LVGL_CBOR_HAS_COMPOSITION
		out += ",\"composition\":{\"version\":" + std::to_string(composition_contract::version) +
		    ",\"maxDepth\":" + std::to_string(composition_contract::maxDepth) +
		    ",\"maxInstances\":" + std::to_string(composition_contract::maxInstances) +
		    ",\"inactiveCache\":" + std::to_string(composition_contract::inactiveCache) + "}";
#endif
		out += "}";
		return out;
	}

} // namespace lvgl_cbor
