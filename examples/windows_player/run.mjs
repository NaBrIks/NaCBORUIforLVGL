// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm,stat,readFile,mkdir,rename} from 'node:fs/promises';
import {watch} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {dirname,join,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {encode} from 'cborg';
import {loadProject} from './loader.mjs';
import {compileSchemes} from './schemes.mjs';
import {adaptSystemPage} from './system-page.mjs';
import {createHash} from 'node:crypto';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
let path=join(here,'demo.json'),exe=join(root,'local/windows-player/Release/nacborui_player.exe');
let entry,watchEnabled=false,control=false,hidden=false,selectedScheme,schemesPath=new URL('./schemes.json',import.meta.url);
let baseRecovery,baseRecoveryFile;
let profile='system',explicitPath=false,enableApi=false,apiPort,apiStore,webRoot=join(root,'frontend/dist');
let settings=join(process.env.LOCALAPPDATA??join(homedir(),'.config'),'NaCBORUIforLVGL','player.json');
for(let i=2;i<process.argv.length;i++) {
  const arg=process.argv[i];
  if(arg==='--profile'&&process.argv[i+1]){profile=process.argv[++i];if(!['system','graphics'].includes(profile))throw Error('Invalid profile');}
  else if(arg==='--exe'&&process.argv[i+1])exe=resolve(process.argv[++i]);
  else if(arg==='--entry'&&process.argv[i+1])entry=process.argv[++i];
  else if(arg==='--watch')watchEnabled=true;
  else if(arg==='--control')control=true;
  else if(arg==='--hidden')hidden=true;
  else if(arg==='--scheme'&&process.argv[i+1])selectedScheme=process.argv[++i];
  else if(arg==='--schemes'&&process.argv[i+1])schemesPath=resolve(process.argv[++i]);
  else if(arg==='--api')enableApi=true;
  else if(arg==='--api-port'&&process.argv[i+1]){const value=process.argv[++i];if(!/^\d+$/.test(value)||!Number.isInteger(Number(value))||Number(value)>65535||Number(value)===443)throw Error('Invalid API port');apiPort=Number(value);}
  else if(arg==='--base-recovery'&&process.argv[i+1])baseRecovery=resolve(process.argv[++i]);
  else if(arg==='--api-store'&&process.argv[i+1]){apiStore=resolve(process.argv[++i]);enableApi=true;}
  else if(arg==='--web-root'&&process.argv[i+1])webRoot=resolve(process.argv[++i]);
  else if(arg==='--settings'&&process.argv[i+1])settings=resolve(process.argv[++i]);
  else if(arg==='--no-settings')settings=null;
  else if(arg==='--help'){console.log('node examples/windows_player/run.mjs [project.json|project.cbor] [--profile system|graphics] [--base-recovery ORIGINAL.json|ORIGINAL.cbor] [--entry SCREEN] [--watch] [--schemes CATALOG.json] [--scheme ID] [--api | --api-port PORT] [--api-store PREFIX] [--web-root PATH] [--control] [--hidden] [--settings PATH|--no-settings] [--exe PATH]');process.exit(0);}
  else if(arg.startsWith('--'))throw Error('Unknown option '+arg);
  else {path=resolve(arg);explicitPath=true;}
}
if(profile==='graphics'&&!explicitPath)path=join(here,'graphics-gallery.json');
if(enableApi&&apiPort===undefined)apiPort=profile==='graphics'?5301:5300;
if(profile==='graphics'&&!process.argv.includes('--settings')&&settings)settings=join(dirname(settings),'graphics-player.json');
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
let directory,current,watcher,debounce,lines,closing=false,serial=Promise.resolve(),generation=0,queued=0;
const sessions=new Set();
let schemeFile,schemeCatalog,settingsWork=Promise.resolve();
function rememberScheme(id) {
  selectedScheme=id;
  if(!settings)return;
  settingsWork=settingsWork.then(async()=>{
    await mkdir(dirname(settings),{recursive:true});
    const temp=settings+'.tmp';await writeFile(temp,JSON.stringify({scheme:id})+'\n');await rename(temp,settings);
  }).catch(error=>emit({event:'error',error:'Appearance settings: '+error.message}));
}
async function shutdown(code=0) {
  if(closing)return;closing=true;clearTimeout(debounce);watcher?.close();lines?.close();process.stdin.pause();
  await Promise.allSettled([...sessions].map(session=>session.stop()));
  await settingsWork;
  if(directory)await rm(directory,{recursive:true,force:true});process.exitCode=code;
}
function storeFor(candidate){
  if(apiPort===undefined)return undefined;
  return apiStore??join(process.env.LOCALAPPDATA??join(homedir(),'.config'),'NaCBORUIforLVGL','projects',createHash('sha256').update((profile==='graphics'?'graphics\0':'')+resolve(candidate).toLowerCase()).digest('hex').slice(0,24),'changes');
}
async function sessionFor(packet,store) {
  const file=join(directory,`${++generation}.cbor`);await writeFile(file,packet.bytes);
  const child=spawn(exe,['--profile',profile,'--project',file,'--entry',packet.entry,'--width',String(packet.width),
    '--height',String(packet.height),'--title',`NaCBORUIforLVGL - ${packet.project.manifest.name}`,
    '--schemes',schemeFile,'--scheme',selectedScheme,'--stdio',...(store?['--store',store]:[]),...(baseRecoveryFile?['--base-recovery',baseRecoveryFile]:[]),...(apiPort!==undefined?['--api-port',String(apiPort),'--web-root',webRoot]:[]),...(hidden?['--hidden']:[])],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let next=0,readyResolve,readyReject,exitedResolve,nativeReady=false,apiReady=false;
  const ready=new Promise((yes,no)=>{readyResolve=yes;readyReject=no;});
  const exited=new Promise(yes=>exitedResolve=yes),pending=new Map();
  const startup=setTimeout(()=>readyReject(Error('Player startup timeout')),15000);
  const session={child,width:packet.width,height:packet.height,
    command(request) {
      return new Promise((yes,no)=>{
        const id=++next,payload=encode({...request,id});
        if(payload.length>65536){no(Error('Player command exceeds 65536 bytes'));return;}
        const frame=Buffer.alloc(4+payload.length);frame.writeUInt32LE(payload.length);frame.set(payload,4);
        const timer=setTimeout(()=>{pending.delete(id);no(Error('Player command timeout'));},10000);
        pending.set(id,{yes,no,timer});
        child.stdin.write(frame,error=>{if(error){clearTimeout(timer);pending.delete(id);no(error);}});
      });
    },
    async stop() {
      if(child.exitCode!==null||child.signalCode!==null)return;
      const payload=encode({op:'quit'}),frame=Buffer.alloc(4+payload.length);frame.writeUInt32LE(payload.length);frame.set(payload,4);
      child.stdin.end(frame);
      let timer;await Promise.race([exited,new Promise(yes=>{timer=setTimeout(()=>{child.kill();yes();},3000);})]);clearTimeout(timer);
    }
  };
  sessions.add(session);
  child.stdin.on('error',()=>{});
  child.stderr.on('data',chunk=>process.stderr.write(chunk));
  child.on('error',readyReject);
  const output=createInterface({input:child.stdout});
  output.on('line',line=>{
    let event;try{event=JSON.parse(line);}catch{process.stderr.write(line+'\n');return;}
    if(event.event==='ready'){nativeReady=true;}
    else if(event.event==='api_ready'){
      apiReady=true;
      emit(event);
    }
    else if(event.event==='fatal'){readyReject(Error(event.error));emit(event);}
    else if(event.event==='scheme_changed'){rememberScheme(event.scheme);emit(event);}
    else if(event.event==='result') {
      const waiting=pending.get(event.id);if(waiting){clearTimeout(waiting.timer);pending.delete(event.id);waiting.yes(event);}
    } else if(event.event==='open')enqueue(()=>open(event.path));
    else if(event.event==='reload')enqueue(()=>open(path));
    else if(event.event==='closed')emit(event);
    if(nativeReady&&(apiPort===undefined||apiReady)){clearTimeout(startup);readyResolve();}
  });
  child.on('close',code=>{
    clearTimeout(startup);sessions.delete(session);exitedResolve();readyReject(Error('Player exited: '+code));
    for(const waiting of pending.values()){clearTimeout(waiting.timer);waiting.no(Error('Player closed'));}pending.clear();
    if(current===session&&!closing)void shutdown(code??1);
  });
  try{await ready;return session;}catch(error){await session.stop();throw error;}
  finally{await rm(file,{force:true});}
}
function monitor() {
  watcher?.close();if(!watchEnabled)return;
  watcher=watch(dirname(path),(_event,name)=>{
    if(name&&name.toString()!==basename(path))return;
    clearTimeout(debounce);debounce=setTimeout(()=>enqueue(()=>open(path)),150);
  });
  watcher.on('error',error=>emit({event:'error',error:error.message}));
}
async function open(candidate) {
  // Validate completely before touching the current native composition.
  const packet=await loadProject(candidate,capabilities,{entry,
    ...(resolve(candidate)===join(here,'demo.json')?{prepare:adaptSystemPage}:{})});
  const store=storeFor(candidate);if(store)await mkdir(dirname(store),{recursive:true});
  if(!current||apiPort===undefined&&(current.width!==packet.width||current.height!==packet.height)) {
    const previous=current,next=await sessionFor(packet,store);current=next;
    if(previous)await previous.stop();
  } else {
    const file=join(directory,`${++generation}.cbor`);await writeFile(file,packet.bytes);
    try{const reply=await current.command({op:'load',path:file,entry:packet.entry,...(store?{store}:{}),title:`NaCBORUIforLVGL - ${packet.project.manifest.name}`});if(!reply.ok)throw Error(reply.error);}
    finally{await rm(file,{force:true});}
  }
  path=resolve(candidate);monitor();
  emit({event:'loaded',path,entry:packet.entry,width:packet.width,height:packet.height});
}
function schedule(work) {
  if(closing)return Promise.reject(Error('Player is stopping'));
  if(queued>=32)return Promise.reject(Error('Player command queue full (32)'));
  queued++;
  const result=serial.then(()=>{if(closing)throw Error('Player is stopping');return work();});
  serial=result.catch(()=>{}).finally(()=>queued--);
  return result;
}
function enqueue(work) {
  return schedule(work).catch(async error=>{
    emit({event:'error',error:error.message});
    if(current&&!closing)await current.command({op:'error',message:error.message}).catch(()=>{});
  });
}
let capabilities;
try {
  if(!(await stat(exe)).isFile())throw Error('Player executable not found');
  const {stdout}=await promisify(execFile)(exe,['--capabilities','--profile',profile],{windowsHide:true,maxBuffer:2*1024*1024});
  capabilities=JSON.parse(stdout.trim());
  schemeCatalog=await compileSchemes(schemesPath);
  if(selectedScheme===undefined&&settings)try{selectedScheme=JSON.parse(await readFile(settings,'utf8')).scheme;}catch{}
  if(!schemeCatalog.choices.some(c=>c.id===selectedScheme)) {
    if(selectedScheme!==undefined&&process.argv.includes('--scheme'))throw Error('Unknown scheme '+selectedScheme);
    selectedScheme=schemeCatalog.default;
  }
  directory=await mkdtemp(join(tmpdir(),'nacborui-player-'));
  if(baseRecovery){const original=await loadProject(baseRecovery,capabilities);baseRecoveryFile=join(directory,'recovery-base.cbor');await writeFile(baseRecoveryFile,original.bytes);}
  schemeFile=join(directory,'appearance.cbor');await writeFile(schemeFile,schemeCatalog.bytes);
  await open(path);
  if(control) {
    lines=createInterface({input:process.stdin});
    lines.on('line',line=>enqueue(async()=>{
      const request=JSON.parse(line);
      if(request.op==='quit'){await shutdown();return;}
      if(request.op==='open'){await open(request.path);return;}
      const result=await current.command(request);emit({...result,id:request.id??null});
    }));
    lines.on('close',()=>{if(!closing)void shutdown();});
  }
  process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
} catch(error) {
  emit({event:'fatal',error:error.message+(error.message.includes('project_base_')?'; saved changes are preserved. Use --base-recovery with the matching original project if no base cache exists.':'; build with examples/windows_player/build.ps1 if needed')});await shutdown(1);
}
