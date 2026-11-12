// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using NaCBORUI.Designer.Core;
using NaCBORUI.Designer.App.Services;
using SPLA.Domain.Models;

if (args is ["--live", var endpoint])
{
    await using var live = new DesignerSession(new DesignerOptions { ConnectionMode = DesignerConnectionMode.NativeMcp, McpEndpoint = endpoint });
    await live.ConnectAsync();
    Console.WriteLine($"LIVE connected: {live.Tools.Count} tools");
    foreach (var tool in live.Tools) Console.WriteLine(tool.Function.Name);
    var status = await live.InvokeToolAsync("get_project_status", "{}");
    Check(!status.IsError, "Real NaWServer MCP get_project_status");
    Console.WriteLine(status.TextContent);
    var reference = await live.InvokeToolAsync("get_ui_reference", "{\"kind\":\"screen\",\"topic\":\"index\"}");
    Check(!reference.IsError && reference.TextContent.Contains("topics"), "Real SPLA MCP authoring reference after prompt relocation");
    var frame = await live.GetPreviewAsync(512);
    Check(frame?.MimeType == "image/png" && frame.DataUrl.Length > 100, "Real NaWServer MCP get_display_frame image");
    Console.WriteLine($"LIVE preview: {frame!.MimeType}, {frame.DataUrl.Length} data-URL characters");
    Console.WriteLine(frame.Metadata);
    Console.WriteLine("LIVE PASS: read-only connect/catalog/status/display, no LLM call or device mutation.");
    return;
}
// In-memory HTTP responses exercise SPLA's real transports. No alternate product/test listener.
using var handler = new TranscriptHandler();
using var http = new HttpClient(handler);
var options = new DesignerOptions
{
    ConnectionMode = DesignerConnectionMode.NativeMcp,
    ModelEndpoint = "https://models.example.test/v1",
    Model = "fixture-vision",
    ApiKey = "fixture-not-a-secret",
    McpEndpoint = "http://mcp.example.test:5301/mcp",
    SystemPrompt = "Use the advertised MCP tools to inspect the requested LVGL display."
};
await using var session = new DesignerSession(options, httpClient: http);
var updates = 0;
session.Changed += () => updates++;
await session.ConnectAsync();
Check(session.IsConnected && session.Tools.Count == 2, "SPLA discovers the complete configured catalog");
Check(!session.SupportsViewInput, "Targets without the optional preview-input tool cannot accept pointer input");
Check(handler.SessionHeaders >= 2, "SPLA carries MCP session and negotiated version headers");
Check((await session.GetModelsAsync()).SequenceEqual(["fixture-vision"]), "SPLA model discovery");
await session.SendAsync("Inspect this reference", [new ImageAttachment("data:image/png;base64," + TranscriptHandler.Png, "reference.png")]);
Check(handler.ModelCalls == 2 && handler.ToolCalls == 1, "SPLA runs tool call and resumes the model exactly once");
Check(session.Messages.Count(message => message.Role == ChatRole.Tool) == 1, "SPLA owns canonical tool reply history");
Check(session.Messages.Last().Content == "Display inspected.", "SPLA assembles streamed final text");
Check(session.Preview?.DataUrl.StartsWith("data:image/png;base64,", StringComparison.Ordinal) == true, "SPLA MCP image blocks reach the UI preview");
Check(handler.Requests[0]["messages"]!.AsArray().Any(message => message?["content"] is JsonArray), "Image attachments reach SPLA's multimodal wire serializer");
Check(handler.Requests[1]["messages"]!.AsArray().Any(message => message?["role"]?.GetValue<string>() == "tool"), "Tool result returns to the next SPLA model call");
Check(session.Messages.Any(message => message.Images?.Any(image => image.Label == "reference.png") == true), "User references survive tool feedback replacement");
var preview = await session.GetPreviewAsync(256);
Check(preview?.MimeType == "image/png", "Explicit preview delegates through SPLA MCP");
await session.SendAsync("Keep the existing design");
Check(handler.Requests.Last()["messages"]!.AsArray().Any(message => message?["content"]?.ToString() == "Display inspected."), "Next turn retains prior SPLA conversation");
handler.DelayModel = true;
var running = session.SendAsync("Cancel this turn");
await handler.ModelEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
session.Cancel();
try { await running; throw new InvalidOperationException("Cancellation was ignored."); }
catch (OperationCanceledException) { }
Check(!session.IsBusy && session.Status == "Ожидание остановлено", "Cancellation reaches the SPLA transport and releases session state");
handler.DelayModel = false;
handler.FailModel = true;
try { await session.SendAsync("Report a provider error"); throw new InvalidOperationException("Provider error was ignored."); }
catch (SPLA.Domain.Interfaces.LlmRequestException) { }
Check(session.LastError?.Contains(options.ApiKey, StringComparison.Ordinal) == false &&
    session.Log.All(entry => !entry.Text.Contains(options.ApiKey, StringComparison.Ordinal)), "Provider errors redact the API key");
