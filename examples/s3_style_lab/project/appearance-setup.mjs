// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Example-owned Setup composition; uses ordinary styles, bindings and events.
const ref=(role,state=[])=>({ref:'global-static:ui.'+role,part:'MAIN',state});
export function withAppearanceSetup(input){
 const project=structuredClone(input),shell=project.screens.shell;
 if(project.screens.setup)return project;
 if(!shell)throw Error('The example requires its existing shell');
 const walk=(node,root=false)=>{
  const style=node.style??={},links=node.styles??=[];
  const panel=links.some(s=>s.ref==='global:panel')||style.bg_color==='#1b303d';
  const role=root||style.bg_color==='#101e28'?'canvas':panel?'panel':node.type==='label'?'text':null;
  if(role)links.push(ref(role));
  if(node.type==='button')links.push(ref('button'),ref('button_pressed',['PRESSED']),ref('button_focus',['CHECKED']));
  if(style.text_color==='#9eb4c1')links.push(ref('muted'));
  for(const key of ['bg_color','text_color','border_color'])
   if(['#101e28','#1b303d','#e8f0f2','#9eb4c1','#385563','#4de0ad'].includes(style[key]))delete style[key];
  if(node.type==='button')for(const rule of node.styleRules??[])
   for(const key of ['bg_color','text_color','border_color'])delete rule.props?.[key];
  node.styles=links;for(const child of node.children??[])walk(child);
 };
 for(const document of Object.values(project.screens))walk(document.root,true);
 for(const style of Object.values(project.styles))for(const key of ['bg_color','text_color','border_color'])
  if(['#101e28','#1b303d','#e8f0f2','#9eb4c1','#385563','#4de0ad'].includes(style.props?.[key]))delete style.props[key];
 const choices=[['light','Light'],['cream','Cream'],['emerald','Emerald'],['dark','Dark']];
 const label=(id,text,x,y,width=740)=>({id,type:'label',props:{text},style:{x,y,width,height:32},styles:[ref('text')],children:[]});
 project.screens.setup={format:'lvgl-screen-draft-1',id:'setup',name:'Setup',size:{width:800,height:408},theme:'none',styles:{},root:{id:'root',type:'obj',style:{width:800,height:408,pad_all:0,border_width:0,radius:0},common:{remove_flags:16},styles:[ref('canvas')],children:[
  label('title','Setup / Appearance',24,18),
  label('current','--',24,62),
  ...choices.map(([id,text],i)=>({id:'scheme-'+id,type:'button',props:{text},styles:[ref('button'),ref('button_pressed',['PRESSED']),ref('button_focus',['CHECKED'])],style:{x:24+i*190,y:112,width:174,height:52},events:[{event:'clicked',action:'ui.select_scheme',args:{literal:id}}],bindings:[{scope:'common',method:'state',value:[{literal:4},{op:'eq',args:[{source:'ui.scheme',path:['id']},{literal:id}]}]}],children:[]})),
  {id:'sample',type:'obj',style:{x:24,y:190,width:752,height:180,pad_all:16,border_width:1,radius:8},styles:[ref('panel')],children:[label('sample-title','Preview',0,0,700),label('sample-value','--',0,48,700)]}
 ]}};
 const setup=project.screens.setup.root;setup.children[1].bindings=[{method:'text',value:{source:'ui.scheme',path:['id']},format:{prefix:'Scheme: '}}];
 setup.children.at(-1).children[1].bindings=[{method:'text',value:{source:'demo.speed',path:['kmh']},format:{suffix:' km/h'}}];
 const content=shell.root.children.find(n=>n.id==='content'),nav=shell.root.children.find(n=>n.id==='navigation');
 if(!content||!nav)throw Error('Missing existing content/navigation');
 content.view.pages.push({screen:'setup',retention:'retain'});
 nav.children.push({id:'nav-setup',type:'button',props:{text:'Setup'},style:{},styles:[ref('button'),ref('button_pressed',['PRESSED']),ref('button_focus',['CHECKED'])],events:[{event:'clicked',navigate:{view:'content',screen:'setup'}}],children:[]});
 nav.children.forEach((n,i)=>Object.assign(n.style,{x:i*200,y:0,width:200,height:44,radius:0,pad_all:3,text_align:2}));
 return project;
}
