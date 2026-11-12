// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {mapContainedPointer,createPointerController,bindPreviewPointer} from '../packages/project-codec/native-pointer.js';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function clock(){const timers=new Map();let id=0;return {setInterval(callback,ms){assert.equal(ms,150);timers.set(++id,callback);return id;},clearInterval(id){timers.delete(id);},tick(){for(const callback of timers.values())callback();},get count(){return timers.size;}};}
test('contain mapping ignores letterboxes and uses native pixels independently of CSS or PNG size',()=>{
 const rect={left:10,top:20,width:1000,height:1000};
 assert.equal(mapContainedPointer(rect,800,480,510,100),null,'top letterbox is not a touch');
 assert.deepEqual(mapContainedPointer(rect,800,480,510,520),{x:400,y:240});
 assert.deepEqual(mapContainedPointer(rect,800,480,10,220),{x:0,y:0});
 assert.equal(mapContainedPointer(rect,800,480,1010,520),null,'right edge is outside');
 assert.deepEqual(mapContainedPointer(rect,800,480,-100,2000,{clamp:true}),{x:0,y:479});
 assert.deepEqual(mapContainedPointer({left:0,top:0,width:300,height:100},480,800,150,50),{x:240,y:400},'portrait side letterbox');
 assert.equal(mapContainedPointer({left:0,top:0,width:300,height:100},480,800,20,50),null);
 for(const [w,h] of [[0,1],[800.5,480],[8193,480]])assert.equal(mapContainedPointer(rect,w,h,10,20),null);
 assert.equal(mapContainedPointer({...rect,width:0},800,480,10,20),null);
});
test('slow sender preserves press/release edges, coalesces motion and reserves bounded release capacity',async()=>{
 const blocked=deferred(),sent=[],time=clock();let first=true;
 const pointer=createPointerController({...time,send:async state=>{sent.push(state);if(first){first=false;await blocked.promise;}}});
 assert.equal(pointer.down(1,{x:1,y:2}),true);assert.equal(sent.length,1,'press sends without waiting for an image');
 for(let x=2;x<100;x++)pointer.move(1,{x,y:3});
 assert.equal(pointer.pending,1);time.tick();assert.equal(pointer.pending,1,'hold coalesces with motion');
 pointer.release(1,{x:99,y:4});assert.equal(time.count,0);
 for(let id=2;id<8;id++){if(pointer.down(id,{x:id,y:5}))pointer.release(id);}
 assert.ok(pointer.pending<=8);assert.equal(pointer.down(9,{x:9,y:5}),false,'new press refused when edge capacity is exhausted');
 blocked.resolve();await turn();assert.equal(sent[0].pressed,true);assert.equal(sent.at(-1).pressed,false);
 const edges=sent.slice(2).map(state=>state.pressed);assert.equal(edges[0],false);for(let i=1;i<edges.length;i++)assert.notEqual(edges[i],edges[i-1]);
 pointer.dispose();
});
test('dispose retains terminal release after in-flight press; a failed press never retries itself',async()=>{
 const blocked=deferred(),sent=[],time=clock();const pointer=createPointerController({...time,send:async state=>{sent.push(state);if(sent.length===1)await blocked.promise;}});
 pointer.down(1,{x:3,y:4});pointer.move(1,{x:8,y:9});pointer.dispose();assert.equal(time.count,0);assert.equal(sent.length,1);blocked.resolve();await turn();
 assert.deepEqual(sent,[{x:3,y:4,pressed:true},{x:8,y:9,pressed:false}]);assert.equal(pointer.down(2,{x:1,y:1}),false);
 const failed=[],errors=[];const broken=createPointerController({...clock(),send:async state=>{failed.push(state);if(state.pressed)throw Error('transport cancelled');},onError:error=>errors.push(error.message)});
 broken.down(1,{x:5,y:6});await turn();assert.deepEqual(failed.map(state=>state.pressed),[true,false]);assert.deepEqual(errors,['transport cancelled']);assert.equal(broken.activePointer,null);broken.dispose();
});
class Target extends EventTarget {
 constructor(){super();this.style={touchAction:'pan-y'};this.hidden=false;this.capture=null;}
 getBoundingClientRect(){return {left:10,top:20,width:1000,height:1000};}
 setPointerCapture(id){this.capture=id;}
 hasPointerCapture(id){return this.capture===id;}
 releasePointerCapture(){this.capture=null;}
 event(name,props={}){const event=new Event(name,{cancelable:true});Object.assign(event,{pointerId:1,clientX:510,clientY:520,button:0,isPrimary:true,...props});this.dispatchEvent(event);return event;}
}
test('DOM binding captures primary pointer, gates passive/letterbox input and releases on blur/disable/dispose',async()=>{
 const image=new Target(),window=new Target(),document=new Target(),sent=[];
 const binding=bindPreviewPointer(image,state=>{sent.push(state);return Promise.resolve();},{width:800,height:480,enabled:false,eventTarget:window,documentTarget:document});
 image.event('pointerdown');assert.equal(sent.length,0);binding.update({width:800,height:480,enabled:true});
 image.event('pointerdown',{clientY:100});image.event('pointerdown',{button:2});image.event('pointerdown',{isPrimary:false});assert.equal(sent.length,0);
 assert.equal(image.event('pointerdown').defaultPrevented,true,'the empty preview surface accepts input');assert.equal(image.capture,1);await turn();assert.deepEqual(sent[0],{x:400,y:240,pressed:true});
 image.event('pointermove',{pointerId:2});assert.equal(sent.length,1);window.event('blur');await turn();assert.equal(sent.at(-1).pressed,false);assert.equal(image.capture,null);
 image.event('pointerdown');await turn();binding.update({width:800,height:480,enabled:false});await turn();assert.equal(sent.at(-1).pressed,false);
 binding.update({width:800,height:480,enabled:true});image.event('pointerdown');await turn();document.hidden=true;document.event('visibilitychange');await turn();assert.equal(sent.at(-1).pressed,false);
 document.hidden=false;image.event('pointerdown');await turn();binding.dispose();await turn();assert.equal(sent.at(-1).pressed,false);assert.equal(image.style.touchAction,'pan-y');const count=sent.length;image.event('pointerdown');assert.equal(sent.length,count);
});
