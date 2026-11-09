// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#include "screen_views.hpp"
#include "cbor_reader.hpp"
#include "lvgl_cbor/data_registry.hpp"
#include <algorithm>
#include <cstdio>
#include <limits>

namespace lvgl_cbor::detail
{
	namespace
	{
		constexpr size_t none = std::numeric_limits<size_t>::max();
		const DataValue *get(const DataValue &v, const char *name)
		{
			auto o = std::get_if<DataValue::Object>(&v.value);
			if(!o)  return nullptr;

			auto it = o->find(name);
			return it == o->end() ? nullptr : &it->second;
		}

		const std::string *str(const DataValue *v)
		{
			return v ? std::get_if<std::string>(&v->value) : nullptr;
		}

		bool keys(const DataValue &v, std::initializer_list<const char *> allowed)
		{
			auto o = std::get_if<DataValue::Object>(&v.value);
			if(!o)  return false;

			for(const auto &x : *o)
				if(std::none_of(allowed.begin(), allowed.end(), [&](const char *k) {
					return x.first == k;
				}))
					return false;

			return true;
		}

		ScreenNode *node_at(ScreenNode *n, const std::string &id)
		{
			if(!n)  return nullptr;

			if(n->id == id)  return n;

			for(auto &child : n->children)
				if(auto *found = node_at(child.get(), id))  return found;

			return nullptr;
		}

		bool fail(ScreenReply &reply, const char *error)
		{
			std::snprintf(reply.error, sizeof(reply.error), "%s", error);
			return false;
		}

	} // namespace

	struct ScreenViews : std::enable_shared_from_this<ScreenViews> {
		enum class Retention { Release, Cache, Retain };
		struct Page {
			std::string screen;
			Retention retention = Retention::Release;
			std::unique_ptr<ScreenRuntime> runtime;
			uint64_t used{};
		};
		struct Slot {
			ScreenNode *node{};
			bool fill = true;
			std::vector<Page> pages;
			size_t selected = none;
			lv_obj_t *placeholder{};
			std::string error;
		};
		struct Button { ScreenNode *node; size_t slot, page; };
		ScreenRuntime *owner;
		std::string screen;
		std::shared_ptr<CompositionState> state;
		std::vector<std::unique_ptr<Slot> > slots;
		std::vector<Button> buttons;
		bool alive = true;
		bool navigating{};
		explicit ScreenViews(ScreenRuntime &runtime, std::string name)
		  : owner(&runtime), screen(std::move(name)), state(runtime.composition_)
		{
			state->owners.insert(this);
		}

		~ScreenViews()
		{
			deactivate();
		}

		static void placeholder_deleted(lv_event_t *event)
		{
			static_cast<Slot *>(lv_event_get_user_data(event))->placeholder = nullptr;
		}

		void clear_placeholder(Slot &slot)
		{
			if(!slot.placeholder)  return;

			lv_obj_remove_event_cb_with_user_data(slot.placeholder, placeholder_deleted, &slot);
			lv_obj_delete(slot.placeholder);
			slot.placeholder = nullptr;
		}

		void deactivate()
		{
			if(!alive)  return;

			alive = false;
			state->owners.erase(this);
			for(auto &slot : slots)
			{
				for(auto &page : slot->pages)
					page.runtime.reset();
				clear_placeholder(*slot);
			}
			owner = nullptr;
		}

		void selected_buttons(size_t slot_index)
		{
			for(auto &button : buttons)
			{
				if(!alive)  return;

				if(button.slot == slot_index && button.node->object)
					lv_obj_set_state(button.node->object, LV_STATE_CHECKED,
					    slots[slot_index]->selected == button.page);
			}
		}

		bool resolves(const std::string &name) const
		{
			const uint8_t *packet{}; size_t length{};
			return owner->resolver_ && owner->resolver_->resolve_screen(name, packet, length);
		}

		void changed()
		{
			if(alive && owner->resolver_)  owner->resolver_->composition_changed();
		}

		static Page *oldest_cache(CompositionState &state, size_t &count)
		{
			Page *oldest = nullptr;
			count = 0;
			for(auto *views : state.owners)
				for(auto &slot : views->slots)
					for(size_t i = 0; i < slot->pages.size(); ++i)
					{
						auto &page = slot->pages[i];
						if(i != slot->selected && page.runtime && page.retention == Retention::Cache)
						{
							++count;
							if(!oldest || page.used < oldest->used)  oldest = &page;
						}
					}
			return oldest;
		}

