# Current architectural direction

Owner decision 2026-10-23: a page instance owns its objects, bindings/events and child page instances. Any page may be composed inside a local node view; project references form a graph while live instances form an ownership tree. Reuse ScreenRuntime/cursor v3 and the application DataRegistry, with release/cache/retain policies and paused inactive bindings. Sources own latest snapshots and any bounded measurement history. Full project load/preview replaces the composition/cache; save remains non-visual. Explicit ProjectService refresh rebuilds the saved displayed root and restores only valid active view selections by local node IDs and selected screen names along the ownership tree. Runtime instance IDs, widget state and inactive caches are not transferred. Removed routes use new defaults; explicit load/preview still starts from declared defaults. Do not add revision-keyed caches, automatic memory policies or special shell widgets. Read docs/readme_page_composition_ru.md and ADR_20261023_page-composition.md.

Owner storage addition 2026-10-22: the S3 example keeps a ROM TPMS/GPS base and one CatalogProjectStore on the last 4 MiB of its 16 MiB flash. The portable lvgl-project-catalog-1 index discovers independent compiled screen/style packets by name and exposes origin/location/size through ProjectService status. Mounting, provisioning and media paths belong to the application. Two banks publish their catalog last; ordinary app updates preserve storage. Demo values are labelled; actual TPMS/GNSS bindings remain deferred. Read docs/readme_project_storage_ru.md and ADR_20261022_project-catalog.md.

Owner decision 2026-10-22: ProjectService is the high-level firmware entry point for named screen loading and project storage. Base source plus one optional changes store; media, paths and replacement/addition/removal policy are configured by the application. Whole JSON/CBOR project files use common PC codecs. Optional HTTP and host MCP adapters share the project contract. Preview never saves, explicit save never switches the LCD. Connecting is passive. Project settings are shown only on the Project overview. Read docs/readme_projects_ru.md and ADR_20261022_project-service.md.

Owner requirement 2026-10-22: the editor is general-purpose. Native demo components must not shape its UI or introduce special cases. Discover native types and construct their method controls from device catalog metadata using shared parameter schemas and forms. Names and IDs identify registrations, not editor branches. Keep example implementations and fixtures in optional demo modules; adding a native component with supported parameter shapes must not require editor changes. Improvements to insertion, selection, layout and method editing must apply to components generally, without privileged placement or dedicated controls for a named demo.

Owner request 2026-10-22: keep editor extensions modular. File IO and CSS are independent browser/Node packages with shared codec validation; their UI modules can be excluded at build time. MCP is an optional host-side stdio adapter using the same codecs and the device HTTP/CBOR API, with no SDK dependency in firmware or browser builds. The S3 demo can exclude embedded editor assets entirely. Read docs/readme_modules_files_css_mcp_ru.md for switches, actual capabilities and limits.

Latest owner decision 2026-10-22 supersedes the earlier widget pointer-array design: screen ABI v3 uses opcode 0 creation, common commands 1..255 and component-local methods 256..65535. Creation selects the handler; nested arrays execute by cursor in wire order without a decoded command tree. Styles retain v2 pointer arrays and an independent executor. Native components still register at runtime. Read docs/readme_fast_executor_ru.md and ADR_20261022_cursor-component-executor-v3.md. Earlier ADRs remain historical.

Owner-authorized implementation 2026-10-22: read docs/readme_runtime_services_ru.md and docs/adr/ADR_20261022_lvgl-cbor_capabilities-style-service-roundtrip.md. The editor obtains firmware capabilities, shares validation with bidirectional codecs, and composes modular controllers. One application-owned StyleService serves static/dynamic globals, independent screen scopes and local node styles. Release is the default; cache retention/eviction are explicit. This supersedes the earlier prohibition on additional style tiers. There is no process-wide service singleton. Memory profiling and automatic low-memory policies remain deferred.

Owner-authorized bindings/events implementation 2026-10-22 supersedes the earlier deferral. Read docs/readme_bindings_ru.md and ADR_20261022_data-bindings-events.md. Application-owned DataRegistry advertises fixed symbolic typed sources and actions; values may be scalars, objects or bounded arrays. Publish owned snapshots and flush once on the UI task. Screen subscriptions and persistent application demand have separate RAII lifetimes. Unknown/stale values remain explicit. Hardware acceptance is recorded separately from native tests.

LV_USE_OBJ_PROPERTY_NAME stays disabled. Binding methods use the existing component-local/common numeric command dispatch; binding expressions are bounded data expressions, not executable application scripts. Common commands 10/11 append state/flag changes without renumbering 0..9. Conditional styling uses existing LVGL states/selectors. Instances may be nested via mount; LVGL calls remain serialized in the UI context. No global mutable parser or ID map; style ownership is explicit through an application-owned StyleService. Same-instance recursive replacement returns runtime_busy. Preserve symbolic application data/resource/node identities and the existing shared-style ABI.

Historical owner refinement 2026-10-21 (tier detail superseded on 2026-10-22): named style references use global and per-screen namespaces. Storage/replacement policy belongs to this project, not LVGL. The first runtime replaces a complete named style in a stable slot; its limits and remaining screen lifecycle work are documented in the style protocol. Do not introduce per-style garbage collection, extra ownership categories or arbitrary dependency chains without a demonstrated need. Per-screen named styles are distinct from LVGL per-object local style properties.

Owner addition 2026-10-21: include lv_style_copy and lv_style_merge in named style composition. ABI v1 implements copy -> ordered merge -> own properties; see docs/readme_style_protocol_ru.md. Copy/merge create no live source-style inheritance; distinguish them from attaching multiple independent styles to a widget. Do not infer automatic propagation through copied styles.

