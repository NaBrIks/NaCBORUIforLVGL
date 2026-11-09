// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';import assert from 'node:assert/strict';
import {createAssistant,assistantUserContent} from '../examples/windows_player/assistant.mjs';
import {createAssistantChat} from '../examples/windows_player/assistant-chat.mjs';
const response=content=>new Response(JSON.stringify({choices:[{message:{role:'assistant',content}}]}),{headers:{'Content-Type':'application/json'}});
const png=Buffer.alloc(24);png.set([137,80,78,71,13,10,26,10]);png.write('IHDR',12);png.writeUInt32BE(2,16);png.writeUInt32BE(2,20);
test('A real MCP-backed conversation keeps earlier user/assistant messages and images, and New chat clears them',async t=>{
 let calls=0;const seen=[];const engine=createAssistant({origin:'http://127.0.0.1:9',storePath:null,fetcher:async(url,options)=>{
  if(url.endsWith('/models'))return new Response(JSON.stringify({data:[{id:'fixture',supported_parameters:['tools'],architecture:{input_modalities:['text','image']}}]}));
  const body=JSON.parse(options.body);seen.push(body.messages);calls++;return response(calls===1?'First answer':'Second answer');
 }});t.after(()=>engine.close());await engine.handle({kind:'configure',payload:{model:'fixture',key:'test-key',freeOnly:false}});
 const image={name:'reference.png',mime:'image/png',data:png.toString('base64')};
 let result=await engine.handle({kind:'prompt',payload:{prompt:'Remember marker alpha and this picture',images:[image]}});assert.ok(result.ok,result.error);const id=result.state.chat.id;assert.equal(result.state.chat.total,2);assert.equal(result.state.chat.messages[0].files,'reference.png');assert.ok(!JSON.stringify(result.state.chat).includes(image.data));
 result=await engine.handle({kind:'prompt',payload:{prompt:'Change only its color'}});assert.ok(result.ok,result.error);assert.equal(result.state.chat.id,id);assert.equal(result.state.chat.total,4);assert.equal(seen[1].filter(m=>m.role==='system').length,1);assert.ok(seen[1].some(m=>m.role==='assistant'&&m.content==='First answer'));assert.ok(seen[1].some(m=>Array.isArray(m.content)&&m.content.some(p=>p.type==='image_url')));assert.equal(seen[1].at(-1).content,'Change only its color');
 const loaded=await engine.handle({kind:'load'});assert.equal(loaded.state.chat.total,4);
 result=await engine.handle({kind:'new_chat'});assert.ok(result.ok);assert.notEqual(result.state.chat.id,id);assert.equal(result.state.chat.total,0);
 await engine.handle({kind:'prompt',payload:{prompt:'Start clean'}});assert.equal(seen[2].length,2);assert.equal(seen[2][1].content,'Start clean');
});
test('JSON attachments stay text, are validated and do not require a vision model',async t=>{
 const json={format:'lvgl-screen-draft-1',id:'previous',root:{id:'root',type:'obj'}};const document={name:'old.json',mime:'application/json',data:Buffer.from(JSON.stringify(json)).toString('base64')};const content=assistantUserContent('Compare', [document]);assert.ok(content.every(p=>p.type==='text'));assert.match(content[1].text,/previous/);assert.throws(()=>assistantUserContent('Bad',[{...document,data:Buffer.from('broken').toString('base64')}]),/JSON/);
 let request=0;const e=createAssistant({origin:'http://127.0.0.1:9',storePath:null,fetcher:async(url,options)=>{assert.ok(!url.endsWith('/models'),'text-only JSON does not trigger vision discovery');const body=JSON.parse(options.body);if(++request===2)assert.ok(body.messages.some(m=>Array.isArray(m.content)&&m.content.some(p=>p.text?.includes('old.json'))));return response('OK');}});t.after(()=>e.close());await e.handle({kind:'configure',payload:{model:'fixture',key:'key',freeOnly:false}});assert.ok((await e.handle({kind:'prompt',payload:{prompt:'Use previous',images:[document]}})).ok);assert.ok((await e.handle({kind:'prompt',payload:{prompt:'Continue'}})).ok);
});
test('Interrupted tool batches remain a valid transcript and pages never drop historical entries',()=>{
 const c=createAssistantChat();let messages=c.begin('System','User','User');messages.push({role:'assistant',content:null,tool_calls:[{id:'same'},{id:'pending'}]},{role:'tool',tool_call_id:'same',content:'ok'});c.remember(messages);c.fail('Cancelled');messages=c.begin('New system','Next','Next');assert.ok(messages.some(m=>m.role==='tool'&&m.tool_call_id==='pending'));assert.ok(!messages.some(m=>m.role==='system'&&m.content==='System'));
 for(let i=0;i<20;i++){c.answer(messages,'x'.repeat(2000));c.remember(messages);}const all=new Set();let offset=0;while(offset>=0){c.page(offset);const page=c.public(v=>v);assert.ok(Buffer.byteLength(JSON.stringify(page))<16384);for(const item of page.messages)all.add(item.id);offset=page.nextOffset;}assert.equal(all.size,c.public(v=>v).total);c.reset();assert.equal(c.public(v=>v).total,0);
});

test('Browser JSON references use the existing bounded attachment transport without becoming image content',async()=>{
 const {prepareAssistantAttachment,uploadAssistantImages}=await import('../frontend/src/state/assistant-images.js');const previous=globalThis.FileReader;
 globalThis.FileReader=class{async readAsDataURL(blob){this.result='data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload();}};
 try{const file=new Blob([JSON.stringify({format:'lvgl-screen-draft-1',id:'old'})],{type:'application/json'});const prepared=await prepareAssistantAttachment(file);assert.equal(prepared.mime,'application/json');const calls=[];await uploadAssistantImages({async invoke(name,args){calls.push({name,args});return {state:'completed'};}},[prepared],{}, {id:'json'});assert.equal(calls[1].args.mime,'application/json');const raw=Buffer.from(calls.filter(c=>c.name==='assistant.image_chunk').map(c=>c.args.data).join(''),'base64');assert.equal(JSON.parse(raw).id,'old');}finally{globalThis.FileReader=previous;}
});
