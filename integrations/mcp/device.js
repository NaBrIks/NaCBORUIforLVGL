// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {decodePacket} from '../../packages/style-codec/index.js';
import {serializeDocument} from '../../packages/document-io/index.js';
import {contract} from '../../packages/style-codec/contract.js';
import {screenContract} from '../../packages/screen-codec/contract.js';
import {randomUUID} from 'node:crypto';
import {ProjectClient} from '../../packages/project-codec/client.js';
import {DataClient} from '../../packages/project-codec/data-client.js';
import {encodeFrameImage,FRAME_IMAGE_LIMITS} from './frame-image.js';

export class DeviceClient {
 constructor(origin,{fetcher=fetch,makeSocket=url=>new WebSocket(url),timeout=6000}={}){
  const url=new URL(origin);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Device must be an HTTP origin without credentials or path');
  this.origin=url.origin;this.makeSocket=makeSocket;this.timeout=timeout;this.busy=false;
  // Tool turns can outlive a device's unadvertised idle timeout. One-shot
  // requests avoid stale-socket races; never automatically replay mutations.
  this.fetcher=(input,options={})=>{const headers=new Headers(options.headers);headers.set('Connection','close');return fetcher(input,{...options,headers});};
  this.project=new ProjectClient(this.origin,{fetcher:this.fetcher,timeout});
  this.data=new DataClient(this.origin,{fetcher:this.fetcher,timeout});
 }
 async json(path){const response=await this.fetcher(this.origin+path,{signal:AbortSignal.timeout(this.timeout),redirect:'error'});if(!response.ok)throw Error('Device HTTP '+response.status);const text=await response.text();if(text.length>262144)throw Error('Device response too large');return JSON.parse(text);}
 async info(){return this.json('/api/info');}
 async capabilities(){const [info,caps]=await Promise.all([this.info(),this.json('/api/capabilities')]);
  if(info.source!=='device'||caps.format!=='lvgl-cbor-capabilities-1'||caps.style?.sha256!==contract.sha256||info.contract_sha256!==contract.sha256||caps.screen?.sha256!==screenContract.sha256||info.screen_contract_sha256!==screenContract.sha256||!Array.isArray(caps.style?.methods)||!caps.limits||!Array.isArray(caps.resources)||!Array.isArray(caps.availableWidgets))throw Error('Device ABI/capabilities mismatch');return caps;
 }
 async displayFrame({maxEdge=1024}={}){
  const info=await this.info();if(info.native_view!==true)throw Error('display_capture_unavailable: device does not advertise native_view');
  const response=await this.fetcher(this.origin+'/api/view/frame',{headers:{Accept:'image/bmp'},redirect:'error',signal:AbortSignal.timeout(this.timeout)});
  if(!response.ok){await response.body?.cancel();throw Error('Display frame HTTP '+response.status);}
  const length=Number(response.headers.get('Content-Length'));
  if(length>FRAME_IMAGE_LIMITS.inputBytes){await response.body?.cancel();throw Error('frame_input_size_limit');}
  if(response.headers.get('Content-Type')?.split(';')[0]!=='image/bmp'){await response.body?.cancel();throw Error('frame_content_type');}
  const reader=response.body?.getReader();if(!reader)throw Error('frame_body_missing');const chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>FRAME_IMAGE_LIMITS.inputBytes){await reader.cancel();throw Error('frame_input_size_limit');}chunks.push(value);}}
  finally{reader.releaseLock();}
  return encodeFrameImage(Buffer.concat(chunks,size),{maxEdge});
 }
 async apply(kind,document){
  if(this.busy)throw Error('Device command pending');this.busy=true;
  try{
   const capabilities=await this.capabilities(),id='mcp-'+randomUUID(),bytes=serializeDocument(kind,document,'cbor',{capabilities,requestId:id});
   const url=new URL(this.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname=kind==='screen'?'/screen-ws':'/ws';
   return await new Promise((resolve,reject)=>{
    let socket,settled=false;const finish=(error,ack)=>{if(settled)return;settled=true;clearTimeout(timer);socket?.close();if(error)reject(error);else resolve(ack);},timer=setTimeout(()=>finish(Error('Device ACK timeout')),this.timeout);
    try{socket=this.makeSocket(String(url));socket.binaryType='arraybuffer';socket.onopen=()=>socket.send(bytes);
     socket.onerror=()=>finish(Error('Device WebSocket error'));
     socket.onclose=()=>finish(Error('Device closed before ACK'));
     socket.onmessage=event=>{try{if(!(event.data instanceof ArrayBuffer))throw Error(String(event.data));const ack=decodePacket(new Uint8Array(event.data),32768);if(ack.get('id')!==id)return;
      if(ack.get('v')!==1||(kind==='screen'?ack.get('abi'):ack.get('contract_sha256'))!==(kind==='screen'?screenContract.sha256:contract.sha256))throw Error('ACK ABI mismatch');
      if(ack.get('ok')!==true)throw Error((ack.get('node')??'')+' opcode '+(ack.get('opcode')??'?')+': '+ack.get('error'));finish(null,Object.fromEntries([...ack].filter(([key])=>key!=='echo')));
     }catch(e){finish(e);}};
    }catch(e){finish(e);}
   });
  }finally{this.busy=false;}
 }
}
