# NaCBORUIforLVGL: agent entry point

- Publish English documentation as `name.md` and the corresponding Russian version as `name.ru.md`. Keep the same stem in both languages and update links when renaming documents.

- Owner formatting decision 2026-10-30: maintained C/C++ uses the unchanged
  NaWServer Uncrustify profile, version 0.83.0_f. Read agents/code_style.md before
  edits and use uncrustify-check.cmd / uncrustify-apply.cmd, thin wrappers over
  tools/format_cpp.ps1. Exclude generated/vendor/SDK source and the
  retained LilyGO board adaptation. Do not apply this profile to Vue/JS/JSON.
  The previous .clang-format is inactive. Keep repository-wide formatting in a
  separate commit from functional/licensing changes; check repeat-pass stability.

- Owner decision 2026-10-30 supersedes earlier GPL-scope instructions for the
  owner's own code: all project-owned code is MIT, including his ESP32-yaidfws
  frontend/RGB adaptations previously offered under GPL. Retain third-party
  notices and exceptions in LICENSES.md. Maintained owned source headers use
  SPDX-License-Identifier: MIT and the confirmed copyright 2026 Oleg Kozhevnikov;
  do not relabel vendor/generated files, assets or strict JSON.

- Public repository: documentation, examples, fixtures and screenshots must not disclose a developer's actual network topology, host/device identifiers, credentials or personal filesystem paths. Use neutral placeholders and reserved documentation addresses. Keep original deployment evidence and environment-specific diagnostics only in ignored local storage.

- Owner authorized data bindings/events on 2026-10-22. Owner refinement 2026-10-23: Bluetooth libraries and their examples belong to their own projects, not this UI repository. Read docs/readme_bindings.ru.md and docs/adr/ADR_20261022_data-bindings-events.md; earlier binding deferrals are superseded. Application-owned DataRegistry exposes typed symbolic sources/actions. The generic editor uses those schemas; do not add Bluetooth implementations, library dependencies or scanner examples to this repository. Keep callback observations owned/bounded, serialize registry/LVGL work on the UI task, and preserve the previous full project when recompiling ABI fingerprints. Hardware flashing was authorized for this task; future unrelated flashing still needs an owner request.

- Owner decision 2026-10-22: use a whole Project JSON/CBOR document with screens, shared styles and manifest. Read docs/readme_projects.ru.md and docs/adr/ADR_20261022_project-service.md. Application-owned ProjectService loads screens by name, resolves a base plus one optional changes store, and exposes configurable storage/policy through optional HTTP/MCP adapters. Paths/media are configured in firmware code. Preview and explicit save are separate; connecting and auto-preview never persist. Project settings/file/device operations belong only on the Project page, not a permanent toolbar in every editor.

- Owner requirement 2026-10-22: build a general-purpose editor, never a UI tailored to a particular application or demo component. Native component choices, names, method IDs, parameter forms and initial dimensions come from the device catalog through shared mechanisms. Do not add dedicated controls, name/ID-based branches, special ordering or custom editor forms for radar, speedometer or another individual native component. Keep such implementations and fixtures in optional example modules. A new native component supported by the shared parameter schema must be usable through registration and metadata without changing the editor. Any missing parameter shape must extend the common schema/form mechanism rather than introduce a component-specific workaround.

- Owner refinement 2026-10-22: Project is the first standalone page. Keep project settings, whole-file operations and MCU storage/policy together there; Screens and Styles remain separate editing destinations. ProjectService reports base and changes locations, retention, permissions and application-declared media states. Never infer physical SD presence or editing permission from the hosting URL. Opening from MCU refreshes actual runtime capabilities as well as project data.

- Owner UI refinements 2026-10-22: MCU open/save commands belong at the top of the Project page as visible labelled buttons. Use visible icon buttons for tree add/remove/reorder actions. Tree context menus add components from the common catalog and attach/detach named styles; drag-and-drop changes order/parent with cycle rejection. Styles use a left-hand named list with CRUD/context actions, never the former top selector.

- Owner decision 2026-10-22 (latest): screen ABI v3 is a cursor-executed command stream. Opcode 0 creates a component and selects its native handler once; 1..255 are common commands; 256..65535 are local methods of that component. Execute nested CBOR bodies directly, with no intermediate command tree, method descriptors, signature tables or phase sorting on MCU. Styles remain ABI v2 with dense pointer arrays per signature and receive their own nested block. Preserve runtime native registration via WidgetRegistry. Screen v1/v2 wire compatibility is explicitly waived. Read docs/readme_fast_executor.ru.md and docs/adr/ADR_20261022_cursor-component-executor-v3.md.

