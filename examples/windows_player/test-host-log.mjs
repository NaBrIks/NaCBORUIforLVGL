// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Native bounded assistant log over real MCP/NaWServer; no provider requests.
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
const temporary=await mkdtemp(join(tmpdir(),'nacborui-host-log-')),projectPath=join(temporary,'log.cbor');
const require=createRequire(new URL('../../integrations/mcp/package.json',import.meta.url));
const {Client}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/client')));
const {StdioClientTransport}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/client/stdio')));
const screen={format:'lvgl-screen-draft-1',id:'host_log',name:'Host log fixture',size:{width:800,height:480},styles:{},root:{id:'root',type:'obj',props:{},style:{},children:[]}};
const project=createProject([screen],{id:'host-log',name:'Host log fixture'});
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
    get stderr(){return stderr;},
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

async function result(name,args={}){const response=await mcp.callTool({name,arguments:args},undefined,{timeout:20000});assert.equal(response.isError,undefined,JSON.stringify({content:response.content,alive:session.alive,stderr:session.stderr}));return JSON.parse(response.content[0].text);}
async function inspect(){const value=await session.command({op:'inspect'});assert.equal(value.windowVisible,false);assert.equal(value.foreground,false);const data=JSON.parse(value.dataJson);return Object.fromEntries(data.sources.map(item=>[item.name,item.value]));}
async function until(operation,predicate,label){const deadline=Date.now()+3000;for(;;){const value=await operation();if(predicate(value))return value;if(Date.now()>=deadline)assert.fail(label);await new Promise(resolve=>setTimeout(resolve,20));}}
async function reply(id,log,progress=false){await session.command({op:'host_reply',reply:{id,progress,...(progress?{}:{ok:true}),state:{log,busy:progress,status:progress?'working':'done'}}});}
async function start(){session=launch();await session.take(event=>event.event==='ready');const origin=(await session.take(event=>event.event==='api_ready')).url;const initial=await session.take(event=>event.event==='host_request');assert.equal(initial.kind,'load');const deadline=Date.now()+3000;for(;;){try{const response=await fetch(new URL('/api/info',origin),{signal:AbortSignal.timeout(1000)});assert.equal(response.status,200);break;}catch(error){if(Date.now()>=deadline)throw error;await new Promise(resolve=>setTimeout(resolve,20));}}return {origin,initial};}
try{
 await writeFile(projectPath,encodeProject(project));const {origin,initial}=await start();assert.notEqual(new URL(origin).port,'443');
 assert.deepEqual((await inspect())['assistant.log'],[]);await reply(initial.id,[]);
 mcp=new Client({name:'native-host-log-test',version:'1.0.0'});
 await mcp.connect(new StdioClientTransport({command:process.execPath,args:[join(root,'integrations/mcp/index.js')],cwd:root,env:{PATH:process.env.PATH,LVGL_CBOR_DEVICE:origin,LVGL_CBOR_ALLOW_DATA:'1'},stderr:'pipe'}));
 const catalog=await result('get_data_catalog',{kind:'sources',name:'assistant.log',detail:true,maxBytes:4096});
 assert.equal(catalog.items.length,1);assert.equal(catalog.items[0].name,'assistant.log');assert.equal(catalog.items[0].writable,false);
 const before=await inspect(),generation=before['assistant.generation'];
 await session.command({op:'invoke',action:'assistant.send',value:true});const prompt=await session.take(event=>event.event==='host_request');assert.equal(prompt.kind,'prompt');
 const log=Array.from({length:32},(_,index)=>({seq:index+1,elapsed_ms:index*25,kind:index%2?'tool':'model',text:'trace-'+index+' '+('x'.repeat(280))}));
 assert.ok(Buffer.byteLength(JSON.stringify(log))<=12288);assert.ok(encode(log).length<16384);
 await reply(prompt.id,log,true);let state=await until(inspect,value=>value['assistant.log']?.length===32,'native log publication timeout');assert.deepEqual(state['assistant.log'],log);assert.equal(state['assistant.generation'],generation);assert.deepEqual(state['assistant.completion'],before['assistant.completion']);assert.equal(state['assistant.busy'],true);
 const read=await until(()=>result('get_data',{name:'assistant.log',detail:true,maxBytes:16384}),value=>value.items[0].value?.length===32,'MCP data view publication timeout');assert.deepEqual(read.items[0].value,log);
 const field=await result('get_data',{name:'assistant.log',path:'/31/text',detail:true,maxBytes:4096});assert.equal(field.items[0].value,log[31].text);
 // The product HTTP snapshot publishes the same transient log for its frontend.
 let snapshot;const deadline=Date.now()+3000;do{snapshot=await(await fetch(new URL('/api/data',origin))).json();if(snapshot.sources.find(item=>item.name==='assistant.log')?.value?.length===32)break;await new Promise(resolve=>setTimeout(resolve,20));}while(Date.now()<deadline);
 assert.deepEqual(snapshot.sources.find(item=>item.name==='assistant.log').value,log);
 const readonly=await mcp.callTool({name:'write_source',arguments:{source:'assistant.log',value:[]}});assert.equal(readonly.isError,true);
 await assert.rejects(()=>reply(prompt.id,Array.from({length:49},(_,index)=>({seq:index,elapsed_ms:0,kind:'tool',text:'overflow'})),true));
 await assert.rejects(()=>reply(prompt.id,[{seq:1,elapsed_ms:0,kind:'tool',text:'x'.repeat(1025)}],true));
 state=await inspect();assert.deepEqual(state['assistant.log'],log);assert.equal(state['assistant.generation'],generation);assert.equal(state['assistant.busy'],true);
 const completed=[...log,{seq:33,elapsed_ms:1000,kind:'complete',text:'Native log test completed'}];await reply(prompt.id,completed);state=await until(inspect,value=>value['assistant.log']?.length===33,'final native log publication timeout');assert.deepEqual(state['assistant.log'],completed);assert.equal(state['assistant.generation'],generation+1);assert.equal(state['assistant.completion'].ok,true);assert.equal(state['assistant.busy'],false);
 await reply(prompt.id,[],true);assert.deepEqual((await inspect())['assistant.log'],completed,'late progress must not replace final log');
 await mcp.close();mcp=null;assert.equal((await session.stop()).code,0);
 // Reopening the same application project/store starts with an empty log.
 const reopened=await start();assert.deepEqual((await inspect())['assistant.log'],[]);await reply(reopened.initial.id,[]);assert.equal((await session.stop()).code,0);
 console.log('PASS: native readonly assistant.log, 32 bounded records via progress -> DataRegistry -> MCP selective data/field and NaWServer HTTP snapshot; final/late completion semantics, schema bounds, empty same-store reopen; no provider or owner process');
}finally{await mcp?.close();await session?.stop();const inside=relative(resolve(tmpdir()),resolve(temporary));assert.ok(inside&&!inside.startsWith('..')&&!isAbsolute(inside)&&inside.startsWith('nacborui-host-log-'));await rm(temporary,{recursive:true,force:true});}
