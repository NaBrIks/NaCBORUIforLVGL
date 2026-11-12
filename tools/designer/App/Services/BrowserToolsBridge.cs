// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Collections.Concurrent;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using NaCBORUI.Designer.Core;

namespace NaCBORUI.Designer.App.Services;

/// <summary>Runs the shared codecs in WebView and keeps target HTTP in the native app.</summary>
public sealed class BrowserToolsBridge : IDesignerDirectBridge
{
    private const int MaxBodyBytes = 8_388_662;
    private static readonly HashSet<string> RequestHeaders = new(StringComparer.OrdinalIgnoreCase)
        { "accept", "content-type", "if-match", "if-none-match", "cache-control" };
    private static readonly string[] ResponseHeaders =
    [
        "content-type", "content-length", "etag", "cache-control", "last-modified", "retry-after", "x-project-revision",
        "x-frame-x", "x-frame-y", "x-frame-width", "x-frame-height", "x-frame-revision", "x-frame-scene",
        "x-frame-crop-width", "x-frame-crop-height", "x-frame-raw-bytes", "x-frame-full"
    ];
    private readonly IJSRuntime _js;
    private readonly FrameSocket _frameSocket = new();
#if WINDOWS
    private TDisplaySerial? _usb;
#endif
    private readonly HttpClient _http = new(new HttpClientHandler { UseCookies = false, AllowAutoRedirect = false })
        { Timeout = Timeout.InfiniteTimeSpan };
    private CancellationTokenSource _lifetime = new();
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _requests = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, NativeHttpStream> _streams = new(StringComparer.Ordinal);
    private IJSObjectReference? _module;
    private DotNetObjectReference<BrowserToolsBridge>? _self;
    private Uri? _origin;
    private Func<Func<Task>, Task>? _rendererDispatch;
    private bool _disposed;

    private sealed class NativeHttpStream(string id, HttpResponseMessage response, Stream body,
        CancellationTokenSource cancellation, CancellationTokenSource deadline)
    {
        private int _released;
        public string Id { get; } = id;
        public HttpResponseMessage Response { get; } = response;
        public Stream Body { get; } = body;
        public CancellationTokenSource Cancellation { get; } = cancellation;
        public CancellationTokenSource Deadline { get; } = deadline;
        public long BytesRead { get; set; }
        public void Release()
        {
            if (Interlocked.Exchange(ref _released, 1) != 0) return;
            try { Cancellation.Cancel(); } catch (ObjectDisposedException) { }
            Body.Dispose();
            Response.Dispose();
            Cancellation.Dispose();
            Deadline.Dispose();
        }
    }

    public BrowserToolsBridge(IJSRuntime js) => _js = js;

    public void SetRendererDispatcher(Func<Func<Task>, Task> dispatcher) => _rendererDispatch = dispatcher;

    public async Task InitializeAsync(CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (_lifetime.IsCancellationRequested)
        {
            _lifetime.Dispose();
            _lifetime = new CancellationTokenSource();
        }
        _module ??= await OnRendererAsync(() => _js.InvokeAsync<IJSObjectReference>("import", cancellationToken, "./js/browser-tools.js").AsTask(), cancellationToken);
        _self ??= DotNetObjectReference.Create(this);
    }

