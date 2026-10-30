// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "lvgl_cbor/widget_registry.hpp"
#include <algorithm>
namespace lvgl_cbor
{
	bool WidgetRegistry::add(NativeWidget widget)
	{
		if(widget.id < 256 || widget.id > 65535 || widget.name.find(':') == std::string::npos ||
		    widget.name.size() > 63 || widget.abi.empty() || widget.abi.size() > 63 || !widget.create ||
		    !widget.execute || widget.compiler_json.empty())
			return false;

		for(const auto &entry : entries_)
			if(entry->id == widget.id || entry->name == widget.name)
				return false;

		entries_.push_back(std::make_shared<const NativeWidget>(std::move(widget)));
		++revision_;
		return true;
	}

	bool WidgetRegistry::remove(unsigned id)
	{
		const auto it =
		    std::find_if(entries_.begin(), entries_.end(), [ = ](const auto &w) {
			return w->id == id;
		});
		if(it == entries_.end())
			return false;

		entries_.erase(it);
		++revision_;
		return true;
	}

	std::shared_ptr<const NativeWidget> WidgetRegistry::find(unsigned id) const
	{
		for(const auto &entry : entries_)
			if(entry->id == id)
				return entry;

		return {};
	}

	std::shared_ptr<const NativeWidget> WidgetRegistry::find(const char *name) const
	{
		for(const auto &entry : entries_)
			if(entry->name == name)
				return entry;

		return {};
	}

} // namespace lvgl_cbor
