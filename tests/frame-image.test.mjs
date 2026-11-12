// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {encodeFrameImage,encodeRawFrame,FRAME_IMAGE_LIMITS} from '../packages/document-io/frame-image.js';

function bitmap(width,height,{bits=32,topDown=true,offset=54,pixel=(x,y)=>[x*11,y*17,123,0]}={}){
 const channels=bits/8,stride=Math.ceil(width*channels/4)*4,bytes=Buffer.alloc(offset+stride*height,0x7c);
 bytes.fill(0,0,54);bytes.write('BM');bytes.writeUInt32LE(bytes.length,2);bytes.writeUInt32LE(offset,10);bytes.writeUInt32LE(40,14);
 bytes.writeInt32LE(width,18);bytes.writeInt32LE(topDown?-height:height,22);bytes.writeUInt16LE(1,26);bytes.writeUInt16LE(bits,28);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const [r,g,b,a=0]=pixel(x,y),at=offset+(topDown?y:height-1-y)*stride+x*channels;
  bytes[at]=b;bytes[at+1]=g;bytes[at+2]=r;if(bits===32)bytes[at+3]=a;
 }
 return bytes;
}
// Independent bit-at-a-time CRC verifies every produced chunk, including type.
function crc(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;}return (value^0xffffffff)>>>0;}
function png(bytes){
 assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 const chunks=[];let offset=8;
 while(offset<bytes.length){
  const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+length);
  assert.equal(bytes.readUInt32BE(offset+8+length),crc(bytes.subarray(offset+4,offset+8+length)),type+' CRC');chunks.push({type,data});offset+=length+12;
 }
 assert.equal(offset,bytes.length);assert.deepEqual(chunks.map(c=>c.type),['IHDR','IDAT','IEND']);assert.equal(chunks[2].data.length,0);
 const header=chunks[0].data;assert.equal(header.length,13);assert.deepEqual([...header.subarray(8)],[8,2,0,0,0]);
 const width=header.readUInt32BE(0),height=header.readUInt32BE(4),rowBytes=width*3+1;
 const raw=inflateSync(chunks[1].data,{maxOutputLength:rowBytes*height});assert.equal(raw.length,rowBytes*height);
 const rows=[];for(let y=0;y<height;y++){assert.equal(raw[y*rowBytes],0);rows.push([...raw.subarray(y*rowBytes+1,(y+1)*rowBytes)]);}
 return {width,height,rows};
}

