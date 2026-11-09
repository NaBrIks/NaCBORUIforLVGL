// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using SPLA.Agent;
using SPLA.Agent.Accounting;
using SPLA.Agent.Guards;
using SPLA.Domain.Llm;
using SPLA.Domain.Llm.Middleware;
using SPLA.Domain.Models;
using SPLA.Domain.Settings;
using SPLA.LLM.OpenAiCompat;
using SPLA.LLM.OpenRouter;
using SPLA.Mcp.Client;

namespace NaCBORUI.Designer.Core;

/// <summary>
/// Thin application composition over SPLA. SPLA owns OpenAI transport, streaming, dialects,
/// tool-call decoding, conversation history, agent loop, MCP handshake, discovery and calls.
/// No filesystem/shell plugins, ASP.NET host or second agent loop is constructed here.
/// </summary>
public sealed partial class DesignerSession : IAsyncDisposable
{
    private readonly HttpClient _http;
    private readonly bool _ownsHttp;
    private readonly ILoggerFactory _loggers;
    private readonly OpenAiCompatibleClient _plainClient;
    private readonly OpenRouterProvider _openRouter;
    private readonly ILlmGateway _gateway;
    private readonly Conversation _conversation = new();
    private IReadOnlyList<ChatMessage> _messages = [];
    private readonly SemaphoreSlim _operations = new(1, 1);
    private readonly object _logGate = new();
    private readonly List<DesignerLogEntry> _log = [];
    private readonly ProviderStateStore _providerState = new();
    private McpServerSession? _mcp;
    private McpToolHostAdapter? _tools;
    private CancellationTokenSource? _activeOperation;
    private string _chatId = Guid.NewGuid().ToString("N");
    private bool _disposed;

    public DesignerSession(DesignerOptions options, ILoggerFactory? loggerFactory = null, HttpClient? httpClient = null)
    {
        Options = options ?? throw new ArgumentNullException(nameof(options));
        _loggers = loggerFactory ?? NullLoggerFactory.Instance;
        _http = httpClient ?? new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
        _ownsHttp = httpClient is null;
        _plainClient = new OpenAiCompatibleClient(_http, _loggers.CreateLogger<OpenAiCompatibleClient>());
        _openRouter = new OpenRouterProvider(_http, _loggers, appTitle: "NaCBORUI Designer");
        var providers = new LlmProviderRegistry()
            .Register(new LlmProviderDescriptor { Id = "openai", DisplayName = "OpenAI compatible", Client = _plainClient })
            .Register(_openRouter);
        _gateway = new LlmPipelineBlueprint()
            .Use(new RateLimitRetryMiddleware())
            .Use(new RepetitionGuardMiddleware(_loggers.CreateLogger<RepetitionGuardMiddleware>()))
            .Use(new TurnOutcomeMiddleware())
            .Use(new ProviderStateMiddleware(_providerState))
            .Use(new TokenAccountingMiddleware(_usageStore))
            .Use(new RequestPacingMiddleware(new RequestPacer()))
            .Build(new ProviderClientResolver(providers));
        SeedPrompt();
    }

    public DesignerOptions Options { get; }
    public IReadOnlyList<ChatMessage> Messages => Volatile.Read(ref _messages);
    public IReadOnlyList<DesignerLogEntry> Log { get { lock (_logGate) return _log.ToArray(); } }
    public string Status { get; private set; } = "Не подключено";
    public string? LastError { get; private set; }
    public bool IsBusy { get; private set; }
    public bool IsConnected => _mcp?.State == McpSessionState.Ready;
    public string LiveText { get; private set; } = string.Empty;
    public string LiveReasoning { get; private set; } = string.Empty;
    public LlmTurnResult? LastTurn { get; private set; }
    public DesignerPreview? Preview { get; private set; }
    public IReadOnlyList<ToolDefinition> Tools => _tools?.GetToolDefinitions().ToArray() ?? [];
    /// <summary>Raised on the publishing thread. A UI must marshal rendering through its dispatcher.</summary>
    public event Action? Changed;

