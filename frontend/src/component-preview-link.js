// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {encodeScreen,screenContract} from '@lvgl-cbor/screen-codec';
import {CommandChannel} from './transport/command-channel.js';

// Component readiness belongs to a device session as well as a description.
export class ComponentPreviewLink {
 constructor({document,origin,limit,busy,applied,capabilities=()=>null,bootId=()=>'',makeSocket}){
  Object.assign(this,{document,origin,limit,busy,applied,capabilities,bootId});
  this.ready='';this.pending=null;this.lastAck=null;this.sequence=0;this.generation=0;
  this.channel=new CommandChannel({origin,path:'/component-ws',makeSocket,onUnmatched:ack=>{if(ack.get('ok')===true)this.ready='';},validate:ack=>{if(ack.get('abi')!==screenContract.sha256)throw Error('Component ACK ABI mismatch');}});
 }
 key(){return JSON.stringify([this.origin(),this.bootId(),this.document()]);}
 isReady(){return this.ready===this.key();}
 async ensureLatest(){
  if(this.isReady())return this.lastAck;
  if(this.pending){await this.pending;return this.ensureLatest();}
  const doc=this.document(),key=this.key(),generation=this.generation;
  const bytes=encodeScreen(doc,'component-'+Date.now().toString(36)+'-'+this.sequence++,this.capabilities());
  if(bytes.length>this.limit())throw Error('Предпросмотр превышает лимит пакета МК');
  this.busy(true);
  const task=this.channel.request(bytes).then(ack=>{if(generation!==this.generation)throw Error('cancelled');this.ready=key;this.lastAck=ack;this.applied(ack,doc);return ack;});
  this.pending=task;
  try{await task;}finally{if(this.pending===task){this.pending=null;this.busy(false);}}
  return this.ensureLatest();
 }
 invalidate(){this.generation++;this.ready='';this.channel.stop();this.pending=null;this.busy(false);}
}
