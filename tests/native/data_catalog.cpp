// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "lvgl_cbor/data_registry.hpp"
#include <cassert>
#include <iostream>
using namespace lvgl_cbor;
using O = DataValue::Object;
int main()
{
	DataRegistry registry; std::string error, json;
	assert(registry.add_group({"system", "System", "System sources", ""}, error));
	assert(registry.add_group({"cpu", "CPU", "Processor", "system"}, error));
	assert(!registry.add_group({"bad", "", "", "missing"}, error));
	auto temperature = DataSchema::number(-100, 200); temperature.title = "Температура";
	temperature.description = "Latest measured value"; temperature.unit = "C"; temperature.nullable = true;
	auto schema = DataSchema::object({{"temperature", temperature}, {"a/b~", DataSchema::integer()},
				{"empty", DataSchema::object({})}});
	assert(registry.add_source({"system.sample", schema, {}, "Sample", "Source description", "cpu"}, error));
	assert(registry.add_action({"reset", DataSchema::null(), [](const DataValue &, std::string &){
									return true;
								}, "Reset", "Clear sample", "system"}, error));
	const auto catalog_revision = registry.catalog_revision(); assert(catalog_revision == 4);
	assert(registry.publish("system.sample", O{{"temperature", 21.5}, {"a/b~", 7}}, error)); registry.flush();
	assert(registry.catalog_revision() == catalog_revision);
	DataQuery q; q.kind = DataQuery::Kind::Sources; q.group = "system";
	assert(registry.query_json(q, json, error)); assert(json.find("\"items\":[]") != std::string::npos);
	q.descendants = true; assert(registry.query_json(q, json, error));
	assert(json.find("Source description") != std::string::npos && json.find("\"schema\"") == std::string::npos);
	q.detail = true; assert(registry.query_json(q, json, error));
	assert(json.find("\"unit\":\"C\"") != std::string::npos && json.find("\"nullable\":true") != std::string::npos);
	q = {}; q.kind = DataQuery::Kind::Fields; q.name = "system.sample";
	assert(registry.query_json(q, json, error));
	assert(json.find("/a~1b~0") != std::string::npos && json.find("Температура") != std::string::npos);
	q.name = "missing"; assert(!registry.query_json(q, json, error) && error == "data_query_name");
	q.name = "system.sample"; q.path = "/empty";
	assert(registry.query_json(q, json, error) && json.find("\"items\":[]") != std::string::npos);
	q = {}; q.kind = DataQuery::Kind::Fields; assert(!registry.query_json(q, json, error));
	q = {}; q.kind = DataQuery::Kind::Values; q.path = "/temperature"; assert(!registry.query_json(q, json, error));
	q.name = "system.sample"; assert(registry.query_json(q, json, error));
	assert(json.find("21.5") != std::string::npos);
	const auto old = registry.view();
	assert(registry.publish("system.sample", O{{"temperature", nullptr}}, error)); registry.flush();
	assert(registry.query_json(q, json, error));
	assert(json.find("\"state\":\"known\"") != std::string::npos && json.find("\"value\":null") != std::string::npos);
	q.path = "/a~1b~0"; assert(registry.query_json(q, json, error));
	assert(json.find("\"state\":\"unknown\"") != std::string::npos);
	q.path = "/temperature"; assert(old.query_json(q, json, error) && json.find("21.5") != std::string::npos);
	q.catalog_revision = catalog_revision;
	assert(registry.add_source({"system.new", DataSchema::boolean()}, error));
	assert(!registry.query_json(q, json, error) && error == "data_catalog_revision");
	q = {}; q.kind = DataQuery::Kind::Sources; q.limit = 1; q.max_bytes = 512;
	assert(registry.query_json(q, json,
	    error) && json.size() <= 512 && json.find("\"hasMore\":true") != std::string::npos);
	q.offset = 1; q.catalog_revision = registry.catalog_revision();
	assert(registry.query_json(q, json, error) && json.find("system.sample") != std::string::npos);
	q = {}; q.kind = DataQuery::Kind::Sources; q.detail = true; q.name = "system.sample"; q.max_bytes = 512;
	assert(!registry.query_json(q, json, error) && error == "data_query_record_limit");
	DataQuery parsed; assert(!parse_data_query(O{{"limit", 0}}, parsed, error));
	assert(!parse_data_query(O{{"unknown", 1}}, parsed, error));
	assert(!parse_data_query(O{{"maxBytes", 16385}}, parsed, error));
	DataLimits tight; tight.metadata_bytes = 5; DataRegistry bounded(tight);
	assert(!bounded.add_group({"abcdef", "", "", ""}, error));
	auto bad = temperature; bad.description = std::string(513, 'x'); assert(!registry.add_source({"bad", bad}, error));
	DataLimits payload_limits; payload_limits.value_bytes = 1; payload_limits.snapshot_bytes = 1;
	DataRegistry full(payload_limits);
	assert(full.add_source({"x", DataSchema::boolean()}, error));
	assert(full.publish("x", true, error)); full.flush();
	assert(full.invalidate("x", error)); full.flush();
	DataState full_state; assert(full.read("x", {}, &full_state) == nullptr);
	assert(full_state == DataState::Unknown);
	assert(full.publish("x", false, error)); full.flush();
	DataRegistry text_registry;
	assert(text_registry.add_source({"text", DataSchema::text(4096)}, error));
	assert(text_registry.publish("text", std::string(2000, 'x'), error)); text_registry.flush();
	q = {}; q.kind = DataQuery::Kind::Values; q.name = "text"; q.max_bytes = 512;
	assert(!text_registry.query_json(q, json, error) && error == "data_query_record_limit");
	assert(text_registry.publish("text", std::string(2000, 'x'), error, DataState::Stale)); text_registry.flush();
	q.detail = true; assert(text_registry.query_json(q, json, error) && json.size() <= 512);
	assert(json.find("\"state\":\"stale\"") != std::string::npos);
	assert(text_registry.invalidate("text", error)); text_registry.flush();
	assert(text_registry.query_json(q, json, error) && json.size() <= 512);
	DataView retained;
	{DataRegistry short_lived; assert(short_lived.add_source({"x", DataSchema::integer()}, error));
	 assert(short_lived.publish("x", 42, error)); short_lived.flush(); retained = short_lived.view();}
	q = {}; q.kind = DataQuery::Kind::Values; q.name = "x";
	assert(retained.query_json(q, json, error) && json.find("42") != std::string::npos);
	std::cout <<
	    "Data catalog: groups, metadata, bounds, nullable fields, pointer paths, revision paging and immutable snapshot lifetimes passed\n";
}
