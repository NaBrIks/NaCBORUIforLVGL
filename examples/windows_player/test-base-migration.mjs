// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const exe=resolve(process.argv[2]??join(root,'local/windows-player/Release/nacborui_player.exe'));
import {connectNativeApi} from './native-api.mjs';
const temporary=await mkdtemp(join(tmpdir(),'nacborui-base-migration-')),basePath=join(temporary,'base.json'),recoveryA=join(temporary,'recovery-a.json'),wrongRecovery=join(temporary,'wrong-recovery.json');
const output=join(root,'local/windows-base-migration'),sessions=new Set(),wait=ms=>new Promise(yes=>setTimeout(yes,ms));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function slots(prefix){const result={};for(const slot of [0,1]){try{result[slot]=await readFile(prefix+'.'+slot);}catch(error){if(error.code!=='ENOENT')throw error;}}return result;}
const hashes=value=>Object.fromEntries(Object.entries(value).map(([slot,bytes])=>[slot,sha(bytes)]));
async function writeSlots(prefix,value){await mkdir(dirname(prefix),{recursive:true});for(const [slot,bytes]of Object.entries(value))await writeFile(prefix+'.'+slot,bytes);}
async function removeTestCache(prefix,revision){
 assert.match(revision,/^[0-9a-f]{16}$/);let removed=0;
 for(const slot of [0,1]){const path=resolve(prefix+'.base.'+revision+'.'+slot),inside=relative(temporary,path);assert.ok(inside&&!inside.startsWith('..')&&!isAbsolute(inside),'only exact files inside the owned test directory may be removed');try{await rm(path);removed++;}catch(error){if(error.code!=='ENOENT')throw error;}}
 return removed;
}
async function launch(prefix,recovery){
 const child=spawn(process.execPath,[join(here,'run.mjs'),basePath,'--profile','graphics','--exe',exe,'--api-port','0','--api-store',prefix,'--control','--hidden','--no-settings',...(recovery?['--base-recovery',recovery]:[])],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let loaded=false,url,stderr='',closed=false,resolveReady,rejectReady,next=0;
 const jobs=new Map(),ready=new Promise((yes,no)=>{resolveReady=yes;rejectReady=no;}),startup=setTimeout(()=>rejectReady(Error('Migration startup timeout '+stderr)),15000);
 child.stdin.on('error',()=>{});child.stderr.on('data',bytes=>stderr+=bytes);
 createInterface({input:child.stdout}).on('line',line=>{let event;try{event=JSON.parse(line);}catch{return;}if(event.event==='loaded')loaded=true;if(event.event==='api_ready')url=event.url;if(event.event==='fatal'||event.event==='error')rejectReady(Error(event.error+' '+stderr));if(loaded&&url){clearTimeout(startup);resolveReady();}if(event.id!==undefined&&jobs.has(event.id)){const job=jobs.get(event.id);jobs.delete(event.id);clearTimeout(job.timer);job.resolve(event);}});
 const exit=new Promise(yes=>child.once('close',code=>{closed=true;clearTimeout(startup);rejectReady(Error('Player exited '+code+' '+stderr));for(const job of jobs.values()){clearTimeout(job.timer);job.reject(Error('Player exited'));}jobs.clear();yes(code);}));
 const session={child,get url(){return url;},async stop(){if(!closed){child.stdin.end('{"op":"quit"}\n');await Promise.race([exit,wait(3000).then(()=>child.kill())]);}clearTimeout(startup);sessions.delete(session);return exit;},command(request){return new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{jobs.delete(id);reject(Error('Native command timeout '+stderr));},6000);jobs.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({...request,id})+'\n');});}};
 sessions.add(session);
 try{
  await ready;const origin=new URL(url);assert.equal(origin.hostname,'127.0.0.1');assert.notEqual(origin.port,'443');
   session.api=await connectNativeApi(url);
  return session;
 }catch(error){error.exitCode=await session.stop();throw error;}
}
function ownerDesign(project){
 const result=structuredClone(project);result.manifest.description='Owner-authored design must survive a ROM update exactly';
 result.styles['owner.canvas']={scope:'global',name:'owner.canvas',attach:false,props:{bg_color:'#263548'}};
 result.styles['owner.button']={scope:'global',name:'owner.button',attach:false,props:{bg_color:'#923868',radius:11,border_width:2}};
 const screen=result.screens[result.manifest.entry];screen.root.styles.push({ref:'global-dynamic:owner.canvas'});screen.root.style.bg_color='#263548';
 function button(node){if(node.id==='go_raster')return node;for(const child of node.children??[]){const result=button(child);if(result)return result;}}
 const target=button(screen.root);assert.ok(target);target.styles.push({ref:'global-dynamic:owner.button'});target.style.radius=11;target.style.bg_color='#923868';
 return result;
}
async function inspectOwner(session){const result=await session.command({op:'inspect',nodes:[{id:'root'},{id:'go_raster'}]});assert.equal(result.ok,true,result.error);assert.equal(result.windowVisible,false);assert.equal(result.foreground,false);assert.equal(JSON.parse(result.dataJson).diagnostics.bindingErrors,0);assert.equal(result.nodes.find(node=>node.id==='root').background,0x263548);assert.equal(result.nodes.find(node=>node.id==='go_raster').radius,11);return result;}

