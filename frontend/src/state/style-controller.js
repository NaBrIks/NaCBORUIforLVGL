// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {ref,computed,watch,onBeforeUnmount} from 'vue';
import {contract,encodeStyle,decodeStyle,diagnostic} from '@lvgl-cbor/style-codec';
import {CommandChannel} from '../transport/command-channel.js';
import {ComponentPreviewLink} from '../component-preview-link.js';

export function useStyleController(connection,{document,page,auto,preview,simulator,projectPreview,suspended,otherBusy=()=>false,onEvent=()=>{},onOnline=()=>{},onSocketState=()=>{}}){
 const busy=ref(false),componentBusy=ref(false),error=ref(''),reply=ref(null),hex=ref(''),decoded=ref(''),observed=ref(null),wsStatus=ref('stopped'),connectionNote=ref(''),styleCheckResult=ref('');
 const online=computed(()=>wsStatus.value==='online'),canApply=computed(()=>connection.ready.value&&online.value);
 let queued=false,disposed=false;
 const channel=new CommandChannel({origin:connection.origin,path:'/ws',...(simulator?{makeSocket:()=>simulator.socket()}:{}),onEvent,onState:state=>{wsStatus.value=state;onSocketState(state);if(state==='online')onOnline();},onError:message=>connectionNote.value=message,validate:ack=>{if(!simulator&&ack.get('contract_sha256')!==contract.sha256)throw Error('Style ACK ABI mismatch');}});
 const component=new ComponentPreviewLink({document:()=>preview.componentDocument(),origin:connection.origin,limit:()=>connection.capabilities.value?.limits.screenPacketBytes??3584,capabilities:()=>connection.capabilities.value,bootId:()=>connection.info.value?.boot_id,busy:value=>componentBusy.value=value,applied:(ack,doc)=>styleCheckResult.value='МК создал '+doc.root.children[0].type+' · кадр '+ack.get('frame_count')});
 function reset(){queued=false;channel.stop();component.invalidate();observed.value=null;reply.value=null;connectionNote.value='';}
 const stopReset=connection.onReset(reset);
 function convert(){const bytes=encodeStyle(document.value,globalThis.crypto?.randomUUID?.()??'style-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),simulator?undefined:connection.capabilities.value);hex.value=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join(' ');decoded.value=JSON.stringify(decodeStyle(bytes),null,2);return bytes;}
 function check(){try{const bytes=convert();error.value='';styleCheckResult.value='CBOR проверен: '+bytes.length+' B.';}catch(e){error.value=e.message;}}
 async function send(){
  if(disposed)return;if(busy.value){queued=true;return;}if(otherBusy())return;
  const epoch=connection.epoch.value;busy.value=true;queued=false;
  try{
   if(!canApply.value)throw Error('Соединение с платой восстанавливается');
   if(projectPreview&&connection.capabilities.value?.project){const ack=await projectPreview();if(epoch!==connection.epoch.value||disposed)throw Error('cancelled');styleCheckResult.value='Предпросмотр на МК · '+ack.nodes+' объектов. Проект не сохранён.';error.value='';return;}
   if(!simulator&&connection.info.value?.component_preview)await component.ensureLatest();
   if(epoch!==connection.epoch.value||disposed)throw Error('cancelled');
   const bytes=convert();reply.value=null;const ack=await channel.request(bytes,{timeout:5000});
   if(epoch!==connection.epoch.value||disposed)throw Error('cancelled');
   const display=new Map(ack);display.set('echo',ack.get('echo')?.byteLength??0);reply.value=diagnostic(display);error.value='';
   if(ack.get('observed') instanceof Map)observed.value=Object.fromEntries(ack.get('observed'));
   if(ack.get('echo') instanceof Uint8Array)decoded.value=JSON.stringify(decodeStyle(ack.get('echo')),null,2);
   void connection.refresh();
  }catch(e){if(e.message!=='cancelled')error.value=e.message;}
  finally{busy.value=false;if(queued&&canApply.value&&!disposed){queued=false;queueMicrotask(send);}}
 }
 watch([connection.ready,connection.epoch],()=>{if(connection.ready.value){channel.open();}});
 watch(document,()=>{if(!suspended?.value&&auto.value&&page.value==='styles'&&canApply.value)void send();},{deep:true});
 watch([preview.componentType,preview.componentText,preview.componentSize],()=>{if(!suspended?.value&&page.value==='styles'&&auto.value&&canApply.value)void send();},{deep:true});
 onBeforeUnmount(()=>{disposed=true;stopReset();reset();});
 return {busy,componentBusy,error,reply,hex,decoded,observed,wsStatus,online,connectionNote,styleCheckResult,canApply,send,check};
}
