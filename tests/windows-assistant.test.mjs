// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAssistant,assistantLimits,assistantDefaultModel,assistantUserContent} from '../examples/windows_player/assistant.mjs';
import {assistantInstructions} from '../examples/windows_player/assistant-guide.mjs';
const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const call=(name,args={},id='tool-1')=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const complete=message=>response({choices:[{message:{role:'assistant',...message}}]});
function engine(options={}){return createAssistant({origin:'http://127.0.0.1:9',storePath:null,...options});}
const configure=(e,extra={})=>e.handle({id:1,kind:'configure',payload:{model:'example/model',key:'test-secret',freeOnly:false,...extra}});

test('Assistant whole config uses native encryption callbacks; public state never contains the key',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'nacborui-assistant-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const storePath=join(directory,'config.dpapi'),protectedValues=[],replies=[];let calls=0;
  const secretProtect=async value=>{protectedValues.push(JSON.parse(value));return 'test-cipher:'+Buffer.from(value).toString('base64');};
  const secretUnprotect=async value=>Buffer.from(value.slice('test-cipher:'.length),'base64').toString();
  const options={storePath,secretProtect,secretUnprotect,onReply:r=>replies.push(r),fetcher:async()=>{calls++;throw Error('must not call a model');}};
  let e=engine(options);t.after(()=>e.close());
  assert.equal((await e.handle({id:1,kind:'load'})).state.keyPresent,false);
  const configured=await e.handle({id:2,kind:'configure',payload:{endpoint:'https://example.test/api/v1/',model:'a/model',key:'new-secret'}});
  assert.equal(configured.ok,true);assert.equal(configured.state.endpoint,'https://example.test/api/v1');
  assert.equal(protectedValues.at(-1).key,'new-secret');assert.equal(protectedValues.at(-1).model,'a/model');
  const encrypted=await readFile(storePath,'utf8');assert.ok(!encrypted.includes('new-secret'));assert.ok(!encrypted.includes('example.test'));
  await e.handle({id:3,kind:'configure',payload:{key:'  ',model:'b/model'}});assert.equal(protectedValues.at(-1).key,'new-secret');
  await e.close();e=engine(options);assert.equal((await e.handle({id:4,kind:'load'})).state.model,'b/model');
  assert.equal((await e.handle({id:5,kind:'configure',payload:{clearKey:true}})).state.keyPresent,false);
  assert.equal(calls,0,'load/configure never issue a completion');
  assert.ok(!JSON.stringify(replies).includes('new-secret'));
});

test('Assistant models preserve provider order and expose complete paged counts',async t=>{
  const e=engine({fetcher:async(url,options)=>{assert.equal(options.method,'GET');assert.ok(url.endsWith('/models'));return response({data:Array.from({length:200},(_,i)=>({id:'model/'+i,name:'Модель '+i,pricing:{prompt:'0',completion:'0'},supported_parameters:i===0?['temperature']:['tools']}))});}});t.after(()=>e.close());
  await e.handle({id:1,kind:'configure',payload:{model:'model/199'}});
  const result=await e.handle({id:2,kind:'models'});assert.equal(result.ok,true);assert.equal(result.state.models[0].id,'model/1');assert.deepEqual(result.state.modelPage,{offset:0,total:199,shown:64});assert.equal(result.state.model,'model/199');
  const next=await e.handle({id:3,kind:'models',payload:{offset:64}});assert.equal(next.state.models[0].id,'model/65');assert.equal(next.state.modelPage.offset,64);
  assert.ok(result.state.models.length<=64);assert.ok(Buffer.byteLength(JSON.stringify(result.state.models))<=8192);
  assert.ok(!result.state.models.some(model=>model.id==='model/0'));assert.match(result.state.status,/не показаны/);
});

test('Assistant prompt uses real MCP stdio discovery and execution with an in-memory provider',async t=>{
  let rounds=0;const e=engine({fetcher:async(url,options)=>{
    assert.ok(url.endsWith('/chat/completions'));assert.equal(options.headers.Authorization,'Bearer test-secret');
    const body=JSON.parse(options.body);assert.equal(body.messages[0].role,'system');assert.ok(body.messages[0].content.startsWith(assistantInstructions),'full permanent guide is in system role, before the user and tool results');assert.equal(body.messages[1].role,'user');assert.equal(body.stream,false);assert.equal(Object.hasOwn(body,'parallel_tool_calls'),false,'unsupported parallel_tool_calls must not exclude strict providers');
    const names=body.tools.map(tool=>tool.function.name);assert.ok(names.includes('preview_project'));assert.ok(names.includes('read_project_document'));assert.ok(names.includes('reset_project_changes'),'the configured MCP catalog is the single source of available tools');
    if(++rounds===1)return complete({content:null,tool_calls:[call('get_example',{kind:'style'})]});
    const result=JSON.parse(body.messages.at(-1).content);assert.equal(result.isError,undefined);
    const style=result;assert.equal(style.scope,'global');assert.equal(style.content,undefined,'model receives actual JSON data, not the escaped MCP content envelope');
    assert.ok(!JSON.stringify(body.messages).includes('test-secret'));
    return complete({content:'Получен настоящий пример стиля через MCP.'});
  }});t.after(()=>e.close());await configure(e);
  const result=await e.handle({id:2,kind:'prompt',payload:{prompt:'Покажи пример оформления'}});
  assert.equal(result.ok,true,result.error);assert.match(result.state.reply,/через MCP/);assert.equal(rounds,2);assert.equal(result.state.busy,false);
});