    public async Task<string> ConnectAsync(string requestJson, CancellationToken cancellationToken)
    {
        using var request = JsonDocument.Parse(requestJson, new JsonDocumentOptions { MaxDepth = 4 });
        if (request.RootElement.TryGetProperty("usbPort", out var port))
        {
#if WINDOWS
            await InitializeAsync(cancellationToken);
            var serial = await Task.Run(() => new TDisplaySerial(port.GetString() ?? ""), cancellationToken);
            _usb = serial;
            try
            {
                var attached = await OnRendererAsync(() => _module!.InvokeAsync<JsonElement>(
                    "connectUsb", cancellationToken, _self).AsTask(), cancellationToken);
                return attached.GetRawText();
            }
            catch { Interlocked.Exchange(ref _usb, null)?.Dispose(); throw; }
#else
            throw new PlatformNotSupportedException("T-Display USB preview is available on Windows.");
#endif
        }
        if (!request.RootElement.TryGetProperty("origin", out var value) || value.ValueKind != JsonValueKind.String ||
            !Uri.TryCreate(value.GetString(), UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https") ||
            uri.AbsolutePath != "/" || !string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Query) ||
            !string.IsNullOrEmpty(uri.Fragment))
            throw new InvalidOperationException("Direct target origin is invalid.");

        _origin = new Uri(uri.GetLeftPart(UriPartial.Authority));
        await InitializeAsync(cancellationToken);
        var result = await OnRendererAsync(() => _module!.InvokeAsync<JsonElement>("connect", cancellationToken,
            new { origin = _origin.AbsoluteUri.TrimEnd('/') }, _self).AsTask(), cancellationToken);
        return result.GetRawText();
    }

    public async Task<string> ExecuteAsync(string operationId, string name, string argumentsJson, CancellationToken cancellationToken)
    {
        if (_module is null) throw new InvalidOperationException("Direct browser tools are not initialized.");
        using var arguments = JsonDocument.Parse(argumentsJson, new JsonDocumentOptions { MaxDepth = 32 });
        using var registration = cancellationToken.Register(() => _ = CancelCallAsync(operationId));
        var result = await OnRendererAsync(() => _module.InvokeAsync<JsonElement>("call", cancellationToken, name, arguments.RootElement, operationId).AsTask(), cancellationToken);
        return result.GetRawText();
    }

    private async Task CancelCallAsync(string operationId)
    {
        if (_module is null) return;
        try { await OnRendererAsync(async () => { await _module.InvokeVoidAsync("cancelCall", operationId); return true; }, CancellationToken.None); }
        catch (Exception ex) when (ex is JSDisconnectedException or JSException or ObjectDisposedException or InvalidOperationException) { }
    }

