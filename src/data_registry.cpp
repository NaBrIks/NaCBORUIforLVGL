// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "lvgl_cbor/data_registry.hpp"
#include "data_catalog_internal.hpp"
#include <algorithm>
#include <cmath>
#include <deque>
#include <set>
namespace lvgl_cbor
{
	namespace
	{
		bool named(const std::string &s)
		{
			std::string error;
			return !s.empty() && validate_data_value(s, DataSchema::text(63), error);
		}

		bool title_ok(const std::string &s)
		{
			std::string error;
			return validate_data_value(s, DataSchema::text(128), error);
		}

		DataSchema owned_schema(const DataSchema &s)
		{
			DataSchema out = s;
			if(s.items)
				out.items = std::make_shared<const DataSchema>(owned_schema(*s.items));

			for(auto &x : out.fields)
				x.second = owned_schema(x.second);
			return out;
		}

		bool schema_ok(const DataSchema &s, size_t depth = 0)
		{
			if(unsigned(s.type) > unsigned(DataSchema::Type::Array) ||
			    depth > binding_contract::schemaDepth || !std::isfinite(s.min) || !std::isfinite(s.max) ||
			    s.min > s.max)
				return false;

			if(!data_detail::metadata_ok(s.title, 128) || !data_detail::metadata_ok(s.description,
			    512) || !data_detail::metadata_ok(s.unit, 32)) return false;

			if(s.type == DataSchema::Type::Integer &&
			    (std::trunc(s.min) != s.min || std::trunc(s.max) != s.max || s.min < -9007199254740991.0 ||
			    s.max > 9007199254740991.0))
				return false;

			if(s.type == DataSchema::Type::Text &&
			    (!s.max_bytes || s.max_bytes > binding_contract::textBytes))
				return false;

			if(s.type == DataSchema::Type::Object)
			{
				if(s.fields.size() > binding_contract::objectFields)
					return false;

				for(const auto &f : s.fields)
					if(!named(f.first) || f.first == "__proto__" || f.first == "constructor" ||
					    f.first == "prototype" || !schema_ok(f.second, depth + 1))
						return false;
			}

			if(s.type == DataSchema::Type::Array &&
			    (!s.items || s.max_items > binding_contract::arrayItems || s.min_items > s.max_items ||
			    !schema_ok(*s.items, depth + 1)))
				return false;

			return true;
		}

		struct Demand {
			size_t count{};
		};
		struct Lease {
			std::vector<std::shared_ptr<Demand> > counters;
			~Lease()
			{
				for(auto &p : counters)
					--p->count;
			}

		};
		struct Watch {
			std::vector<std::string> names;
			std::function<void()> call;
			std::shared_ptr<Lease> lease;
			bool forced = true;
		};
	} // namespace
	const DataSchema *data_schema_path(const DataSchema &s, const DataPath &p)
	{
		const DataSchema *current = &s;
		for(const auto &x : p)
		{
			if(auto k = std::get_if<std::string>(&x))
			{
				auto f = current->fields.find(*k);
				if(current->type != DataSchema::Type::Object || f == current->fields.end())
					return nullptr;

				current = &f->second;
			}
			else
			{
				if(current->type != DataSchema::Type::Array || !current->items ||
				    std::get<size_t>(x) >= current->max_items)
					return nullptr;

				current = current->items.get();
			}
		}
		return current;
	}

