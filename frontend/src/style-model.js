// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {contract} from '@lvgl-cbor/style-codec';
export const byName=new Map(contract.methods.filter(m=>!m.retired).flatMap(m=>[[m.alias,m],[m.name,m]]));
export const flagTypes=new Set(['lv_border_side_t','lv_text_decor_t']);
export const fonts=[{name:'default',label:'По умолчанию · 14 px'},{name:'montserrat_20',label:'Montserrat · 20 px'},{name:'montserrat_28',label:'Montserrat · 28 px'}];
export function expandProps(props){
 const result={};
 for(const [name,value] of Object.entries(props)){
  const method=byName.get(name);if(!method)throw Error('Unknown method '+name);
  method.properties.forEach((property,index)=>{result[property]=method.parameters.length>1?value[index]:value;});
 }
 return result;
}
export function kind(method){const type=method.parameters[0];return type==='lv_color_t'?'color':type==='bool'?'boolean':type==='const lv_font_t *'?'font':type.includes('*')?'resource':Object.keys(contract.enums[type]??{}).length?(flagTypes.has(type)?'flags':'enum'):'number';}
export function limits(type){return type==='lv_opa_t'||type==='uint8_t'?[0,255]:type==='uint16_t'?[0,65535]:type==='uint32_t'?[0,4294967295]:[-2147483648,2147483647];}
export function defaultValue(method){const type=method.parameters[0],name=method.alias;if(contract.valueRules.properties[name]?.min>0)return contract.valueRules.properties[name].min;return type==='lv_color_t'?'#ffffff':type==='bool'?false:type==='const lv_font_t *'?'default':type.includes('*')?'':Object.values(contract.enums[type]??{})[0]??(type==='lv_opa_t'?255:name.includes('scale')?256:0);}
export function effective(props,name,fallback=0){
 if(Object.hasOwn(props,name))return props[name];
 for(const [alias,value] of Object.entries(props)){const m=byName.get(alias),index=m?.properties.indexOf(name);if(index>=0)return m.parameters.length>1?value[index]:value;}
 return fallback;
}
export function updateProperty(props,name,value){
 const expanded=expandProps(props);if(value===undefined)delete expanded[name];else expanded[name]=value;return expanded;
}
