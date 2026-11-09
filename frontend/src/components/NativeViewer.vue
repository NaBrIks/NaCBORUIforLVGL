<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {computed,nextTick,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import {encode} from 'cborg';
import {appearance,t} from '../state/appearance';
import AppearanceMenu from './AppearanceMenu.vue';
import Icon from './Icon.vue';
const props=defineProps({embedded:{type:Boolean,default:false},active:{type:Boolean,default:true},origin:{type:String,default:()=>location.origin},interactive:{type:Boolean,default:true}});

const image=ref(),details=ref(),frameUrl=ref(''),width=ref(0),height=ref(0),paused=ref(false);
const frameError=ref(''),inputError=ref('');
const error=computed(()=>inputError.value||frameError.value);
const status=computed(()=>paused.value?t('Пауза','Paused'):error.value?t('Нет связи','Disconnected'):frameUrl.value?t('Подключён','Connected'):t('Подключение…','Connecting…'));
let generation=0,pressedOrigin,disposed=false,frameTimer,frameController,holdTimer,pointerId=null,pressed=false,x=0,y=0,inputBusy=false;
const inputs=[];

async function refreshFrame(){
 if(disposed)return;
 if(props.active&&!paused.value&&!document.hidden){
  const current=++generation,controller=new AbortController();frameController=controller;
  const deadline=setTimeout(()=>controller.abort(),5000);
  try{
   const response=await fetch(new URL('/api/view/frame',props.origin),{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('Frame HTTP '+response.status);
   if(Number(response.headers.get('Content-Length'))>8388662)throw Error('Frame byte limit');
   const blob=await response.blob();if(blob.size>8388662)throw Error('Frame byte limit');
   const url=URL.createObjectURL(blob),probe=new Image();probe.src=url;
   try{await probe.decode();if(probe.naturalWidth*probe.naturalHeight>2097152)throw Error('Frame pixel limit');}
   catch(e){URL.revokeObjectURL(url);throw e;}
   if(disposed||current!==generation||!props.active||paused.value)URL.revokeObjectURL(url);
   else {
    width.value=probe.naturalWidth;height.value=probe.naturalHeight;
    const previous=frameUrl.value;frameUrl.value=url;frameError.value='';
    await nextTick();if(previous)URL.revokeObjectURL(previous);
   }
  }catch(e){if(!disposed&&current===generation&&props.active&&!paused.value)frameError.value=e.message;}
  finally{clearTimeout(deadline);if(frameController===controller)frameController=null;}
 }
 if(!disposed)frameTimer=setTimeout(refreshFrame,frameError.value?800:200);
}
async function drainInput(){
 if(inputBusy||disposed)return;inputBusy=true;
 try{
  while(inputs.length&&!disposed){
   const {edge,origin,...state}=inputs.shift();
   const response=await fetch(new URL('/api/view/input',origin),{method:'POST',headers:{'Content-Type':'application/cbor'},body:encode(state),signal:AbortSignal.timeout(2000)});
   if(!response.ok)throw Error('Input HTTP '+response.status);
   const result=await response.json();if(result.ok!==true)throw Error(result.error??'Input rejected');
   inputError.value='';
  }
 }catch(e){inputError.value=e.message;inputs.length=0;pressed=false;pointerId=null;clearInterval(holdTimer);}
 finally{inputBusy=false;}
}
function queueInput(edge=false){
 if(disposed)return;
 const state={x,y,pressed,edge,origin:pressedOrigin},last=inputs.at(-1);
 if(!edge&&last&&!last.edge)inputs[inputs.length-1]=state;
 else if(inputs.length<8)inputs.push(state);
 else {inputError.value='Input queue limit';pressed=false;inputs.length=0;clearInterval(holdTimer);return;}
 void drainInput();
}
function position(event){
 const rect=image.value.getBoundingClientRect();
 x=Math.max(0,Math.min(width.value-1,Math.floor((event.clientX-rect.left)*width.value/rect.width)));
 y=Math.max(0,Math.min(height.value-1,Math.floor((event.clientY-rect.top)*height.value/rect.height)));
}
function down(event){
 if(!props.interactive||!props.active||event.button!==0||pointerId!==null||paused.value||!frameUrl.value)return;
 position(event);pressedOrigin=props.origin;pointerId=event.pointerId;pressed=true;image.value.setPointerCapture(pointerId);queueInput(true);
 clearInterval(holdTimer);holdTimer=setInterval(()=>{if(pressed)queueInput();},150);
}
function move(event){if(event.pointerId===pointerId&&pressed){position(event);queueInput();}}
function release(event){
 if(!pressed||event&&event.pointerId!==undefined&&event.pointerId!==pointerId)return;
 if(event&&Number.isFinite(event.clientX))position(event);
 pressed=false;pointerId=null;clearInterval(holdTimer);queueInput(true);
}
function togglePause(){paused.value=!paused.value;if(paused.value){release();frameController?.abort();}}
function visibility(){if(document.hidden)release();}
watch(()=>props.active,value=>{if(!value){generation++;release();frameController?.abort();}});
watch(()=>props.interactive,value=>{if(!value)release();});
watch(()=>props.origin,()=>{
 generation++;release();frameController?.abort();
 const previous=frameUrl.value;frameUrl.value='';width.value=0;height.value=0;frameError.value='';inputError.value='';
 if(previous)URL.revokeObjectURL(previous);
});
onMounted(()=>{void refreshFrame();window.addEventListener('blur',release);document.addEventListener('visibilitychange',visibility);});
onBeforeUnmount(()=>{
 release();disposed=true;clearTimeout(frameTimer);clearInterval(holdTimer);frameController?.abort();
 window.removeEventListener('blur',release);document.removeEventListener('visibilitychange',visibility);
 if(frameUrl.value)URL.revokeObjectURL(frameUrl.value);
});
</script>
<template>
 <component :is="embedded?'section':'main'" class="native-viewer" :class="{embedded}">
  <header class="native-viewer-head" :class="{topbar:!embedded}">
   <strong v-if="!embedded" class="brand">NaCBORUIforLVGL</strong>
   <span class="native-viewer-state" :class="error?'bad':'muted'" :data-tooltip="error||t('Экран работающего LVGL-приложения','The running LVGL application screen')">{{status}}</span>
   <span v-if="embedded" class="native-viewer-origin" :data-tooltip="origin">{{origin}}</span>
   <span class="native-viewer-size">{{width||'—'}} × {{height||'—'}}</span>
   <button class="icon-button" :aria-label="paused?t('Продолжить просмотр','Resume view'):t('Приостановить просмотр','Pause view')" :data-tooltip="t('Приостановить только передачу кадров; приложение продолжает работать','Pause frame delivery only; the application keeps running')" @click="togglePause"><Icon :name="paused?'player-play':'player-pause'"/></button>
   <button class="icon-button" :aria-label="t('Сведения о просмотре','View details')" :data-tooltip="t('Сведения о просмотре','View details')" @click="details.showModal()"><Icon name="info-circle"/></button>
   <a v-if="!embedded" href="/editor/">{{t('Редактор','Editor')}}</a>
   <div v-if="!embedded" class="appearance-controls"><AppearanceMenu/><button class="language-button" @click="appearance.language=appearance.language==='ru'?'en':'ru'">{{appearance.language.toUpperCase()}}</button></div>
  </header>
  <div class="native-viewer-body"><section class="native-viewer-stage" :aria-label="t('Экран LVGL','LVGL screen')">
   <img v-if="frameUrl" ref="image" class="native-viewer-frame" :src="frameUrl" :alt="t('Экран работающего LVGL-приложения','The running LVGL application screen')" :class="{readonly:!interactive}" draggable="false" @pointerdown.prevent="down" @pointermove.prevent="move" @pointerup.prevent="release" @pointercancel="release" @lostpointercapture="release" @contextmenu.prevent>
  </section></div>
  <dialog ref="details" class="native-viewer-details">
   <h2>{{t('Просмотр приложения','Application view')}}</h2>
   <p v-if="!interactive">{{t('Только просмотр текущего экрана выбранного устройства. Выбор страницы и вкладки в редакторе не меняет устройство.','Read-only view of the selected device. Selecting editor pages or tabs does not change the device.')}}</p>
   <p v-else>{{t('Кадры рисует работающее LVGL-приложение. Нажатия передаются его отдельному указателю; события, биндинги и страницы исполняет тот же runtime.','Frames are rendered by the running LVGL application. Pointer input goes to its independent input device; the same runtime executes events, bindings and pages.')}}</p>
   <p>{{t('Просмотр требует запущенного приложения. Клавиатурный ввод пока не передаётся. При потере связи нажатие автоматически отпускается через 500 мс.','The application must remain running. Keyboard input is not forwarded yet. A lost connection releases a pressed pointer after 500 ms.')}}</p>
   <p v-if="error"><code>{{error}}</code></p>
   <form method="dialog"><button class="action-button">{{t('Закрыть','Close')}}</button></form>
  </dialog>
 </component>
</template>
<style scoped>
.native-viewer{height:100dvh;display:flex;flex-direction:column;min-height:0;min-width:0;background:var(--lu-bg-canvas);color:var(--lu-text);}
.native-viewer.embedded{height:100%;}.embedded .native-viewer-head{display:flex;align-items:center;height:30px;min-height:30px;padding:2px 8px;border-bottom:1px solid var(--lu-border);background:var(--lu-surface);}
.native-viewer-head{flex:none;min-width:0;gap:8px;}
.native-viewer-state{width:9em;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.native-viewer-origin{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--lu-text-muted);}
.native-viewer-size{width:8em;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
.native-viewer-body{flex:1;display:flex;min-height:0;min-width:0;}
.native-viewer-stage{flex:1;min-height:0;min-width:0;display:flex;align-items:center;justify-content:center;overflow:hidden;overscroll-behavior:contain;padding:10px;background:#242a31;}
.native-viewer-frame{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;outline:1px solid #89929c;touch-action:none;user-select:none;}
.native-viewer-details{max-width:min(560px,calc(100vw - 32px));padding:12px;border:1px solid var(--lu-border);background:var(--lu-surface);color:var(--lu-text);}
.native-viewer-details h2{font-size:16px;margin:0 0 8px;}.native-viewer-details p{margin:8px 0;}.native-viewer-details form{text-align:right;}
@media(max-width:650px){.native-viewer-head .brand{display:none;}.native-viewer-head{gap:5px;}.native-viewer-origin{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--lu-text-muted);}
.native-viewer-size{width:6em;}}
</style>