session.NewChat();
Check(session.Messages.Count == 1 && session.Messages[0].Role == ChatRole.System, "NewChat uses SPLA's canonical history reset");
Check(updates > 10, "State and stream updates are observable by the UI");
await CheckQueuedPromptsAsync();
await CheckReportedUsageAsync();
await CheckDirectTargetAsync();
await CheckLatestOnlyPreviewWorkerAsync();
await CheckLayoutDebugAckDuringBlockedPreviewAsync();
await CheckDeviceRestartStopsTurnAsync();
CheckConnectionProfiles();
var rendered = NaCBORUI.Designer.App.Services.MarkdownRenderer.ToSafeHtml("**Ready**\n\n`code`");
Check(rendered.Contains("<strong>Ready</strong>") && rendered.Contains("<code>code</code>"), "Chat renders normal Markdown");
var unsafeMarkup = NaCBORUI.Designer.App.Services.MarkdownRenderer.ToSafeHtml("<svg onload=alert(1)>\n\n[link](javascript:alert(1))\n\n[link](https://example.test){onclick=alert(1)}");
Check(!unsafeMarkup.Contains("<svg", StringComparison.OrdinalIgnoreCase) &&
    !unsafeMarkup.Contains("href=\"javascript:", StringComparison.OrdinalIgnoreCase) &&
    !System.Text.RegularExpressions.Regex.IsMatch(unsafeMarkup, @"<[^>]+on(?:click|load|error)\s*=", System.Text.RegularExpressions.RegexOptions.IgnoreCase),
    "Chat rejects raw HTML, executable link schemes and generated event attributes");
Console.WriteLine("PASS: integration, SPLA inbox queue/Stop/resume, and Markdown presentation/security assertions; no network listener, no SPLA source changes.");

