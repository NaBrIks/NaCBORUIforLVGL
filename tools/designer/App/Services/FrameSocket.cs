// SPDX-License-Identifier: MIT
using System.Net.WebSockets;
using System.Text;

namespace NaCBORUI.Designer.App.Services;

/// <summary>One bounded binary preview stream to the already selected target.</summary>
internal sealed class FrameSocket
{
    private const int FragmentLimit = 4096;
    private readonly object _gate = new();
    private ClientWebSocket? _socket;
    private int _request;

    public async Task<string> BeginAsync(Uri origin, int request, uint since, CancellationToken token)
    {
        ClientWebSocket socket;
        lock (_gate)
        {
            if (_request != 0) throw new InvalidOperationException("A preview request is already active.");
            _request = request;
            socket = _socket ??= new ClientWebSocket();
        }
        try
        {
            if (socket.State != WebSocketState.Open)
            {
                var url = new UriBuilder(origin) { Scheme = origin.Scheme == "https" ? "wss" : "ws", Path = "/api/view/ws" };
                await socket.ConnectAsync(url.Uri, token).ConfigureAwait(false);
            }
            var data = Encoding.ASCII.GetBytes(since.ToString(System.Globalization.CultureInfo.InvariantCulture));
            await socket.SendAsync(data.AsMemory(), WebSocketMessageType.Text, true, token).ConfigureAwait(false);
            var message = await ReceiveAsync(socket, token).ConfigureAwait(false);
            if (message.Text is not { } header || (!header.StartsWith("begin,", StringComparison.Ordinal) && header != "idle"))
                throw new InvalidOperationException("Invalid preview WebSocket metadata.");
            if (header == "idle") Finish(request);
            return header;
        }
        catch { Abort(request); throw; }
    }

    public async Task<object> ReadAsync(int request, CancellationToken token)
    {
        ClientWebSocket socket;
        lock (_gate)
            socket = _request == request && _socket is not null ? _socket : throw new OperationCanceledException();
        try
        {
            var message = await ReceiveAsync(socket, token).ConfigureAwait(false);
            if (message.Text == "end") { Finish(request); return new { done = true, body = "" }; }
            if (message.Text == "cancel")
            {
                Finish(request);
                return new { done = true, body = "", cancelled = true };
            }
            if (message.Binary is not { } bytes) throw new InvalidOperationException("Invalid preview WebSocket fragment.");
            return new { done = false, body = bytes };
        }
        catch { Abort(request); throw; }
    }

    private static async Task<(string? Text, string? Binary)> ReceiveAsync(ClientWebSocket socket, CancellationToken token)
    {
        var buffer = new byte[FragmentLimit];
        var size = 0;
        while (size < buffer.Length)
        {
            var result = await socket.ReceiveAsync(buffer.AsMemory(size), token).ConfigureAwait(false);
            size += result.Count;
            if (result.MessageType == WebSocketMessageType.Close) throw new IOException("Preview WebSocket closed.");
            if (!result.EndOfMessage) continue;
            if (size == 0) throw new IOException("Empty preview WebSocket message.");
            return result.MessageType == WebSocketMessageType.Text
                ? (Encoding.ASCII.GetString(buffer, 0, size), null)
                : (null, Convert.ToBase64String(buffer, 0, size));
        }
        throw new IOException("Preview WebSocket fragment exceeds its limit.");
    }

    private void Finish(int request)
    {
        lock (_gate) { if (_request == request) _request = 0; }
    }

    public void Abort(int request = 0)
    {
        ClientWebSocket? socket;
        lock (_gate)
        {
            if (request != 0 && _request != request) return;
            socket = _socket;
            _socket = null;
            _request = 0;
        }
        socket?.Abort();
        socket?.Dispose();
    }
}
