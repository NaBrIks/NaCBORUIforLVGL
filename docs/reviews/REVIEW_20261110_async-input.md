# Async diagnostics and remote LVGL input

## Goal

Diagnostic checkboxes must wait only for the command acknowledgement, not for a
large image download. Remote pointer events use LVGL hit testing and normal events.
Device catalog maintenance stays in Settings; target selection belongs in the main form.

## Transport

Existing WebSocket messages carry data/project invalidations. Screenshots use the
existing HTTP BMP endpoint; SSE is not the screenshot transport. A second protocol
or server was not introduced. S3 now enables the optional managed NaWServer mode:
maximum 3 HTTP workspaces, incremental 1024-byte writes, no keep-alive, transport
buffer budget 256 KiB with PreferPSRAM placement. API payload ownership and the
lazy 768066-byte RGB565 screenshot are separate from that transport buffer budget.

Frame, capabilities and Project/Data API payloads retain their owners until send
completion/drop. Large project/catalog replies do not depend on a 4096-byte copied
response limit. Cancellation releases the screenshot lease. Native MCP stays off
on the MCU; no new JSON parser is added.

## Input

POST /api/view/input accepts application/cbor with integer x/y and boolean pressed,
using original display pixels. S3 validates size/types/bounds before enqueueing.
A fixed queue of 16 preserves DOWN/UP positions, coalesces moves and processes at
most 16 entries per UI tick. Shared Windows/S3 Pointer is a separate LVGL indev;
the physical GT911 remains independent. A 500 ms watchdog releases lost presses.

Direct API and optional Windows MCP advertise send_view_input. Support is gated
by native_view_input. MAUI pointer mapping must account for object-fit:contain,
letterbox and original dimensions. Control is opt-in; ordinary viewing is passive.

## Verification completed so far

- 378 JS tests PASS, including pointer mapping, bounded queue, cancellation/release.
- Windows real LVGL native-view test PASS; optional native MCP test with 12 tools PASS.
- C++ tests PASS: initial DOWN position survives coalescing; overflow recovers;
  deferred payload survives its handler and releases ownership on drop/rejection.
- S3 built/flashed app-only after MAC/OTA checks. Saved project unchanged.
- Actual S3 pointer tests PASS: page buttons, scheme action, dragging off a button,
  watchdog release and rejection of out-of-range coordinates; no bindingErrors.
- Slow screenshot download remained in flight while six diagnostic commands
  completed in 156–296 ms each. Only 66560 of 768066 frame bytes had been consumed
  when the final command completed. Aborting that transfer did not prevent the
  next complete frame. This verifies server-side separation as well as client UI work.

MAUI final UI acceptance and main-form target chooser results will be added after
that build. Hardware/frame evidence and private addresses stay in ignored local/.

## Cold browser on the actual managed S3

A dedicated headless Chromium with a new empty profile opened the device's existing
root editor (`/`) directly. PASS: all nine requested CSS/JavaScript assets returned
200, without a capacity 503. The full capabilities JSON was 46,780 bytes and parsed
successfully; the saved project CBOR read returned 200 with 10,516 bytes. This checks
large responses and real editor decoding beyond the former 4096-byte copy limit.

Layout fetched no native frames. The LVGL tab decoded two distinct 800x480 RGB565
BMP16 frames, each 768,066 bytes, with BI_BITFIELDS masks f800/07e0/001f and offset66.
Three expected warming 503 responses with Retry-After: 1 produced no red error:
status moved from Connecting to Connected. The image fit the viewer. Returning to
Layout stopped frame requests. Project revision, root shell and selected setup
page were identical before and after. API writes, render WebSocket messages and
browser exceptions: zero. Screenshot and machine measurements are in ignored
local/s3-managed-editor. Only the test's own browser/profile were created/closed;
no firmware writes, GPIO changes or user application restarts were performed.

## MAUI live Windows acceptance

The updated Designer was built with zero compiler warnings/errors and launched as
one Windows instance. Direct API connected to the real S3 and discovered 22 tools.
A diagnostic checkbox became available again in 547 ms, while its displayed frame
had not changed yet. A second checkbox command was accepted independently.
The slow-frame transport experiment above measures the server separately.

Real WebView pointer input (not direct action invocation) selected the dashboard,
returned to Setup and selected Emerald, then Cream. The normal LVGL event binding
changed the scheme. Control is opt-in and was returned to off after testing.

Editing the Windows catalog row and saving connections kept S3 active and connected.
Selecting Windows in the main header instead changed the active target, cleared the
old image and required explicit reconnect. Selecting S3 again also required reconnect.
The catalog entries and model settings were preserved; no model invocation occurred.

Testing exposed a stale-frame adoption race during several changes in one transfer.
The client now versions refresh requests as well as connections and discards obsolete
results, without cancelling/restarting a transfer on every checkbox. One pending
latest request remains bounded. Final rebuilt UI verification is recorded below.

## Final rebuilt client

The final Windows build (zero warnings/errors) was launched and the real-device
WebView test repeated. Checkbox ACK/unlock took 483 ms and still preceded frame
replacement. Pointer page navigation and Emerald/Cream events passed again.
After the background worker settled, the displayed image showed Setup/Cream with
all diagnostic frames/fills off; it no longer retained the earlier dashboard image.
Final saved project comparison passed; bindingErrors remained zero.

Core tests cover the blocked-frame ACK, one-running/one-pending worker, stale request
and stale connection rejection, optional input and catalog selection/fallback.
The editor cold-browser check, native Windows tests and real S3 API tests above
are complementary; they do not by themselves certify the physical LCD output.
On 2026-11-10 the owner confirmed that the physical LCD shows the interface after
the latest firmware update with asynchronous frames and pointer input. This closes
the pending physical-display check; it is owner-observed evidence, separate from
the automated framebuffer/API tests above. NTP was not changed.