static async Task CheckQueuedPromptsAsync()
{
    using var handler = new TranscriptHandler();
    using var http = new HttpClient(handler);
    var options = new DesignerOptions
    {
        ConnectionMode = DesignerConnectionMode.NativeMcp,
        ModelEndpoint = "https://models.example.test/v1", Model = "fixture-vision",
        McpEndpoint = "http://mcp.example.test:5301/mcp", SystemPrompt = "Queue fixture.",
        ReasoningLevel = "low",
        ModelReasoning = new ReasoningCapability { Known = true, Supported = true, Efforts = ["low", "high"] }
    };
    await using var session = new DesignerSession(options, httpClient: http);
    await session.ConnectAsync();
    handler.DelayModel = true;
    var first = session.SendAsync("First queued turn");
    await handler.ModelEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
    options.ReasoningLevel = "high";
    var images = new List<ImageAttachment> { new("data:image/png;base64," + TranscriptHandler.Png, "queued.png") };
    var second = session.SendAsync("Second queued turn", images);
    images.Clear();
    options.ReasoningLevel = "low";
    var third = session.SendAsync("Third queued turn");
    Check(session.IsBusy && session.PendingCount == 2 && handler.ModelCalls == 1,
        "Busy Send uses SPLA inbox without overlapping LLM calls");
    Check(session.PendingMessages.Select(message => message.Content).SequenceEqual(["Second queued turn", "Third queued turn"]) &&
        session.PendingMessages[0].Images?.Single().Label == "queued.png", "Pending UI snapshots retain FIFO text and owned image lists");
    try { session.NewChat(); throw new InvalidOperationException("Reset interrupted an active turn."); }
    catch (InvalidOperationException ex) when (ex.Message.Contains("Stop the active")) { }
    try { await session.ConnectAsync(); throw new InvalidOperationException("Reconnect ignored queued input."); }
    catch (InvalidOperationException ex) when (ex.Message.Contains("queued messages")) { }
    handler.ReleaseModel();
    await Task.WhenAll(first, second, third).WaitAsync(TimeSpan.FromSeconds(10));
    Check(!session.IsBusy && session.PendingCount == 0 && handler.ModelCalls == 4,
        "SPLA completes three FIFO user turns with one complete tool loop");
    Check(session.Messages.Where(message => message.Role == ChatRole.User && message.Content?.EndsWith("queued turn", StringComparison.Ordinal) == true).Select(message => message.Content)
        .SequenceEqual(["First queued turn", "Second queued turn", "Third queued turn"]), "Queued human history stays in send order");
    Check(handler.Requests[0]["reasoning_effort"]?.GetValue<string>() == "low" &&
        handler.Requests[1]["reasoning_effort"]?.GetValue<string>() == "low" &&
        handler.Requests[2]["reasoning_effort"]?.GetValue<string>() == "high" &&
        handler.Requests[3]["reasoning_effort"]?.GetValue<string>() == "low",
        "Each queued turn captures reasoning without changing its active tool loop");
    Check(handler.Requests[2]["messages"]!.AsArray().Any(message => message?["content"] is JsonArray) &&
        session.Messages.Any(message => message.Images?.Any(image => image.Label == "queued.png") == true),
        "Queued images reach SPLA wire serialization and survive history feedback");

    handler.ResetModelDelay();
    var stopped = session.SendAsync("Stop active only");
    await handler.ModelEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
    var retained = session.SendAsync("Retained after Stop", [new ImageAttachment("data:image/png;base64," + TranscriptHandler.Png, "retained.png")]);
    var retainedLast = session.SendAsync("Retained second");
    var callsAtStop = handler.ModelCalls;
    session.Cancel();
    try { await stopped; throw new InvalidOperationException("Stop was ignored."); }
    catch (OperationCanceledException) { }
    await Task.Delay(30);
    Check(session.QueuePaused && !session.IsBusy && session.PendingCount == 2 &&
        !retained.IsCompleted && !retainedLast.IsCompleted && handler.ModelCalls == callsAtStop,
        "Stop cancels active transport and disarms waking while retaining queued human prompts");
    handler.ReleaseModel();
    session.ResumePending();
    await Task.WhenAll(retained, retainedLast).WaitAsync(TimeSpan.FromSeconds(10));
    Check(!session.QueuePaused && !session.IsBusy && session.PendingCount == 0 &&
        session.Messages.Any(message => message.Images?.Any(image => image.Label == "retained.png") == true),
        "Explicit Resume runs retained prompts with their images");

    handler.ResetModelDelay();
    stopped = session.SendAsync("Pause again");
    await handler.ModelEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
    retained = session.SendAsync("Older retained prompt");
    session.Cancel();
    try { await stopped; } catch (OperationCanceledException) { }
    handler.ReleaseModel();
    var nextHuman = session.SendAsync("New human resumes");
    await Task.WhenAll(retained, nextHuman).WaitAsync(TimeSpan.FromSeconds(10));
    Check(session.Messages.Where(message => message.Role == ChatRole.User).TakeLast(2).Select(message => message.Content)
        .SequenceEqual(["Older retained prompt", "New human resumes"]), "Next human message resumes older retained prompts first");

    // Stop while a later message from an already drained SPLA batch is active.
    handler.ResetModelDelay();
    var batchHead = session.SendAsync("Batch head");
    await handler.ModelEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
    var middleEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var middleCall = handler.ModelCalls + 1;
    handler.BeforeModel = async (call, ct) =>
    {
        if (call != middleCall) return;
        middleEntered.TrySetResult();
        await Task.Delay(Timeout.InfiniteTimeSpan, ct);
    };
    var batchMiddle = session.SendAsync("Batch middle");
    var batchTail = session.SendAsync("Drained batch tail");
    handler.ReleaseModel();
    await batchHead;
    await middleEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
    var newerTail = session.SendAsync("Newer inbox tail");
    Check(session.PendingMessages.Select(message => message.Content).SequenceEqual(["Drained batch tail", "Newer inbox tail"]),
        "Pending snapshots stay ordered after earlier completion and new enqueue");
    session.Cancel();
    try { await batchMiddle; } catch (OperationCanceledException) { }
    Check(session.QueuePaused && session.PendingCount == 2, "Stop retains drained batch suffix and newer inbox arrivals");
    handler.BeforeModel = null;
    session.ResumePending();
    await Task.WhenAll(batchTail, newerTail).WaitAsync(TimeSpan.FromSeconds(10));
    Check(session.Messages.Where(message => message.Role == ChatRole.User).TakeLast(2).Select(message => message.Content)
        .SequenceEqual(["Drained batch tail", "Newer inbox tail"]), "Resume preserves FIFO across drained batch and later inbox arrivals");

    handler.ResetModelDelay();
    stopped = session.SendAsync("Stop before explicit reset");
    await handler.ModelEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
    retained = session.SendAsync("Clear only with NewChat");
    session.Cancel();
    try { await stopped; } catch (OperationCanceledException) { }
    session.NewChat();
    try { await retained; throw new InvalidOperationException("NewChat retained its old queue."); }
    catch (OperationCanceledException) { }
    Check(session.PendingCount == 0 && !session.QueuePaused && session.Messages.Count == 1,
        "Explicit NewChat clears paused inbox and its pending tasks");

    handler.ResetModelDelay();
    stopped = session.SendAsync("Admission active");
    await handler.ModelEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
    var accepted = Enumerable.Range(0, DesignerSession.MaxPendingPrompts)
        .Select(index => session.SendAsync($"Bounded pending {index}")).ToArray();
    var admissionModelCalls = handler.ModelCalls;
    var beforeRejectedMessages = session.Messages.ToArray();
    var beforeRejectedPending = session.PendingMessages.ToArray();
    try { session.ValidateEnqueue(); throw new InvalidOperationException("Queue admission ignored the count cap."); }
    catch (InvalidOperationException ex) when (ex.Message.Contains("8")) { }
    try { await session.SendAsync("Rejected ninth waiting prompt"); throw new InvalidOperationException("Send ignored the count cap."); }
    catch (InvalidOperationException ex) when (ex.Message.Contains("8")) { }
    Check(session.PendingCount == 8 && session.PendingMessages.SequenceEqual(beforeRejectedPending) &&
        session.Messages.SequenceEqual(beforeRejectedMessages) && handler.ModelCalls == admissionModelCalls,
        "Preflight and definitive Send reject a ninth waiting prompt without queue/history changes");
    session.Cancel();
    try { await stopped; } catch (OperationCanceledException) { }
    session.NewChat();
    foreach (var pending in accepted) try { await pending; } catch (OperationCanceledException) { }

    handler.ResetModelDelay();
    stopped = session.SendAsync("Image admission active");
    await handler.ModelEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
    // Never delivered to the model: this pending input is explicitly cleared below.
    var cappedUrl = new string('a', DesignerSession.MaxPendingImageUrlCharacters);
    var capped = session.SendAsync("At image URL cap", [new ImageAttachment(cappedUrl, "bounded.png")]);
    beforeRejectedMessages = session.Messages.ToArray();
    beforeRejectedPending = session.PendingMessages.ToArray();
    var oneCharacter = new[] { new ImageAttachment("x", "over-limit.png") };
    try { session.ValidateEnqueue(oneCharacter); throw new InvalidOperationException("Preflight ignored image cap."); }
    catch (InvalidOperationException ex) when (ex.Message.Contains("16")) { }
    try { await session.SendAsync("Rejected image overflow", oneCharacter); throw new InvalidOperationException("Send ignored image cap."); }
    catch (InvalidOperationException ex) when (ex.Message.Contains("16")) { }
    Check(session.PendingCount == 1 && session.PendingMessages.SequenceEqual(beforeRejectedPending) &&
        session.Messages.SequenceEqual(beforeRejectedMessages),
        "Combined queued image URL admission rejects overflow before changing queue/history");
    session.Cancel();
    try { await stopped; } catch (OperationCanceledException) { }
    session.NewChat();
    try { await capped; } catch (OperationCanceledException) { }

}

