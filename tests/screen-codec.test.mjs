// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {encodeScreen,decodeScreenPacket as decodeWire,screenContract} from '../packages/screen-codec/index.js';
import {contract} from '../packages/style-codec/index.js';
import {decodeNodeCommands} from '../packages/screen-codec/command-stream.js';
const decodeScreenPacket=bytes=>{const p=decodeWire(bytes);p.set('root',decodeNodeCommands(p.get('root'),screenContract.widgets,p.get('captions')));return p;};
import {assertScreenAbiCompatible} from '../tools/screen-abi.mjs';
const load=async name=>JSON.parse(await readFile(new URL('../examples/screens/'+name+'.json',import.meta.url),'utf8'));
const method=(name)=>contract.methods.find(m=>m.alias===name).opcode;
for(const name of ['absolute','flex','grid','nested','shared','widgets','component'])test('screen MVP compiles numeric operations: '+name,async()=>{
 const doc=await load(name),bytes=encodeScreen(doc,name),packet=decodeScreenPacket(bytes);
 assert.equal(packet.get('abi'),screenContract.sha256);assert.equal(packet.get('style_abi'),contract.sha256);assert.ok(bytes.length<=3584,'fits S3 transport');
 function walk(node){assert.equal(typeof node.get('type'),'number');for(const field of ['common','widget','style'])for(const key of node.get(field)?.keys()??[])assert.equal(typeof key,'number');for(const child of node.get('children'))walk(child);}
 walk(packet.get('root'));assert.ok(!new TextDecoder().decode(bytes).includes('lv_label_set_text'));assert.ok(!new TextDecoder().decode(bytes).includes('LV_PROPERTY_'));
});
test('Grid tracks and percentage coordinates compile to the pinned LVGL 9.6 representation',async()=>{
 const grid=decodeScreenPacket(encodeScreen(await load('grid'),'grid')).get('root').get('style');
 assert.deepEqual(grid.get(method('grid_column_dsc_array')),[180,(1<<29)-100,(1<<29)-100]);
 const flex=decodeScreenPacket(encodeScreen(await load('flex'),'flex')).get('root');
 assert.equal(flex.get('children')[1].get('style').get(method('width')),(1<<29)|100);
 assert.equal(flex.get('style').get(method('flex_flow')),1);
});
test('Button caption normalization avoids collisions and preserves the source document',async()=>{
 const doc=await load('shared');doc.root.children.push({id:'__caption_0',type:'label',props:{text:'Author caption'}});const original=structuredClone(doc);
 const root=decodeScreenPacket(encodeScreen(doc,'button')).get('root');const ids=[];const visit=node=>{ids.push(node.get('id'));for(const child of node.get('children'))visit(child);};visit(root);
 assert.equal(ids.length,new Set(ids).size);assert.ok(ids.includes('__caption_1'));assert.deepEqual(doc,original);
});
test('bindings, duplicate IDs, arbitrary calls and inconsistent ranges are rejected before transmission',async()=>{
 const doc=await load('absolute');
 for(const mutate of [d=>d.bindings=[{}],d=>d.root.children[0].id='root',d=>d.root.props={eval:'x'},d=>d.root.children[2].props={min:100,max:0},d=>d.root.children[2].props={min:0,max:100,range:[1,2]},d=>d.root.style.width={pct:1.5},d=>d.root.style.layout='custom:radial',d=>d.root.styleRules=[{part:'UNKNOWN',props:{}}]]){
  const invalid=structuredClone(doc);mutate(invalid);assert.throws(()=>encodeScreen(invalid,'invalid'));
 }
});
test('screen ABI rejects changed factory, signature or method and preserves existing style ABI',async()=>{
 const lock=JSON.parse(await readFile(new URL('../contracts/screen-abi-v3.lock.json',import.meta.url),'utf8'));
 const current=JSON.parse(await readFile(new URL('../contracts/screen-api-v3.json',import.meta.url),'utf8'));assertScreenAbiCompatible(lock,current);
 for(const mutate of [d=>d.widgets[1].create='lv_obj_create',d=>d.widgets[1].methods[0].opcode=7,d=>d.widgets[1].methods[0].parameters=['int32_t']]){const bad=structuredClone(current);mutate(bad);assert.throws(()=>assertScreenAbiCompatible(lock,bad));}
 const retired=structuredClone(current);retired.widgets[1].methods[0].retired=true;assertScreenAbiCompatible(lock,retired);assert.throws(()=>assertScreenAbiCompatible(retired,current));
 const styleLock=JSON.parse(await readFile(new URL('../contracts/style-abi-v2.lock.json',import.meta.url),'utf8'));assert.equal(contract.methods.find(m=>m.alias==='x').opcode,styleLock.methods.find(m=>m.alias==='x').opcode);assert.deepEqual(decodeScreenPacket(encodeScreen(await load('component'),'mount')).get('bindings'),[]);
});

test('Nested node validation identifies the exact authored path without changing the document',async()=>{
 const doc=await load('absolute');doc.root.children=[{id:'group',type:'obj',children:[{type:'label',props:{text:'Missing ID'}}]}];const original=structuredClone(doc);
 assert.throws(()=>encodeScreen(doc,'invalid'),/Node ID at root\.children\[0\]\.children\[0\]/);assert.deepEqual(doc,original);
 doc.root.children[0].children[0].id='root';assert.throws(()=>encodeScreen(doc,'invalid'),/Duplicate node ID root at root\.children\[0\]\.children\[0\]/);
});
