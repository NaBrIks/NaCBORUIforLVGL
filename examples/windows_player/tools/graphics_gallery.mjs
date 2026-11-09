// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {readFile,writeFile} from 'node:fs/promises';
const here=new URL('../',import.meta.url);
// Reuse only established component styling. No system/CPU/GPU pages are inherited.
const reference=JSON.parse(await readFile(new URL('demo.json',here),'utf8'));
const full={pct:100},fr={fr:1};
const role=(name,part='MAIN',state=[])=>({ref:'global-static:ui.'+name,part,state});
const base=(id,type,style={},props={},children=[])=>({id,type,style:{pad_all:0,border_width:0,radius:0,text_font:'ui_14',...style},props,styles:[role('panel'),role('text')],flags:{SCROLLABLE:false},children});
const label=(id,text,height=22,style={})=>base(id,'label',{width:full,height,bg_opa:0,...style},{text,long_mode:1});
const buttonStyles=reference.screens.shell.root.children.find(n=>n.id==='go_overview').styles;
const button=(id,text,style={},events=[])=>({...base(id,'button',{width:120,height:32,...style},{text}),styles:structuredClone(buttonStyles),events});
const bindText=(node,source,path=[],format)=>{node.bindings=[{method:'text',value:{source,...(path.length?{path}:{})},...(format?{format}:{})}];return node;};
const page=(id,name,children,style={})=>({format:'lvgl-screen-draft-1',id,name,size:{width:1280,height:708},styles:{},root:{...base('root','obj',{layout:'LV_LAYOUT_FLEX',flex_flow:'LV_FLEX_FLOW_COLUMN',pad_all:8,pad_row:6,...style},{},children),styles:[role('canvas'),role('text')],flags:{SCROLLABLE:true}}});
const tiles={raster:[],vector:[]};
function tile(pageId,id,title,detail,visual){
 const checker=base('checker_'+id,'image',{align:'LV_ALIGN_CENTER',width:176,height:108,bg_opa:0},{src:'gallery.checker'});
 tiles[pageId].push(base('tile_'+id,'obj',{width:202,min_width:202,flex_grow:0,height:172,pad_all:7,border_width:1,radius:2,layout:'LV_LAYOUT_FLEX',flex_flow:'LV_FLEX_FLOW_COLUMN',pad_row:3},{},[
  label('tile_'+id+'_title',title,21),base('tile_'+id+'_view','obj',{width:full,height:108,bg_opa:0},{},[checker,visual]),label('tile_'+id+'_detail',detail,20)
 ]));
}
for(const [id,title,detail] of [
 ['rgb565','RAW · RGB565','2 байта/пкс · непрозрачное'],['rgb888','RAW · RGB888','3 байта/пкс · непрозрачное'],
 ['xrgb8888','RAW · XRGB8888','4 байта/пкс · непрозрачное'],['argb8888','RAW · ARGB8888','4 байта/пкс · альфа 0..255'],
 ['a8','RAW · A8','Цвет-маска · альфа 0..255'],['i4','RAW · I4','16 цветов · непрозрачное'],
 ['bin','LVGL BIN · RGB565','Файл .bin · непрозрачное'],['png','PNG · RGBA','Без потерь · альфа 0..255'],
 ['jpeg','JPEG · RGB','Baseline · непрозрачное'],['bmp','BMP · RGB','Файл BMP · непрозрачное']]){
 tile('raster',id,title,detail,base('image_'+id,'image',{align:'LV_ALIGN_CENTER',width:96,height:64,bg_opa:0,image_recolor:'#249f83',image_recolor_opa:id==='a8'?255:0},{src:'gallery.'+id}));
}
const sample=(mode,id)=>{
 const n=base('sample_'+id,'demo:graphics_sample',{align:'LV_ALIGN_CENTER',width:176,height:108,bg_opa:0},{mode});
 n.styles.push(role('indicator','INDICATOR'));
 if(mode<4)n.bindings=[{method:'progress',value:{source:'demo.speed',path:['kmh']}}];
 return n;
};
tile('raster','gif','Анимированный GIF','8 × 120 мс · непрозрачное',sample(5,'gif'));
tile('raster','canvas','Canvas · фигуры','Пиксельный буфер · альфа',sample(4,'canvas'));
for(const [id,title,detail,w,h] of [
 ['tabler_heart','Tabler · сердце','SVG · MIT · дуги',96,96],['tabler_cloud','Tabler · облако','SVG · MIT · кривая Безье',96,96],
 ['landscape_svg','Цветной SVG · 21 путь','Собственный MIT · альфа',160,96]]){
 tile('vector',id,title,detail,base('image_'+id,'image',{align:'LV_ALIGN_CENTER',width:w,height:h,bg_opa:0},{src:'gallery.'+id}));
}
for(const [mode,id,title,detail] of [[0,'quadratic','Квадратичная Безье','1 контрольная точка · vector'],[1,'cubic','Кубическая Безье','2 контрольные точки · vector'],[2,'polyline','Та же кривая · ломаная','40 рассчитанных отрезков'],[3,'raster','Та же кривая · кэш','Canvas · ARGB8888 с альфа']])tile('vector',id,title,detail,sample(mode,id));
const screens={};
for(const id of ['raster','vector']){
 const title=id==='raster'?'Растровые форматы и прозрачность':'SVG и кривые';
 const note=id==='raster'?'Одинаковая шахматная подложка: непрозрачный образец скрывает её. A8 хранит только альфа; цвет задаёт стиль.':'Настоящий LVGL SVG/vector renderer. Одна cubic-кривая: vector, 40 отрезков и растровый кэш.';
 screens[id]=page(id,title,[label('title',title,26,{text_font:'ui_20'}),label('subtitle',note),
  ...(id==='vector'?[bindText(label('value','Маркер: —',22),'demo.speed',['kmh'],{prefix:'Маркер: ',suffix:' / 240',precision:1})]:[]),
  base('samples','obj',{width:full,height:'content',layout:'LV_LAYOUT_FLEX',flex_flow:id==='vector'?'LV_FLEX_FLOW_COLUMN':'LV_FLEX_FLOW_ROW_WRAP',pad_row:6,pad_column:6,bg_opa:0},{},id==='vector'?[
   base('svg_samples','obj',{width:full,height:'content',layout:'LV_LAYOUT_FLEX',flex_flow:'LV_FLEX_FLOW_ROW_WRAP',pad_row:6,pad_column:6,bg_opa:0},{},tiles.vector.slice(0,3)),
   base('curve_samples','obj',{width:full,height:'content',layout:'LV_LAYOUT_FLEX',flex_flow:'LV_FLEX_FLOW_ROW_WRAP',pad_row:6,pad_column:6,bg_opa:0},{},tiles.vector.slice(3))
  ]:tiles[id])]);
}
// An intentionally empty ordinary page; the agent can replace/extend it via the same Project API.
screens.canvas=page('canvas','Пустой холст MCP',[],{bg_opa:255});
const eventWrite=(source,value)=>[{event:'clicked',write:{source},value:{literal:value}}];
const eventAction=(action,args)=>[{event:'clicked',action,args:{literal:args}}];
// All remote geometry is ordinary authoring data, as if supplied by an MCP client.
// The reusable C++ component knows only a normalized closed polygon.
const polygon=(id,text,points,style,events,caption={})=>{
 const n=base(id,'ui:polygon_button',{width:100,height:40,...style},{points},[
  label(id+'_caption',text,24,{align:'LV_ALIGN_CENTER',width:100,text_align:'LV_TEXT_ALIGN_CENTER',text_font:'ui_20',...caption})]);
 n.styles=structuredClone(buttonStyles);n.flags={SCROLLABLE:false,ADV_HITTEST:true};n.events=events;n.children[0].flags.CLICKABLE=false;n.children[0].styles=[];return n;
};
const sector=(from,to)=>{
 const center=160,outer=154,inner=78,gap=6,steps=12;
 const arc=(r,a,b)=>Array.from({length:steps+1},(_,i)=>{const t=(a+(b-a)*i/steps)*Math.PI/180;return [center+r*Math.cos(t),center+r*Math.sin(t)];});
 const cut=r=>Math.asin(gap/(2*r))*180/Math.PI;
 const path=[...arc(outer,from+cut(outer),to-cut(outer)),...arc(inner,to-cut(inner),from+cut(inner))];
 const corners=new Set([0,steps,steps+1,path.length-1]),rounded=[];
 for(let i=0;i<path.length;i++){
  const p=path[i];if(!corners.has(i)){rounded.push(p);continue;}
  const previous=path[(i+path.length-1)%path.length],next=path[(i+1)%path.length];
  const u=[previous[0]-p[0],previous[1]-p[1]],v=[next[0]-p[0],next[1]-p[1]],lu=Math.hypot(...u),lv=Math.hypot(...v);
  const un=u.map(n=>n/lu),vn=v.map(n=>n/lv),theta=Math.acos(Math.max(-1,Math.min(1,un[0]*vn[0]+un[1]*vn[1])));
  const tangent=Math.min(6/Math.tan(theta/2),lu*.7,lv*.7),r=tangent*Math.tan(theta/2),bisector=[un[0]+vn[0],un[1]+vn[1]],length=Math.hypot(...bisector);
  const c=[p[0]+bisector[0]/length*r/Math.sin(theta/2),p[1]+bisector[1]/length*r/Math.sin(theta/2)],first=[p[0]+un[0]*tangent,p[1]+un[1]*tangent],last=[p[0]+vn[0]*tangent,p[1]+vn[1]*tangent];
  const start=Math.atan2(first[1]-c[1],first[0]-c[0]);let delta=Math.atan2(last[1]-c[1],last[0]-c[0])-start;while(delta>Math.PI)delta-=2*Math.PI;while(delta<-Math.PI)delta+=2*Math.PI;
  for(let j=0;j<=5;j++)rounded.push([c[0]+r*Math.cos(start+delta*j/5),c[1]+r*Math.sin(start+delta*j/5)]);
 }
 return rounded.map(p=>p.map(n=>Math.round(n/320*1000)));
};
const dpad=(id,direction,from,to,events,x,y)=>{
 const n=polygon(id,'',sector(from,to),{align:'LV_ALIGN_CENTER',x:0,y:-60,width:320,height:320,border_width:1},events);
 const triangles={up:[[500,0],[1000,1000],[0,1000]],right:[[0,0],[1000,500],[0,1000]],down:[[0,0],[1000,0],[500,1000]],left:[[0,500],[1000,0],[1000,1000]]};
 const horizontal=direction==='left'||direction==='right';
 const arrow=base(id+'_arrow','ui:polygon_button',{align:'LV_ALIGN_CENTER',x,y,width:horizontal?16:24,height:horizontal?24:16},{points:triangles[direction]});
 arrow.styles=[{ref:'screen:remote.arrow',part:'MAIN',state:[]}];
 arrow.flags={SCROLLABLE:false,CLICKABLE:false,CLICK_FOCUSABLE:false,SCROLL_ON_FOCUS:false};
 // LVGL's default group skips disabled objects. This decorative polygon has no disabled visual override.
 arrow.common={add_state:512};n.children=[arrow];return n;
};
const capsule=(top)=>{
 const arc=(cx,cy,r,a,b)=>Array.from({length:17},(_,i)=>{const t=(a+(b-a)*i/16)*Math.PI/180;return [Math.round(cx+r*Math.cos(t)),Math.round(cy+r*Math.sin(t))];});
 return top?[...arc(500,480,480,180,360),[980,1000],[20,1000]]:[[20,0],[980,0],...arc(500,520,480,0,180)];
};
const rocker=(id,text,x,y,top,events)=>polygon(id,text,capsule(top),{align:'LV_ALIGN_CENTER',x,y,width:76,height:80,border_width:1},events,{width:76,text_font:'ui_20'});
const keyShape=[[60,0],[940,0],[1000,140],[1000,860],[940,1000],[60,1000],[0,860],[0,140]];
const start=button('controller_start','OK',{align:'LV_ALIGN_CENTER',x:0,y:-60,width:132,height:132,radius:32767,text_font:'ui_28'},eventWrite('demo.running',true));
start.flags.ADV_HITTEST=true;start.bindings=[{scope:'common',method:'state',value:[{literal:4},{source:'demo.running'}]}];
const stage=base('controller_stage','obj',{align:'LV_ALIGN_CENTER',width:680,height:520,bg_opa:0},{},[
 dpad('controller_step','up',225,315,eventAction('demo.step',1),0,-115),
 dpad('controller_step10','right',315,405,eventAction('demo.step',10),115,0),
 dpad('controller_reset','down',45,135,eventAction('demo.reset',null),0,115),
 dpad('controller_stop','left',135,225,eventWrite('demo.running',false),-115,0),start,
 rocker('channel_up','CH +',-230,-102,true,eventAction('demo.step',2)),rocker('channel_down','CH -',-230,-18,false,eventAction('demo.step',2)),
 rocker('volume_up','VOL +',230,-102,true,eventAction('demo.step',5)),rocker('volume_down','VOL -',230,-18,false,eventAction('demo.step',5)),
 polygon('key_home','HOME',keyShape,{align:'LV_ALIGN_CENTER',x:-130,y:150,width:110,height:42},eventAction('demo.reset',null)),
 polygon('key_menu','MENU',keyShape,{align:'LV_ALIGN_CENTER',x:0,y:150,width:110,height:42},eventAction('demo.step',3)),
 polygon('key_back','BACK',keyShape,{align:'LV_ALIGN_CENTER',x:130,y:150,width:110,height:42},eventWrite('demo.running',false)),
 bindText(label('controller_count','Нажатия: 0',22,{align:'LV_ALIGN_CENTER',y:208,width:200,text_align:'LV_TEXT_ALIGN_CENTER'}),'demo.clicks',[],{prefix:'Нажатия: '}),
 bindText(label('speed','— km/h',22,{align:'LV_ALIGN_CENTER',y:240,width:200,text_align:'LV_TEXT_ALIGN_CENTER',text_font:'ui_20'}),'demo.speed',['kmh'],{precision:1,suffix:' km/h'})
]);
screens.controller=page('controller','Фигурный пульт',[
 label('title','Пульт · фигуры из CBOR',26,{text_font:'ui_20'}),label('subtitle','Все контуры, подписи и действия заданы Project. Нажатия, состояния и биндинги — штатные LVGL.'),
 base('controller_body','obj',{width:full,height:full,flex_grow:1,min_height:520,bg_opa:0},{},[stage])]);