test('native top-down32 BGRX becomes RGB PNG; X is ignored and every chunk CRC is valid',()=>{
 const colors=[[[255,0,0,0],[0,255,0,77]],[[0,0,255,255],[17,33,49,0]]],bmp=bitmap(2,2,{pixel:(x,y)=>colors[y][x]}),before=Buffer.from(bmp);
 const image=encodeFrameImage(bmp),decoded=png(image.bytes);
 assert.deepEqual(decoded,{width:2,height:2,rows:[[255,0,0,0,255,0],[0,0,255,17,33,49]]});
 assert.deepEqual({width:image.width,height:image.height,originalWidth:image.originalWidth,originalHeight:image.originalHeight,mimeType:image.mimeType},{width:2,height:2,originalWidth:2,originalHeight:2,mimeType:'image/png'});
 assert.deepEqual(bmp,before,'encoder must not mutate input');assert.ok(Buffer.isBuffer(image.bytes));
});
test('bottom-up24 reverses rows and ignores BMP row padding and a bounded header gap',()=>{
 const bmp=bitmap(1,3,{bits:24,topDown:false,offset:62,pixel:(x,y)=>[10+y,20+y,30+y]});bmp.writeUInt32LE(12,34);
 assert.deepEqual(png(encodeFrameImage(bmp).bytes).rows,[[10,20,30],[11,21,31],[12,22,32]]);
});
test('bottom-up32 and nonzero Uint8Array byte offsets use the declared frame only',()=>{
 const bmp=bitmap(2,2,{topDown:false,pixel:(x,y)=>[x*80,y*90,42,255]}),wrapped=Buffer.alloc(bmp.length+12,91);bmp.copy(wrapped,7);
 const view=new Uint8Array(wrapped.buffer,wrapped.byteOffset+7,bmp.length);
 assert.deepEqual(png(encodeFrameImage(view).bytes).rows,[[0,0,42,80,0,42],[0,90,42,80,90,42]]);
});
test('nearest resize preserves aspect, uses source pixel centers and never upscales',()=>{
 const image=encodeFrameImage(bitmap(8,4,{pixel:(x,y)=>[x,y,0]}),{maxEdge:4});
 assert.deepEqual([image.width,image.height,image.originalWidth,image.originalHeight],[4,2,8,4]);
 assert.deepEqual(png(image.bytes).rows,[[1,1,0,3,1,0,5,1,0,7,1,0],[1,3,0,3,3,0,5,3,0,7,3,0]]);
 const tall=encodeFrameImage(bitmap(1,8),{maxEdge:3});assert.deepEqual([tall.width,tall.height],[1,3]);
 const unchanged=encodeFrameImage(bitmap(3,2));assert.deepEqual([unchanged.width,unchanged.height],[3,2]);
 const large=encodeFrameImage(bitmap(1600,800));assert.deepEqual([large.width,large.height],[1024,512]);
});
test('unsupported or corrupt BMP headers, dimensions, sizes and pixel extents are rejected',()=>{
 const changes=[b=>b[0]=0,b=>b.writeUInt32LE(124,14),b=>b.writeUInt16LE(1,6),b=>b.writeUInt16LE(2,26),b=>b.writeUInt16LE(16,28),b=>b.writeUInt32LE(3,30),b=>b.writeInt32LE(0,18),b=>b.writeInt32LE(-1,18),b=>b.writeInt32LE(0,22),b=>b.writeInt32LE(-2147483648,22),b=>b.writeUInt32LE(0,2),b=>b.writeUInt32LE(0,10),b=>b.writeUInt32LE(b.length+1,10),b=>b.writeUInt32LE(1,34),b=>b.writeInt32LE(3,18)];
 for(const change of changes){const bmp=bitmap(2,2);change(bmp);assert.throws(()=>encodeFrameImage(bmp),/frame_bmp_/);}
 const truncated=bitmap(2,2).subarray(0,60);truncated.writeUInt32LE(truncated.length,2);assert.throws(()=>encodeFrameImage(truncated),/pixel_extent/);
 assert.throws(()=>encodeFrameImage(new Uint8Array(53)),/header_truncated/);assert.throws(()=>encodeFrameImage('BM'),/bytes_required/);
});
test('input/pixel/edge limits reject before frame-sized allocations; supported limits are fixed',()=>{
 assert.equal(FRAME_IMAGE_LIMITS.inputBytes,8*1024*1024+54);assert.equal(FRAME_IMAGE_LIMITS.pixels,2*1024*1024);assert.equal(FRAME_IMAGE_LIMITS.pngBytes,1024*1024);assert.ok(Object.isFrozen(FRAME_IMAGE_LIMITS));
 assert.throws(()=>encodeFrameImage(new Uint8Array(FRAME_IMAGE_LIMITS.inputBytes+1)),/input_limit/);
 const bmp=bitmap(1,1);bmp.writeInt32LE(FRAME_IMAGE_LIMITS.pixels+1,18);assert.throws(()=>encodeFrameImage(bmp),/pixel_limit/);
 for(const maxEdge of [0,-1,1.5,1025,'2',NaN,Infinity])assert.throws(()=>encodeFrameImage(bitmap(1,1),{maxEdge}),/edge_limit/);
});
test('incompressible screenshots over the1MiB PNG bound are rejected rather than clipped',()=>{
 let random=0x12345678;const next=()=>{random^=random<<13;random^=random>>>17;random^=random<<5;return random>>>0;};
 const bmp=bitmap(1024,1024,{pixel:()=>{const value=next();return [value&255,(value>>>8)&255,(value>>>16)&255];}});
 assert.throws(()=>encodeFrameImage(bmp),/frame_png_size_limit/);
});

test('Full HD native viewport stays within the exact native 2 Mi-pixel capture budget',()=>{
 const result=encodeFrameImage(bitmap(1920,1080,{pixel:()=>[32,64,96,0]}));assert.equal(result.width,1024);assert.equal(result.height,576);assert.equal(result.originalWidth,1920);assert.equal(result.originalHeight,1080);assert.ok(result.bytes.length<16384);
});


