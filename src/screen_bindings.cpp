// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "screen_bindings.hpp"
#include "binding_expression.hpp"
#include "screen_views.hpp"
#include "cbor_reader.hpp"
#include <cmath>
#include <cstdio>
#include <iomanip>
#include <locale>
#include <sstream>
namespace lvgl_cbor::detail
{
	namespace
	{
		const DataValue *field(const DataValue &v, const char *k)
		{
			auto o = std::get_if<DataValue::Object>(&v.value);
			if(!o)
				return nullptr;

			auto i = o->find(k);
			return i == o->end() ? nullptr : &i->second;
		}

		const std::string *string(const DataValue *v)
		{
			return v ? std::get_if<std::string>(&v->value) : nullptr;
		}

		bool only(const DataValue &v, std::initializer_list<const char *> allowed)
		{
			auto o = std::get_if<DataValue::Object>(&v.value);
			if(!o)
				return false;

			for(const auto &x : *o)
			{
				bool found = false;
				for(auto k : allowed)
					found = found || x.first == k;
				if(!found)
					return false;
			}
			return true;
		}

		ScreenNode *find_node(ScreenNode *n, const std::string &id)
		{
			if(!n)
				return nullptr;

			if(n->id == id)
				return n;

			for(auto &c : n->children)
				if(auto found = find_node(c.get(), id))
					return found;

			return nullptr;
		}

		bool needs_event(const DataValue &v)
		{
			if(auto a = std::get_if<DataValue::Array>(&v.value))
			{
				for(auto &x : *a)
					if(needs_event(x))
						return true;
			}
			else if(auto o = std::get_if<DataValue::Object>(&v.value))
			{
				if(o->count("literal"))
					return false;

				if(o->count("event"))
					return true;

				if(auto object = field(v, "object"))
				{
					for(const auto &x : std::get<DataValue::Object>(object->value))
						if(needs_event(x.second))
							return true;
				}
				else if(auto args = field(v, "args"))
					return needs_event(*args);
			}

			return false;
		}

		lv_event_code_t event_code(const std::string &n)
		{
			return n == "clicked" ? LV_EVENT_CLICKED
		 : n == "value_changed" ? LV_EVENT_VALUE_CHANGED
		 : n == "ready" ? LV_EVENT_READY
		 : n == "long_pressed" ? LV_EVENT_LONG_PRESSED
			                    : LV_EVENT_ALL;
		}

		bool event_reader_available(const ScreenNode &n)
		{
			return n.extension ? bool(n.extension->read_event)
			         : n.type == 3 || n.type == 4 || n.type == 5 || n.type == 8 || n.type == 9 ||
			       n.type == 10 || n.type == 11;
		}

		bool read_event_value(ScreenNode &n, lv_event_t *e, DataValue &v)
		{
			if(n.extension)
				return n.extension->read_event && n.extension->read_event(n.object, e, v);

			switch(n.type)
			{
#if LV_USE_BAR
			case 3:
				v = lv_bar_get_value(n.object);
				return true;
#endif
#if LV_USE_SLIDER
			case 4:
				v = lv_slider_get_value(n.object);
				return true;
#endif
#if LV_USE_ARC
			case 5:
				v = lv_arc_get_value(n.object);
				return true;
#endif
			case 8:
			case 9:
				v = bool(lv_obj_has_state(n.object, LV_STATE_CHECKED));
				return true;
#if LV_USE_TEXTAREA
			case 10:
				v = lv_textarea_get_text(n.object);
				return true;
#endif
#if LV_USE_DROPDOWN
			case 11:
				v = lv_dropdown_get_selected(n.object);
				return true;
#endif
			default:
				return false;
			}
		}

		bool extract(const CborValue &map, const char *name, DataValue::Array &out, std::string &e)
		{
			CborValue v;
			if(!detail::field(map, name, v))
				return true;

			if(!cbor_value_is_array(&v))
				return false;

			auto end = v;
			const auto *start = cbor_value_get_next_byte(&v);
			if(cbor_value_advance(&end) != CborNoError)
				return false;

			DataValue value;
			if(!decode_data_value(start, size_t(cbor_value_get_next_byte(&end) - start), value, e,
			    screen_packet_bytes,
			    binding_contract::expressionDepth + binding_contract::valueDepth + 4))
				return false;

			auto a = std::get_if<DataValue::Array>(&value.value);
			if(!a)
				return false;

			out = std::move(*a);
			return true;
		}

	} // namespace
	struct ScreenBindings : std::enable_shared_from_this<ScreenBindings> {
		struct Rule {
			ScreenNode *node{};
			uint16_t method{};
			DataValue expression;
			bool formatted{};
			DataValue::Object format;
			WidgetStorage storage;
			std::vector<uint8_t> cache;
			bool force = true;
		};
		struct Event {
			ScreenNode *node{};
			lv_event_code_t code{};
			std::string action, source;
			DataPath path;
			DataValue expression;
			std::function<void()> navigate;
		};
		struct Hook {
			ScreenNode *node;
			std::weak_ptr<ScreenBindings> owner;
		};
		DataRegistry &data;
		const Resource *resources;
		size_t resource_count, max_bytes;
		std::vector<std::unique_ptr<Rule> > rules;
		std::vector<Event> events;
		std::vector<std::unique_ptr<Hook> > hooks;
		DataRegistry::Subscription subscription;
		std::vector<std::string> dependencies;
		uint64_t generation{};
		bool setting{}, active = true, paused{};
		ScreenBindings(DataRegistry &d, const Resource *r, size_t n, size_t max)
		  : data(d), resources(r), resource_count(n), max_bytes(max)
		{
		}

