// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
using SPLA.Domain.Interfaces;
using SPLA.Domain.Models;
using SPLA.LLM.OpenRouter;

namespace NaCBORUI.Designer.Core;

/// <summary>Provider-reported tokens only. Missing counts and catalog limits remain unknown.</summary>
public sealed record DesignerUsage(int? InputTokens, int? OutputTokens, long? TotalTokens,
    long? SessionInputTokens, long? SessionOutputTokens, long? SessionTotalTokens,
    int? ContextUsedTokens, int? ContextLimitTokens);

public sealed partial class DesignerSession
{
    private readonly SessionTokenUsageStore _usageStore = new();
    private readonly object _catalogGate = new();
    private ModelCatalogKey? _catalogKey;
    private Task<OpenRouterModel?>? _selectedModelMetadata;

    public DesignerUsage Usage
    {
        get
        {
            var message = LastTurn?.Message;
            var input = message?.PromptTokens;
            var output = message?.CompletionTokens;
            var session = _usageStore.Snapshot();
            return new DesignerUsage(input, output,
                input is not null && output is not null ? (long)input.Value + output.Value : null,
                session.Input, session.Output,
                session.Input is not null && session.Output is not null ? session.Input + session.Output : null,
                input, SelectedContextLimit());
        }
    }

    public async Task<int?> GetContextLengthAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ValidateProvider();
        ValidateHttpUrl(Options.ModelEndpoint, "Model endpoint");
        var model = await GetSelectedModelMetadataAsync(cancellationToken);
        return model is { ContextLength: > 0 } ? model.ContextLength : null;
    }

    private async Task<OpenRouterModel?> GetSelectedModelMetadataAsync(CancellationToken cancellationToken)
    {
        if (!Options.Provider.Equals("openrouter", StringComparison.OrdinalIgnoreCase)) return null;
        var key = new ModelCatalogKey(Options.Provider, Options.ModelEndpoint, Options.Model, Options.ApiKey);
        Task<OpenRouterModel?> request;
        lock (_catalogGate)
        {
            // Retain only the selected descriptor. Reasoning and context share the same SPLA catalog
            // request, including concurrent callers; no full catalog or second transport is retained.
            if (_catalogKey != key || _selectedModelMetadata is null || _selectedModelMetadata.IsCanceled || _selectedModelMetadata.IsFaulted)
            {
                _catalogKey = key;
                _selectedModelMetadata = ReadSelectedModelAsync(key, cancellationToken);
            }
            request = _selectedModelMetadata;
        }
        var model = await request.WaitAsync(cancellationToken);
        Notify();
        return model;
    }

    private async Task<OpenRouterModel?> ReadSelectedModelAsync(ModelCatalogKey key, CancellationToken cancellationToken)
    {
        var models = await _openRouter.Catalog.GetModelsAsync(key.Endpoint, key.ApiKey, cancellationToken);
        return models.FirstOrDefault(model => string.Equals(model.Id, key.Model, StringComparison.OrdinalIgnoreCase));
    }

    private int? SelectedContextLimit()
    {
        lock (_catalogGate)
        {
            var key = new ModelCatalogKey(Options.Provider, Options.ModelEndpoint, Options.Model, Options.ApiKey);
            return _catalogKey == key && _selectedModelMetadata is { IsCompletedSuccessfully: true } request &&
                request.Result is { ContextLength: > 0 } model ? model.ContextLength : null;
        }
    }

    private sealed record ModelCatalogKey(string Provider, string Endpoint, string Model, string ApiKey);

    /// <summary>Storage adapter only. SPLA's middleware records every attempt and its canonical tally
    /// performs all accumulation. Completeness flags prevent an omitted figure being displayed as zero.</summary>
    private sealed class SessionTokenUsageStore : ITokenUsageStore
    {
        private readonly object _gate = new();
        private readonly TokenUsageTotals _totals = new();
        private bool _recorded;
        private bool _inputComplete = true;
        private bool _outputComplete = true;
        public TokenUsageTotals Total { get { lock (_gate) return _totals.Clone(); } }
        public TokenUsageTotals Session => Total;
        public event EventHandler? Changed;

        public void Record(int? promptTokens, int? completionTokens)
        {
            lock (_gate)
            {
                _recorded = true;
                _inputComplete &= promptTokens.HasValue;
                _outputComplete &= completionTokens.HasValue;
                _totals.Add(promptTokens, completionTokens);
            }
            Changed?.Invoke(this, EventArgs.Empty);
        }

        public (long? Input, long? Output) Snapshot()
        {
            lock (_gate) return (_recorded && _inputComplete ? _totals.PromptTokens : null,
                _recorded && _outputComplete ? _totals.CompletionTokens : null);
        }
    }
}
