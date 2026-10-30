// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {ref,watch} from 'vue';
import {encodeStyle} from '@lvgl-cbor/style-codec';
import {expandProps} from '../style-model.js';
import {readSaved,save} from './persistence.js';
export function useStyleWorkspace({document}={}){
 const fallback={scope:'screen',name:'demo',copy:'global:base',merge:[],attach:true,props:expandProps({x:60,y:100,width:420,height:150,bg_color:'#173344',bg_opa:255,text_color:'#F6E9C8',text_font:'montserrat_28',border_width:3,border_color:'#36B58C',radius:12,pad_all:18})};
 let initial=readSaved('lvgl-cbor-style-doc',fallback);
 try{encodeStyle(initial,'restore');initial={...initial,props:expandProps(initial.props??{})};}catch{initial=fallback;}
 const styleDoc=document??ref(initial),autoStyle=ref(readSaved('lvgl-cbor-auto',true)!==false),autoScreen=ref(readSaved('lvgl-cbor-screen-auto',false)===true);
 if(!document)watch(styleDoc,value=>save('lvgl-cbor-style-doc',value),{deep:true});
 watch(autoStyle,value=>save('lvgl-cbor-auto',value));watch(autoScreen,value=>save('lvgl-cbor-screen-auto',value));
 return {styleDoc,autoStyle,autoScreen};
}