		~ScreenBindings()
		{
			deactivate();
		}

		// A callback can replace its own screen while holding this session alive. Detach while the
		// ScreenNodes still exist; the final shared_ptr destructor may run after those nodes are gone.
		void deactivate()
		{
			if(!active)
				return;

			active = false;
			++generation;
			subscription = {};
			for(auto &hook : hooks)
				if(hook->node->object)
					lv_obj_remove_event_cb_with_user_data(hook->node->object, event_hook, hook.get());
		}

		bool subscribe()
		{
			std::weak_ptr<ScreenBindings> weak = shared_from_this();
			subscription = data.observe(dependencies, [weak]() {
				if(auto owner = weak.lock())  owner->update();
			});
			return bool(subscription);
		}

		void activate(bool enabled)
		{
			if(!active || paused == !enabled)  return;

			paused = !enabled;
			++generation;
			subscription = {};
			if(enabled)
			{
				for(auto &rule : rules)
					rule->force = true;
				if(!subscribe())  data.binding_error("binding_subscription");

				update();
			}
		}

		void force(ScreenNode *node)
		{
			if(!active || paused)
				return;

			for(auto &r : rules)
				if(r->node == node)
					r->force = true;

			data.request(subscription);
		}

		static void event_hook(lv_event_t *event)
		{
			auto *hook = static_cast<Hook *>(lv_event_get_user_data(event));
			auto owner = hook->owner.lock();
			if(!owner || !owner->active || owner->paused || owner->setting || !hook->node->object)
				return;

			auto code = lv_event_get_code(event);
			if(code == LV_EVENT_VALUE_CHANGED)
				owner->force(hook->node);

			if(lv_event_get_target(event) != hook->node->object)
				return;

			for(auto &rule : owner->events)
				if(rule.node == hook->node && rule.code == code)
				{
					DataValue event_value;
					const DataValue *value = nullptr;
					if(needs_event(rule.expression))
					{
						bool read = read_event_value(*rule.node, event, event_value);
						if(!owner->active || owner->paused || !rule.node->object)
							return;

						if(!read)
						{
							owner->data.binding_error("event_value_unavailable");
							continue;
						}

						value = &event_value;
					}

					std::string error;
					auto evaluated = evaluate_expression(rule.expression, owner->data, value, error);
					if(!evaluated.known)
					{
						if(!error.empty())
							owner->data.binding_error(error);

						continue;
					}

					auto weak = std::weak_ptr<ScreenBindings>(owner);
					const auto generation = owner->generation;
					auto *entry = &rule;
					auto args = std::move(evaluated.value);
					size_t bytes =
					    encode_data_value(args).size() + rule.action.size() + rule.source.size() + 64;
					owner->data.defer(
						owner, bytes,
						[weak, entry, generation, args = std::move(args)]() {
						if(auto session = weak.lock())
						{
							if(!session->active || session->paused || session->generation != generation ||
							!entry->node->object)
								return;

							std::string error;
							if(entry->navigate)
								entry->navigate();
							else if(!entry->action.empty())
								session->data.invoke(entry->action, args, error);
							else
								session->data.write(entry->source, entry->path, args, error);

							if(session->active && !session->paused && session->generation == generation)
								session->force(entry->node);
						}
					},
						error);
				}
		}