test('Assistant delegates registered operations to the actual API and rejects undiscovered tools',async t=>{
  let round=0;const e=engine({fetcher:async(_url,options)=>{
    const body=JSON.parse(options.body);
    if(++round===1)return complete({tool_calls:[call('invoke_action',{name:'assistant.send'},'self'),call('send_event',{node:'assistant_send',event:'clicked'},'event'),call('os.exec',{command:'anything'},'os'),call('get_contract',{kind:'style'},'large')]});
    const results=body.messages.filter(message=>message.role==='tool').map(message=>JSON.parse(message.content));
    assert.equal(results.length,4);assert.ok(results.every(result=>result.isError));assert.ok(results.slice(0,2).every(result=>!/not allowed/i.test(result.error??'')),'application names are not rejected by a host namespace filter');assert.match(results[3].error,/Tool is not allowed/);
    for(const message of body.messages.filter(message=>message.role==='tool'))assert.ok(Buffer.byteLength(message.content)<=assistantLimits.toolBytes);
    return complete({content:'Недопустимые вызовы отклонены.'});
  }});t.after(()=>e.close());await configure(e);
  const result=await e.handle({id:2,kind:'prompt',payload:{prompt:'Проверка границ'}});assert.equal(result.ok,true,result.error);assert.equal(round,2);
});

test('Assistant enforces tool call and model round budgets',async t=>{
  for(const budget of ['calls','rounds']){
    let requests=0;const e=engine({fetcher:async()=>{requests++;return complete({tool_calls:Array.from({length:budget==='calls'?assistantLimits.calls+1:1},(_,i)=>call('get_example',{kind:'style'},'call-'+i))});}});t.after(()=>e.close());await configure(e);
    const result=await e.handle({id:2,kind:'prompt',payload:{prompt:'Endless tool loop'}});
    assert.equal(result.ok,false);assert.match(result.error,/лимит|limit/);assert.ok(requests<=assistantLimits.rounds);
    await e.close();
  }
});

test('Assistant has one active job, supports cancellation and redacts provider failures',async t=>{
  let ready;const started=new Promise(yes=>ready=yes);
  const e=engine({fetcher:async(_url,{signal})=>{ready();return new Promise((_yes,no)=>signal.addEventListener('abort',()=>no(signal.reason),{once:true}));}});t.after(()=>e.close());await configure(e);
  const running=e.handle({id:2,kind:'prompt',payload:{prompt:'Wait'}});await started;
  const second=await e.handle({id:3,kind:'models'});assert.equal(second.ok,false);assert.match(second.error,/busy/);
  await e.handle({id:4,kind:'cancel'});const stopped=await running;assert.equal(stopped.ok,false);assert.equal(stopped.state.busy,false);assert.match(stopped.error,/cancelled/);
  const redacted=engine({fetcher:async()=>{throw Error('Rejected key test-secret');}});t.after(()=>redacted.close());await configure(redacted);
  const failed=await redacted.handle({id:2,kind:'prompt',payload:{prompt:'Try'}});assert.equal(failed.ok,false);assert.ok(!JSON.stringify(failed).includes('test-secret'));
});

test('Assistant close awaits MCP cleanup and suppresses replies to a destroyed host',async()=>{
  let ready;const started=new Promise(yes=>ready=yes),replies=[];
  const e=engine({onReply:reply=>replies.push(reply),fetcher:async(_url,{signal})=>{ready();return new Promise((_yes,no)=>signal.addEventListener('abort',()=>no(signal.reason),{once:true}));}});
  await configure(e);replies.length=0;
  const running=e.handle({id:2,kind:'prompt',payload:{prompt:'Close during request'}});await started;
  const beforeClose=replies.length;assert.ok(replies.every(reply=>reply.progress===true));await e.close();const result=await running;assert.equal(result.ok,false);assert.equal(result.state.busy,false);assert.equal(replies.length,beforeClose);
});

