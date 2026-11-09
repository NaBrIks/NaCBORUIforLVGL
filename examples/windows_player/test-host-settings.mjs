// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Real Windows DPAPI/NaWServer/MCP persistence. Never calls models or chat/completions.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const exe=resolve(process.argv[2]??join(root,'local/catalog-player/Release/nacborui_player.exe'));
const require=createRequire(new URL('../../integrations/mcp/package.json',import.meta.url));
const {Client}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/client')));
const {StdioClientTransport}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/client/stdio')));
const temporary=await mkdtemp(join(tmpdir(),'nacborui-host-settings-'));
const store=join(temporary,'защищённые настройки','assistant.dpapi'),projectStore=join(temporary,'project');
const expected={endpoint:'https://example.invalid/v1',model:'test-model-демо',key:'test-only-not-a-real-key'};
const filters={free_only:false,model_filter:'тестFilter'};
const wait=ms=>new Promise(yes=>setTimeout(yes,ms));
let active;let liveModelsChecked=false;
async function launch(){
 const child=spawn(process.execPath,[join(here,'run.mjs'),'--profile','graphics','--exe',exe,'--api-port','0','--api-store',projectStore,'--assistant-store',store,'--control','--hidden','--no-settings'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let loaded=false,url,closed=false,stderr='',next=0,readyResolve,readyReject,mcp;
 const pending=new Map(),ready=new Promise((yes,no)=>{readyResolve=yes;readyReject=no;});
 const startup=setTimeout(()=>readyReject(Error('Host settings startup timeout '+stderr)),20000);
 child.stderr.on('data',chunk=>stderr+=chunk);
 createInterface({input:child.stdout}).on('line',line=>{let e;try{e=JSON.parse(line);}catch{return;}
  if(e.event==='loaded')loaded=true;
  if(e.event==='api_ready')url=e.url;
  if(loaded&&url){clearTimeout(startup);readyResolve();}
  if(e.event==='fatal'||e.event==='error')readyReject(Error(e.error+' '+stderr));
  if(e.event==='result'&&pending.has(e.id)){const p=pending.get(e.id);pending.delete(e.id);clearTimeout(p.timer);p.yes(e);}
 });
 const exit=new Promise(yes=>child.once('close',code=>{closed=true;clearTimeout(startup);readyReject(Error('Host player exited '+code+' '+stderr));for(const p of pending.values()){clearTimeout(p.timer);p.no(Error('Host player exited'));}pending.clear();yes(code);}));
 const command=request=>new Promise((yes,no)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);no(Error('Host control timeout '+request.op));},10000);pending.set(id,{yes,no,timer});child.stdin.write(JSON.stringify({...request,id})+'\n');});
 const session={command,get stderr(){return stderr;},async stop(){await mcp?.close().catch(()=>{});mcp=null;if(!closed){child.stdin.end('{"op":"quit"}\n');await Promise.race([exit,wait(3000).then(()=>child.kill())]);}for(const p of pending.values())clearTimeout(p.timer);return exit;}};active=session;
 await ready;const origin=new URL(url);assert.equal(origin.hostname,'127.0.0.1');assert.notEqual(origin.port,'443');
 mcp=new Client({name:'windows-host-settings-test',version:'1.0.0'});
 await mcp.connect(new StdioClientTransport({command:process.execPath,args:[join(root,'integrations/mcp/index.js')],cwd:root,env:{PATH:process.env.PATH,LVGL_CBOR_DEVICE:origin.origin,LVGL_CBOR_ALLOW_DATA:'1'},stderr:'pipe'}));
 session.call=async(name,args={})=>{const result=await mcp.callTool({name,arguments:args},undefined,{timeout:15000});assert.equal(result.isError,undefined,JSON.stringify(result.content));return JSON.parse(result.content[0].text);};
 session.value=async name=>(await session.call('get_data',{name,detail:true})).items[0]?.value;
 session.completion=()=>session.value('assistant.completion');
 session.settle=async(before,predicate=()=>true)=>{const deadline=Date.now()+10000;let completion;do{completion=await session.completion();if(completion?.generation>before&&await session.value('assistant.busy')===false&&await predicate(completion))return completion;await wait(30);}while(Date.now()<deadline);assert.fail('No host completion after generation '+before+': '+JSON.stringify(completion));};
 return session;
}
async function publicSafe(s){
 const catalog=await s.call('get_data_catalog',{kind:'sources',group:'assistant',limit:32,maxBytes:16384});
 assert.ok(catalog.items.some(x=>x.name==='assistant.key_present'));assert.ok(catalog.items.every(x=>!['assistant.key','assistant.api_key','assistant.secret'].includes(x.name)));
 const snapshot=await s.call('get_data',{snapshot:true,maxBytes:16384}),project=await s.call('read_project');
 for(const json of [JSON.stringify(catalog),JSON.stringify(snapshot),JSON.stringify(project)])assert.ok(!json.includes(expected.key),'public catalog/data/project must not expose the key');
 const inspect=await s.command({op:'inspect'});assert.equal(inspect.ok,true);assert.equal(inspect.windowVisible,false);assert.equal(inspect.foreground,false);assert.ok(!inspect.dataJson.includes(expected.key));const diagnostics=JSON.parse(inspect.dataJson).diagnostics;assert.equal(diagnostics.bindingErrors,0);assert.equal(diagnostics.queueDropped,0);
 return {sources:catalog.items.map(x=>x.name),diagnostics};
}
try{
 let s=await launch();const initial=await s.settle(0,c=>c.ok);assert.equal(await s.value('assistant.key_present'),false);assert.equal(await s.value('assistant.free_only'),true);assert.equal(await s.value('assistant.model_filter'),'');assert.equal(await s.value('assistant.model'),'qwen/qwen3.8-27b:free');
 if(process.argv.includes('--live-models')){
  const generation=(await s.completion()).generation;assert.equal((await s.call('invoke_action',{name:'assistant.list_models',args:true})).result.ok,true);
  await s.settle(generation,c=>c.ok);let catalog=await s.value('assistant.model_catalog');
  assert.ok(Array.isArray(catalog));assert.ok(catalog.length<=64);assert.ok(catalog.every(model=>model.free===true&&typeof model.id==='string'&&typeof model.title==='string'));
  assert.deepEqual((await s.value('assistant.models')).split('\n').filter(id=>id!=='—'),catalog.map(model=>model.id));
  assert.equal(await s.value('assistant.model'),'qwen/qwen3.8-27b:free','unavailable preset never becomes an automatic fallback');
  if(!catalog.some(model=>model.id==='qwen/qwen3.8-27b:free'))assert.match(await s.value('assistant.status'),/недоступна/);
  await s.call('write_source',{source:'assistant.model_filter',value:'__not_an_actual_model__'});
  const filtered=(await s.completion()).generation;await s.call('invoke_action',{name:'assistant.list_models',args:false});await s.settle(filtered,c=>c.ok);
  assert.deepEqual(await s.value('assistant.model_catalog'),[],'filtering the full cached catalog can legitimately return no rows');
  await s.call('write_source',{source:'assistant.model_filter',value:''});liveModelsChecked=true;
 }
 // Exercise the actual current-user DPAPI native callbacks with Unicode and damaged ciphertext.
 const plain='Проверка DPAPI · Київ · 漢字 · 🌿';
 const encrypted=await s.command({op:'protect_secret',text:plain});assert.equal(encrypted.ok,true);assert.ok(encrypted.text.length>plain.length);assert.ok(!encrypted.text.includes(plain));
 const decrypted=await s.command({op:'unprotect_secret',text:encrypted.text});assert.equal(decrypted.ok,true);assert.equal(decrypted.text,plain);
 const bytes=Buffer.from(encrypted.text,'base64');bytes[bytes.length-1]^=0x80;
 const tampered=await s.command({op:'unprotect_secret',text:bytes.toString('base64')});assert.equal(tampered.ok,false,'tampered DPAPI must fail closed');
 for(const [field,value] of Object.entries({endpoint:expected.endpoint,model:expected.model,...filters})){const r=await s.call('write_source',{source:'assistant.'+field,value});assert.equal(r.state,'completed');assert.equal(r.result.ok,true);}
 const before=(await s.completion()).generation;
 const accepted=await s.call('invoke_action',{name:'assistant.key',args:expected.key});assert.equal(accepted.state,'completed');assert.equal(accepted.result.ok,true);assert.ok(!JSON.stringify(accepted).includes(expected.key));
 const configured=await s.settle(before,c=>c.ok);assert.equal(configured.ok,true);
 assert.equal(await s.value('assistant.key_present'),true);assert.equal(await s.value('assistant.endpoint'),expected.endpoint);assert.equal(await s.value('assistant.model'),expected.model);assert.equal(await s.value('assistant.free_only'),filters.free_only);assert.equal(await s.value('assistant.model_filter'),filters.model_filter);
 const file=await readFile(store);assert.ok(file.length>64);assert.ok(!file.includes(Buffer.from(filters.model_filter,'utf8')),'filter text is inside the encrypted whole config');for(const value of Object.values(expected)){assert.ok(!file.includes(Buffer.from(value,'utf8')),'DPAPI file must not contain plaintext config');assert.ok(!file.includes(Buffer.from(value,'utf16le')),'DPAPI file must not contain UTF16 plaintext config');}
 assert.deepEqual(await readdir(dirname(store)),['assistant.dpapi'],'no plaintext/temp backup beside the encrypted file');
 const firstPublic=await publicSafe(s);
 await s.call('send_event',{node:'go_settings',event:'clicked'});await wait(60);let inspect=await s.command({op:'inspect'});const instance=inspect.views[0].pageInstance;
 inspect=await s.command({op:'inspect',nodes:[{id:'assistant_key',instance},{id:'assistant_endpoint',instance},{id:'assistant_model',instance}]});assert.equal(inspect.nodes[0].text,'[redacted]');assert.equal(inspect.nodes[1].text,expected.endpoint);assert.equal(inspect.nodes[2].text,expected.model);
 // A rejected configuration must preserve the encrypted file and the fixed settings geometry.
 const settingsGeometry=inspect.nodes.map(n=>({id:n.id,bounds:n.bounds}));
 const validCiphertext=await readFile(store),errorGeneration=(await s.completion()).generation;
 assert.equal((await s.call('write_source',{source:'assistant.endpoint',value:'not an endpoint'})).result.ok,true);
 assert.equal((await s.call('invoke_action',{name:'assistant.save',args:true})).result.ok,true);
 const rejected=await s.settle(errorGeneration,c=>c.ok===false);assert.equal(rejected.ok,false);
 assert.deepEqual(await readFile(store),validCiphertext,'rejected config cannot replace protected settings');
 assert.equal(await s.value('assistant.endpoint'),expected.endpoint,'failed config restores the confirmed endpoint');assert.equal(await s.value('assistant.key_present'),true);
 inspect=await s.command({op:'inspect',nodes:[{id:'assistant_key',instance},{id:'assistant_endpoint',instance},{id:'assistant_model',instance}]});
 assert.deepEqual(inspect.nodes.map(n=>({id:n.id,bounds:n.bounds})),settingsGeometry,'error status never shifts native settings fields');
 await publicSafe(s);
 assert.ok(!s.stderr.includes(expected.key));assert.equal(await s.stop(),0);active=null;
 // Same encrypted file, independent process and real load reply (not a cached registry snapshot).
 s=await launch();const restored=await s.settle(0,c=>c.ok);assert.equal(restored.ok,true);
 assert.equal(await s.value('assistant.key_present'),true);assert.equal(await s.value('assistant.endpoint'),expected.endpoint);assert.equal(await s.value('assistant.model'),expected.model);assert.equal(await s.value('assistant.free_only'),filters.free_only);assert.equal(await s.value('assistant.model_filter'),filters.model_filter);const secondPublic=await publicSafe(s);
 const generation=(await s.completion()).generation;const save=await s.call('invoke_action',{name:'assistant.save',args:true});assert.equal(save.result.ok,true);const saved=await s.settle(generation,c=>c.ok);assert.equal(saved.ok,true);
 const savedFile=await readFile(store);assert.ok(!savedFile.includes(Buffer.from(expected.key)));assert.ok(!s.stderr.includes(expected.key));
 const output=join(root,'local/windows-host-settings');await mkdir(output,{recursive:true});await writeFile(join(output,'acceptance.json'),JSON.stringify({nativeDpapiUnicodeRoundtrip:true,tamperedCiphertextRejected:true,encryptedFileBytes:savedFile.length,plaintextAbsent:true,noPlaintextSidecars:true,keyAbsentFromPublicData:true,passwordInspectRedacted:true,settingsRestoredAcrossProcessRestart:true,filtersRestoredAcrossProcessRestart:true,failedConfigurationPreservesCiphertext:true,errorGeometryStable:true,completion:{initial,configured,rejected,restored,saved},assistantSources:firstPublic.sources,diagnostics:firstPublic.diagnostics,restoredDiagnostics:secondPublic.diagnostics,providerCalls:liveModelsChecked?'public metadata GET only':0,completionRequests:0,liveModelsChecked,hidden:true},null,2));
 assert.equal(await s.stop(),0);active=null;
 console.log((liveModelsChecked?'Public metadata catalog/free filtering PASS; ':'')+'PASS: real native DPAPI Unicode roundtrip/tamper rejection; MCP settings and dummy key encrypted without plaintext/sidecars/public exposure; independent process restart restores config/key_present; confirmed host completions, hidden LVGL, no completion requests');
}finally{await active?.stop();await rm(temporary,{recursive:true,force:true});}
