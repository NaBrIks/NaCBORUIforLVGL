// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "cbor.h"
#include "style_runtime.hpp"
#include <list>
#include <memory>
#include <string>
#include <vector>

namespace lvgl_cbor
{
	struct DataValue;
	using WidgetFactory = lv_obj_t * (*)(lv_obj_t *);
	struct PointSpan {
		const lv_point_precise_t *data;
		uint32_t size;
	};
// Static argument buffers live until instance destruction. A bound method gets its own storage:
// borrowed arguments remain valid until that same binding successfully updates or is destroyed.
// Native handlers validate before mutation and never retain a CBOR cursor into the input packet.
	struct WidgetStorage {
		std::list<std::string> strings;
		std::list<std::vector<lv_point_precise_t> > points;
		size_t bytes{};
	};
	struct WidgetContext {
		const Resource *resources;
		size_t resource_count;
		WidgetStorage &storage;
		size_t max_bytes;
	};
// A handler consumes exactly one CBOR argument value; cursor then points past it.
	using WidgetExecutor = bool (*)(lv_obj_t *, uint16_t, CborValue &, WidgetContext &);
	using WidgetEventReader = bool (*)(lv_obj_t *, lv_event_t *, DataValue &);
// Native components with timers or other UI activity pause/resume that work with their owner.
	using WidgetActivation = void (*)(lv_obj_t *, bool);
	struct NativeWidget {
		unsigned id; // Extension namespace: 256..65535. No sparse built-in tables.
		std::string name, abi;
		WidgetFactory create;
		WidgetExecutor execute;
		// PC compiler metadata only, published verbatim as a JSON object containing local methods.
		// The executor never parses this catalog or looks up methods by name.
		std::string compiler_json;
		WidgetEventReader read_event{};
		WidgetActivation activate{};
		bool keep_factory_styles{}; // Preserve widget-authored styles when the screen disables the LVGL theme.
	};
	class WidgetRegistry
	{
	public:
		// Registration is serialized with LVGL operations. Duplicate IDs/names are rejected.
		bool add(NativeWidget widget);
		bool remove(unsigned id);
		std::shared_ptr<const NativeWidget> find(unsigned id) const;
		std::shared_ptr<const NativeWidget> find(const char *name) const;
		// Read on the same UI context as add/remove; transports can republish a snapshot.
		size_t revision() const
		{
			return revision_;
		}

		const std::vector<std::shared_ptr<const NativeWidget> > &entries() const
		{
			return entries_;
		}

	private:
		std::vector<std::shared_ptr<const NativeWidget> > entries_;
		size_t revision_{};
	};
} // namespace lvgl_cbor
