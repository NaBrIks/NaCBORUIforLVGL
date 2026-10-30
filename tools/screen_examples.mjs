// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {writeFile,mkdir} from 'node:fs/promises';
import {encode} from 'cborg';
import {encodeScreen,decodeScreenPacket as decodeWire,screenContract} from '../packages/screen-codec/index.js';
import {contract} from '../packages/style-codec/index.js';
import {encodeNodeCommands,decodeNodeCommands} from '../packages/screen-codec/command-stream.js';
const decodeScreenPacket=bytes=>{const p=decodeWire(bytes);p.set('root',decodeNodeCommands(p.get('root'),screenContract.widgets,p.get('captions')));return p;};
const encodeFixture=p=>{const copy=new Map(p);copy.set('root',encodeNodeCommands(p.get('root')));return encode(copy);};
import {createNode,widgetTypes} from '../frontend/src/screen-model.js';
const root=new URL('../',import.meta.url),directory=new URL('examples/screens/',root),fixtures=new URL('local/screen-fixtures/',root);
await mkdir(directory,{recursive:true});await mkdir(fixtures,{recursive:true});
const node=(id,type,style={},props={},children=[])=>({id,type,style,props,flags:{SCROLLABLE:false},children});
const label=(id,text,style={})=>node(id,'label',{text_color:'#ffffff',...style},{text});
const scene=(id,title,body)=>({format:'lvgl-screen-draft-1',id,name:title,theme:'none',size:{width:800,height:480},styles:{},root:body,bindings:[]});
const background={bg_color:'#101820',bg_opa:255};
const absolute=scene('absolute','MVP · ручное размещение',node('root','obj',background,{},[
 label('title','Absolute / border / outline / shadow',{x:24,y:20,text_font:'montserrat_28'}),
 node('card','obj',{x:24,y:84,width:320,height:170,min_width:280,max_width:360,bg_color:'#204050',bg_opa:255,border_width:2,border_color:'#3dbb91',outline_width:3,outline_color:'#f0ad3d',outline_pad:5,shadow_width:18,shadow_offset_x:8,shadow_offset_y:8,radius:10},{},[label('caption','Independent box',{x:14,y:14,text_font:'montserrat_20'})]),
 {...node('level','bar',{x:400,y:110,width:300,height:30,bg_color:'#324652',bg_opa:255},{min:0,max:100,value:65}),styleRules:[{part:'INDICATOR',props:{bg_color:'#3dbb91',bg_opa:255,radius:5}}]},
 node('trace','line',{x:400,y:180,width:280,height:70,line_color:'#f0ad3d',line_width:3},{points:[[0,60],[70,20],[140,45],[210,0],[280,30]]})
]));
const flex=scene('flex','MVP · Flex',node('root','obj',{...background,layout:'LV_LAYOUT_FLEX',flex_flow:'LV_FLEX_FLOW_COLUMN',pad_all:20,pad_row:16},{},[
 label('title','Flex / grow / nested containers',{text_font:'montserrat_28'}),
 node('row','obj',{width:{pct:100},height:200,layout:'LV_LAYOUT_FLEX',flex_flow:'LV_FLEX_FLOW_ROW',pad_column:16},{},[25,65,90].map((value,i)=>node('card_'+i,'obj',{width:160,height:180,flex_grow:1,layout:'LV_LAYOUT_FLEX',flex_flow:'LV_FLEX_FLOW_COLUMN',pad_all:12,pad_row:16,bg_color:'#204050',bg_opa:255,radius:8},{},[
  label('text_'+i,'Value '+value,{text_font:'montserrat_20'}),
  {...node('bar_'+i,'bar',{width:{pct:100},height:24,bg_color:'#324652',bg_opa:255},{min:0,max:100,value}),styleRules:[{part:'INDICATOR',props:{bg_color:'#3dbb91',bg_opa:255}}]}
 ])))
]));
const grid=scene('grid','MVP · Grid',node('root','obj',{...background,layout:'LV_LAYOUT_GRID',grid_column_dsc_array:[180,{fr:1},{fr:1}],grid_row_dsc_array:[50,'content',{fr:1}],pad_all:16,pad_row:12,pad_column:12},{},[
 label('title','Grid / content / FR / span',{grid_cell_column_pos:0,grid_cell_column_span:3,grid_cell_x_align:'LV_GRID_ALIGN_STRETCH',grid_cell_row_pos:0,text_font:'montserrat_28'}),
 node('side','obj',{grid_cell_column_pos:0,grid_cell_row_pos:1,grid_cell_row_span:2,grid_cell_x_align:'LV_GRID_ALIGN_STRETCH',grid_cell_y_align:'LV_GRID_ALIGN_STRETCH',bg_color:'#204050',bg_opa:255,pad_all:10},{},[label('side_text','Sidebar',{x:8,y:8,text_font:'montserrat_20'})]),
 label('value','65 %',{grid_cell_column_pos:1,grid_cell_row_pos:1,text_font:'montserrat_28'}),
 {...node('level','bar',{grid_cell_column_pos:2,grid_cell_row_pos:1,grid_cell_x_align:'LV_GRID_ALIGN_STRETCH',height:28,bg_color:'#324652',bg_opa:255},{value:65,min:0,max:100}),styleRules:[{part:'INDICATOR',props:{bg_color:'#3dbb91',bg_opa:255}}]},
 node('body','obj',{grid_cell_column_pos:1,grid_cell_column_span:2,grid_cell_row_pos:2,grid_cell_x_align:'LV_GRID_ALIGN_STRETCH',grid_cell_y_align:'LV_GRID_ALIGN_STRETCH',bg_color:'#283c48',bg_opa:255})
]));
const component=scene('component','MVP · независимый компонент',node('root','obj',{bg_color:'#204050',bg_opa:255,pad_all:8,radius:8},{},[
 label('caption','Repeated component',{x:8,y:8,text_font:'montserrat_20'}),
 node('trace','line',{x:8,y:44,width:200,height:50,line_color:'#3dbb91',line_width:3},{points:[[0,40],[50,10],[100,30],[150,0],[200,25]]})
]));component.size={width:240,height:120};
function instance(prefix,x,y){const copy=structuredClone(component.root);const rename=n=>{n.id=prefix+'/'+n.id;for(const c of n.children)rename(c);};rename(copy);Object.assign(copy.style,{x,y,width:240,height:120});return copy;}
const nested=scene('nested','MVP · вложенные компоненты',node('root','obj',background,{},[
 label('title','Nested / isolated instances',{x:20,y:16,text_font:'montserrat_28'}),
 node('host','obj',{x:20,y:70,width:750,height:360,bg_color:'#152b35',bg_opa:255},{},[instance('left',10,10),node('subhost','obj',{x:290,y:20,width:430,height:300},{},[instance('right',20,20)])])
]));
const shared=scene('shared','MVP · общие стили и состояния',node('root','obj',{...background,layout:'LV_LAYOUT_FLEX',flex_flow:'LV_FLEX_FLOW_COLUMN',pad_all:20,pad_row:16},{},[
 label('title','Shared styles / part / state',{text_font:'montserrat_28'}),
 {...node('button_a','button',{width:240,height:60},{text:'First'}),styles:[{ref:'screen:button'}],styleRules:[{state:['PRESSED'],props:{bg_color:'#d48522'}}]},
 {...node('button_b','button',{width:240,height:60},{text:'Second'}),styles:[{ref:'screen:button'}]},
 {...node('checked','checkbox',{text_color:'#ffffff'},{text:'Checked state',checked:true}),styleRules:[{part:'INDICATOR',state:['CHECKED'],props:{bg_color:'#3dbb91',bg_opa:255,width:20,height:20}}]}
]));shared.styles={button:{props:{bg_color:'#246e8c',bg_opa:255,text_color:'#ffffff',radius:8,border_width:2,border_color:'#3dbb91'}}};
const widgets=scene('widgets','MVP · параметры виджетов',node('root','obj',background,{},[
 label('title','Widget setters / typed parameters',{x:20,y:10,text_font:'montserrat_28'}),
 node('slider','slider',{x:30,y:80,width:250,height:25},{min:-20,max:80,value:35,start_value:0}),
 node('arc','arc',{x:330,y:70,width:140,height:140,arc_color:'#3dbb91',arc_width:8},{min:0,max:100,value:70,angles:[30,240],bg_angles:[0,270],rotation:0,mode:0}),
 node('textarea','textarea',{x:30,y:150,width:250,height:60,text_color:'#ffffff',border_width:1,border_color:'#3dbb91'},{text:'MVP text',max_length:20,one_line:true,password_mode:false}),
 node('dropdown','dropdown',{x:30,y:240,width:250,height:40,text_color:'#ffffff',bg_color:'#246e8c',bg_opa:255},{options:['One','Two','Three'],selected:1,direction:8}),
 node('switch','switch',{x:330,y:250,width:60,height:28},{checked:true}),
 node('image','image',{x:450,y:250,width:50,height:50},{scale:256,rotation:0})
]));
export const examples={absolute,flex,grid,nested,shared,widgets,component};
for(const [name,doc] of Object.entries(examples)){await writeFile(new URL(name+'.json',directory),JSON.stringify(doc,null,2)+'\n');await writeFile(new URL(name+'.cbor',fixtures),encodeScreen(doc,name));}
const base=decodeScreenPacket(encodeScreen(absolute,'invalid'));
const write=async(name,mutate)=>{const packet=structuredClone(base);mutate(packet);await writeFile(new URL(name+'.cbor',fixtures),encodeFixture(packet));};
await write('bad_signature',p=>{const m=p.get('root').get('children')[0].get('widget');const [key,value]=m.entries().next().value;m.delete(key);m.set(0xffff,value);});
await write('bad_id',p=>p.get('root').get('children')[0].set('id','root'));
await write('bad_binding',p=>p.set('bindings',[{target:'title'}]));
await write('bad_abi',p=>p.set('abi','wrong'));
await write('bad_style',p=>p.get('root').get('style').set(65535,0));
await write('bad_range',p=>{const bar=p.get('root').get('children')[2];bar.get('widget').set(screenContract.widgets.find(w=>w.name==='bar').methods[0].opcode,[100,0]);});
await write('bad_flags',p=>p.get('root').set('common',new Map([[screenContract.common.methods[0].opcode,16],[screenContract.common.methods[1].opcode,16]])));
await write('bad_depth',p=>{let parent=p.get('root');for(let i=0;i<14;++i){const child=new Map([['id','deep_'+i],['type',0]]);parent.set('children',[child]);parent=child;}});
await write('bad_subgrid',p=>p.get('root').get('style').set(contract.methods.find(m=>m.alias==='layout').opcode,2));
const invalidGrid=decodeScreenPacket(encodeScreen(grid,'bad_grid_cell'));invalidGrid.get('root').get('children')[0].get('style').set(contract.methods.find(m=>m.alias==='grid_cell_column_pos').opcode,2);await writeFile(new URL('bad_grid_cell.cbor',fixtures),encodeFixture(invalidGrid));
await write('bad_resource',p=>{const child=p.get('root').get('children')[0];child.get('style').set(contract.methods.find(m=>m.alias==='text_font').opcode,'missing-font');});
const bytes=encodeScreen(absolute,'truncated');await writeFile(new URL('truncated.cbor',fixtures),bytes.slice(0,-1));
console.log('MVP JSON and CBOR fixtures generated:',Object.keys(examples).join(', '));
for(const type of widgetTypes){const sample=createNode(type,'sample');sample.style={};const preview=scene('preview_'+type,'Preview '+type,node('preview-root','obj',background,{},[sample]));preview.theme='device';await writeFile(new URL('preview_'+type+'.cbor',fixtures),encodeScreen(preview,'preview-'+type));}
const brokenPreview=decodeScreenPacket(await (await import('node:fs/promises')).readFile(new URL('preview_label.cbor',fixtures)));
brokenPreview.get('root').get('children')[0].get('style').set(contract.methods.find(m=>m.alias==='text_font').opcode,'missing-font');
await writeFile(new URL('preview_bad_resource.cbor',fixtures),encodeFixture(brokenPreview));

const bridge=scene('service_bridge','Style service bridge',node('root','obj',background,{},[
 {...node('global_label','label',{}, {text:'Dynamic'}),styles:[{ref:'global:palette'}]},
 {...node('static_label','label',{}, {text:'Static'}),styles:[{ref:'global-static:palette'}]},
 {...node('local_label','label',{}, {text:'Screen'}),styles:[{ref:'screen:local'}]}
]));bridge.styles={local:{props:{text_color:'#112233'}}};
await writeFile(new URL('service_bridge.cbor',fixtures),encodeScreen(bridge,'service-bridge'));

// Values outside default ranges make PC execution order observable in native tests.
const ordered=structuredClone(widgets);
ordered.root.children.find(n=>n.type==='textarea').props={text:'abcdef',one_line:true,max_length:3};
ordered.root.children.find(n=>n.type==='slider').props={value:150,min:-200,max:200};
await writeFile(new URL('ordered_widgets.cbor',fixtures),encodeScreen(ordered,'ordered'));
