# NaCBORUIforLVGL: agent entry point

- Owner formatting decision 2026-10-30: maintained C/C++ uses the unchanged
  NaWServer Uncrustify profile, version 0.83.0_f. Read agents/code_style.md before
  edits and use tools/format_cpp.ps1. Exclude generated/vendor/SDK source and the
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

- Owner authorized data bindings/events on 2026-10-22. Owner refinement 2026-10-23: Bluetooth libraries and their examples belong to their own projects, not this UI repository. Read docs/readme_bindings_ru.md and docs/adr/ADR_20261022_data-bindings-events.md; earlier binding deferrals are superseded. Application-owned DataRegistry exposes typed symbolic sources/actions. The generic editor uses those schemas; do not add Bluetooth implementations, library dependencies or scanner examples to this repository. Keep callback observations owned/bounded, serialize registry/LVGL work on the UI task, and preserve the previous full project when recompiling ABI fingerprints. Hardware flashing was authorized for this task; future unrelated flashing still needs an owner request.

- Owner decision 2026-10-22: use a whole Project JSON/CBOR document with screens, shared styles and manifest. Read docs/readme_projects_ru.md and docs/adr/ADR_20261022_project-service.md. Application-owned ProjectService loads screens by name, resolves a base plus one optional changes store, and exposes configurable storage/policy through optional HTTP/MCP adapters. Paths/media are configured in firmware code. Preview and explicit save are separate; connecting and auto-preview never persist. Project settings/file/device operations belong only on the Project page, not a permanent toolbar in every editor.

- Owner requirement 2026-10-22: build a general-purpose editor, never a UI tailored to a particular application or demo component. Native component choices, names, method IDs, parameter forms and initial dimensions come from the device catalog through shared mechanisms. Do not add dedicated controls, name/ID-based branches, special ordering or custom editor forms for radar, speedometer or another individual native component. Keep such implementations and fixtures in optional example modules. A new native component supported by the shared parameter schema must be usable through registration and metadata without changing the editor. Any missing parameter shape must extend the common schema/form mechanism rather than introduce a component-specific workaround.

- Owner refinement 2026-10-22: Project is the first standalone page. Keep project settings, whole-file operations and MCU storage/policy together there; Screens and Styles remain separate editing destinations. ProjectService reports base and changes locations, retention, permissions and application-declared media states. Never infer physical SD presence or editing permission from the hosting URL. Opening from MCU refreshes actual runtime capabilities as well as project data.

- Owner UI refinements 2026-10-22: MCU open/save commands belong at the top of the Project page as visible labelled buttons. Use visible icon buttons for tree add/remove/reorder actions. Tree context menus add components from the common catalog and attach/detach named styles; drag-and-drop changes order/parent with cycle rejection. Styles use a left-hand named list with CRUD/context actions, never the former top selector.

- Owner decision 2026-10-22 (latest): screen ABI v3 is a cursor-executed command stream. Opcode 0 creates a component and selects its native handler once; 1..255 are common commands; 256..65535 are local methods of that component. Execute nested CBOR bodies directly, with no intermediate command tree, method descriptors, signature tables or phase sorting on MCU. Styles remain ABI v2 with dense pointer arrays per signature and receive their own nested block. Preserve runtime native registration via WidgetRegistry. Screen v1/v2 wire compatibility is explicitly waived. Read docs/readme_fast_executor_ru.md and docs/adr/ADR_20261022_cursor-component-executor-v3.md.

Read agents/architecture.md and docs/README.md before changes.

- Architecture maps live in `docs/diagrams`, opened by `nacboruiforlvgl.semaps`.
  Before architectural changes, read the relevant SeMaps views and compare their
  authored responsibilities with source facts. Use MCP to edit the model, never
  edit registry/view JSON directly. Confirm `list_projects` identifies `nacborui`
  before mutations; an old session may still point to another workspace. Current
  maps are authored logical architecture, not an extracted C++ symbol graph.
  See docs/readme_semaps_ru.md for startup, MCP scopes and verification.

