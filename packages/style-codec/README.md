# Reusable style codec

Independent of Vue, WebSocket and ESP-IDF. The sole numbering source is `../../contracts/style-api-v2.json`; run `npm run contract` from the workspace root after reviewing a compatible contract change. Method indices are local to signatures in ABI v2; v1 packets are historical.

```js
import {encodeStyle, decodeStyle, decodePacket} from '@lvgl-cbor/style-codec';
const bytes = encodeStyle({scope:'screen',name:'demo',props:{x:40,bg_color:'#112233'}}, 'request-1');
const authoringDocument = decodeStyle(bytes);
// WebSocket: socket.binaryType = 'arraybuffer'; socket.send(bytes);
// Device replies may include the request echo and are larger than requests:
// const acknowledgement = decodePacket(replyBytes, 8704);
```

`encodeStyle` returns Uint8Array; `decodeStyle` restores the editable symbolic document. `decodePacket` preserves numeric CBOR map keys as Map and is a generic CBOR decoder, not a complete reply/schema validator. It defaults to the 8192-byte request bound; pass 8704 only when decoding this demo's acknowledgement. RGB is normalized to lowercase hex and enum symbols may decode to their numeric value. `diagnostic` is for display; it is not the authoring format.

Methods taking native pointers use registered resource names. The native application validates each name/type before calling LVGL. Conversion success alone does not establish that a resource exists on the device or that a method visibly affects a particular widget.

See `../../docs/readme_style_protocol_ru.md` for complete version, lifetime and replacement semantics. This independently authored package has no publication license selected yet; it is private workspace code.