Read agents/architecture.md and docs/README.md before changes.

- Architecture maps live in `docs/diagrams`, opened by `nacboruiforlvgl.semaps`.
  Before architectural changes, read the relevant SeMaps views and compare their
  authored responsibilities with source facts. Use MCP to edit the model, never
  edit registry/view JSON directly. Confirm `list_projects` identifies `nacborui`
  before mutations; an old session may still point to another workspace. Current
  maps are authored logical architecture, not an extracted C++ symbol graph.
  See docs/readme_semaps.ru.md for startup, MCP scopes and verification.

- Owner refinement 2026-10-22: keep code maximally modular. Each module owns one responsibility; keep App.vue as composition and presentation. Share validation and bidirectional value adapters instead of maintaining parallel implementations. Combining or deleting duplicate code while preserving behavior is encouraged.
- Owner preference 2026-10-22: evaluate proposals before adopting them, especially ideas explicitly called proposals rather than commands. Explain advantages, disadvantages, suitability and how established the approach is. Treat the suggested mechanism as a design option; distinguish it from required behavior and make a reasoned recommendation.
- The connected firmware advertises actual capabilities; the editor uses them for choices and validation. Offline editing uses the bundled contract and must not claim device compatibility.
- The style service supports static globals, dynamic globals, screen scopes and object-local styles. Screen scopes release after object teardown by default; caching is explicit and only unused entries may be evicted. Do not implement memory profiling or automatic low-memory policies in this task.

- Owner authorized the first shared-style runtime and S3 web playground on 2026-10-21. Build and test this scoped implementation. Do not flash hardware without a separate request.
- On 2026-10-21 the owner separately authorized deploying this demo to the identified S3 and testing it through the web UI; see the hardware verification report. The primary style editor must use visual controls for all properties; JSON belongs in optional diagnostic details. Preserve owner edits made through the live editor while testing.
- Work in this project; preserve neighbouring repositories and existing user changes.
- Application data and binding names remain symbolic UTF-8. The owner now authorizes numeric style-operation keys: the versioned contract in contracts/style-api-v2.json defines family-local signatures and method indices. Do not generalize these opcodes into arbitrary application-field IDs.
- New screens must be loadable at runtime without rebuilding firmware. Bindings connect to capabilities already provided by the application.
- Owner storage request 2026-10-22: keep the S3 filesystem in its final 4 MiB, preserve NVS/PHY/app offsets, and use a ROM TPMS/GPS demo plus one indexed filesystem changes layer. Discover independent screens/styles through ProjectService catalog metadata. Ordinary app updates must not reprovision the filesystem; preview/save stay separate. See docs/readme_project_storage.ru.md. Demo data is not live sensor integration.
- Separate confirmed owner requirements, proposals and measured implementation facts. Do not invent benchmark results, versions or completed features.
- Current agent rules live in agents/ in English. User-facing guides live in docs/readme_*.ru.md. Accepted ADRs are immutable; supersede them with a new ADR. Plans and ideas remain editable.
- Before creating, changing or assessing a UI, read and apply docs/ui-principles.md (the full owner UI standard), including the complete working overview requirement. Newer explicit owner instructions take precedence.
- Keep transient generated files, local credentials and build outputs out of source control. Versioned contract derivatives are reviewable source artifacts. The owner-authorized S3 demo adapts GPL-3.0-only files from ESP32-yaidfws; retain provenance and licenses. Do not extend this license to independently authored core code or copy other third-party code implicitly.
- Do not commit, push, configure remotes or publish without an owner request.
- LVGL 9.6.0 remains the target. Style v2 IDs are append-only per signature; screen v3 IDs are append-only in the common/component-local namespace. Prior screen contracts are historical. Preserve current lock files unless the owner authorizes another ABI break. Binding names remain symbolic.

## Recommended development environment (owner clarification, 2026-10-26)

The intended reproducible baseline is documented in
[docs/readme_development_environment.ru.md](docs/readme_development_environment.ru.md).
Use username-independent paths and prefer shared versioned SDKs under the chosen
PlatformIO packages directory. This is a recommendation/default, not a mandatory
machine layout or a prohibition on other explicit configurations. Alternative
paths and version profiles are allowed when deliberately configured and validated.
Do not silently change versions based on historical verification reports.
- Owner authorization 2026-10-28: for NaCBORUIforLVGL firmware work, independently build and flash the identified target, including bootloader, partition table, application and filesystem changes required by the task, without asking again. Owner explicitly declined backing up the current board in this deployment. Verify chip/MAC before writing; do not operate unrelated boards. Keep private device evidence ignored and public reports generic.

