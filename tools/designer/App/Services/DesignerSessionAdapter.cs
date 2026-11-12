using System.Text.RegularExpressions;
using System.Text.Json;
using NaCBORUI.Designer.Core;
using SPLA.Domain.Models;

namespace NaCBORUI.Designer.App.Services;

public sealed class DesignerSettingsStore
{
    private const string CredentialKey = "nacborui.openrouter.api-key";
    private const string Prefix = "nacborui.designer.";
    private const string ConnectionsKey = Prefix + "connections";
    private const string SelectedConnectionKey = Prefix + "selected-connection-id";

    public async Task<DesignerSettings> LoadAsync()
    {
        var legacy = new DesignerConnectionProfile
        {
            Name = "Connection 1",
            ConnectionMode = Enum.TryParse<DesignerConnectionMode>(Preferences.Default.Get(Prefix + "connection-mode", "DirectApi"), out var mode) && Enum.IsDefined(mode)
                ? mode : DesignerConnectionMode.DirectApi,
            DeviceOrigin = Preferences.Default.Get(Prefix + "device-origin", string.Empty),
            McpEndpoint = Preferences.Default.Get(Prefix + "mcp-endpoint", string.Empty),
            ProxyMcpEndpoint = Preferences.Default.Get(Prefix + "proxy-mcp-endpoint", string.Empty),
            McpServerId = Preferences.Default.Get(Prefix + "mcp-server-id", "lvgl")
        };

        string apiKey;
        try { apiKey = await SecureStorage.Default.GetAsync(CredentialKey) ?? string.Empty; }
        catch { apiKey = string.Empty; }

        var settings = new DesignerSettings
        {
            Provider = Preferences.Default.Get(Prefix + "provider", "openrouter"),
            ModelEndpoint = Preferences.Default.Get(Prefix + "model-endpoint", "https://openrouter.ai/api/v1"),
            Model = Preferences.Default.Get(Prefix + "model", string.Empty),
            ApiKey = apiKey
        };
        var storedConnections = Preferences.Default.Get(ConnectionsKey, string.Empty);
        if (string.IsNullOrWhiteSpace(storedConnections))
        {
            // One-time migration: retain every old target address/mode in its own first profile.
            settings.InitializeLegacyConnection(legacy);
            SaveConnectionCatalog(settings);
            SaveLegacyProjection(settings);
        }
        else
        {
            try { settings.Connections = JsonSerializer.Deserialize<List<DesignerConnectionProfile>>(storedConnections) ?? []; }
            catch (JsonException ex) { throw new InvalidOperationException("Saved connection profiles are invalid JSON; settings were not overwritten.", ex); }
            if (settings.Connections.Any(profile => profile is null))
                throw new InvalidOperationException("Saved connection profiles contain a null entry; settings were not overwritten.");
            var persistedSelection = Preferences.Default.Get(SelectedConnectionKey, string.Empty);
            settings.SelectedConnectionId = persistedSelection;
            if (!settings.Connections.Any(profile => profile.Id == settings.SelectedConnectionId))
                settings.SelectedConnectionId = settings.Connections.FirstOrDefault()?.Id ?? string.Empty;
            settings.ValidateConnections();
            if (!string.Equals(settings.SelectedConnectionId, persistedSelection, StringComparison.Ordinal))
                SaveConnectionCatalog(settings);
            SaveLegacyProjection(settings);
        }
        if (OperatingSystem.IsWindows() && !Preferences.Default.Get(Prefix + "t-display-profile-added", false) &&
            settings.Connections.Count < DesignerSettings.MaxConnections)
        {
            if (!settings.Connections.Any(profile => profile.ConnectionMode == DesignerConnectionMode.UsbPreview))
            {
                settings.Connections.Add(new DesignerConnectionProfile { Name = "T-Display-S3", ConnectionMode = DesignerConnectionMode.UsbPreview });
                SaveConnectionCatalog(settings);
            }
            Preferences.Default.Set(Prefix + "t-display-profile-added", true);
        }
        return settings;
    }

