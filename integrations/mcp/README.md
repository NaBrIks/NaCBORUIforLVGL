# NaCBORUIforLVGL: optional MCP adapter

Node.js 22+ host process, independent of firmware/browser builds. First run `npm ci` at repository root for common codecs and workspace links; the website need not be built. Then install `npm ci --prefix integrations/mcp`. Tests: `npm test --prefix integrations/mcp`. A client launches `node index.js` over stdio using `example.config.json`; no TCP listener is created.

LVGL_CBOR_DEVICE pins the device origin. Read-only project status/read/compile tools are available without mutation flags. LVGL_CBOR_ALLOW_PREVIEW=1 enables LCD preview/show; LVGL_CBOR_ALLOW_SAVE=1 separately enables explicit project storage writes/reset with revision checks. The old LVGL_CBOR_ALLOW_APPLY alias permits preview only. apply_document was replaced by project operations. LVGL_CBOR_MCP_CSS=0 removes CSS. LVGL_CBOR_MCP_ENABLED=0 disables the server. No MCP client configuration on the owner's computer is modified. SDK dependencies and lock file live here, outside root workspaces, and never enter browser/firmware bundles.

The adapter shares packages/project-codec and its HTTP ProjectClient with the browser. It does not implement another project store. See [the project contract](../../docs/readme_projects_ru.md) for tool names, storage policy and preview/save semantics. The legacy DeviceClient.apply helper remains only for older diagnostic scripts; it is not an MCP tool.

`get_contract` also exposes `binding` and `composition`. Device mode provides `get_data` and `get_data_command`, and project status includes the live composition/instance IDs. Set `LVGL_CBOR_ALLOW_DATA=1` independently of preview/save to register `invoke_action`, `write_source` and `send_event`. These use the shared browser/host `DataClient` over `/api/data`, with existing schema validators. Commands wait for execution receipts by default; queued/unconfirmed is not success, and POST is never retried. Use configured node navigation events for nested page transitions, then inspect project status. There is no second navigation implementation or direct container-load bypass.

See [the complete runtime MCP guide](../../docs/readme_mcp_ru.md) for arguments, receipt semantics, unknown values, scoped events and permission groups.

See [the module guide](../../docs/readme_modules_files_css_mcp_ru.md).
