// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Direct native bridge regression: no assistant engine, provider, HTTP or OS input.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {encode} from 'cborg';
import {createProject,encodeProject} from '../../packages/project-codec/index.js';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const executable=resolve(process.argv[2]??join(root,'local/windows-player/Release/nacborui_player.exe'));
const temporary=await mkdtemp(join(tmpdir(),'nacborui-host-progress-'));
const projectPath=join(temporary,'progress.cbor');
const wait=ms=>new Promise(yes=>setTimeout(yes,ms));
const screen={format:'lvgl-screen-draft-1',id:'host_progress',name:'Host progress fixture',
  size:{width:800,height:480},styles:{},
  root:{id:'root',type:'obj',props:{},style:{},children:[]}};
const project=createProject([screen],{id:'host-progress',name:'Host progress fixture'});
let session;

function frame(value){
  const payload=encode(value,{mapSorter:null}),bytes=Buffer.alloc(4+payload.length);
  assert.ok(payload.length>0&&payload.length<=65536,'native command must fit its CBOR frame');
  bytes.writeUInt32LE(payload.length);bytes.set(payload,4);return bytes;
}

function launch(){
  const child=spawn(executable,['--profile','graphics','--project',projectPath,'--stdio','--hidden'],
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

async function inspect(){
  const result=await session.command({op:'inspect'});
  assert.equal(result.windowVisible,false,'regression session must stay hidden');
  assert.equal(result.foreground,false,'regression session must not acquire focus');
  const snapshot=JSON.parse(result.dataJson);
  assert.equal(snapshot.diagnostics.bindingErrors,0);
  assert.equal(snapshot.diagnostics.queueDropped,0);
  return Object.fromEntries(snapshot.sources.map(source=>[source.name,source.value]));
}
async function until(predicate,label){
  const deadline=Date.now()+3000;let state;
  do{state=await inspect();if(predicate(state))return state;await wait(15);}while(Date.now()<deadline);
  assert.fail(label+'; assistant sources: '+JSON.stringify(Object.fromEntries(
    Object.entries(state).filter(([name])=>name.startsWith('assistant.')))));
}
function completion(state,generation,ok){
  assert.equal(state['assistant.generation'],generation);
  assert.deepEqual(state['assistant.completion'],{generation,ok});
}
async function hostReply(reply){
  await session.command({op:'host_reply',reply});
}
async function progress(request,status){
  await hostReply({id:request.id,progress:true,state:{busy:true,status}});
  const state=await until(value=>value['assistant.status']===status,'progress was not published');
  completion(state,1,true);assert.equal(state['assistant.busy'],true);return state;
}

try{
  await writeFile(projectPath,encodeProject(project));
  session=launch();await session.take(event=>event.event==='ready');
  const initial=await session.take(event=>event.event==='host_request');
  assert.equal(initial.kind,'load');assert.equal(initial.id,1);
  await hostReply({id:initial.id,ok:true,state:{busy:false,status:'loaded'}});
  let state=await until(value=>value['assistant.completion']?.generation===1,'initial load did not complete');
  completion(state,1,true);assert.equal(state['assistant.busy'],false);
  assert.equal(state['assistant.status'],'loaded');

  const prompt='Проверка прогресса без модели';
  await session.command({op:'write',source:'assistant.prompt',value:prompt});
  await session.command({op:'invoke',action:'assistant.send',value:true});
  const request=await session.take(event=>event.event==='host_request');
  assert.equal(request.kind,'prompt');assert.equal(request.id,2);
  assert.equal(request.payload.prompt,prompt);
  state=await until(value=>value['assistant.busy']===true,'prompt did not become busy');
  completion(state,1,true);

  await progress(request,'Ожидание модели (шаг1/6)');
  await progress(request,'Ожидание модели (шаг2/6)');

  await session.command({op:'invoke',action:'assistant.cancel',value:true});
  const cancelled=await session.take(event=>event.event==='host_request');
  assert.equal(cancelled.kind,'cancel');assert.equal(cancelled.id,3);
  await hostReply({id:cancelled.id,ok:true,state:{busy:false,status:'cancel acknowledged'}});
  state=await until(value=>value['assistant.completion']?.generation===2,'cancel acknowledgement did not complete');
  completion(state,2,true);
  assert.equal(state['assistant.busy'],true,'pending prompt must keep busy after cancel acknowledgement');

  const error='Тест: модель недоступна, запрос не отправлен';
  assert.ok(Buffer.byteLength(error,'utf8')<=512);
  await hostReply({id:request.id,ok:false,error,state:{busy:false,status:error}});
  state=await until(value=>value['assistant.completion']?.generation===3,'final failure did not complete');
  completion(state,3,false);assert.equal(state['assistant.busy'],false);
  assert.equal(state['assistant.status'],error);

  await hostReply({id:request.id,progress:true,state:{busy:true,status:'late progress must be ignored'}});
  state=await inspect();completion(state,3,false);
  assert.equal(state['assistant.busy'],false);assert.equal(state['assistant.status'],error);
  await hostReply({id:request.id,ok:true,state:{busy:true,status:'duplicate final must be ignored'}});
  state=await inspect();completion(state,3,false);
  assert.equal(state['assistant.busy'],false);assert.equal(state['assistant.status'],error);
  assert.equal(session.alive,true,'late replies must not terminate the native player');
  assert.deepEqual(session.apiEvents,[],'this test must not start an HTTP API');
  const stopped=await session.stop();assert.equal(stopped.code,0);assert.equal(stopped.signal,null);
  console.log('PASS: native HostAgent progress preserves pending request and completion generation; cancel acknowledgement keeps pending prompt busy; final failure completes once; late/duplicate replies ignored; hidden direct stdio, no API or provider');
}finally{
  await session?.stop();
  const inside=relative(resolve(tmpdir()),resolve(temporary));
  assert.ok(inside&&!inside.startsWith('..')&&!isAbsolute(inside),'cleanup must stay inside the owned temporary directory');
  assert.ok(inside.startsWith('nacborui-host-progress-'),'cleanup must target only this test fixture');
  await rm(temporary,{recursive:true,force:true});
}
