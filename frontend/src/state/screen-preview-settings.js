// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {computed,inject,provide,ref,watch} from 'vue';
import {readSaved,save} from './persistence.js';

const settingsKey=Symbol('screen-preview-settings');
const storageKey='lvgl-cbor-screen-preview-settings';

export function provideScreenPreviewSettings(){
 const saved=readSaved(storageKey,{});
 const settings=ref(saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{});
 watch(settings,value=>save(storageKey,value),{deep:true});
 provide(settingsKey,settings);
}

// Browser preferences stay separate from authoring documents and wire payloads.
export function useScreenPreviewSettings(screenId){
 const settings=inject(settingsKey,null)??ref({});
 const showHidden=computed({
  get:()=>settings.value[screenId()]?.showHidden===true,
  set:value=>{settings.value={...settings.value,[screenId()]:{showHidden:value===true}};}
 });
 return {showHidden};
}