test('raw RGB565 little/big endian expand known colors and padded rows without conversion buffers',()=>{
 const expected=[[255,0,0,0,255,0,0,0,255],[0,0,0,255,255,255,132,130,132]];
 for(const [format,data] of [
  ['rgb565_le',[0,248,224,7,31,0,99,88,0,0,255,255,16,132,77,66]],
  ['rgb565_be',[248,0,7,224,0,31,99,88,0,0,255,255,132,16,77,66]]
 ]){
  const pixels=Uint8Array.from(data),before=Uint8Array.from(pixels),image=encodeRawFrame({width:3,height:2,stride:8,format,pixels});
  assert.deepEqual(png(image.bytes).rows,expected,format);assert.deepEqual(pixels,before);
  assert.deepEqual([image.width,image.height,image.originalWidth,image.originalHeight,image.mimeType],[3,2,3,2,'image/png']);
 }
});
test('raw monochrome MSB/LSB use 0 black/1 white, ignore unused bits and row padding',()=>{
 const rows=[[1,0,1,1,0,0,1,0,1,0],[0,1,0,0,1,1,0,1,0,1]],expected=rows.map(row=>row.flatMap(bit=>[bit*255,bit*255,bit*255]));
 for(const [format,data] of [
  ['mono1_msb',[0xb2,0xbf,0xff,0x4d,0x7f,0xff]],
  ['mono1_lsb',[0x4d,0xfd,0xff,0xb2,0xfe,0xff]]
 ]){
  const image=encodeRawFrame({width:10,height:2,stride:3,format,pixels:Uint8Array.from(data)});
  assert.deepEqual(png(image.bytes).rows,expected,format);
 }
});
test('raw RGB/BGR/BGRX channel readers accept byte-offset views and ignore padded stride/X',()=>{
 const colors=[[[255,0,0],[0,255,0]],[[0,0,255],[18,52,86]]],expected=[[255,0,0,0,255,0],[0,0,255,18,52,86]];
 for(const format of ['rgb888','bgr888','bgrx8888']){
  const channels=format==='bgrx8888'?4:3,stride=channels*2+2,storage=Buffer.alloc(stride*2+9,0xee),pixels=storage.subarray(5,5+stride*2);
  for(let y=0;y<2;y++)for(let x=0;x<2;x++){
   const [r,g,b]=colors[y][x],at=y*stride+x*channels;
   pixels[at]=format==='rgb888'?r:b;pixels[at+1]=g;pixels[at+2]=format==='rgb888'?b:r;
  }
  assert.deepEqual(png(encodeRawFrame({width:2,height:2,stride,format,pixels}).bytes).rows,expected,format);
 }
});
test('raw frames validate format, integer dimensions/stride and exact pixel extent before allocation',()=>{
 const valid={width:2,height:1,stride:4,format:'rgb565_le',pixels:new Uint8Array(4)};
 for(const frame of [undefined,null,[],{}, {...valid,pixels:'1234'},{...valid,pixels:new DataView(new ArrayBuffer(4))}])assert.throws(()=>encodeRawFrame(frame),/frame_raw_/);
 for(const format of ['rgb565','mono1','constructor','__proto__','',null,1])assert.throws(()=>encodeRawFrame({...valid,format}),/format_unsupported/);
 for(const width of [0,-1,1.5,NaN,Infinity,FRAME_IMAGE_LIMITS.pixels+1])assert.throws(()=>encodeRawFrame({...valid,width}),/pixel_limit/);
 for(const height of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER])assert.throws(()=>encodeRawFrame({...valid,height}),/pixel_limit/);
 for(const stride of [0,-1,3,4.5,NaN,Infinity,FRAME_IMAGE_LIMITS.inputBytes+1])assert.throws(()=>encodeRawFrame({...valid,stride}),/stride_invalid/);
 for(const length of [0,3,5])assert.throws(()=>encodeRawFrame({...valid,pixels:new Uint8Array(length)}),/pixel_extent/);
 assert.throws(()=>encodeRawFrame({...valid,pixels:new Uint8Array(FRAME_IMAGE_LIMITS.inputBytes+1)}),/input_limit/);
 assert.throws(()=>encodeRawFrame({width:9,height:1,stride:1,format:'mono1_msb',pixels:new Uint8Array(1)}),/stride_invalid/);
 for(const maxEdge of [0,-1,1.5,1025,'2',NaN,Infinity])assert.throws(()=>encodeRawFrame(valid,{maxEdge}),/edge_limit/);
});
test('raw RGB565/mono share aspect-preserving resize and accept the exact native pixel boundary',()=>{
 const rgb=encodeRawFrame({width:3,height:2,stride:6,format:'rgb565_le',pixels:Uint8Array.from([0,0,0,0,0,0,31,0,224,7,0,248])},{maxEdge:2});
 assert.deepEqual([rgb.width,rgb.height,rgb.originalWidth,rgb.originalHeight],[2,1,3,2]);assert.deepEqual(png(rgb.bytes).rows,[[0,0,255,255,0,0]]);
 const mono=encodeRawFrame({width:10,height:1,stride:2,format:'mono1_msb',pixels:Uint8Array.from([0xb2,0xbf])},{maxEdge:5});
 assert.deepEqual(png(mono.bytes).rows,[[0,0,0,255,255,255,0,0,0,0,0,0,0,0,0]]);
 const boundary=encodeRawFrame({width:2048,height:1024,stride:256,format:'mono1_msb',pixels:new Uint8Array(256*1024)});
 assert.equal(2048*1024,FRAME_IMAGE_LIMITS.pixels);assert.deepEqual([boundary.width,boundary.height],[1024,512]);assert.ok(boundary.bytes.length<16384);
});
