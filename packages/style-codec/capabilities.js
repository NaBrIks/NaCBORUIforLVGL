// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {contract} from './contract.js';
import {byName} from './methods.js';
export function checkStyleCapabilities(props,capabilities){
 if(!capabilities)return;
 if(capabilities.format!=='lvgl-cbor-capabilities-1'||capabilities.style?.sha256!==contract.sha256)throw Error('Device style contract mismatch');
 const available=new Set(capabilities.style.methods.filter(m=>!m.retired).map(m=>m.opcode));
 for(const [name,value] of Object.entries(props??{})){
  const method=byName.get(name);if(!method||!available.has(method.opcode))throw Error('Device does not support '+name);
  const args=method.parameters.length===1?[value]:value;
  method.parameters.forEach((type,i)=>{
   const property=method.properties[i]??method.alias,argument=args[i];
   if(property==='layout'){
    const id=typeof argument==='string'?contract.valueRules.properties.layout.symbols[argument]:argument;
    if(!capabilities.layouts.includes(id))throw Error('Device layout unavailable: '+argument);
   }
   if(type.includes('*')&&typeof argument==='string'&&!capabilities.resources.some(r=>r.name===argument&&r.type===type))throw Error('Device resource unavailable: '+argument+' ('+type+')');
  });
 }
}