    public async Task SaveModelAsync(DesignerSettings settings)
    {
        Preferences.Default.Set(Prefix + "provider", settings.Provider);
        Preferences.Default.Set(Prefix + "model-endpoint", settings.ModelEndpoint.Trim());
        Preferences.Default.Set(Prefix + "model", settings.Model.Trim());
        if (string.IsNullOrWhiteSpace(settings.ApiKey)) SecureStorage.Default.Remove(CredentialKey);
        else await SecureStorage.Default.SetAsync(CredentialKey, settings.ApiKey.Trim());
    }

    public Task SaveConnectionsAsync(DesignerSettings settings)
    {
        settings.CaptureSelectedConnection();
        settings.ValidateConnections();
        SaveConnectionCatalog(settings);
        SaveLegacyProjection(settings);
        return Task.CompletedTask;
    }

    public async Task SaveAsync(DesignerSettings settings)
    {
        await SaveModelAsync(settings);
        await SaveConnectionsAsync(settings);
    }

    private void SaveConnectionCatalog(DesignerSettings settings)
    {
        Preferences.Default.Set(ConnectionsKey, JsonSerializer.Serialize(settings.Connections));
        Preferences.Default.Set(SelectedConnectionKey, settings.SelectedConnectionId);
    }

    private void SaveLegacyProjection(DesignerSettings settings)
    {
        Preferences.Default.Set(Prefix + "connection-mode", settings.ConnectionMode.ToString());
        Preferences.Default.Set(Prefix + "device-origin", settings.DeviceOrigin.Trim());
        Preferences.Default.Set(Prefix + "mcp-endpoint", settings.McpEndpoint.Trim());
        Preferences.Default.Set(Prefix + "proxy-mcp-endpoint", settings.ProxyMcpEndpoint.Trim());
        Preferences.Default.Set(Prefix + "mcp-server-id", settings.McpServerId.Trim());
    }
}

public sealed record DesignerUiMessage(string Role, string Text, string? Reasoning, DateTimeOffset? Timestamp, IReadOnlyList<DesignerUiAttachment> Attachments);
public sealed record DesignerUiLog(DateTimeOffset At, string Kind, string Text);
public sealed record DesignerUiAttachment(string Name, string MimeType, string? PreviewDataUrl, string? TextContent);

public sealed class DesignerSessionAdapter : IAsyncDisposable
{
    private readonly DesignerSettingsStore _settingsStore;
    private readonly UiText _text;
    private readonly IDesignerDirectBridge _directBridge;
    private readonly object _previewGate = new();
    private readonly LatestOnlyAsyncWorker _previewWorker = new();
    private DesignerSession? _session;
#if WINDOWS
    private DesignerMcpListener? _mcpListener;
#endif
    private string? _previewDataUrl;
    private string? _previewDescription;
    private int _previewOriginalWidth;
    private int _previewOriginalHeight;
    private string? _lastError;
    private bool _showReasoning;
    private bool _needsReconnect;
    private bool _previewPointerEnabled = true;
    private bool _progressivePreviewEnabled = true;
    private bool _previewWebSocket;
    private bool _previewLoading;
    private (int Width, int Height) _displaySize;
    private bool _progressivePreviewReady;
    private long _progressiveReceived, _progressiveTotal;
    private string _progressiveRevision = string.Empty;
    private int _progressiveResetVersion;
    private string? _pointerConnectionId;
    private bool _readLayoutDebugPending;
    private bool _disposed;

