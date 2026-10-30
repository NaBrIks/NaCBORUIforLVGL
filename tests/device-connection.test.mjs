// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer,ref,h,nextTick} from 'vue';
import {useDeviceConnection} from '../frontend/src/state/device-connection.js';
import {offlineCapabilities,screenContract} from '../packages/screen-codec/index.js';
import {contract} from '../packages/style-codec/index.js';

function mount(t,fetcher){
 const renderer=createRenderer({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),setText(){},setElementText(){},parentNode:()=>null,nextSibling:()=>null,insert(){},remove(){},patchProp(){}});
 const device=ref('');let connection;
 const app=renderer.createApp({setup(){connection=useDeviceConnection({device,local:true,fetcher,pollInterval:60000});return ()=>h('div');}});
 app.mount({});t.after(()=>app.unmount());return {device,connection};
}
const response=data=>({ok:true,json:async()=>data});
const info=(boot='boot-1')=>({source:'device',boot_id:boot,uptime_ms:10000,contract_sha256:contract.sha256,screen_contract_sha256:screenContract.sha256});

test('changing URL immediately invalidates compatibility and ignores an older INFO response',async t=>{
 let resolveOld;
 const {device,connection}=mount(t,async url=>{
  if(url.startsWith('http://old.test')&&url.endsWith('/api/info'))return new Promise(resolve=>resolveOld=resolve);
  return response(url.endsWith('/api/info')?{...info(),board:'new device'}:offlineCapabilities());
 });
 device.value='http://old.test:5298';const old=connection.connect();
 device.value='http://new.test:5299';assert.equal(connection.ready.value,false);assert.equal(connection.info.value,null);
 assert.equal(await connection.connect(),true);assert.equal(connection.info.value.board,'new device');
 resolveOld(response({...info(),board:'old device'}));assert.equal(await old,false);assert.equal(connection.info.value.board,'new device');
});
test('boot ID change invalidates request owners and refreshes the capability snapshot',async t=>{
 let boot='boot-1',capabilityRequests=0,resets=0;
 const {device,connection}=mount(t,async url=>{if(url.endsWith('/api/info'))return response(info(boot));capabilityRequests++;return response(offlineCapabilities());});
 connection.onReset(()=>resets++);device.value='http://device.test:5298';await connection.connect();
 const epoch=connection.epoch.value,previousResets=resets;assert.equal(capabilityRequests,1);
 boot='boot-2';await connection.refresh();await nextTick();
 assert.equal(connection.epoch.value,epoch+1);assert.equal(resets,previousResets+1);assert.equal(capabilityRequests,2);assert.equal(connection.ready.value,true);
});
test('an older firmware without capabilities remains visible in INFO and cannot receive commands',async t=>{
 const {device,connection}=mount(t,async url=>url.endsWith('/api/info')?response(info()):{ok:false,status:404});
 device.value='http://old-firmware.test:5298';assert.equal(await connection.connect(),false);
 assert.equal(connection.httpOnline.value,true);assert.equal(connection.info.value.boot_id,'boot-1');assert.equal(connection.ready.value,false);assert.match(connection.capabilitiesError.value,/404/);
});