		bool format_value(Rule &r, BindingValue &value, std::string &e)
		{
			if(!r.formatted)
				return value.known;

			std::string rendered;
			auto text_option = [&](const char *k, const std::string &fallback) {
					auto i = r.format.find(k);
					return i == r.format.end() ? fallback : std::get<std::string>(i->second.value);
				};
			if(!value.known)
				rendered = text_option("unknown", "--");
			else
			{
				if(auto p = std::get_if<std::string>(&value.value.value))
					rendered = *p;
				else if(auto p = std::get_if<bool>(&value.value.value))
					rendered = *p ? "true" : "false";
				else if(std::holds_alternative<std::monostate>(value.value.value))
					rendered = "null";
				else
				{
					double n;
					if(auto p = std::get_if<int64_t>(&value.value.value))
						n = double(*p);
					else if(auto p = std::get_if<double>(&value.value.value))
						n = *p;
					else
					{
						e = "binding_format_scalar";
						return false;
					}

					std::ostringstream out;
					out.imbue(std::locale::classic());
					auto p = r.format.find("precision");
					if(p != r.format.end())
					{
						if(std::fabs(n) >= 1e21)
						{
							e = "binding_format_range";
							return false;
						}

						int precision = int(std::get<int64_t>(p->second.value));
						double scale = std::pow(10.0, precision);
						n = std::round(n * scale) / scale;
						out << std::fixed << std::setprecision(precision);
					}
					else
					{
						if(n != 0)
						{
							double scale = std::pow(10.0, 14 - std::floor(std::log10(std::fabs(n))));
							if(std::isfinite(scale) && scale > 0 && std::isfinite(n * scale))
								n = std::round(n * scale) / scale;
						}

						out << std::setprecision(15);
					}

					out << (n == 0 ? 0 : n);
					rendered = out.str();
				}

				rendered = text_option("prefix", "") + rendered + text_option("suffix", "");
			}

			if(rendered.size() > binding_contract::textBytes)
			{
				e = "binding_format_limit";
				return false;
			}

			value = {true, std::move(rendered)};
			return true;
		}

		bool update(bool strict = false)
		{
			if(!active || paused)
				return !strict;

			for(auto &r : rules)
			{
				if(!active || paused)
					return !strict;

				if(!r->node->object)
					continue;

				std::string error;
				auto v = evaluate_expression(r->expression, data, nullptr, error);
				if(!error.empty())
				{
					data.binding_error(error);
					if(strict)
						return false;

					error.clear();
				}

				if(!format_value(*r, v, error))
				{
					if(!error.empty())
						data.binding_error(error);

					if(strict && !error.empty())
						return false;

					continue;
				}

				auto bytes = encode_data_value(v.value);
				if(bytes.size() > data.limits().value_bytes)
				{
					data.binding_error("binding_argument_limit");
					if(strict)
						return false;

					continue;
				}

				if(!r->force && bytes == r->cache)
					continue;

				CborParser parser;
				CborValue cursor;
				WidgetStorage staged;
				if(cbor_parser_init(bytes.data(), bytes.size(), 0, &parser, &cursor) != CborNoError)
				{
					data.binding_error("binding_argument_cbor");
					if(strict)
						return false;

					continue;
				}

				WidgetContext context{resources, resource_count, staged, max_bytes};
				setting = true;
				bool ok = execute_bound_method(*r->node, r->method, cursor, context);
				setting = false;
				if(!active || paused)
					return !strict;

				if(!r->node->object)
					continue;

				if(!ok || cbor_value_get_next_byte(&cursor) != bytes.data() + bytes.size())
				{
					data.binding_error("binding_method_argument");
					if(strict)
						return false;

					continue;
				}

				r->storage = std::move(staged);
				r->cache = std::move(bytes);
				r->force = false;
			}
			return true;
		}

	};
	void deactivate_bindings(ScreenPlan &plan)
	{
		if(plan.bindings)
			plan.bindings->deactivate();

		plan.bindings.reset();
	}

	void activate_bindings(ScreenPlan &plan, bool active)
	{
		if(plan.bindings) { auto session = plan.bindings; session->activate(active); }
	}

