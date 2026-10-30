// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {mkdir,writeFile} from 'node:fs/promises';
import {encode} from 'cborg';
import {encodeStyle,decodePacket,contract} from '../packages/style-codec/index.js';
const directory=new URL('../local/native-fixtures/',import.meta.url);
await mkdir(directory,{recursive:true});
const doc=(props,extra={})=>({scope:'screen',name:'demo',copy:'global:base',attach:true,props,...extra});
const valid={
 basic:doc({x:60,y:100,size:[420,150],text_color:'#f6e9c8',border_width:3,pad_all:18,text_font:'montserrat_28'}),
 global:doc({text_color:'#ff0000',radius:5},{scope:'global',name:'palette',copy:null,attach:false}),
 merge:doc({x:12},{copy:'global:base',merge:['global:palette']}),
 replace_global:doc({text_color:'#0000ff',radius:8},{scope:'global',name:'palette',copy:null,attach:false}),
 missing_resource:doc({text_font:'absent'}),
 maximum_uint:doc({anim_duration:4294967295}),
 new_96:doc({blur_radius:3,blur_quality:'LV_BLUR_QUALITY_SPEED',drop_shadow_offset_x:7,drop_shadow_radius:4,drop_shadow_color:'#123456',text_leading_trim:'LV_TEXT_LEADING_TRIM_CAPITAL'}),
 screen_shared_update:doc({text_color:'#abcdef'},{name:'local',copy:null,attach:false}),
 tracks_source:doc({grid_column_dsc_array:[100,{fr:1}]},{scope:'global',name:'tracks',copy:null,attach:false}),
 tracks_copy:doc({},{copy:'global:tracks'}),
 tracks_replace:doc({grid_column_dsc_array:[200,{fr:2}]},{scope:'global',name:'tracks',copy:null,attach:false}),
 empty:doc({}),
};
for(const [name,document] of Object.entries(valid))await writeFile(new URL(name+'.cbor',directory),encodeStyle(document,name));
const source=encodeStyle(valid.basic,'invalid');
await writeFile(new URL('truncated.cbor',directory),source.slice(0,-1));
let packet=decodePacket(source);let [opcode,value]=packet.get('methods').entries().next().value;
packet.get('methods').delete(opcode);packet.get('methods').set(0xffff,value);
await writeFile(new URL('signature.cbor',directory),encode(packet));
packet=decodePacket(source);packet.get('methods').set(contract.methods.find(m=>m.alias==='width').opcode,300);
await writeFile(new URL('overlap.cbor',directory),encode(packet));
packet=decodePacket(source);packet.get('methods').set(contract.methods.find(m=>m.alias==='bg_opa').opcode,256);
await writeFile(new URL('overflow.cbor',directory),encode(packet));
packet=decodePacket(source);packet.set('copy','global:missing');
await writeFile(new URL('missing_source.cbor',directory),encode(packet));
packet=decodePacket(source);packet.set('v',1);await writeFile(new URL('old_abi.cbor',directory),encode(packet));
console.log('Native fixtures generated from the actual JS codec.');
