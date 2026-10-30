// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {encode} from 'cborg';
import {CommandChannel} from '../frontend/src/transport/command-channel.js';
const wire=map=>{const bytes=encode(map);return {data:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};
function setup(options={}){
 const sockets=[];let origin='http://first.test:5298';
 const channel=new CommandChannel({...options,origin:()=>origin,path:'/ws',makeSocket:url=>{const socket={url,readyState:0,sent:[],send(bytes){this.sent.push(bytes);},close(){this.readyState=3;},open(){this.readyState=1;this.onopen?.();}};sockets.push(socket);return socket;}});
 return {channel,sockets,setOrigin:value=>origin=value};
}
test('commands ignore replies for other requests and reject malformed matching replies',async t=>{
 const s=setup();t.after(()=>s.channel.stop());
 const job=s.channel.request(encode({id:'mine'}));s.sockets[0].open();
 s.sockets[0].onmessage(wire(new Map([['v',1],['id','other'],['ok',true]])));assert.ok(s.channel.pending);
 const rejected=assert.rejects(job,/acknowledgement/);s.sockets[0].onmessage(wire(new Map([['id','mine'],['ok',true]])));await rejected;
});

test('unsolicited events share the command socket without consuming or failing an ACK',async t=>{
 const events=[],errors=[];const s=setup({onEvent:event=>events.push(event),onError:error=>errors.push(error)});t.after(()=>s.channel.stop());
 s.channel.open();s.sockets[0].open();const notification=wire(new Map([['v',1],['event','project_changed'],['revision','r2']]));
 s.sockets[0].onmessage(notification);assert.equal(events.length,1);assert.deepEqual(errors,[]);
 const job=s.channel.request(encode({id:'mine'}));s.sockets[0].onmessage(notification);assert.equal(s.channel.pending.id,'mine');assert.equal(events.length,2);
 s.sockets[0].onmessage(wire(new Map([['v',1],['id','mine'],['ok',true]])));assert.equal((await job).get('id'),'mine');
});
test('changing the device cancels the old request and reconnects to the new origin',async t=>{
 const s=setup();t.after(()=>s.channel.stop());
 const first=s.channel.request(encode({id:'first'}));s.sockets[0].open();const cancelled=assert.rejects(first,/cancelled/);
 s.channel.stop();s.setOrigin('http://second.test:5299');await cancelled;
 const second=s.channel.request(encode({id:'second'}));s.sockets[1].open();assert.equal(s.sockets[1].url,'ws://second.test:5299/ws');
 assert.equal(s.sockets[0].onmessage,null);
 s.sockets[1].onmessage(wire(new Map([['v',1],['id','second'],['ok',true]])));assert.equal((await second).get('id'),'second');
});
