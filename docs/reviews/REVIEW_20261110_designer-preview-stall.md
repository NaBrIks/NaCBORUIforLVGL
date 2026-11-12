# Designer preview stall / interrupted receipts — 2026-11-10

## Observed state, before restarting anything

The Designer process was responsive, but the model turn was still running after
several minutes. Its visible log repeatedly called get_data_command and reported
only `Ok`. UI guards disabled frame refresh and diagnostic controls for the whole
model turn. The turn was stopped through the existing Stop action; chat was kept.

The S3 answered info/data in 30–60 ms with zero bindingErrors. Its boot ID differed
from the previous acceptance, and reset_reason was 4 (ESP_RST_PANIC). Diagnostic
options had returned to defaults and the command receipt list was empty. Therefore
old receipt polling could not confirm completion. A complete current frame was
received in about 3.6 s. This does not establish the original panic's call site:
no crash dump was retained and a boot-ID change alone is not a decoded backtrace.

## Fix

- Manual frame refresh and layout diagnostics no longer depend on the model turn's
  busy flag. Diagnostic writes still serialize on their own ACK; frame downloads
  remain latest-only. Target switching/reconnect retain their lifecycle guards.
- Direct API receipt reads compare the target's boot ID with the connected boot.
  A restart returns `interrupted`, even if a new boot has reused the same numeric
  command ID. An unknown receipt explicitly advises inspecting actual project/data
  instead of indefinite polling or blind mutation replay.
- The existing SPLA orchestrator remains the agent engine. Its loop guard remains
  enabled; no alternative agent loop or arbitrary new tool-call limit was added.
- Tool logs now include arguments and a bounded result excerpt, so receipt IDs and
  execution states are visible rather than only transport outcome `Ok`.
- English/Russian agent instructions describe volatile receipts and reboot recovery.

## Verification

- 379 JS tests PASS, including unknown receipt guidance and reused-ID reboot case.
- Core tests PASS: while a real SPLA model request is deliberately blocked, frame
  capture and two diagnostic commands complete independently. Cancellation still
  releases the model turn. No provider requests are made by these fixtures.
- Windows App build: zero warnings/errors.
- Actual S3 stress: 16 complete frames concurrent with layer/opacity commands,
  about 90 s. Same boot ID throughout; internal free heap remained 75791–75799 B;
  commands completed in 170–529 ms. USB log had no new panic/backtrace.
  Saved project compared equal before/after; baseline debug options restored.
- The earlier panic has NOT been reproduced or claimed fixed. Its origin remains
  unlocalized. The stress test verifies present frame/control stability only.

Private device evidence and current project snapshot are under ignored local/.
No firmware, display timing, NTP or saved project was changed in this correction.
The interrupted chat text was exported before a proposed client restart. Restart
and visual verification of the corrected client are pending owner confirmation.

Additional verification: eight refresh_project_display composition rebuilds,
concurrent with complete frame downloads, retained the boot ID and stable heap.
The user/model-authored saved project (including its new Night button) remained
unchanged. This is additional coverage, not a reproduction of the earlier panic.

An explicit deviceRestarted receipt now terminates the current SPLA turn before
another provider request; the deterministic test verifies exactly one model call
and the detailed receipt state in the log. This prevents a weaker model from
ignoring the restart explanation and continuing a paid receipt-polling loop.

## 2026-11-11: Night button and firmware error returns

A captured S3 panic reproduced by tapping Night was decoded against the matching
ELF. The call to `Appearance::select("night")` entered
`__wrap___cxa_allocate_exception` and aborted. The project had saved a button
with a local color override and an action argument for an unregistered palette.
The advertised text schema did not enumerate the installed palettes.

Appearance loading and selection, remote pointer input, demo data and the LilyGO
serial command path now use return values for expected errors. The S3 demo no
longer enables exceptions for its component and LilyGO defaults disable them.
Driver initialization and display synchronization still have explicit fail-fast
checks. The optional native MCP implementation is currently a Windows target.

S3 was built and updated in its active application slot. On the same saved
project, invoking Night via API returned `Unknown scheme: night`. Clicking the
existing button through LVGL input reported the same error in binding diagnostics.
The boot ID stayed constant and the valid Emerald action succeeded. The saved
project compared equal before and after. The Windows native-view regression passed.
The LilyGO firmware also built successfully with exceptions disabled. Its USB
command path was verified by compilation. The Windows catalog/history regression
and all 379 JavaScript tests passed.
