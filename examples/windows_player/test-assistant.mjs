// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createAssistant} from './assistant.mjs';
import {ProjectClient} from '../../packages/project-codec/client.js';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const exe=resolve(process.argv[2]??join(root,'local/catalog-player/Release/nacborui_player.exe'));
const temporary=await mkdtemp(join(tmpdir(),'nacborui-assistant-e2e-')),output=join(root,'local/windows-assistant');
const child=spawn(process.execPath,[join(here,'run.mjs'),join(here,'graphics-gallery.json'),'--profile','graphics','--exe',exe,'--api-port','0','--api-store',join(temporary,'project'),'--assistant-store',join(temporary,'settings.dpapi'),'--control','--hidden','--no-settings','--scheme','dark'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
let stderr='',next=0,closed=false,loaded=false,origin,resolveReady,rejectReady,engine;
const ready=new Promise((yes,no)=>{resolveReady=yes;rejectReady=no;}),pending=new Map();
const startup=setTimeout(()=>rejectReady(Error('Assistant startup timeout '+stderr)),20000);
child.stderr.on('data',chunk=>stderr+=chunk);
createInterface({input:child.stdout}).on('line',line=>{let value;try{value=JSON.parse(line);}catch{return;}
  if(value.event==='loaded')loaded=true;if(value.event==='api_ready')origin=value.url;
  if(loaded&&origin){clearTimeout(startup);resolveReady();}
  if(value.event==='fatal'||value.event==='error'){clearTimeout(startup);rejectReady(Error(value.error+' '+stderr));}
  if(value.id!==undefined&&pending.has(value.id)){const item=pending.get(value.id);pending.delete(value.id);clearTimeout(item.timer);item.yes(value);}
});
const exit=new Promise(yes=>child.once('close',code=>{closed=true;clearTimeout(startup);rejectReady(Error('Player exited '+code+' '+stderr));for(const item of pending.values()){clearTimeout(item.timer);item.no(Error('Player exited'));}pending.clear();yes(code);}));
const wait=ms=>new Promise(yes=>setTimeout(yes,ms));
function command(request){const id=++next;return new Promise((yes,no)=>{const timer=setTimeout(()=>{pending.delete(id);no(Error('Assistant native command timeout '+stderr));},10000);pending.set(id,{yes,no,timer});child.stdin.write(JSON.stringify({...request,id})+'\n');});}
function healthy(result){assert.equal(result.ok,true,result.error);assert.equal(result.windowVisible,false);assert.equal(result.foreground,false);const data=JSON.parse(result.dataJson);assert.equal(data.diagnostics.bindingErrors,0);assert.equal(data.diagnostics.queueDropped,0);assert.ok(!data.sources.some(source=>/^system\.(cpu|cores|memory|gpus)$/.test(source.name)),'graphics profile has no SystemMetrics; fresh MCP frame becomes model PNG feedback, previous frame evicted');}
function result(message){const value=JSON.parse(message.content);assert.ok(!value.isError,JSON.stringify(value));return value;}
const tool=(name,args,id)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const response=value=>new Response(JSON.stringify({choices:[{message:{role:'assistant',...value}}]}),{headers:{'Content-Type':'application/json'}});
const requests=[];let rounds=0,instance;
try{
  await ready;assert.notEqual(new URL(origin).port,'443');
  engine=createAssistant({origin,storePath:null,fetcher:async(url,options)=>{
    if(options.method==='GET'){assert.ok(url.endsWith('/models'));return new Response(JSON.stringify({data:[{id:'fixture/model',pricing:{prompt:'0',completion:'0'},supported_parameters:['tools'],architecture:{input_modalities:['text','image']}}]}),{headers:{'Content-Type':'application/json'}});}
    assert.ok(url.endsWith('/chat/completions'));assert.equal(options.headers.Authorization,'Bearer fixture-only-key');
    const body=JSON.parse(options.body);assert.deepEqual(body.provider.max_price,{prompt:0,completion:0,request:0});assert.equal(body.models,undefined);assert.ok(!JSON.stringify(body.messages).includes('fixture-only-key'));
    requests.push({round:++rounds,tools:body.messages.filter(message=>message.role==='tool').map(message=>message.tool_call_id)});
    if(rounds===1){assert.ok(body.tools.some(t=>t.function.name==='reset_project_changes'),'all configured MCP tools are exposed');assert.ok(!/[А-Яа-яЁё]/.test(body.messages[0].content),'system instructions are English');return response({tool_calls:[tool('write_source',{source:'assistant.prompt',value:'Fixture input through the real catalog'},'write-real-source'),tool('invoke_action',{name:'assistant.images_clear',args:true},'real-action'),tool('read_project_document',{kind:'screens',name:'canvas',node:'root'},'read-canvas')]});}
    if(rounds===2){
      const first=body.messages.filter(m=>m.role==='tool');assert.equal(result(first.at(-3)).result.ok,true,'non-demo writable source reached native registry');assert.equal(result(first.at(-2)).result.ok,true,'non-demo/ui action reached native handler');
      const saved=result(body.messages.at(-1));assert.equal(saved.document.children.length,0);
      const document=saved.document;document.children.push(
        {id:'agent_step',type:'button',props:{text:'AI +7'},style:{width:160,height:42},styles:[{ref:'global-static:ui.button'}],flags:{SCROLLABLE:false},children:[],events:[{event:'clicked',action:'demo.step',args:{literal:7}}]},
        {id:'agent_result',type:'label',props:{text:'Счётчик: —'},style:{width:240,height:28},styles:[{ref:'global-static:ui.text'}],flags:{SCROLLABLE:false},children:[],bindings:[{method:'text',value:{source:'demo.clicks',path:[]},format:{prefix:'Счётчик: '}}]});
      return response({tool_calls:[tool('write_project_document',{kind:'screens',name:'canvas',node:'root',document,revision:saved.revision},'save-canvas'),tool('show_project_screen',{screen:'shell'},'show-shell')]});
    }
    if(rounds===3){const messages=body.messages.filter(message=>message.role==='tool');assert.equal(result(messages.at(-2)).saved,true);assert.equal(result(messages.at(-2)).displayUpdatedBySave,false);assert.equal(result(messages.at(-1)).ok,true);return response({tool_calls:[tool('send_event',{node:'go_canvas',event:'clicked'},'open-canvas'),tool('get_project_status',{},'read-instance')]});}
    if(rounds===4){const status=result(body.messages.at(-1));const view=status.display.views.find(view=>view.selected==='canvas');assert.ok(view);instance=view.pageInstance;return response({tool_calls:[tool('send_event',{node:'agent_step',event:'clicked',instance},'click-authored'),tool('get_data',{name:'demo.clicks',detail:true},'read-counter')]});}
    if(rounds===5){const messages=body.messages.filter(message=>message.role==='tool');assert.equal(result(messages.at(-2)).result.ok,true);assert.equal(result(messages.at(-1)).items[0].value,7);return response({tool_calls:[tool('get_display_frame',{},'frame-first'),tool('get_project_status',{},'frame-status')]});}
    const feedback=body.messages.filter(message=>message.role==='user'&&Array.isArray(message.content));assert.equal(feedback.length,1,'only latest feedback frame remains');
    const last=body.messages.at(-1);assert.equal(last.role,'user');const picture=last.content.find(part=>part.type==='image_url');assert.ok(picture.image_url.url.startsWith('data:image/png;base64,'));
    const png=Buffer.from(picture.image_url.url.split(',')[1],'base64');assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    const frameResult=body.messages.filter(message=>message.role==='tool'&&message.tool_call_id.startsWith('frame-')&&message.tool_call_id!=='frame-status');assert.ok(frameResult.every(message=>!message.content.includes('base64')&&!message.content.includes('"type":"image"')),'binary image is not inserted into text tool context');
    const metadata=result(frameResult.at(-1));assert.equal(png.readUInt32BE(16),metadata.width);assert.equal(png.readUInt32BE(20),metadata.height);assert.equal(metadata.display.screen,'shell');assert.equal(metadata.displayRevisionMatchesSaved,true);assert.ok(metadata.display.views.some(view=>view.selected==='canvas'));
    if(rounds===6){assert.equal(metadata.width,1024);const tail=body.messages.slice(-3);assert.deepEqual(tail.map(message=>message.role),['tool','tool','user'],'all tool IDs answered before multimodal user feedback');return response({tool_calls:[tool('get_display_frame',{maxEdge:512},'frame-second')]});}
    assert.equal(rounds,7);assert.equal(metadata.width,512);await mkdir(output,{recursive:true});await writeFile(join(output,'feedback.png'),png);
    return response({content:'Холст сохранён через MCP. Кнопка увеличивает счётчик на7; сейчас7.'});
  }});
  assert.equal((await engine.handle({id:1,kind:'configure',payload:{model:'fixture/model',key:'fixture-only-key'}})).ok,true);
  const completion=await engine.handle({id:2,kind:'prompt',payload:{prompt:'На пустом холсте добавь и сохрани кнопку +7 и подпись счётчика. Проверь нажатие.'}});
  assert.equal(completion.ok,true,completion.error);assert.equal(completion.state.busy,false);assert.match(completion.state.reply,/сохранён/);assert.equal(rounds,7);
  await wait(100);const inspected=await command({op:'inspect',nodes:[{id:'agent_step',instance},{id:'agent_result',instance}]});healthy(inspected);
  assert.ok(inspected.nodes.every(node=>node.found));assert.equal(inspected.nodes[1].text,'Счётчик: 7');
  const caps=await (await fetch(origin+'/api/capabilities')).json();const saved=await new ProjectClient(origin).read(caps);
  assert.deepEqual(saved.project.screens.canvas.root.children.map(node=>node.id),['agent_step','agent_result']);
  await mkdir(output,{recursive:true});const imagePath=join(output,'model-authored-canvas.bmp');assert.equal((await command({op:'snapshot',path:imagePath})).ok,true);
  const bmp=await readFile(imagePath),width=bmp.readInt32LE(18),rawHeight=bmp.readInt32LE(22),height=Math.abs(rawHeight),offset=bmp.readUInt32LE(10);
  const pixel=(x,y)=>bmp.readUInt32LE(offset+((rawHeight<0?y:height-1-y)*width+x)*4)&0xffffff;
  const colors=new Set(),[x,y,x2,y2]=inspected.nodes[0].bounds;for(let row=y+2;row<y2-2;row++)for(let col=x+2;col<x2-2;col++)colors.add(pixel(col,row));
  assert.ok(colors.has(inspected.nodes[0].background),'native pixels contain the authored LVGL button');assert.ok(colors.size>1,'button text was rendered');
  await writeFile(join(output,'measurements.json'),JSON.stringify({executableSha256:createHash('sha256').update(await readFile(exe)).digest('hex'),provider:'in-memory mock; no paid requests',nativeServer:'NaWServer',rounds,calls:12,savedRevision:saved.revision,counter:7,pixels:colors.size,requests,nodes:inspected.nodes},null,2));
  await engine.close();engine=null;child.stdin.end('{"op":"quit"}\n');assert.equal(await exit,0);
  console.log('PASS: mock model -> real MCP stdio -> native NaWServer/ProjectService saved canvas -> LVGL button pixels, event and live counter binding; graphics profile has no SystemMetrics; fresh MCP PNG feedback, correct batch order and previous frame eviction');
}finally{await engine?.close();clearTimeout(startup);for(const item of pending.values())clearTimeout(item.timer);if(!closed){child.stdin.end('{"op":"quit"}\n');await Promise.race([exit,wait(3000).then(()=>child.kill())]);}await rm(temporary,{recursive:true,force:true});}