test('Current native endpoint/model fields are applied and encrypted before models or prompt',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'nacborui-assistant-fields-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const snapshots=[];const e=engine({storePath:join(directory,'settings.dpapi'),secretProtect:async text=>{snapshots.push(JSON.parse(text));return Buffer.from(text).toString('base64');},secretUnprotect:async text=>Buffer.from(text,'base64').toString(),
    fetcher:async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer test-secret');if(options.method==='GET'){assert.equal(url,'https://alternate.test/v1/models');return response({data:[]});}assert.equal(url,'https://alternate.test/v1/chat/completions');assert.equal(JSON.parse(options.body).model,'current/model');return complete({content:'Текущая модель выбрана.'});}});t.after(()=>e.close());
  await configure(e);
  assert.equal((await e.handle({id:2,kind:'models',payload:{endpoint:'https://alternate.test/v1',model:'list/model'}})).ok,true);
  const result=await e.handle({id:3,kind:'prompt',payload:{model:'current/model',prompt:'Проверка текущего выбора'}});
  assert.equal(result.ok,true,result.error);assert.equal(snapshots.at(-1).model,'current/model');assert.equal(snapshots.at(-1).key,'test-secret');
});

test('Fresh defaults keep the exact requested model; old encrypted configs preserve explicit model choices',async t=>{
  const e=engine();t.after(()=>e.close());const fresh=await e.handle({id:1,kind:'load'});
  assert.equal(fresh.state.model,assistantDefaultModel);assert.equal(fresh.state.freeOnly,true);assert.equal(fresh.state.modelFilter,'');
  const dir=await mkdtemp(join(tmpdir(),'nacborui-assistant-migrate-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const storePath=join(dir,'old.dpapi'),old={format:'nacborui-assistant-config-1',endpoint:'https://example.test/api/v1',model:'liquid/lfm-3-1.7b',key:'kept-test-key'};
  await writeFile(storePath,Buffer.from(JSON.stringify(old)).toString('base64'));
  const options={storePath,secretProtect:async text=>Buffer.from(text).toString('base64'),secretUnprotect:async text=>Buffer.from(text,'base64').toString()};
  let restored=engine(options);t.after(()=>restored.close());let state=(await restored.handle({id:1,kind:'load'})).state;
  assert.equal(state.model,old.model);assert.equal(state.freeOnly,true);assert.equal(state.modelFilter,'');
  assert.equal((await restored.handle({id:2,kind:'configure',payload:{freeOnly:false,modelFilter:'Квант'}})).ok,true);
  const persisted=JSON.parse(Buffer.from(await readFile(storePath,'utf8'),'base64').toString());assert.equal(persisted.freeOnly,false);assert.equal(persisted.modelFilter,'Квант');assert.equal(persisted.key,old.key);
  await restored.close();restored=engine(options);state=(await restored.handle({id:3,kind:'load'})).state;
  assert.equal(state.freeOnly,false);assert.equal(state.modelFilter,'Квант');assert.equal(state.model,old.model);
});

test('Free model filtering uses exact catalog prices, never coercion, suffixes or paid duplicate entries',async t=>{
  const wrong=[undefined,null,'',' ',false,true,[],{},'-0','-0.0','-1','1e-400','0x0','0paid','NaN','Infinity',0,0.00001];
  const data=wrong.map((price,i)=>({id:'invalid/'+i+':free',pricing:{prompt:price,completion:'0'}}));
  data.push(...['0','0.000','0e-400'].map((price,i)=>({id:'zero/'+i,pricing:{prompt:price,completion:price}})),
    {id:'missing-completion:free',pricing:{prompt:'0'}},{id:'request-fee:free',pricing:{prompt:'0',completion:'0',request:'0.1'}},
    {id:'override-fee:free',pricing:{prompt:'0',completion:'0',overrides:[{prompt:'0.01'}]}},
    {id:'conflicting:free',pricing:{prompt:'0',completion:'0'}},{id:'conflicting:free',pricing:{prompt:'0.01',completion:'0'}},
    {id:'negative-json-zero',pricing:{prompt:'__negative_zero__',completion:'0'}},
    {id:'numeric-underflow',pricing:{prompt:'__positive_underflow__',completion:'0'}});
  const e=engine({fetcher:async()=>new Response(JSON.stringify({data}).replace('"__negative_zero__"','-0').replace('"__positive_underflow__"','1e-400'),{headers:{'Content-Type':'application/json'}})});t.after(()=>e.close());const result=await e.handle({id:1,kind:'models'});
  assert.equal(result.ok,true,result.error);assert.deepEqual(result.state.models.map(m=>m.id),['zero/0','zero/1','zero/2']);assert.ok(result.state.models.every(m=>m.free===true));
  assert.equal(result.state.model,assistantDefaultModel);assert.match(result.state.status,/сейчас недоступна/);
});

test('Full catalog is filtered before display bounds and retains selected ID only inside the active filters',async t=>{
  let fetches=0;const data=Array.from({length:220},(_,i)=>({id:'model/'+i,name:'Модель '+i,pricing:{prompt:i%2?'0':'0.01',completion:'0'}}));
  data[199].name='Длинное название '.repeat(15)+' НУЖНАЯ';
  const e=engine({fetcher:async()=>{fetches++;return response({data});}});t.after(()=>e.close());
  await e.handle({id:1,kind:'configure',payload:{model:'model/198'}});
  let result=await e.handle({id:2,kind:'models',payload:{modelFilter:'нужная'}});
  assert.deepEqual(result.state.models.map(m=>m.id),['model/199']);assert.equal(result.state.freeOnly,true);
  result=await e.handle({id:3,kind:'models',payload:{modelFilter:'MODEL/197'}});assert.deepEqual(result.state.models.map(m=>m.id),['model/197']);
  result=await e.handle({id:4,kind:'models',payload:{modelFilter:'model/198'}});assert.equal(result.state.models.length,0,'paid selected model cannot bypass filters');
  result=await e.handle({id:5,kind:'models',payload:{freeOnly:false}});assert.deepEqual(result.state.models.map(m=>m.id),['model/198']);assert.equal(result.state.models[0].free,false);
  assert.equal(fetches,1,'as-you-type filters reuse one full catalog');
});

test('Unknown, paid, missing-price and unavailable models cannot produce a completion with freeOnly enabled',async t=>{
  for(const kind of ['paid','unknown','missing-price','unavailable']){
    let posts=0,gets=0;const e=engine({fetcher:async(_url,options)=>{if(options.method==='POST'){posts++;return complete({content:'Must not run'});}gets++;if(kind==='unavailable')return new Response('',{status:503});return response({data:kind==='unknown'?[]:[{id:'chosen',pricing:kind==='paid'?{prompt:'0.1',completion:'0'}:{prompt:'0'}}]});}});t.after(()=>e.close());
    await configure(e,{model:'chosen',freeOnly:true});const result=await e.handle({id:2,kind:'prompt',payload:{prompt:'Do not bill'}});
    assert.equal(result.ok,false,kind);assert.equal(posts,0,kind+' must fail before POST');assert.equal(gets,1);await e.close();
  }
});

test('Catalog TTL, explicit refresh, endpoint and key changes refresh metadata and enforce updated prices',async t=>{
  let time=0,gets=0,posts=0,price='0';const e=engine({now:()=>time,fetcher:async(_url,options)=>{if(options.method==='POST'){posts++;return complete({content:'Never'});}gets++;return response({data:[{id:'chosen',name:'Chosen model',pricing:{prompt:price,completion:'0'}}]});}});t.after(()=>e.close());
  await configure(e,{model:'chosen',freeOnly:true});assert.equal((await e.handle({id:2,kind:'models'})).ok,true);
  await e.handle({id:3,kind:'models',payload:{modelFilter:'chosen'}});assert.equal(gets,1);
  await e.handle({id:4,kind:'models',payload:{refresh:true}});assert.equal(gets,2);
  price='1';time=assistantLimits.catalogTtlMs+1;const rejected=await e.handle({id:5,kind:'prompt',payload:{prompt:'Price changed'}});assert.equal(rejected.ok,false);assert.equal(gets,3);assert.equal(posts,0);assert.equal(rejected.state.models.length,0);
  await e.handle({id:6,kind:'configure',payload:{key:'another-test-key'}});await e.handle({id:7,kind:'models'});assert.equal(gets,4);
  await e.handle({id:8,kind:'configure',payload:{endpoint:'https://another.test/v1'}});await e.handle({id:9,kind:'models'});assert.equal(gets,5);
});

test('Every free-only tool-loop POST contains zero-price routing and never a fallback model',async t=>{
  let gets=0,posts=0;const e=engine({fetcher:async(_url,options)=>{
    if(options.method==='GET'){gets++;return response({data:[{id:'chosen',pricing:{prompt:'0',completion:'0'},supported_parameters:['tools']}]});}
    posts++;const body=JSON.parse(options.body);assert.equal(body.model,'chosen');assert.equal(body.models,undefined);assert.deepEqual(body.provider.max_price,{prompt:0,completion:0,request:0});assert.equal(body.provider.allow_fallbacks,false);
    return posts===1?complete({tool_calls:[call('get_example',{kind:'style'})]}):complete({content:'Free fixture completed.'});
  }});t.after(()=>e.close());await configure(e,{model:'chosen',freeOnly:true});const result=await e.handle({id:2,kind:'prompt',payload:{prompt:'Read only'}});
  assert.equal(result.ok,true,result.error);assert.equal(gets,1);assert.equal(posts,2);
});

test('Filter types and UTF-8 bounds are validated and model options remain inside both wire budgets',async t=>{
  const data=Array.from({length:64},(_,i)=>({id:'x'.repeat(120)+i,name:'К'.repeat(64),pricing:{prompt:'0',completion:'0'}}));
  const e=engine({fetcher:async()=>response({data})});t.after(()=>e.close());
  for(const payload of [{freeOnly:null},{freeOnly:'true'},{modelFilter:null},{modelFilter:'🌿'.repeat(33)}])assert.equal((await e.handle({id:1,kind:'configure',payload})).ok,false);
  assert.equal((await e.handle({id:2,kind:'configure',payload:{modelFilter:'🌿'.repeat(32)}})).ok,true);
  const result=await e.handle({id:3,kind:'models',payload:{modelFilter:''}});assert.equal(result.ok,true,result.error);
  assert.ok(Buffer.byteLength(JSON.stringify(result.state.models))<=8192);assert.ok(Buffer.byteLength(result.state.models.map(m=>m.id).join('\n'))<=4096);
});

test('Remote model names, assistant replies and errors cannot emit NUL into the native host pipe',async t=>{
  const replies=[];const e=engine({onReply:value=>replies.push(value),fetcher:async(_url,options)=>options.method==='GET'?response({data:[{id:'chosen',name:'bad\0name',pricing:{prompt:'0',completion:'0'}}]}):complete({content:'answer\0tail'})});t.after(()=>e.close());
  await configure(e,{model:'chosen',freeOnly:true});let result=await e.handle({id:2,kind:'models'});
  assert.equal(result.state.models[0].title,'chosen');
  result=await e.handle({id:3,kind:'prompt',payload:{prompt:'NUL boundary'}});assert.equal(result.ok,true,result.error);assert.equal(result.state.reply,'answer�tail');
  const failed=engine({fetcher:async()=>{throw Error('bad\0provider');}});t.after(()=>failed.close());await configure(failed);const rejected=await failed.handle({id:2,kind:'prompt',payload:{prompt:'Failure'}});
  assert.equal(rejected.ok,false);assert.ok(!rejected.error.includes('\0'));assert.ok(!JSON.stringify(replies).includes('\\u0000'));
});

test('Protected settings respect native text limits before callbacks and preserve the existing ciphertext on failure',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'nacborui-assistant-wire-'));t.after(()=>rm(dir,{recursive:true,force:true}));const storePath=join(dir,'config.dpapi');let protects=0,unprotects=0,hugeCipher=false;
  const options={storePath,secretProtect:async plaintext=>{protects++;assert.ok(Buffer.byteLength(plaintext)<=4096);return hugeCipher?'x'.repeat(4097):Buffer.from(plaintext).toString('base64');},secretUnprotect:async ciphertext=>{unprotects++;assert.ok(Buffer.byteLength(ciphertext)<=4096);return Buffer.from(ciphertext,'base64').toString();}};
  const e=engine(options);t.after(()=>e.close());assert.equal((await configure(e)).ok,true);const previous=await readFile(storePath),before=protects;
  let result=await e.handle({id:2,kind:'configure',payload:{key:'\\'.repeat(2048)}});assert.equal(result.ok,false);assert.equal(protects,before,'oversized escaped JSON never reaches native protect_secret');assert.deepEqual(await readFile(storePath),previous);assert.equal(result.state.keyPresent,true);
  hugeCipher=true;result=await e.handle({id:3,kind:'configure',payload:{model:'another/model'}});assert.equal(result.ok,false);assert.deepEqual(await readFile(storePath),previous);assert.equal(result.state.model,'example/model');
  await writeFile(storePath,'x'.repeat(4097));const restored=engine(options);t.after(()=>restored.close());result=await restored.handle({id:4,kind:'load'});assert.equal(result.ok,false);assert.equal(unprotects,0,'oversized ciphertext never reaches native unprotect_secret');
});

