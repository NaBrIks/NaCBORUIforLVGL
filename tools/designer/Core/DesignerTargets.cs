// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
using System.Text.Json;
using SPLA.Agent;
using SPLA.Domain.Interfaces;
using SPLA.Domain.Models;
using SPLA.Domain.Tools;
using SPLA.Mcp.Client;

namespace NaCBORUI.Designer.Core;

public enum DesignerConnectionMode { DirectApi, NativeMcp, ProxyMcp, UsbPreview }

/// <summary>Shared SPLA tool-host surface for direct device APIs and MCP targets.</summary>
public interface IDesignerToolHost : IToolHost
{
    bool IsConnected { get; }
    Task ConnectAsync(CancellationToken cancellationToken);
    string NameFor(string remoteName);
}

/// <summary>Injected WebView bridge; JSON is the only boundary between Core and browser codecs.</summary>
public interface IDesignerDirectBridge : IAsyncDisposable
{
    Task InitializeAsync(CancellationToken cancellationToken);
    Task<string> ConnectAsync(string requestJson, CancellationToken cancellationToken);
    Task<string> ExecuteAsync(string operationId, string name, string argumentsJson, CancellationToken cancellationToken);
    ValueTask DisconnectAsync();
}

internal sealed class DirectDesignerToolHost : IDesignerToolHost, IAsyncDisposable
{
    private const int MaxConnectBytes = 2 * 1024 * 1024;
    private const int MaxResultBytes = 9 * 1024 * 1024;
    private readonly IDesignerDirectBridge _bridge;
    private readonly string _serverId;
    private readonly string _origin;
    private readonly bool _usb;
    private readonly Action<string> _notice;
    private IReadOnlyDictionary<string, (string Remote, ToolDefinition Definition)> _tools =
        new Dictionary<string, (string, ToolDefinition)>(StringComparer.Ordinal);

    public DirectDesignerToolHost(IDesignerDirectBridge bridge, string serverId, string origin, Action<string> notice, bool usb = false)
    {
        _bridge = bridge ?? throw new ArgumentNullException(nameof(bridge));
        _serverId = serverId;
        _origin = origin;
        _usb = usb;
        _notice = notice;
    }

    public bool IsConnected { get; private set; }

    public string Instructions { get; private set; } = string.Empty;
    public bool SupportsNativeView { get; private set; }
    public bool SupportsFramePackets { get; private set; }
    public bool SupportsFrameWebSocket { get; private set; }
    public bool RequiresFrameWebSocket { get; private set; }
    public (int Width, int Height) DisplaySize { get; private set; }

    internal static (int Width, int Height) ReadDisplaySize(JsonElement metadata)
    {
        if (metadata.ValueKind == JsonValueKind.Object &&
            metadata.TryGetProperty("display", out var display) && display.ValueKind == JsonValueKind.Object &&
            display.TryGetProperty("width", out var w) && w.ValueKind == JsonValueKind.Number && w.TryGetInt32(out var width) &&
            display.TryGetProperty("height", out var h) && h.ValueKind == JsonValueKind.Number && h.TryGetInt32(out var height) &&
            width is > 0 and <= 8192 && height is > 0 and <= 8192)
            return (width, height);
        return default;
    }

    public async Task ConnectAsync(CancellationToken cancellationToken)
    {
        var request = _usb ? JsonSerializer.Serialize(new { usbPort = _origin }) : JsonSerializer.Serialize(new { origin = _origin });
        var result = await _bridge.ConnectAsync(request, cancellationToken);
        if (System.Text.Encoding.UTF8.GetByteCount(result) > MaxConnectBytes)
            throw new InvalidOperationException("Direct target catalog exceeds the 2 MiB limit.");
        using var document = JsonDocument.Parse(result, new JsonDocumentOptions { MaxDepth = 32 });
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("tools", out var tools) ||
            tools.ValueKind != JsonValueKind.Array)
            throw new InvalidOperationException("Direct target returned no tool catalog.");
        RequiresFrameWebSocket = false;
        if (root.TryGetProperty("device", out var device) && device.ValueKind == JsonValueKind.Object)
        {
            SupportsNativeView = device.TryGetProperty("native_view", out var nativeView) && nativeView.ValueKind == JsonValueKind.True;
            SupportsFramePackets = device.TryGetProperty("native_view_packets", out var packets) && packets.ValueKind == JsonValueKind.True;
            SupportsFrameWebSocket = device.TryGetProperty("native_view_ws", out var socket) && socket.ValueKind == JsonValueKind.True;
            RequiresFrameWebSocket = SupportsFrameWebSocket && device.TryGetProperty("native_view_ws_only", out var only) &&
                only.ValueKind == JsonValueKind.True;
        }
        else { SupportsNativeView = false; SupportsFramePackets = false; SupportsFrameWebSocket = false; }

        DisplaySize = root.TryGetProperty("capabilities", out var capabilities) ? ReadDisplaySize(capabilities) : default;
        var next = new Dictionary<string, (string, ToolDefinition)>(StringComparer.Ordinal);
        foreach (var item in tools.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object ||
                !item.TryGetProperty("name", out var nameValue) || nameValue.ValueKind != JsonValueKind.String ||
                !item.TryGetProperty("inputSchema", out var schema) || schema.ValueKind != JsonValueKind.Object)
            {
                _notice("Direct target supplied a tool without a valid name or input schema; skipped.");
                continue;
            }

