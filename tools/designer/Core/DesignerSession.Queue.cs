// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
using SPLA.Domain.Models;
using SPLA.Domain.Settings;
using SPLA.Domain.Tools;

namespace NaCBORUI.Designer.Core;

public sealed partial class DesignerSession
{
    public const int MaxPendingPrompts = 8;
    public const int MaxPendingImageUrlCharacters = 16 * 1024 * 1024;
    // SPLA owns the FIFO. The host schedules complete orchestrator runs and tracks UI/task state.
    // Upstream's service ChatPump is internal and its Runtime turn gate is private; composing them
    // here would require starting a service/runtime or copying upstream implementation.
    private readonly ChatInbox _inbox = new();
    private readonly object _queueGate = new();
    private readonly Dictionary<ChatMessage, PendingPrompt> _pendingPrompts = new(ReferenceEqualityComparer.Instance);
    private PendingPrompt? _activePrompt;
    private bool _chatPumpRunning;
    private long _promptSequence;

    public IReadOnlyList<ChatMessage> PendingMessages
    {
        get
        {
            lock (_queueGate)
                return _pendingPrompts.Values
                    .Where(prompt => !ReferenceEquals(prompt, _activePrompt))
                    .OrderBy(prompt => prompt.Sequence)
                    .Select(prompt => prompt.Message).ToArray();
        }
    }

    public int PendingCount => PendingMessages.Count;
    public bool QueuePaused { get; private set; }

