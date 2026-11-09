// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "data_catalog_internal.hpp"
#include <algorithm>
#include <cmath>
#include <limits>
namespace lvgl_cbor
{
	namespace data_detail
	{
		bool metadata_ok(const std::string &text, size_t max)
		{
			std::string e; return validate_data_value(text, DataSchema::text(max), e);
		}

		bool schema_budget(const DataSchema &s, size_t &nodes, size_t &bytes, size_t depth)
		{
			if(depth > binding_contract::schemaDepth || ++nodes > 1024) return false;

			bytes += s.title.size() + s.description.size() + s.unit.size();
			if(bytes > 32768) return false;

			for(const auto &f:s.fields)
			{
				bytes += f.first.size(); if(!schema_budget(f.second, nodes, bytes, depth + 1))
					return false;
			}
			return !s.items || schema_budget(*s.items, nodes, bytes, depth + 1);
		}

		DataValue group_value(const DataGroup &g)
		{
			return DataValue::Object{{"name", g.name}, {"title", g.title}, {"description", g.description},
				{"parent", g.parent}};
		}

		DataValue schema_value(const DataSchema &s, bool detail)
		{
			const char *names[] = {"null", "bool", "integer", "number", "text", "object", "array"};
			DataValue::Object out{{"type", names[unsigned(s.type)]}};
			if(!s.title.empty()) out["title"] = s.title;

			if(!s.description.empty()) out["description"] = s.description;

			if(!s.unit.empty()) out["unit"] = s.unit;

			if(s.nullable) out["nullable"] = true;

			if(s.type == DataSchema::Type::Integer || s.type == DataSchema::Type::Number)
			{
				out["min"] = s.min; out["max"] = s.max;
			}

			if(s.type == DataSchema::Type::Text) out["maxBytes"] = s.max_bytes;

			if(s.type == DataSchema::Type::Array)
			{
				out["minItems"] = s.min_items; out["maxItems"] = s.max_items; if(detail)
					out["items"] = schema_value(*s.items);
			}

			if(s.type == DataSchema::Type::Object)
			{
				if(detail)
				{
					DataValue::Object fields; for(const auto &f:s.fields)
						fields[f.first] = schema_value(f.second);
					out["fields"] = std::move(fields);
				}
				else
					out["fieldCount"] = s.fields.size();
			}

			return out;
		}

	}
	namespace
	{
		bool fail(std::string &error, const char *message)
		{
			error = message; return false;
		}

		bool unsigned_number(const DataValue &v, uint64_t &out)
		{
			if(auto n = std::get_if<int64_t>(&v.value))
			{
				if(*n < 0)
					return false;

				out = uint64_t(*n); return true;
			}

			const auto *s = std::get_if<std::string>(&v.value); if(!s || s->empty() || s->size() > 16) return false;

			out = 0; for(char c:*s)
			{
				if(c < '0' || c > '9' || out > (9007199254740991ULL - unsigned(c - '0')) / 10)
					return false;

				out = out * 10 + unsigned(c - '0');
			}
			return true;
		}

		bool boolean(const DataValue &v, bool &out)
		{
			if(auto b = std::get_if<bool>(&v.value))
			{
				out = *b; return true;
			}

			if(auto s = std::get_if<std::string>(&v.value))
			{
				if(*s == "true" || *s == "1")
				{
					out = true; return true;
				}

				if(*s == "false" || *s == "0")
				{
					out = false; return true;
				}
			}

			return false;
		}

		const DataGroup *group(const DataView::Impl &p, const std::string &name)
		{
			for(const auto &g:p.groups)
				if(g->name == name)
					return g.get();

			return nullptr;
		}

		bool in_group(const DataView::Impl &p, std::string name, const std::string &filter, bool descendants)
		{
			if(filter.empty()) return true;

			for(size_t i = 0; i <= p.groups.size(); ++i)
			{
				if(name == filter)
					return true;

				if(!descendants || name.empty())
					return false;

				const auto *g = group(p, name); if(!g)
					return false;

				name = g->parent;
			}
			return false;
		}