The editor discovers data, path schemas, writable sources, actions and event-value schemas from firmware metadata and uses shared codec validation and generic forms. It must contain no source-name or demo-component branches. Offline editing preserves and validates expressions against the bundled structural contract, without asserting device compatibility. Event callbacks enqueue owned values; actions/writes execute after callbacks and cancel on node/screen teardown. Programmatic binding updates suppress feedback. Failed/asynchronous writes reconcile visible state to the last committed application value.

The owner endorsed message-driven bindings as a working development option, not a final schema: see docs/ideas/IDEA_20261020_lvgl-cbor_event-message-bindings.md. A configured application queue/stream supplies CBOR payloads; JSON is an optional input alternative under discussion. Keep UI construction useful independently of bindings. A fixed symbolic capability registry and extraction from transient messages do not require one persistent Subject per field. Do not assume competing queue consumers provide broadcast semantics.

The intended pipeline is editable JSON -> CBOR -> decoder -> UI description executor -> LVGL objects and data bindings. Application map keys and identifiers remain UTF-8 strings. Numeric values remain native CBOR numbers; this does not introduce numeric field IDs.

The application provides data sources, allowed actions, LVGL initialization and resource access. Loading a description can compose new screens from available widgets and capabilities; it does not introduce new native executable code.

The S3 example pins LVGL 9.6.0 and espressif/cbor 0.6.1~4. LVGL XML is a comparison/reference candidate, not an adopted engine; XML is disabled. Numeric style operation keys are owner-authorized under the versioned shared-family contract. Application/binding identifiers remain symbolic. Do not renumber ABI v1 when sorting reference tables.

The core has no ESP dependencies beyond its example integration and uses LVGL/TinyCBOR. Owner refinement 2026-10-23: domain libraries own their adapters and examples. This UI project does not contain a Bluetooth scanner, transport implementation or dependency. Generic DataRegistry and UI bindings/events remain domain-independent. Broader widget coverage, patches, automatic repeated rows and a scripting language remain outside this implementation. Do not promise universal portability, zero heap or specific resource savings before verification.

Owner decision 2026-11-07: extend the existing DataRegistry with groups, descriptive
field/source/action metadata and bounded selective queries. One registry owns typed
snapshots; immutable DataView records cross to HTTP. MCP wraps the existing data and
project API, with compact discovery by default. DataHistory is an optional manually
ticked module; it owns bounded rings and publishes ordinary readonly sources. Page
pause does not pause data acquisition. Reverse events remain normal, with per-source
writability and no new global event-disable flag. Styling discovery and ordered
multiple style references must support full project redesign, including user schemes
through MCP. See docs/readme_data_catalog_ru.md and ADR_20261107_data-catalog-history.md.
Owner request 2026-11-08: the first MAUI Windows/Android designer now composes SPLA Agent, OpenAI-compatible/OpenRouter and MCP client libraries through ProjectReference. SPLA remains unchanged. Presentation is Blazor Hybrid; local chat history is in-memory. Voice input and direct MCU HTTP MCP remain plans. See docs/readme_maui_designer_ru.md.

Owner decision 2026-11-07: all product and acceptance-test networking uses
NaWServer, including Windows. The native player links the Windows backend and
serves built frontend assets plus HTTP/WS API from one origin. Short callbacks
serialize LVGL using lv_lock; bounded data commands run in the UI polling cycle.
ProjectService/DataRegistry/StyleService/FileProjectStore retain their responsibilities.
Host tools compile JSON/CBOR, build frontend and expose stdio MCP. The MAUI development target also has a separate native NaWServer Streamable HTTP MCP gateway reusing the same SDK handlers over private pipes. It forwards to the independently running player API; it does not add a second project/codec implementation. See
AGENTS.md and docs/readme_windows_api_ru.md. No parallel HTTP listener is permitted.

Owner refinement 2026-11-09: diagnostic controls stay visible in two aligned rows,
with independent per-depth outline/digit flags and RGB colors (rainbow defaults).
Outline width defaults to 3px, configurable. A lazy composition-owned style per
active depth uses shared 16x16 A1 masks (ten masks = 320 bytes of mask data), with
opacity for digits. No overlay/custom draw callbacks or project/schema mutation.
ScreenRuntime/ProjectService preserve transient options across page load/refresh.
One ui.layout_debug registry object and ui.layout_debug_options action feed MAUI
through SPLA MCP. No extra API/codec/registry capacity. Dynamic depth metadata is
read on frame capture/configuration, not display draw. Normal style priorities and
custom-widget drawing apply. polygon_button uses outline but not background images.
An isolated repro confirms LVGL software A8 tiled-image clipping overrun; no vendor
renderer fix was made. See docs/readme_layout_debug_ru.md for evidence/limits.

Owner refinement 2026-11-09: Designer is the shipped general-purpose client in
`tools/designer`, not a device example. A single global layout_type selects a large G/F
instead of the large depth digit. Only enabled debug reads effective LVGL layout
via its public getter; lazy styles are shared by depth and encountered layout kind.
Two additional immutable A1 masks add 64 bytes (384 total). No overlay/grid renderer.

Latest owner UI refinement 2026-11-09: Designer uses a four-row diagnostic matrix
(frame switch/RGB, fill RGB/switch) with one depth header, short G/F/px/alpha labels,
and a persisted desktop splitter with a short centered two-bar grip. EN/RU .resx
localization and interface preferences belong to the MAUI presentation; SPLA
conversation/tool execution and target project/runtime contracts are unchanged.
