// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Browser-only byte transport. C# owns HTTP; no server or Node runtime is involved.
export function bytesToBase64(bytes){let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);}
export function base64ToBytes(text,maxBytes=8388662){
 if(typeof text!=='string'||text.length>Math.ceil(maxBytes/3)*4||text.length%4!==0||/[^A-Za-z0-9+/=]/.test(text))throw Error('Invalid or oversized HTTP body');
 const raw=atob(text);if(raw.length>maxBytes)throw Error('HTTP body limit');return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
export function targetOrigin(value){const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Target must be an HTTP origin without credentials or path');return url.origin;}
let nextRequest=0;
export function nativeFetcher(origin,sendHttp){
 const expected=targetOrigin(origin);if(typeof sendHttp!=='function')throw Error('Native HTTP callback required');
 return async(input,options={})=>{
  const url=new URL(String(input));if(url.origin!==expected||url.username||url.password)throw Error('Target origin mismatch');
  const budget=options.timeoutMs??15000;if(!Number.isInteger(budget)||budget<1||budget>65000)throw Error('Invalid HTTP timeout budget');
  const signal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(budget)]):AbortSignal.timeout(budget);signal.throwIfAborted();
  const body=options.body===undefined?undefined:typeof options.body==='string'?new TextEncoder().encode(options.body):options.body instanceof Uint8Array?options.body:new Uint8Array(options.body);
  const request={id:'direct-http-'+Date.now()+'-'+(++nextRequest),timeoutMs:budget,url:url.href,method:options.method??'GET',headers:Object.fromEntries(new Headers(options.headers)),...(body===undefined?{}:{body:bytesToBase64(body)})};
  let abort,streamOwned=false,remoteCancelled=false;const cancelRemote=()=>{if(remoteCancelled)return;remoteCancelled=true;try{Promise.resolve(sendHttp.cancel?.(request.id)).catch(()=>{});}catch{}};
  const cleanup=()=>signal.removeEventListener('abort',abort);
  const cancelled=new Promise((_,reject)=>{abort=()=>{cancelRemote();reject(signal.reason??Error('Cancelled'));};signal.addEventListener('abort',abort,{once:true});});
  try{
   if(options.stream&&sendHttp.begin&&sendHttp.read){
    const started=await Promise.race([Promise.resolve().then(()=>{signal.throwIfAborted();return sendHttp.begin(request);}),cancelled]);
    if(!started||!Number.isInteger(started.status)||started.status<200||started.status>599)throw Error('Invalid native HTTP stream response');
    if([204,205,304].includes(started.status)){cleanup();cancelRemote();return new Response(null,{status:started.status,headers:started.headers??{}});}
    streamOwned=true;
    let closed=false,received=0;
    const body=new ReadableStream({
     async pull(controller){
      if(closed)return;
      try{
       signal.throwIfAborted();
       const part=await Promise.race([sendHttp.read(started.streamId,16384),cancelled]);
       if(part.done){closed=true;cleanup();controller.close();return;}
       const bytes=base64ToBytes(part.body??'',16384);received+=bytes.byteLength;if(received>8388662)throw Error('HTTP body limit');
       controller.enqueue(bytes);
      }catch(error){closed=true;cleanup();cancelRemote();controller.error(error);}
     },
     cancel(){closed=true;cleanup();cancelRemote();}
    });
    return new Response(body,{status:started.status,headers:started.headers??{}});
   }
   const response=await Promise.race([Promise.resolve().then(()=>{signal.throwIfAborted();return sendHttp(request);}),cancelled]);
   if(!response||!Number.isInteger(response.status)||response.status<200||response.status>599)throw Error('Invalid native HTTP response');
   const bytes=base64ToBytes(response.body??'');return new Response([204,205,304].includes(response.status)?null:bytes,{status:response.status,headers:response.headers??{}});
  }finally{if(!streamOwned)cleanup();}
 };
}
