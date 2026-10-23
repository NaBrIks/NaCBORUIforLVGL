import {decodePacket} from '@lvgl-cbor/style-codec';
import {ReconnectingSocket} from '../ws-link.js';

// A single request/reply lifecycle shared by styles, screens and component creation.
export class CommandChannel {
 constructor({origin,path,validate=()=>{},onUnmatched=()=>{},onEvent=()=>{},onState=()=>{},onError=()=>{},makeSocket,later=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}){
  Object.assign(this,{origin,path,validate,onUnmatched,onEvent,onState,onError,later,cancel});
  this.pending=null;
  this.link=new ReconnectingSocket({...(makeSocket?{makeSocket}:{}),later,cancel,onState:state=>{onState(state);if(state==='online'&&this.pending)this.link.send(this.pending.bytes);},onError,onMessage:event=>this.receive(event)});
 }
 open(){const url=new URL(this.origin());url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname=this.path;if(!this.link.active||this.link.url!==String(url))this.link.start(String(url));}
 request(bytes,{id=decodePacket(bytes,32768).get('id'),timeout=10000}={}){
  if(this.pending)return Promise.reject(Error('Command already pending'));
  return new Promise((resolve,reject)=>{
   const job={id,bytes,resolve,reject};this.pending=job;
   job.timer=this.later(()=>this.finish(Error('Нет подтверждения за '+timeout/1000+' с')),timeout);
   try{const online=this.link.socket?.readyState===1,oldUrl=this.link.url;this.open();if(online&&oldUrl===this.link.url&&!this.link.send(bytes))throw Error('WS send failed');}catch(error){this.finish(error);}
  });
 }
 receive(event){
  try{
   if(typeof event.data==='string')throw Error(event.data);
   if(!(event.data instanceof ArrayBuffer))throw Error('Binary CBOR expected');
   const ack=decodePacket(new Uint8Array(event.data),32768);
   if(!(ack instanceof Map))throw Error('Acknowledgement map');
   if(ack.get('v')===1&&typeof ack.get('event')==='string'&&!ack.has('id')){this.onEvent(ack);return;}
   if(ack.get('id')!==this.pending?.id){this.onUnmatched(ack);return;}
   if(ack.get('v')!==1||typeof ack.get('ok')!=='boolean')throw Error('Invalid acknowledgement');
   this.validate(ack);
   if(!ack.get('ok'))throw Error((ack.get('node')?'Узел '+ack.get('node')+': ':'')+(ack.get('error')||'Command rejected'));
   this.finish(null,ack);
  }catch(error){if(this.pending)this.finish(error);else this.onError(error.message);}
 }
 finish(error,ack){const job=this.pending;if(!job)return;this.pending=null;this.cancel(job.timer);if(error)job.reject(error);else job.resolve(ack);}
 stop(){this.finish(Error('cancelled'));this.link.stop();}
}
