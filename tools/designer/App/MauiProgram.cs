using Microsoft.Extensions.Logging;
using NaCBORUI.Designer.Core;
using NaCBORUI.Designer.App.Services;

namespace NaCBORUI.Designer.App;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder.UseMauiApp<App>();
        builder.Services.AddMauiBlazorWebView();
        builder.Services.AddSingleton<UiText>();
        builder.Services.AddSingleton<DesignerSettingsStore>();
        builder.Services.AddScoped<IDesignerDirectBridge, BrowserToolsBridge>();
        builder.Services.AddScoped<DesignerSessionAdapter>();
#if DEBUG
        builder.Services.AddBlazorWebViewDeveloperTools();
        builder.Logging.AddDebug();
#endif
        return builder.Build();
    }
}
