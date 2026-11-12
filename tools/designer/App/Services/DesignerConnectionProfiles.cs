// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
using NaCBORUI.Designer.Core;

namespace NaCBORUI.Designer.App.Services;

public sealed class DesignerConnectionProfile
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "Connection";
    public DesignerConnectionMode ConnectionMode { get; set; } = DesignerConnectionMode.DirectApi;
    public string DeviceOrigin { get; set; } = string.Empty;
    public string UsbPort { get; set; } = string.Empty;
    public string McpEndpoint { get; set; } = string.Empty;
    public string ProxyMcpEndpoint { get; set; } = string.Empty;
    public string McpServerId { get; set; } = "lvgl";

    public DesignerConnectionProfile Clone() => new()
    {
        Id = Id, Name = Name, ConnectionMode = ConnectionMode, DeviceOrigin = DeviceOrigin, UsbPort = UsbPort,
        McpEndpoint = McpEndpoint, ProxyMcpEndpoint = ProxyMcpEndpoint, McpServerId = McpServerId
    };

    public DesignerConnectionProfile CloneAsNew(string? name = null)
    {
        var copy = Clone();
        copy.Id = Guid.NewGuid().ToString("N");
        copy.Name = name ?? (Name.Length > 71 ? Name[..71] + " copy" : Name + " copy");
        return copy;
    }
}

/// <summary>Connection catalog plus the selected profile projected into the legacy target fields.</summary>
public sealed class DesignerSettings
{
    public const int MaxConnections = 64;
    public const int MaxConnectionNameLength = 80;
    public List<DesignerConnectionProfile> Connections { get; set; } = [];
    public string SelectedConnectionId { get; set; } = string.Empty;
    public DesignerConnectionMode ConnectionMode { get; set; } = DesignerConnectionMode.DirectApi;
    public string DeviceOrigin { get; set; } = string.Empty;
    public string UsbPort { get; set; } = string.Empty;
    public string Provider { get; set; } = "openrouter";
    public string ModelEndpoint { get; set; } = "https://openrouter.ai/api/v1";
    public string Model { get; set; } = string.Empty;
    public string McpEndpoint { get; set; } = string.Empty;
    public string ProxyMcpEndpoint { get; set; } = string.Empty;
    public string McpServerId { get; set; } = "lvgl";
    public string ApiKey { get; set; } = string.Empty;

    public DesignerSettings Clone() => new()
    {
        Connections = Connections.Select(profile => profile.Clone()).ToList(),
        SelectedConnectionId = SelectedConnectionId,
        ConnectionMode = ConnectionMode, DeviceOrigin = DeviceOrigin, UsbPort = UsbPort, Provider = Provider,
        ModelEndpoint = ModelEndpoint, Model = Model, McpEndpoint = McpEndpoint,
        ProxyMcpEndpoint = ProxyMcpEndpoint, McpServerId = McpServerId, ApiKey = ApiKey
    };

    public DesignerConnectionProfile? SelectedConnection =>
        Connections.FirstOrDefault(profile => string.Equals(profile.Id, SelectedConnectionId, StringComparison.Ordinal));

    /// <summary>Creates the one-time profile migration from the previously stored flat target fields.</summary>
    public void InitializeLegacyConnection(DesignerConnectionProfile profile)
    {
        Connections = [profile];
        SelectedConnectionId = profile.Id;
        ApplySelectedConnection();
        ValidateConnections();
    }

    public bool SelectConnection(string id)
    {
        CaptureSelectedConnection();
        var selected = Connections.FirstOrDefault(profile => string.Equals(profile.Id, id, StringComparison.Ordinal));
        if (selected is null) return false;
        SelectedConnectionId = selected.Id;
        ApplySelectedConnection();
        return true;
    }