static async Task CheckReportedUsageAsync()
{
    using var handler = new TranscriptHandler();
    using var http = new HttpClient(handler);
    var options = new DesignerOptions
    {
        ConnectionMode = DesignerConnectionMode.NativeMcp,
        ModelEndpoint = "https://models.example.test/v1", Model = "fixture-vision",
        McpEndpoint = "http://mcp.example.test:5301/mcp", SystemPrompt = "Usage fixture."
    };
    await using var session = new DesignerSession(options, httpClient: http);
    Check(session.Usage.InputTokens is null && session.Usage.OutputTokens is null &&
        session.Usage.SessionTotalTokens is null && session.Usage.ContextUsedTokens is null,
        "Usage starts unknown before the provider reports counters");
    Check(await session.GetContextLengthAsync() is null && !(await session.GetReasoningAsync()).Known && handler.ModelCatalogCalls == 0,
        "Generic provider capability and context remain unknown without invented estimates");
    options.Provider = "openrouter";
    var reasoning = session.GetReasoningAsync();
    var context = session.GetContextLengthAsync();
    await Task.WhenAll(reasoning, context);
    Check((await reasoning).Known && (await reasoning).Supported && await context == 32768 &&
        session.Usage.ContextLimitTokens == 32768 && handler.ModelCatalogCalls == 1,
        "Reasoning and context share one SPLA selected-model catalog request");
    await session.ConnectAsync();
    await session.SendAsync("Inspect usage");
    var usage = session.Usage;
    Check(usage.InputTokens == 30 && usage.OutputTokens == 10 && usage.TotalTokens == 40 && usage.ContextUsedTokens == 30 &&
        usage.SessionInputTokens == 60 && usage.SessionOutputTokens == 20 && usage.SessionTotalTokens == 80,
        "Provider usage and SPLA middleware totals include both calls of a tool turn");
    handler.OmitUsage = true;
    await session.SendAsync("Provider omits usage");
    usage = session.Usage;
    Check(usage.InputTokens is null && usage.OutputTokens is null && usage.TotalTokens is null && usage.ContextUsedTokens is null &&
        usage.SessionInputTokens is null && usage.SessionOutputTokens is null && usage.SessionTotalTokens is null,
        "Missing provider counters remain unknown rather than zero or a tokenizer estimate");
    options.Model = "uncatalogued-model";
    Check(session.Usage.ContextLimitTokens is null && await session.GetContextLengthAsync() is null && handler.ModelCatalogCalls == 2,
        "Changing model invalidates catalog limit and missing models stay unknown");
    session.NewChat();
    Check(session.Usage.ContextUsedTokens is null && session.Usage.InputTokens is null, "NewChat clears last-context display");
}

