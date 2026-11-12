// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {readBoundedDataJson} from './data-query.js';
export const frameLimits={inputBytes:8388662,pixels:2097152,pngBytes:1048576};
export function frameDelay(milliseconds,signal){
 signal?.throwIfAborted();return new Promise((resolve,reject)=>{
  let timer;const stop=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);reject(signal.reason??Error('Cancelled'));};
  timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve();},milliseconds);signal?.addEventListener('abort',stop,{once:true});
 });
}
export async function frameAwait(promise,signal){
 if(signal.aborted){Promise.resolve(promise).catch(()=>{});signal.throwIfAborted();}let stop;
 const cancelled=new Promise((_,reject)=>{stop=()=>reject(signal.reason??Error('Cancelled'));signal.addEventListener('abort',stop,{once:true});});
 try{return await Promise.race([promise,cancelled]);}finally{signal.removeEventListener('abort',stop);}
}
// The S3 capture is requested by GET and prepared by a later UI tick. Retry only
// those two explicit temporary states, at most twice, within the caller's single
// deadline. This is a bounded client pause, never HTTP server-side long polling.
export function frameRevision(value){
 if(typeof value!=='string'||!/^\d{1,10}$/.test(value)||Number(value)>0xffffffff)throw Error('frame_revision');
 return value;
}
export async function openFrameResponse(fetcher,origin,{since,packets=false,stream=false,signal=AbortSignal.timeout(15000),delay=frameDelay}={}){
 const query=new URLSearchParams();
 if(packets)query.set('packets',packets===2?'2':'1');
 if(since!=null)query.set('since',frameRevision(since));
 const url=origin+'/api/view/frame'+(query.size?'?'+query:'');
 for(let attempt=0;attempt<3;attempt++){
  signal.throwIfAborted();
  const response=await frameAwait(fetcher(url,{method:'GET',headers:{Accept:packets?'application/x-lvgl-frame, image/bmp':'image/bmp'},signal,redirect:'error',...(stream?{stream:true}:{})}),signal);
  if(response.status===204)return response;
  if(!response.ok){
   let code;
   if(response.status===503&&response.headers.get('Content-Type')?.split(';')[0].trim()==='application/json')code=(await frameAwait(readBoundedDataJson(response,512),signal))?.error;
   else void response.body?.cancel().catch(()=>{});
   const retry=response.headers.get('Retry-After')?.trim(),seconds=retry!==undefined&&/^\d{1,4}$/.test(retry)?Number(retry):NaN;
   if(attempt<2&&['frame_warming_up','frame_busy'].includes(code)&&seconds>=0&&seconds<=1){await delay(seconds*1000,signal);continue;}
   throw Error('Display frame HTTP '+response.status+(typeof code==='string'?': '+code:''));
  }
  const type=response.headers.get('Content-Type')?.split(';')[0].trim();
  if(response.status!==200||(type!=='image/bmp'&&!(packets&&type==='application/x-lvgl-frame'))){void response.body?.cancel().catch(()=>{});throw Error('frame_content_type');}
  const length=Number(response.headers.get('Content-Length'));if(length>frameLimits.inputBytes){void response.body?.cancel().catch(()=>{});throw Error('frame_input_size_limit');}
  return response;
 }
 throw Error('frame_retry_limit');
}
export async function fetchFrameBmp(fetcher,origin,{signal=AbortSignal.timeout(15000),delay=frameDelay,onHeaders}={}){
 const response=await openFrameResponse(fetcher,origin,{signal,delay});
 if(response.status===204)throw Error('frame_unexpected_unchanged');
  const reader=response.body?.getReader();if(!reader)throw Error('frame_body_missing');const chunks=[];let size=0;
  try{for(;;){signal.throwIfAborted();const {value,done}=await frameAwait(reader.read(),signal);if(done)break;size+=value.byteLength;if(size>frameLimits.inputBytes){await reader.cancel();throw Error('frame_input_size_limit');}chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  onHeaders?.(response.headers);
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
export function inspectBmpHeader(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<54||bytes.length>frameLimits.inputBytes)throw Error('frame_input_size_limit');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),width=view.getInt32(18,true),signedHeight=view.getInt32(22,true),height=Math.abs(signedHeight),offset=view.getUint32(10,true),bits=view.getUint16(28,true),compression=view.getUint32(30,true);
 if(bytes[0]!==0x42||bytes[1]!==0x4d||view.getUint32(14,true)!==40||width<1||height<1||width>8192||height>8192||width*height>frameLimits.pixels||view.getUint16(26,true)!==1)throw Error('frame_bmp_format');
 // Windows: BGRX8888 BI_RGB. S3: unconverted little-endian RGB565 with the
 // standard three external BITFIELDS masks after BITMAPINFOHEADER40.
 if(bits===16){
  if(compression!==3||bytes.length<66||offset!==66||view.getUint32(54,true)!==0xf800||view.getUint32(58,true)!==0x07e0||view.getUint32(62,true)!==0x001f)throw Error('frame_bmp_format');
 }else if(bits!==32||compression!==0||offset<54)throw Error('frame_bmp_format');
 const stride=Math.ceil(width*bits/32)*4,imageBytes=stride*height,declaredImage=view.getUint32(34,true),fileBytes=view.getUint32(2,true);
 if(fileBytes>frameLimits.inputBytes||offset+imageBytes>fileBytes||declaredImage!==imageBytes&&(bits===16||declaredImage!==0))throw Error('frame_bmp_format');
 return {width,height,offset,stride,bits,topDown:signedHeight<0,fileBytes};
}
export function inspectBmp(bytes){
 const header=inspectBmpHeader(bytes);
 if(header.fileBytes!==bytes.length)throw Error('frame_bmp_format');
 return {width:header.width,height:header.height};
}
