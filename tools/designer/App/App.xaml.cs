namespace NaCBORUI.Designer.App;

public partial class App : Microsoft.Maui.Controls.Application
{
    public App() => InitializeComponent();

    protected override Window CreateWindow(IActivationState? activationState) => new(new MainPage())
    {
        Title = "NaCBORUIforLVGL — Designer",
        Width = 1180,
        Height = 820
    };
}