static async Task CheckDirectTargetAsync()
{
    var bridge = new FixtureDirectBridge();
    var options = new DesignerOptions
    {
        ConnectionMode = DesignerConnectionMode.DirectApi,
        DeviceOrigin = "http://127.0.0.1:5301",
        SystemPrompt = "Direct target fixture."
    };
    await using var session = new DesignerSession(options, directBridge: bridge);
    await session.ConnectAsync();
    Check(session.IsConnected && session.Tools.Count == 6 && bridge.Origin == "http://127.0.0.1:5301",
        "Direct API discovers its complete browser-codec catalog through the injected bridge");
    Check(session.SupportsViewInput, "Direct target exposes preview input only when its tool is advertised");
    Check(session.SupportsProgressivePreview && session.SupportsFramePackets,
        "Direct API exposes progressive preview only when native frame capabilities are advertised");
    var read = await session.InvokeToolAsync("read_project", "{}");
    Check(!read.IsError && read.TextContent.Contains("format") && bridge.Calls.Last().Name == "read_project",
        "Direct API forwards a tool call through the same SPLA IToolHost adapter");
    var frame = await session.GetPreviewAsync(256);
    Check(frame?.MimeType == "image/png" && frame.DataUrl.Contains(TranscriptHandler.Png, StringComparison.Ordinal) &&
        bridge.Calls.Last().Name == "get_display_frame",
        "Direct API tool image blocks reach the existing preview path");
    var debug = await session.GetLayoutDebugAsync();
    Check(debug is { Levels.Length: 1, MaxDepth: 1 } && bridge.Calls.TakeLast(2).Select(call => call.Name)
        .SequenceEqual(["get_data_catalog", "get_data"]),
        "Direct API retains the optional layout-debug data tools");
    await session.SetLayoutDebugAsync(debug!);
    Check(bridge.Calls.Last().Name == "invoke_action", "Direct API sends layout-debug settings through the advertised action");
    await session.SendViewInputAsync(37, 24, true);
    using (var input = JsonDocument.Parse(bridge.Calls.Last().Arguments))
        Check(bridge.Calls.Last().Name == "send_view_input" && input.RootElement.GetProperty("x").GetInt32() == 37 &&
            input.RootElement.GetProperty("y").GetInt32() == 24 && input.RootElement.GetProperty("pressed").GetBoolean(),
            "Core forwards preview input through the same advertised target tool");
}

static void CheckConnectionProfiles()
{
    var legacy = new DesignerConnectionProfile
    {
        Name = "Legacy target", ConnectionMode = DesignerConnectionMode.NativeMcp,
        DeviceOrigin = "http://device.test", McpEndpoint = "http://device.test/mcp",
        ProxyMcpEndpoint = "http://proxy.test/mcp", McpServerId = "board_a"
    };
    var settings = new DesignerSettings();
    settings.InitializeLegacyConnection(legacy);
    Check(settings.SelectedConnectionId == legacy.Id && settings.DeviceOrigin == legacy.DeviceOrigin &&
        settings.McpEndpoint == legacy.McpEndpoint && settings.ProxyMcpEndpoint == legacy.ProxyMcpEndpoint,
        "Legacy flat endpoints migrate intact into the first connection profile");

    var proxy = new DesignerConnectionProfile
    {
        Name = "Proxy", ConnectionMode = DesignerConnectionMode.ProxyMcp,
        ProxyMcpEndpoint = "http://proxy2.test/mcp", McpServerId = "proxy_a"
    };
    settings.DeviceOrigin = "http://edited-device.test";
    settings.Connections.Add(proxy);
    Check(settings.SelectConnection(proxy.Id) && legacy.DeviceOrigin == "http://edited-device.test" &&
        settings.ConnectionMode == DesignerConnectionMode.ProxyMcp && settings.ProxyMcpEndpoint == proxy.ProxyMcpEndpoint,
        "Selecting a profile captures edits on the old profile and projects the new target");

    var draft = settings.Clone();
    draft.SelectedConnection!.ProxyMcpEndpoint = "http://draft-only.test/mcp";
    Check(!ReferenceEquals(settings.Connections, draft.Connections) &&
        !ReferenceEquals(settings.Connections[1], draft.Connections[1]) &&
        proxy.ProxyMcpEndpoint != draft.SelectedConnection.ProxyMcpEndpoint,
        "Settings drafts deep-clone profiles without changing live settings");

    var devicesDraft = settings.Clone();
    devicesDraft.SelectedConnection!.Name = "Edited proxy profile";
    var preservedActive = devicesDraft.WithCatalogEditsPreservingActive(legacy.Id);
    Check(preservedActive.SelectedConnectionId == legacy.Id && preservedActive.Connections.Single(profile => profile.Id == proxy.Id).Name == "Edited proxy profile",
        "Saving catalog edits to another row preserves the active target while retaining the edit");
    var deleteActiveDraft = devicesDraft.Clone();
    deleteActiveDraft.Connections.RemoveAll(profile => profile.Id == legacy.Id);
    var fallback = deleteActiveDraft.WithCatalogEditsPreservingActive(legacy.Id);
    Check(fallback.SelectedConnectionId == proxy.Id, "Deleting the active target chooses the remaining catalog profile");

    var deletedId = draft.SelectedConnectionId;
    Check(draft.RemoveConnection(deletedId) && draft.Connections.Count == 1 &&
        draft.SelectedConnectionId == legacy.Id && draft.SelectedConnection?.ProxyMcpEndpoint != "http://draft-only.test/mcp",
        "Deleting the selected profile chooses a remaining profile without resurrecting the deleted one");
    Check(!draft.RemoveConnection(legacy.Id) && draft.Connections.Count == 1,
        "The final connection profile cannot be deleted");
}

