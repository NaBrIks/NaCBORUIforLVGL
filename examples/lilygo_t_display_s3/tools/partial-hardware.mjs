// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connectSerial} from './serial_cbor.mjs';
const [port,python,output='local/lilygo-partial.rgb565']=process.argv.slice(2);
if(!port)throw Error('Usage: node partial-hardware.mjs PORT [PYTHON] [OUTPUT]');
const device=connectSerial({port,python});
const command=async request=>{const reply=await device.command(request);assert.equal(reply.ok,true,JSON.stringify(reply));return reply;};
const inspect=()=>command({op:'inspect'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let initial;
try {
 initial=await inspect();
 assert.deepEqual([initial.width,initial.height,initial.mode,initial.buffers,initial.pixelFormat,initial.transfer],[320,170,'partial',2,'RGB565','band']);
 const running=JSON.parse(initial.dataJson).sources.find(item=>item.name==='demo.running')?.value;
 if(typeof running==='boolean')await command({op:'write',source:'demo.running',value:false});
 try {
  await pause(200);
  const before=await inspect();
  const passive=await device.command({op:'frame_band',y:164,rows:6,passive:true});
  const after=await inspect();
  assert.equal(passive.error,'frame_band_unavailable');
  assert.equal(after.flushes,before.flushes,'Passive request must not force a flush on an idle display');
  const assembled=Buffer.alloc(320*170*2);let scene,revision=0,packets=0;
  for(let y=0;y<170;y+=6){
   const rows=Math.min(6,170-y), reply=await command({op:'frame_band',y,rows});
   const packet=Buffer.from(reply.frameHex,'hex');
   assert.equal(packet.subarray(0,4).toString(),'LVF1');
   assert.equal(packet.readUInt32LE(4),320*rows*2);
   assert.equal(packet.length,32+320*rows*2);
   assert.ok(packet.readUInt32LE(8)>revision);revision=packet.readUInt32LE(8);
   scene??=packet.readUInt32LE(12);assert.equal(packet.readUInt32LE(12),scene);
   assert.deepEqual(Array.from({length:8},(_,i)=>packet.readUInt16LE(16+2*i)),[0,y,320,rows,320,170,1,1]);
   packet.copy(assembled,y*640,32);packets++;
  }
  assert.ok(new Set(assembled).size>8,'Expected visible content in assembled frame');
  await writeFile(output,assembled);
  const final=await inspect();
  console.log(JSON.stringify({mode:final.mode,buffers:final.buffers,pixelFormat:final.pixelFormat,transfer:final.transfer,packets,passiveFlushes:after.flushes-before.flushes,lazyFlushes:final.flushes-after.flushes,bytes:assembled.length,output}));
 } finally {if(running===true)await command({op:'write',source:'demo.running',value:true});}
} finally {await device.close();}