    public bool RemoveConnection(string id)
    {
        if (Connections.Count <= 1) return false;
        var profile = Connections.FirstOrDefault(item => item.Id == id);
        if (profile is null) return false;
        Connections.Remove(profile);
        if (SelectedConnectionId == id)
        {
            // Clear the deleted ID before selection; CaptureSelectedConnection can never resurrect it.
            SelectedConnectionId = string.Empty;
            SelectConnection(Connections[0].Id);
        }
        return true;
    }

    public void ApplySelectedConnection()
    {
        var profile = SelectedConnection ?? throw new InvalidOperationException("Selected connection profile is missing.");
        ConnectionMode = profile.ConnectionMode;
        DeviceOrigin = profile.DeviceOrigin;
        UsbPort = profile.UsbPort;
        McpEndpoint = profile.McpEndpoint;
        ProxyMcpEndpoint = profile.ProxyMcpEndpoint;
        McpServerId = profile.McpServerId;
    }

    public void CaptureSelectedConnection()
    {
        var profile = SelectedConnection;
        if (profile is null) return;
        profile.ConnectionMode = ConnectionMode;
        profile.DeviceOrigin = DeviceOrigin.Trim();
        profile.UsbPort = UsbPort.Trim();
        profile.McpEndpoint = McpEndpoint.Trim();
        profile.ProxyMcpEndpoint = ProxyMcpEndpoint.Trim();
        profile.McpServerId = string.IsNullOrWhiteSpace(McpServerId) ? "lvgl" : McpServerId.Trim();
    }

    public DesignerSettings WithCatalogEditsPreservingActive(string activeConnectionId)
    {
        var target = Clone();
        target.CaptureSelectedConnection();
        var selectedId = target.Connections.Any(profile => profile.Id == activeConnectionId)
            ? activeConnectionId
            : target.Connections.FirstOrDefault()?.Id;
        if (string.IsNullOrWhiteSpace(selectedId) || !target.SelectConnection(selectedId))
            throw new InvalidOperationException("The connection catalog must contain at least one profile.");
        target.ValidateConnections();
        return target;
    }

    public void ValidateConnections()
    {
        if (Connections.Count is < 1 or > MaxConnections) throw new InvalidOperationException($"Connection count must be between 1 and {MaxConnections}.");
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var profile in Connections)
        {
            if (!Guid.TryParseExact(profile.Id, "N", out _) || !ids.Add(profile.Id))
                throw new InvalidOperationException("Connection profile IDs must be unique GUIDs.");
            profile.Name = profile.Name?.Trim() ?? string.Empty;
            if (profile.Name.Length is < 1 or > MaxConnectionNameLength)
                throw new InvalidOperationException($"Connection names must be 1–{MaxConnectionNameLength} characters.");
            if (!Enum.IsDefined(profile.ConnectionMode)) throw new InvalidOperationException("Unknown connection mode.");
            profile.DeviceOrigin = profile.DeviceOrigin?.Trim() ?? string.Empty;
            profile.UsbPort = profile.UsbPort?.Trim() ?? string.Empty;
            if (profile.UsbPort.Length > 12) throw new InvalidOperationException("USB port name is too long.");
            profile.McpEndpoint = profile.McpEndpoint?.Trim() ?? string.Empty;
            profile.ProxyMcpEndpoint = profile.ProxyMcpEndpoint?.Trim() ?? string.Empty;
            profile.McpServerId = string.IsNullOrWhiteSpace(profile.McpServerId) ? "lvgl" : profile.McpServerId.Trim();
            if (profile.DeviceOrigin.Length > 2048 || profile.McpEndpoint.Length > 2048 ||
                profile.ProxyMcpEndpoint.Length > 2048 || profile.McpServerId.Length > 16)
                throw new InvalidOperationException("Connection endpoint or server ID exceeds its length limit.");
        }
        if (!ids.Contains(SelectedConnectionId)) throw new InvalidOperationException("Select an existing connection profile.");
        ApplySelectedConnection();
    }
}