try{
 await mkdir(output,{recursive:true});
 const a=JSON.parse(await readFile(join(here,'graphics-gallery.json'),'utf8'));a.manifest.name='Migration base A';a.manifest.description='ROM A';
 const b=structuredClone(a);b.manifest.name='Migration base B';b.manifest.description='ROM B';b.screens.base_added=structuredClone(b.screens.raster);b.screens.base_added.id='base_added';b.screens.base_added.name='Screen introduced by ROM B';
 await writeFile(basePath,JSON.stringify(a));await writeFile(recoveryA,JSON.stringify(a));await writeFile(wrongRecovery,JSON.stringify(b));
 const prefix=join(temporary,'automatic','changes');let session=await launch(prefix);
 const initial=await session.api.read(),aStatus=await session.api.status();const aRevision=aStatus.project.baseRevision;
 assert.equal(initial.revision,aRevision);await session.api.save({project:ownerDesign(initial.project),revision:initial.revision});
 const owner=await session.api.read();assert.notEqual(owner.revision,initial.revision);await session.api.show({screen:owner.project.manifest.entry});await inspectOwner(session);
 const originalSlots=await slots(prefix),originalCache=await slots(prefix+'.base.'+aRevision);assert.ok(Object.keys(originalSlots).length);assert.ok(Object.keys(originalCache).length,'initial base is cached through the migration helper');
 assert.equal(await session.stop(),0);

 await writeFile(basePath,JSON.stringify(b));session=await launch(prefix);
 const migrated=await session.api.read(),bStatus=await session.api.status(),bRevision=bStatus.project.baseRevision;
 assert.notEqual(bRevision,aRevision);assert.equal(migrated.revision,owner.revision);assert.deepEqual(migrated.project,owner.project,'automatic migration must preserve every effective owner document');await inspectOwner(session);
 await session.api.reset({revision:migrated.revision});const reset=await session.api.read();assert.equal(reset.revision,bRevision);assert.equal(reset.project.manifest.name,'Migration base B');assert.ok(reset.project.screens.base_added);assert.equal(reset.project.styles['owner.canvas'],undefined);assert.equal(await session.stop(),0);
 session=await launch(prefix);assert.deepEqual(await session.api.read(),reset,'reset must durably restore the new base');assert.equal(await session.stop(),0);

 const legacyPrefix=join(temporary,'legacy','changes');await writeSlots(legacyPrefix,originalSlots);await writeSlots(legacyPrefix+'.base.'+aRevision,originalCache);
 assert.ok(await removeTestCache(legacyPrefix,aRevision),'remove only this test prefix\'s exact old-base cache files');
 const beforeWrong=hashes(await slots(legacyPrefix));
 await assert.rejects(launch(legacyPrefix,wrongRecovery),error=>{assert.notEqual(error.exitCode,0);assert.match(error.message,/base|recovery|migrat/i);return true;});
 assert.deepEqual(hashes(await slots(legacyPrefix)),beforeWrong,'wrong recovery must not modify either durable owner slot');
 session=await launch(legacyPrefix,recoveryA);const recovered=await session.api.read();assert.deepEqual(recovered,owner,'the exact previous base recovers the full owner project');assert.equal((await session.api.status()).project.baseRevision,bRevision);await inspectOwner(session);assert.equal(await session.stop(),0);
 session=await launch(legacyPrefix);assert.deepEqual(await session.api.read(),owner,'the recovered store must reopen without the recovery option');assert.equal(await session.stop(),0);
 await writeFile(join(output,'measurements.json'),JSON.stringify({automaticMigration:true,exactOwnerProject:true,ownerRevision:owner.revision,oldBaseRevision:aRevision,newBaseRevision:bRevision,resetRevision:reset.revision,legacyRecovery:true,wrongRecoveryStoreUnchanged:true,wrongRecoverySlotHashes:beforeWrong,cacheDeletionScope:'owned test prefix only',executableSha256:sha(await readFile(exe))},null,2));
 console.log('PASS: native NaWServer/direct API base A -> B preserves the exact owner project/revision and rendered style; reset/restart restores B; legacy cache-missing recovery accepts only exact A, wrong recovery leaves both owner store slots unchanged');
}finally{
 await Promise.allSettled([...sessions].map(session=>session.stop()));
 assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert.ok(relative(resolve(tmpdir()),resolve(temporary)).startsWith('nacborui-base-migration-'));
 await rm(temporary,{recursive:true,force:true});
}