		void trim(bool room = false)
		{
			for(;;)
			{
				size_t count;
				auto *page = oldest_cache(*state, count);
				if(!page || (count <= state->limits.inactive_cache &&
				    (!room || state->instances < state->limits.instances))) return;

				page->runtime.reset();
				if(!alive)  return;
			}
		}

		bool show_error(Slot &slot, const char *message, ScreenReply &reply)
		{
			slot.error = message;
			fail(reply, message);
			if(slot.node->object)
			{
				slot.placeholder = lv_label_create(slot.node->object);
				if(!alive || !slot.placeholder)  return false;

				lv_obj_add_event_cb(slot.placeholder, placeholder_deleted, LV_EVENT_DELETE, &slot);
				lv_label_set_text(slot.placeholder, LV_SYMBOL_CLOSE);
				lv_obj_set_style_text_color(slot.placeholder, lv_color_hex(0xff3030), LV_PART_MAIN);
				lv_obj_center(slot.placeholder);
				if(state->layout_debug && state->layout_debug->enabled) state->layout_debug->apply(slot.placeholder);
			}

			changed();
			return false;
		}

		bool show(size_t slot_index, size_t page_index, ScreenReply &reply,
		    const std::vector<ScreenViewSelection> &selections = {})
		{
			reply = {};
			if(!alive || !owner->active() || slot_index >= slots.size())
				return fail(reply, "view_inactive");

			if(navigating)  return fail(reply, "runtime_busy");

			navigating = true;
			++state->operations;
			struct Operation {
				std::shared_ptr<CompositionState> state;
				bool &navigating;
				~Operation()
				{
					--state->operations; navigating = false;
				}

			} operation{state, navigating};
			auto &slot = *slots[slot_index];
			if(!slot.node->object || page_index >= slot.pages.size())
				return fail(reply, "view_target");

			if(slot.selected == page_index && slot.pages[page_index].runtime &&
			    slot.pages[page_index].runtime->root()) { reply.ok = true; return true; }

			const auto previous = slot.selected;
			slot.selected = page_index;
			if(previous != none)
			{
				auto &old = slot.pages[previous];
				if(old.runtime)
				{
					old.runtime->set_active(false);
					if(!alive || !slot.node->object)  return false;

					if(old.retention == Retention::Release)  old.runtime.reset();
					else if(old.runtime->root())
					{
						lv_obj_add_flag(old.runtime->root(), LV_OBJ_FLAG_HIDDEN);
						old.used = ++state->clock;
					}
				}
			}

			clear_placeholder(slot);
			slot.error.clear();
			selected_buttons(slot_index);
			if(!alive || !slot.node->object)  return false;

			auto &page = slot.pages[page_index];
			if(!page.runtime || !page.runtime->root())
			{
				page.runtime.reset();
				if(page.screen == screen || std::find(owner->ancestors_.begin(), owner->ancestors_.end(),
				    page.screen) != owner->ancestors_.end())
					return show_error(slot, "composition_cycle", reply);

				if(owner->composition_depth_ >= state->limits.depth)
					return show_error(slot, "composition_depth", reply);

				trim(true);
				if(!alive)  return false;

				if(state->instances >= state->limits.instances)
					return show_error(slot, "composition_instances", reply);

				const uint8_t *packet{}; size_t length{};
				if(!owner->resolver_ || !owner->resolver_->resolve_screen(page.screen, packet, length))
					return show_error(slot, "view_screen_not_found", reply);

				if(!alive || !slot.node->object)  return false;

				page.runtime = owner->make_child(screen);
				if(!page.runtime->replace(packet, length, slot.node->object, false, reply, selections))
				{
					const std::string error = reply.error;
					page.runtime.reset();
					return show_error(slot, error.c_str(), reply);
				}
			}

			if(!alive || !slot.node->object)  return false;

			page.runtime->set_active(true);
			if(!alive || !slot.node->object || !page.runtime->root())  return false;

			if(slot.fill)  lv_obj_set_size(page.runtime->root(), lv_pct(100), lv_pct(100));

			lv_obj_remove_flag(page.runtime->root(), LV_OBJ_FLAG_HIDDEN);
			page.used = ++state->clock;
			trim();
			if(!alive)  return false;

			selected_buttons(slot_index);
			changed();
			reply.ok = true;
			return true;
		}

