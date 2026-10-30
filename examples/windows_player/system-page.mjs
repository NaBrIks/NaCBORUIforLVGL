// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Example composition only: these are ordinary JSON nodes compiled by project-codec.
// No renderer, binding evaluator or component-specific editor code lives here.
import {readFileSync} from 'node:fs';
import {offlineCapabilities} from '../../packages/screen-codec/index.js';
export const historyPlotExtension={id:512,name:'demo:history_plot',abi:'history-1',
  contract:JSON.parse(readFileSync(new URL('./history-plot.json',import.meta.url),'utf8'))};
export function exampleCapabilities() {
  const capabilities=offlineCapabilities();
  capabilities.extensions=[historyPlotExtension];capabilities.availableWidgets.push(historyPlotExtension.id);
  capabilities.resources=[...['montserrat_12','montserrat_14','montserrat_20','montserrat_28','ui_14','ui_20','ui_28']
    .map(name=>({name,type:'const lv_font_t *'})),...['ui_sample_image','ui_sample_image_small'].map(name=>({name,type:'const void *'})),
    ...['canvas','panel','status','text','muted','button','button_pressed','button_focus','focus_outline','button_disabled','indicator','track','knob','arc_track','arc_value']
      .map(name=>({name:'ui.'+name,type:'const lv_style_t *'}))];
  return capabilities;
}
const role=(ref,part='MAIN')=>({ref:'global-static:ui.'+ref,part,state:[]});
const path=(source,...path)=>({source,path});
function node(id,type,x,y,width,height,props={},styles=[]) {
  return {id,type,props,style:{x,y,width,height,pad_all:0,border_width:0,radius:0,text_font:'ui_14'},
    styles,flags:{SCROLLABLE:false},children:[]};
}
const label=(id,x,y,w,text,binding)=>({...node(id,'label',x,y,w,18,{text,long_mode:1},[role('text')]),
  ...(binding?{bindings:[{method:'text',value:binding}]}:{})});
const plot=(id,x,y,w,h,value)=>({...node(id,'demo:history_plot',x,y,w,h,{},[role('panel'),role('indicator','INDICATOR')]),
  bindings:[{method:'series',value}]});
