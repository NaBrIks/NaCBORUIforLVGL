// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectBmp,frameLimits,fetchFrameBmp,frameDelay,createPreviewFrameSource} from '../tools/designer/browser-tools/frame.js';

test('preview snapshots wait for a committed newer frame and reject a detached source',async()=>{
 const source=createPreviewFrameSource({drawCompleted(){}});
 const signal=AbortSignal.timeout(5000),encode=frame=>({width:frame.width});
 const frame={width:800,height:480,revision:'10',scene:4};
 source.commit(frame);
 const cached=await source.read({},signal,encode);
 assert.equal(cached.frameRevision,'10');
 let resolved=false;
 const next=source.read({fresh:true,afterScene:4},signal,encode).then(result=>{resolved=true;return result;});
 source.commit({...frame,revision:'11'});
 await Promise.resolve();
 assert.equal(resolved,false);
 source.commit({...frame,revision:'12',scene:5});
 assert.equal((await next).scene,5);
 const detached=source.read({fresh:true},signal,encode);
 source.close();
 await assert.rejects(detached,/preview_frame_source_changed/);
});

function bmp565(width=3,height=2,topDown=true){
 const stride=Math.ceil(width*16/32)*4,bytes=new Uint8Array(66+stride*height),view=new DataView(bytes.buffer);
 bytes.set([0x42,0x4d]);view.setUint32(2,bytes.length,true);view.setUint32(10,66,true);view.setUint32(14,40,true);view.setInt32(18,width,true);view.setInt32(22,topDown?-height:height,true);view.setUint16(26,1,true);view.setUint16(28,16,true);view.setUint32(30,3,true);view.setUint32(34,stride*height,true);
 view.setUint32(54,0xf800,true);view.setUint32(58,0x07e0,true);view.setUint32(62,0x001f,true);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)view.setUint16(66+y*stride+x*2,[0xf800,0x07e0,0x001f][x%3],true);
 return bytes;
}
function change(bytes,mutate){const next=bytes.slice();mutate(new DataView(next.buffer),next);return next;}

test('RGB565 native BMP preflight accepts standard BITFIELDS, DWORD row padding and either row orientation',()=>{
 const topDown=bmp565();assert.equal(topDown.length,82,'3-pixel rows contain two padding bytes');
 assert.deepEqual(inspectBmp(topDown),{width:3,height:2});assert.deepEqual(inspectBmp(bmp565(3,2,false)),{width:3,height:2});
 const wrapped=new Uint8Array(topDown.length+20);wrapped.set(topDown,7);assert.deepEqual(inspectBmp(wrapped.subarray(7,7+topDown.length)),{width:3,height:2},'typed-array byteOffset is honored');
 assert.deepEqual(inspectBmp(bmp565(800,480)),{width:800,height:480},'actual S3 display dimensions fit existing budgets');
});

test('RGB565 preflight rejects truncated/padded rows, ambiguous RGB555 and malformed mask/header declarations',()=>{
 const bytes=bmp565();
 const bad=[
  change(bytes,view=>view.setUint32(30,0,true)), // BI_RGB16 is ambiguous RGB555.
  change(bytes,view=>view.setUint32(54,0x7c00,true)),
  change(bytes,view=>view.setUint32(58,0x03e0,true)),
  change(bytes,view=>view.setUint32(62,0x07e0,true)), // overlapping masks.
  change(bytes,view=>view.setUint32(10,54,true)), // pixels overlap masks.
  change(bytes,view=>view.setUint32(14,56,true)), // unsupported DIB shape.
  change(bytes,view=>view.setUint32(34,12,true)), // omits DWORD row padding.
  change(bytes,view=>view.setUint32(2,bytes.length+1,true)),
  change(bytes,view=>view.setUint16(26,2,true)),
  change(bytes,view=>view.setInt32(22,0,true)),
  change(bytes,view=>view.setUint16(28,1,true)), // no unrequested mono extension.
  change(bytes.subarray(0,80),view=>view.setUint32(2,80,true)) // valid bfSize cannot hide missing final padding.
 ];
 for(const frame of bad)assert.throws(()=>inspectBmp(frame),/frame_bmp_format/);
 assert.throws(()=>inspectBmp(change(bytes.subarray(0,63),view=>view.setUint32(2,63,true))),/frame_bmp_format/,'incomplete mask table is rejected safely');
 assert.throws(()=>inspectBmp(change(bytes,view=>view.setInt32(18,frameLimits.pixels,true))),/frame_bmp_format/);
});

