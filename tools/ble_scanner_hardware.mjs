// Explicit acceptance of the optional S3 BLE example. Uses real radio data;
// event injection verifies the LVGL callback, not a physical touchscreen tap.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {encode} from 'cborg';
import {ProjectClient} from '../packages/project-codec/client.js';
import {validateBindingCapabilities,validateDataValue} from '../packages/screen-codec/binding-schema.js';

const origin=process.argv[2];
if(!origin)throw Error('Usage: node tools/ble_scanner_hardware.mjs http://DEVICE');
const request=(path,options={})=>fetch(origin+path,{...options,signal:AbortSignal.timeout(6000)});
async function json(path){const response=await request(path);assert.equal(response.status,200,path);return response.json();}
const client=new ProjectClient(origin,{fetcher:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(6000)})});
const before=await json('/api/info'),capabilities=await json('/api/capabilities');
const projectBefore=await client.info(),initialData=await json('/api/data'),checks=[];
const source=(snapshot,name)=>{const result=snapshot.sources.find(item=>item.name===name);assert.ok(result,name);return result;};
const value=(snapshot,name)=>{const item=source(snapshot,name);assert.equal(item.state,'known',name);return item.value;};
async function until(predicate,label,timeout=15000){
 const end=Date.now()+timeout;let snapshot;
 do{snapshot=await json('/api/data');if(predicate(snapshot))return snapshot;await delay(300);}while(Date.now()<end);
 throw Error(label+' timed out: '+JSON.stringify(snapshot));
}
async function command(body,ok=true){
 const response=await request('/api/data',{method:'POST',headers:{'Content-Type':'application/cbor'},body:encode(body)});
 assert.equal(response.status,202);const receipt=await response.json();assert.equal(receipt.queued,true);
 const snapshot=await until(s=>s.commands.some(result=>result.id===receipt.id),'command '+receipt.id);
 const result=snapshot.commands.find(item=>item.id===receipt.id);assert.equal(result.ok,ok,JSON.stringify(result));
 return result;
}
const initialEnabled=value(initialData,'ble.scan.enabled');
let latest=initialData,report,failure,oversizedTransport;
try{
 validateBindingCapabilities(capabilities);
 assert.equal(capabilities.binding.version,1);
 const definitions=capabilities.binding.sources;
 assert.equal(definitions.find(item=>item.name==='ble.scan.enabled').writable,true);
 assert.equal(definitions.find(item=>item.name==='ble.scan.devices').schema.type,'array');
 assert.equal(definitions.find(item=>item.name==='ble.scan.devices').writable,false);
 assert.equal(definitions.find(item=>item.name==='ble.scan.devices').schema.maxItems,16);
 assert.equal(definitions.find(item=>item.name==='ble.scan.status').schema.type,'object');
 checks.push('live typed scalar, object and bounded object-array catalog');
 await client.show('ble-scanner');
 assert.equal((await client.info()).display.screen,'ble-scanner');
 await command({kind:'action',name:'ble.scan.start',args:null});
 latest=await until(s=>value(s,'ble.scan.enabled')===true&&value(s,'ble.scan.status').state==='scanning','GAP start confirmation');
 const packets=value(latest,'ble.scan.status').packets;
 latest=await until(s=>value(s,'ble.scan.status').packets>packets&&value(s,'ble.scan.devices').length>0,'fresh BLE advertisements',30000);
 const observed=structuredClone(latest);
 const devices=value(latest,'ble.scan.devices');assert.ok(devices.length<=16);
 for(const definition of definitions)validateDataValue(value(latest,definition.name),definition.schema);
 for(const device of devices){
  assert.match(device.address,/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/);assert.equal(typeof device.name,'string');
  assert.ok(Number.isInteger(device.rssi)&&device.rssi>=-128&&device.rssi<=127);
  assert.ok(device.packets>0);assert.ok(Number.isInteger(device.lastSeenMs));
 }
 checks.push('confirmed scan and fresh radio advertisements with typed device rows');
 await command({kind:'write',source:'ble.scan.enabled',path:[],value:false});
 latest=await until(s=>value(s,'ble.scan.enabled')===false&&value(s,'ble.scan.status').state==='stopped','GAP stop confirmation');
 await delay(500);const stopped=await json('/api/data');await delay(1200);latest=await json('/api/data');
 assert.equal(value(latest,'ble.scan.status').packets,value(stopped,'ble.scan.status').packets);
 checks.push('writable bool reaches confirmed stopped state and packet counter stops');
 await command({kind:'event',node:'ble-clear',event:'clicked'});
 latest=await until(s=>value(s,'ble.scan.status').count===0&&value(s,'ble.scan.devices').length===0,'Clear LVGL event');
 assert.equal(value(latest,'ble.scan.status').packets,0);
 checks.push('LVGL clicked callback invokes registered clear action and array shrinks to empty');
 const denied=await command({kind:'write',source:'ble.scan.devices',path:[],value:[]},false);assert.ok(denied.error);
 await command({kind:'action',name:'unknown.action',args:null},false);
 await command({kind:'write',source:'ble.scan.enabled',path:[],value:1},false);
 await command({kind:'event',node:'missing-node',event:'clicked'},false);
 checks.push('read-only source, unknown action, wrong value type and missing event target rejected');
 const malformed=await request('/api/data',{method:'POST',body:new Uint8Array([0xff])});assert.equal(malformed.status,202);
 const malformedId=(await malformed.json()).id;
 latest=await until(s=>s.commands.some(c=>c.id===malformedId),'malformed command result');
 assert.equal(latest.commands.find(c=>c.id===malformedId).ok,false);
 try{
  const tooLarge=await request('/api/data',{method:'POST',body:new Uint8Array(4097)});assert.equal(tooLarge.status,400);oversizedTransport='HTTP 400';
 }catch(error){
  // The HTTP server rejects before dispatch and drains only a bounded amount.
  // A reset can discard its error response; it must still accept no command.
  if(error.cause?.code!=='ECONNRESET')throw error;
  oversizedTransport='TCP reset while rejecting oversized body';
 }
 latest=await json('/api/data');assert.equal(Math.max(...latest.commands.map(c=>c.id)),malformedId);
 checks.push('malformed CBOR and oversized command rejected');
 await command({kind:'write',source:'ble.scan.enabled',path:[],value:true});
 latest=await until(s=>value(s,'ble.scan.enabled')===true&&value(s,'ble.scan.status').packets>0,'scan restart and fresh packets',30000);
 assert.equal(latest.diagnostics.bindingErrors,initialData.diagnostics.bindingErrors);
 const after=await json('/api/info');assert.equal(after.boot_id,before.boot_id);
 assert.equal((await client.info()).project.revision,projectBefore.project.revision);
 checks.push('scan restarts without reboot, binding errors or project save');
 report={origin,checkedAt:new Date().toISOString(),checks,before,after,projectBefore,observed,stopped,latest,oversizedTransport,
  physicalTouchTested:false,eventInjection:'LVGL clicked callback only; no synthetic BLE advertisements'};
}catch(error){failure=error;
}finally{
 const restored=await Promise.allSettled([
  (async()=>{await command({kind:'write',source:'ble.scan.enabled',path:[],value:initialEnabled});
   await until(s=>value(s,'ble.scan.enabled')===initialEnabled,'restore scan state');})(),
  projectBefore.display?.screen?client.show(projectBefore.display.screen):Promise.resolve()
 ]);
 report??={origin,checkedAt:new Date().toISOString(),checks,before,projectBefore,latest};
 report.restoration=restored.map((result,index)=>({target:index===0?'radio':'display',ok:result.status==='fulfilled',
  ...(result.status==='rejected'?{error:String(result.reason)}:{})}));
 if(failure)report.error=String(failure);
 await writeFile(new URL('../local/binding-hardware.json',import.meta.url),JSON.stringify(report,null,2));
 const cleanupErrors=restored.filter(result=>result.status==='rejected').map(result=>result.reason);
 if(failure||cleanupErrors.length)throw new AggregateError([...(failure?[failure]:[]),...cleanupErrors],'BLE acceptance/restoration failed');
}
console.log(JSON.stringify({checks:checks.length,boot:report.after.boot_id,devices:value(report.observed,'ble.scan.devices').length,
 packets:value(latest,'ble.scan.status').packets,bindingErrors:latest.diagnostics.bindingErrors,restored:true}));
