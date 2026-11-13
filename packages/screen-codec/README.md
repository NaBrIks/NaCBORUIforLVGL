# Screen codec

Private workspace package, independent of Vue, transport and ESP-IDF.

`encodeScreen(document, requestId, capabilities?)` validates and compiles the authoring document. `decodeScreen(bytes)` validates and reconstructs its canonical authoring representation. `normalizeScreen(document)` defines that representation explicitly; it retains title, Button.text, typed units, resource names and operations. Numeric enum values and canonical method aliases replace equivalent spellings. `decodeScreenPacket` is a generic wire decoder for diagnostics/acknowledgements.

Value adapters live in style-codec/values.js as adjacent encode/decode pairs. Widget argument adapters are in widget-methods.js; selectors in selectors.js. encode.js and decode.js assemble those adapters; layout-validation.js checks known structural constraints. validateScreen uses the actual compiler, rather than a parallel validator.

Optional capabilities come from `/api/capabilities`; they restrict resources, compiled factories, layouts and limits. Offline validation does not establish that a native resource/global style exists. MCU validation remains authoritative for external application state and resources.

Screen ABI v3: the PC validates semantics and phase order, then command-stream.js emits nested arrays. Opcode 0 creates and selects a handler; common commands use 1..255, component-local methods 256..65535. Styles are separate nested blocks executed under style ABI v2. Array order survives CBOR map-key sorting. Runtime extension catalogs contain local methods, not signature indices.

`decodeScreen` and `normalizeScreen` also accept capabilities. Declarative decoding rejects repeated methods and operation orders that the authoring format cannot preserve. Optional envelope `captions` records generated Button labels without adding a runtime opcode. See examples/native_widget and docs/readme_fast_executor.ru.md.