    public DesignerSessionAdapter(DesignerSettingsStore settingsStore, UiText text, IDesignerDirectBridge directBridge)
    { _settingsStore = settingsStore; _text = text; _directBridge = directBridge; }
    public event Action? Changed;
    public event Action? ProgressivePreviewRequested;
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
    public string? ConnectedProfileName => _session?.IsConnected == true && !_needsReconnect ? Settings.SelectedConnection?.Name : null;
    public bool SupportsPreviewPointer => _session?.SupportsViewInput == true;
    public bool ProgressivePreviewAvailable => IsConnected && _session?.SupportsProgressivePreview == true;
    public bool ProgressivePreview => _progressivePreviewEnabled;
    public bool PreviewWebSocketAvailable => IsConnected && _session?.SupportsFrameWebSocket == true;
    public bool PreviewWebSocketRequired => IsConnected && _session?.RequiresFrameWebSocket == true;
    public bool PreviewWebSocket => PreviewWebSocketAvailable && (_previewWebSocket || PreviewWebSocketRequired);
    public void SetPreviewWebSocket(bool enabled)
    {
        if (!PreviewWebSocketAvailable || PreviewWebSocketRequired || _previewWebSocket == enabled) return;
        _previewWebSocket = enabled;
        ProgressivePreviewRequested?.Invoke();
        Changed?.Invoke();
    }
    public bool PreviewLoading => _previewLoading;
    public long ProgressivePreviewReceived => _progressiveReceived;
    public long ProgressivePreviewTotal => _progressiveTotal;
    public int ProgressivePreviewResetVersion => _progressiveResetVersion;
    public bool HasFreshPreview => IsConnected && _pointerConnectionId is not null &&
        (ProgressivePreviewAvailable ? _progressivePreviewReady : !string.IsNullOrWhiteSpace(_previewDataUrl));
    public bool CanSendPreviewPointer => _previewPointerEnabled && PreviewPointerOptionAvailable;
    public bool PreviewPointerEnabled => CanSendPreviewPointer;
    public bool PreviewPointerOptionAvailable => IsConnected && _pointerConnectionId is not null &&
        SupportsPreviewPointer && PreviewOriginalWidth > 0 && PreviewOriginalHeight > 0;
    public string PreviewPointerConnectionId => _pointerConnectionId ?? string.Empty;
    public int PreviewOriginalWidth => _previewOriginalWidth > 0 ? _previewOriginalWidth : _displaySize.Width;
    public int PreviewOriginalHeight => _previewOriginalHeight > 0 ? _previewOriginalHeight : _displaySize.Height;
    public bool IsBusy => _session?.IsBusy ?? false;
    public string Status => _text.Status(_needsReconnect ? "Настройки подключения изменены — переподключитесь" : _session?.Status ?? "Сессия Core ещё не создана.");
    public DesignerUsage? Usage => _session?.Usage;
    public string LiveText => _session?.LiveText ?? string.Empty;
    public string LiveReasoning => _showReasoning ? _session?.LiveReasoning ?? string.Empty : string.Empty;
    public bool ShowReasoning => _showReasoning;
    public string? PreviewDataUrl => _needsReconnect || ProgressivePreviewAvailable ? null : _previewDataUrl;
    public void SetProgressivePreviewEnabled(bool enabled)
    {
        if (!ProgressivePreviewAvailable || _progressivePreviewEnabled == enabled) return;
        _progressivePreviewEnabled = enabled;
        ProgressivePreviewRequested?.Invoke();
        Changed?.Invoke();
    }
    public void ReportProgressiveFrame(int width, int height, long received, long total, string revision, string connectionId, bool ready)
    {
        if (!ProgressivePreviewAvailable || !IsConnected || !string.Equals(connectionId, _pointerConnectionId, StringComparison.Ordinal)) return;
        if (width is < 0 or > 8192 || height is < 0 or > 8192 || (long)width * height > 2_097_152 || received is < 0 or > 8_388_662 || total is < 0 or > 8_388_662)
            return;
        if (width > 0 && height > 0)
        {
            _previewOriginalWidth = width;
            _previewOriginalHeight = height;
        }
        _previewLoading = !ready;
        if (total > 0)
        {
            _progressiveReceived = received;
            _progressiveTotal = total;
        }
        if (revision.Length <= 10 && revision.All(char.IsDigit)) _progressiveRevision = revision;
        if (ready && width > 0 && height > 0) _progressivePreviewReady = true;
        Changed?.Invoke();
    }
    public void ReportProgressiveFrameError(string message, string connectionId)
    {
        if (!ProgressivePreviewAvailable || !string.Equals(connectionId, _pointerConnectionId, StringComparison.Ordinal)) return;
        _previewLoading = false;
        _lastError = SafeError(new InvalidOperationException(message));
        Changed?.Invoke();
    }
    public async Task CopyPreviewAsync()
    {
        _lastError = null;
        try
        {
            if (_needsReconnect || string.IsNullOrWhiteSpace(_previewDataUrl)) throw new InvalidOperationException("Сначала подключитесь к текущему профилю и получите кадр дисплея.");
            await ImageClipboard.SetPngAsync(_previewDataUrl);
        }
        catch (Exception ex) { _lastError = SafeError(ex); }
        Changed?.Invoke();
    }

