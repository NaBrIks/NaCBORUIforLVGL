<!-- SPDX-License-Identifier: MIT
Copyright (c) 2026 Oleg Kozhevnikov -->
<script setup>
import {computed, ref, watch} from 'vue';
import {encode} from 'cborg';
import {t} from '../state/appearance';
const props=defineProps({origin:String,bootId:String});
const active=ref(null),mode=ref('full'),buffers=ref(2),transfer=ref('dirty'),rle=ref(false),rleBuffer=ref(true),dirtyAvailable=ref(true),cyclicAvailable=ref(true),pending=ref(false),rebooting=ref(false),error=ref('');
const changed=computed(()=>active.value && (active.value.mode!==mode.value || active.value.buffers!==buffers.value || active.value.transfer!==transfer.value || (active.value.rle!==undefined &&
 (active.value.rle!==rle.value || active.value.rleBuffer!==rleBuffer.value))));
function url(origin){return new URL('/api/display/config',origin);}
watch(()=>[props.origin,props.bootId],async ([origin],_,cleanup)=>{
 const controller=new AbortController(); cleanup(()=>controller.abort());
 active.value=null; pending.value=false; rebooting.value=false; error.value='';
 try {
  const response=await fetch(url(origin),{signal:controller.signal,cache:'no-store'});
  if(!response.ok) throw Error(`HTTP ${response.status}`);
  const state=await response.json();
  if(controller.signal.aborted) return;
  active.value=state.active; mode.value=state.saved.mode; buffers.value=state.saved.buffers; transfer.value=state.saved.transfer??'dirty'; rle.value=state.saved.rle??false; rleBuffer.value=state.saved.rleBuffer??true; rebooting.value=state.rebooting; dirtyAvailable.value=state.dirtyAvailable!==false; cyclicAvailable.value=state.cyclicAvailable!==false;
 } catch(e) {if(!controller.signal.aborted) error.value=e.message;}
},{immediate:true});
async function save(){
 const origin=props.origin,boot=props.bootId;
 pending.value=true; error.value='';
 try {
  const response=await fetch(url(origin),{method:'POST',headers:{'Content-Type':'application/cbor'},body:encode({mode:mode.value,buffers:buffers.value,transfer:transfer.value,...(active.value.rle!==undefined?{rle:rle.value,rleBuffer:rleBuffer.value}:{})})});
  const result=await response.json();
  if(!response.ok) throw Error(result.error??`HTTP ${response.status}`);
  if(origin===props.origin && boot===props.bootId) rebooting.value=result.rebooting;
 } catch(e) {if(origin===props.origin && boot===props.bootId) error.value=e.message;}
 finally {if(origin===props.origin && boot===props.bootId) pending.value=false;}
}
</script>
<template>
 <section class="panel">
  <div class="panel-head"><h2>{{t('Дисплей','Display')}}</h2><span v-if="active">{{active.mode.toUpperCase()}} · {{active.buffers}} {{t('буф.','buf.')}} · {{active.pixelFormat??'RGB565'}} · {{active.transfer}}</span></div>
  <form v-if="active" class="display-options" @submit.prevent="save">
   <fieldset :disabled="pending||rebooting"><legend>{{t('Режим LVGL','LVGL mode')}}</legend>
    <label><input v-model="mode" type="radio" value="full"> FULL</label>
    <label><input v-model="mode" type="radio" value="direct"> DIRECT</label>
   </fieldset>
   <fieldset :disabled="pending||rebooting"><legend>{{t('Буферы','Buffers')}}</legend>
    <label><input v-model="buffers" type="radio" :value="1"> 1</label>
    <label><input v-model="buffers" type="radio" :value="2"> 2</label>
   </fieldset>
   <fieldset :disabled="pending||rebooting"><legend>{{t('Передача','Transfer')}}</legend>
    <label><input v-model="transfer" type="radio" value="dirty" :disabled="!dirtyAvailable"> {{t('Изменения','Dirty')}}</label>
    <label><input v-model="transfer" type="radio" value="cyclic" :disabled="!cyclicAvailable"> {{t('Цикл','Cyclic')}}</label>
   </fieldset>
   <fieldset v-if="active.rle!==undefined" :disabled="pending||rebooting"><legend>{{t('Сжатие','Compression')}}</legend>
    <label><input v-model="rle" type="checkbox"> RLE</label>
    <label :title="t('Сравнить RLE с RAW для каждой порции','Compare RLE with RAW for each packet')"><input v-model="rleBuffer" type="checkbox" :disabled="!rle"> {{t('Буфер порции','Packet buffer')}}</label>
   </fieldset>
   <button :disabled="!changed||pending||rebooting">{{t('Сохранить и перезапустить','Save and restart')}}</button>
  </form>
  <p v-if="rebooting" role="status">{{t('Перезапуск устройства…','Restarting device…')}}</p>
  <p v-if="error" role="alert">{{error}}</p>
 </section>
</template>
<style scoped>
.display-options{display:flex;flex-wrap:wrap;gap:var(--gap,8px);align-items:end;padding:6px}
fieldset{display:flex;gap:8px;margin:0;padding:2px 6px}
label{white-space:nowrap}
</style>