- Owner decisions 2026-11-07: implement one grouped/described DataRegistry with
  bounded selective HTTP/MCP discovery, optional application-owned history, and
  Windows validation. Reverse events remain normal; only history is optional.
  Preserve styles/multiple selector references as part of full redesign through
  existing project MCP operations, including user-authored schemes. Read
  docs/readme_data_catalog.ru.md. Android remains in plans. This iteration does
  not authorize a new hardware acceptance claim or require touching NTP.

- Owner request 2026-11-07: maintain a permanent Windows loopback HTTP API and
  project-scoped nacborui_windows MCP over existing services. Normal npm player
  enables port 5300; direct run.mjs needs --api/--api-port. Reuse ProjectService,
  DataRegistry and FileProjectStore; don't add another styling/storage engine.
  Read docs/readme_windows_api.ru.md. Keep data raw CBOR outside control framing;
  Windows persistent paths are UTF-8/wide-CRT. Never use port 443.

## Mandatory common stack — owner decision 2026-11-07

All product networking, demos and network integration/acceptance tests MUST use
our NaWServer stack on every supported platform, including Windows. This is
required at minimum for end-to-end verification of the actual shared stack.
Do not introduce alternate HTTP/WS listeners, proxies or test servers. Frontend compiler tooling and offline JSON-CBOR codecs remain host tools; they do not
serve product HTTP. Serve the built web editor through NaWServer itself.
Any obsolete alternate-server source, test fixtures and documentation must be
removed rather than retained as a fallback or historical implementation guide.

## Agent instructions and real MCP availability — owner decision 2026-11-08

Maintain prompt originals as tools/designer/prompts/assistant-*.ru.md. Keep their
English siblings (*.md) aligned; the model and MCP documentation receive English.
The documentation checker must not overwrite owner edits. Use the configured
MCP tool catalog directly; do not introduce demo/ui/assistant namespace filters
or a second host tool allowlist. Registered actions, source writability and
event validity are enforced by the existing MCP/client/application registry.

## MAUI designer — owner decision 2026-11-08

The Windows/Android application in tools/designer MUST reuse SPLA for
OpenAI-compatible/OpenRouter networking, conversation, orchestration and MCP.
Only presentation/platform storage adapters belong here. Do not change SPLA or
copy its engine sources. Until NuGet packages exist, use overridable ProjectReference
paths and route all build artifacts into this repository's ignored local directory.
Direct MCU MCP and voice input are outside this acceptance. The opt-in Windows Designer listener is documented below.
Read docs/readme_maui_designer.ru.md before changing the integration.

## No independent parallel subsystems — owner decision 2026-11-09

Reuse the project's approved stack and existing shared implementations. Do not
introduce an independent subsystem, parallel engine/client, new service or a
separate persistence mechanism on an arbitrarily chosen runtime/framework without
prior owner agreement. This applies to agent loops, LLM/OpenAI and MCP clients,
HTTP/WS servers, storage and background processes, including demos, prototypes
and experiments. A request for a feature alone does not authorize a second
implementation on a different stack.

First inspect the approved component. Extend or compose it where practical.
If another subsystem/technology is needed, explain the missing capability,
proposed boundary and reason, and obtain agreement before implementing it.
Do not use "temporary", "demo" or "test" as an exception. Routine changes within
already approved components need no additional approval.

SPLA owns Designer model/conversation/orchestration/MCP; NaWServer owns product
network listeners. Node.js remains approved for existing offline build/codecs
tooling; that is not permission to build another product/agent stack in it.
The LVGL demo is a renderer/data/MCP target, not a second LLM application.

## MCP lives inside targets only — owner mandate 2026-11-10

This overrides every older permission or description of host-side MCP adapters.
ALL MCP servers MUST be implemented INSIDE the actual firmware or demo executable,
using our NaWServer stack and existing services directly. No external MCP process,
bridge, gateway, sidecar, stdio adapter, proxy or separate listener executable.
JavaScript/Node.js plus MCP SDK servers and HTTP-to-stdio bridges are prohibited,
including prototypes, tests and temporary deployment helpers. Do not recreate them.
Designer remains an SPLA MCP HTTP CLIENT connecting directly to the target.
Node.js may compile frontend assets and run offline codecs/build tools; it MUST NOT
implement or host the product MCP service. Missing native MCP is missing functionality,
not permission to introduce a bridge. No fallback bridge instructions or launch configs.

## Designer connection modes — owner decision 2026-11-10 (latest)

