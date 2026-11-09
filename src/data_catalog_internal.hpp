// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "lvgl_cbor/data_registry.hpp"
namespace lvgl_cbor::data_detail
{
	struct Snapshot { DataValue value; DataState state = DataState::Unknown; uint64_t revision{}; size_t bytes{}; };
	bool metadata_ok(const std::string &, size_t);
	bool schema_budget(const DataSchema &, size_t &nodes, size_t &bytes, size_t depth = 0);
	DataValue schema_value(const DataSchema &, bool detail = true);
	DataValue group_value(const DataGroup &);
}
namespace lvgl_cbor
{
	struct DataView::Impl {
		struct Source { std::shared_ptr<const DataSource> descriptor;
			            std::shared_ptr<const data_detail::Snapshot> snapshot; };
		std::vector<Source> sources;
		std::vector<std::shared_ptr<const DataAction> > actions;
		std::vector<std::shared_ptr<const DataGroup> > groups;
		uint64_t catalog_revision{}, revision{};
	};
}
