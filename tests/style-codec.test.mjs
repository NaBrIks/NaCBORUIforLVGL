// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';
import {encode,decode} from 'cborg';
import {contract,encodeStyle,decodeStyle,decodePacket} from '../packages/style-codec/index.js';
const document=props=>({scope:'screen',name:'demo',copy:'global:base',merge:[],attach:true,props});
test('ABI is versioned, complete and independent from HTML ordering',async()=>{
 const matrix=JSON.parse(await readFile(new URL('../docs/style_matrix_lvgl_9_6.data.json',import.meta.url),'utf8'));
 assert.equal(contract.version,2);assert.equal(contract.methods.length,138);assert.equal(new Set(contract.methods.map(m=>m.opcode)).size,138);
 assert.deepEqual(new Set(contract.methods.map(m=>m.name)),new Set(matrix.rows.filter(r=>r.family==='shared').map(r=>r.name)));
 for(const signature of contract.signatures)contract.methods.filter(m=>m.signature===signature.id).forEach((m,index)=>{assert.equal(m.index,index);assert.equal(m.opcode&255,index);assert.equal(m.opcode>>>8,m.signature);});
});
for(const method of contract.methods)test('roundtrip '+method.name,()=>{
 const values=method.parameters.map(type=>type==='bool'?true:type==='lv_color_t'?'#123456':type.includes('*')?'registered-resource':Object.values(contract.enums[type]??{})[0]??10);
 const packet=encodeStyle(document({[method.alias]:values.length===1?values[0]:values}),'test');
 const wire=decodePacket(packet);assert(wire.get('methods') instanceof Map);assert(wire.get('methods').has(method.opcode));
 const result=decodeStyle(packet);assert.equal(Object.keys(result.props)[0],method.alias);assert.deepEqual(encodeStyle(result,'test'),packet);
});
test('several properties, copy and ordered merges survive binary roundtrip',()=>{
 const source={...document({x:-50,bg_color:'#00ff00',pad_all:4,size:[420,100]}),merge:['global:compact','global:warning']};
 assert.deepEqual(decodeStyle(encodeStyle(source,'multi')),source);
});
test('reject unknown methods, conflicting setters, numeric overflow and wrong types',()=>{
 for(const props of [{unknown:1},{width:100,size:[100,200]},{x:2147483648},{bg_opa:256},{clip_corner:1},{text_color:'#bad'},{size:[2]},{text_font:null},{x:NaN},{text_align:99999}])assert.throws(()=>encodeStyle(document(props),'bad'));
});
test('numeric wire opcodes are integers, not decimal strings',()=>{
 const wire=decodePacket(encodeStyle(document({x:123}),'key'));const key=[...wire.get('methods').keys()][0];assert.equal(typeof key,'number');assert.equal(key,contract.methods.find(m=>m.alias==='x').opcode);
});
test('decoder rejects duplicate keys and truncated packets',()=>{
 assert.throws(()=>decodePacket(Uint8Array.from([0xa2,0x00,0x01,0x00,0x02])));
 const packet=encodeStyle(document({x:5}),'truncated');assert.throws(()=>decodePacket(packet.slice(0,-1)));
});
test('maximum packet bounds and integer preservation',()=>{
 assert.throws(()=>decodePacket(new Uint8Array(8193)));
 assert.equal(decodeStyle(encodeStyle(document({anim_duration:4294967295}),'max')).props.anim_duration,4294967295);
});
test('bit masks are allowed only for flag enums',()=>{
 assert.doesNotThrow(()=>encodeStyle(document({border_side:'LV_BORDER_SIDE_LEFT | LV_BORDER_SIDE_RIGHT'}),'flags'));
 assert.throws(()=>encodeStyle(document({text_align:'LV_TEXT_ALIGN_LEFT | LV_TEXT_ALIGN_RIGHT'}),'not-flags'));
 assert.throws(()=>encodeStyle({...document({}),props:[]},'not-object'));
});
