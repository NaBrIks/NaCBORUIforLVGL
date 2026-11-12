// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {readFileSync, writeFileSync} from 'node:fs';
import {encodeScreen, offlineCapabilities} from '../../packages/screen-codec/index.js';
import {createProject, encodeProject} from '../../packages/project-codec/index.js';

const profile = Number(process.argv[2]);
const direct = profile === 1 || profile === 3;
const mixed = profile >= 3;
const namedStyles = process.argv[4] === '--named-styles';
if(namedStyles && profile !== 2 && profile !== 4)
  throw new Error('Named style comparison uses only minimal CBOR profiles');
const node = (id, type, style, props = {}, children = []) => ({id, type, style, props, children});
const panelStyle = {bg_color:'#263743', bg_opa:255, border_width:0, pad_all:0, radius:4};
const textStyle = {text_color:'#ecf3f4'};
const colors = ['#4ca879','#438fa9','#c18b52','#a87ca9','#6d9f66','#637cb1','#b26960','#7f9fa3'];
const fields = ['Input A','Input B','Input C','Input D','Input E'];
const groups = ['Sensors','Power','Drive','Environment','Link','Service','Controls','Output'];
const kinds = ['bar','slider','checkbox','switch','arc','button','line','label'];
const bounded = {min:0,max:100};

function repeated(index) {
  const prefix = 'g'+index;
  return [
    node(prefix+'_title','label',{...textStyle,x:8,y:2},{text:'Channel bank'}),
    ...fields.flatMap((field,row) => [
      node(prefix+'_text_'+row,'label',{...textStyle,x:8,y:19+row*16},{text:field}),
      node(prefix+'_value_'+row,'bar',{x:106,y:22+row*16,width:145,height:9},{...bounded,value:24+row*13}),
    ]),
  ];
}

function varied(index) {
  const prefix = 'g'+index;
  return [
    node(prefix+'_title','label',{...textStyle,x:8,y:2},{text:groups[index]}),
    ...fields.flatMap((field,row) => {
      const type = kinds[(index*3+row)%kinds.length];
      const value = 16+(index*19+row*11)%78;
      const suffix = prefix+'_value_'+row;
      const y = 19+row*16;
      const options = {
        bar:[{x:106,y:y+3,width:132,height:9},{...bounded,value}],
        slider:[{x:110,y:y+5,width:126,height:6},{min:5,max:110,value}],
        checkbox:[{...textStyle,x:106,y},{text:row%2?'Ready':'Armed',checked:index%2===0}],
        switch:[{x:106,y:y+1,width:31,height:14},{checked:row%2===0}],
        arc:[{x:107,y,width:16,height:16},{...bounded,value,bg_angles:[0,300],rotation:30+index*9}],
        button:[{x:106,y:y+1,width:46,height:14,bg_color:colors[index],radius:row+2},{}],
        line:[{x:106,y,line_color:colors[index],line_width:2},{points:[[0,12],[12,4+index],[29,2+row],[44,9]]}],
        label:[{x:106,y,text_color:colors[index]},{text:String(value)+' %'}],
      };
      return [node(prefix+'_text_'+row,'label',{...textStyle,x:8,y},{text:field+' '+String(index+1)}),
        node(suffix,type,...options[type])];
    }),
  ];
}

const media = [
  node('portrait','image',{x:592,y:39},{src:'bench.portrait'}),
  node('robot','bench:gif',{x:592,y:251}),
];
const dashboard = {format:'lvgl-screen-draft-1',id:'dashboard',name:'Benchmark',size:{width:800,height:480},theme:'device',
  root:{...node('root','obj',{bg_color:'#17232b',bg_opa:255,pad_all:0,border_width:0}, {}, [
    node('heading','label',{...textStyle,x:8,y:6},{text:mixed?'Mixed widgets / 100 nodes':'Repeated widgets / 100 nodes'}),
    ...Array.from({length:8},(_,index) => node('g'+index,'obj',{
      ...panelStyle,x:8+(index%2)*284,y:33+Math.floor(index/2)*102,width:276,height:100,
      ...(mixed?{border_color:colors[index],border_width:1,radius:3+index%4}:{}),
    },{},mixed?varied(index):repeated(index))),
    ...media,
  ]),flags:{SCROLLABLE:false}}};
for(const panel of dashboard.root.children.slice(1,9)) panel.flags={SCROLLABLE:false};
const count = ({children = []}) => 1 + children.reduce((sum, child) => sum+count(child),0);
if(count(dashboard.root)!==100) throw new Error('Benchmark scene must have 100 declared nodes');