static async Task CheckLatestOnlyPreviewWorkerAsync()
{
    using (var worker = new LatestOnlyAsyncWorker())
    {
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var completed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var runs = 0;
        var active = 0;
        var maximumActive = 0;
        var skippedIntermediate = false;
        var latestRan = false;
        var latestVersionCurrent = false;
        worker.Request(async (_, _, token) =>
        {
            Interlocked.Increment(ref runs);
            var nowActive = Interlocked.Increment(ref active);
            maximumActive = Math.Max(maximumActive, nowActive);
            started.TrySetResult();
            try { await release.Task.WaitAsync(token); }
            finally { Interlocked.Decrement(ref active); }
        });
        await started.Task.WaitAsync(TimeSpan.FromSeconds(2));
        worker.Request((_, _, _) => { skippedIntermediate = true; return Task.CompletedTask; });
        worker.Request((_, requestVersion, _) =>
        {
            latestRan = true;
            latestVersionCurrent = requestVersion == worker.RequestVersion;
            Interlocked.Increment(ref runs);
            var nowActive = Interlocked.Increment(ref active);
            maximumActive = Math.Max(maximumActive, nowActive);
            Interlocked.Decrement(ref active);
            completed.TrySetResult();
            return Task.CompletedTask;
        });
        Check(worker.IsPending, "Rapid preview refresh requests coalesce to one pending job behind the current frame");
        release.TrySetResult();
        await completed.Task.WaitAsync(TimeSpan.FromSeconds(2));
        Check(runs == 2 && latestRan && latestVersionCurrent && !skippedIntermediate && maximumActive == 1,
            "Latest-only frame worker runs no overlapping requests and skips superseded refresh work");
    }

    using (var worker = new LatestOnlyAsyncWorker())
    {
        var oldStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var newDone = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var oldCanceled = false;
        var active = 0;
        var maximumActive = 0;
        worker.Request(async (_, _, token) =>
        {
            Interlocked.Increment(ref active);
            oldStarted.TrySetResult();
            try { await Task.Delay(Timeout.InfiniteTimeSpan, token); }
            catch (OperationCanceledException) when (token.IsCancellationRequested) { oldCanceled = true; }
            finally { Interlocked.Decrement(ref active); }
        });
        await oldStarted.Task.WaitAsync(TimeSpan.FromSeconds(2));
        var oldGeneration = worker.Generation;
        worker.Invalidate();
        worker.Request((generation, _, _) =>
        {
            var nowActive = Interlocked.Increment(ref active);
            maximumActive = Math.Max(maximumActive, nowActive);
            Check(generation > oldGeneration, "A new connection receives a fresh preview generation");
            Interlocked.Decrement(ref active);
            newDone.TrySetResult();
            return Task.CompletedTask;
        });
        await newDone.Task.WaitAsync(TimeSpan.FromSeconds(2));
        Check(oldCanceled && maximumActive == 1, "Invalidation cancels stale-host frame work before starting the new generation");
    }
}

static async Task CheckDeviceRestartStopsTurnAsync()
{
    using var handler = new TranscriptHandler();
    using var http = new HttpClient(handler);
    var bridge = new FixtureDirectBridge { RestartedReceipt = true };
    await using var session = new DesignerSession(new DesignerOptions
    {
        ConnectionMode = DesignerConnectionMode.DirectApi, DeviceOrigin = "http://127.0.0.1:5301",
        ModelEndpoint = "https://models.example.test/v1", Model = "fixture-vision",
        SystemPrompt = "Restart fixture."
    }, httpClient: http, directBridge: bridge);
    await session.ConnectAsync();
    try { await session.SendAsync("Read a receipt"); throw new Exception("Restart was ignored"); }
    catch (InvalidOperationException ex) when (ex.Message.Contains("перезапустилось")) { }
    Check(handler.ModelCalls == 1 && !session.IsBusy && session.LastError?.Contains("перезапустилось") == true,
        "Explicit target restart stops the SPLA turn before another provider call");
    Check(session.Log.Any(entry => entry.Text.Contains("deviceRestarted")), "Detailed tool log retains the actual receipt state");
}

static async Task CheckLayoutDebugAckDuringBlockedPreviewAsync()
{
    using var handler = new TranscriptHandler { DelayModel = true };
    using var http = new HttpClient(handler);
    var bridge = new FixtureDirectBridge();
    bridge.BlockFrames();
    var options = new DesignerOptions
    {
        ConnectionMode = DesignerConnectionMode.DirectApi,
        DeviceOrigin = "http://127.0.0.1:5301",
        ModelEndpoint = "https://models.example.test/v1", Model = "fixture-vision",
        SystemPrompt = "Concurrent controls fixture."
    };
    await using var session = new DesignerSession(options, httpClient: http, directBridge: bridge);
    await session.ConnectAsync();
    var modelTask = session.SendAsync("Keep this turn waiting");
    await handler.ModelEntered.Task.WaitAsync(TimeSpan.FromSeconds(2));
    Check(session.IsBusy, "Fixture has a real in-flight model request");
    var frameTask = session.GetPreviewAsync();
    await bridge.FrameStarted.Task.WaitAsync(TimeSpan.FromSeconds(2));
    var layout = await session.GetLayoutDebugAsync();
    var firstAck = session.SetLayoutDebugAsync(layout!);
    await firstAck.WaitAsync(TimeSpan.FromSeconds(2));
    var secondAck = session.SetLayoutDebugAsync(layout! with { Opacity = 159 });
    await secondAck.WaitAsync(TimeSpan.FromSeconds(2));
    Check(!frameTask.IsCompleted && bridge.Calls.Count(call => call.Name == "invoke_action") >= 2,
        "Layout-debug ACKs remain independently usable while a frame request is blocked");
    bridge.ReleaseFrames();
    await frameTask.WaitAsync(TimeSpan.FromSeconds(2));
    Check(session.IsBusy, "Preview and diagnostic controls complete before the model turn ends");
    session.Cancel();
    try { await modelTask; } catch (OperationCanceledException) { }
}

