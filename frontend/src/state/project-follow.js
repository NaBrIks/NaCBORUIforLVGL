// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {ref,computed} from 'vue';

// Compare authoring data independently of JSON key order or Vue proxy identity.
const snapshot=project=>JSON.stringify(project,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value);

export function useProjectFollow({project,read,replace,current=()=>true}){
 const revision=ref(''),remoteRevision=ref(''),baseline=ref(null),loading=ref(false);
 let generation=0;
 const following=computed(()=>baseline.value!==null);
 const dirty=computed(()=>following.value&&snapshot(project.value)!==baseline.value);
 const conflict=computed(()=>following.value&&dirty.value&&!!remoteRevision.value&&remoteRevision.value!==revision.value);
 function anchor(nextRevision,document){generation++;revision.value=nextRevision;remoteRevision.value=nextRevision;baseline.value=snapshot(document);}
 function reset(){generation++;revision.value='';remoteRevision.value='';baseline.value=null;}
 async function update(info){
  remoteRevision.value=info.project.revision;
  if(!following.value||dirty.value||loading.value||remoteRevision.value===revision.value)return false;
  const token=generation;loading.value=true;
  try{
   const next=await read();
   // A user edit, a different project/device, or a reset during the read wins.
   if(token!==generation||!current()||dirty.value)return false;
   await replace(next.project);
   if(token!==generation||!current())return false;
   anchor(next.revision,next.project);return true;
  }finally{loading.value=false;}
 }
 return {revision,remoteRevision,following,dirty,conflict,loading,anchor,reset,update};
}
