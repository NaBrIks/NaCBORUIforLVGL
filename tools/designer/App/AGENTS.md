# App instructions

This project is the MAUI Blazor Hybrid client for Windows and Android. Before changing or assessing its UI, read and apply [docs/ui-principles.md](docs/ui-principles.md).

Keep presentation behind `Services/DesignerSessionAdapter`. All model, agent, MCP, device API and LVGL preview operations belong to `NaCBORUI.Designer.Core`; do not add independent HTTP, OpenAI or JSON-RPC clients here. The provider key is stored only with MAUI `SecureStorage` and must never enter project JSON, preferences, logs or assets.

Targets are .NET 10 Android (API 24+) and unpackaged Windows. The opt-in Windows-only NaWServer MCP listener may bind loopback as documented at repository root. No other listener or iOS/Mac target is part of the app.

Run SPLA network/stream operations outside the WebView/UI synchronization context.
Android's native HTTP/SSE path can throw NetworkOnMainThreadException there even
when mock transport tests pass. Marshal presentation updates through the UI dispatcher.
See docs/reviews/REVIEW_20261109_maui-real-chat.md at the repository root.

Owner UI correction 2026-11-09 (latest): diagnostic controls stay permanently
visible as a matrix. Level numbers occur once in its header, followed by four
aligned rows: frame switch, frame color, fill color, fill switch. Never put these
controls in dropdowns/popovers/details. A single G/F checkbox beside px and alpha
selects type instead of depth; no per-level mode row. Native color pickers are
normal field editors. Keep labels terse; explanations belong in tooltips.

Designer is a shipped general-purpose tool in tools/designer, not an example.
The desktop chat/preview divider is pointer/keyboard accessible and persists its
ratio. Interface text uses shared EN/RU .resx resources via UiText; language changes
must not reset drafts, attachments, chat, connection, target project or debug state.