		std::string pointer_key(const std::string &key)
		{
			std::string out; for(char c:key)
			{
				if(c == '~')
					out += "~0";
				else if(c == '/')
					out += "~1";
				else
					out += c;
			}
			return out;
		}

		const DataSchema *at_pointer(const DataSchema &root, const std::string &pointer, DataPath &path)
		{
			if(pointer.empty())
				return &root;

			if(pointer.front() != '/') return nullptr;

			const DataSchema *s = &root; size_t start = 1;
			for(;;)
			{
				size_t end = pointer.find('/', start);
				std::string token = pointer.substr(start, end == std::string::npos ? end : end - start), key;
				for(size_t i = 0; i < token.size(); ++i)
				{
					if(token[i] != '~')
						key += token[i];
					else
					{
						if(++i == token.size() || (token[i] != '0' && token[i] != '1'))
							return nullptr;

						key += token[i] == '0' ? '~' : '/';
					}
				}
				if(path.size() >= binding_contract::pathDepth) return nullptr;

				if(s->type == DataSchema::Type::Object)
				{
					auto i = s->fields.find(key); if(i == s->fields.end())
						return nullptr;

					path.emplace_back(key); s = &i->second;
				}
				else if(s->type == DataSchema::Type::Array)
				{
					uint64_t index;
					if((key.size() > 1 && key[0] == '0') || !unsigned_number(DataValue(key),
					    index) || index >= s->max_items)
						return nullptr;

					path.emplace_back(size_t(index)); s = s->items.get();
				}
				else return nullptr;

				if(end == std::string::npos)
					return s;

				start = end + 1;
			}
		}

// Count JSON bytes before copying a selected composite into an export record.
// The response budget limits payload growth; retained snapshots and STL node
// overhead are separate bounded costs, not a claim of maxBytes heap usage.
		bool add_cost(size_t bytes, size_t limit, size_t &total)
		{
			if(bytes > limit - total)
				return false;

			total += bytes; return true;
		}

		bool json_cost(const DataValue &v, size_t limit, size_t &total)
		{
			if(auto text = std::get_if<std::string>(&v.value))
			{
				if(!add_cost(2, limit, total))
					return false;

				for(unsigned char c:*text)
					if(!add_cost(c == '"' || c == '\\' ? 2 : c < 32 ? 6 : 1, limit, total))
						return false;

				return true;
			}

			if(auto array = std::get_if<DataValue::Array>(&v.value))
			{
				if(!add_cost(2, limit, total))
					return false;

				bool comma = false; for(const auto &x:*array)
				{
					if(comma && !add_cost(1, limit, total))
						return false;

					comma = true; if(!json_cost(x, limit, total))
						return false;
				}
				return true;
			}

			if(auto object = std::get_if<DataValue::Object>(&v.value))
			{
				if(!add_cost(2, limit, total))
					return false;

				bool comma = false; for(const auto &x:*object)
				{
					if(comma && !add_cost(1, limit, total))
						return false;

					comma = true;
					if(!json_cost(DataValue(x.first), limit, total) || !add_cost(1, limit,
					    total) || !json_cost(x.second, limit, total))
						return false;
				}
				return true;
			}

			return add_cost(data_value_json(v).size(), limit, total);
		}

		bool schema_cost(const DataSchema &s, size_t limit, size_t &total)
		{
			auto shallow = data_detail::schema_value(s, false); auto &o = std::get<DataValue::Object>(shallow.value);
			o.erase("fieldCount");
			if(!json_cost(shallow, limit, total)) return false;

			if(s.type == DataSchema::Type::Object)
			{
				if(!add_cost(12, limit, total))
					return false;

				bool comma = false; for(const auto &f:s.fields)
				{
					if(comma && !add_cost(1, limit, total))
						return false;

					comma = true;
					if(!json_cost(DataValue(f.first), limit, total) || !add_cost(1, limit,
					    total) || !schema_cost(f.second, limit, total))
						return false;
				}
			}
			else if(s.type == DataSchema::Type::Array)
			{
				if(!add_cost(9, limit, total) || !schema_cost(*s.items, limit, total))
					return false;
			}

			return true;
		}