    /// <summary>Checks waiting-message limits without changing the draft, queue or conversation.</summary>
    public void ValidateEnqueue(IReadOnlyList<ImageAttachment>? attachments = null)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        lock (_queueGate)
        {
            var waiting = _pendingPrompts.Values.Where(prompt => !ReferenceEquals(prompt, _activePrompt)).ToArray();
            if (waiting.Length >= MaxPendingPrompts)
                throw new InvalidOperationException($"В очереди уже {MaxPendingPrompts} сообщений. Дождитесь ответа или очистите очередь новым чатом.");
            var imageCharacters = waiting.Sum(prompt => ImageUrlCharacters(prompt.Message.Images)) + ImageUrlCharacters(attachments);
            if (imageCharacters > MaxPendingImageUrlCharacters)
                throw new InvalidOperationException("Изображения в очереди превышают лимит 16 МиБ символов URL. Уменьшите вложения или дождитесь ответа.");
        }
    }

    private static long ImageUrlCharacters(IReadOnlyList<ImageAttachment>? images) =>
        images?.Sum(image => (long)image.Url.Length) ?? 0;

    /// <summary>Queues a human message in SPLA; completes when that message's full agent turn ends.</summary>
    public Task SendAsync(string text, IReadOnlyList<ImageAttachment>? attachments = null,
        CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        cancellationToken.ThrowIfCancellationRequested();
        if (string.IsNullOrWhiteSpace(text) && attachments is not { Count: > 0 }) return Task.CompletedTask;
        var message = new ChatMessage { Role = ChatRole.User, Content = text, Images = attachments?.ToList() };
        // Freeze choices at send time: later edits must not change an active or already queued turn.
        var prompt = new PendingPrompt(message, CreateLlmSettings(), cancellationToken);
        lock (_queueGate)
        {
            if (!IsConnected || _tools is null)
                throw new InvalidOperationException("Connect an MCP server before sending a designer request.");
            if (_chatPumpRunning && QueuePaused)
                throw new InvalidOperationException("Wait for the current stop to complete before sending another request.");
            ValidateEnqueue(message.Images);
            if (!_chatPumpRunning) StartPromptPump();
            prompt.Sequence = ++_promptSequence;
            _pendingPrompts.Add(message, prompt);
            _inbox.Enqueue(message, InboxItemKind.Human);
        }
        Notify();
        return prompt.Completion.Task;
    }

    /// <summary>Explicitly resumes messages retained by Stop, without adding a new human message.</summary>
    public void ResumePending()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        lock (_queueGate)
        {
            if (_chatPumpRunning || _pendingPrompts.Count == 0) return;
            if (!IsConnected || _tools is null) throw new InvalidOperationException("MCP is not connected.");
            StartPromptPump();
        }
        Notify();
    }

    // Called only under _queueGate. The existing operation semaphore also excludes connect/reset.
    private void StartPromptPump()
    {
        if (!_operations.Wait(0)) throw new InvalidOperationException("An operation is already running.");
        _activeOperation = new CancellationTokenSource();
        _chatPumpRunning = true;
        QueuePaused = false;
        IsBusy = true;
        LastError = null;
        _ = Task.Run(PumpPromptsAsync);
    }

    private async Task PumpPromptsAsync()
    {
        // Host scheduling only: SPLA runs every complete LLM/tool turn itself.
        while (true)
        {
            IReadOnlyList<ChatMessage> batch;
            lock (_queueGate)
            {
                if (QueuePaused || _pendingPrompts.Count == 0)
                {
                    FinishPromptPump();
                    return;
                }
                batch = _inbox.DrainAll();
            }
            for (var index = 0; index < batch.Count; index++)
            {
                var message = batch[index];
                PendingPrompt? prompt;
                lock (_queueGate)
                {
                    if (QueuePaused)
                    {
                        RestoreBatch(batch, index);
                        FinishPromptPump();
                        return;
                    }
                    if (!_pendingPrompts.TryGetValue(message, out prompt)) continue;
                    _activePrompt = prompt;
                }
                Notify();
                Exception? failure = null;
                try
                {
                    using var turnCancellation = CancellationTokenSource.CreateLinkedTokenSource(
                        _activeOperation!.Token, prompt.CancellationToken);
                    turnCancellation.Token.ThrowIfCancellationRequested();
                    await RunPromptAsync(prompt.Message, prompt.Settings, turnCancellation.Token);
                }
                catch (Exception ex) { failure = ex; }
                bool finished;
                lock (_queueGate)
                {
                    _pendingPrompts.Remove(message);
                    _activePrompt = null;
                    finished = QueuePaused || _pendingPrompts.Count == 0;
                    if (finished)
                    {
                        RestoreBatch(batch, index + 1);
                        FinishPromptPump();
                    }
                }
                Notify();
                if (failure is OperationCanceledException) prompt.Completion.TrySetCanceled();
                else if (failure is not null) prompt.Completion.TrySetException(failure);
                else prompt.Completion.TrySetResult();
                if (finished) return;
            }
        }
    }

    // A Stop can arrive after SPLA drained a batch. Return its undelivered suffix ahead of newer
    // inbox arrivals; the dictionary is completion metadata, never an alternate execution queue.
    private void RestoreBatch(IReadOnlyList<ChatMessage> batch, int start)
    {
        var newer = _inbox.DrainAll();
        foreach (var message in batch.Skip(start))
            if (_pendingPrompts.ContainsKey(message)) _inbox.Enqueue(message, InboxItemKind.Human);
        foreach (var message in newer) _inbox.Enqueue(message, InboxItemKind.Human);
    }

    private void FinishPromptPump()
    {
        _chatPumpRunning = false;
        QueuePaused = QueuePaused && _pendingPrompts.Count > 0;
        if (QueuePaused) Status = "Очередь приостановлена";
        EndOperation();
    }

    private void PausePendingPrompts()
    {
        lock (_queueGate)
        {
            if (_chatPumpRunning) QueuePaused = true;
            // SPLA Stop policy preserves undelivered human messages and disarms automatic wakes.
            try { _activeOperation?.Cancel(); }
            catch (ObjectDisposedException) { }
        }
        Notify();
    }

    private void ClearPendingPrompts()
    {
        lock (_queueGate)
        {
            _inbox.DrainAll();
            foreach (var prompt in _pendingPrompts.Values) prompt.Completion.TrySetCanceled();
            _pendingPrompts.Clear();
            QueuePaused = false;
        }
    }

    private sealed record PendingPrompt(ChatMessage Message, LLMSettings Settings, CancellationToken CancellationToken)
    {
        public long Sequence { get; set; }
        public TaskCompletionSource Completion { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    }
}
