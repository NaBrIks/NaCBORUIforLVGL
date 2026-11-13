# SPLA-backed designer core

This module composes existing SPLA components. It does not contain an HTTP/SSE/OpenAI
transport, a JSON-RPC client, tool-call decoder or agent loop. SPLA remains unchanged.
`SplaRoot` is an overridable MSBuild property pointing to the SPLA checkout. Its default
is the sibling checkout above the `esp32` directory. Future SPLA NuGet packages replace
the four ProjectReference entries; no engine sources are copied into this tool.

The reusable stack is `Conversation` + `ConversationOrchestrator` +
`LlmPipelineBlueprint`/`ProviderClientResolver`, `OpenAiCompatibleClient` and
`OpenRouterProvider`, plus `McpServerSession`/`HttpTransport` and
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
The three maintained English shared Designer prompt originals are embedded by link,
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

Direct API uses the application's bridge to the shared WebView codecs. Device
MCP and MCP proxy profiles use the same SPLA HTTP client. The optional Windows
player MCP and the opt-in Windows Designer listener are described in the
[connection guide](../../../docs/readme_designer_connections.ru.md).

SPLA owns the session, negotiated protocol, cancellation and tool invocation.
No substitute process or HTTP listener is started by this core. Discovery must
come from the actual configured target, not a hardcoded local tool catalog.

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
