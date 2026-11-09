// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
using System.Globalization;
using System.Resources;
using System.Text.RegularExpressions;

namespace NaCBORUI.Designer.App.Services;

public sealed class UiText
{
    private static readonly ResourceManager Resources = new("NaCBORUI.Designer.App.Resources.Strings", typeof(UiText).Assembly);
    public string Language { get; private set; } = Preferences.Default.Get("nacborui.designer.language", "ru");
    private CultureInfo Culture => CultureInfo.GetCultureInfo(Language == "en" ? "en" : "ru");
    public string this[string key] => Resources.GetString(key, Culture) ?? key;
    public string Format(string key, params object[] args) => string.Format(Culture, this[key], args);
    public void Toggle()
    {
        Language = Language == "ru" ? "en" : "ru";
        Preferences.Default.Set("nacborui.designer.language", Language);
    }
    public string Status(string value)
    {
        var match = Regex.Match(value, @"^MCP: (\d+) инструментов$");
        return match.Success ? Format("MCP: {0} инструментов", match.Groups[1].Value) : this[value];
    }
}
