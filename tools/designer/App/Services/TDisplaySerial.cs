// SPDX-License-Identifier: MIT
#if WINDOWS
using System.Buffers.Binary;
using System.Diagnostics;
using System.IO.Ports;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace NaCBORUI.Designer.App.Services;

internal sealed class TDisplaySerial : IDisposable
{
    private static readonly byte[] ReplyPrefix = "@ui "u8.ToArray();
    private readonly SerialPort _port;
    private readonly object _exchange = new();

    public TDisplaySerial(string name)
    {
        if (!Regex.IsMatch(name, @"\ACOM[1-9][0-9]{0,4}\z", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            throw new ArgumentException("Enter the T-Display USB port (COM number).");
        _port = new SerialPort(name.ToUpperInvariant(), 115200)
        {
            DtrEnable = false, RtsEnable = false, ReadTimeout = 150, WriteTimeout = 1000
        };
        try { _port.Open(); _port.DiscardInBuffer(); }
        catch { _port.Dispose(); throw; }
    }

    public object Exchange(string encoded, int id, CancellationToken token)
    {
        if (encoded.Length > 5464) throw new ArgumentException("USB command exceeds its limit.");
        var packet = Convert.FromBase64String(encoded);
        if (packet.Length is < 1 or > 4096) throw new ArgumentException("Invalid USB command size.");
        lock (_exchange)
        {
            token.ThrowIfCancellationRequested();
            var request = new byte[packet.Length + 4];
            BinaryPrimitives.WriteInt32LittleEndian(request, packet.Length);
            packet.CopyTo(request, 4);
            _port.Write(request, 0, request.Length);

            var clock = Stopwatch.StartNew();
            var line = new byte[16384];
            var length = 0;
            while (clock.ElapsedMilliseconds < 3500)
            {
                token.ThrowIfCancellationRequested();
                int next;
                try { next = _port.ReadByte(); }
                catch (TimeoutException) { continue; }
                if (next < 0) throw new EndOfStreamException("USB port closed.");
                if (next != '\n')
                {
                    if (length == line.Length) throw new IOException("USB reply line exceeds its limit.");
                    line[length++] = (byte)next;
                    continue;
                }
                var marker = line.AsSpan(0, length).IndexOf(ReplyPrefix);
                var lineLength = length;
                length = 0;
                if (marker < 0) continue;
                var offset = marker + ReplyPrefix.Length;
                using var document = JsonDocument.Parse(line.AsMemory(offset, lineLength - offset));
                var reply = document.RootElement;
                if (reply.ValueKind != JsonValueKind.Object) continue;
                var binary = Array.Empty<byte>();
                if (reply.TryGetProperty("frameBytes", out var count))
                {
                    if (!count.TryGetInt32(out var bytes) || bytes is < 32 or > 4128)
                        throw new IOException("USB frame exceeds its limit.");
                    binary = new byte[bytes];
                    var received = 0;
                    while (received < bytes && clock.ElapsedMilliseconds < 3500)
                    {
                        token.ThrowIfCancellationRequested();
                        try { received += _port.Read(binary, received, bytes - received); }
                        catch (TimeoutException) { }
                    }
                    if (received != bytes) throw new IOException("USB frame is incomplete.");
                }
                if (reply.TryGetProperty("id", out var replyId) && replyId.ValueKind == JsonValueKind.Number &&
                    replyId.TryGetInt32(out var actualId) && actualId == id)
                    return new { reply = reply.Clone(), body = Convert.ToBase64String(binary) };
            }
            throw new TimeoutException("The T-Display did not reply over USB.");
        }
    }

    public void Dispose() => _port.Dispose();
}
#endif
