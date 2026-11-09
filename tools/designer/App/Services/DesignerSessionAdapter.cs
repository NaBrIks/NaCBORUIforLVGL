using System.Text.RegularExpressions;
using NaCBORUI.Designer.Core;
using SPLA.Domain.Models;

namespace NaCBORUI.Designer.App.Services;

public sealed class DesignerSettings
{
    public string Provider { get; set; } = "openrouter";
    public string ModelEndpoint { get; set; } = "https://openrouter.ai/api/v1";
    public string Model { get; set; } = string.Empty;
    public string McpEndpoint { get; set; } = string.Empty;
    public string McpServerId { get; set; } = "lvgl";
    public string ApiKey { get; set; } = string.Empty;
}

public sealed class DesignerSettingsStore
{
    private const string CredentialKey = "nacborui.openrouter.api-key";
    private const string Prefix = "nacborui.designer.";

    public async Task<DesignerSettings> LoadAsync()
    {
        var endpoint = Preferences.Default.Get(Prefix + "mcp-endpoint", string.Empty);
        if (string.IsNullOrWhiteSpace(endpoint))
        {
            endpoint = DeviceInfo.Platform == DevicePlatform.WinUI
                ? "http://127.0.0.1:5302/mcp"
                : DeviceInfo.Platform == DevicePlatform.Android && DeviceInfo.DeviceType == DeviceType.Virtual
                    ? "http://10.0.2.2:5302/mcp"
                    : "http://127.0.0.1:5302/mcp";
        }

        string apiKey;
        try { apiKey = await SecureStorage.Default.GetAsync(CredentialKey) ?? string.Empty; }
        catch { apiKey = string.Empty; }

        return new DesignerSettings
        {
            Provider = Preferences.Default.Get(Prefix + "provider", "openrouter"),
            ModelEndpoint = Preferences.Default.Get(Prefix + "model-endpoint", "https://openrouter.ai/api/v1"),
            Model = Preferences.Default.Get(Prefix + "model", string.Empty),
            McpEndpoint = endpoint,
            McpServerId = Preferences.Default.Get(Prefix + "mcp-server-id", "lvgl"),
            ApiKey = apiKey
        };
    }

    public async Task SaveAsync(DesignerSettings settings)
    {
        Preferences.Default.Set(Prefix + "provider", settings.Provider);
        Preferences.Default.Set(Prefix + "model-endpoint", settings.ModelEndpoint.Trim());
        Preferences.Default.Set(Prefix + "model", settings.Model.Trim());
        Preferences.Default.Set(Prefix + "mcp-endpoint", settings.McpEndpoint.Trim());
        Preferences.Default.Set(Prefix + "mcp-server-id", settings.McpServerId.Trim());
        if (string.IsNullOrWhiteSpace(settings.ApiKey)) SecureStorage.Default.Remove(CredentialKey);
        else await SecureStorage.Default.SetAsync(CredentialKey, settings.ApiKey.Trim());
    }
}

public sealed record DesignerUiMessage(string Role, string Text, string? Reasoning, DateTimeOffset? Timestamp, IReadOnlyList<DesignerUiAttachment> Attachments);
public sealed record DesignerUiLog(DateTimeOffset At, string Kind, string Text);
public sealed record DesignerUiAttachment(string Name, string MimeType, string? PreviewDataUrl, string? TextContent);

public sealed class DesignerSessionAdapter : IAsyncDisposable
{
    private readonly DesignerSettingsStore _settingsStore;
    private readonly UiText _text;
    private DesignerSession? _session;
    private string? _previewDataUrl;
    private string? _previewDescription;
    private string? _lastError;
    private bool _showReasoning;
    private bool _needsReconnect;

