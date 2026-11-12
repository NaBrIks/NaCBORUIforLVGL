// SPDX-License-Identifier: MIT
#if WINDOWS
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using SPLA.Domain.Models;
using NaCBORUI.Designer.Core;

namespace NaCBORUI.Designer.App.Services;

internal sealed class DesignerMcpListener : IAsyncDisposable
{
    private const string Library = "nacborui_designer_mcp";
    private const string GuideTool = "get_authoring_instructions";
    private static readonly JsonSerializerOptions WireJson = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    private readonly CancellationTokenSource _lifetime = new();
    private readonly CallTool _callback;
    private IntPtr _handle;

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int CallTool(IntPtr name, IntPtr arguments, int length, IntPtr output, int capacity, out int error);

    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
    private static extern IntPtr designer_mcp_start(ushort port, [MarshalAs(UnmanagedType.LPUTF8Str)] string manifest, CallTool callback);

    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
    private static extern void designer_mcp_stop(IntPtr handle);

    private DesignerMcpListener(DesignerSession session, Func<bool> isCurrent)
    {
        var invoke = session.PinDirectMcpTarget();
        var instructions = session.McpAuthoringInstructions;
        _callback = (IntPtr name, IntPtr arguments, int length, IntPtr output, int capacity, out int error) =>
        {
            ToolResult result;
            try
            {
                var tool = Marshal.PtrToStringUTF8(name)!;
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(_lifetime.Token);
                var argumentJson = Marshal.PtrToStringUTF8(arguments, length)!;
                if (tool == "get_display_frame")
                {
                    var options = System.Text.Json.Nodes.JsonNode.Parse(argumentJson);
                    if (options is System.Text.Json.Nodes.JsonObject frameOptions && !frameOptions.ContainsKey("maxEdge"))
                    {
                        frameOptions["maxEdge"] = 256;
                        argumentJson = frameOptions.ToJsonString();
                    }
                }
                timeout.CancelAfter(TimeSpan.FromSeconds(75));
                result = !isCurrent() ? ToolResult.Refuse("Select and connect the Designer target before calling tools.")
                    : tool == GuideTool ? ToolResult.Text(instructions)
                    : invoke(tool, argumentJson, timeout.Token).GetAwaiter().GetResult();
            }
            catch (OperationCanceledException) { result = ToolResult.Fail("Tool cancelled or timed out. Verify device state before retrying a write."); }
            catch (Exception ex) { result = ToolResult.Fail(ex.Message); }

            try
            {
                var blocks = result.Content.Select<ToolContent, object?>(content => content switch
                {
                    ToolText text => new { type = "text", text = text.Text },
                    ToolImage image => new { type = "image", data = image.Data, mimeType = image.MimeType },
                    _ => null
                }).Where(block => block is not null);
                var bytes = JsonSerializer.SerializeToUtf8Bytes(blocks, WireJson);
                error = result.IsError ? 1 : 0;
                if (bytes.Length > capacity)
                {
                    bytes = Encoding.UTF8.GetBytes("""[{"type":"text","text":"MCP response exceeds 64 KiB. Read a smaller project document or request a smaller display frame."}]""");
                    error = 1;
                }
                if (bytes.Length > capacity) return 0;
                Marshal.Copy(bytes, 0, output, bytes.Length);
                return bytes.Length;
            }
            catch { error = 1; return 0; }
        };
    }

    public static async Task<DesignerMcpListener?> StartAsync(DesignerSession session, Func<bool> isCurrent)
    {
        var value = Environment.GetEnvironmentVariable("NACBORUI_DESIGNER_MCP_PORT");
        if (string.IsNullOrEmpty(value) || session.DirectMcpTools.Count == 0) return null;
        if (!ushort.TryParse(value, out var port) || port is 0 or 443)
            throw new InvalidOperationException("NACBORUI_DESIGNER_MCP_PORT must be a valid loopback port other than 443.");
        var metadata = session.DirectMcpTools.Select(tool => new
        {
            name = tool.Name,
            description = tool.Name == "get_display_frame"
                ? tool.Definition.Function.Description + " This HTTP endpoint defaults to maxEdge 256 to fit its 64 KiB response budget."
                : tool.Definition.Function.Description,
            schema = tool.Definition.Function.Parameters,
            readOnly = tool.Definition.Function.Effect == ToolEffect.Read
        }).Append(new
        {
            name = GuideTool,
            description = "Call first. Returns the same complete English LVGL authoring instructions used by Designer chat, including JSON layout, style, bindings and events.",
            schema = (object?)new { type = "object", additionalProperties = false },
            readOnly = true
        });
        var manifest = JsonSerializer.Serialize(metadata, WireJson);
        var listener = new DesignerMcpListener(session, isCurrent);
        try
        {
            listener._handle = await Task.Run(() => designer_mcp_start(port, manifest, listener._callback));
            if (listener._handle == IntPtr.Zero)
                throw new InvalidOperationException($"Cannot start Designer MCP on 127.0.0.1:{port}.");
            return listener;
        }
        catch
        {
            await listener.DisposeAsync();
            throw;
        }
    }

    public async ValueTask DisposeAsync()
    {
        _lifetime.Cancel();
        var handle = Interlocked.Exchange(ref _handle, IntPtr.Zero);
        if (handle != IntPtr.Zero) await Task.Run(() => designer_mcp_stop(handle));
        _lifetime.Dispose();
        GC.KeepAlive(_callback);
    }
}
#endif
