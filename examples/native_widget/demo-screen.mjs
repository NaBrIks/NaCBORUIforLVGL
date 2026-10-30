// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {readFileSync} from 'node:fs';
export const extensions=JSON.parse(readFileSync(new URL('../s3_style_lab/main/native_widgets/catalog.json',import.meta.url),'utf8')).map(({symbol,...entry})=>entry);
const component=(index,id,x,y,width,height,props)=>({id,type:extensions[index].name,props:{...extensions[index].contract.defaults,...props},style:{x,y,width,height},children:[]});
export const nativeDemo={format:'lvgl-screen-draft-1',id:'native_components',name:'Три нативных компонента',size:{width:800,height:480},theme:'none',styles:{},root:{id:'root',type:'obj',flags:{SCROLLABLE:false},style:{bg_color:'#0c1b24',bg_opa:255,pad_all:0},children:[
 {id:'heading',type:'label',props:{text:'NATIVE GRAPHICS / VECTOR + POLAR'},style:{x:16,y:16,text_color:'#e9f3f6',text_font:'montserrat_20'},children:[]},
 component(0,'signal',16,56,340,100,{title:'SENSOR LINK / CAN-01',state:1}),
 component(1,'speedometer',16,168,340,292,{}),
 component(2,'radar',368,48,416,412,{})
]}};
