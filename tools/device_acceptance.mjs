// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {CommandChannel} from '../frontend/src/transport/command-channel.js';
import {encodeStyle} from '../packages/style-codec/index.js';
import {encodeScreen} from '../packages/screen-codec/index.js';
export async function readDeviceJson(origin,path){
 const response=await fetch(new URL(path,origin),{cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('HTTP '+response.status+' '+path);return response.json();
}
export async function applyDeviceDocument(origin,kind,document,capabilities,path=kind==='style'?'/ws':'/screen-ws'){
 const id='accept-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 const bytes=kind==='style'?encodeStyle(document,id,capabilities):encodeScreen(document,id,capabilities);
 const channel=new CommandChannel({origin:()=>origin,path});
 try{return Object.fromEntries(await channel.request(bytes,{id,timeout:15000}));}finally{channel.stop();}
}
