// v2 IDs are local to a signature; the pair (signature, index) is the identity.
export function assertSignatureSlots(methods, signatures) {
 if(new Set(signatures.map(s=>s.id)).size!==signatures.length)throw Error('Duplicate signature ID');
 if(new Set(methods.map(m=>m.opcode)).size!==methods.length)throw Error('Duplicate operation');
 for(const s of signatures){
  if(!Number.isInteger(s.id)||s.id<0||s.id>255)throw Error('Signature byte overflow');
  const group=methods.filter(m=>m.signature===s.id).sort((a,b)=>a.index-b.index);
  group.forEach((m,i)=>{if(m.index!==i||i>255||m.opcode!==((s.id<<8)|i)||JSON.stringify(m.parameters)!==JSON.stringify(s.parameters))throw Error('Invalid signature-local slot');});
 }
 if(methods.some(m=>!signatures.some(s=>s.id===m.signature)))throw Error('Unknown signature');
}
export function assertAbiCompatible(previous,next){
 if(previous.version!==next.version||previous.family!==next.family)throw Error('ABI namespace changed');
 assertSignatureSlots(next.methods,next.signatures);
 for(const [type,values] of Object.entries(previous.enums??{}))for(const [name,value] of Object.entries(values))if(next.enums?.[type]?.[name]!==value)throw Error('Enum ABI changed');
 for(const old of previous.signatures){const item=next.signatures.find(s=>s.id===old.id);if(!item||JSON.stringify(item.parameters)!==JSON.stringify(old.parameters))throw Error('Signature ID changed or removed');}
 for(const old of previous.methods){const item=next.methods.find(m=>m.opcode===old.opcode);if(!item||['name','alias','signature','index'].some(k=>item[k]!==old[k])||JSON.stringify(item.parameters)!==JSON.stringify(old.parameters)||JSON.stringify(item.properties)!==JSON.stringify(old.properties))throw Error('Method ID changed or removed');if(old.retired&&!item.retired)throw Error('Retired method reused');}
}