            var remoteName = nameValue.GetString()!;
            var exposedName = McpToolNaming.Prefixed(_serverId, remoteName, out var refusal);
            if (exposedName is null)
            {
                _notice($"Direct tool '{remoteName}' skipped: {refusal}.");
                continue;
            }
            if (!next.TryAdd(exposedName, (remoteName, Definition(item, exposedName, schema))))
            {
                _notice($"Direct target supplied duplicate tool '{remoteName}'; skipped.");
            }
        }
        if (next.Count == 0) throw new InvalidOperationException("Direct target advertised no usable tools.");
        Volatile.Write(ref _tools, next);
        IsConnected = true;
        Instructions = root.TryGetProperty("instructions", out var instructions) && instructions.ValueKind == JsonValueKind.String
            ? instructions.GetString() ?? string.Empty : string.Empty;
    }

    public IEnumerable<ToolDefinition> GetToolDefinitions() =>
        Volatile.Read(ref _tools).Values.Select(entry => entry.Definition).ToArray();

    public IReadOnlyList<DesignerMcpTool> GetRemoteTools() =>
        Volatile.Read(ref _tools).Values.Select(entry => new DesignerMcpTool(entry.Remote, entry.Definition)).ToArray();

    public async Task<ToolResult> ExecuteToolAsync(AgentMode mode, string name, string argumentsJson,
        CancellationToken cancellationToken = default, ToolCallContext? context = null)
    {
        if (!Volatile.Read(ref _tools).TryGetValue(name, out var entry))
            return ToolResult.Refuse($"Tool '{name}' is not in the connected direct target catalog.");
        if (!ToolModeFilter.IsAllowed(entry.Definition, mode))
            return ToolResult.Refuse($"Tool '{name}' is not available in {mode} mode.");

        var json = await _bridge.ExecuteAsync(Guid.NewGuid().ToString("N"), entry.Remote, argumentsJson, cancellationToken);
        if (System.Text.Encoding.UTF8.GetByteCount(json) > MaxResultBytes)
            return ToolResult.Fail("Direct target tool result exceeds the 9 MiB limit.");
        using var document = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 32 });
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("content", out var content) ||
            content.ValueKind != JsonValueKind.Array)
            return ToolResult.Fail("Direct target returned an invalid tool result.");

        var output = new List<ToolContent>();
        foreach (var item in content.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty("type", out var typeValue)) continue;
            var type = typeValue.GetString();
            if (type == "text" && item.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String)
                output.Add(new ToolText(text.GetString()!));
            else if (type == "image" && item.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.String &&
                     item.TryGetProperty("mimeType", out var mime) && mime.ValueKind == JsonValueKind.String)
            {
                var mimeType = mime.GetString()!;
                var base64 = data.GetString()!;
                if (!mimeType.StartsWith("image/", StringComparison.OrdinalIgnoreCase) || base64.Length > 11_184_832)
                    return ToolResult.Fail("Direct target returned an invalid or oversized image.");
                try { _ = Convert.FromBase64String(base64); }
                catch (FormatException) { return ToolResult.Fail("Direct target returned invalid image data."); }
                output.Add(new ToolImage(base64, mimeType));
            }
        }
        if (root.TryGetProperty("isError", out var isError) && isError.ValueKind == JsonValueKind.True)
            return ToolResult.Fail(string.Join("\n\n", output.OfType<ToolText>().Select(block => block.Text)), "direct_tool_error");
        return output.Count == 0 ? ToolResult.Empty() : ToolResult.From(output.ToArray());
    }

    public string NameFor(string remoteName) =>
        McpToolNaming.Prefixed(_serverId, remoteName, out var reason) ?? throw new ArgumentException(reason, nameof(remoteName));

    private static ToolDefinition Definition(JsonElement item, string exposedName, JsonElement schema)
    {
        var annotations = item.TryGetProperty("annotations", out var value) && value.ValueKind == JsonValueKind.Object ? value : default;
        var readOnly = annotations.ValueKind == JsonValueKind.Object &&
            annotations.TryGetProperty("readOnlyHint", out var readOnlyHint) && readOnlyHint.ValueKind == JsonValueKind.True;
        var destructive = annotations.ValueKind == JsonValueKind.Object &&
            annotations.TryGetProperty("destructiveHint", out var destructiveHint) && destructiveHint.ValueKind == JsonValueKind.True;
        return new ToolDefinition
        {
            Function = new ToolFunctionDefinition
            {
                Name = exposedName,
                Description = item.TryGetProperty("description", out var description) && description.ValueKind == JsonValueKind.String
                    ? description.GetString()! : string.Empty,
                Parameters = schema.Clone(),
                Scope = ToolScope.Project,
                Effect = readOnly ? ToolEffect.Read : ToolEffect.Write,
                Risk = destructive ? ToolRisk.Medium : ToolRisk.Low
            }
        };
    }

    public async ValueTask DisposeAsync()
    {
        IsConnected = false;
        Volatile.Write(ref _tools, new Dictionary<string, (string, ToolDefinition)>(StringComparer.Ordinal));
        await _bridge.DisconnectAsync();
    }
}
