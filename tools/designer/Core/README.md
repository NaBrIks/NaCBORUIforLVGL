# SPLA-backed designer core

This module composes existing SPLA components. It does not contain an HTTP/SSE/OpenAI
transport, a JSON-RPC client, tool-call decoder or agent loop. SPLA remains unchanged.
`SplaRoot` is an overridable MSBuild property pointing to the SPLA checkout. Its default
is the sibling checkout above the `esp32` directory. Future SPLA NuGet packages replace
the four ProjectReference entries; no engine sources are copied into this tool.

The reusable stack is `Conversation` + `ConversationOrchestrator` +
`LlmPipelineBlueprint`/`ProviderClientResolver`, `OpenAiCompatibleClient` and
`OpenRouterProvider`, plus `McpServerSession`/`HttpTransport`/`StdioTransport` and
`McpProxyTool`. The small `McpToolHostAdapter` only presents SPLA proxy tools through
SPLA's IToolHost contract. It includes the complete discovered catalog. No second
namespace filter or tool allowlist is maintained here. Source names are prefixed by
SPLA's normal server-id naming convention. SPLA's ToolModeFilter applies Edit mode.
The target application still enforces its own source/action/project permissions.
No SPLA Runtime filesystem/shell tools, plugins, project lock, ASP.NET service or
Windows DPAPI dependency are instantiated by this client.

`DesignerSession` keeps the current chat in SPLA's canonical in-memory Conversation.
Cross-launch chat archives are not implemented in this first host. Images are native
SPLA ImageAttachment data URLs. ToolImage feedback is decoded by SPLA and uses the
existing last-tool-image policy; user reference pictures remain in the conversation.
Binary documents and audio attachments are not silently represented as pictures.
The three maintained English Windows assistant prompt originals are embedded by link,
so the MAUI client does not acquire a second set of copied instructions.

The UI consumes Messages, LiveText, LiveReasoning, Status, IsBusy, LastError, Log,
Tools and Preview. Changed may arrive on a worker thread: dispatch rendering through
the UI dispatcher. Do not persist Options.ApiKey in ordinary settings; the application
shell can use its platform SecureStorage. Logs contain tool names/outcomes, never
base64 frame data or full tool arguments. Cancel interrupts the active SPLA request.
SPLA's TruncateTo removes an incomplete conversation batch after cancellation/error;
operations already completed on the target are not undone. NewChat clears only local
conversation history and does not replace or save the device project.

## MCP endpoint

For Android select McpTransportKind.Http and provide a real MCP **Streamable HTTP**
URL, for example `http://device.example:5301/mcp`. This is an illustrative address,
not a claim that a server listens there. SPLA POSTs initialize, tools/list and
tools/call to the same endpoint. Replies can be application/json or text/event-stream.
SPLA handles Mcp-Session-Id and the negotiated MCP-Protocol-Version. This transport does
not implement the older GET /sse + separate messages endpoint, and does not hold a
standalone GET stream open for notifications arriving between calls.

A raw NaCBORUI /api/... HTTP endpoint is **not** an MCP endpoint. The existing
integrations/mcp/index.js is a desktop stdio adapter. Windows can use it by selecting
Stdio and supplying the Node executable, index.js argument, working directory and
LVGL_CBOR_DEVICE / permission environment values. Android cannot launch that desktop
process. It needs a reachable native NaWServer MCP endpoint implementing the same
catalog/operations, or another explicitly provisioned compatible MCP host. This core
neither starts a proxy listener nor guesses a protocol from the device URL. Connecting
and reading a preview never save a project.

GetPreviewAsync calls the advertised get_display_frame tool through SPLA, with maxEdge
128..1024. The endpoint must return an MCP image content block; unsupported capture is
reported as an error. Device-side frame support remains a separate acceptance concern.

## Build and verify

From tools/designer (its global.json selects the stable .NET 10 SDK):

```powershell
dotnet build Core/Tests/NaCBORUI.Designer.Core.Tests.csproj --artifacts-path ../../local/designer/artifacts
dotnet ../../local/designer/artifacts/bin/NaCBORUI.Designer.Core.Tests/debug/NaCBORUI.Designer.Core.Tests.dll
```

Always redirect artifacts for the whole ProjectReference graph when testing this
read-only SPLA integration. This keeps all dependency obj/bin outputs under this
repository's ignored local directory. The executable verification uses an in-memory
HttpMessageHandler, exercises SPLA's real HTTP/MCP/OpenAI code, and opens no listener.
It checks discovery/session headers, model retrieval, multimodal serialization,
model-tool-model history, image preview, multi-turn state, cancellation and redaction.
The Core project targets portable net10.0. Successful Windows compilation does not prove
Android AOT/trimming or device/network operation; the MAUI shell must verify those.

For an explicitly requested read-only check against a provisioned MCP host, run the
built test executable with `--live <actual-mcp-url>`. It performs only catalog discovery,
get_project_status and get_display_frame. It makes no model call and never previews,
saves, changes a data source or invokes an action on the target.