const full={pct:100};
function flex(n,flow='LV_FLEX_FLOW_COLUMN',gap=4) {
  delete n.style.x;delete n.style.y;
  Object.assign(n.style,{layout:'LV_LAYOUT_FLEX',flex_flow:flow,pad_row:gap,pad_column:gap});return n;
}
function grow(n,horizontal=false) {
  Object.assign(n.style,{flex_grow:1,...(horizontal?{width:0,height:full}:{width:full,height:0})});return n;
}
function block(id) {
  const n=flex(node(id,'obj',0,0,full,0,{},[role('panel')]));
  Object.assign(n.style,{pad_all:6,border_width:1,radius:2});return n;
}
export function systemPage(coreCount=32,gpuCount=2) {
  if(!Number.isInteger(coreCount)||coreCount<0||coreCount>64||!Number.isInteger(gpuCount)||gpuCount<0||gpuCount>4)
    throw Error('System demo topology limits: 0..64 logical processors, 0..4 GPUs');
  const root=flex(node('root','obj',0,0,800,408,{},[role('canvas')]),'LV_FLEX_FLOW_COLUMN',6);
  delete root.style.width;delete root.style.height;root.style.pad_all=6;
  const cpu=grow(block('cpu_group'));cpu.style.flex_grow=3;
  const total=flex(node('cpu_summary','obj',0,0,full,{pct:25}, {},[role('panel')]),'LV_FLEX_FLOW_ROW',6);
  total.style.min_height=54;
  total.children.push(grow(flex(plot('cpu_history',0,0,1,full,path('system.cpu','series'))),true));
  const info=flex(node('cpu_info','obj',0,0,230,full,{},[role('panel')]),'LV_FLEX_FLOW_COLUMN',0);
  const count=label('core_count',0,0,full,'Logical processors: —',path('system.cpu','count'));
  count.bindings[0].format={prefix:'Logical processors: '};
  info.children.push(flex(count),flex(label('logical_heading',0,0,full,'Logical processors · CPU time / %')),
    flex(label('interval',0,0,full,'1 s · 32 samples · 0–100%')));
  total.children.push(info);cpu.children.push(total);
  const area=grow(flex(node('core_area','obj',0,0,1,1,{},[role('panel')])));area.flags.SCROLLABLE=true;
  const rows=Math.max(1,Math.ceil(coreCount/8));
  const cores=flex(node('core_grid','obj',0,0,full,full,{},[role('panel')]));
  cores.style.min_height=coreCount?rows*32+(rows-1)*4:0;
  for(let r=0;r<rows;r++) {
    const row=grow(flex(node('core_row_'+r,'obj',0,0,1,1,{},[role('panel')]),'LV_FLEX_FLOW_ROW'));
    for(let col=0;col<8;col++) {
      const i=r*8+col;
      row.children.push(grow(flex(i<coreCount?plot('core_'+i,0,0,1,1,path('system.cores',i)):
        node('core_empty_'+i,'obj',0,0,1,1,{},[role('panel')])),true));
    }
    cores.children.push(row);
  }
  area.children.push(cores);cpu.children.push(area);root.children.push(cpu);
  const lower=grow(flex(node('system_lower','obj',0,0,1,1,{},[role('canvas')]),'LV_FLEX_FLOW_ROW',6));
  lower.style.flex_grow=2;
  const memory=grow(block('ram_group'),true);
  memory.children.push(grow(flex(plot('ram_history',0,0,1,1,path('system.memory','series')))),
    flex(label('ram_summary',0,0,full,'RAM —',path('system.memory','summary'))));
  lower.children.push(memory);
  const gpu=grow(block('gpu_group'),true),gpuMemory=grow(block('gpumem_group'),true);
  gpu.children.push(flex(label('gpu_heading',0,0,full,'GPU')));
  gpuMemory.children.push(flex(label('gpumem_heading',0,0,full,'GPU memory')));
  const devices=grow(flex(node('gpu_list','obj',0,0,1,1,{},[role('panel')])));devices.flags.SCROLLABLE=true;
  const deviceMemory=grow(flex(node('gpumem_list','obj',0,0,1,1,{},[role('panel')])));deviceMemory.flags.SCROLLABLE=true;
  if(!gpuCount) {
    devices.children.push(flex(label('no_gpu',0,0,full,'GPU counters unavailable')));
    deviceMemory.children.push(flex(label('no_gpumem',0,0,full,'GPU counters unavailable')));
  }
  for(let i=0;i<gpuCount;i++) {
    const item=grow(flex(node('gpu_group_'+i,'obj',0,0,1,1,{},[role('panel')]),'LV_FLEX_FLOW_COLUMN',0));
    item.style.min_height=46;
    item.children.push(flex(label('gpu_name_'+i,0,0,full,'GPU —',path('system.gpus',i,'name'))),
      grow(flex(plot('gpu_history_'+i,0,0,1,1,path('system.gpus',i,'series')))));
    devices.children.push(item);
    const mem=flex(node('gpumem_item_'+i,'obj',0,0,full,36,{},[role('panel')]),'LV_FLEX_FLOW_COLUMN',0);
    mem.style.min_height=36;
    mem.children.push(flex(label('gpumem_name_'+i,0,0,full,'GPU —',path('system.gpus',i,'name'))),
      flex(label('gpu_memory_'+i,0,0,full,'VRAM —',path('system.gpus',i,'memoryLabel'))));
    deviceMemory.children.push(mem);
  }
  gpu.children.push(devices);gpuMemory.children.push(deviceMemory);
  lower.children.push(gpu,gpuMemory);root.children.push(lower);
  return {format:'lvgl-screen-draft-1',id:'system',name:'Windows system monitor',size:{width:800,height:408},styles:{},root};
}
export function adaptSystemPage(project,capabilities) {
  // Invoked only for the bundled demo, never for a user's opened project.
  const sources=capabilities.binding.sources;
  project.screens.system=systemPage(sources.find(s=>s.name==='system.cores').schema.maxItems,
    sources.find(s=>s.name==='system.gpus').schema.maxItems);
  return project;
}