- Owner refinement 2026-10-22: keep code maximally modular. Each module owns one responsibility; keep App.vue as composition and presentation. Share validation and bidirectional value adapters instead of maintaining parallel implementations. Combining or deleting duplicate code while preserving behavior is encouraged.
- Owner preference 2026-10-22: evaluate proposals before adopting them, especially ideas explicitly called proposals rather than commands. Explain advantages, disadvantages, suitability and how established the approach is. Treat the suggested mechanism as a design option; distinguish it from required behavior and make a reasoned recommendation.
- The connected firmware advertises actual capabilities; the editor uses them for choices and validation. Offline editing uses the bundled contract and must not claim device compatibility.
- The style service supports static globals, dynamic globals, screen scopes and object-local styles. Screen scopes release after object teardown by default; caching is explicit and only unused entries may be evicted. Do not implement memory profiling or automatic low-memory policies in this task.

- Owner authorized the first shared-style runtime and S3 web playground on 2026-10-21. Build and test this scoped implementation. Do not flash hardware without a separate request.
- On 2026-10-21 the owner separately authorized deploying this demo to the identified S3 and testing it through the web UI; see the hardware verification report. The primary style editor must use visual controls for all properties; JSON belongs in optional diagnostic details. Preserve owner edits made through the live editor while testing.
- Work in this project; preserve neighbouring repositories and existing user changes.
- Application data and binding names remain symbolic UTF-8. The owner now authorizes numeric style-operation keys: the versioned contract in contracts/style-api-v2.json defines family-local signatures and method indices. Do not generalize these opcodes into arbitrary application-field IDs.
- New screens must be loadable at runtime without rebuilding firmware. Bindings connect to capabilities already provided by the application.
- Owner storage request 2026-10-22: keep the S3 filesystem in its final 4 MiB, preserve NVS/PHY/app offsets, and use a ROM TPMS/GPS demo plus one indexed filesystem changes layer. Discover independent screens/styles through ProjectService catalog metadata. Ordinary app updates must not reprovision the filesystem; preview/save stay separate. See docs/readme_project_storage_ru.md. Demo data is not live sensor integration.
- Separate confirmed owner requirements, proposals and measured implementation facts. Do not invent benchmark results, versions or completed features.
- Current agent rules live in agents/ in English. User-facing guides live in docs/readme_*_ru.md. Accepted ADRs are immutable; supersede them with a new ADR. Plans and ideas remain editable.
- Before creating, changing or assessing a UI, read and apply docs/ui-principles.md (the full owner UI standard), including the complete working overview requirement. Newer explicit owner instructions take precedence.
- Keep transient generated files, local credentials and build outputs out of source control. Versioned contract derivatives are reviewable source artifacts. The owner-authorized S3 demo adapts GPL-3.0-only files from ESP32-yaidfws; retain provenance and licenses. Do not extend this license to independently authored core code or copy other third-party code implicitly.
- Do not commit, push, configure remotes or publish without an owner request.
- LVGL 9.6.0 remains the target. Style v2 IDs are append-only per signature; screen v3 IDs are append-only in the common/component-local namespace. Prior screen contracts are historical. Preserve current lock files unless the owner authorizes another ABI break. Binding names remain symbolic.

## Recommended development environment (owner clarification, 2026-10-26)

The intended reproducible baseline is documented in
[docs/readme_development_environment_ru.md](docs/readme_development_environment_ru.md).
Use username-independent paths and prefer shared versioned SDKs under the chosen
PlatformIO packages directory. This is a recommendation/default, not a mandatory
machine layout or a prohibition on other explicit configurations. Alternative
paths and version profiles are allowed when deliberately configured and validated.
Do not silently change versions based on historical verification reports.
- Owner authorization 2026-10-28: for NaCBORUIforLVGL firmware work, independently build and flash the identified target, including bootloader, partition table, application and filesystem changes required by the task, without asking again. Owner explicitly declined backing up the current board in this deployment. Verify chip/MAC before writing; do not operate unrelated boards. Keep private device evidence ignored and public reports generic.
