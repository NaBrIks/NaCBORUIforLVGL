import {encodeScreen,decodeScreen} from '@lvgl-cbor/screen-codec';
import {encodeStyle,decodeStyle} from '@lvgl-cbor/style-codec';
import {encodeProject,decodeProject,recompileProjectAuthoring} from '../project-codec/index.js';

// Browser and Node share the same validation and wire format. No file or UI dependencies here.
export const maxDocumentBytes=2*1024*1024;
const codecs={screen:{encode:encodeScreen,decode:decodeScreen},style:{encode:encodeStyle,decode:decodeStyle},project:{encode:(doc,_id,caps)=>encodeProject(doc,caps),decode:decodeProject}};
const codec=kind=>{if(!Object.hasOwn(codecs,kind))throw Error('Unknown document kind');return codecs[kind];};
export function validateDocument(kind,document,capabilities){codec(kind).encode(document,'file-check',capabilities);return document;}
export function documentFilename(kind,document,format){
 if(!['json','cbor'].includes(format))throw Error('File format');
 return (String(document.manifest?.id??document.id??document.name??kind).replace(/[^\p{L}\p{N}_.-]/gu,'_').slice(0,80)||kind)+'.'+format;
}
export function serializeDocument(kind,document,format,{capabilities,requestId='file-export'}={}){
 const c=codec(kind),wire=c.encode(document,requestId,capabilities);
 if(format==='cbor')return wire;
 if(format!=='json')throw Error('File format');
 const bytes=new TextEncoder().encode(JSON.stringify(document,null,2)+'\n');
 if(bytes.length>maxDocumentBytes)throw Error('Document exceeds 2 MiB');
 return bytes;
}
export function parseDocument(kind,input,{format,capabilities,onRecompile}={}){
 const c=codec(kind),bytes=typeof input==='string'?new TextEncoder().encode(input):input;
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>maxDocumentBytes)throw Error('Document size: 1 byte to 2 MiB');
 if(format===undefined){const first=bytes.find(b=>![9,10,13,32].includes(b));format=first===123||bytes[0]===239?'json':'cbor';}
 let document;
 if(format==='json'){document=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(kind==='project'){const result=recompileProjectAuthoring(document,capabilities);document=result.project;if(result.migrated)onRecompile?.();}}
 else if(format==='cbor')document=c.decode(bytes,capabilities);
 else throw Error('File format');
 validateDocument(kind,document,capabilities);
 return document;
}
