// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {encode,decode} from 'cborg';
import {compileProject,encodeProject} from './index.js';
export const catalogFormat='lvgl-project-catalog-1';
export function fingerprint(bytes){let n=14695981039346656037n;for(const b of bytes)n=BigInt.asUintN(64,(n^BigInt(b))*1099511628211n);return n.toString(16).padStart(16,'0');}
export const catalogFilename=(bank,kind,index)=>`${bank}${kind==='styles'?'t':'s'}${String(index).padStart(3,'0')}.cbor`;
const equal=(a,b)=>a?.length===b?.length&&a.every((byte,i)=>byte===b[i]);
// Provisioning is a PC operation. The MCU receives compiled independent packets,
// a complete name index and an exact base fingerprint, never authoring JSON.
export function compileCatalog(base,project,capabilities){
 const original=compileProject(base,capabilities),next=compileProject(project,capabilities),files=new Map();
 const index={format:catalogFormat,base:fingerprint(encodeProject(base,capabilities)),manifest:next.manifest};
 for(const kind of ['screens','styles']){
  const entries=new Map();
  for(const [name,packet] of next[kind])if(!equal(original[kind].get(name),packet))entries.set(name,packet);
  for(const name of original[kind].keys())if(!next[kind].has(name))entries.set(name,null);
  index[kind]=new Map([...entries].map(([name,packet],i)=>{
   if(packet===null)return [name,null];
   const file=catalogFilename(0,kind,i);files.set(file,packet);return [name,{file,bytes:packet.length,hash:fingerprint(packet)}];
  }));
 }
 index.screenOrder=[...next.screens.keys()];index.styleOrder=[...next.styles.keys()];
 const payload=encode(index,{mapSorter:null}),header=new Uint8Array(24);header.set(new TextEncoder().encode('LVPROJ01'));
 const view=new DataView(header.buffer);view.setBigUint64(8,1n);view.setBigUint64(16,BigInt(payload.length));
 const envelope=new Uint8Array(32+payload.length);envelope.set(header);envelope.set(payload,24);new DataView(envelope.buffer).setBigUint64(envelope.length-8,BigInt('0x'+fingerprint(envelope.subarray(0,-8))));
 files.set('catalog.0',envelope);return {files,index};
}
export function inspectCatalog(envelope,files,bank=0){
 if(envelope.length<32||new TextDecoder().decode(envelope.subarray(0,8))!=='LVPROJ01')throw Error('Catalog header');
 const view=new DataView(envelope.buffer,envelope.byteOffset,envelope.byteLength),payload=envelope.subarray(24,-8);
 if(!view.getBigUint64(8)||view.getBigUint64(16)!==BigInt(payload.length)||view.getBigUint64(envelope.length-8)!==BigInt('0x'+fingerprint(envelope.subarray(0,-8))))throw Error('Catalog checksum');
 const index=decode(payload,{useMaps:true});if(index.get('format')!==catalogFormat)throw Error('Catalog format');
 for(const kind of ['screens','styles']){
  let i=0;for(const [name,entry] of index.get(kind)){
   const position=i++;if(entry===null)continue;
   const file=entry.get('file'),packet=files.get(file);
   if(file!==catalogFilename(bank,kind,position)||!packet||packet.length!==entry.get('bytes')||fingerprint(packet)!==entry.get('hash'))throw Error('Catalog document '+name);
  }
 }
 return index;
}
