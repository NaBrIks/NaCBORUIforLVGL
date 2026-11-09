// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Native image upload over real MCP/NaWServer, private stdout capture; no provider.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {encode} from 'cborg';
import {createProject,encodeProject} from '../../packages/project-codec/index.js';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const executable=resolve(process.argv[2]??join(root,'local/catalog-player/Release/nacborui_player.exe'));
const temporary=await mkdtemp(join(tmpdir(),'nacborui-host-images-')),projectPath=join(temporary,'images.cbor');
const require=createRequire(new URL('../../integrations/mcp/package.json',import.meta.url));
const {Client}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/client')));
const {StdioClientTransport}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/client/stdio')));
const screen={format:'lvgl-screen-draft-1',id:'host_images',name:'Host images fixture',size:{width:800,height:480},styles:{},root:{id:'root',type:'obj',props:{},style:{},children:[]}};
const project=createProject([screen],{id:'host-images',name:'Host images fixture'});
let session,mcp,checks=0;
function frame(value){const payload=encode(value,{mapSorter:null}),bytes=Buffer.alloc(4+payload.length);assert.ok(payload.length>0&&payload.length<=65536);bytes.writeUInt32LE(payload.length);bytes.set(payload,4);return bytes;}
function launch(){
  const child=spawn(executable,['--profile','graphics','--project',projectPath,'--stdio','--hidden','--api-port','0','--web-root',join(root,'frontend/dist'),'--store',join(temporary,'store')],
    {cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let next=0,closed=false,closing=false,failure=null,stderr='';
  const queued=[],waiters=[],apiEvents=[];
  const detail=()=>'; stderr: '+stderr+'; queued: '+JSON.stringify(queued.slice(-5));
  const fail=error=>{
    failure??=error;
    for(const waiter of waiters.splice(0)){clearTimeout(waiter.timer);waiter.reject(failure);}
  };
  child.stdin.on('error',error=>{if(!closing)fail(error);});
  child.stderr.on('data',bytes=>{stderr=(stderr+bytes.toString('utf8')).slice(-8192);});
  child.once('error',fail);
  const exited=new Promise(yes=>child.once('close',(code,signal)=>{
    closed=true;
    if(!closing)fail(Error('Native player exited '+code+' '+signal+detail()));
    yes({code,signal});
  }));
  // Native emits JSON lines; only stdin uses length-prefixed CBOR (main.cpp).
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{
    let event;try{event=JSON.parse(line);}catch{return;}
    if(event.event==='api_ready')apiEvents.push(event);
    if(event.event==='fatal'){fail(Error('Native fatal: '+event.error+detail()));return;}
    const index=waiters.findIndex(waiter=>waiter.predicate(event));
    if(index>=0){
      const [waiter]=waiters.splice(index,1);clearTimeout(waiter.timer);waiter.resolve(event);
    }else{
      queued.push(event);
      if(queued.length>128)fail(Error('Unexpected native event backlog'+detail()));
    }
  });
  function take(predicate,timeout=10000){
    if(failure)return Promise.reject(failure);
    const index=queued.findIndex(predicate);
    if(index>=0)return Promise.resolve(queued.splice(index,1)[0]);
    if(closed)return Promise.reject(Error('Native player already closed'+detail()));
    return new Promise((resolve,reject)=>{
      const waiter={predicate,resolve,reject,timer:setTimeout(()=>{
        const index=waiters.indexOf(waiter);if(index>=0)waiters.splice(index,1);
        reject(Error('Native event timeout'+detail()));
      },timeout)};
      waiters.push(waiter);
    });
  }
  async function command(request){
    const id=++next,result=take(event=>event.event==='result'&&event.id===id);
    try{child.stdin.write(frame({...request,id}),error=>{if(error)fail(error);});}
    catch(error){fail(error);}
    const reply=await result;assert.equal(reply.ok,true,reply.error??JSON.stringify(request));return reply;
  }
  return {
    take,command,
    get apiEvents(){return apiEvents;},
    get alive(){return !closed&&child.exitCode===null&&child.signalCode===null;},
    async stop(){
      closing=true;
      if(!closed){
        try{child.stdin.end(frame({op:'quit'}));}catch{child.kill();}
        const timeout=setTimeout(()=>child.kill(),3000);
        try{return await exited;}finally{clearTimeout(timeout);lines.close();}
      }
      lines.close();return exited;
    },
  };
}

async function call(name,args={}){return mcp.callTool({name,arguments:args},undefined,{timeout:20000});}
async function result(name,args={}){const response=await call(name,args);assert.equal(response.isError,undefined,JSON.stringify(response.content));return JSON.parse(response.content[0].text);}
async function action(kind,args){const response=await result('invoke_action',{name:'assistant.'+kind,args});assert.equal(response.state,'completed');assert.equal(response.result.ok,true);checks++;return response;}
async function rejected(kind,args,pattern){const response=await call('invoke_action',{name:'assistant.'+kind,args});const text=response.content[0].text;let value;try{value=JSON.parse(text);}catch{value=text;}assert.ok(response.isError||value.result?.ok===false,'action must be rejected');if(pattern)assert.match(typeof value==='string'?value:JSON.stringify(value),pattern);checks++;}
async function privateReply(request,extra={}){await session.command({op:'host_reply',reply:{id:request.id,ok:true,state:{busy:false,status:'test complete'},...extra}});}
async function cleanSnapshot(blobs=[]){
 const snapshot=await result('get_data',{snapshot:true,maxBytes:16384});
 const catalog=await result('get_data_catalog',{kind:'actions',prefix:'assistant.image',detail:true,maxBytes:16384});
 const selective=await result('get_data',{prefix:'assistant.',maxBytes:16384,limit:64,detail:true});
 const inspected=await session.command({op:'inspect'});
 assert.equal(inspected.windowVisible,false);assert.equal(inspected.foreground,false);
 const combined=JSON.stringify({snapshot,catalog,selective,inspected:JSON.parse(inspected.dataJson)});
 for(const blob of blobs)assert.ok(!combined.includes(blob.slice(0,Math.min(blob.length,80))),'base64 must remain private');
 assert.ok(!snapshot.sources.some(source=>source.name.startsWith('assistant.image')),'no image sources or snapshots');
 assert.equal(snapshot.diagnostics.queueDropped,0);
 checks++;
}
async function upload(id,mime,data){
 await action('image_begin',{id,name:id+'.png',mime,size:data.length});
 for(let offset=0;offset<data.length;offset+=2048)await action('image_chunk',{id,offset,data:data.slice(offset,offset+2048)});
 await action('image_commit',{id});
}
try{
 await writeFile(projectPath,encodeProject(project));session=launch();
 await session.take(event=>event.event==='ready');
 const origin=(await session.take(event=>event.event==='api_ready')).url;
 assert.notEqual(new URL(origin).port,'443');
 const initial=await session.take(event=>event.event==='host_request');assert.equal(initial.kind,'load');await privateReply(initial);
 mcp=new Client({name:'native-host-images-test',version:'1.0.0'});
 await mcp.connect(new StdioClientTransport({command:process.execPath,args:[join(root,'integrations/mcp/index.js')],cwd:root,env:{PATH:process.env.PATH,LVGL_CBOR_DEVICE:origin,LVGL_CBOR_ALLOW_DATA:'1'},stderr:'pipe'}));
 const catalog=await result('get_data_catalog',{kind:'actions',prefix:'assistant.image',detail:true,maxBytes:16384});
 assert.deepEqual(catalog.items.map(item=>item.name).sort(),['assistant.image_begin','assistant.image_chunk','assistant.image_commit','assistant.images_clear'].sort());checks++;
 await rejected('image_begin',{id:'x',name:'x',mime:'image/gif',size:4},/PNG|JPEG|WebP/);
 await rejected('image_begin',{id:'',name:'x',mime:'image/png',size:4},/id.*empty/);
 await rejected('image_begin',{id:'x'},/required/);
 await rejected('image_begin',{id:'x',name:'x',mime:'image/png',size:131073});
 await rejected('image_begin',{id:'x',name:'x',mime:'image/png',size:5},/size/);
 await rejected('image_commit',{id:'absent'},/Unknown/);
 await rejected('image_chunk',{id:'absent',offset:0,data:'AAAA'},/Unknown/);
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=';
 await action('image_begin',{id:'png',name:'one.png',mime:'image/png',size:png.length});
 await rejected('image_begin',{id:'png',name:'one.png',mime:'image/png',size:png.length},/exists/);
 await rejected('image_commit',{id:'png'},/incomplete/);
 await rejected('send',true,/incomplete/);
 await rejected('image_chunk',{id:'png',offset:1,data:png.slice(0,31)},/order/);
 await rejected('image_chunk',{id:'png',offset:0,data:'!'},/base64/);
 await rejected('image_chunk',{id:'png',offset:0,data:'='},/padding/);
 await rejected('image_chunk',{id:'png',offset:0,data:'A'.repeat(2049)});
 await action('image_chunk',{id:'png',offset:0,data:png.slice(0,31)});
 await rejected('image_chunk',{id:'png',offset:0,data:png.slice(0,31)},/order/);
 await action('image_chunk',{id:'png',offset:31,data:png.slice(31)});
 await rejected('image_chunk',{id:'png',offset:png.length,data:'A'},/size/);
 await action('image_commit',{id:'png'});
 await rejected('image_commit',{id:'png'},/committed/);
 await cleanSnapshot([png]);
 await action('send',true);const prompt=await session.take(event=>event.event==='host_request');
 assert.equal(prompt.kind,'prompt');assert.deepEqual(prompt.payload.images,[{mime:'image/png',data:png}]);checks++;
 for(const [kind,args] of [['images_clear',true],['image_begin',{id:'busy',name:'busy',mime:'image/png',size:4}],['image_chunk',{id:'png',offset:0,data:'AAAA'}],['image_commit',{id:'png'}]])await rejected(kind,args,/locked.*pending/);
 await session.command({op:'host_reply',reply:{id:prompt.id,progress:true,state:{status:'still pending',busy:true}}});
 await rejected('images_clear',true,/locked.*pending/);
 await privateReply(prompt);await action('images_clear',true);
 // Padding, declared MIME and actual signature are checked at commit.
 for(const [id,mime,data] of [['bits','image/png','iVBORw0KGgp='],['mime','image/jpeg',png],['sig','image/png','AAAA'],['pad','image/png','AA=A']]){
  await action('image_begin',{id,name:id,mime,size:data.length});await action('image_chunk',{id,offset:0,data});await rejected('image_commit',{id},/Invalid/);await action('images_clear',true);
 }
 const jpeg=Buffer.from([255,216,255,224,0,2]).toString('base64');
 const webp=Buffer.from('RIFF0000WEBP','ascii').toString('base64');
 await upload('jpeg','image/jpeg',jpeg);await upload('webp','image/webp',webp);await cleanSnapshot([jpeg,webp]);await action('images_clear',true);
 const large=Buffer.alloc(96*1024);Buffer.from(png,'base64').copy(large);const encoded=large.toString('base64');assert.equal(encoded.length,128*1024);
 for(let index=0;index<4;index++)await upload('large'+index,'image/png',encoded);
 await rejected('image_begin',{id:'fifth',name:'fifth',mime:'image/png',size:4},/four/);
 await cleanSnapshot([encoded]);
 await action('send',true);const largePrompt=await session.take(event=>event.event==='host_request');
 assert.equal(largePrompt.payload.images.length,4);assert.ok(JSON.stringify(largePrompt).length>512*1024);
 for(const image of largePrompt.payload.images)assert.deepEqual(image,{mime:'image/png',data:encoded});checks++;
 await privateReply(largePrompt);await action('images_clear',true);await action('send',true);
 const clearedPrompt=await session.take(event=>event.event==='host_request');assert.equal(clearedPrompt.payload.images,undefined);await privateReply(clearedPrompt);checks++;
 await cleanSnapshot([encoded,png]);assert.equal(session.alive,true);
 await mcp.close();mcp=null;const stopped=await session.stop();assert.equal(stopped.code,0);
 console.log('PASS: '+checks+' native image checks, real MCP/NaWServer; bounded 4x96KiB images reach private stdout (>512KiB), strict order/schema/base64/padding/MIME, pending locks, clear, no blobs in snapshots/catalog/get_data, no provider');
}finally{
 await mcp?.close();await session?.stop();const inside=relative(resolve(tmpdir()),resolve(temporary));assert.ok(inside&&!inside.startsWith('..')&&!isAbsolute(inside)&&inside.startsWith('nacborui-host-images-'));await rm(temporary,{recursive:true,force:true});
}