		void activate(bool enabled)
		{
			for(auto &slot : slots)
			{
				if(!alive)  return;

				if(slot->selected != none)
				{
					auto &page = slot->pages[slot->selected];
					if(page.runtime)  page.runtime->set_active(enabled);
				}
			}
		}

	};

	std::shared_ptr<CompositionState> composition_state(CompositionLimits limits)
	{
		auto state = std::make_shared<CompositionState>();
		limits.depth = std::max(size_t(1), std::min(limits.depth, size_t(composition_contract::maxDepth)));
		limits.instances = std::max(size_t(1), std::min(limits.instances, size_t(composition_contract::maxInstances)));
		limits.inactive_cache = std::min(limits.inactive_cache, size_t(composition_contract::inactiveCache));
		state->limits = limits;
		return state;
	}

	bool prepare_views(ScreenPlan &plan, const CborValue &map, ScreenRuntime &runtime, ScreenReply &reply,
	    const std::vector<ScreenViewSelection> &selections)
	{
		CborValue version, entries;
		const bool has_version = field(map, "views_version", version);
		int64_t number;
		if(has_version && (!integer(version, number) || number != composition_contract::version))
			return fail(reply, "views_version");

		if(!field(map, "views", entries))  return true;

		if(!has_version)  return fail(reply, "views_version_required");

		if(!cbor_value_is_array(&entries))  return fail(reply, "views_array");

		auto end = entries;
		const auto *start = cbor_value_get_next_byte(&entries);
		if(cbor_value_advance(&end) != CborNoError)  return fail(reply, "views_array");

		DataValue decoded; std::string error;
		if(!decode_data_value(start, size_t(cbor_value_get_next_byte(&end) - start), decoded, error,
		    screen_packet_bytes)) return fail(reply, "views_array");

		auto array = std::get_if<DataValue::Array>(&decoded.value);
		if(!array)  return fail(reply, "views_array");

		auto views = std::make_shared<ScreenViews>(runtime, plan.id);
		std::set<ScreenNode *> unique;
		std::vector<size_t> initials;
		std::vector<const ScreenViewSelection *> restored;
		for(const auto &entry : *array)
		{
			auto name = str(get(entry, "node")), initial = str(get(entry, "initial")),
			    sizing = str(get(entry, "sizing"));
			auto *node = name ? node_at(plan.root.get(), *name) : nullptr;
			auto pages = get(entry, "pages");
			auto page_array = pages ? std::get_if<DataValue::Array>(&pages->value) : nullptr;
			if(!keys(entry, {"node", "pages", "initial", "sizing"}) || !node || !initial ||
			    !page_array || page_array->empty() || !unique.insert(node).second ||
			    (get(entry, "sizing") && (!sizing || (*sizing != "fill" && *sizing != "design"))))
				return fail(reply, "view_definition");

			auto slot = std::make_unique<ScreenViews::Slot>();
			slot->node = node; slot->fill = !sizing || *sizing == "fill";
			std::set<std::string> names; size_t selected = none;
			for(const auto &item : *page_array)
			{
				auto screen = str(get(item, "screen")), retention = str(get(item, "retention"));
				if(!keys(item, {"screen", "retention"}) || !screen || screen->empty() ||
				    !names.insert(*screen).second ||
				    (get(item, "retention") && (!retention || (*retention != "release" &&
				    *retention != "cache" && *retention != "retain")))) return fail(reply, "view_page");

				ScreenViews::Page page; page.screen = *screen;
				if(retention && *retention == "cache")  page.retention = ScreenViews::Retention::Cache;

				if(retention && *retention == "retain")  page.retention = ScreenViews::Retention::Retain;

				if(*screen == *initial)  selected = slot->pages.size();

				slot->pages.push_back(std::move(page));
			}
			if(selected == none)  return fail(reply, "view_initial");

			const ScreenViewSelection *selection = nullptr;
			for(const auto &candidate : selections)
				if(candidate.node == slot->node->id)
					for(size_t i = 0; i < slot->pages.size(); ++i)
						if(slot->pages[i].screen == candidate.screen)
						{
							if(views->resolves(candidate.screen))
							{
								selected = i; selection = &candidate;
							}
						}

			initials.push_back(selected); restored.push_back(selection); views->slots.push_back(std::move(slot));
		}
		plan.views = views;
		for(size_t i = 0; i < initials.size(); ++i)
		{
			ScreenReply initial;
			views->show(i, initials[i], initial,
			    restored[i] ? restored[i]->children : std::vector<ScreenViewSelection>{});
			// A failed page is represented by the selected error view.
			if(!views->alive)  return fail(reply, "view_owner_deleted");
		}
		return true;
	}