screens.controller.styles['remote.arrow']={props:{bg_color:'#1b1b1b',bg_opa:255,border_width:0,outline_width:0}};
// Theme preview uses the same writable registry and event pipeline.
const appearance=base('appearance','obj',{width:300,min_width:300,height:'content',layout:'LV_LAYOUT_FLEX',flex_flow:'LV_FLEX_FLOW_COLUMN',pad_row:6,bg_opa:0},{},[label('appearance_title','Оформление и пример',26,{text_font:'ui_20'})]);
for(const [id,title] of [['light','Светлая'],['cream','Кремовая'],['emerald','Изумрудная'],['dark','Тёмная']]){
 const b=button('scheme_'+id,title,{width:full},eventAction('ui.select_scheme',id));
 b.bindings=[{scope:'common',method:'state',value:[{literal:4},{op:'eq',args:[{source:'ui.scheme',path:['id']},{literal:id}]}]}];appearance.children.push(b);
}
appearance.children.push(bindText(label('current_scheme','Текущая: —'),'ui.scheme',['title'],{prefix:'Текущая: '}));
const toggle=base('preview_running','switch',{width:56,height:28},{checked:true});
toggle.styles=[role('track'),role('indicator','INDICATOR',[]),role('indicator','INDICATOR',['CHECKED']),role('knob','KNOB')];
toggle.bindings=[{scope:'common',method:'state',value:[{literal:4},{source:'demo.running'}]}];toggle.events=[{event:'value_changed',write:{source:'demo.running'},value:{event:'value'}}];
const slider=base('preview_slider','slider',{width:full,height:16},{min:0,max:100,value:65});slider.styles=[role('track'),role('indicator','INDICATOR'),role('knob','KNOB')];slider.bindings=[{method:'value',value:{source:'demo.level'}}];slider.events=[{event:'value_changed',write:{source:'demo.level'},value:{event:'value'}}];
appearance.children.push(label('preview_running_title','Генератор'),toggle,label('preview_level_title','Уровень'),slider,
 button('preview_action','Добавить 1',{width:full},eventAction('demo.step',1)),bindText(label('preview_count','Нажатия: 0'),'demo.clicks',[],{prefix:'Нажатия: '}));