    public DesignerSessionAdapter(DesignerSettingsStore settingsStore, UiText text) { _settingsStore = settingsStore; _text = text; }
    public event Action? Changed;
    public DesignerSettings Settings { get; private set; } = new();
    public IReadOnlyList<DesignerUiMessage> Messages { get; private set; } = Array.Empty<DesignerUiMessage>();
    public IReadOnlyList<DesignerUiMessage> PendingMessages { get; private set; } = Array.Empty<DesignerUiMessage>();
    public int PendingCount => _session?.PendingCount ?? 0;
    public bool QueuePaused => _session?.QueuePaused ?? false;
    public void ResumePending() => _session?.ResumePending();
    public IReadOnlyList<DesignerUiLog> Logs { get; private set; } = Array.Empty<DesignerUiLog>();
    public ReasoningCapability Reasoning { get; private set; } = ReasoningCapability.Unknown;
    public bool LoadingReasoning { get; private set; }
    public string ReasoningLevel { get; private set; } = string.Empty;
    public string ReasoningInfo { get; private set; } = "Возможности модели ещё не запрошены";
    private string ReasoningKey => "nacborui.reasoning." + Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes($"{Settings.Provider}\n{Settings.ModelEndpoint}\n{Settings.Model}")));
    public void SetReasoningLevel(string value)
    {
        ReasoningLevel = value;
        if (_session is not null) _session.Options.ReasoningLevel = value;
        Preferences.Default.Set(ReasoningKey, value);
        Changed?.Invoke();
    }
    public async Task RefreshReasoningAsync()
    {
        if (_session is null || string.IsNullOrWhiteSpace(Settings.Model)) return;
        Reasoning = ReasoningCapability.Unknown;
        _session.Options.ModelReasoning = Reasoning;
        _session.Options.ReasoningLevel = null;
        ReasoningLevel = string.Empty;
        LoadingReasoning = true;
        Changed?.Invoke();
        try
        {
            Reasoning = await Task.Run(() => _session.GetReasoningAsync());
            _session.Options.ModelReasoning = Reasoning;
            var saved = Preferences.Default.Get(ReasoningKey, string.Empty);
            var valid = saved.Length == 0 || (Reasoning.Supported &&
                (saved == "on" || (saved == "off" && Reasoning.CanDisable) || Reasoning.Efforts.Contains(saved)));
            SetReasoningLevel(valid ? saved : string.Empty);
            ReasoningInfo = !Reasoning.Known ? "Провайдер не объявил возможности рассуждений" : !Reasoning.Supported ? "Модель не поддерживает рассуждения" : Reasoning.Mandatory ? "Модель рассуждает всегда" : "Настройка применяется к следующему отправленному сообщению";
        }
        catch (Exception ex) { Reasoning = ReasoningCapability.Unknown; ReasoningInfo = SafeError(ex); }
        finally { LoadingReasoning = false; Changed?.Invoke(); }
    }

    public bool IsInitialized => _session is not null;
    public bool IsConnected => _session?.IsConnected == true && !_needsReconnect;
    public bool NeedsReconnect => _needsReconnect;
    public bool IsBusy => _session?.IsBusy ?? false;
    public string Status => _text.Status(_needsReconnect ? "Настройки MCP изменены — переподключитесь" : _session?.Status ?? "Сессия Core ещё не создана.");
    public DesignerUsage? Usage => _session?.Usage;
    public string LiveText => _session?.LiveText ?? string.Empty;
    public string LiveReasoning => _showReasoning ? _session?.LiveReasoning ?? string.Empty : string.Empty;
    public bool ShowReasoning => _showReasoning;
    public string? PreviewDataUrl => _previewDataUrl;
    public async Task CopyPreviewAsync()
    {
        _lastError = null;
        try
        {
            if (string.IsNullOrWhiteSpace(_previewDataUrl)) throw new InvalidOperationException("Сначала получите кадр дисплея.");
            await ImageClipboard.SetPngAsync(_previewDataUrl);
        }
        catch (Exception ex) { _lastError = SafeError(ex); }
        Changed?.Invoke();
    }

    public LayoutDebugState? LayoutDebug { get; private set; }
    public bool UpdatingLayoutDebug { get; private set; }
    public string LayoutDebugHint => !IsConnected ? "Подключите MCP" : LayoutDebug is null
        ? "Устройство не объявило команду диагностики разметки"
        : "Границы и цифры глубины компонентов; проект не изменяется";

    public async Task SetLayoutDebugAsync(LayoutDebugState options, CancellationToken cancellationToken = default)
    {
        if (!IsConnected || IsBusy || UpdatingLayoutDebug || LayoutDebug is null) return;
        UpdatingLayoutDebug = true;
        _lastError = null;
        Changed?.Invoke();
        try
        {
            await Task.Run(() => _session!.SetLayoutDebugAsync(options, cancellationToken), cancellationToken);
            LayoutDebug = options; // The target confirmed execution.
            // Keep the acknowledged settings. A read snapshot can lag behind the completed command.
            await RefreshPreviewCoreAsync(false, cancellationToken);
        }
        catch (Exception ex) { _lastError = SafeError(ex); }
        finally { UpdatingLayoutDebug = false; Changed?.Invoke(); }
    }

    public string? PreviewDescription
    {
        get
        {
            if (string.IsNullOrWhiteSpace(_previewDescription)) return null;
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(_previewDescription);
                var root = doc.RootElement;
                return $"{root.GetProperty("originalWidth")} × {root.GetProperty("originalHeight")} · {_text["кадр"]} {root.GetProperty("width")} × {root.GetProperty("height")}";
            }
            catch { return _text["Последний полученный кадр дисплея"]; }
        }
    }
    public string? LastError => _lastError ?? _session?.LastError;

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        if (_session is not null) return;
        Settings = await _settingsStore.LoadAsync();
        _session = new DesignerSession(ToOptions(Settings));
        _session.Changed += OnSessionChanged;
        await RefreshReasoningAsync();
        OnSessionChanged();
    }

    public async Task SaveSettingsAsync(DesignerSettings settings)
    {
        if (IsBusy || PendingCount > 0) throw new InvalidOperationException("Сначала завершите очередь или начните новый чат.");
        var mcpChanged = !string.Equals(Settings.McpEndpoint.Trim(), settings.McpEndpoint.Trim(), StringComparison.OrdinalIgnoreCase)
            || !string.Equals(Settings.McpServerId.Trim(), settings.McpServerId.Trim(), StringComparison.Ordinal);
        await _settingsStore.SaveAsync(settings);
        Settings = settings;
        if (_session is not null)
        {
            _session.Options.Provider = settings.Provider;
            _session.Options.ModelEndpoint = settings.ModelEndpoint.Trim();
            _session.Options.Model = settings.Model.Trim();
            _session.Options.ApiKey = settings.ApiKey.Trim();
            _session.Options.McpEndpoint = settings.McpEndpoint.Trim();
            _session.Options.McpServerId = string.IsNullOrWhiteSpace(settings.McpServerId) ? "lvgl" : settings.McpServerId.Trim();
        }
        _needsReconnect = mcpChanged && _session?.IsConnected == true;
        await RefreshReasoningAsync();
        _lastError = null;
        Changed?.Invoke();
    }

    // Native Android HTTP/SSE streams must never execute on the WebView/UI context.
    // SPLA still owns every request; only its execution context is selected here.
    public async Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        await InitializeAsync(cancellationToken);
        _lastError = null;
        try
        {
            await Task.Run(() => _session!.ConnectAsync(cancellationToken), cancellationToken);
            _needsReconnect = !_session!.IsConnected;
            LayoutDebug = null;
        }
        catch (Exception ex) { _lastError = SafeError(ex); }
        Changed?.Invoke();
    }

    public async Task SendAsync(string text, IReadOnlyList<ImageAttachment>? images, CancellationToken cancellationToken = default)
    {
        await InitializeAsync(cancellationToken);
        _lastError = null;
        try { await Task.Run(() => _session!.SendAsync(text, images, cancellationToken), cancellationToken); }
        catch (OperationCanceledException) { _lastError = null; }
        catch (Exception ex) { _lastError = SafeError(ex); }
        OnSessionChanged();
    }

    public async Task<IReadOnlyList<string>> GetModelsAsync(DesignerSettings draft, CancellationToken cancellationToken = default)
    {
        await InitializeAsync(cancellationToken);
        await using var catalog = new DesignerSession(ToOptions(draft));
        try { return await Task.Run(() => catalog.GetModelsAsync(cancellationToken), cancellationToken); }
        catch (Exception ex)
        {
            var message = ex.Message;
            foreach (var key in new[] { draft.ApiKey, Settings.ApiKey })
                if (!string.IsNullOrWhiteSpace(key)) message = message.Replace(key, "[REDACTED]", StringComparison.Ordinal);
            throw new InvalidOperationException(message);
        }
    }
    public Task RefreshPreviewAsync(CancellationToken cancellationToken = default) => RefreshPreviewCoreAsync(true, cancellationToken);

    private async Task RefreshPreviewCoreAsync(bool readOptions, CancellationToken cancellationToken)
    {
        await InitializeAsync(cancellationToken);
        _lastError = null;
        try
        {
            var preview = await Task.Run(() => _session!.GetPreviewAsync(1024, cancellationToken), cancellationToken);
            if (readOptions) LayoutDebug = await Task.Run(() => _session!.GetLayoutDebugAsync(cancellationToken), cancellationToken);
            _previewDataUrl = preview?.DataUrl;
            _previewDescription = preview is null ? "Core не вернул кадр." : preview.Metadata;
        }
        catch (Exception ex) { _lastError = SafeError(ex); }
        Changed?.Invoke();
    }

    public void SetDetailedMode(bool value)
    {
        _showReasoning = value;
        OnSessionChanged();
    }

    public void NewChat()
    {
        _session?.NewChat();
        // A new conversation leaves the target display and its last frame intact.
        _lastError = null;
        OnSessionChanged();
    }

    public void Cancel() => _session?.Cancel();
    public void ValidateEnqueue(IReadOnlyList<ImageAttachment>? images) => _session!.ValidateEnqueue(images);

    private string SafeError(Exception exception)
    {
        var message = string.IsNullOrWhiteSpace(_session?.LastError) ? exception.Message : _session.LastError!;
        if (!string.IsNullOrWhiteSpace(Settings.ApiKey))
        {
            message = message.Replace(Settings.ApiKey, "[REDACTED]", StringComparison.Ordinal);
            message = message.Replace(Uri.EscapeDataString(Settings.ApiKey), "[REDACTED]", StringComparison.Ordinal);
        }
        return Regex.Replace(message, @"(?i)(sk-[A-Za-z0-9_-]{8,}|Bearer\s+\S+)", "[REDACTED]");
    }
    private static DesignerOptions ToOptions(DesignerSettings settings) => new()
    {
        Provider = settings.Provider,
        ModelEndpoint = settings.ModelEndpoint,
        Model = settings.Model,
        ApiKey = settings.ApiKey.Trim(),
        McpEndpoint = settings.McpEndpoint,
        McpServerId = string.IsNullOrWhiteSpace(settings.McpServerId) ? "lvgl" : settings.McpServerId.Trim()
    };

    private void OnSessionChanged()
    {
        if (_session is null) return;
        if (_session.Preview is { } frame)
        {
            _previewDataUrl = frame.DataUrl;
            _previewDescription = frame.Metadata;
        }
        Messages = _session.Messages
            .Where(message => message.Role is ChatRole.User || (message.Role is ChatRole.Assistant &&
                (!string.IsNullOrWhiteSpace(message.Content) || message.Images is { Count: > 0 } ||
                 (_showReasoning && !string.IsNullOrWhiteSpace(message.Reasoning)))))
            .Select(message => new DesignerUiMessage(
                message.Role.ToString().ToLowerInvariant(),
                message.Content ?? string.Empty,
                _showReasoning ? message.Reasoning : null,
                new DateTimeOffset(DateTime.SpecifyKind(message.CreatedAt, DateTimeKind.Utc)),
                message.Images?.Select(image => new DesignerUiAttachment(
                    image.Label ?? "изображение",
                    image.Url.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && image.Url.Contains(';') ? image.Url[5..image.Url.IndexOf(';')] : "image/*",
                    image.Url,
                    null)).ToArray() ?? Array.Empty<DesignerUiAttachment>()))
            .ToArray();
        PendingMessages = _session.PendingMessages.Select(message => new DesignerUiMessage(
            "user", message.Content ?? string.Empty, null,
            new DateTimeOffset(DateTime.SpecifyKind(message.CreatedAt, DateTimeKind.Utc)),
            message.Images?.Select(image => new DesignerUiAttachment(image.Label ?? "изображение", "image/*", image.Url, null)).ToArray() ?? Array.Empty<DesignerUiAttachment>())).ToArray();
        Logs = _session.Log.Select(entry => new DesignerUiLog(entry.At, entry.Kind, entry.Text)).ToArray();
        Changed?.Invoke();
    }

    public async ValueTask DisposeAsync()
    {
        if (_session is not null)
        {
            _session.Changed -= OnSessionChanged;
            await _session.DisposeAsync();
            _session = null;
        }
    }
}