This supersedes the blanket restriction above only for an explicitly configured
external MCP proxy endpoint. Implement three selectable modes behind one Designer
instrument interface: Direct API (DEFAULT), built-in target MCP, external MCP proxy.
Both MCP modes reuse the SAME SPLA HTTP MCP client; no process is launched.
Direct API executes the EXISTING shared JavaScript codecs inside BlazorWebView on
Windows/Android, without Node.js at runtime. A bounded application HttpClient
adapter provides network IO. Selecting a connection starts no proxy process or listener; the explicit Windows-only opt-in below is separate.
SPLA still owns model APIs, chat history, queue and orchestration for every mode.

Keep UI JSON parsing/compilation off the MCU in Direct API mode: the model's JSON
is validated/compiled locally, and the existing device API receives CBOR. Do NOT
rewrite codecs in C# or add a second renderer/runtime. Do NOT introduce native UI
JSON compiler code merely to support this default mode.

Native MCP is an OPTIONAL proof of concept, compiled inside the target on NaWServer.
It is not the recommended MCU default: JSON-RPC/parser/output-buffer cost must stay
optional, and disabling the feature must exclude these MCP-specific costs. Never
advertise unsupported authoring tools as implemented. External-proxy mode selects
a compatible endpoint explicitly; it does not authorize restoring the removed
Node.js/MCP SDK server, background bridge or automatic fallback. Maintain separate
mode/address settings, explicit errors and no silent rerouting. Validate on Windows
first; do not flash S3 for this iteration.

## Named connection catalog — owner refinement 2026-11-10

Designer stores a bounded catalog of named target profiles, not one global target.
Each stable-ID profile owns its mode, direct origin, native MCP URL, proxy MCP URL
and MCP server ID. Preserve/migrate the previous single connection into the first
profile. Catalog selection/editing is passive: no target save/show/preview, no
automatic reconnect. A changed active profile requires an explicit reconnect;
never send a prompt to the previous connection while showing a different target.
Model/provider configuration remains global and the key remains in SecureStorage.
Use a visible compact table/list, not a dropdown-only catalog. Profile deletion
never deletes a device project, and cancelling Settings discards draft edits.

## Model and target settings are separate — owner refinement 2026-11-10

Settings has two explicit tabs: Model and Devices. Model/provider/API key settings
are global and are saved independently from the named target catalog. Saving Model
must not rewrite connection profiles, change the selected target, clear its frame
or clear a pending reconnect. Saving Devices must not rewrite model credentials,
change the model or refresh provider metadata. Keep separate drafts and scoped
persistence/actions; switching tabs is passive and preserves unsaved edits.

## S3 layout diagnostics — owner request 2026-11-10 (latest hardware scope)

The owner now requests the existing outline/fill/depth/G-F/width/opacity diagnostic
controls on the identified 7-inch S3. This explicitly supersedes the earlier
no-S3 restriction only for that feature and its bounded real-frame transport.
Reuse shared LayoutDebugOptions/runtime styles and DataRegistry CBOR actions;
no MCP/JSON authoring parser is to be enabled on the MCU. Preserve the saved
project, NVS, filesystem and NTP; verify the actual device and active OTA slot
before firmware writes. Camera-free software checks are not physical LCD acceptance.
## Physical LCD verification — lesson from owner acceptance

A framebuffer screenshot and running VSYNC counter do not establish that the
physical LCD displays that image. Record physical acceptance separately. During
this investigation even an unchanged prebuilt vendor-derived demo showed cycling
W/R/G/B until the owner completely removed power and waited. Do not diagnose that
symptom as an MCP/render failure from screenshots alone, or keep changing RGB
clock/power parameters blindly. Test a known prebuilt image and a true power-off;
preserve the project and distinguish reset, bootloader mode, and loss of panel power.

- Owner refinement 2026-11-10: select the active target in the Designer main form;
  Settings/Devices edits only the connection catalog. Saving another catalog row
  must preserve the active target, unless that target was removed. Diagnostic
  controls wait for command ACK only; frame downloads run latest-only in the
  background. Preview pointer input is opt-in, capability-gated and uses normal
  LVGL input/events with original display coordinates, including release protection.

## External agent access through Designer — owner clarification 2026-11-11

Windows Designer may explicitly expose its connected Direct API tool catalog as
a loopback MCP endpoint for comparison with external agents. This is the sole
exception to the earlier client-only Designer rule. NaWServer runs in-process,
and calls use the same existing Designer session, WebView codecs and target
permissions. Keep the listener opt-in. Do not add a separate process or enable
MCP/JSON on firmware for this purpose. External agents get the same English
authoring instructions from `get_authoring_instructions`.
