// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "screen_contract.hpp"
#include "style_runtime.hpp"
#include "widget_registry.hpp"
#include "composition_contract.hpp"
#include <memory>
#include <string>
#include <vector>
namespace lvgl_cbor
{
	namespace detail { struct CompositionState; struct ScreenViews; }
	class DataRegistry;
	// Set by the application from packet provenance, never by a wire field.
	enum class ScreenValidation { Checked, TrustedEmbedded };
	class ScreenResolver
	{
	public:
		virtual ~ScreenResolver() = default;
		virtual bool resolve_screen(const std::string &, const uint8_t *&, size_t &) const = 0;
		virtual void composition_changed()
		{
		}

		virtual bool resolve_screen(const std::string &name, const uint8_t *&bytes, size_t &size,
		    ScreenValidation &validation) const
		{
			validation = ScreenValidation::Checked;
			return resolve_screen(name, bytes, size);
		}

	};
	struct CompositionLimits {
		size_t depth = composition_contract::maxDepth, instances = composition_contract::maxInstances,
		    inactive_cache = composition_contract::inactiveCache;
	};
	struct ScreenViewStatus {
		uint32_t instance{}, page_instance{};
		std::string node, selected, error;
	};
	// Stable ownership path: a view node and its selected named page, independent of runtime IDs.
	struct ScreenViewSelection {
		std::string node, screen;
		std::vector<ScreenViewSelection> children;
	};
	struct ScreenReply {
		char id[48]{}, node[64]{}, error[160]{};
		bool ok{};
		unsigned nodes{}, styles{}, methods{};
		uint16_t opcode{};
	};
	struct ScreenLimits {
		size_t packet_bytes = screen_packet_bytes, nodes = screen_max_nodes, depth = screen_max_depth,
		    styles = screen_max_styles, text_bytes = screen_text_bytes;
	};
// Declared keeps the device-size check. Display uses the current host viewport
// for a standalone root; child views keep their existing fill/declared policy.
	enum class ScreenViewport { Declared, Display };
	inline uint32_t layout_debug_color(size_t depth)
	{
		// Red, orange, yellow, green, cyan, blue, violet.
		constexpr uint32_t colors[] = {0xff3030, 0xff9000, 0xffdf00, 0x30d050, 0x20cfff, 0x4070ff, 0xb050ff};
		return colors[depth % 7];
	}

	struct LayoutDebugLevel {
		bool outline = false, digit = false;
		uint32_t outline_color, digit_color;
		explicit LayoutDebugLevel(size_t depth = 0)
		  : outline_color(layout_debug_color(depth)), digit_color(layout_debug_color(depth))
		{
		}

	};
	struct LayoutDebugOptions {
		uint8_t opacity = 192, outline_width = 3;
		bool layout_type = false;
		std::vector<LayoutDebugLevel> levels;
	};

// Independent instances; no global mutable dispatch/parser state. All LVGL operations and
// destruction must be serialized in the application's UI context. Resource pointers outlive every
// mounted instance.
	class ScreenRuntime
	{
	public:
		explicit ScreenRuntime(const Resource *resources = nullptr, size_t resource_count = 0,
		    ScreenLimits limits = {}, StyleService *service = nullptr,
		    ScreenStyleRetention retention = ScreenStyleRetention::Release,
		    WidgetRegistry *registry = nullptr, DataRegistry *data = nullptr,
		    ScreenResolver *resolver = nullptr, CompositionLimits composition = {},
		    ScreenViewport viewport = ScreenViewport::Declared);
		~ScreenRuntime();
		ScreenRuntime(const ScreenRuntime &) = delete;
		ScreenRuntime &operator=(const ScreenRuntime &) = delete;
		// Prepare then activate a standalone screen; failure preserves the old instance.
		bool load(const uint8_t *packet, size_t length, ScreenReply &reply,
		    const std::vector<ScreenViewSelection> &selections = {});
		bool load(const uint8_t *packet, size_t length, ScreenReply &reply,
		    const std::vector<ScreenViewSelection> &selections, ScreenValidation validation);
		// Same description can be instantiated repeatedly in different runtimes/parents. No global ID
		// map.
		bool mount(const uint8_t *packet, size_t length, lv_obj_t *parent, ScreenReply &reply);
		void unload();
		lv_obj_t *root() const;
		// UI-context only. Shared by mounted child pages; never changes project descriptions.
		void set_layout_debug(bool enabled);
		bool layout_debug() const;
		void set_layout_debug_options(const LayoutDebugOptions &);
		size_t layout_debug_max_depth() const;

		lv_obj_t *find(const char *id) const;
		lv_obj_t *find(uint32_t instance, const char *id) const;
		uint32_t instance_id() const
		{
			return instance_id_;
		}

		std::vector<ScreenViewStatus> view_status() const;
		std::vector<ScreenViewSelection> view_selections() const;
		bool navigate(const char *view, const char *screen, ScreenReply &);
		void set_active(bool);
		bool active() const
		{
			return active_;
		}

		bool busy() const;
		std::shared_ptr<StyleScope> style_scope() const;

	private:
		struct Impl;
		std::unique_ptr<StyleService> owned_service_;
		StyleService *service_;
		ScreenStyleRetention retention_;
		std::unique_ptr<Impl> impl_;
		const Resource *resources_;
		size_t resource_count_;
		ScreenLimits limits_;
		ScreenViewport viewport_;
		WidgetRegistry *registry_;
		DataRegistry *data_;
		lv_obj_t *fallback_{};
		bool busy_{};
		bool active_ = true;
		uint32_t instance_id_{};
		size_t composition_depth_ = 1;
		ScreenResolver *resolver_{};
		std::shared_ptr<detail::CompositionState> composition_;
		std::vector<std::string> ancestors_;
		std::unique_ptr<ScreenRuntime> make_child(const std::string &);
		friend struct detail::ScreenViews;
		bool replace(const uint8_t *, size_t, lv_obj_t *, bool, ScreenReply &,
		    const std::vector<ScreenViewSelection> &selections = {},
		    ScreenValidation validation = ScreenValidation::Checked);
		static void root_deleted(lv_event_t *);
		static void release_deleted(void *);
		static void fallback_deleted(lv_event_t *);
		void forget_fallback();
	};
} // namespace lvgl_cbor