test('Prompt progress reports bounded phases with the same ID and only one final reply',async t=>{
  const replies=[];let rounds=0;const e=engine({onReply:reply=>replies.push(reply),fetcher:async()=>++rounds===1?complete({tool_calls:[call('get_example',{kind:'style'})]}):complete({content:'Готов результат.'})});t.after(()=>e.close());await configure(e);replies.length=0;
  const final=await e.handle({id:42,kind:'prompt',payload:{prompt:'Проверка этапов'}});assert.equal(final.ok,true,final.error);
  assert.equal(replies.filter(reply=>!reply.progress).length,1);assert.ok(replies.every(reply=>reply.id===42));
  const progress=replies.filter(reply=>reply.progress);assert.ok(progress.every(reply=>reply.state.busy===true&&!Object.hasOwn(reply,'ok')));
  assert.deepEqual(progress.map(reply=>reply.state.status),['Проверка модели','Подключение MCP','Ожидание модели (шаг 1/33)','Инструмент get_example — пример · kind=style (1/32)','Результат get_example: успешно','Ожидание модели (шаг 2/33)']);
  assert.equal(replies.at(-1).state.busy,false);assert.equal(replies.at(-1).state.status,'Готово');
});

test('Variable-sized model pages cover every filtered record once and filter changes reset the offset',async t=>{
  let gets=0;const data=Array.from({length:170},(_,i)=>({id:'model/'+String(i).padStart(3,'0')+'x'.repeat(110),name:'Название '.repeat(30),pricing:{prompt:'0',completion:'0'}}));
  const e=engine({fetcher:async()=>{gets++;return response({data});}});t.after(()=>e.close());const seen=[];let offset=0;
  do{const result=await e.handle({id:offset+1,kind:'models',payload:{offset}});assert.equal(result.ok,true,result.error);const page=result.state.modelPage;assert.equal(page.offset,offset);assert.equal(page.total,170);assert.equal(page.shown,result.state.models.length);assert.ok(page.shown>0&&page.shown<=64);seen.push(...result.state.models.map(model=>model.id));offset+=page.shown;}while(offset<170);
  assert.deepEqual(seen,data.map(model=>model.id));assert.equal(gets,1);
  const changed=await e.handle({id:900,kind:'models',payload:{offset:64,modelFilter:'MODEL/169'}});assert.deepEqual(changed.state.modelPage,{offset:0,total:1,shown:1});assert.equal(changed.state.models[0].id,data[169].id);
  assert.equal((await e.handle({id:901,kind:'models',payload:{offset:4096}})).ok,false);
});

