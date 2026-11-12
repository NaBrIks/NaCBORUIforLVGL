// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov

namespace NaCBORUI.Designer.Core;

/// <summary>Host-owned connection choices. Secrets remain in memory; the UI owns platform SecureStorage.</summary>
public sealed class DesignerOptions
{
    public DesignerConnectionMode ConnectionMode { get; set; } = DesignerConnectionMode.DirectApi;
    public string DeviceOrigin { get; set; } = string.Empty;
    public string UsbPort { get; set; } = string.Empty;
    public string Provider { get; set; } = "openai";
    public string ModelEndpoint { get; set; } = "https://api.openai.com/v1";
    public string Model { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string McpEndpoint { get; set; } = string.Empty;
    public string ProxyMcpEndpoint { get; set; } = string.Empty;
    public string McpServerId { get; set; } = "lvgl";
    public IReadOnlyDictionary<string, string> McpHeaders { get; set; } = new Dictionary<string, string>();
    public TimeSpan McpTimeout { get; set; } = TimeSpan.FromSeconds(60);
    public double Temperature { get; set; } = 0.3;
    public int? MaxTokens { get; set; } = 8192;
    public string? ReasoningLevel { get; set; }
    public SPLA.Domain.Models.ReasoningCapability ModelReasoning { get; set; } = SPLA.Domain.Models.ReasoningCapability.Unknown;
    /// <summary>Empty uses the shared Designer prompt documents.</summary>
    public string SystemPrompt { get; set; } = string.Empty;
}

public sealed record DesignerLogEntry(DateTimeOffset At, string Kind, string Text);
public sealed record DesignerPreview(string DataUrl, string MimeType, string Metadata);
