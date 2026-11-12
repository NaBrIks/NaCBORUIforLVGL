<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {computed,inject,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import {encode} from 'cborg';
import {readNativeFrame} from '../../../packages/project-codec/progressive-frame.js';
import {createFrameSurface} from '../../../packages/project-codec/frame-surface.js';
import {readBoundedDataJson} from '../../../packages/project-codec/data-query.js';
import {appearance,t} from '../state/appearance';
import AppearanceMenu from './AppearanceMenu.vue';
import Icon from './Icon.vue';
const props=defineProps({embedded:{type:Boolean,default:false},active:{type:Boolean,default:true},origin:{type:String,default:()=>location.origin},interactive:{type:Boolean,default:true}});

const image=ref(),details=ref(),frameReady=ref(false),frameVisible=ref(false),width=ref(0),height=ref(0),paused=ref(false);
const progressive=ref(false),progress=ref(null);
const project=inject('lvgl-project',null);
const frameError=ref(''),inputError=ref('');
const error=computed(()=>inputError.value||frameError.value);
const status=computed(()=>paused.value?t('Пауза','Paused'):error.value?t('Нет связи','Disconnected'):frameReady.value?t('Подключён','Connected'):t('Подключение…','Connecting…'));
let generation=0,pressedOrigin,disposed=false,frameTimer,frameController,holdTimer,pointerId=null,pressed=false,x=0,y=0,inputBusy=false;
const inputs=[];let intervalOrigin=null,frameInterval=200;

let surface,paint,revision,scene,packetsEnabled=false;
const viewing=()=>!disposed&&props.active&&!paused.value&&!document.hidden;
function cancelFrame(){
 generation++;
 clearTimeout(frameTimer);
 frameController?.abort();
 paint?.rollback();
 paint=undefined;
 frameVisible.value=frameReady.value;
 progress.value=null;
}
function wakeFrame(){
 clearTimeout(frameTimer);
 if(viewing()&&!frameController)frameTimer=setTimeout(refreshFrame,0);
}
async function refreshFrame(){
 if(!viewing()||frameController)return;
 const started=Date.now(),current=++generation,controller=new AbortController(),target=props.origin;
 const baseline=revision;let retryFull=false,frameMeta;
 frameController=controller;
 const deadline=setTimeout(()=>controller.abort(),15000);
 try{
  if(intervalOrigin!==target){
   let interval=200,packets=false;
   try{
    const response=await fetch(new URL('/api/info',target),{cache:'no-store',signal:controller.signal});
    if(response.ok){
     const info=await readBoundedDataJson(response,262144),value=info.native_view_interval_ms;
     packets=info.native_view_packets===true?(info.native_view_packet_version===2?2:1):false;
     if(Number.isInteger(value)&&value>=200&&value<=60000)interval=value;
    }
   }catch(error){if(controller.signal.aborted)throw error;}
   if(current===generation){intervalOrigin=target;frameInterval=interval;packetsEnabled=packets;}
  }
  const frame=await readNativeFrame(fetch,target,{
   since:baseline,packets:packetsEnabled,signal:controller.signal,
   onHeader(meta){
    if(!meta.full&&scene!=null&&meta.scene!=null&&scene!==meta.scene)throw Error('frame_scene_changed');
    frameMeta=meta;
   },
   onRows(batch){
    paint??=surface.begin(frameMeta,{progressive:progressive.value});
    paint.rows(batch);
    if(progressive.value)frameVisible.value=true;
   },
   onProgress:value=>{progress.value=value;}
  });
  if(current!==generation)return;
  paint?.commit();
  paint=undefined;
  revision=frame.revision;
  if(!frame.unchanged){scene=frame.scene;width.value=frame.width;height.value=frame.height;frameReady.value=true;frameVisible.value=true;}
  frameError.value='';
 }catch(error){
  if(current===generation){
   paint?.rollback();
   paint=undefined;
   revision=undefined;
   frameVisible.value=frameReady.value;
   progress.value=null;
   retryFull=baseline!=null&&!controller.signal.aborted;
   frameError.value=retryFull?'':error.message;
  }
 }finally{
  clearTimeout(deadline);
  if(frameController===controller)frameController=null;
  if(viewing()){
   const wait=current!==generation||retryFull?0:frameError.value?Math.max(800,frameInterval):Math.max(0,frameInterval-(Date.now()-started));
   frameTimer=setTimeout(refreshFrame,wait);
  }
 }
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
 if(!props.interactive||!props.active||event.button!==0||pointerId!==null||paused.value||!frameReady.value||image.value.width!==width.value||image.value.height!==height.value)return;
 position(event);pressedOrigin=props.origin;pointerId=event.pointerId;pressed=true;image.value.setPointerCapture(pointerId);queueInput(true);
 clearInterval(holdTimer);holdTimer=setInterval(()=>{if(pressed)queueInput();},150);
}
function move(event){if(event.pointerId===pointerId&&pressed){position(event);queueInput();}}
function release(event){
 if(!pressed||event&&event.pointerId!==undefined&&event.pointerId!==pointerId)return;
 if(event&&Number.isFinite(event.clientX))position(event);
 pressed=false;pointerId=null;clearInterval(holdTimer);queueInput(true);
}
function togglePause(){paused.value=!paused.value;if(paused.value){release();cancelFrame();}else wakeFrame();}
function toggleProgressive(){progressive.value=!progressive.value;cancelFrame();wakeFrame();}
function visibility(){if(document.hidden){release();cancelFrame();}else wakeFrame();}
watch(()=>props.active,value=>{if(value)wakeFrame();else{release();cancelFrame();}});
watch(()=>props.interactive,value=>{if(!value)release();});
// The editor refreshes display status after an explicit show/preview. A selected
// authoring page does not change that status and leaves the real viewer passive.
watch(()=>{
 const display=project?.controller.deviceProject.value?.display;
 return display&&JSON.stringify([display.screen,display.instance,display.revision,display.views?.map(view=>[view.instance,view.pageInstance,view.selected])]);
},(next,previous)=>{if(next&&previous){cancelFrame();revision=scene=undefined;wakeFrame();}});

watch(()=>props.origin,()=>{
 release();cancelFrame();intervalOrigin=null;frameInterval=200;revision=scene=undefined;packetsEnabled=false;
 surface?.clear();frameVisible.value=false;frameReady.value=false;
 width.value=0;height.value=0;frameError.value='';inputError.value='';wakeFrame();
});
onMounted(()=>{
 surface=createFrameSurface(image.value);wakeFrame();
 window.addEventListener('blur',release);
 document.addEventListener('visibilitychange',visibility);
});
onBeforeUnmount(()=>{
 release();disposed=true;cancelFrame();clearInterval(holdTimer);
 window.removeEventListener('blur',release);
 document.removeEventListener('visibilitychange',visibility);
});
</script>
<template>
 <component :is="embedded?'section':'main'" class="native-viewer" :class="{embedded}">
  <header class="native-viewer-head" :class="{topbar:!embedded}">
   <strong v-if="!embedded" class="brand">NaCBORUIforLVGL</strong>
   <span class="native-viewer-state" :class="error?'bad':'muted'" :data-tooltip="error||t('Экран работающего LVGL-приложения','The running LVGL application screen')">{{status}}</span>
   <span v-if="embedded" class="native-viewer-origin" :data-tooltip="origin">{{origin}}</span>
   <span class="native-viewer-size">{{width||'—'}} × {{height||'—'}}</span>
   <progress class="native-viewer-progress" :class="{idle:!progress}" :value="progress?.received??0" :max="progress?.total??1" :aria-label="t('Загрузка кадра','Frame download')" :data-tooltip="t('Загрузка кадра','Frame download')"></progress>
   <button class="icon-button" :class="{selected:progressive}" :aria-pressed="progressive" :aria-label="t('Показывать по мере загрузки','Show while downloading')" :data-tooltip="t('Показывать по мере загрузки','Show while downloading')" @click="toggleProgressive"><Icon name="list-details"/></button>
   <button class="icon-button" :aria-label="paused?t('Продолжить просмотр','Resume view'):t('Приостановить просмотр','Pause view')" :data-tooltip="t('Приостановить только передачу кадров; приложение продолжает работать','Pause frame delivery only; the application keeps running')" @click="togglePause"><Icon :name="paused?'player-play':'player-pause'"/></button>
   <button class="icon-button" :aria-label="t('Сведения о просмотре','View details')" :data-tooltip="t('Сведения о просмотре','View details')" @click="details.showModal()"><Icon name="info-circle"/></button>
   <a v-if="!embedded" href="/editor/">{{t('Редактор','Editor')}}</a>
   <div v-if="!embedded" class="appearance-controls"><AppearanceMenu/><button class="language-button" @click="appearance.language=appearance.language==='ru'?'en':'ru'">{{appearance.language.toUpperCase()}}</button></div>
  </header>
  <div class="native-viewer-body"><section class="native-viewer-stage" :aria-label="t('Экран LVGL','LVGL screen')">
   <canvas v-show="frameVisible" ref="image" role="img" :aria-label="t('Экран работающего LVGL-приложения','The running LVGL application screen')" :class="{'native-viewer-frame':frameVisible,readonly:!interactive}" :data-ready="frameReady" @pointerdown.prevent="down" @pointermove.prevent="move" @pointerup.prevent="release" @pointercancel="release" @lostpointercapture="release" @contextmenu.prevent></canvas>
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
.native-viewer-progress{flex:none;width:3em;height:4px;accent-color:var(--lu-primary);}.native-viewer-progress.idle{visibility:hidden;}
.native-viewer-head .selected{color:var(--lu-primary);}
.native-viewer-body{flex:1;display:flex;min-height:0;min-width:0;}
.native-viewer-stage{flex:1;min-height:0;min-width:0;display:flex;align-items:center;justify-content:center;overflow:hidden;overscroll-behavior:contain;padding:10px;background:#242a31;}
.native-viewer-frame{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;outline:1px solid #89929c;touch-action:none;user-select:none;}
.native-viewer-details{max-width:min(560px,calc(100vw - 32px));padding:12px;border:1px solid var(--lu-border);background:var(--lu-surface);color:var(--lu-text);}
.native-viewer-details h2{font-size:16px;margin:0 0 8px;}.native-viewer-details p{margin:8px 0;}.native-viewer-details form{text-align:right;}
@media(max-width:650px){.native-viewer-head .brand{display:none;}.native-viewer-head{gap:5px;}.native-viewer-origin{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--lu-text-muted);}
.native-viewer-size{width:6em;}}
</style>
