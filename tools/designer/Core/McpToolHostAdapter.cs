// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
using SPLA.Agent;
using SPLA.Domain.Interfaces;
using SPLA.Domain.Models;
using SPLA.Domain.Tools;
using SPLA.Mcp.Client;

namespace NaCBORUI.Designer.Core;

/// <summary>Only adapts SPLA's discovered proxy tools to SPLA's orchestrator contract.</summary>
internal sealed class McpToolHostAdapter : IToolHost, IDisposable
{
    private readonly McpServerSession _session;
    private readonly Action<string> _notice;
    private IReadOnlyDictionary<string, McpProxyTool> _tools = new Dictionary<string, McpProxyTool>();

    public McpToolHostAdapter(McpServerSession session, Action<string> notice)
    {
        _session = session;
        _notice = notice;
        _session.ToolsChanged += Refresh;
        Refresh(session);
    }

    public IEnumerable<ToolDefinition> GetToolDefinitions() =>
        Volatile.Read(ref _tools).Values.Select(tool => tool.GetDefinition()).ToArray();

    public Task<ToolResult> ExecuteToolAsync(AgentMode mode, string name, string argumentsJson,
        CancellationToken cancellationToken = default, ToolCallContext? context = null)
    {
        if (!Volatile.Read(ref _tools).TryGetValue(name, out var tool))
            return Task.FromResult(ToolResult.Refuse($"Tool '{name}' is not in the connected MCP catalog."));
        if (!ToolModeFilter.IsAllowed(tool.GetDefinition(), mode))
            return Task.FromResult(ToolResult.Refuse($"Tool '{name}' is not available in {mode} mode."));
        return tool.ExecuteAsync(argumentsJson, cancellationToken);
    }

    public string NameFor(string remoteName) =>
        McpToolNaming.Prefixed(_session.Id, remoteName, out var reason)
        ?? throw new ArgumentException(reason, nameof(remoteName));

    private void Refresh(McpServerSession session)
    {
        var next = new Dictionary<string, McpProxyTool>(StringComparer.Ordinal);
        foreach (var info in session.Tools)
        {
            try
            {
                var proxy = new McpProxyTool(session, info, session.Id, serverIsNamedOrigin: true);
                if (!next.TryAdd(proxy.Name, proxy))
                    _notice($"MCP server supplied duplicate tool '{proxy.Name}'.");
            }
            catch (ArgumentException ex) { _notice(ex.Message); }
        }
        Volatile.Write(ref _tools, next);
    }

    public void Dispose() => _session.ToolsChanged -= Refresh;
}
