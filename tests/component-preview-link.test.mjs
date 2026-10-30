// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {encode} from 'cborg';
import {ComponentPreviewLink} from '../frontend/src/component-preview-link.js';
import {decodeScreenPacket,screenContract} from '../packages/screen-codec/index.js';
import {createNode,SCREEN_FORMAT} from '../frontend/src/screen-model.js';

function setup(t){
 const previous=globalThis.WebSocket,sockets=[];
 class Socket{
  readyState=0;sent=[];
  constructor(url){this.url=url;sockets.push(this);queueMicrotask(()=>{this.readyState=1;this.onopen?.({});});}
  send(bytes){this.sent.push(decodeScreenPacket(bytes));}
  close(){this.readyState=3;this.onclose?.({});}
  ack({id=this.sent.at(-1).get('id'),ok=true,abi=screenContract.sha256}={}){const bytes=encode(new Map([['v',1],['id',id],['ok',ok],['abi',abi],['error',ok?'':'test error'],['bounds',[0,0,420,150]],['frame_count',1]]));this.onmessage?.({data:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});}
 }
 globalThis.WebSocket=Socket;
 let type='label';const applied=[],states=[];
 const document=()=>({format:SCREEN_FORMAT,id:'preview',name:'Preview',size:{width:800,height:480},styles:{},root:{id:'preview-root',type:'obj',children:[createNode(type,'sample')]}});
 const client=new ComponentPreviewLink({document,origin:()=> 'http://127.0.0.1:5298',limit:()=>3584,busy:state=>states.push(state),applied:(ack,doc)=>applied.push(doc.root.children[0].type)});
 t.after(()=>{client.invalidate();globalThis.WebSocket=previous;});
 return {client,sockets,applied,states,setType:value=>type=value};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('component creation waits for the newest type instead of applying a style to an obsolete widget',async t=>{
 const s=setup(t),first=s.client.ensureLatest();await tick();
 assert.equal(s.sockets.length,1);assert.equal(s.sockets[0].sent.length,1);
 s.setType('slider');const second=s.client.ensureLatest();
 s.sockets[0].ack();await tick();
 assert.equal(s.sockets[0].sent.length,2);
 s.sockets[0].ack();const [a,b]=await Promise.all([first,second]);
 assert.equal(a,b);assert.equal(s.client.isReady(),true);assert.deepEqual(s.applied,['label','slider']);
 assert.deepEqual(s.states,[true,false,true,false]);
 s.sockets[0].ack({id:'another-editor'});assert.equal(s.client.isReady(),false,'another editor replaced the physical target');
});
test('component ACK must match request and ABI, and cancellation rejects the pending operation',async t=>{
 const s=setup(t),first=s.client.ensureLatest();await tick();
 const invalid=assert.rejects(first,/ABI mismatch/);
 s.sockets[0].ack({id:'other'});assert.ok(s.client.pending);
 s.sockets[0].ack({abi:'wrong'});await invalid;assert.equal(s.client.isReady(),false);
 const pending=s.client.ensureLatest();const cancelled=assert.rejects(pending,/cancelled/);s.client.invalidate();await cancelled;
});