// The minimal fixtures have only one MAIN/DEFAULT style block per node.
if(namedStyles) {
  const groups = new Map();
  const collect = item => {
    const key = JSON.stringify(item.style);
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
    for(const child of item.children) collect(child);
  };
  collect(dashboard.root);
  dashboard.styles = {};
  for(const items of groups.values()) {
    if(items.length < 2) continue;
    const name = 's' + Object.keys(dashboard.styles).length;
    dashboard.styles[name] = {props:items[0].style};
    for(const item of items) {
      item.styles = [{ref:'screen:' + name}];
      delete item.style;
    }
  }
}

const gif = {id:514,name:'bench:gif',abi:'lvgl-gif-1',contract:{title:'Animated GIF',description:'Standard LVGL GIF widget displaying the shared benchmark animation.',methods:[]}};
const offline = offlineCapabilities();
const capabilities = {...offline, extensions:[gif],availableWidgets:[...offline.availableWidgets,gif.id],
  resources:[{name:'bench.portrait',type:'const void *'}]};
if(profile >= 6) {
  capabilities.binding = {...offline.binding,sources:[{name:'bench.value',writable:false,schema:{type:'integer'}}],
    actions:[{name:'bench.hit',schema:{type:'null'}}]};
  if(profile >= 13) capabilities.binding.actions.push({name:'bench.scheme',schema:{type:'text'}});
  dashboard.root.children[1].children[2].bindings=[{method:'value',value:{source:'bench.value'}}];
  dashboard.root.children[1].children[2].events=[{event:'clicked',action:'bench.hit',args:{literal:null}}];
}

const heading = '// Generated by memory_bench/generate.mjs\n#pragma once\n';
const bytes = (name, data) => 'alignas(4) inline constexpr unsigned char '+name+'[] = {\n'+
  Array.from({length:Math.ceil(data.length/24)},(_,i) => '  '+Array.from(data.slice(i*24,i*24+24)).join(',')+',').join('\n')+'\n};\n';
const asset = name => readFileSync(new URL('assets/'+name,import.meta.url));
let output = heading + bytes('portrait_bytes',asset('portrait.rgb565')) + bytes('robot_bytes',asset('robot.gif'));

function emit(tree,parent='nullptr',name=tree.id) {
  const obj = 'node_'+name.replaceAll('-','_');
  const create = tree.type==='bench:gif'?'make_gif':('lv_'+tree.type+'_create');
  const lines = ['auto *'+obj+' = '+create+'('+parent+');'];
  const add = (method,...args) => lines.push(method+'('+[obj,...args].join(', ')+');');
  if(tree.type==='obj') add('lv_obj_set_scrollbar_mode','LV_SCROLLBAR_MODE_OFF');
  if(tree.flags?.SCROLLABLE===false) add('lv_obj_remove_flag','LV_OBJ_FLAG_SCROLLABLE');
  for(const [key,value] of Object.entries(tree.style)) {
    const argument = typeof value==='string'&&value.startsWith('#')?'lv_color_hex(0x'+value.slice(1)+')':value;
    add('lv_obj_set_style_'+key,argument,'LV_PART_MAIN');
  }
  const props = tree.props;
  if('min' in props) add('lv_'+tree.type+'_set_range',props.min,props.max);
  if('text' in props) add('lv_'+tree.type+'_set_text',JSON.stringify(props.text));
  if(props.checked) add('lv_obj_add_state','LV_STATE_CHECKED');
  if('rotation' in props) add('lv_arc_set_rotation',props.rotation);
  if('bg_angles' in props) add('lv_arc_set_bg_angles',...props.bg_angles);
  if('value' in props) add('lv_'+tree.type+'_set_value',props.value,...(tree.type==='arc'?[]:['LV_ANIM_OFF']));
  if('src' in props) add('lv_image_set_src','&portrait');
  if('points' in props) {
    lines.push('static constexpr lv_point_precise_t '+obj+'_points[]{'+props.points.map(xy=>'{'+xy.join(', ')+'}').join(', ')+'};');
    add('lv_line_set_points',obj+'_points',props.points.length);
  }
  return [...lines,...tree.children.flatMap(child => emit(child,obj))];
}

