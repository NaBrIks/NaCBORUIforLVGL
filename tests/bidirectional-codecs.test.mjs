// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {encode} from 'cborg';
import {encodeStyle,decodeStyle,encodeMethods,contract,checkStyleCapabilities} from '../packages/style-codec/index.js';
import {encodeScreen,decodeScreen,normalizeScreen,validateScreen,offlineCapabilities,screenContract} from '../packages/screen-codec/index.js';
import {previewStyle,resolvedStyle} from '../frontend/src/preview-style.js';

for(const name of ['absolute','flex','grid','nested','shared','widgets','component'])test('canonical screen roundtrip preserves every wire operation: '+name,async()=>{
 const source=JSON.parse(await readFile(new URL('../examples/screens/'+name+'.json',import.meta.url),'utf8'));
 const before=structuredClone(source),bytes=encodeScreen(source,'roundtrip'),doc=decodeScreen(bytes);
 assert.equal(doc.name,source.name);assert.equal(doc.id,source.id);
 assert.deepEqual(encodeScreen(doc,'roundtrip'),bytes);
 assert.deepEqual(normalizeScreen(doc),doc);assert.deepEqual(source,before);
});
test('all common operations, zero values and non-CHECKED states remain representable',()=>{
 const source={format:'lvgl-screen-draft-1',id:'common',name:'Общие операции',size:{width:800,height:480},root:{id:'root',type:'obj',common:{scrollbar_mode:0,scroll_dir:15,add_flags:1<<24,remove_flags:0,add_state:128}}};
 const bytes=encodeScreen(source,'common');assert.deepEqual(encodeScreen(decodeScreen(bytes),'common'),bytes);
});
test('paired style adapters normalize dimensions, arrays, flags and colors identically in both directions',()=>{
 const props={x:{pct:-25},width:'content',grid_column_dsc_array:[40,'content',{fr:2}],bg_color:0x123456,flex_flow:'LV_FLEX_FLOW_COLUMN_REVERSE',border_side:'LV_BORDER_SIDE_LEFT | LV_BORDER_SIDE_RIGHT'};
 const bytes=encodeStyle({scope:'screen',name:'paired',props},'paired'),back=decodeStyle(bytes);
 assert.deepEqual(back.props.x,{pct:-25});assert.equal(back.props.width,'content');assert.equal(back.props.bg_color,'#123456');assert.deepEqual(back.props.grid_column_dsc_array,props.grid_column_dsc_array);
 assert.deepEqual(encodeStyle(back,'paired'),bytes);
});
test('reverse style decoding rejects malformed envelopes, types, unknown fields and overlapping methods',()=>{
 const x=contract.methods.find(m=>m.alias==='x').opcode;
 for(const bad of [{v:1,id:'x',scope:'invalid',name:'x',methods:new Map()}, {v:1,id:'x',scope:'screen',name:42,methods:new Map()}, {v:1,id:'x',scope:'screen',name:'x',methods:new Map([[x,'bad']])}, {v:1,id:'x',scope:'screen',name:'x',extra:1,methods:new Map()}])assert.throws(()=>decodeStyle(encode(bad)));
});
test('editor validation and compilation share the same limits and argument rules',()=>{
 const source={format:'lvgl-screen-draft-1',id:'limits',name:'Limits',size:{width:800,height:480},root:{id:'root',type:'obj'}};
 for(const mutate of [d=>d.root.style={width:{pct:1.5}},d=>d.root.style={grid_cell_column_span:0},d=>d.root.props={unknown:1},d=>d.root.children=Array.from({length:128},(_,i)=>({id:'n'+i,type:'obj'}))]){
  const doc=structuredClone(source);mutate(doc);assert.ok(validateScreen(doc).length);assert.throws(()=>encodeScreen(doc,'bad'));
 }
});
test('device capabilities constrain actual widget choices, layouts, resources and transport limits',()=>{
 const caps=offlineCapabilities();caps.source='device';caps.availableWidgets=[0,1];caps.layouts=[0];caps.resources=[{name:'custom-font',type:'const lv_font_t *'}];caps.limits.screenPacketBytes=3584;
 assert.doesNotThrow(()=>encodeStyle({scope:'screen',name:'font',props:{text_font:'custom-font'}},'font',caps));
 assert.throws(()=>encodeStyle({scope:'screen',name:'font',props:{text_font:'default'}},'font',caps),/resource unavailable/);
 assert.throws(()=>checkStyleCapabilities({layout:'LV_LAYOUT_FLEX'},caps),/layout unavailable/);
 const doc={format:'lvgl-screen-draft-1',id:'caps',name:'Capabilities',size:{width:800,height:480},root:{id:'root',type:'obj',children:[{id:'slider',type:'slider'}]}};
 assert.throws(()=>encodeScreen(doc,'caps',caps),/widget unavailable/);
 doc.root.children=[];caps.limits.nodes=0;assert.throws(()=>encodeScreen(doc,'caps',caps),/node\/depth/);
});
test('preview uses the same color and selector normalization as the compiler',()=>{
 assert.equal(previewStyle({type:'obj',style:{bg_color:0xff0000}}).backgroundColor,'#ff0000ff');
 const node={styleRules:[{part:'LV_PART_MAIN',state:['LV_STATE_DEFAULT'],props:{text_color:'#FF0000'}}]};
 assert.equal(resolvedStyle(node,{}).text_color,'#ff0000');
});

test('explicit common state and widget checked combine into one validated operation',()=>{
 const doc={format:'lvgl-screen-draft-1',id:'state',name:'State',size:{width:800,height:480},root:{id:'root',type:'obj',children:[{id:'switch',type:'switch',common:{add_state:8},props:{checked:true}}]}};
 const bytes=encodeScreen(doc,'state');const back=decodeScreen(bytes);
 assert.equal(back.root.children[0].common.add_state,12);assert.deepEqual(encodeScreen(back,'state'),bytes);
});
