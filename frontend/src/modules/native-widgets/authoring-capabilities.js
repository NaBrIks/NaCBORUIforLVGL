// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {computed,ref,watch} from 'vue';
import {offlineCapabilities,widgetCatalog,screenContract} from '@lvgl-cbor/screen-codec';
import {contract} from '@lvgl-cbor/style-codec';
const key='lvgl-cbor-native-catalog-1';
export function readCatalogCache(storage=globalThis.localStorage){
 try{
  const saved=JSON.parse(storage.getItem(key));
  if(saved?.screen?.sha256!==screenContract.sha256||saved?.style?.sha256!==contract.sha256)return null;
  widgetCatalog(saved);
  return {...offlineCapabilities(),...saved,source:'offline-cache'};
 }catch{return null;}
}
// Preserve authoring after reload/offline. Sending always uses live capabilities separately.
export function useAuthoringCapabilities(live){
 const cached=ref(readCatalogCache());let previous='';
 watch(live,value=>{
  if(!value)return;
  try{widgetCatalog(value);const serialized=JSON.stringify(value);cached.value={...value,source:'offline-cache'};if(serialized!==previous){localStorage.setItem(key,serialized);previous=serialized;}}catch{}
 },{immediate:true});
 return computed(()=>live.value??cached.value);
}