if(direct) {
  let code;
  if(mixed) code=emit(dashboard.root);
  else {
    const [heading, panel] = dashboard.root.children;
    code=emit({...dashboard.root,children:[heading]});
    const [caption, label, bar] = panel.children;
    code.push('for(int i = 0; i < 8; ++i) {',
      ...emit({...panel,children:[],style:{...panel.style,x:'8+(i%2)*284',y:'33+(i/2)*102'}},'node_root','panel'),
      ...emit(caption,'node_panel','caption'),
      'constexpr const char *fields[]{'+fields.map(JSON.stringify).join(', ')+'};',
      'for(int row = 0; row < 5; ++row) {',
      ...emit({...label,style:{...label.style,y:'19+row*16'},props:{}},'node_panel','label'),
      'lv_label_set_text(node_label, fields[row]);',
      ...emit({...bar,style:{...bar.style,y:'22+row*16'},props:{...bounded,value:'24+row*13'}},'node_panel','bar'),
      '}', '}',...media.flatMap(child=>emit(child,'node_root')));
  }
  output+='static lv_obj_t *build_direct()\n{\n\t'+code.join('\n\t')+'\n\tlv_screen_load(node_root);\n\treturn node_root;\n}\n';
} else {
  if(profile >= 7) {
    for(const panel of dashboard.root.children.slice(1,9)) {
      delete panel.style.bg_color;
      panel.styles=[{ref:'global-static:ui.panel'}];
    }
  }
  const makePage = (id, label) => ({...dashboard,id,name:label,root:structuredClone(dashboard.root)});
  if(profile >= 5) {
    const alternate=makePage('alternate','Alternate');
    alternate.root.children[0].props.text='Repeated widgets / 100 nodes';
    for(const [index,panel] of alternate.root.children.slice(1,9).entries()) panel.children=repeated(index);
    const released=makePage('released','Release');
    released.root.children[0].props.text='Release / 100 nodes';
    const slot={...node('content','obj',{x:0,y:0,width:800,height:447,border_width:0,pad_all:0}),flags:{SCROLLABLE:false},
      view:{pages:[{screen:'dashboard',retention:'retain'},{screen:'alternate',retention:'cache'},{screen:'released',retention:'release'}],initial:'dashboard',sizing:'design'}};
    const nav = (screen, title, x) => ({...node('go_'+screen,'button',{x,y:450,width:170,height:27},{text:profile>=13?title:screen}),
      ...(profile >= 6 ? {events:[{event:'clicked',navigate:{view:'content',screen}}]} : {})});
    const controls = [nav('dashboard','Mixed',8),nav('alternate','Repeated',185),nav('released','Release',362)];
    if(profile >= 13) {
      for(const [id,title,x] of [['cream','Cream',540],['dark','Dark',650]]) {
        controls.push({...node('theme_'+id,'button',{x,y:450,width:103,height:27},{text:title}),
          events:[{event:'clicked',action:'bench.scheme',args:{literal:id}}]});
      }
      for(const page of [dashboard,alternate,released]) {
        delete page.root.style.bg_color;
        page.root.styles=[{ref:'global-static:ui.canvas'}];
        const styleText = item => {
          if(item.style?.text_color === textStyle.text_color) {
            delete item.style.text_color;
            item.styles=[{ref:'global-static:ui.text'}];
          }
          for(const child of item.children) styleText(child);
        };
        styleText(page.root);
      }
      for(const button of controls) button.styles=[{ref:'global-static:ui.button'}];
    }
    const shell={...dashboard,id:'shell',name:'Nested benchmark',root:{...dashboard.root,children:[slot,...controls]}};
    if(profile >= 9) {
      const project=createProject([shell,dashboard,alternate,released],{id:'memory-bench',name:'Memory benchmark',entry:'shell'});
      project.manifest.entry='shell';
      output+=bytes('project_cbor',encodeProject(project,capabilities));
    } else {
      output+=bytes('shell_cbor',encodeScreen(shell,'bench-shell',capabilities));
      output+=bytes('alternate_cbor',encodeScreen(alternate,'bench-alternate',capabilities));
      output+=bytes('released_cbor',encodeScreen(released,'bench-released',capabilities));
    }
  }
  if(profile < 9) output+=bytes('screen_cbor',encodeScreen(dashboard,'bench-screen',capabilities));
}
const gifMetadata=JSON.stringify(JSON.stringify(gif.contract));
if(!direct) output+='inline constexpr char gif_metadata[] = '+gifMetadata+';\n';
writeFileSync(process.argv[3],output);
