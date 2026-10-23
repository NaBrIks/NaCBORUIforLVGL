# ADR: independent project documents in one indexed storage layer

Status: Accepted, 2026-10-22. Extends ADR_20261022_project-service without changing its source/store or preview/save boundaries.

The owner requests a ROM TPMS/GPS base, additional screens in filesystem storage, and a formal way to discover independent screens and styles. The identified S3 has 16 MiB flash and no filesystem partition in the original three-entry layout.

Use a portable `CatalogProjectStore` implementing the existing single `ProjectStore`. `lvgl-project-catalog-1` indexes independent compiled packets by stable names, with a base fingerprint, complete manifest and complete order arrays. There is no directory scan or extra overlay priority. Service status exposes kind/name/origin/location/size to HTTP and host MCP; editors consume this generic catalog.

Two document banks and checksummed catalog generations provide publish-last saves. Validate referenced packet sizes/hashes before choosing a generation; reclaim only unused inactive bank slots. Existing wire screen/style commands remain unchanged. Compile/validate references and order on PC.

For this board choose built-in ESP-IDF SPIFFS at 0xC00000, size 0x400000. All existing partition entries remain byte-identical. The application mounts it without automatic formatting; a mount failure leaves the ROM base read-only. SPIFFS, SD drivers and physical paths stay outside portable core. Native components remain registered by the application, with no radar-specific editor controls.

Provisioning the complete FS image is an explicit operation, distinct from ordinary app updates and explicit project saves. On this device the existing bootloader's declared flash size was 8 MiB; only its size header and validation SHA were corrected using esptool, preserving executable code and DIO/80 MHz settings.

The ROM demo has four tire pressure/temperature readings and a native GPS dial. Filesystem additions include radar/trip screens and independent styles. Sensor values are labelled demo; this decision does not add actual sensor drivers or data bindings.