test('Provider HTTP and JSON error reasons are visible, redacted and bounded without dumping response metadata',async t=>{
  for(const status of [401,429,200]){
    const e=engine({fetcher:async()=>new Response(JSON.stringify({error:status===200?'JSON failure test-secret '+ 'я'.repeat(400):{message:'API reason '+status+' test-secret '+ 'я'.repeat(400),metadata:'DO NOT EXPOSE FULL BODY'}}),{status,headers:{'Content-Type':'application/json'}})});t.after(()=>e.close());await configure(e);
    const result=await e.handle({id:2,kind:'prompt',payload:{prompt:'Explain provider failure'}});assert.equal(result.ok,false);assert.match(result.error,status===200?/JSON failure/:new RegExp('HTTP '+status+': API reason'));
    assert.ok(result.error.includes('[redacted]'));assert.ok(!result.error.includes('test-secret'));assert.ok(!result.error.includes('FULL BODY'));assert.ok(Buffer.byteLength(result.error)<=512);assert.equal(result.state.status,result.error);await e.close();
  }
  const incoming='  '+'private-key-'.repeat(100)+'  ';const configured=engine({storePath:'unused-in-this-rejected-test',secretProtect:async()=>{throw Error('Rejected '+incoming.trim());},secretUnprotect:async()=>''});t.after(()=>configured.close());
  const result=await configured.handle({id:1,kind:'configure',payload:{key:incoming}});assert.equal(result.ok,false);assert.ok(!result.error.includes('private-key-'));assert.match(result.error,/redacted/);
});