static void Check(bool condition, string name)
{
    if (!condition) throw new InvalidOperationException("FAIL: " + name);
    Console.WriteLine("PASS: " + name);
}

sealed class TranscriptHandler : HttpMessageHandler
{
    public const string Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9kAAAAASUVORK5CYII=";
    public int ModelCalls { get; private set; }
    public int ToolCalls { get; private set; }
    public int SessionHeaders { get; private set; }
    public bool DelayModel { get; set; }
    public bool FailModel { get; set; }
    public bool OmitUsage { get; set; }
    public int ModelCatalogCalls { get; private set; }
    public TaskCompletionSource ModelEntered { get; private set; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private TaskCompletionSource ModelRelease { get; set; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public void ReleaseModel() { DelayModel = false; ModelRelease.TrySetResult(); }
    public void ResetModelDelay()
    {
        ModelEntered = new(TaskCreationOptions.RunContinuationsAsynchronously);
        ModelRelease = new(TaskCreationOptions.RunContinuationsAsynchronously);
        DelayModel = true;
    }
    public List<JsonNode> Requests { get; } = [];
    public Func<int, CancellationToken, Task>? BeforeModel { get; set; }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (request.RequestUri!.AbsolutePath == "/v1/models")
        {
            ModelCatalogCalls++;
            return Json(new JsonObject { ["data"] = new JsonArray(new JsonObject
            {
                ["id"] = "fixture-vision", ["context_length"] = 32768,
                ["supported_parameters"] = new JsonArray("tools", "reasoning")
            }) });
        }
        var body = JsonNode.Parse(await request.Content!.ReadAsStringAsync(cancellationToken))!;
        if (request.RequestUri.AbsolutePath == "/mcp")
        {
            var method = body["method"]!.GetValue<string>();
            if (method != "initialize" && request.Headers.Contains("Mcp-Session-Id") && request.Headers.Contains("MCP-Protocol-Version")) SessionHeaders++;
            if (method == "notifications/initialized") return new HttpResponseMessage(HttpStatusCode.Accepted);
            JsonNode result = method switch
            {
                "initialize" => new JsonObject
                {
                    ["protocolVersion"] = body["params"]!["protocolVersion"]!.DeepClone(),
                    ["capabilities"] = new JsonObject { ["tools"] = new JsonObject() },
                    ["serverInfo"] = new JsonObject { ["name"] = "in-memory-lvgl", ["version"] = "1" }
                },
                "tools/list" => new JsonObject { ["tools"] = new JsonArray(Tool("get_display_frame"), Tool("write_source")) },
                "tools/call" => FrameResult(body),
                _ => throw new InvalidOperationException("Unexpected MCP method: " + method)
            };
            var response = Json(new JsonObject { ["jsonrpc"] = "2.0", ["id"] = body["id"]!.DeepClone(), ["result"] = result });
            response.Headers.Add("Mcp-Session-Id", "fixture-session");
            return response;
        }
        if (request.RequestUri.AbsolutePath != "/v1/chat/completions") throw new InvalidOperationException("Unexpected URL: " + request.RequestUri);
        Requests.Add(body.DeepClone());
        ModelCalls++;
        if (BeforeModel is not null) await BeforeModel(ModelCalls, cancellationToken);
        if (DelayModel)
        {
            ModelEntered.TrySetResult();
            await ModelRelease.Task.WaitAsync(cancellationToken);
        }
        if (FailModel) return new HttpResponseMessage(HttpStatusCode.Unauthorized)
        {
            Content = new StringContent("{\"error\":{\"message\":\"Rejected fixture-not-a-secret\"}}", Encoding.UTF8, "application/json")
        };
        var delta = ModelCalls == 1
            ? JsonNode.Parse("""{"tool_calls":[{"index":0,"id":"fixture-call","type":"function","function":{"name":"lvgl_get_display_frame","arguments":"{\"maxEdge\":256}"}}]}""")!
            : new JsonObject { ["content"] = "Display inspected." };
        var chunk = new JsonObject
        {
            ["model"] = "fixture-vision",
            ["choices"] = new JsonArray(new JsonObject { ["delta"] = delta, ["finish_reason"] = ModelCalls == 1 ? "tool_calls" : "stop" }),
            ["usage"] = new JsonObject { ["prompt_tokens"] = 30, ["completion_tokens"] = 10 }
        };
        if (OmitUsage) chunk.Remove("usage");
        return new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("data: " + chunk.ToJsonString() + "\n\ndata: [DONE]\n\n", Encoding.UTF8, "text/event-stream")
        };
    }

