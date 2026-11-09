// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
using System.Net;
using System.Text.RegularExpressions;
using Markdig;

namespace NaCBORUI.Designer.App.Services;

public static class MarkdownRenderer
{
    // Generated attributes and media embeds are unnecessary in chat and can execute markup.
    private static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder()
        .DisableHtml().UsePipeTables().UseTaskLists().Build();
    private static readonly Regex Link = new("<a\\s+href=\"([^\"]*)\"[^>]*>(.*?)</a>",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);

    public static string ToSafeHtml(string? markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown)) return string.Empty;
        return Link.Replace(Markdown.ToHtml(markdown, Pipeline), match =>
        {
            var address = WebUtility.HtmlDecode(match.Groups[1].Value);
            var allowed = address.StartsWith('#') ||
                (Uri.TryCreate(address, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" or "mailto");
            return allowed ? match.Value : match.Groups[2].Value;
        });
    }
}
