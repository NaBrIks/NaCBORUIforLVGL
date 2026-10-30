// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {ref,computed,watch,onBeforeUnmount} from 'vue';
import {encodeScreen,decodeScreen,screenContract} from '@lvgl-cbor/screen-codec';
import {CommandChannel} from '../transport/command-channel.js';
export function useScreenController(connection,{document,page,auto,simulated,projectPreview,suspended,previewKey,otherBusy=()=>false}){
 const screenBusy=ref(false),screenResult=ref('');let queued=false,disposed=false;
 const screenCanApply=computed(()=>simulated||connection.httpOnline.value&&connection.screenCompatible.value&&!otherBusy());
 const channel=new CommandChannel({origin:connection.origin,path:'/screen-ws',onError:message=>screenResult.value=message,validate:ack=>{if(ack.get('abi')!==screenContract.sha256)throw Error('Screen ACK ABI mismatch');}});
 const stopReset=connection.onReset(()=>{queued=false;channel.stop();});
 function checkScreen(){try{const bytes=encodeScreen(document.value,'check-screen',simulated?undefined:connection.capabilities.value);decodeScreen(bytes,simulated?undefined:connection.capabilities.value);screenResult.value='CBOR ↔ JSON проверен: '+bytes.length+' B.'+(simulated?' LVGL в браузере не исполняется.':'');}catch(e){screenResult.value=e.message;}}
 async function sendScreen(){
  if(screenBusy.value){queued=true;return;}if(simulated){checkScreen();return;}
  queued=false;screenBusy.value=true;const epoch=connection.epoch.value;
  try{
   if(!screenCanApply.value)throw Error('Нужно подключение с совместимыми возможностями МК');
   if(projectPreview&&connection.capabilities.value?.project){const ack=await projectPreview();if(epoch!==connection.epoch.value||disposed)throw Error('cancelled');screenResult.value='Предпросмотр на МК: '+ack.nodes+' объектов. Проект не сохранён.';return;}
   const name=document.value.name,bytes=encodeScreen(document.value,'screen-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),connection.capabilities.value);
   const webSocketLimit=connection.capabilities.value?.limits.screenWebSocketPacketBytes??connection.info?.value?.max_screen_packet??connection.capabilities.value?.limits.screenPacketBytes??screenContract.limits.packetBytes;
   if(bytes.length>webSocketLimit)throw Error('Экран превышает лимит прямого WebSocket: '+bytes.length+' / '+webSocketLimit+' B. Используйте API проектов этой прошивки.');
   screenResult.value='Отправка '+bytes.length+' B…';const ack=await channel.request(bytes);
   if(epoch!==connection.epoch.value||disposed)throw Error('cancelled');
   screenResult.value='МК применил '+name+': '+ack.get('nodes')+' объектов, '+ack.get('methods')+' операций';void connection.refresh();
  }catch(e){if(e.message!=='cancelled')screenResult.value=e.message;}
  finally{screenBusy.value=false;if(queued)queueMicrotask(()=>{if(queued&&page.value==='screens'&&auto.value&&!suspended?.value&&screenCanApply.value&&!disposed){queued=false;void sendScreen();}});}
 }
 watch([()=>document.value.id,()=>page.value,()=>previewKey?.value,()=>suspended?.value,()=>auto.value],()=>{queued=false;},{flush:'sync'});
 watch(()=>({id:document.value.id,json:JSON.stringify(document.value)}),(next,previous)=>{if(next.id!==previous.id||next.json===previous.json)return;if(!suspended?.value&&page.value==='screens'&&auto.value&&screenCanApply.value)void sendScreen();});
 onBeforeUnmount(()=>{disposed=true;stopReset();channel.stop();});
 return {screenBusy,screenResult,screenCanApply,checkScreen,sendScreen};
}
