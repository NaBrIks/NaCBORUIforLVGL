// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {encode} from 'cborg';
import {readFile} from 'node:fs/promises';
import {encodeScreen,decodeScreen,decodeScreenPacket,screenContract as C,offlineCapabilities} from '../packages/screen-codec/index.js';
import {contract as S} from '../packages/style-codec/index.js';
const doc=()=>({format:'lvgl-screen-draft-1',id:'cursor',name:'Cursor',size:{width:800,height:480},root:{id:'root',type:'obj',children:[{id:'button',type:'button',children:[{id:'text',type:'label',props:{text:'Open'}}]}]}});
const opcode=(type,alias)=>C.widgets.find(w=>w.name===type).methods.find(m=>m.alias===alias).opcode;
const type=name=>C.widgets.find(w=>w.name===name).id;
test('actual CBOR is nested creation commands with local method IDs',()=>{
 const d=doc(),packet=decodeScreenPacket(encodeScreen(d,'cursor'));
 assert.equal(packet.get('v'),3);
 assert.deepEqual(packet.get('root'),[0,type('obj'),[[1,'root'],[0,type('button'),[[1,'button'],[0,type('label'),[[1,'text'],[opcode('label','text'),'Open']]]]]]]);
 assert.deepEqual(decodeScreen(encodeScreen(d,'cursor')).root.children[0].children[0].props,{text:'Open'});
});
test('component method IDs overlap intentionally and common codes occupy only 1..255',()=>{
 assert.equal(opcode('label','text'),256);assert.equal(opcode('bar','range'),256);
 for(const w of C.widgets){assert.equal(new Set(w.methods.map(m=>m.opcode)).size,w.methods.length);for(const m of w.methods)assert.ok(m.opcode>=256&&m.opcode<=65535);}
 for(const m of C.common.methods)assert.ok(m.opcode>3&&m.opcode<=255);
});
test('inline and referenced styles use single separate argument blocks',()=>{
 const d=doc();d.styles={base:{props:{radius:4}}};d.root.styles=[{ref:'screen:base'}];d.root.style={bg_color:'#123456'};d.root.styleRules=[{state:['PRESSED'],props:{radius:8}}];
 const p=decodeScreenPacket(encodeScreen(d,'styles')),ops=p.get('root')[2];
 assert.deepEqual(ops.find(op=>op[0]===3),[3,[0,'screen:base']]);
 const own=ops.find(op=>op[0]===2);assert.equal(own[1][0],0);assert.ok(own[1][1] instanceof Map);
 assert.equal(own[1][1].get(S.methods.find(m=>m.alias==='bg_color').opcode),0x123456);
 assert.deepEqual(encodeScreen(decodeScreen(encodeScreen(d,'styles')),'styles'),encodeScreen(d,'styles'));
});
test('declarative decoder rejects cursor programs it cannot preserve instead of changing their order',()=>{
 const p=decodeScreenPacket(encodeScreen(doc(),'order'));
 p.get('root')[2].push([C.common.methods[0].opcode,16]);
 assert.throws(()=>decodeScreen(encode(p)),/order/);
});
test('decoder rejects malformed creation, method and reserved common commands',()=>{
 const p=decodeScreenPacket(encodeScreen(doc(),'bad'));
 for(const op of [[0,1],[1,'duplicate'],[255,0],[65535,0],[4],[4,0,1]]){
  const bad=structuredClone(p);bad.get('root')[2].splice(1,0,op);assert.throws(()=>decodeScreen(encode(bad)));
 }
 const old=structuredClone(p);old.set('v',2);assert.throws(()=>decodeScreen(encode(old)),/ABI/);
});
test('runtime extension contracts use local IDs and reject the service namespace',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../examples/native_widget/meter.json',import.meta.url)));
 const caps=offlineCapabilities();caps.extensions=[{id:256,name:'example:meter',abi:'meter-1',contract:manifest}];caps.availableWidgets.push(256);
 const d=doc();d.root.children=[{id:'meter',type:'example:meter',props:{reading:[42,'kPa']}}];
 const bytes=encodeScreen(d,'extension',caps),p=decodeScreenPacket(bytes),create=p.get('root')[2].find(op=>op[0]===0);
 assert.deepEqual(create[1],[256,'meter-1']);assert.deepEqual(create[2][1],[258,[42,'kPa']]);
 create[1][0]='example:meter';assert.equal(decodeScreen(encode(p),caps).root.children[0].type,'example:meter');
 manifest.methods[0].opcode=255;assert.throws(()=>encodeScreen(d,'extension',caps),/extension method/);
});

test('CBOR map sorting does not reorder phase-sensitive command arrays',()=>{
 const d=doc();d.root.children=[{id:'input',type:'textarea',props:{text:'abcdef',max_length:3,one_line:true}}];
 const bytes=encodeScreen(d,'sorted'),p=decodeScreenPacket(bytes);
 const sorted=encode(p),back=decodeScreen(sorted);
 assert.deepEqual(encodeScreen(back,'sorted'),bytes);
 const ops=decodeScreenPacket(sorted).get('root')[2].find(op=>op[0]===0)[2];
 assert.deepEqual(ops.slice(1).map(op=>op[0]),['max_length','one_line','text'].map(name=>opcode('textarea',name)));
});