		struct Record {
			const DataGroup *group{}; const DataSource *source{}; const DataAction *action{};
			const DataSchema *schema{};
			const data_detail::Snapshot *snapshot{}; const DataValue *value{}; std::string field, path;
		};
		DataValue record_value(const Record &r, const DataQuery &q, const DataView::Impl &p)
		{
			using V = DataValue; using O = V::Object;
			if(r.group)
			{
				auto value = data_detail::group_value(*r.group); auto &o = std::get<O>(value.value);
				size_t sources = 0, actions = 0, groups = 0;
				for(const auto &s:p.sources)
					if(s.descriptor->group == r.group->name) ++sources;

				for(const auto &a:p.actions)
					if(a->group == r.group->name) ++actions;

				for(const auto &g:p.groups)
					if(g->parent == r.group->name) ++groups;

				o["sourceCount"] = sources; o["actionCount"] = actions; o["groupCount"] = groups; return value;
			}

			const auto &name = r.source ? r.source->name : r.action->name;
			const auto &title = r.source ? r.source->title : r.action->title;
			const auto &description = r.source ? r.source->description : r.action->description;
			const auto &owner = r.source ? r.source->group : r.action->group;
			O out{{"name", name}, {"group", owner}};
			if(!title.empty())
				out["title"] = title;

			if(!description.empty()) out["description"] = description;

			if(q.kind == DataQuery::Kind::Fields){out["field"] = r.field; out["path"] = r.path;}

			if(q.kind == DataQuery::Kind::Values)
			{
				const auto state = r.value ? r.snapshot->state : DataState::Unknown;
				out["state"] = state == DataState::Known ? "known" : state == DataState::Stale ? "stale" : "unknown";
				out["revision"] = r.snapshot->revision; out["path"] = q.path;
				if(state != DataState::Known || !r.value) out["value"] = V();
				else if(q.detail ||
				    (!std::holds_alternative<V::Array>(r.value->value) && !std::holds_alternative<O>(r.value->value)))
					out["value"] = *r.value;
				else if(auto a = std::get_if<V::Array>(&r.value->value)) out["itemCount"] = a->size();
				else out["fieldCount"] = std::get<O>(r.value->value).size();

				out["type"] = std::get<O>(data_detail::schema_value(*r.schema, false).value).at("type");
			}
			else
			{
				if(q.detail) out["schema"] = data_detail::schema_value(*r.schema, true);
				else
				{
					const auto summary = data_detail::schema_value(*r.schema, false);
					for(const auto &f:std::get<O>(summary.value))
						if(f.first != "title" && f.first != "description")
							out[f.first] = f.second;
				}

				if(q.kind == DataQuery::Kind::Fields)
				{
					out.erase("title"); out.erase("description"); if(!r.schema->title.empty())
						out["title"] = r.schema->title;

					if(!r.schema->description.empty())
						out["description"] = r.schema->description;
				}

				if(r.source) out["writable"] = bool(r.source->write);
			}

			return out;
		}

	}
	bool parse_data_query(const DataValue &value, DataQuery &query, std::string &error)
	{
		const auto *o = std::get_if<DataValue::Object>(&value.value); if(!o) return fail(error, "data_query_object");

		DataQuery q;
		for(const auto &field:*o)
		{
			const auto &key = field.first; const auto &v = field.second;
			if(key == "kind")
			{
				auto s = std::get_if<std::string>(&v.value); if(!s) return fail(error, "data_query_kind");

				if(*s == "groups") q.kind = DataQuery::Kind::Groups; else if(*s == "sources")
					q.kind = DataQuery::Kind::Sources;
				else if(*s == "actions") q.kind = DataQuery::Kind::Actions; else if(*s == "fields")
					q.kind = DataQuery::Kind::Fields;
				else if(*s == "values") q.kind = DataQuery::Kind::Values; else return fail(error, "data_query_kind");
			}
			else if(key == "group" || key == "prefix" || key == "name" || key == "path")
			{
				auto s = std::get_if<std::string>(&v.value);
				if(!s || !data_detail::metadata_ok(*s, key == "path" ? 1024 : 63))
					return fail(error, "data_query_text");

				(key == "group" ? q.group : key == "prefix" ? q.prefix : key == "name" ? q.name : q.path) = *s;
			}
			else if(key == "detail" || key == "descendants")
			{
				if(!boolean(v, key == "detail" ? q.detail : q.descendants)) return fail(error, "data_query_bool");
			}
			else if(key == "offset" || key == "limit" || key == "maxBytes" || key == "catalogRevision")
			{
				uint64_t n; if(!unsigned_number(v, n) || n > 9007199254740991ULL)
					return fail(error, "data_query_number");

				if(key == "catalogRevision") q.catalog_revision = n;
				else
				{
					if(n > std::numeric_limits<size_t>::max())
						return fail(error, "data_query_number");

					(key == "offset" ? q.offset : key == "limit" ? q.limit : q.max_bytes) = size_t(n);
				}
			}
			else return fail(error, "data_query_key");
		}
		if(!q.limit || q.limit > 64 || q.max_bytes < 512 || q.max_bytes > 16384) return fail(error, "data_query_limit");

		if(!q.path.empty() && (q.path[0] != '/' || q.name.empty())) return fail(error, "data_query_path");

		if(q.kind == DataQuery::Kind::Fields && q.name.empty()) return fail(error, "data_query_name");

		query = std::move(q); error.clear(); return true;
	}

