// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {bytesToBase64} from './http.js';
import {inspectBmp,frameLimits,frameAwait} from '../../../packages/project-codec/native-frame.js';
export {inspectBmp,frameLimits,fetchFrameBmp,frameDelay,frameAwait} from '../../../packages/project-codec/native-frame.js';
export function isAfterScene(scene, previous) {
 if (!Number.isInteger(scene)) return false;
 const distance = (scene - previous) >>> 0;
 return distance !== 0 && distance < 0x80000000;
}

export function createPreviewFrameSource(surface) {
 let latest, closed = false, wake;
 let updated = new Promise(resolve => { wake = resolve; });
 return {
  get available() { return !closed; },
  commit({width,height,scene,revision}) {
   if (closed) return;
   latest = {width,height,scene,revision,capturedAt:Date.now()};
   wake();
   updated = new Promise(resolve => { wake = resolve; });
  },
  close() {
   closed = true;
   wake();
  },
  async read({fresh=false,afterScene,maxEdge}, signal, encode=canvasFrame) {
   const previous = latest;
   while (!closed) {
    signal.throwIfAborted();
    if (latest && (!fresh || latest !== previous) && (afterScene === undefined || isAfterScene(latest.scene,afterScene))) {
     const frame = latest;
     const image = await frameAwait(encode(frame, maxEdge, (ctx,w,h) => surface.drawCompleted(ctx,w,h)), signal);
     if (closed) break;
     return {...image,source:'preview',frameRevision:frame.revision,scene:frame.scene,capturedAt:frame.capturedAt};
    }
    await frameAwait(updated, signal);
   }
   throw Error('preview_frame_source_changed');
  }
 };
}

async function canvasFrame(original, maxEdge=1024, draw) {
 if(!Number.isInteger(maxEdge)||maxEdge<128||maxEdge>1024)throw Error('frame_max_edge');
 const scale=Math.min(1,maxEdge/Math.max(original.width,original.height));
 const width=Math.max(1,Math.round(original.width*scale)),height=Math.max(1,Math.round(original.height*scale));
 const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):Object.assign(document.createElement('canvas'),{width,height});
 const context=canvas.getContext('2d');
 if(!context)throw Error('frame_canvas_unavailable');
 draw(context,width,height);
 const png=canvas.convertToBlob?await canvas.convertToBlob({type:'image/png'}):await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('frame_png_failed')),'image/png'));
 if(png.size>frameLimits.pngBytes)throw Error('frame_png_size_limit');
 return {data:bytesToBase64(new Uint8Array(await png.arrayBuffer())),mimeType:'image/png',width,height,originalWidth:original.width,originalHeight:original.height,bytes:png.size};
}

export async function browserFrame(bytes,{maxEdge=1024}={}){
 const original=inspectBmp(bytes),bitmap=await createImageBitmap(new Blob([bytes],{type:'image/bmp'}));
 try {
  return await canvasFrame(original,maxEdge,(context,width,height)=>context.drawImage(bitmap,0,0,width,height));
 } finally {
  bitmap.close();
 }
}
