import {encode,decode} from 'cborg';
import {contract} from './contract.js';
import {encodeMethods,decodeMethods} from './methods.js';
import {object,text} from './values.js';
import {checkStyleCapabilities} from './capabilities.js';
export {contract,encodeMethods,decodeMethods};
export {checkStyleCapabilities};
export {normalizeProperties} from './methods.js';
export function styleReference(value){text(value,79,'Style reference');if(!/^(global|global-static|global-dynamic|screen):[^:]+$/.test(value))throw Error('Expected scope:name');return value;}
function validateDocument(document){
 object(document,['scope','name','copy','merge','props','attach'],'Style document');
 if(!['global','screen'].includes(document.scope))throw Error('Unknown scope');
 text(document.name,31,'Style name');
 const copy=document.copy??null;if(copy!==null)styleReference(copy);
 const merge=document.merge??[];if(!Array.isArray(merge)||merge.length>8)throw Error('Merge array');merge.forEach(styleReference);
 if(document.scope==='global'&&[copy,...merge].some(ref=>ref?.startsWith('screen:')))throw Error('Global style cannot copy screen style');
 if(document.attach!==undefined&&typeof document.attach!=='boolean')throw Error('attach must be boolean');
 return {scope:document.scope,name:document.name,copy,merge,attach:document.attach??true};
}
export function encodeStyle(document,id,capabilities){
 const envelope=validateDocument(document),methods=encodeMethods(document.props??{});
 checkStyleCapabilities(document.props,capabilities);
 const bytes=encode({v:contract.version,id:text(id,47,'Request id'),...envelope,methods});
 if(bytes.length>Math.min(contract.maxPacketBytes,capabilities?.limits.stylePacketBytes??contract.maxPacketBytes))throw Error('Packet too large');return bytes;
}
export function decodePacket(bytes,maxBytes=contract.maxPacketBytes){
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>maxBytes)throw Error('Packet size');
 return decode(bytes,{useMaps:true,rejectDuplicateMapKeys:true,allowIndefinite:false,allowNaN:false,allowInfinity:false,allowUndefined:false,allowBigInt:false,strict:true});
}
export function decodeStyle(bytes){
 const packet=decodePacket(bytes);if(!(packet instanceof Map)||packet.get('v')!==contract.version)throw Error('Style packet');
 if([...packet.keys()].some(key=>!['v','id','scope','name','copy','merge','attach','methods'].includes(key)))throw Error('Unknown style packet field');
 text(packet.get('id'),47,'Request id');
 const props=decodeMethods(packet.get('methods'));
 return {...validateDocument({scope:packet.get('scope'),name:packet.get('name'),copy:packet.get('copy'),merge:packet.get('merge'),attach:packet.get('attach'),props}),props};
}
export const normalizeStyle=document=>decodeStyle(encodeStyle(document,'normalize'));
export function diagnostic(value){return JSON.stringify(value,(_,v)=>v instanceof Map?Object.fromEntries([...v].map(([key,item])=>[String(key),item])):v,2);}
