// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantImageLimits,imageDimensions,imageSize,validateImageFiles,prepareAssistantImage,uploadAssistantImages} from '../frontend/src/state/assistant-images.js';
const png=(width,height)=>{const bytes=new Uint8Array(24);bytes.set([137,80,78,71,13,10,26,10]);bytes.set([73,72,68,82],12);const view=new DataView(bytes.buffer);view.setUint32(16,width);view.setUint32(20,height);return bytes;};
test('attachment count, compressed file size and raster types are bounded',()=>{
 const file={type:'image/png',size:100};assert.equal(validateImageFiles([file],3).length,1);
 assert.throws(()=>validateImageFiles([file],4),/4 images/);assert.throws(()=>validateImageFiles([{...file,size:assistantImageLimits.inputBytes+1}]),/8 MiB/);
 for(const type of ['image/svg+xml','text/html','image/gif',''])assert.throws(()=>validateImageFiles([{...file,type}]),/PNG, JPEG or WebP/);
});
test('PNG header dimensions are checked before browser decoding',()=>{
 assert.deepEqual(imageDimensions(png(1920,1080),'image/png'),{width:1920,height:1080});
 assert.throws(()=>imageDimensions(png(16000,16000),'image/png'),/resolution/);assert.throws(()=>imageDimensions(png(0,100),'image/png'),/header/);
 assert.throws(()=>imageDimensions(png(100,100),'image/jpeg'),/header/);assert.throws(()=>imageDimensions(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),'image/png'),/header/);
});
test('JPEG segments and WebP header forms report actual dimensions',()=>{
 const jpeg=Uint8Array.from([255,216,255,224,0,4,0,0,255,192,0,8,8,4,0,7,128,0,255,217,0,0,0,0]);
 assert.deepEqual(imageDimensions(jpeg,'image/jpeg'),{width:1920,height:1024});
 const webp=new Uint8Array(30);webp.set(new TextEncoder().encode('RIFF'),0);webp.set(new TextEncoder().encode('WEBPVP8X'),8);new DataView(webp.buffer).setUint32(16,10,true);webp[24]=255;webp[25]=3;webp[27]=255;webp[28]=1;
 assert.deepEqual(imageDimensions(webp,'image/webp'),{width:1024,height:512});assert.throws(()=>imageDimensions(webp.subarray(0,24),'image/webp'),/header/);
});
test('output dimensions keep aspect ratio, fit a bound and avoid upscaling',()=>{
 assert.deepEqual(imageSize(1920,1080),{width:1024,height:576});assert.deepEqual(imageSize(800,1200),{width:683,height:1024});assert.deepEqual(imageSize(64,32),{width:64,height:32});
 assert.throws(()=>imageSize(0,10),/dimensions/);assert.throws(()=>imageSize(10,10,0),/dimensions/);
});
test('preparation rasterizes and reduces byte-heavy images while releasing the decoder',async()=>{
 const oldReader=globalThis.FileReader;
 globalThis.FileReader=class{async readAsDataURL(blob){this.result='data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload();}};
 let closed=false,encodes=0,draws=0;const file=new Blob([png(1920,1080)],{type:'image/png'});
 const image={width:1920,height:1080,close(){closed=true;}};
 const context={fillRect(){},drawImage(){draws++;}},canvas={getContext(){return context;},toBlob(done,type){encodes++;done(new Blob([new Uint8Array(encodes===1?assistantImageLimits.bytes+1:1024)],{type}));}};
 try{
  const output=await prepareAssistantImage(file,{decode:async()=>image,canvas:()=>canvas});
  assert.equal(output.mime,'image/jpeg');assert.equal(output.bytes,1024);assert.equal(output.width,768);assert.equal(output.height,432);assert.match(output.dataUrl,/^data:image\/jpeg;base64,/);assert.equal(encodes,2);assert.equal(draws,2);assert.equal(closed,true);
 }finally{globalThis.FileReader=oldReader;}
});
test('invalid headers never reach the browser decoder and decode failures preserve the caller draft',async()=>{
 let decodes=0;
 await assert.rejects(()=>prepareAssistantImage(new Blob(['<svg/>'],{type:'image/png'}),{decode:async()=>{decodes++;}}),/PNG, JPEG or WebP/);assert.equal(decodes,0);
 await assert.rejects(()=>prepareAssistantImage(new Blob([png(20,10)],{type:'image/png'}),{decode:async()=>{throw Error('Decoder rejected image');}}),/Decoder rejected/);
});
test('attachments use separate typed actions with ordered bounded chunks and UTF-8 names',async()=>{
 const calls=[],base64=Buffer.alloc(4000,1).toString('base64'),image={name:'Изображение'.repeat(20),mime:'image/jpeg',dataUrl:'data:image/jpeg;base64,'+base64};
 const client={async invoke(name,args){calls.push({name,args});return {state:'completed'};}};
 await uploadAssistantImages(client,[image],{}, {id:'test'});
 assert.equal(calls[0].name,'assistant.images_clear');assert.equal(calls[1].name,'assistant.image_begin');assert.equal(calls[1].args.size,base64.length);assert(Buffer.byteLength(calls[1].args.name)<=128);
 const chunks=calls.filter(call=>call.name==='assistant.image_chunk');assert.equal(chunks.length,3);assert.deepEqual(chunks.map(call=>call.args.offset),[0,2048,4096]);assert(chunks.every(call=>call.args.data.length<=2048));assert.equal(chunks.map(call=>call.args.data).join(''),base64);assert.equal(calls.at(-1).name,'assistant.image_commit');assert.equal(calls.at(-1).args.id,'test-0');
 assert(calls.every(call=>!call.name.includes('prompt')));
});
test('invalid or unconfirmed attachment commands never get retried or committed',async()=>{
 let calls=0;const invalid={mime:'image/svg+xml',dataUrl:'data:image/svg+xml;base64,AAAA'};
 await assert.rejects(()=>uploadAssistantImages({invoke(){calls++;}},[invalid],{}, {id:'test'}),/Invalid prepared/);assert.equal(calls,0);
 const image={name:'one',mime:'image/jpeg',dataUrl:'data:image/jpeg;base64,AAAA'};
 await assert.rejects(()=>uploadAssistantImages({async invoke(){calls++;return {state:'unconfirmed'};}},[image],{}, {id:'test'}),/unconfirmed/);assert.equal(calls,1);
 let active=true;const names=[];
 await assert.rejects(()=>uploadAssistantImages({async invoke(name){names.push(name);if(name==='assistant.image_chunk')active=false;return {state:'completed'};}},[image],{}, {id:'test',active(){if(!active)throw Error('cancelled');}}),/cancelled/);assert(!names.includes('assistant.image_commit'));
});