    public async Task CopyPreviewDataUrlAsync(string dataUrl)
    {
        _lastError = null;
        try
        {
            if (_needsReconnect || string.IsNullOrWhiteSpace(dataUrl) || !dataUrl.StartsWith("data:image/png;base64,", StringComparison.Ordinal) || dataUrl.Length > 11_184_832)
                throw new InvalidOperationException("Сначала получите кадр дисплея.");
            await ImageClipboard.SetPngAsync(dataUrl);
        }
        catch (Exception ex) { _lastError = SafeError(ex); }
        Changed?.Invoke();
    }

    public LayoutDebugState? LayoutDebug { get; private set; }
    public bool UpdatingLayoutDebug { get; private set; }
    public void SetPreviewPointerEnabled(bool enabled)
    {
        _previewPointerEnabled = enabled && PreviewPointerOptionAvailable;
        Changed?.Invoke();
    }

    public async Task SendPreviewPointerAsync(int x, int y, bool pressed, string connectionId,
        CancellationToken cancellationToken = default)
    {
        var session = _session;
        if (session is null || !session.IsConnected || !session.SupportsViewInput ||
            string.IsNullOrWhiteSpace(connectionId) || !string.Equals(connectionId, _pointerConnectionId, StringComparison.Ordinal))
            return;
        if (pressed && (!CanSendPreviewPointer || x < 0 || y < 0 || x >= PreviewOriginalWidth || y >= PreviewOriginalHeight))
            return;

        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(2));
        try
        {
            await Task.Run(() => session.SendViewInputAsync(x, y, pressed, deadline.Token), deadline.Token);
            if (!pressed && !PreviewWebSocketRequired && Settings.ConnectionMode != DesignerConnectionMode.UsbPreview)
                RequestPreviewRefresh(readLayoutDebug: false);
        }
        catch (OperationCanceledException) when (deadline.IsCancellationRequested) { }
        catch (Exception ex) { ReportPreviewPointerError(SafeError(ex)); }
    }

    public void ReportPreviewPointerError(string message)
    {
        if (string.IsNullOrWhiteSpace(message)) return;
        _lastError = SafeError(new InvalidOperationException(message));
        Changed?.Invoke();
    }
    public string LayoutDebugHint => !IsConnected ? "Подключите MCP" : LayoutDebug is null
        ? "Устройство не объявило команду диагностики разметки"
        : "Границы и цифры глубины компонентов; проект не изменяется";

    public async Task SetLayoutDebugAsync(LayoutDebugState options, CancellationToken cancellationToken = default)
    {
        if (!IsConnected || UpdatingLayoutDebug || LayoutDebug is null) return;
        UpdatingLayoutDebug = true;
        _lastError = null;
        Changed?.Invoke();
        try
        {
            await Task.Run(() => _session!.SetLayoutDebugAsync(options, cancellationToken), cancellationToken);
            LayoutDebug = options; // The target confirmed execution.
            // The ACK is enough to release the controls. A latest-only worker updates the frame later.
            RequestPreviewRefresh(readLayoutDebug: false);
        }
        catch (Exception ex) { _lastError = SafeError(ex); }
        finally { UpdatingLayoutDebug = false; Changed?.Invoke(); }
    }

    public string? PreviewDescription
    {
        get
        {
            if (ProgressivePreviewAvailable && _progressivePreviewReady)
                return $"{_previewOriginalWidth} × {_previewOriginalHeight} · {_text["кадр"]}";
            if (_needsReconnect || string.IsNullOrWhiteSpace(_previewDescription)) return null;
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
        _session = new DesignerSession(ToOptions(Settings), directBridge: _directBridge);
        _session.Changed += OnSessionChanged;
        await RefreshReasoningAsync();
        OnSessionChanged();
    }

    public Task InitializeBrowserToolsAsync(Func<Func<Task>, Task> rendererDispatch, CancellationToken cancellationToken = default)
    {
        if (_directBridge is BrowserToolsBridge browser) browser.SetRendererDispatcher(rendererDispatch);
        return _directBridge.InitializeAsync(cancellationToken);
    }

    public async Task SaveModelSettingsAsync(DesignerSettings settings)
    {
        if (IsBusy || PendingCount > 0) throw new InvalidOperationException("Сначала завершите очередь или начните новый чат.");
        await _settingsStore.SaveModelAsync(settings);
        Settings.Provider = settings.Provider.Trim();
        Settings.ModelEndpoint = settings.ModelEndpoint.Trim();
        Settings.Model = settings.Model.Trim();
        Settings.ApiKey = settings.ApiKey.Trim();
        if (_session is not null)
        {
            _session.Options.Provider = Settings.Provider;
            _session.Options.ModelEndpoint = Settings.ModelEndpoint;
            _session.Options.Model = Settings.Model;
            _session.Options.ApiKey = Settings.ApiKey;
        }
        // Publish a new settings snapshot so the active tab refreshes while the other tab's draft stays private.
        Settings = Settings.Clone();
        await RefreshReasoningAsync();
        _lastError = null;
        Changed?.Invoke();
    }

    public async Task SaveConnectionSettingsAsync(DesignerSettings settings)
    {
        if (IsBusy || PendingCount > 0) throw new InvalidOperationException("Сначала завершите очередь или начните новый чат.");
        await ApplyTargetSettingsAsync(settings, preserveActiveSelection: true);
    }

    public async Task SelectConnectionAsync(string connectionId)
    {
        if (IsBusy || PendingCount > 0) throw new InvalidOperationException("Сначала завершите очередь или начните новый чат.");
        var draft = Settings.Clone();
        if (!draft.SelectConnection(connectionId)) throw new InvalidOperationException("Выбранное подключение отсутствует в каталоге.");
        await ApplyTargetSettingsAsync(draft, preserveActiveSelection: false);
    }

    private async Task ApplyTargetSettingsAsync(DesignerSettings settings, bool preserveActiveSelection)
    {
        var target = preserveActiveSelection
            ? settings.WithCatalogEditsPreservingActive(Settings.SelectedConnectionId)
            : settings.Clone();
        if (!preserveActiveSelection)
        {
            target.CaptureSelectedConnection();
            if (string.IsNullOrWhiteSpace(target.SelectedConnectionId) || !target.SelectConnection(target.SelectedConnectionId))
                throw new InvalidOperationException("Select an existing connection profile.");
            target.ValidateConnections();
        }
        if (string.IsNullOrWhiteSpace(target.SelectedConnectionId))
            throw new InvalidOperationException("Select an existing connection profile.");

        var targetChanged = !string.Equals(Settings.SelectedConnectionId, target.SelectedConnectionId, StringComparison.Ordinal) ||
            Settings.ConnectionMode != target.ConnectionMode ||
            !string.Equals(Settings.DeviceOrigin.Trim(), target.DeviceOrigin.Trim(), StringComparison.OrdinalIgnoreCase) ||
            !string.Equals(Settings.UsbPort.Trim(), target.UsbPort.Trim(), StringComparison.OrdinalIgnoreCase) ||
            !string.Equals(Settings.McpEndpoint.Trim(), target.McpEndpoint.Trim(), StringComparison.OrdinalIgnoreCase) ||
            !string.Equals(Settings.ProxyMcpEndpoint.Trim(), target.ProxyMcpEndpoint.Trim(), StringComparison.OrdinalIgnoreCase) ||
            !string.Equals(Settings.McpServerId.Trim(), target.McpServerId.Trim(), StringComparison.Ordinal);
        await _settingsStore.SaveConnectionsAsync(target);
        Settings.Connections = target.Connections.Select(profile => profile.Clone()).ToList();
        Settings.SelectedConnectionId = target.SelectedConnectionId;
        Settings.ApplySelectedConnection();
        if (_session is not null)
        {
            _session.Options.ConnectionMode = target.ConnectionMode;
            _session.Options.DeviceOrigin = target.DeviceOrigin.Trim();
            _session.Options.UsbPort = target.UsbPort.Trim();
            _session.Options.McpEndpoint = target.McpEndpoint.Trim();
            _session.Options.ProxyMcpEndpoint = target.ProxyMcpEndpoint.Trim();
            _session.Options.McpServerId = string.IsNullOrWhiteSpace(target.McpServerId) ? "lvgl" : target.McpServerId.Trim();
        }
        _needsReconnect = _needsReconnect || targetChanged && _session?.IsConnected == true;
        if (targetChanged)
        {
            InvalidatePreview(clearPreview: true);
            _previewDataUrl = null;
            _previewDescription = null;
            _previewOriginalWidth = 0;
            _previewOriginalHeight = 0;
            LayoutDebug = null;
            _session?.ClearPreview();
        }
        // The panel refreshes only its active draft from this new snapshot.
        Settings = Settings.Clone();
        _lastError = null;
        Changed?.Invoke();
    }

    public async Task SaveSettingsAsync(DesignerSettings settings)
    {
        await SaveModelSettingsAsync(settings);
        await SaveConnectionSettingsAsync(settings);
    }

    // Native Android HTTP/SSE streams must never execute on the WebView/UI context.
    // SPLA still owns every request; only its execution context is selected here.
    public async Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        await InitializeAsync(cancellationToken);
        InvalidatePreview(clearPreview: true);
        _pointerConnectionId = null;
        _session?.ClearPreview();
        _lastError = null;
        try
        {
#if WINDOWS
            if (_mcpListener is not null) await _mcpListener.DisposeAsync();
            _mcpListener = null;
#endif
            await Task.Run(() => _session!.ConnectAsync(cancellationToken), cancellationToken);
            _needsReconnect = !_session!.IsConnected;
            _pointerConnectionId = _session.IsConnected ? Guid.NewGuid().ToString("N") : null;
            LayoutDebug = null;
#if WINDOWS
            if (!_needsReconnect)
            {
                try { _mcpListener = await DesignerMcpListener.StartAsync(_session, () => IsConnected); }
                catch (Exception ex) { _lastError = SafeError(ex); }
            }
#endif
            if (_pointerConnectionId is not null)
            {
                using var metadataDeadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                metadataDeadline.CancelAfter(TimeSpan.FromSeconds(2));
                try { _displaySize = await Task.Run(() => _session.GetPreviewDisplaySizeAsync(metadataDeadline.Token), metadataDeadline.Token); }
                catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { }
            }
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
    public async Task RefreshPreviewAsync(CancellationToken cancellationToken = default)
    {
        await InitializeAsync(cancellationToken);
        RequestPreviewRefresh(readLayoutDebug: true);
    }

    private void RequestPreviewRefresh(bool readLayoutDebug)
    {
        lock (_previewGate)
        {
            if (_disposed || _session?.IsConnected != true || _needsReconnect) return;
            _readLayoutDebugPending |= readLayoutDebug;
        }
        _previewWorker.Request(RunPreviewWorkerAsync);
    }

    private async Task RunPreviewWorkerAsync(int generation, long requestVersion, CancellationToken token)
    {
        DesignerSession? session = _session;
        bool readLayoutDebug;
        lock (_previewGate)
        {
            readLayoutDebug = _readLayoutDebugPending;
            _readLayoutDebugPending = false;
        }

        try
        {
            if (session is null || !session.IsConnected) return;
            var direct = ProgressivePreviewAvailable;
            if (!direct && IsCurrentPreviewRequest(generation, requestVersion, session))
            {
                _previewLoading = true;
                Changed?.Invoke();
            }
            var preview = direct ? null : await Task.Run(() => session.GetPreviewAsync(1024, token), token);
            var layoutDebug = readLayoutDebug
                ? await Task.Run(() => session.GetLayoutDebugAsync(token), token)
                : null;
            if ((preview is not null || ProgressivePreviewAvailable) && IsCurrentPreviewRequest(generation, requestVersion, session))
            {
                if (preview is not null)
                {
                    _previewDataUrl = preview.DataUrl;
                    _previewDescription = preview.Metadata;
                    ReadOriginalDimensions(preview.Metadata, out _previewOriginalWidth, out _previewOriginalHeight);
                }
                if (readLayoutDebug) LayoutDebug = layoutDebug;
                _lastError = null;
                Changed?.Invoke();
                if (ProgressivePreviewAvailable) ProgressivePreviewRequested?.Invoke();
            }
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
        catch (Exception ex)
        {
            if (IsCurrentPreviewRequest(generation, requestVersion, session))
            {
                _lastError = SafeError(ex);
                Changed?.Invoke();
            }
        }
        finally
        {
            if (!ProgressivePreviewAvailable && _previewLoading && IsCurrentPreviewRequest(generation, requestVersion, session))
            {
                _previewLoading = false;
                Changed?.Invoke();
            }
        }
    }

    private bool IsCurrentPreviewRequest(int generation, long requestVersion, DesignerSession? session)
    {
        return !_disposed && generation == _previewWorker.Generation && requestVersion == _previewWorker.RequestVersion && ReferenceEquals(_session, session) &&
                _session?.IsConnected == true && !_needsReconnect;
    }

    private void InvalidatePreview(bool clearPreview)
    {
        lock (_previewGate)
        {
            _readLayoutDebugPending = false;
        }
        _previewWorker.Invalidate();
        if (clearPreview)
        {
            _previewDataUrl = null;
            _previewDescription = null;
            _previewOriginalWidth = 0;
            _previewOriginalHeight = 0;
            LayoutDebug = null;
            _progressiveResetVersion++;
            _progressivePreviewReady = false;
            _displaySize = default;
            _previewLoading = false;
            _progressiveReceived = _progressiveTotal = 0;
            _progressiveRevision = string.Empty;
        }
    }

    private static void ReadOriginalDimensions(string metadata, out int width, out int height)
    {
        width = 0;
        height = 0;
        try
        {
            using var document = JsonDocument.Parse(metadata);
            var root = document.RootElement;
            if (root.TryGetProperty("originalWidth", out var w) && w.TryGetInt32(out var parsedWidth)) width = parsedWidth;
            if (root.TryGetProperty("originalHeight", out var h) && h.TryGetInt32(out var parsedHeight)) height = parsedHeight;
        }
        catch (JsonException) { }
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
        ConnectionMode = settings.ConnectionMode,
        DeviceOrigin = settings.DeviceOrigin.Trim(),
        UsbPort = settings.UsbPort.Trim(),
        Provider = settings.Provider,
        ModelEndpoint = settings.ModelEndpoint,
        Model = settings.Model,
        ApiKey = settings.ApiKey.Trim(),
        McpEndpoint = settings.McpEndpoint,
        ProxyMcpEndpoint = settings.ProxyMcpEndpoint,
        McpServerId = string.IsNullOrWhiteSpace(settings.McpServerId) ? "lvgl" : settings.McpServerId.Trim()
    };

    private void OnSessionChanged()
    {
        if (_session is null) return;
        if (!_previewWorker.IsRunning && IsConnected && _session.Preview is { } frame)
        {
            _previewDataUrl = frame.DataUrl;
            _previewDescription = frame.Metadata;
            ReadOriginalDimensions(frame.Metadata, out _previewOriginalWidth, out _previewOriginalHeight);
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
        _disposed = true;
        InvalidatePreview(clearPreview: true);
        _previewWorker.Dispose();
#if WINDOWS
        if (_mcpListener is not null) await _mcpListener.DisposeAsync();
#endif
        if (_session is not null)
        {
            _session.Changed -= OnSessionChanged;
            await _session.DisposeAsync();
            _session = null;
        }
        await _directBridge.DisposeAsync();
    }
}
