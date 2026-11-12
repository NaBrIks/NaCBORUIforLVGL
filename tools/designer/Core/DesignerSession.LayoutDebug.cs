// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
using System.Text.Json;

namespace NaCBORUI.Designer.Core;

public sealed record LayoutDebugLevelState(bool Outline, bool Digit, int OutlineColor, int DigitColor);
public sealed record LayoutDebugState(int Opacity, int OutlineWidth, LayoutDebugLevelState[] Levels, int MaxDepth, bool LayoutType = false);

public sealed partial class DesignerSession
{
    // The target advertises this optional application action/source through the normal registry.
    public async Task<LayoutDebugState?> GetLayoutDebugAsync(CancellationToken cancellationToken = default)
    {
        if (!HasRemoteTool("get_data_catalog") || !HasRemoteTool("get_data") || !HasRemoteTool("invoke_action")) return null;
        var catalog = await InvokeToolAsync("get_data_catalog", JsonSerializer.Serialize(new
        {
            kind = "actions", name = "ui.layout_debug_options", maxBytes = 2048
        }), cancellationToken);
        if (catalog.IsError) throw new InvalidOperationException(catalog.TextContent);
        using var actions = JsonDocument.Parse(catalog.TextContent);
        if (!actions.RootElement.GetProperty("items").EnumerateArray().Any(item =>
                item.TryGetProperty("name", out var name) && name.GetString() == "ui.layout_debug_options")) return null;
        var result = await InvokeToolAsync("get_data", JsonSerializer.Serialize(new
        {
            name = "ui.layout_debug", detail = true, maxBytes = 4096
        }), cancellationToken);
        if (result.IsError) throw new InvalidOperationException(result.TextContent);
        using var values = JsonDocument.Parse(result.TextContent);
        foreach (var item in values.RootElement.GetProperty("items").EnumerateArray())
            if (item.TryGetProperty("value", out var value) && value.ValueKind == JsonValueKind.Object)
                return new LayoutDebugState(value.GetProperty("opacity").GetInt32(), value.GetProperty("outlineWidth").GetInt32(),
                    value.GetProperty("levels").EnumerateArray().Select(level => new LayoutDebugLevelState(
                        level.GetProperty("outline").GetBoolean(), level.GetProperty("digit").GetBoolean(),
                        level.GetProperty("outlineColor").GetInt32(), level.GetProperty("digitColor").GetInt32())).ToArray(),
                    value.GetProperty("maxDepth").GetInt32(),
                    value.TryGetProperty("layoutType", out var type) && type.GetBoolean());
        return null;
    }

    public async Task SetLayoutDebugAsync(LayoutDebugState options, CancellationToken cancellationToken = default)
    {
        var result = await InvokeToolAsync("invoke_action", JsonSerializer.Serialize(new
        {
            name = "ui.layout_debug_options", args = new { opacity = options.Opacity, outlineWidth = options.OutlineWidth, layoutType = options.LayoutType,
                levels = options.Levels.Select(level => new { outline = level.Outline, digit = level.Digit, outlineColor = level.OutlineColor, digitColor = level.DigitColor }).ToArray() }, wait = true
        }), cancellationToken);
        if (result.IsError) throw new InvalidOperationException(result.TextContent);
        using var receipt = JsonDocument.Parse(result.TextContent);
        if (!receipt.RootElement.TryGetProperty("state", out var state) || state.GetString() != "completed")
            throw new InvalidOperationException("Изменение диагностики не подтверждено устройством.");
    }

    private bool HasRemoteTool(string name) => _activeToolHost is not null &&
        Tools.Any(tool => tool.Function.Name == _activeToolHost.NameFor(name));
}
