// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
const normalized=value=>Array.isArray(value)?value.map(normalized):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalized(value[key])])):value;
const same=(a,b)=>JSON.stringify(normalized(a))===JSON.stringify(normalized(b));
export function assertScreenAbiCompatible(previous,current){
 if(previous.version!==current.version||previous.format!==current.format)throw Error('Screen ABI version');
 if(!same(previous.commands,current.commands)||!same(previous.wire,current.wire))throw Error('Reassigned command format');
 const services=new Set(Object.values(current.commands));
 for(const [i,widget]of current.widgets.entries())if(widget.id!==i)throw Error('Factory order');
 for(const group of [current.common,...current.widgets]){
  const codes=new Set(),aliases=new Set();
  for(const m of group.methods){
   const common=group===current.common;
   if(!Number.isInteger(m.opcode)||m.opcode<(common?1:256)||m.opcode>(common?255:65535)||
      common&&services.has(m.opcode)||codes.has(m.opcode)||aliases.has(m.alias))throw Error('Invalid local opcode');
   codes.add(m.opcode);aliases.add(m.alias);
  }
 }
 for(const category of ['parts','states','flags'])for(const [name,value]of Object.entries(previous[category]))if(current[category][name]!==value)throw Error('Reassigned '+category);
 for(const old of [previous.common,...previous.widgets]){
  const next=old.name?current.widgets.find(w=>w.id===old.id):current.common;
  if(!next||old.name&&(next.name!==old.name||next.create!==old.create||next.feature!==old.feature))throw Error('Reassigned widget ID');
  for(const method of old.methods){const newer=next.methods.find(m=>m.opcode===method.opcode),{retired:wasRetired,...before}=method,{retired:isRetired,...after}=newer??{};if(!same(after,before)||wasRetired&&!isRetired)throw Error('Reassigned screen method');}
 }
}
