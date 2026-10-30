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
export function systemPage(coreCount=32,gpuCount=2) {
  if(!Number.isInteger(coreCount)||coreCount<0||coreCount>64||!Number.isInteger(gpuCount)||gpuCount<0||gpuCount>4)
    throw Error('System demo topology limits: 0..64 logical processors, 0..4 GPUs');
  const root=node('root','obj',0,0,800,408,{},[role('canvas')]);
  root.children.push(plot('cpu_history',8,6,240,108,path('system.cpu','series')),
    plot('ram_history',256,6,240,108,path('system.memory','series')),
    label('ram_summary',256,119,240,'RAM —',path('system.memory','summary')),
    {...label('core_count',8,119,240,'Logical processors: —'),bindings:[{method:'text',value:path('system.cpu','count'),format:{prefix:'Logical processors: '}}]},
    label('interval',8,140,488,'1 s samples · 32 samples · scale 0–100%'));
  const devices=node('gpu_list','obj',512,6,280,150,{},[role('canvas')]);
  devices.flags.SCROLLABLE=gpuCount>2;
  if(!gpuCount)devices.children.push(label('no_gpu',0,0,280,'GPU counters unavailable'));
  for(let i=0;i<gpuCount;i++) {
    devices.children.push(label('gpu_name_'+i,0,i*75,280,'GPU —',path('system.gpus',i,'name')),
      plot('gpu_history_'+i,0,i*75+18,280,38,path('system.gpus',i,'series')),
      label('gpu_memory_'+i,0,i*75+57,280,'VRAM —',path('system.gpus',i,'memoryLabel')));
  }
  root.children.push(devices,label('logical_heading',8,165,784,'Logical processors · CPU time / %'));
  const cores=node('core_grid','obj',8,187,784,213,{},[role('canvas')]);
  cores.flags.SCROLLABLE=coreCount>32;
  for(let i=0;i<coreCount;i++)cores.children.push(plot('core_'+i,(i%8)*98,Math.floor(i/8)*53,94,49,path('system.cores',i)));
  root.children.push(cores);
  return {format:'lvgl-screen-draft-1',id:'system',name:'Windows system monitor',size:{width:800,height:408},styles:{},root};
}
export function adaptSystemPage(project,capabilities) {
  // Invoked only for the bundled demo, never for a user's opened project.
  const sources=capabilities.binding.sources;
  project.screens.system=systemPage(sources.find(s=>s.name==='system.cores').schema.maxItems,
    sources.find(s=>s.name==='system.gpus').schema.maxItems);
  return project;
}