    public async Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        if (PendingCount > 0) throw new InvalidOperationException("Finish or clear queued messages before reconnecting MCP.");
        await BeginOperationAsync(cancellationToken);
        try
        {
            if (!McpToolNaming.IsValidServerId(Options.McpServerId))
                throw new ArgumentException("MCP server id must start with a lowercase letter and contain at most 16 lowercase letters, digits or underscores.");
            if (Options.McpTransport == McpTransportKind.Http) ValidateHttpUrl(Options.McpEndpoint, "MCP endpoint");
            if (Options.McpTransport == McpTransportKind.Stdio && OperatingSystem.IsAndroid())
                throw new PlatformNotSupportedException("Android requires an MCP Streamable HTTP endpoint; it cannot launch the desktop Node.js stdio adapter.");
            await DisconnectAsync();
            var spec = new McpServerSpec(Options.McpServerId, Options.McpTransport)
            {
                Url = Options.McpEndpoint,
                Command = Options.McpCommand,
                Args = Options.McpArguments.ToArray(),
                WorkingDirectory = Options.McpWorkingDirectory,
                Env = new Dictionary<string, string>(Options.McpEnvironment),
                Headers = new Dictionary<string, string>(Options.McpHeaders),
                Timeout = Options.McpTimeout
            };
            _mcp = new McpServerSession(spec,
                transportFactory: value => value.Transport == McpTransportKind.Http
                    ? new HttpTransport(value, _loggers.CreateLogger<HttpTransport>(), _http)
                    : new StdioTransport(value, _loggers.CreateLogger<StdioTransport>()),
                logger: _loggers.CreateLogger<McpServerSession>());
            _mcp.StateChanged += McpStateChanged;
            _tools = new McpToolHostAdapter(_mcp, text => AddLog("MCP", text));
            Status = "Подключение MCP";
            Notify();
            await _mcp.ConnectAsync(_activeOperation!.Token);
            Status = $"MCP: {_mcp.Tools.Count} инструментов";
            AddLog("MCP", $"Connected to {_mcp.ServerName ?? spec.Id}; {_mcp.Tools.Count} tools discovered by SPLA.");
        }
        catch (OperationCanceledException) { Status = "Подключение отменено"; throw; }
        catch (Exception ex) { RecordError(ex); throw; }
        finally { EndOperation(); }
    }

    private async Task RunPromptAsync(ChatMessage message, LLMSettings settings, CancellationToken cancellationToken)
    {
        var beforeTurn = _conversation.Count;
        try
        {
            if (!IsConnected || _tools is null) throw new InvalidOperationException("Connect an MCP server before sending a designer request.");
            _conversation.Add(message);
            LiveText = LiveReasoning = string.Empty;
            Status = "Модель отвечает";
            Notify();
            // This is SPLA's existing, single engine. This application does not implement a loop.
            var orchestrator = new ConversationOrchestrator(_gateway, _tools)
            {
                EnableLoopGuard = true,
                ToolImages = ToolImagesMode.Last
            };
            await orchestrator.RunAsync(_conversation, settings, AgentMode.Edit, new AgentCallbacks
            {
                OnLlmTurnStart = _ => { PublishMessages(); LiveText = LiveReasoning = string.Empty; Status = "Модель отвечает"; Notify(); return Task.CompletedTask; },
                OnDelta = chunk => { LiveText += chunk; Notify(); return Task.CompletedTask; },
                OnReasoning = chunk => { LiveReasoning += chunk; Notify(); return Task.CompletedTask; },
                OnAssistantMessage = _ => { PublishMessages(); LiveText = LiveReasoning = string.Empty; Notify(); return Task.CompletedTask; },
                OnToolCallStarted = call => { Status = call.Function.Name; AddLog("tool", call.Function.Name); return Task.CompletedTask; },
                OnToolResult = (call, result) =>
                {
                    PublishMessages();
                    CapturePreview(result);
                    AddLog("result", $"{call.Function.Name}: {result.Outcome}");
                    return Task.CompletedTask;
                },
                OnNotice = notice => { AddLog("notice", notice); return Task.CompletedTask; },
                OnAttempt = _ => { LiveText = LiveReasoning = string.Empty; Notify(); },
                OnLlmTurn = turn => { LastTurn = turn; Notify(); }
            }, cancellationToken);
            Status = "Готово";
        }
        catch (OperationCanceledException)
        {
            // Use SPLA's canonical history operation to remove any incomplete tool-call/reply batch.
            _conversation.TruncateTo(Math.Min(beforeTurn + 1, _conversation.Count));
            LiveText = LiveReasoning = string.Empty;
            Status = "Ожидание остановлено";
            AddLog("cancel", "Stopped waiting for this turn. Completed target operations remain applied; an in-flight MCP write can still finish. Inspect the target before retrying.");
            throw;
        }
        catch (Exception ex)
        {
            _conversation.TruncateTo(Math.Min(beforeTurn + 1, _conversation.Count));
            LiveText = LiveReasoning = string.Empty;
            RecordError(ex);
            throw;
        }
        finally { PublishMessages(); }
    }

    public void NewChat()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (!_operations.Wait(0)) throw new InvalidOperationException("Stop the active operation before starting a new chat.");
        try
        {
            ClearPendingPrompts();
            _conversation.Clear();
            _chatId = Guid.NewGuid().ToString("N");
            LiveText = LiveReasoning = string.Empty;
            LastTurn = null;
            LastError = null;
            SeedPrompt();
            Status = IsConnected ? "Новый чат" : "Не подключено";
        }
        finally { _operations.Release(); }
        Notify();
    }

    public void Cancel() => PausePendingPrompts();

    public async Task<IReadOnlyList<string>> GetModelsAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ValidateProvider();
        ValidateHttpUrl(Options.ModelEndpoint, "Model endpoint");
        var client = Options.Provider.Equals("openrouter", StringComparison.OrdinalIgnoreCase)
            ? (OpenAiCompatibleClient)_openRouter.Client : _plainClient;
        return await client.GetModelsAsync(Options.ModelEndpoint, Options.ApiKey, cancellationToken);
    }

    public async Task<ReasoningCapability> GetReasoningAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ValidateProvider();
        ValidateHttpUrl(Options.ModelEndpoint, "Model endpoint");
        var model = await GetSelectedModelMetadataAsync(cancellationToken);
        return model?.Reasoning ?? ReasoningCapability.Unknown;
    }

    public async Task<ToolResult> InvokeToolAsync(string remoteName, string argumentsJson,
        CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        var tools = _tools;
        if (!IsConnected || tools is null) throw new InvalidOperationException("MCP is not connected.");
        var result = await tools.ExecuteToolAsync(AgentMode.Edit, tools.NameFor(remoteName), argumentsJson, cancellationToken);
        CapturePreview(result);
        AddLog("tool", $"{remoteName}: {result.Outcome}");
        return result;
    }

    public async Task<DesignerPreview?> GetPreviewAsync(int maxEdge = 1024, CancellationToken cancellationToken = default)
    {
        if (maxEdge is < 128 or > 1024) throw new ArgumentOutOfRangeException(nameof(maxEdge), "maxEdge must be between 128 and 1024.");
        var result = await InvokeToolAsync("get_display_frame", JsonSerializer.Serialize(new { maxEdge }), cancellationToken);
        if (result.IsError) throw new InvalidOperationException(result.TextContent);
        if (result.Content.OfType<ToolImage>().FirstOrDefault() is not { } image)
            throw new InvalidOperationException("get_display_frame returned no image.");
        return new DesignerPreview($"data:{image.MimeType};base64,{image.Data}", image.MimeType, result.TextContent);
    }

    private LLMSettings CreateLlmSettings()
    {
        ValidateProvider();
        ValidateHttpUrl(Options.ModelEndpoint, "Model endpoint");
        if (string.IsNullOrWhiteSpace(Options.Model)) throw new ArgumentException("Select a model before sending a request.");
        return new LLMSettings
        {
            Provider = Options.Provider,
            BaseUrl = Options.ModelEndpoint,
            ModelName = Options.Model,
            ApiKey = Options.ApiKey,
            ConnectionId = $"{Options.Provider}:{Options.ModelEndpoint}",
            SessionId = _chatId,
            Temperature = Options.Temperature,
            MaxTokens = Options.MaxTokens,
            ReasoningLevel = Options.ReasoningLevel,
            ModelReasoning = Options.ModelReasoning,
            Mode = AgentMode.Edit
        };
    }

    private void ValidateProvider()
    {
        if (!Options.Provider.Equals("openai", StringComparison.OrdinalIgnoreCase) &&
            !Options.Provider.Equals("openrouter", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Provider must be openai or openrouter.");
    }

    private static void ValidateHttpUrl(string value, string label)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https"))
            throw new ArgumentException($"{label} must be an absolute HTTP or HTTPS URL.");
    }

    private void SeedPrompt()
    {
        var prompt = string.IsNullOrWhiteSpace(Options.SystemPrompt) ? ReadOriginalPrompts() : Options.SystemPrompt;
        _conversation.Add(new ChatMessage { Role = ChatRole.System, Content = prompt });
        PublishMessages();
    }

    private static string ReadOriginalPrompts()
    {
        var assembly = typeof(DesignerSession).Assembly;
        return "Use exact tool names from the connected MCP catalog; SPLA prefixes them with the configured server id.\n\n" +
            string.Join("\n\n", new[] { "System", "Layout", "Styles" }.Select(name =>
            {
                using var stream = assembly.GetManifestResourceStream($"NaCBORUI.Designer.Prompts.{name}.md")
                    ?? throw new InvalidOperationException($"Missing original assistant prompt: {name}.");
                using var reader = new StreamReader(stream);
                return reader.ReadToEnd();
            }));
    }

    private async Task BeginOperationAsync(CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (!await _operations.WaitAsync(0, cancellationToken)) throw new InvalidOperationException("An operation is already running.");
        _activeOperation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        IsBusy = true;
        LastError = null;
        Notify();
    }

    private void EndOperation()
    {
        PublishMessages();
        var operation = Interlocked.Exchange(ref _activeOperation, null);
        operation?.Dispose();
        IsBusy = false;
        _operations.Release();
        Notify();
    }

    private void McpStateChanged(McpServerSession session)
    {
        if (!IsBusy) Status = session.State == McpSessionState.Ready ? "MCP подключено" : "MCP отключено";
        if (session.LastError is not null) LastError = Redact(session.LastError);
        Notify();
    }

    private void CapturePreview(ToolResult result)
    {
        if (result.Content.OfType<ToolImage>().FirstOrDefault() is not { } image) return;
        Preview = new DesignerPreview($"data:{image.MimeType};base64,{image.Data}", image.MimeType, result.TextContent);
        Notify();
    }

    private void RecordError(Exception exception)
    {
        LastError = Redact(exception.Message);
        Status = "Ошибка";
        AddLog("error", exception.Message);
    }

    private void AddLog(string kind, string text)
    {
        text = Redact(text);
        lock (_logGate)
        {
            _log.Add(new DesignerLogEntry(DateTimeOffset.UtcNow, kind, text.Length > 2000 ? text[..2000] : text));
            if (_log.Count > 200) _log.RemoveRange(0, _log.Count - 200);
        }
        Notify();
    }

    private string Redact(string text) => string.IsNullOrEmpty(Options.ApiKey)
        ? text : text.Replace(Options.ApiKey, "[redacted]", StringComparison.Ordinal);

    private void PublishMessages() => Volatile.Write(ref _messages, _conversation.Messages.ToArray());

    private void Notify()
    {
        foreach (var handler in Changed?.GetInvocationList() ?? [])
            try { ((Action)handler)(); } catch { /* A rendering subscriber must not break an agent turn. */ }
    }

    private async Task DisconnectAsync()
    {
        _tools?.Dispose();
        _tools = null;
        if (_mcp is null) return;
        _mcp.StateChanged -= McpStateChanged;
        await _mcp.DisposeAsync();
        _mcp = null;
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;
        Cancel();
        await _operations.WaitAsync();
        try { ClearPendingPrompts(); await DisconnectAsync(); if (_ownsHttp) _http.Dispose(); }
        finally { _operations.Release(); }
    }
}
