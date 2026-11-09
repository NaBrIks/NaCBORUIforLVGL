// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {contract} from './contract.js';
import {object,encodeValue,decodeValue} from './values.js';
const active=contract.methods.filter(m=>!m.retired);
export const byName=new Map(active.flatMap(m=>[[m.alias,m],[m.name,m]]));
const byOpcode=new Map(active.map(m=>[m.opcode,m]));
function visit(entries,decode){
 const result=decode?{}:new Map(),used=new Map();
 if(entries.length>256)throw Error('Method count');
 for(const [key,value] of entries){
  const method=(decode?byOpcode:byName).get(key);if(!method)throw Error('Unknown method: '+key);
  for(const property of method.properties){if(used.has(property))throw Error('Overlapping property: '+property+' ('+used.get(property)+' and '+method.alias+')');used.set(property,method.alias);}
  const args=method.parameters.length===1?[value]:value;
  if(!Array.isArray(args)||args.length!==method.parameters.length)throw Error('Argument count: '+key);
  const converted=args.map((v,i)=>(decode?decodeValue:encodeValue)(method.parameters[i],v,method.properties[i]??method.alias));
  const convertedValue=method.parameters.length===1?converted[0]:converted;
  if(decode)result[method.alias]=convertedValue;else result.set(method.opcode,convertedValue);
 }
 return result;
}
export function encodeMethods(props={}){object(props,Object.keys(props),'Style properties');return visit(Object.entries(props),false);}
export function decodeMethods(methods){if(!(methods instanceof Map))throw Error('Methods map');return visit([...methods],true);}
export const normalizeProperties=props=>decodeMethods(encodeMethods(props));
