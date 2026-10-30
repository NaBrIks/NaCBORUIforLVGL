// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {ref,computed,watch} from 'vue';
import {createNode,SCREEN_FORMAT,widgetTypes} from '../screen-model.js';
import {readSaved,save} from './persistence.js';
export function usePreviewWorkspace(styleDoc,page,screenWorkspace){
 const saved=readSaved('lvgl-cbor-preview',{});
 const previewSettings=ref({zoom:0,grid:0,...saved.settings}),componentSize=ref(saved.size??{width:800,height:480});
 const componentType=ref(widgetTypes.includes(saved.componentType)?saved.componentType:'label'),componentText=ref(typeof saved.text==='string'?saved.text:'LVGL preview');
 watch([previewSettings,componentSize,componentType,componentText],()=>save('lvgl-cbor-preview',{settings:previewSettings.value,size:componentSize.value,componentType:componentType.value,text:componentText.value}),{deep:true});
 function componentDocument(includeStyle=false){
  const sample=createNode(componentType.value,'sample');sample.style=includeStyle?{...styleDoc.value.props}:{};
  if(['label','button','textarea','checkbox'].includes(sample.type))sample.props.text=componentText.value;
  return {format:SCREEN_FORMAT,id:'component-preview',name:'Component preview',theme:'device',size:componentSize.value,styles:{},root:{id:'preview-root',type:'obj',props:{},style:{bg_color:'#f1f1ec',bg_opa:255},flags:{SCROLLABLE:false},children:[sample]}};
 }
 const componentScreen=computed(()=>componentDocument(true));
 function resizePreview(size){if(page.value==='screens')screenWorkspace.update({...screenWorkspace.current.value,size});else componentSize.value=size;}
 return {previewSettings,componentSize,componentType,componentText,componentScreen,componentDocument,resizePreview};
}