    private JsonNode FrameResult(JsonNode request)
    {
        CheckToolName(request["params"]!["name"]!.GetValue<string>());
        ToolCalls++;
        return new JsonObject
        {
            ["content"] = new JsonArray(
                new JsonObject { ["type"] = "text", ["text"] = "{\"width\":1,\"height\":1}" },
                new JsonObject { ["type"] = "image", ["mimeType"] = "image/png", ["data"] = Png })
        };
    }

    private static void CheckToolName(string name)
    {
        if (name != "get_display_frame") throw new InvalidOperationException("SPLA did not remove its proxy prefix correctly.");
    }

    private static JsonNode Tool(string name) => new JsonObject
    {
        ["name"] = name,
        ["description"] = "Fixture tool",
        ["inputSchema"] = new JsonObject { ["type"] = "object", ["properties"] = new JsonObject() }
    };
    private static HttpResponseMessage Json(JsonNode value) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(value.ToJsonString(), Encoding.UTF8, "application/json")
    };
}

sealed class FixtureDirectBridge : IDesignerDirectBridge
{
    public bool RestartedReceipt { get; set; }
    public string? Origin { get; private set; }
    public List<(string Name, string Arguments)> Calls { get; } = [];
    public TaskCompletionSource FrameStarted { get; private set; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private TaskCompletionSource? FrameRelease { get; set; }
    public void BlockFrames()
    {
        FrameStarted = new(TaskCreationOptions.RunContinuationsAsynchronously);
        FrameRelease = new(TaskCreationOptions.RunContinuationsAsynchronously);
    }
    public void ReleaseFrames() => FrameRelease?.TrySetResult();
    public Task InitializeAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task<string> ConnectAsync(string requestJson, CancellationToken cancellationToken)
    {
        using var request = JsonDocument.Parse(requestJson);
        Origin = request.RootElement.GetProperty("origin").GetString();
        return Task.FromResult("""{"tools":[{"name":"read_project","description":"Read project","inputSchema":{"type":"object","properties":{},"additionalProperties":false},"annotations":{"readOnlyHint":true}},{"name":"get_display_frame","description":"Capture frame","inputSchema":{"type":"object","properties":{"maxEdge":{"type":"integer"}}},"annotations":{"readOnlyHint":true}},{"name":"get_data_catalog","description":"Read catalog","inputSchema":{"type":"object","properties":{}},"annotations":{"readOnlyHint":true}},{"name":"get_data","description":"Read values","inputSchema":{"type":"object","properties":{}},"annotations":{"readOnlyHint":true}},{"name":"invoke_action","description":"Invoke target action","inputSchema":{"type":"object","properties":{}},"annotations":{"readOnlyHint":false,"destructiveHint":true}},{"name":"send_view_input","description":"Send preview pointer input","inputSchema":{"type":"object","properties":{"x":{"type":"integer"},"y":{"type":"integer"},"pressed":{"type":"boolean"}},"required":["x","y","pressed"],"additionalProperties":false},"annotations":{"readOnlyHint":false}}],"device":{"native_view":true,"native_view_packets":true},"instructions":"Use target schemas."}""");
    }
    public async Task<string> ExecuteAsync(string operationId, string name, string argumentsJson, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (name == "get_display_frame" && FrameRelease is { } frameRelease)
        {
            FrameStarted.TrySetResult();
            await frameRelease.Task.WaitAsync(cancellationToken);
            FrameRelease = null;
        }
        Calls.Add((name, argumentsJson));
        if (RestartedReceipt)
            return """{"content":[{"type":"text","text":"{\"state\":\"interrupted\",\"deviceRestarted\":true}"}]}""";
        return name switch
        {
            "get_display_frame" => """{"content":[{"type":"text","text":"{\"width\":1,\"height\":1}"},{"type":"image","mimeType":"image/png","data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9kAAAAASUVORK5CYII="}]}""",
            "get_data_catalog" => """{"content":[{"type":"text","text":"{\"items\":[{\"name\":\"ui.layout_debug_options\"}]}"}]}""",
            "get_data" => """{"content":[{"type":"text","text":"{\"items\":[{\"value\":{\"opacity\":160,\"outlineWidth\":1,\"levels\":[{\"outline\":true,\"digit\":false,\"outlineColor\":16711935,\"digitColor\":16777215}],\"maxDepth\":1}}]}"}]}""",
            "invoke_action" => """{"content":[{"type":"text","text":"{\"state\":\"completed\"}"}]}""",
            "send_view_input" => """{"content":[{"type":"text","text":"{\"ok\":true}"}]}""",
            _ => """{"content":[{"type":"text","text":"{\"format\":\"lvgl-project-1\"}"}]}"""
        };
    }
    public ValueTask DisconnectAsync() => ValueTask.CompletedTask;
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