const tinyPng='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=';
test('Image content is typed, bounded, validated and absent from text-only prompts',()=>{
 assert.equal(assistantUserContent('hello'),'hello');const parts=assistantUserContent('reference',[{mime:'image/png',data:tinyPng}]);assert.equal(parts[0].type,'text');assert.equal(parts[1].image_url.url,'data:image/png;base64,'+tinyPng);
 for(const bad of [[{mime:'image/svg+xml',data:tinyPng}],[{mime:'image/png',data:'AAAA'}],Array(5).fill({mime:'image/png',data:tinyPng}),[{mime:'image/png',data:'A'.repeat(131076)}]])assert.throws(()=>assistantUserContent('x',bad));
});
test('Text-only provider rejects images before completion and exposes no image in public state',async t=>{
 let completions=0;const e=engine({fetcher:async url=>{if(url.endsWith('/models'))return response({data:[{id:'example/model',architecture:{input_modalities:['text']},supported_parameters:['tools']}]});completions++;throw Error('must not send');}});t.after(()=>e.close());await configure(e);
 const result=await e.handle({id:7,kind:'prompt',payload:{prompt:'reference',images:[{mime:'image/png',data:tinyPng}]}});assert.equal(result.ok,false);assert.match(result.error,/vision/);assert.equal(completions,0);assert.ok(!JSON.stringify(result.state).includes(tinyPng));
});
test('Vision provider receives image_url through real MCP loop without persistence or unsupported routing parameter',async t=>{
 let calls=0;const e=engine({fetcher:async(url,options)=>{if(url.endsWith('/models'))return response({data:[{id:'example/model',architecture:{input_modalities:['text','image']},supported_parameters:['tools']}]});const b=JSON.parse(options.body);calls++;assert.equal(Object.hasOwn(b,'parallel_tool_calls'),false);assert.equal(b.messages[1].content[1].image_url.url,'data:image/png;base64,'+tinyPng);return complete({content:'Image accepted'});}});t.after(()=>e.close());await configure(e);
 const result=await e.handle({id:8,kind:'prompt',payload:{prompt:'reference',images:[{mime:'image/png',data:tinyPng}]}});assert.equal(result.ok,true,result.error);assert.equal(calls,1);assert.ok(!JSON.stringify(result.state).includes(tinyPng));
});