screens.settings=page('settings','Настройки',[appearance]);
const tabs=[['raster','Растр'],['vector','Вектор'],['canvas','Холст MCP'],['controller','Пульт'],['settings','Настройки']];
const cell=(column,row,span=1)=>({grid_cell_column_pos:column,grid_cell_column_span:span,grid_cell_row_pos:row,grid_cell_row_span:1,grid_cell_x_align:'LV_GRID_ALIGN_STRETCH',grid_cell_y_align:'LV_GRID_ALIGN_STRETCH'});
const status=base('status','obj',{width:full,height:full,...cell(0,0,5),pad_all:4,layout:'LV_LAYOUT_FLEX',flex_flow:'LV_FLEX_FLOW_COLUMN',pad_row:0},{},[
 bindText(label('site','NaCBORUIforLVGL · графическая демонстрация',20),'host.connection',['site'],{prefix:'Графика · '}),
 bindText(label('mcp','MCP: —',20),'host.connection',['mcp'],{prefix:'MCP: '})]);status.styles=[role('status'),role('text')];
const content=base('content','obj',{width:full,height:full,...cell(0,1,5)},{},[]);content.styles=[role('canvas')];content.view={pages:tabs.map(([screen])=>({screen,retention:screen==='canvas'?'retain':'cache'})),initial:'raster',sizing:'fill'};
const shell=base('root','obj',{bg_opa:255,width:full,height:full,layout:'LV_LAYOUT_GRID',grid_column_dsc_array:tabs.map(()=>fr),grid_row_dsc_array:[48,fr,44],pad_column:0,pad_row:0},{},[
 status,content,...tabs.map(([id,title],i)=>button('go_'+id,title,{width:full,height:full,text_font:'ui_20',...cell(i,2)},[{event:'clicked',navigate:{view:'content',screen:id}}]))
]);shell.styles=[role('canvas'),role('text')];
screens.shell={format:'lvgl-screen-draft-1',id:'shell',name:'Графика LVGL',size:{width:1280,height:800},styles:{},root:shell};
const project={format:'lvgl-project-1',manifest:{id:'graphics-gallery',name:'Графика LVGL',entry:'shell'},screens,styles:{}};
await writeFile(new URL('graphics-gallery.json',here),JSON.stringify(project,null,2)+'\n');
console.log('Graphics-only gallery:',tiles.raster.length,'raster samples,',tiles.vector.length,'vector samples; five pages');
