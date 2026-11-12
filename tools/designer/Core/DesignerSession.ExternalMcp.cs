// SPDX-License-Identifier: MIT
using SPLA.Domain.Models;

namespace NaCBORUI.Designer.Core;

public sealed record DesignerMcpTool(string Name, ToolDefinition Definition);

public sealed partial class DesignerSession
{
    public IReadOnlyList<DesignerMcpTool> DirectMcpTools =>
        _directTools is { IsConnected: true } host && Options.ConnectionMode == DesignerConnectionMode.DirectApi
            ? host.GetRemoteTools() : [];

    public string McpAuthoringInstructions => ReadOriginalPrompts() + "\n\n" + _targetInstructions;

    public Func<string, string, CancellationToken, Task<ToolResult>> PinDirectMcpTarget()
    {
        var host = _directTools;
        return async (name, arguments, cancellationToken) =>
        {
            await BeginOperationAsync(cancellationToken);
            try
            {
                if (host is null || !ReferenceEquals(host, _activeToolHost) ||
                    Options.ConnectionMode != DesignerConnectionMode.DirectApi)
                    return ToolResult.Refuse("The connected Designer target changed. Reconnect before using its MCP tools.");
                return await InvokeToolAsync(name, arguments, _activeOperation!.Token);
            }
            finally { EndOperation(); }
        };
    }
}
