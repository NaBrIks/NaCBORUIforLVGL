# NaCBORUIforLVGL: optional MCP adapter

Node.js 22+ host process, independent of firmware/browser builds. First run `npm ci` at repository root for common codecs and workspace links; the website need not be built. Then install `npm ci --prefix integrations/mcp`. Tests: `npm test --prefix integrations/mcp`. A client launches `node index.js` over stdio using `example.config.json`; no TCP listener is created.

LVGL_CBOR_DEVICE pins the device origin. Read-only documentation, JSON validation and project read tools are available without mutation flags. LVGL_CBOR_ALLOW_PREVIEW=1 enables LCD preview/show; LVGL_CBOR_ALLOW_SAVE=1 separately enables explicit project storage writes/reset with revision checks. The old LVGL_CBOR_ALLOW_APPLY alias permits preview only. apply_document was replaced by project operations. LVGL_CBOR_MCP_CSS=0 removes CSS. LVGL_CBOR_MCP_ENABLED=0 disables the server. No MCP client configuration on the owner's computer is modified. SDK dependencies and lock file live here, outside root workspaces, and never enter browser/firmware bundles.

The adapter shares packages/project-codec and its HTTP ProjectClient with the browser. It does not implement another project store. See [the project contract](../../docs/readme_projects_ru.md) for tool names, storage policy and preview/save semantics. The legacy DeviceClient.apply helper remains only for older diagnostic scripts; it is not an MCP tool.

`get_ui_reference` explains bindings, events and page composition as authoring JSON. Device mode provides `get_data` and `get_data_command`, and project status includes the live composition/instance IDs. Set `LVGL_CBOR_ALLOW_DATA=1` independently of preview/save to register `invoke_action`, `write_source` and `send_event`. These use the shared browser/host `DataClient` over `/api/data`, with existing schema validators. Commands wait for execution receipts by default; queued/unconfirmed is not success, and POST is never retried. Use configured node navigation events for nested page transitions, then inspect project status. There is no second navigation implementation or direct container-load bypass.

See [the complete runtime MCP guide](../../docs/readme_mcp_ru.md) for arguments, receipt semantics, unknown values, scoped events and permission groups.

See [the module guide](../../docs/readme_modules_files_css_mcp_ru.md).

## Bounded discovery and design

`get_device({})` returns a compact summary. Select `section: "widgets" | "styles" |
"resources" | "limits"`; use `name` for a complete widget/style method
with its authoring JSON forms and allowed values. Internal operation IDs are not exposed.
Defaults are 16 records and 4096 UTF-8 bytes; maximum 64/16384. Capabilities sections
are filtered on the host after a full capabilities fetch.

`get_data_catalog({})` lists root groups. Follow with sources/actions by group or
prefix, then fields by source `name` and JSON Pointer `path`. `detail:true` returns
the selected complete schema. `get_data({})` now returns selective value summaries;
use `name/path/detail` for the required value. These queries run in the device's
shared C++ registry over the existing GET `/api/data`, rather than filtering a full
legacy snapshot. Continue with `nextOffset` and `catalogRevision`; 409 means restart
discovery. A record exceeding the byte budget returns 413, never a truncated schema.

For legacy diagnostics use `get_data({snapshot:true,maxBytes:16384})` explicitly.
Only maxBytes is accepted in this mode. `get_data_command` still reads one receipt.
`get_ui_reference({kind:"screen"|"style",topic:"index"})` lists documentation topics.
The same two complete references are appended to the embedded agent system prompt.
`validate_document` checks JSON without saving/showing. `get_contract`,
`compile_document` and `decode_document` were removed from MCP; codecs remain shared host modules.

For a new visual scheme, discover style methods/resources, then edit ordinary
project styles and ordered component style references using existing project
read/write/preview/save tools. Parts/states and local-style precedence remain LVGL
semantics; this does not add a second theme engine. See the
[catalog guide](../../docs/readme_data_catalog_ru.md) and
[Windows example](../../docs/readme_windows_player_ru.md).

For a complete custom scheme recipe and ordered style stacks, see [user-authored appearance via MCP](../../docs/readme_appearance_ru.md).

## Windows target: native NaWServer and web editor

The same stdio adapter targets the Windows player's native NaWServer API. Build
the web editor (`npm run build`), then start the player with `--api`
(`http://127.0.0.1:5300`) and configure a separate `nacborui_windows` MCP target
with `LVGL_CBOR_DEVICE` set to that origin. Keep the board target/configuration.
The existing `LVGL_CBOR_ALLOW_PREVIEW`, `LVGL_CBOR_ALLOW_SAVE` and
`LVGL_CBOR_ALLOW_DATA` flags still independently register their tool groups;
MCP itself does not open a listener.

NaWServer passes CBOR to the shared ProjectService/DataRegistry. An agent
may create its own named project styles and style stacks through the normal
validate/preview/save operations. Preview uses the actual native preview path,
save writes FileProjectStore without switching the display, show applies the
saved variant, and revision conflicts remain authoritative. Use the same store
prefix on restart to restore saved UI definitions. Live application values are
not automatically made persistent.

The native listener is loopback-only, rejects foreign Host/Origin and bounds
bodies, queues and project transfers. It serves the editor and binary-CBOR
`/ws`/`/screen-ws`; `project_changed` announces stored revisions to the editor.
The end-to-end test is `examples/windows_player/test-api.mjs`; it uses native
NaWServer, real stdio MCP and actual LVGL. See the
[Windows API guide](../../docs/readme_windows_api_ru.md).

Display feedback: `get_display_frame({maxEdge:1024})` is read-only and uses the existing
NaWServer `/api/view/frame`. Requires advertised native capture; encodes PNG on
the MCP host, returns image content and dimensions/display metadata. No project
write, navigation, pointer input or desktop screenshot. See [details](../../docs/readme_display_feedback_ru.md).
MCP requests close their HTTP connection deliberately to avoid stale idle socket
races across model turns; mutations are never replayed automatically.

Large screen edits use the same tools: read_project_document with outline:true
for IDs/types, then node:<id> for one subtree; write_project_document accepts the
same node selector with a matching node object and current revision. The common
ProjectClient owns selection/replacement and full-project validation/transfer.
No device endpoint or wire ABI changes. Save replies explicitly distinguish
persistence from the unchanged display; display frame metadata compares revisions.

`refresh_project_display` refreshes the current saved composition while retaining
active nested selections by stable view paths. `save_project` and
`write_project_document` accept optional `refresh:true` for the same operation
after a successful save. Save defaults remain nonvisual. A failed post-save refresh
returns `saved:true` with `refreshError`; retry refresh, not the committed write.
Explicit show/preview start from initial selections.