	struct DataRegistry::Impl {
		using Snapshot = data_detail::Snapshot;
		struct Source {
			std::shared_ptr<const DataSource> descriptor;
			std::shared_ptr<const Snapshot> committed = std::make_shared<Snapshot>();
			std::unique_ptr<Snapshot> pending;
			std::shared_ptr<Demand> demand = std::make_shared<Demand>();
		};
		struct Deferred {
			std::weak_ptr<void> owner;
			size_t bytes;
			std::function<void()> call;
		};
		DataLimits limits;
		std::map<std::string, Source> sources;
		std::map<std::string, std::shared_ptr<const DataAction> > actions;
		std::map<std::string, std::shared_ptr<const DataGroup> > groups;
		uint64_t catalog_revision = 0;
		size_t metadata_bytes = 0, schema_nodes = 0;
		std::vector<std::weak_ptr<Watch> > watchers;
		std::deque<Deferred> events;
		size_t event_bytes{};
		uint64_t revision{}, rejected_events{}, queue_dropped{}, binding_errors{};
		std::string last_error;
		bool flushing{};
		explicit Impl(DataLimits l)
		  : limits(l)
		{
			auto bounded = [](size_t n, size_t max) {
					return std::max(size_t(1), std::min(n, max));
				};
			limits.sources = bounded(limits.sources, binding_contract::sources);
			limits.actions = bounded(limits.actions, binding_contract::actions);
			limits.groups = bounded(limits.groups, 32);
			limits.metadata_bytes = bounded(limits.metadata_bytes, 32768);
			limits.schema_nodes = bounded(limits.schema_nodes, 1024);
			limits.value_bytes = bounded(limits.value_bytes, binding_contract::valueBytes);
			limits.snapshot_bytes = bounded(limits.snapshot_bytes, binding_contract::snapshotBytes);
			limits.event_queue = bounded(limits.event_queue, binding_contract::eventQueue);
			limits.event_queue_bytes = bounded(limits.event_queue_bytes, binding_contract::eventQueueBytes);
		}

		bool fail(std::string &e, const std::string &s)
		{
			last_error = e = s;
			return false;
		}

		size_t bytes() const
		{
			size_t n = 0;
			for(const auto &x : sources)
			{
				n += x.second.committed->bytes;
				if(x.second.pending)
					n += x.second.pending->bytes;
			}
			return n;
		}

	};
	DataRegistry::DataRegistry(DataLimits l)
	  : impl_(std::make_unique<Impl>(l))
	{
	}

	DataRegistry::~DataRegistry() = default;
	bool DataRegistry::add_group(DataGroup group, std::string &error)
	{
		auto &p = *impl_;
		if(!named(group.name) || !title_ok(group.title) || !data_detail::metadata_ok(group.description, 512) ||
		    p.groups.count(group.name) || p.groups.size() >= p.limits.groups ||
		    (!group.parent.empty() && !p.groups.count(group.parent))) return p.fail(error, "data_group_registration");

		const size_t bytes = group.name.size() + group.title.size() + group.description.size() + group.parent.size();
		if(bytes > p.limits.metadata_bytes - p.metadata_bytes) return p.fail(error, "data_metadata_limit");

		auto name = group.name;
		p.groups.emplace(name, std::make_shared<const DataGroup>(std::move(group)));
		p.metadata_bytes += bytes; ++p.catalog_revision; error.clear(); return true;
	}

	uint64_t DataRegistry::catalog_revision() const
	{
		return impl_->catalog_revision;
	}

	DataView DataRegistry::view() const
	{
		auto out = std::make_shared<DataView::Impl>();
		out->catalog_revision = impl_->catalog_revision; out->revision = impl_->revision;
		for(const auto &g : impl_->groups)
			out->groups.push_back(g.second);
		for(const auto &a : impl_->actions)
			out->actions.push_back(a.second);
		for(const auto &s : impl_->sources)
			out->sources.push_back({s.second.descriptor, s.second.committed});
		return DataView(std::move(out));
	}

	bool DataRegistry::query_json(const DataQuery &q, std::string &json, std::string &error) const
	{
		return view().query_json(q, json, error);
	}

	bool DataRegistry::add_source(DataSource s, std::string &e)
	{
		auto &p = *impl_;
		if(!named(s.name) || !title_ok(s.title) || !data_detail::metadata_ok(s.description,
		    512) || !schema_ok(s.schema) ||
		    (!s.group.empty() && !p.groups.count(s.group)) || p.sources.count(s.name) ||
		    p.sources.size() >= p.limits.sources)
			return p.fail(e, "data_source_registration");

		size_t nodes = 0, bytes = s.name.size() + s.title.size() + s.description.size() + s.group.size();
		if(!data_detail::schema_budget(s.schema, nodes,
		    bytes) || nodes > p.limits.schema_nodes - p.schema_nodes ||
		    bytes > p.limits.metadata_bytes - p.metadata_bytes)
			return p.fail(e, "data_metadata_limit");

		s.schema = owned_schema(s.schema);
		auto name = s.name;
		Impl::Source item;
		item.descriptor = std::make_shared<const DataSource>(std::move(s));
		p.sources.emplace(name, std::move(item));
		p.metadata_bytes += bytes; p.schema_nodes += nodes; ++p.catalog_revision;
		e.clear();
		return true;
	}