	void deactivate_views(ScreenPlan &plan)
	{
		if(plan.views)  plan.views->deactivate();

		plan.views.reset();
	}

	void activate_views(ScreenPlan &plan, bool active)
	{
		if(plan.views) { auto views = plan.views; views->activate(active); }
	}

	std::function<void()> navigation(ScreenPlan &plan, ScreenNode &node, const std::string &view,
	    const std::string &screen, std::string &error)
	{
		if(plan.views)
		{
			auto owner = plan.views;
			for(const auto &button : owner->buttons)
				if(button.node == &node) { error = "navigate_duplicate"; return {}; }

			for(size_t i = 0; i < owner->slots.size(); ++i)
				if(owner->slots[i]->node->id == view)
					for(size_t p = 0; p < owner->slots[i]->pages.size(); ++p)
						if(owner->slots[i]->pages[p].screen == screen)
						{
							owner->buttons.push_back({&node, i, p}); owner->selected_buttons(i);
							std::weak_ptr<ScreenViews> weak = owner;
							return [weak, i, p]() {
									   if(auto live = weak.lock())
									   {
										   ScreenReply r; live->show(i, p, r);
									   }
							};
						}
		}

		error = "navigate_target"; return {};
	}

	bool navigate_view(ScreenPlan &plan, const char *view, const char *screen, ScreenReply &reply)
	{
		auto owner = plan.views;
		if(owner && view && screen)
			for(size_t i = 0; i < owner->slots.size(); ++i)
				if(owner->slots[i]->node->id == view)
					for(size_t p = 0; p < owner->slots[i]->pages.size(); ++p)
						if(owner->slots[i]->pages[p].screen == screen)  return owner->show(i, p, reply);

		return fail(reply, "navigate_target");
	}

	lv_obj_t *find_view_instance(const ScreenPlan &plan, uint32_t instance, const char *id)
	{
		if(plan.views)
			for(const auto &slot : plan.views->slots)
				for(const auto &page : slot->pages)
					if(page.runtime)
						if(auto *found = page.runtime->find(instance, id))  return found;

		return nullptr;
	}

	std::vector<ScreenViewSelection> collect_view_selections(const ScreenPlan &plan)
	{
		std::vector<ScreenViewSelection> out;
		if(!plan.views || !plan.views->alive)  return out;

		for(const auto &slot : plan.views->slots)
			if(slot->selected != none)
			{
				const auto &page = slot->pages[slot->selected];
				ScreenViewSelection selection{slot->node->id, page.screen, {}};
				if(page.runtime)  selection.children = page.runtime->view_selections();

				out.push_back(std::move(selection));
			}

		return out;
	}

	void collect_view_status(const ScreenPlan &plan, std::vector<ScreenViewStatus> &out)
	{
		if(!plan.views || !plan.views->alive)  return;

		for(const auto &slot : plan.views->slots)
		{
			ScreenViewStatus status; status.instance = plan.views->owner->instance_id();
			status.node = slot->node->id; status.error = slot->error;
			if(slot->selected != none)
			{
				const auto &page = slot->pages[slot->selected]; status.selected = page.screen;
				if(page.runtime)  status.page_instance = page.runtime->instance_id();
			}

			out.push_back(std::move(status));
			for(const auto &page : slot->pages)
				if(page.runtime)
				{
					auto nested = page.runtime->view_status(); out.insert(out.end(), nested.begin(), nested.end());
				}
		}
	}

} // namespace lvgl_cbor::detail
