# App requirements

The app is a compact NaCBORUIforLVGL assistant and preview client for Windows and Android. Its main work surface keeps the conversation composer at the bottom, provides ordinary and detailed response modes, renders Markdown, accepts image and JSON attachments, shows an LVGL frame preview, and exposes endpoint/provider settings.

All agent, model, MCP, device and preview work is performed by `NaCBORUI.Designer.Core` through the App adapter. The UI must not claim an operation succeeded until Core reports its result. Settings store the provider API key only through MAUI SecureStorage; other endpoint and model preferences may use app preferences. Never persist credentials in project JSON or assets.

The complete mandatory owner UI standard is [docs/ui-principles.md](docs/ui-principles.md). Keep its compact, cream/dark palette and avoid stock template pages.