	bool DataRegistry::add_action(DataAction a, std::string &e)
	{
		auto &p = *impl_;
		if(!named(a.name) || !title_ok(a.title) || !data_detail::metadata_ok(a.description,
		    512) || !schema_ok(a.schema) ||
		    (!a.group.empty() && !p.groups.count(a.group)) || !a.invoke ||
		    p.actions.count(a.name) || p.actions.size() >= p.limits.actions)
			return p.fail(e, "data_action_registration");

		size_t nodes = 0, bytes = a.name.size() + a.title.size() + a.description.size() + a.group.size();
		if(!data_detail::schema_budget(a.schema, nodes,
		    bytes) || nodes > p.limits.schema_nodes - p.schema_nodes ||
		    bytes > p.limits.metadata_bytes - p.metadata_bytes)
			return p.fail(e, "data_metadata_limit");

		a.schema = owned_schema(a.schema);
		auto name = a.name;
		p.actions.emplace(name, std::make_shared<const DataAction>(std::move(a)));
		p.metadata_bytes += bytes; p.schema_nodes += nodes; ++p.catalog_revision;
		e.clear();
		return true;
	}

	const DataSource *DataRegistry::source(const std::string &n) const
	{
		auto i = impl_->sources.find(n);
		return i == impl_->sources.end() ? nullptr : i->second.descriptor.get();
	}

	std::vector<std::string> DataRegistry::source_names() const
	{
		std::vector<std::string> names; names.reserve(impl_->sources.size());
		for(const auto &source:impl_->sources)
			names.push_back(source.first);
		return names;
	}

	const DataAction *DataRegistry::action(const std::string &n) const
	{
		auto i = impl_->actions.find(n);
		return i == impl_->actions.end() ? nullptr : i->second.get();
	}

	bool DataRegistry::publish(const std::string &n, DataValue v, std::string &e, DataState state)
	{
		auto &p = *impl_;
		auto i = p.sources.find(n);
		if(i == p.sources.end())
			return p.fail(e, "data_source_unknown");

		if(state == DataState::Unknown)
			v = {};
		else if(!validate_data_value(v, i->second.descriptor->schema, e))
			return p.fail(e, e);

		size_t bytes = state == DataState::Unknown ? 0 : encode_data_value(v).size();
		if(bytes > p.limits.value_bytes ||
		    p.bytes() - (i->second.pending ? i->second.pending->bytes : 0) + bytes >
		    p.limits.snapshot_bytes)
			return p.fail(e, "data_snapshot_limit");

		auto next = std::make_unique<Impl::Snapshot>();
		next->value = std::move(v);
		next->state = state;
		next->bytes = bytes;
		i->second.pending = std::move(next);
		e.clear();
		return true;
	}

	bool DataRegistry::publish_cbor(const std::string &n, const uint8_t *p, size_t size, std::string &e,
	    DataState s)
	{
		DataValue v;
		if(!decode_data_value(p, size, v, e, impl_->limits.value_bytes))
			return false;

		return publish(n, std::move(v), e, s);
	}

	bool DataRegistry::invalidate(const std::string &n, std::string &e)
	{
		return publish(n, {}, e, DataState::Unknown);
	}

	const DataValue *DataRegistry::read(const std::string &n, const DataPath &path,
	    DataState *state) const
	{
		auto i = impl_->sources.find(n);
		if(i == impl_->sources.end())
		{
			if(state)
				*state = DataState::Unknown;

			return nullptr;
		}

		const auto &s = *i->second.committed;
		if(state)
			*state = s.state;

		return s.state == DataState::Known ? data_path(s.value, path) : nullptr;
	}

	uint64_t DataRegistry::revision() const
	{
		return impl_->revision;
	}

	DataLimits DataRegistry::limits() const
	{
		return impl_->limits;
	}

