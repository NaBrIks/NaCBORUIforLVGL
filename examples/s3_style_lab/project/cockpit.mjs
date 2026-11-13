// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {shellGeometry} from './shell.mjs';

const {width,height}=shellGeometry;
const metal={bg_color:'#edf2f4',bg_grad_color:'#89949b',bg_grad_dir:'LV_GRAD_DIR_VER',bg_opa:255,
 border_width:1,border_color:'#657079',radius:8};
const well={bg_color:'#182125',bg_opa:255,border_width:2,border_color:'#465359',radius:5};
const box=(id,x,y,width,height,style={},children=[])=>({id,type:'obj',flags:{SCROLLABLE:false},
 style:{x,y,width,height,pad_all:0,border_width:0,...style},children});
const label=(id,text,x,y,style={})=>({id,type:'label',props:{text},
 style:{x,y,text_color:'#222d32',text_font:'montserrat_20',...style}});
const button=(id,text,x,y,width,height,view,screen,style={})=>({id,type:'button',props:{text},
 style:{x,y,width,height,pad_all:2,border_width:1,border_color:'#39454b',radius:4,
 bg_opa:255,bg_color:'#3b474e',text_color:'#f6faf9',...style},
 styleRules:[{part:'MAIN',state:['CHECKED'],props:{bg_color:'#91adb2',text_color:'#152124'}}],
 events:[{event:'clicked',navigate:{view,screen}}]});
const doc=(id,name,width,height,root)=>({format:'lvgl-screen-draft-1',id,name,size:{width,height},theme:'none',root});
const screws=(prefix,width,height)=>[[9,9,20],[width-23,9,109],[9,height-23,70],[width-23,height-23,146]]
 .map(([x,y,angle],i)=>{
  const radians=angle*Math.PI/180;
  const dx=Math.round(5*Math.cos(radians)),dy=Math.round(5*Math.sin(radians));
  return box(prefix+'-screw-'+i,x,y,14,14,{...metal,radius:7,border_width:0},[
   {id:prefix+'-slot-'+i,type:'line',props:{points:[[7-dx,7-dy],[7+dx,7+dy]]},
    style:{x:0,y:0,width:14,height:14,line_width:2,line_color:'#394449',line_opa:255}}
  ]);
 });
const panel=(id,x,y,w,h,children)=>box(id,x,y,w,h,metal,[...screws(id,w,h),...children]);
function pressureDisplay(id,name,dashboard,lcd){
 const layout=[[0,0],[150,0],[0,88],[150,88]];
 const labels=['FL','FR','RL','RR'];
 const pressures=['front_left','front_right','rear_left','rear_right'];
 const root=box('pressure-readouts',0,0,300,176,{},pressures.map((prefix,i)=>{
  const reading=dashboard.children.find(n=>n.id===prefix).children.find(n=>n.id===prefix+'_pressure');
  const [x,y]=layout[i];
  return box('gauge-'+i,x,y,142,80,well,[
   label('channel-'+i,labels[i],9,6,{text_color:'#bac5c3'}),
   box('insert-'+i,7,30,128,41,{bg_color:lcd?'#a9b88b':'#101413',bg_opa:255,radius:3},[
    {...label('value-'+i,reading.props.text,6,3,{text_font:'montserrat_28',text_color:lcd?'#203122':'#ff754d'}),
     ...(reading.bindings?{bindings:structuredClone(reading.bindings)}:{})}
   ])
  ]);
 }));
 return doc(id,name,300,176,root);
}

export function withCockpit(project){
 const shell=project.screens.shell;
 if(!shell||project.screens['interface-select'])return project;
 const dashboard=project.screens.dashboard.root;
 const radar=structuredClone(project.screens.radar.root.children.find(n=>n.type==='lab:radar'));
 Object.assign(radar.style,{x:10,y:6});
 radar.props.title='RADAR / DEMO CONTACTS';
 const radio=(id,x,source,path,unknown)=>({...label(id,unknown,x,9,{text_color:'#a9f0b6'}),
  bindings:[{method:'text',value:{source,path},format:{unknown}}]});
 // The view marks its selected destination CHECKED. Move that button outside the
 // viewport, leaving the button for the other interface in the same touch area.
 const changeInterface=(id,text,target)=>{
  const control=button(id,text,736,436,64,44,'interface',target);
  control.styleRules[0].props={translate_x:width};
  return control;
 };
 const cockpit=box('cockpit',0,0,width,height,{...metal,radius:0,border_width:0},[
  ...Array.from({length:16},(_,i)=>box('grain-'+i,0,i*30,width,1,
   {bg_color:i%2?'#ffffff':'#43535d',bg_opa:45})),
  panel('pressure',12,12,336,286,[
   label('title','TYRE PRESSURE / DEMO',28,11),
   {...box('readouts',18,49,300,176),view:{initial:'cockpit-lcd',sizing:'design',
    pages:[{screen:'cockpit-lcd'},{screen:'cockpit-led'}]}},
   box('mode-recess',22,235,292,42,well),
   button('lcd','LCD',27,240,139,32,'readouts','cockpit-lcd'),
   button('led','LED',170,240,139,32,'readouts','cockpit-led')
  ]),
  panel('radio',12,312,336,110,[
   label('radio-title','RADIO  /  TIME & IP',29,10),
   box('radio-well',22,44,292,45,well,[
    radio('clock',9,'system.clock',['localTime'],'--:--:--'),
    radio('ip',120,'system.network',['ip'],'--.--.--.--')
   ])
  ]),
  box('radar-panel',352,8,436,426,metal,[radar,...screws('radar-panel',436,426)]),
  box('footer',0,436,width,44,{bg_color:'#36434b',bg_opa:255})
 ]);
 Object.assign(project.screens,{
  cockpit:doc('cockpit','Cockpit',width,height,cockpit),
  'cockpit-lcd':pressureDisplay('cockpit-lcd','LCD pressure',dashboard,true),
  'cockpit-led':pressureDisplay('cockpit-led','LED pressure',dashboard,false),
  'interface-select':doc('interface-select','Interface selector',width,height,
   box('interface-root',0,0,width,height,{},[
    {...box('interface',0,0,width,height),view:{initial:'shell',sizing:'design',
     pages:[{screen:'shell',retention:'cache'},{screen:'cockpit',retention:'release'}]}},
    changeInterface('to-cockpit','FLT','cockpit'),
    changeInterface('to-classic','STD','shell')
   ]))
 });
 const nav=shell.root.children.find(n=>n.id==='navigation');
 nav.children.forEach((n,i)=>{
  const x=Math.floor(i*736/nav.children.length),right=Math.floor((i+1)*736/nav.children.length);
  Object.assign(n.style,{x,width:right-x});
 });
 project.manifest.entry='interface-select';
 return project;
}
