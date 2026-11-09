// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
using SPLA.Mcp.Client;

namespace NaCBORUI.Designer.Core;

/// <summary>Host-owned connection choices. Secrets remain in memory; the UI owns platform SecureStorage.</summary>
public sealed class DesignerOptions
{
    public string Provider { get; set; } = "openai";
    public string ModelEndpoint { get; set; } = "https://api.openai.com/v1";
    public string Model { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string McpEndpoint { get; set; } = string.Empty;
    public string McpServerId { get; set; } = "lvgl";
    public McpTransportKind McpTransport { get; set; } = McpTransportKind.Http;
    public string McpCommand { get; set; } = string.Empty;
    public IReadOnlyList<string> McpArguments { get; set; } = [];
    public string? McpWorkingDirectory { get; set; }
    public IReadOnlyDictionary<string, string> McpEnvironment { get; set; } = new Dictionary<string, string>();
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