	size_t DataRegistry::demand(const std::string &n) const
	{
		auto i = impl_->sources.find(n);
		return i == impl_->sources.end() ? 0 : i->second.demand->count;
	}

	DataRegistry::DemandToken DataRegistry::retain(const std::string &n)
	{
		auto i = impl_->sources.find(n);
		if(i == impl_->sources.end())
			return {};

		auto lease = std::make_shared<Lease>();
		lease->counters.push_back(i->second.demand);
		++i->second.demand->count;
		return {lease};
	}

	DataRegistry::Subscription DataRegistry::observe(const std::vector<std::string> &names,
	    std::function<void()> cb)
	{
		if(!cb)
			return {};

		auto w = std::make_shared<Watch>();
		w->call = std::move(cb);
		w->lease = std::make_shared<Lease>();
		std::set<std::string> unique(names.begin(), names.end());
		for(const auto &n : unique)
		{
			auto i = impl_->sources.find(n);
			if(i == impl_->sources.end())
				return {};

			w->names.push_back(n);
			w->lease->counters.push_back(i->second.demand);
			++i->second.demand->count;
		}
		impl_->watchers.push_back(w);
		return {w};
	}

	void DataRegistry::request(const Subscription &s)
	{
		if(s.state)
			std::static_pointer_cast<Watch>(s.state)->forced = true;
	}

	bool DataRegistry::defer(std::weak_ptr<void> owner, size_t bytes, std::function<void()> fn,
	    std::string &e)
	{
		auto &p = *impl_;
		if(owner.expired())
			return p.fail(e, "data_event_owner");

		if(!fn)
			return p.fail(e, "data_event_callback");

		if(p.events.size() >= p.limits.event_queue ||
		    bytes > p.limits.event_queue_bytes - p.event_bytes)
		{
			++p.queue_dropped;
			return p.fail(e, "data_event_queue_limit");
		}

		p.event_bytes += bytes;
		p.events.push_back({std::move(owner), bytes, std::move(fn)});
		e.clear();
		return true;
	}

	bool DataRegistry::invoke(const std::string &n, const DataValue &v, std::string &e)
	{
		auto &p = *impl_;
		if(encode_data_value(v).size() > p.limits.value_bytes)
		{
			++p.rejected_events;
			return p.fail(e, "data_value_limit");
		}

		auto a = p.actions.find(n);
		if(a == p.actions.end() || !validate_data_value(v, a->second->schema, e))
		{
			++p.rejected_events;
			return p.fail(e, a == p.actions.end() ? "data_action_unknown" : e);
		}

		if(!a->second->invoke(v, e))
		{
			++p.rejected_events;
			return p.fail(e, e.empty() ? "data_action_rejected" : e);
		}

		e.clear();
		return true;
	}

	bool DataRegistry::write(const std::string &n, const DataPath &path, const DataValue &v,
	    std::string &e)
	{
		auto &p = *impl_;
		if(encode_data_value(v).size() > p.limits.value_bytes)
		{
			++p.rejected_events;
			return p.fail(e, "data_value_limit");
		}

		auto i = p.sources.find(n);
		const auto *schema =
		    i == p.sources.end() ? nullptr : data_schema_path(i->second.descriptor->schema, path);
		if(!schema || !i->second.descriptor->write || !validate_data_value(v, *schema, e))
		{
			++p.rejected_events;
			return p.fail(e, !schema ? "data_write_path"
			         : !i->second.descriptor->write ? "data_read_only"
			                                       : e);
		}

		if(!i->second.descriptor->write(path, v, e))
		{
			++p.rejected_events;
			return p.fail(e, e.empty() ? "data_write_rejected" : e);
		}

		e.clear();
		return true;
	}

	void DataRegistry::binding_error(const std::string &e)
	{
		++impl_->binding_errors;
		impl_->last_error = e;
	}