	DataView::DataView(std::shared_ptr<const Impl> p)
	  : impl_(std::move(p))
	{
	}

	uint64_t DataView::catalog_revision()const
	{
		return impl_ ? impl_->catalog_revision : 0;
	}

	uint64_t DataView::revision()const
	{
		return impl_ ? impl_->revision : 0;
	}

	bool DataView::query_json(const DataQuery &q, std::string &json, std::string &error)const
	{
		json.clear(); if(!impl_) return fail(error, "data_query_not_ready");

		const auto &p = *impl_;
		if(unsigned(q.kind) > unsigned(DataQuery::Kind::Values)) return fail(error, "data_query_kind");

		static const char *kind_names[] = {"groups", "sources", "actions", "fields", "values"};
		DataQuery checked;
		if(!parse_data_query(DataValue::Object{{"kind", kind_names[unsigned(q.kind)]}, {"group", q.group},
				{"prefix", q.prefix}, {"name", q.name}, {"path", q.path}, {"descendants", q.descendants},
				{"detail", q.detail}, {"offset", q.offset}, {"limit", q.limit}, {"maxBytes", q.max_bytes},
				{"catalogRevision", q.catalog_revision}}, checked, error)) return false;

		if(!q.limit || q.limit > 64 || q.max_bytes < 512 || q.max_bytes > 16384 ||
		    unsigned(q.kind) > unsigned(DataQuery::Kind::Values)) return fail(error, "data_query_limit");

		if(q.catalog_revision && q.catalog_revision != p.catalog_revision) return fail(error, "data_catalog_revision");

		if(!q.group.empty() && !group(p, q.group)) return fail(error, "data_query_group");

		std::vector<Record> records; bool matched_name = false;
		if(q.kind == DataQuery::Kind::Groups)
		{
			for(const auto &g:p.groups)
				if((q.descendants ? g->name != q.group && in_group(p, g->parent, q.group,
				    true) : g->parent == q.group) && g->name.compare(0, q.prefix.size(), q.prefix) == 0)
					records.push_back({g.get()});
		}
		else if(q.kind == DataQuery::Kind::Actions)
		{
			for(const auto &a:p.actions)
				if((q.name.empty() || q.name == a->name) && a->name.compare(0, q.prefix.size(),
				    q.prefix) == 0 && in_group(p, a->group, q.group, q.descendants))
				{
					matched_name = true; DataPath path; auto s = at_pointer(a->schema, q.path, path); if(!s)
						return fail(error, "data_query_path");

					Record r; r.action = a.get(); r.schema = s; records.push_back(r);
				}
		}
		else
		{
			for(const auto &s:p.sources)
				if((q.name.empty() || q.name == s.descriptor->name) && s.descriptor->name.compare(0, q.prefix.size(),
				    q.prefix) == 0 && in_group(p, s.descriptor->group, q.group, q.descendants))
				{
					matched_name = true; DataPath path;
					const auto *schema = at_pointer(s.descriptor->schema, q.path, path); if(!schema)
						return fail(error, "data_query_path");

					Record r; r.source = s.descriptor.get(); r.schema = schema; r.snapshot = s.snapshot.get();
					r.value = data_path(s.snapshot->value, path);
					if(q.kind == DataQuery::Kind::Fields)
					{
						if(schema->type == DataSchema::Type::Object)
							for(const auto &f:schema->fields)
							{
								auto child = r; child.schema = &f.second; child.field = f.first;
								child.path = q.path + "/" + pointer_key(f.first); records.push_back(std::move(child));
							}
						else if(schema->type == DataSchema::Type::Array && schema->max_items)
						{
							r.schema = schema->items.get(); r.field = "[]"; r.path = q.path + "/0";
							records.push_back(std::move(r));
						}
					}
					else records.push_back(std::move(r));
				}
		}

		if(!q.name.empty() && !matched_name) return fail(error, "data_query_name");

		if(q.offset > records.size()) return fail(error, "data_query_offset");

		auto envelope = [&](const std::string &body, size_t end){
				return std::string("{\"format\":\"lvgl-data-page-1\",\"catalogRevision\":") +
				       std::to_string(p.catalog_revision) + ",\"revision\":" + std::to_string(p.revision) +
				       ",\"total\":" + std::to_string(records.size()) + ",\"offset\":" + std::to_string(q.offset) +
				       ",\"nextOffset\":" + (end <
				       records.size() ? std::to_string(end) : "null") + ",\"hasMore\":" + (end <
				       records.size() ? "true" : "false") + ",\"items\":[" + body + "]}";
			};
		std::string body; size_t end = q.offset;
		while(end < records.size() && end - q.offset < q.limit)
		{
			const auto &record = records[end]; size_t cost = 0; bool fits = true;
			if(q.kind == DataQuery::Kind::Values)
			{
				if(record.value && record.snapshot->state == DataState::Known &&
				    (q.detail || (!std::holds_alternative<DataValue::Object>(record.value->value) &&
				    !std::holds_alternative<DataValue::Array>(record.value->value))))
					fits = json_cost(*record.value, q.max_bytes, cost);
			}
			else if(q.detail && record.schema) fits = schema_cost(*record.schema, q.max_bytes, cost);

			if(!fits)
			{
				if(end == q.offset)
					return fail(error, "data_query_record_limit");

				break;
			}

			auto item = data_value_json(record_value(records[end], q, p));
			std::string candidate = body + (body.empty() ? "" : ",") + item;
			if(envelope(candidate, end + 1).size() > q.max_bytes)
			{
				if(end == q.offset)
					return fail(error, "data_query_record_limit");

				break;
			}

			body = std::move(candidate); ++end;
		}
		json = envelope(body, end); error.clear(); return true;
	}

}