	bool prepare_bindings(ScreenPlan &plan, const CborValue &map, const Resource *resources,
	    size_t resource_count, const ScreenLimits &limits, ScreenReply &reply)
	{
		auto fail = [&](const std::string &e) {
				std::snprintf(reply.error, sizeof(reply.error), "%s", e.c_str());
				return false;
			};
		DataValue::Array bindings, events;
		std::string error;
		if(!extract(map, "bindings", bindings, error) || !extract(map, "events", events, error) ||
		    bindings.size() > binding_contract::bindings || events.size() > binding_contract::events)
			return fail(error.empty() ? "bindings_array" : error);

		CborValue version;
		int64_t number;
		if(detail::field(map, "bindings_version", version))
		{
			if(!integer(version, number) || number != binding_contract::version)
				return fail("bindings_version");
		}
		else if(!bindings.empty() || !events.empty())
			return fail("bindings_version_required");

		if(bindings.empty() && events.empty())
			return true;

		if(!plan.data)
			return fail("bindings_service_unavailable");

		auto session =
		    std::make_shared<ScreenBindings>(*plan.data, resources, resource_count, limits.text_bytes);
		std::set<std::string> dependencies;
		std::set<std::pair<ScreenNode *, uint16_t> > targets;
		std::set<ScreenNode *> hooks;
		for(auto &entry : bindings)
		{
			auto name = string(field(entry, "node"));
			auto method = field(entry, "method"), value = field(entry, "value");
			auto opcode = method ? std::get_if<int64_t>(&method->value) : nullptr;
			auto node = name ? find_node(plan.root.get(), *name) : nullptr;
			if(!only(entry,
			    {"node", "method", "value", "format"}) || !node || !node->object || !opcode || *opcode < 4 ||
			    *opcode > 65535 || !value || !targets.emplace(node, uint16_t(*opcode)).second)
				return fail("binding_target");

			if(!validate_expression(*value, *plan.data, false, dependencies, error))
				return fail(error);

			auto rule = std::make_unique<ScreenBindings::Rule>();
			rule->node = node;
			rule->method = uint16_t(*opcode);
			rule->expression = *value;
			if(auto f = field(entry, "format"))
			{
				if(!only(*f, {"precision", "prefix", "suffix", "unknown"}))
					return fail("binding_format");

				rule->formatted = true;
				rule->format = std::get<DataValue::Object>(f->value);
				for(const auto &x : rule->format)
				{
					if(x.first == "precision")
					{
						auto n = std::get_if<int64_t>(&x.second.value);
						if(!n || *n < 0 || *n > 6)
							return fail("binding_precision");
					}
					else
					{
						auto s = std::get_if<std::string>(&x.second.value);
						if(!s || s->size() > 128)
							return fail("binding_format_text");
					}
				}
			}

			hooks.insert(node);
			session->rules.push_back(std::move(rule));
		}
		for(auto &entry : events)
		{
			auto name = string(field(entry, "node")), event = string(field(entry, "event"));
			auto node = name ? find_node(plan.root.get(), *name) : nullptr;
			if(!node || !node->object || !event || event_code(*event) == LV_EVENT_ALL)
				return fail("event_target");

			ScreenBindings::Event rule;
			rule.node = node;
			rule.code = event_code(*event);
			if(auto target = field(entry, "navigate"))
			{
				auto view = string(field(*target, "view")), screen = string(field(*target, "screen"));
				if(!only(entry, {"node", "event", "navigate"}) || !only(*target, {"view", "screen"}) ||
				    !view || !screen || !detail::field(map, "views_version", version))
					return fail("event_navigate");

				rule.navigate = navigation(plan, *node, *view, *screen, error);
				if(!rule.navigate || !node->object)  return fail(error.empty() ? "event_target_deleted" : error);

				rule.expression = DataValue::Object{{"literal", nullptr}};
			}
			else if(auto action = string(field(entry, "action")))
			{
				if(!only(entry, {"node", "event", "action", "args"}) || !plan.data->action(*action))
					return fail("event_action");

				rule.action = *action;
				if(auto args = field(entry, "args"))
					rule.expression = *args;
				else
					rule.expression = DataValue::Object{{"literal", nullptr}};
			}
			else
			{
				auto write = field(entry, "write"), value = field(entry, "value");
				auto source = write ? string(field(*write, "source")) : nullptr;
				if(!only(entry, {"node", "event", "write", "value"}) || !write ||
				    !only(*write, {"source", "path"}) || !source || !value)
					return fail("event_write");

				auto descriptor = plan.data->source(*source);
				if(!descriptor || !descriptor->write)
					return fail("event_read_only");

				rule.source = *source;
				if(auto path = field(*write, "path"))
					if(!binding_path(*path, rule.path, error))
						return fail(error);

				if(!data_schema_path(descriptor->schema, rule.path))
					return fail("event_write_path");

				rule.expression = *value;
			}

			if(!validate_expression(rule.expression, *plan.data, true, dependencies, error) ||
			    (needs_event(rule.expression) && !event_reader_available(*node)))
				return fail(error.empty() ? "event_value_unavailable" : error);

			hooks.insert(node);
			session->events.push_back(std::move(rule));
		}
		session->dependencies.assign(dependencies.begin(), dependencies.end());
		if(!session->subscribe())
			return fail("binding_subscription");

		for(auto *node : hooks)
		{
			auto hook = std::make_unique<ScreenBindings::Hook>();
			hook->node = node;
			hook->owner = session;
			lv_obj_add_event_cb(node->object, ScreenBindings::event_hook, LV_EVENT_ALL, hook.get());
			session->hooks.push_back(std::move(hook));
		}
		plan.bindings = session;
		if(!session->update(true))
		{
			deactivate_bindings(plan);
			return fail("binding_initial_argument");
		}

		return true;
	}

} // namespace lvgl_cbor::detail