	void DataRegistry::flush()
	{
		auto &p = *impl_;
		if(p.flushing)
			return;

		p.flushing = true;
		auto events = std::move(p.events);
		p.events.clear();
		p.event_bytes = 0;
		for(auto &event : events)
			if(!event.owner.expired())
				event.call();

		std::set<std::string> changed;
		for(auto &x : p.sources)
			if(x.second.pending)
			{
				auto next = std::move(x.second.pending);
				if(next->state != x.second.committed->state || next->value != x.second.committed->value)
				{
					next->revision = ++p.revision;
					changed.insert(x.first);
				}
				else
					next->revision = x.second.committed->revision;

				x.second.committed = std::shared_ptr<const Impl::Snapshot>(std::move(next));
			}

		auto watchers = p.watchers;
		for(auto &w : watchers)
			if(auto live = w.lock())
			{
				bool run = live->forced;
				for(const auto &n : live->names)
					run = run || changed.count(n);
				if(run)
				{
					live->forced = false;
					live->call();
				}
			}

		p.watchers.erase(std::remove_if(p.watchers.begin(), p.watchers.end(),
		    [](const auto &w) {
			return w.expired();
		}),
		    p.watchers.end());
		p.flushing = false;
	}

	std::string DataRegistry::catalog_json() const
	{
		DataValue::Array sources, actions, events, groups;
		for(const auto &g : impl_->groups)
			groups.push_back(data_detail::group_value(*g.second));
		for(const auto &x : impl_->sources)
		{
			const auto &s = *x.second.descriptor;
			DataValue::Object o{
				{"name", s.name}, {"schema", data_detail::schema_value(s.schema)}, {"writable", bool(s.write)}};
			if(!s.title.empty())
				o["title"] = s.title;

			if(!s.description.empty()) o["description"] = s.description;

			if(!s.group.empty()) o["group"] = s.group;

			sources.emplace_back(std::move(o));
		}
		for(const auto &x : impl_->actions)
		{
			const auto &a = *x.second;
			DataValue::Object o{{"name", a.name}, {"schema", data_detail::schema_value(a.schema)}};
			if(!a.title.empty())
				o["title"] = a.title;

			if(!a.description.empty()) o["description"] = a.description;

			if(!a.group.empty()) o["group"] = a.group;

			actions.emplace_back(std::move(o));
		}
		for(auto name : binding_contract::event_names)
			events.emplace_back(name);
		DataValue::Object limits{{"expressionDepth", binding_contract::expressionDepth},
			{"expressionNodes", binding_contract::expressionNodes},
			{"pathDepth", binding_contract::pathDepth},
			{"bindings", binding_contract::bindings},
			{"events", binding_contract::events},
			{"valueBytes", impl_->limits.value_bytes},
			{"snapshotBytes", impl_->limits.snapshot_bytes},
			{"eventQueue", impl_->limits.event_queue},
			{"eventQueueBytes", impl_->limits.event_queue_bytes},
			{"sources", impl_->limits.sources},
			{"actions", impl_->limits.actions}};
		return data_value_json(DataValue::Object{{"version", binding_contract::version},
					   {"sha256", binding_contract::sha256},
					   {"catalogRevision", impl_->catalog_revision}, {"groups", std::move(groups)},
					   {"catalogLimits",
						DataValue::Object{{"groups", impl_->limits.groups},
							{"metadataBytes", impl_->limits.metadata_bytes},
							{"schemaNodes", impl_->limits.schema_nodes}, {"replyBytes", 16384}}},
					   {"sources", std::move(sources)},
					   {"actions", std::move(actions)},
					   {"events", std::move(events)},
					   {"limits", std::move(limits)}});
	}

	std::string DataRegistry::snapshot_json() const
	{
		DataValue::Array sources;
		for(const auto &x : impl_->sources)
		{
			const auto &s = *x.second.committed;
			sources.emplace_back(DataValue::Object{{"name", x.first},
					{"state", s.state == DataState::Known ? "known"
						                             : s.state == DataState::Stale ? "stale"
						                                                           : "unknown"},
					{"revision", s.revision},
					{"value", s.value}});
		}
		return data_value_json(DataValue::Object{
			{"revision", impl_->revision},
			{"sources", std::move(sources)},
			{"diagnostics", DataValue::Object{{"lastError", impl_->last_error},
				 {"rejectedEvents", impl_->rejected_events},
				 {"queueDropped", impl_->queue_dropped},
				 {"bindingErrors", impl_->binding_errors}}}});
	}

} // namespace lvgl_cbor