test('Upstream throttling exposes selected provider reason and Retry-After, redacts keys and ignores other metadata',async t=>{
 for(const raw of ['temporarily rate-limited upstream test-secret',JSON.stringify({error:{message:'quota exceeded test-secret'},private:'DO NOT EXPOSE'})]){
 const e=engine({fetcher:async()=>new Response(JSON.stringify({error:{message:'Provider returned error',metadata:{provider_name:'Example',limit_source:'upstream_provider_shared_pool',raw,secret:'DO NOT EXPOSE'}}}),{status:429,headers:{'Content-Type':'application/json','Retry-After':'30'}})});t.after(()=>e.close());await configure(e);
 const r=await e.handle({id:2,kind:'prompt',payload:{prompt:'Read-only connection check'}});assert.equal(r.ok,false);assert.match(r.error,/HTTP 429/);assert.match(r.error,/rate-limited upstream|quota exceeded/);assert.match(r.error,/30 с/);assert.match(r.error,/upstream_provider_shared_pool/);assert.ok(!r.error.includes('test-secret'));assert.ok(!r.error.includes('DO NOT EXPOSE'));
 }
});

test('A legitimate batch beyond the old eight-call cap completes through real MCP',async t=>{
 let requests=0;const e=engine({fetcher:async(_url,options)=>{const body=JSON.parse(options.body);if(++requests===1)return complete({tool_calls:Array.from({length:9},(_,i)=>call('get_example',{kind:'style'},'read-'+i))});assert.equal(body.messages.filter(m=>m.role==='tool').length,9);assert.ok(body.messages.filter(m=>m.role==='tool').every(m=>!JSON.parse(m.content).isError));return complete({content:'Nine tool calls completed.'});}});t.after(()=>e.close());await configure(e);const result=await e.handle({id:77,kind:'prompt',payload:{prompt:'Read nine examples'}});assert.equal(result.ok,true,result.error);assert.equal(requests,2);
});
test('An oversized batch is rejected as a whole and receives one final response opportunity',async t=>{
 let requests=0;const e=engine({fetcher:async(_url,options)=>{const body=JSON.parse(options.body);if(++requests===1)return complete({tool_calls:Array.from({length:assistantLimits.calls+1},(_,i)=>call('get_example',{kind:'style'},'over-'+i))});assert.equal(body.tool_choice,'none');const results=body.messages.filter(m=>m.role==='tool');assert.equal(results.length,assistantLimits.calls+1);assert.ok(results.every(m=>JSON.parse(m.content).error==='assistant_tool_budget_exhausted'));return complete({content:'Budget reached; no calls in the oversized batch were executed.'});}});t.after(()=>e.close());await configure(e);const result=await e.handle({id:78,kind:'prompt',payload:{prompt:'Bounded batch'}});assert.equal(result.ok,true,result.error);assert.equal(requests,2);
});

test('Detailed log includes targeted tool intent, errors and final answer, excludes secrets and stays bounded',async t=>{
 let turn=0;const e=engine({fetcher:async()=>++turn===1?complete({tool_calls:[call('get_example',{kind:'style'},'style'),call('os.exec',{command:'secret'},'denied')]}):complete({content:'Final test-secret'})});t.after(()=>e.close());await configure(e);const result=await e.handle({id:120,kind:'prompt',payload:{prompt:'Read a style'}});assert.equal(result.ok,true,result.error);const entries=result.state.log;assert.ok(entries.some(e=>e.kind==='tool'&&e.text.includes('kind=style')));assert.ok(entries.some(e=>e.kind==='error'&&e.text.includes('Tool is not allowed')));assert.ok(entries.some(e=>e.kind==='answer'));assert.ok(!JSON.stringify(entries).includes('test-secret'));assert.ok(entries.length<=48);assert.ok(Buffer.byteLength(JSON.stringify(entries))<=12288);assert.ok(entries.every((e,i)=>e.elapsed_ms>=0&&e.text.length&&(!i||e.seq>entries[i-1].seq)));
});

