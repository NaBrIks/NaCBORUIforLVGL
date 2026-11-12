// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import layout from '../prompts/assistant-layout-reference.md?raw';
import styles from '../prompts/assistant-styles-reference.md?raw';
import example from '../../../examples/screens/agent-grid-controls.json';
import {createBrowserTools} from './tools.js';
import {nativeFetcher,targetOrigin} from './http.js';
import {readNativeFrame} from '../../../packages/project-codec/progressive-frame.js';
import {createFrameSurface} from '../../../packages/project-codec/frame-surface.js';
import {createPreviewFrameSource} from './frame.js';
import {socketFrameFetcher} from './frame-socket.js';
import {connectTDisplayUsb} from './t-display-usb.js';
let current=null,generation=0;
export async function connect(request,sendHttp){
 dispose();let previewFrame;const send=typeof sendHttp==='function'?sendHttp:Object.assign(req=>sendHttp.invokeMethodAsync('SendHttp',req),{cancel:id=>sendHttp.invokeMethodAsync('CancelHttp',id),begin:req=>sendHttp.invokeMethodAsync('BeginHttpStream',req),read:(id,size)=>sendHttp.invokeMethodAsync('ReadHttpStream',id,size)});const expected=generation,origin=targetOrigin(request.origin),fetcher=nativeFetcher(origin,send),next=createBrowserTools({origin,fetcher,references:{screen:layout,style:styles},example,getPreviewFrame:(args,signal)=>previewFrame?.available?previewFrame.read(args,signal):undefined});
 const result=await next.connect();
 if(expected!==generation){next.dispose();throw Error('Direct target connection superseded');}
 const device=result.device,packets=device?.native_view_packets===true?(device.native_view_packet_version===2?2:1):false,interval=device?.native_view_interval_ms;
 const refreshInterval=Number.isInteger(interval)&&interval>=200&&interval<=60000
  ? interval : packets||device?.native_view_delta===true ? 1000 : 0;
 const socket=device?.native_view_ws===true&&packets===2&&typeof sendHttp!=='function'?socketFrameFetcher(sendHttp):null;
 const closeSocket=socket?()=>sendHttp.invokeMethodAsync('AbortFrameSocket',0):null;
 current={browser:next,fetcher,origin,packets,socket,closeSocket,supports:device?.native_view===true,wsOnly:device?.native_view_ws_only===true,refreshInterval,setPreviewFrame:source=>{previewFrame=source;}};
 return result;
}
export async function connectUsb(bridge) {
 dispose();
 const expected=generation, usb=await connectTDisplayUsb(bridge);
 if(expected!==generation){usb.dispose();throw Error('USB connection superseded');}
 current={browser:usb,usb,supports:true,refreshInterval:usb.metadata.device.viewState?350:0};
 return usb.metadata;
}
export async function call(name,args={},callId){if(!current)throw Error('Direct target is not connected');return current.browser.call(name,args,callId);}
export function cancelCall(callId){return current?.browser.cancelCall(callId)??false;}
export function progressivePreviewAvailable(){return current?.supports===true;}
export function closeFrameSocket(){return current?.closeSocket?.();}
export function nativeFrameRefreshInterval(websocket){return current?.supports?(websocket&&current.socket?1:current.refreshInterval):0;}
export async function captureNativeFrame({websocket=false,...options}={}){
 if(!current?.supports)throw Error('display_capture_unavailable');
 if(current.usb)return current.usb.capture(options);
 const fetcher=websocket||current.wsOnly?current.socket:current.fetcher;
 if(!fetcher)throw Error('frame_socket_unavailable');
 return readNativeFrame(fetcher,current.origin,{...options,since:current.wsOnly&&options.force?undefined:options.since,packets:current.packets});
}
export {createFrameSurface};
export function registerPreviewFrame(surface) {
 const source=createPreviewFrameSource(surface);
 current?.setPreviewFrame?.(source);
 return source;
}
export function dispose(){generation++;current?.browser.dispose();current=null;}

export {bindPreviewPointer} from '../../../packages/project-codec/native-pointer.js';