    [JSInvokable]
    public async Task<object> SendHttp(JsonElement request)
    {
        var requestId = request.TryGetProperty("id", out var idValue) && idValue.ValueKind == JsonValueKind.String
            ? idValue.GetString() : null;
        if (string.IsNullOrWhiteSpace(requestId) || requestId.Length > 64)
            throw new InvalidOperationException("Direct HTTP request id is invalid.");
        var timeoutMs = request.TryGetProperty("timeoutMs", out var timeoutValue) && timeoutValue.TryGetInt32(out var parsedTimeout)
            ? parsedTimeout : 15000;
        if (timeoutMs is < 1000 or > 65000) throw new InvalidOperationException("Direct HTTP timeout is outside the allowed range.");
        var deadline = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));
        var requestCancellation = CancellationTokenSource.CreateLinkedTokenSource(_lifetime.Token, deadline.Token);
        if (!_requests.TryAdd(requestId, requestCancellation))
        {
            requestCancellation.Dispose();
            deadline.Dispose();
            throw new InvalidOperationException("Duplicate direct HTTP request id.");
        }
        try
        {
            return await SendHttpCoreAsync(request, requestCancellation.Token);
        }
        finally
        {
            _requests.TryRemove(requestId, out _);
            requestCancellation.Dispose();
            deadline.Dispose();
        }
    }

    [JSInvokable]
    public void CancelHttp(string requestId)
    {
        if (requestId is not null && _requests.TryGetValue(requestId, out var cancellation))
            try { cancellation.Cancel(); } catch (ObjectDisposedException) { }
        if (requestId is not null && _streams.TryRemove(requestId, out var stream))
        {
            _requests.TryRemove(requestId, out _);
            stream.Release();
        }
    }

    [JSInvokable]
    public async Task<object> BeginHttpStream(JsonElement request)
    {
        var requestId = GetRequestId(request);
        var timeoutMs = GetTimeoutMs(request);
        var origin = _origin ?? throw new InvalidOperationException("Direct target is not connected.");
        var message = CreateHttpMessage(request, origin);
        var deadline = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));
        var cancellation = CancellationTokenSource.CreateLinkedTokenSource(_lifetime.Token, deadline.Token);
        if (!_requests.TryAdd(requestId, cancellation))
        {
            message.Dispose(); cancellation.Dispose(); deadline.Dispose();
            throw new InvalidOperationException("Duplicate direct HTTP request id.");
        }
        HttpResponseMessage? response = null;
        try
        {
            response = await _http.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellation.Token);
            message.Dispose();
            if ((int)response.StatusCode is >= 300 and < 400)
                throw new InvalidOperationException("Direct target redirects are not followed.");
            var headers = GetResponseHeaders(response);
            if (response.Content.Headers.ContentLength is > MaxBodyBytes)
                throw new InvalidOperationException("Direct HTTP response body is too large.");
            var body = await response.Content.ReadAsStreamAsync(cancellation.Token);
            var stream = new NativeHttpStream(requestId, response, body, cancellation, deadline);
            if (!_streams.TryAdd(requestId, stream))
            {
                stream.Release();
                throw new InvalidOperationException("Duplicate direct HTTP stream id.");
            }
            return new { status = (int)response.StatusCode, headers, streamId = requestId };
        }
        catch
        {
            message.Dispose();
            _requests.TryRemove(requestId, out _);
            if (_streams.TryRemove(requestId, out var stream)) stream.Release();
            else
            {
                response?.Dispose();
                cancellation.Dispose();
                deadline.Dispose();
            }
            throw;
        }
    }

    [JSInvokable]
    public async Task<object> ReadHttpStream(string streamId, int maxBytes)
    {
        if (maxBytes is < 1 or > 16384) throw new InvalidOperationException("Direct HTTP stream chunk limit is invalid.");
        if (!_streams.TryGetValue(streamId, out var stream)) throw new OperationCanceledException("Direct HTTP stream is closed.");
        try
        {
            var buffer = new byte[maxBytes];
            var count = await stream.Body.ReadAsync(buffer, stream.Cancellation.Token);
            if (count == 0)
            {
                ReleaseStream(streamId, stream);
                return new { done = true, body = string.Empty };
            }
            stream.BytesRead += count;
            if (stream.BytesRead > MaxBodyBytes) throw new InvalidOperationException("Direct HTTP response body is too large.");
            return new { done = false, body = Convert.ToBase64String(buffer, 0, count) };
        }
        catch
        {
            ReleaseStream(streamId, stream);
            throw;
        }
    }

    private void ReleaseStream(string streamId, NativeHttpStream stream)
    {
        _requests.TryRemove(streamId, out _);
        if (_streams.TryRemove(streamId, out var removed)) removed.Release();
        else stream.Release();
    }

    private static string GetRequestId(JsonElement request)
    {
        var id = request.TryGetProperty("id", out var idValue) && idValue.ValueKind == JsonValueKind.String ? idValue.GetString() : null;
        if (string.IsNullOrWhiteSpace(id) || id.Length > 64) throw new InvalidOperationException("Direct HTTP request id is invalid.");
        return id;
    }

    private static int GetTimeoutMs(JsonElement request)
    {
        var timeout = request.TryGetProperty("timeoutMs", out var value) && value.TryGetInt32(out var parsed) ? parsed : 15000;
        if (timeout is < 1000 or > 65000) throw new InvalidOperationException("Direct HTTP timeout is outside the allowed range.");
        return timeout;
    }

    private static HttpRequestMessage CreateHttpMessage(JsonElement request, Uri origin)
    {
        if (request.ValueKind != JsonValueKind.Object || !request.TryGetProperty("url", out var urlValue) ||
            urlValue.ValueKind != JsonValueKind.String || !Uri.TryCreate(urlValue.GetString(), UriKind.Absolute, out var uri) ||
            !SameOrigin(origin, uri) || !string.IsNullOrEmpty(uri.UserInfo))
            throw new InvalidOperationException("Direct HTTP request is outside the configured target origin.");

        var method = request.TryGetProperty("method", out var methodValue) && methodValue.ValueKind == JsonValueKind.String
            ? methodValue.GetString() : "GET";
        if (method is not ("GET" or "POST" or "PUT" or "PATCH" or "DELETE"))
            throw new InvalidOperationException("Direct HTTP method is not allowed.");
        var message = new HttpRequestMessage(new HttpMethod(method), uri);
        try
        {
            if (request.TryGetProperty("body", out var bodyValue) && bodyValue.ValueKind == JsonValueKind.String)
            {
                var encoded = bodyValue.GetString()!;
                if (encoded.Length > ((MaxBodyBytes + 2) / 3) * 4) throw new InvalidOperationException("Direct HTTP request body is too large.");
                byte[] body;
                try { body = Convert.FromBase64String(encoded); }
                catch (FormatException) { throw new InvalidOperationException("Direct HTTP request body is invalid base64."); }
                if (body.Length > MaxBodyBytes) throw new InvalidOperationException("Direct HTTP request body is too large.");
                message.Content = new ByteArrayContent(body);
            }
            if (request.TryGetProperty("headers", out var headers) && headers.ValueKind == JsonValueKind.Object)
            {
                foreach (var header in headers.EnumerateObject())
                {
                    if (!RequestHeaders.Contains(header.Name) || header.Value.ValueKind != JsonValueKind.String) continue;
                    var value = header.Value.GetString();
                    if (value is null || value.Length > 4096) continue;
                    if (header.Name.Equals("content-type", StringComparison.OrdinalIgnoreCase) && message.Content is not null)
                        message.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(value);
                    else message.Headers.TryAddWithoutValidation(header.Name, value);
                }
            }
            return message;
        }
        catch { message.Dispose(); throw; }
    }

    private static Dictionary<string, string> GetResponseHeaders(HttpResponseMessage response)
    {
        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var name in ResponseHeaders)
        {
            if (response.Headers.TryGetValues(name, out var values) || response.Content.Headers.TryGetValues(name, out values))
                headers[name] = string.Join(", ", values);
        }
        return headers;
    }

    private async Task<object> SendHttpCoreAsync(JsonElement request, CancellationToken cancellationToken)
    {
        var origin = _origin ?? throw new InvalidOperationException("Direct target is not connected.");
        if (request.ValueKind != JsonValueKind.Object || !request.TryGetProperty("url", out var urlValue) ||
            urlValue.ValueKind != JsonValueKind.String || !Uri.TryCreate(urlValue.GetString(), UriKind.Absolute, out var uri) ||
            !SameOrigin(origin, uri) || !string.IsNullOrEmpty(uri.UserInfo))
            throw new InvalidOperationException("Direct HTTP request is outside the configured target origin.");

        var method = request.TryGetProperty("method", out var methodValue) && methodValue.ValueKind == JsonValueKind.String
            ? methodValue.GetString() : "GET";
        if (method is not ("GET" or "POST" or "PUT" or "PATCH" or "DELETE"))
            throw new InvalidOperationException("Direct HTTP method is not allowed.");
        using var message = new HttpRequestMessage(new HttpMethod(method), uri);
        if (request.TryGetProperty("body", out var bodyValue) && bodyValue.ValueKind == JsonValueKind.String)
        {
            var encoded = bodyValue.GetString()!;
            if (encoded.Length > ((MaxBodyBytes + 2) / 3) * 4) throw new InvalidOperationException("Direct HTTP request body is too large.");
            byte[] body;
            try { body = Convert.FromBase64String(encoded); }
            catch (FormatException) { throw new InvalidOperationException("Direct HTTP request body is invalid base64."); }
            if (body.Length > MaxBodyBytes) throw new InvalidOperationException("Direct HTTP request body is too large.");
            message.Content = new ByteArrayContent(body);
        }
        if (request.TryGetProperty("headers", out var headers) && headers.ValueKind == JsonValueKind.Object)
        {
            foreach (var header in headers.EnumerateObject())
            {
                if (!RequestHeaders.Contains(header.Name) || header.Value.ValueKind != JsonValueKind.String) continue;
                var value = header.Value.GetString();
                if (value is null || value.Length > 4096) continue;
                if (header.Name.Equals("content-type", StringComparison.OrdinalIgnoreCase) && message.Content is not null)
                    message.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(value);
                else message.Headers.TryAddWithoutValidation(header.Name, value);
            }
        }

        using var response = await _http.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if ((int)response.StatusCode is >= 300 and < 400)
            throw new InvalidOperationException("Direct target redirects are not followed.");
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var output = new MemoryStream();
        var buffer = new byte[32 * 1024];
        while (true)
        {
            var count = await stream.ReadAsync(buffer, cancellationToken);
            if (count == 0) break;
            if (output.Length + count > MaxBodyBytes) throw new InvalidOperationException("Direct HTTP response body is too large.");
            output.Write(buffer, 0, count);
        }
        var responseHeaders = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var name in ResponseHeaders)
        {
            if (response.Headers.TryGetValues(name, out var values) || response.Content.Headers.TryGetValues(name, out values))
                responseHeaders[name] = string.Join(", ", values);
        }
        return new { status = (int)response.StatusCode, headers = responseHeaders, body = Convert.ToBase64String(output.ToArray()) };
    }

    private static bool SameOrigin(Uri left, Uri right) => left.Scheme.Equals(right.Scheme, StringComparison.OrdinalIgnoreCase) &&
        left.IdnHost.Equals(right.IdnHost, StringComparison.OrdinalIgnoreCase) && left.Port == right.Port;

    private async Task<T> OnRendererAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken)
    {
        if (_rendererDispatch is null) return await action();
        var completion = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        await _rendererDispatch(async () =>
        {
            try { completion.TrySetResult(await action()); }
            catch (Exception ex) { completion.TrySetException(ex); }
        });
        return await completion.Task.WaitAsync(cancellationToken);
    }

