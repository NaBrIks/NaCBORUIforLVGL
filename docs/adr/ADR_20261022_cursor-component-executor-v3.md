# Screen ABI v3: cursor component executor

Accepted 2026-10-22 by explicit owner instruction. Supersedes the component portion of ADR_20261022_signature-pointer-executor-v2.md; style ABI v2 remains unchanged.

- Opcode 0 creates an object. The command is `[0, type, body]`; `body` is an array of commands executed with that object as current context.
- Common opcodes are 1..255. Local component methods are 256..65535, without component bits or signature bits. The same local ID may name different methods in different components.
- A builtin type is an integer or name. A registered native type is `[id-or-name, abi]`; factory and handler are resolved once on creation. Numeric types are emitted by the standard compiler.
- Common commands initially cover ID assignment, an inline style block, a referenced style and the six existing flag/state/scroll operations. Unassigned common IDs are reserved, not no-ops. This change does not export every LVGL API.
- Inline styles pass `[selector, style-method-map]` to the existing style executor. No style-property opcode is allocated in the common component namespace.
- Component handlers receive `(object, method, CborValue&, WidgetContext&)` and consume exactly one argument value. The executor consumes the surrounding command array. Creation recursively consumes the body and returns to the parent's next command.
- PC compiles and validates semantics and ordering. MCU retains bounded parsing, resource/ABI/registration availability, storage limits and cleanup. No per-method descriptions, strings or validation tables exist on the MCU dispatch path.
- MCU keeps an ownership tree for ID lookup, cleanup, borrowed data and pinned registrations/styles, not a predecoded command tree. A failed staged build destroys partial objects and preserves the prior live instance.
- Native factories/handlers can register and unregister at runtime. Live instances retain the registration. Registration does not load executable code.
- Screen ABI changes from v2 to v3. Old compiled screens must be recompiled from authoring JSON. Style contract and style packets stay v2.
- The declarative JSON codec roundtrips compiler-produced streams. A custom program with parent commands after children can execute natively, but is rejected by declarative decode if its ordering cannot be represented without change. Button caption provenance is stored in optional envelope metadata, not an executable command.