test('Windows BI_RGB32 remains supported and malformed image length is rejected before browser decode',()=>{
 const bytes=new Uint8Array(54+5*4*2),view=new DataView(bytes.buffer);bytes.set([0x42,0x4d]);view.setUint32(2,bytes.length,true);view.setUint32(10,54,true);view.setUint32(14,40,true);view.setInt32(18,5,true);view.setInt32(22,-2,true);view.setUint16(26,1,true);view.setUint16(28,32,true);
 assert.deepEqual(inspectBmp(bytes),{width:5,height:2},'BI_RGB permits biSizeImage=0');view.setUint32(34,40,true);assert.deepEqual(inspectBmp(bytes),{width:5,height:2});
 view.setUint32(34,39,true);assert.throws(()=>inspectBmp(bytes),/frame_bmp_format/);
 assert.throws(()=>inspectBmp(new Uint8Array(frameLimits.inputBytes+1)),/frame_input_size_limit/);
});


const warming=(error='frame_warming_up',retry='1')=>new Response(JSON.stringify({error}),{status:503,headers:{'Content-Type':'application/json','Retry-After':retry}});
const frameResponse=()=>new Response(bmp565(),{headers:{'Content-Type':'image/bmp'}});
test('frame GET retries only explicit warming/busy responses and preserves the single request sequence',async()=>{
 const replies=[warming(),warming('frame_busy'),frameResponse()],requests=[],waits=[];
 const bytes=await fetchFrameBmp(async(url,options)=>{requests.push({url,options});return replies.shift();},'http://target.test:5299',{delay:async(ms,signal)=>{signal.throwIfAborted();waits.push(ms);}});
 assert.deepEqual(requests.map(request=>request.options.method),['GET','GET','GET']);assert.ok(requests.every(request=>request.url==='http://target.test:5299/api/view/frame'));assert.deepEqual(waits,[1000,1000]);assert.deepEqual(inspectBmp(bytes),{width:3,height:2});
});
test('frame GET retry is bounded; other errors, missing retry headers and long Retry-After are not retried',async()=>{
 let requests=0;await assert.rejects(fetchFrameBmp(async()=>{requests++;return warming();},'http://target.test:5299',{delay:async()=>{}}),/frame_warming_up/);assert.equal(requests,3,'initial GET plus two retries only');
 for(const response of [warming('capture_unavailable'),warming('frame_warming_up','2'),warming('frame_busy','Wed, 10 Nov 2026 10:00:00 GMT'),new Response('{"error":"frame_warming_up"}',{status:503,headers:{'Content-Type':'application/json'}}),new Response('unavailable',{status:503}),new Response('{"error":"frame_warming_up"}',{status:500,headers:{'Content-Type':'application/json','Retry-After':'1'}})]){
  let count=0;await assert.rejects(fetchFrameBmp(async()=>{count++;return response;},'http://target.test:5299'),/HTTP/);assert.equal(count,1);
 }
});
test('cancel during frame warm-up wait issues no second GET and one shared deadline bounds the whole sequence',async()=>{
 const stop=new AbortController();let count=0,waiting;const began=new Promise(done=>waiting=done);
 const task=fetchFrameBmp(async()=>{count++;return warming();},'http://target.test:5299',{signal:stop.signal,delay:(ms,signal)=>{waiting();return frameDelay(ms,signal);}});await began;stop.abort();await assert.rejects(task);assert.equal(count,1);
 const deadline=new AbortController();let attempts=0;
 await assert.rejects(fetchFrameBmp(async()=>{attempts++;return warming();},'http://target.test:5299',{signal:deadline.signal,delay:async(ms,signal)=>{deadline.abort(Error('Single capture deadline'));signal.throwIfAborted();}}),/Single capture deadline/);assert.equal(attempts,1,'the retry loop does not reset the caller deadline');
});
