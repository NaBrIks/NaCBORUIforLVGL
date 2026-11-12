// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Author-facing projection, not a second converter or a wire schema.
import {contract as style} from '../style-codec/contract.js';
import {screenContract as screen} from '../screen-codec/contract.js';
import {defaultParameter} from '../screen-codec/parameter-schema.js';
export const widgetEnumerations={
 lv_label_long_mode_t:{LV_LABEL_LONG_MODE_WRAP:0,LV_LABEL_LONG_MODE_DOTS:1,LV_LABEL_LONG_MODE_SCROLL:2,LV_LABEL_LONG_MODE_SCROLL_CIRCULAR:3,LV_LABEL_LONG_MODE_CLIP:4},
 lv_scrollbar_mode_t:{LV_SCROLLBAR_MODE_OFF:0,LV_SCROLLBAR_MODE_ON:1,LV_SCROLLBAR_MODE_ACTIVE:2,LV_SCROLLBAR_MODE_AUTO:3},
 lv_arc_mode_t:{LV_ARC_MODE_NORMAL:0,LV_ARC_MODE_SYMMETRICAL:1,LV_ARC_MODE_REVERSE:2},
 lv_dir_t:style.enums.lv_dir_t,lv_obj_flag_t:Object.fromEntries(Object.entries(screen.flags).map(([n,v])=>['LV_OBJ_FLAG_'+n,v])),lv_state_t:{LV_STATE_DEFAULT:0,...Object.fromEntries(Object.entries(screen.states).map(([n,v])=>['LV_STATE_'+n,v]))}
};
const bounds=m=>Object.fromEntries(['min','max','values','mask','constraint'].filter(k=>m[k]!==undefined).map(k=>[k,m[k]]));
function widgetValue(method){const values=method.parameters.map(p=>p==='resource'?'registered_resource':defaultParameter(typeof p==='string'?{type:p,...bounds(method)}:p));return method.alias==='options'?['One','Two']:values.length===1?values[0]:values;}
export function describeWidget(widget){return {
 type:widget.name,...(widget.description?{description:widget.description}:{}),...(widget.appearance?{appearance:widget.appearance}:{}),...(widget.create?{lvglCreate:widget.create}:{}),
 methods:widget.methods.filter(m=>!m.retired).map(m=>({json:'props.'+m.alias,name:m.alias,...(m.c?{lvgl:m.c==='set_line_points'?'lv_line_set_points':m.c}:{}),parameters:m.parameters,example:{props:{[m.alias]:widgetValue(m)}},...bounds(m),...(m.fixed?.length?{implicitArguments:m.fixed}:{}),...Object.fromEntries(m.parameters.filter(p=>typeof p==='string'&&widgetEnumerations[p]).map(p=>[p,widgetEnumerations[p]]))})),
 events:(widget.events??[]).map(e=>({name:e.name,...(e.value?{value:e.value}:{})}))
};}
function styleValue(type,property){
 if(style.valueRules.dimension.properties.includes(property))return {pct:100};
 if(style.valueRules.grid.properties.includes(property))return [{fr:1},{fr:1}];
 if(type==='lv_color_t')return '#336699';if(type==='bool')return true;if(type.includes('*'))return 'registered_resource';
 const symbols=style.valueRules.properties[property]?.symbols??style.enums[type];if(symbols)return Object.keys(symbols)[0];
 return style.valueRules.properties[property]?.min??(['lv_opa_t','uint8_t'].includes(type)?255:0);
}
export function describeStyle(method){const values=method.parameters.map((type,i)=>styleValue(type,method.properties[i]??method.alias));const enumerations=Object.fromEntries(method.parameters.filter(t=>style.enums[t]).map(t=>[t,style.enums[t]]));const rules=Object.fromEntries(method.properties.filter(p=>style.valueRules.properties[p]).map(p=>[p,style.valueRules.properties[p]]));return {
 name:method.alias,lvgl:method.name,json:'style.'+method.alias,parameters:method.parameters,
 example:{style:{[method.alias]:values.length===1?values[0]:values}},
 ...(method.properties.length>1?{setsProperties:method.properties}:{}),
 ...(Object.keys(enumerations).length?{enumerations}:{}),...(Object.keys(rules).length?{rules}:{})
};}
export function authoringCatalog(){return {widgets:screen.widgets.map(describeWidget),common:{...describeWidget({...screen.common,name:'common'}),methods:describeWidget({...screen.common,name:'common'}).methods.map(m=>({...m,json:m.json.replace('props.','common.'),example:{common:m.example.props}}))},styles:style.methods.filter(m=>!m.retired).map(describeStyle),parts:Object.keys(screen.parts),states:Object.keys(screen.states),flags:Object.keys(screen.flags)};}