test('Generation preserves reasoning defaults and model-specific output limit; truncated tool calls are never executed',async t=>{
 for(const mandatory of [false,true,undefined]){let requests=0;const e=engine({fetcher:async(url,options)=>{if(url.endsWith('/models'))return response({data:[{id:'example/model',supported_parameters:['tools','reasoning'],reasoning:{mandatory},top_provider:{max_completion_tokens:6000},pricing:{prompt:'0',completion:'0'}}]});requests++;const body=JSON.parse(options.body);assert.equal(body.max_tokens,6000);assert.equal(body.reasoning,undefined);return response({choices:[{finish_reason:'length',message:{role:'assistant',content:null,tool_calls:[call('get_example',{kind:'style'})]}}]});}});t.after(()=>e.close());await configure(e,{freeOnly:true});const r=await e.handle({id:3,kind:'prompt',payload:{prompt:'Generate a document'}});assert.equal(r.ok,false);assert.match(r.error,/не завершён/);assert.ok(!r.state.log.some(x=>x.kind==='tool'));assert.equal(requests,1);}
});
test('Large JSON in text reply fails explicitly rather than being clipped into an invalid document',async t=>{
 const e=engine({fetcher:async()=>complete({content:JSON.stringify({format:'lvgl-screen-draft-1',text:'x'.repeat(5000)})})});t.after(()=>e.close());await configure(e);const r=await e.handle({id:4,kind:'prompt',payload:{prompt:'Return JSON'}});assert.equal(r.ok,false);assert.match(r.error,/JSON не обрезан/);assert.equal(r.state.reply,'');
});

test('Text-only selected model gets an explicit feedback limitation before any display capture',async t=>{
 let rounds=0,catalogs=0;const e=engine({fetcher:async(url,options)=>{
  if(url.endsWith('/models')){catalogs++;return response({data:[{id:'example/model',architecture:{input_modalities:['text']},supported_parameters:['tools']}]});}
  const body=JSON.parse(options.body);if(++rounds===1)return complete({tool_calls:[call('get_display_frame',{})]});
  const error=JSON.parse(body.messages.at(-1).content);assert.equal(error.isError,true);assert.match(error.error,/не подтверждена для изображений/);assert.equal(body.messages.filter(message=>message.role==='user'&&Array.isArray(message.content)).length,0);return complete({content:'Визуальная проверка недоступна этой модели.'});
 }});t.after(()=>e.close());await configure(e);const result=await e.handle({id:2,kind:'prompt',payload:{prompt:'Проверь экран'}});assert.equal(result.ok,true,result.error);assert.equal(catalogs,1);assert.equal(rounds,2);
});

test('Textual imitation of a tool call is an explicit failure and is never executed or clipped as success',async t=>{
 const e=engine({fetcher:async()=>complete({content:'Let me apply this change:\n<tool_call>\n<function=write_project_document>\n<parameter=document>'+ 'x'.repeat(5000)})});t.after(()=>e.close());await configure(e);
 const r=await e.handle({id:2,kind:'prompt',payload:{prompt:'Apply a design'}});assert.equal(r.ok,false);assert.match(r.error,/имитацию tool call/);assert.equal(r.state.reply,'');assert.ok(!r.state.log.some(entry=>entry.kind==='tool'));
});

test('Provider reasoning defaults are preserved and usage counters exclude reasoning text',async t=>{
 const e=engine({fetcher:async(url,options)=>{
  if(url.endsWith('/models'))return response({data:[{id:'example/model',pricing:{prompt:'0',completion:'0'},supported_parameters:['tools','reasoning'],reasoning:{mandatory:false,default_effort:'xhigh',supported_efforts:['xhigh','medium','low','none']}}]});
  const body=JSON.parse(options.body);assert.equal(body.reasoning,undefined);return response({usage:{completion_tokens:8192,completion_tokens_details:{reasoning_tokens:8192}},choices:[{finish_reason:'length',message:{role:'assistant',content:'',reasoning:'PRIVATE REASONING TEXT'}}]});
 }});t.after(()=>e.close());await configure(e,{freeOnly:true});const r=await e.handle({id:2,kind:'prompt',payload:{prompt:'Create UI'}});assert.equal(r.ok,false);assert.ok(r.state.log.some(entry=>entry.text.includes('output=8192')&&entry.text.includes('reasoning=8192')));assert.ok(!JSON.stringify(r.state).includes('PRIVATE REASONING TEXT'));
});
