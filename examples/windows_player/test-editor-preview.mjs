// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Real browser + native NaWServer/LVGL. No HTTP fixture server or OS input.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {ProjectClient} from '../../packages/project-codec/client.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const exe=resolve(process.argv[2]??join(root,'local/windows-player/Release/nacborui_player.exe'));
const browser=process.argv[3]??join(process.env.PROGRAMFILES??'', 'Google/Chrome/Application/chrome.exe');
const temporary=await mkdtemp(join(tmpdir(),'nacborui-editor-preview-')),output=join(root,'local/windows-editor-preview');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const players=[];let chrome,socket,call;
async function until(check,message,timeout=12000){const end=Date.now()+timeout;do{const result=await check();if(result)return result;await wait(80);}while(Date.now()<end);throw Error(message);}
async function player(name){
 const child=spawn(process.execPath,[join(root,'examples/windows_player/run.mjs'),'--profile','graphics','--exe',exe,'--api-port','0','--api-store',join(temporary,name),'--control','--hidden','--no-settings'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
 const state={child,api:null,loaded:false,stderr:'',exited:false};players.push(state);
 child.on('error',error=>state.error=error);child.on('exit',()=>state.exited=true);child.stderr.on('data',bytes=>state.stderr+=bytes);
 createInterface({input:child.stdout}).on('line',line=>{let event;try{event=JSON.parse(line);}catch{return;}if(event.event==='api_ready')state.api=event.url;if(event.event==='loaded')state.loaded=true;});
 await until(()=>{if(state.error||state.exited)throw state.error??Error(state.stderr);return state.api&&state.loaded;},'Native startup timeout');return state;
}
try{
 await mkdir(output,{recursive:true});const primary=await player('primary'),other=await player('other');
 const client=new ProjectClient(primary.api),before=await client.info(),otherBefore=await new ProjectClient(other.api).info();
 const profile=join(temporary,'chrome');
 chrome=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'--window-size=1440,1000','about:blank'],{windowsHide:true,stdio:'ignore'});
 let chromeError;chrome.on('error',error=>chromeError=error);
 const port=await until(async()=>{if(chromeError)throw chromeError;try{return (await readFile(join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0];}catch{return false;}},'Browser startup timeout');
 const target=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(item=>item.type==='page');
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((yes,no)=>{socket.onopen=yes;socket.onerror=no;});
 let next=0;const jobs=new Map(),requests=[],wsUrls=new Map(),wsSends=[],errors=[];
 socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const job=jobs.get(message.id);if(job){jobs.delete(message.id);clearTimeout(job.timer);message.error?job.no(Error(JSON.stringify(message.error))):job.yes(message.result);}}
 else if(message.method==='Network.requestWillBeSent')requests.push(message.params.request);
 else if(message.method==='Network.webSocketCreated')wsUrls.set(message.params.requestId,message.params.url);
 else if(message.method==='Network.webSocketFrameSent')wsSends.push({url:wsUrls.get(message.params.requestId),frame:message.params.response});
 else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);};
 call=(method,params={})=>new Promise((yes,no)=>{const id=++next,timer=setTimeout(()=>{jobs.delete(id);no(Error('CDP timeout '+method));},10000);jobs.set(id,{yes,no,timer});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const response=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails));return response.result.value;};
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const frameReady=()=>evaluate(`(()=>{const e=document.querySelector('.preview-panel .native-viewer-frame');return !!(e&&e.dataset.ready==='true'&&e.width);})()`);
 const screenshot=async name=>{const result=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(output,name+'.png'),Buffer.from(result.data,'base64'));};
 await call('Network.enable');await call('Runtime.enable');await call('Page.enable');
 await call('Page.navigate',{url:primary.api+'/editor/'});
 await until(()=>evaluate(`!!document.querySelector('[aria-label="Открыть проект с МК"]:not(:disabled)')`),'Editor connection unavailable');
 await click('[aria-label="Открыть проект с МК"]');
 await until(()=>evaluate(`document.querySelectorAll('.screen-menu-item').length>=5`),'Project not loaded');
 await click('.screen-menu-item');
 await until(()=>evaluate(`!!document.querySelector('.preview-tabs')`),'Missing preview tabs');
 assert.equal(await evaluate(`document.querySelector('.preview-tabs [aria-selected=true]').textContent`),'Макет');
 assert.equal(requests.filter(r=>new URL(r.url).pathname==='/api/view/frame').length,0,'Layout must not fetch native frames');
 await screenshot('layout');
 const start=requests.length,wsStart=wsSends.length;
 await click('.preview-tabs [role=tab]:nth-child(2)');await until(frameReady,'No native frame');
 await screenshot('lvgl');
 const native=await evaluate(`(()=>{const e=document.querySelector('.preview-panel .native-viewer-frame'),p=e.getBoundingClientRect(),s=e.closest('.native-viewer-stage').getBoundingClientRect();return {width:e.width,height:e.height,origin:document.querySelector('.native-viewer-origin').textContent,contained:p.left>=s.left&&p.right<=s.right+1&&p.top>=s.top&&p.bottom<=s.bottom+1,readonly:e.classList.contains('readonly')};})()`);
 assert.equal(native.origin,primary.api);assert.ok(native.contained&&native.readonly);assert.ok(native.width>0&&native.height>0);
 const progressiveToggle='[aria-label="Показывать по мере загрузки"]';
 const hasCompletedProgress=()=>evaluate(`(()=>{const p=document.querySelector('.native-viewer-progress');return p.max>1&&p.value===p.max;})()`);
 assert.equal(await evaluate(`document.querySelector(${JSON.stringify(progressiveToggle)}).getAttribute('aria-pressed')`),'false');
 await until(hasCompletedProgress,'Atomic frame progress missing');
 await click(progressiveToggle);
 assert.equal(await evaluate(`document.querySelector(${JSON.stringify(progressiveToggle)}).getAttribute('aria-pressed')`),'true');
 await until(hasCompletedProgress,'Progressive frame progress missing');
 assert.equal(await evaluate(`document.querySelector('.native-viewer-frame').getContext('2d').getImageData(0,0,1,1).data[3]`),255);
 await screenshot('lvgl-progressive');
 await click(progressiveToggle);await until(hasCompletedProgress,'Atomic frame did not resume');
 // Clicking the embedded image must be passive, even though /viewer supports input.
 await evaluate(`document.querySelector('.preview-panel .native-viewer-frame').dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1,bubbles:true,clientX:100,clientY:200}))`);
 for(let i=1;i<5;i++){
  await evaluate(`document.querySelectorAll('.screen-menu-item')[${i}].click()`);await wait(100);
  assert.equal(await evaluate(`document.querySelector('.preview-tabs [aria-selected=true]').textContent`),'LVGL');
  await click('.preview-tabs [role=tab]:first-child');await click('.preview-tabs [role=tab]:nth-child(2)');
 }
 await until(frameReady,'Frame did not recover after quick tab/page changes');
 // Pause is a local frame-delivery control and does not pause the target.
 await click('[aria-label="Приостановить просмотр"]');await wait(300);const pausedFrames=requests.filter(r=>new URL(r.url).pathname==='/api/view/frame').length;
 await wait(600);assert.equal(requests.filter(r=>new URL(r.url).pathname==='/api/view/frame').length,pausedFrames);
 await click('[aria-label="Продолжить просмотр"]');await until(()=>requests.filter(r=>new URL(r.url).pathname==='/api/view/frame').length>pausedFrames,'Resume did not fetch frames');
 const keyboard=await evaluate(`(async()=>{const tabs=document.querySelector('.preview-tabs');tabs.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));await new Promise(r=>setTimeout(r,10));return {selected:tabs.querySelector('[aria-selected=true]').textContent,focus:document.activeElement.getAttribute('role')};})()`);
 assert.deepEqual(keyboard,{selected:'Макет',focus:'tab'});
 await click('.preview-tabs [role=tab]:nth-child(2)');await until(frameReady,'Native tab did not resume');
 const geometry=await evaluate(`document.querySelector('.preview-content:has(.native-viewer)').getBoundingClientRect().toJSON()`);
 // Fail a real frame request through CDP (no alternate server), then recover.
 await call('Network.setBlockedURLs',{urls:[primary.api+'/api/view/frame']});
 await until(()=>evaluate(`document.querySelector('.preview-panel .native-viewer-state').classList.contains('bad')`),'Missing frame error');
 assert.deepEqual(await evaluate(`document.querySelector('.preview-content:has(.native-viewer)').getBoundingClientRect().toJSON()`),geometry,'Error changed panel geometry');
 await screenshot('frame-error');await call('Network.setBlockedURLs',{urls:[]});
 await until(()=>evaluate(`!document.querySelector('.preview-panel .native-viewer-state').classList.contains('bad')`),'No frame recovery');
 // Invalid/foreign device addresses must clear old pixels and never use the hosting device as fallback.
 const setDevice=async address=>{await evaluate(`(()=>{const e=document.querySelector('[aria-label="Device URL"]');e.value=${JSON.stringify(address)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await click('[aria-label="Подключить"]');};
 await setDevice(other.api);
 await until(()=>evaluate(`!document.querySelector('.preview-panel .native-viewer-frame')`),'Old device frame remains visible');
 await wait(600);assert.ok(requests.some(r=>r.url===other.api+'/api/info'),'Selected device was not used');
 assert.equal((await client.info()).project.revision,before.project.revision);
 await setDevice(primary.api);await until(frameReady,'Selected device did not reconnect');
 await evaluate(`document.querySelector('.language-button').click()`);
 assert.equal(await evaluate(`document.querySelector('.preview-tabs [role=tab]:first-child').textContent`),'Layout');
 await call('Emulation.setDeviceMetricsOverride',{width:1100,height:800,deviceScaleFactor:1,mobile:false});await wait(300);
 assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false,'Page has horizontal overflow');await screenshot('lvgl-en-1100');
 const after=await client.info(),otherAfter=await new ProjectClient(other.api).info();
 assert.deepEqual(after,before,'Passive navigation changed the runtime/project status');assert.deepEqual(otherAfter,otherBefore,'Selected other device changed');
 const mutations=requests.slice(start).filter(r=>r.method!=='GET'&&new URL(r.url).pathname.startsWith('/api/'));
 assert.deepEqual(mutations,[],'Passive viewing sent an API write');
 assert.deepEqual(wsSends.slice(wsStart).filter(item=>/\/(screen|component)-ws/.test(item.url)),[],'Passive viewing sent a render command');assert.deepEqual(errors,[]);
 await writeFile(join(output,'measurements.json'),JSON.stringify({native,selectedDevice:other.api,frames:requests.filter(r=>new URL(r.url).pathname==='/api/view/frame').length,atomicAndProgressive:true,passiveRuntimeUnchanged:true,apiWrites:mutations.length,keyboard,errorRecovery:true,viewport:[1100,800],crossOrigin:'Windows origin gate intentionally rejects other origins; no frame fallback',errors},null,2));
 console.log('PASS: real Chromium /editor through native NaWServer; Layout/LVGL, real bounded LVGL frame, passive page/tab/image, pause/resume, keyboard, stable errors/recovery, selected URL/reconnect, EN, 1100px layout; both runtime/project states unchanged, no API writes or render WS commands');
}finally{
 if(call)await call('Browser.close').catch(()=>{});socket?.close();
 if(chrome&&chrome.exitCode===null)chrome.kill();
 for(const state of players){if(!state.exited){state.child.stdin.end('{"op":"quit"}\n');await until(()=>state.exited,'Player exit timeout',5000).catch(()=>state.child.kill());}}
 await rm(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}
