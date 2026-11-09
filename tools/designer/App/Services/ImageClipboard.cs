// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
namespace NaCBORUI.Designer.App.Services;

internal static class ImageClipboard
{
    public static async Task SetPngAsync(string dataUrl)
    {
        const string prefix = "data:image/png;base64,";
        if (!dataUrl.StartsWith(prefix, StringComparison.Ordinal) || dataUrl.Length > 16 * 1024 * 1024)
            throw new InvalidOperationException("Предпросмотр не содержит доступный PNG-кадр.");
        var bytes = Convert.FromBase64String(dataUrl[prefix.Length..]);
        await MainThread.InvokeOnMainThreadAsync(async () =>
        {
#if WINDOWS
            using var stream = new Windows.Storage.Streams.InMemoryRandomAccessStream();
            using (var writer = new Windows.Storage.Streams.DataWriter(stream))
            {
                writer.WriteBytes(bytes);
                await writer.StoreAsync();
                writer.DetachStream();
            }
            stream.Seek(0);
            var package = new Windows.ApplicationModel.DataTransfer.DataPackage();
            package.SetBitmap(Windows.Storage.Streams.RandomAccessStreamReference.CreateFromStream(stream));
            Windows.ApplicationModel.DataTransfer.Clipboard.SetContent(package);
            Windows.ApplicationModel.DataTransfer.Clipboard.Flush();
#elif ANDROID
            // Reuse MAUI's existing FileProvider. Two fixed slots bound cache usage and keep
            // the preceding clipboard URI intact if writing a replacement fails.
            var context = Android.App.Application.Context;
            var directory = Path.Combine(FileSystem.CacheDirectory, "preview-clipboard");
            Directory.CreateDirectory(directory);
            var clipboard = (Android.Content.ClipboardManager?)context.GetSystemService(Android.Content.Context.ClipboardService)
                ?? throw new InvalidOperationException("Буфер обмена недоступен.");
            var previous = clipboard.PrimaryClip?.GetItemAt(0)?.Uri?.LastPathSegment;
            var filename = previous == "frame-0.png" ? "frame-1.png" : "frame-0.png";
            var path = Path.Combine(directory, filename);
            await File.WriteAllBytesAsync(path, bytes);
            using var file = new Java.IO.File(path);
            var uri = AndroidX.Core.Content.FileProvider.GetUriForFile(context, context.PackageName + ".fileProvider", file);
            clipboard.PrimaryClip = Android.Content.ClipData.NewUri(context.ContentResolver!, "LVGL display", uri);
#else
            throw new PlatformNotSupportedException("Копирование кадра доступно в Windows и Android.");
#endif
        });
    }
}
