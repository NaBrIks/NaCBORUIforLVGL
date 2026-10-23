import test from 'node:test';import assert from 'node:assert/strict';
import {ReconnectingSocket} from '../frontend/src/ws-link.js';
function rig(make){
 let clock=0,id=0;const timers=new Map(),sockets=[],states=[],messages=[];
 const link=new ReconnectingSocket({makeSocket:url=>{if(make)make();const socket={url,readyState:0,sent:[],send(bytes){this.sent.push(bytes)},close(){this.readyState=3}};sockets.push(socket);return socket},onState:state=>states.push(state),onMessage:event=>messages.push(event),later:(fn,delay)=>{timers.set(++id,{fn,at:clock+delay});return id},cancel:key=>timers.delete(key)});
 const next=()=>{const [key,value]=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];timers.delete(key);const elapsed=value.at-clock;clock=value.at;value.fn();return elapsed;};
 const open=socket=>{socket.readyState=1;socket.onopen()};
 return {link,timers,sockets,states,messages,next,open};
}
test('unexpected close reconnects and stale socket events cannot affect the new one',()=>{
 const r=rig();r.link.start('ws://device/ws');r.open(r.sockets[0]);const stale=r.sockets[0].onmessage;
 assert(r.link.send(new Uint8Array([1])));r.sockets[0].onclose({code:1006});assert.equal(r.next(),1000);r.open(r.sockets[1]);
 stale({data:'stale'});r.sockets[1].onmessage({data:'current'});assert.deepEqual(r.messages,[{data:'current'}]);assert.equal(r.states.at(-1),'online');
});
test('explicit stop cancels reconnect and ignores delayed open events',()=>{
 const r=rig();r.link.start('ws://device/ws');const stale=r.sockets[0].onopen;r.sockets[0].onclose({code:1006});r.link.stop();stale();
 assert.equal(r.timers.size,0);assert.equal(r.states.at(-1),'stopped');assert(!r.link.active);assert(!r.link.send(new Uint8Array([1])));
});
test('hung handshake times out and retries without user action',()=>{
 const r=rig();r.link.start('ws://device/ws');assert.equal(r.next(),5000);assert.equal(r.sockets[0].readyState,3);assert.equal(r.next(),1000);assert.equal(r.sockets.length,2);r.open(r.sockets[1]);assert.equal(r.timers.size,0);
});
test('retry backoff is bounded and resets after a successful connection',()=>{
 let failing=true;const r=rig(()=>{if(failing)throw Error('network down')});r.link.start('ws://device/ws');
 assert.deepEqual([r.next(),r.next(),r.next(),r.next(),r.next()],[1000,2000,4000,8000,10000]);
 failing=false;r.next();r.open(r.sockets[0]);r.sockets[0].onclose({code:1006});assert.equal(r.next(),1000);
});