#if WINDOWS
    [JSInvokable]
    public Task<object> ExchangeUsb(string packet, int id)
    {
        var serial = _usb ?? throw new InvalidOperationException("T-Display USB is disconnected.");
        var token = _lifetime.Token;
        return Task.Run(() => serial.Exchange(packet, id, token), token);
    }
#endif

    [JSInvokable]
    public Task<string> BeginFrameSocket(int request, uint since) =>
        Task.Run(() => _frameSocket.BeginAsync(_origin ?? throw new InvalidOperationException("Direct target is not connected."),
            request, since, _lifetime.Token));

    [JSInvokable]
    public Task<object> ReadFrameSocket(int request) => Task.Run(() => _frameSocket.ReadAsync(request, _lifetime.Token));

    [JSInvokable]
    public void AbortFrameSocket(int request) => _frameSocket.Abort(request);

    public async ValueTask DisconnectAsync()
    {
        _frameSocket.Abort();
#if WINDOWS
        Interlocked.Exchange(ref _usb, null)?.Dispose();
#endif
        _origin = null;
        _lifetime.Cancel();
        foreach (var request in _requests.Values)
            try { request.Cancel(); } catch (ObjectDisposedException) { }
        foreach (var pair in _streams.ToArray())
            if (_streams.TryRemove(pair.Key, out var stream)) stream.Release();
        _self?.Dispose();
        _self = null;
        if (_module is not null)
        {
            try { await OnRendererAsync(async () => { await _module.InvokeVoidAsync("dispose"); await _module.DisposeAsync(); return true; }, CancellationToken.None); }
            catch (Exception ex) when (ex is JSDisconnectedException or JSException or ObjectDisposedException or InvalidOperationException) { }
            _module = null;
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        await DisconnectAsync();
        _disposed = true;
        _lifetime.Dispose();
        _http.Dispose();
    }
}
