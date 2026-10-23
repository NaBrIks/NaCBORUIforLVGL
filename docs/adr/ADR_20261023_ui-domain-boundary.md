# UI domain boundary

Status: accepted, owner decision 2026-10-23.

This supersedes only the optional scanner placement in ADR_20261022_data-bindings-events.md. Generic data bindings, events and page ownership remain unchanged.

NaCBORUIforLVGL owns UI documents, codecs, authoring, rendering and generic data/action contracts. Domain libraries own their hardware transports, discovery, parsing and domain-specific examples. The UI repository must not contain a Bluetooth scanner, its library dependency, its example pages or radio acceptance tools.

The former domain example is handed off to its library project before removal. Existing user projects are not silently rewritten; their sources must be supplied by the owning application. Historical acceptance reports remain historical evidence and do not advertise current features.
