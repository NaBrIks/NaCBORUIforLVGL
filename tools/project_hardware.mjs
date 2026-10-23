// Explicit hardware acceptance: previews/saves a test project, then restores the original.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {encode} from 'cborg';
import {ProjectClient} from '../packages/project-codec/client.js';
import {encodeProject,decodeProject} from '../packages/project-codec/index.js';
import {createBlankScreen,createNode} from '../frontend/src/screen-model.js';
const origin=process.argv[2];if(!origin)throw Error('Usage: node tools/project_hardware.mjs http://DEVICE');
const boundedFetch=(url,options={})=>fetch(url,{...options,signal:options.signal??AbortSignal.timeout(5000)});
const client=new ProjectClient(origin,{fetcher:async(url,options)=>{if(process.env.PROJECT_TRACE)console.log('project request',new URL(url).searchParams.get('action'),options.body?.length??0);const response=await boundedFetch(url,options);if(process.env.PROJECT_TRACE)console.log('project response',response.status);return response;}}),caps=await(await boundedFetch(origin+'/api/capabilities')).json(),before=await(await boundedFetch(origin+'/api/info')).json();
const original=await client.read(caps),initial=await client.info(),results=[];
let savedRevision=original.revision,attemptedProject,report,failure;
await writeFile(new URL('../local/project-hardware-before.json',import.meta.url),JSON.stringify({origin,initial,...original},null,2));
try{
 const draft=structuredClone(original.project);draft.manifest.name='Project API verification '+Date.now().toString(36);attemptedProject=draft;
 const screen=createBlankScreen('project_check','Project service check');
 screen.root.style={bg_color:'#101820',bg_opa:255,pad_all:24};
 const title=createNode('label','title');title.props.text='ProjectService / PREVIEW';title.style={text_color:'#80dfb0',text_font:'montserrat_28',x:24,y:30};
 const text=createNode('label','status');text.props.text='Named screens | JSON / CBOR | explicit save';text.style={text_color:'#ffffff',text_font:'montserrat_20',x:24,y:110};screen.root.children=[title,text];
 draft.screens.project_check=screen;for(let n=0;n<24;n++)draft.screens['extra_'+n]=createBlankScreen('extra_'+n,'Extra '+n);
 // Exercise the advertised nesting limit through the HTTP save path, not only the UI task.
 const deep=createBlankScreen('deep_check','Maximum nesting');let parent=deep.root;
 for(let depth=2;depth<caps.limits.depth;depth++){const child=createNode('obj','depth_'+depth);child.style={width:100,height:100,pad_all:0};parent.children.push(child);parent=child;}
 const complex=caps.extensions?.find(f=>f.contract.methods.some(m=>m.parameters.some(p=>p.type==='array')));
 const leaf=createNode(complex?.name??'label','deep_leaf',caps);if(!complex)leaf.props.text='Depth '+caps.limits.depth;parent.children.push(leaf);draft.screens.deep_check=deep;
 const bytes=encodeProject(draft,caps);assert.ok(bytes.length>4096);
 const preview=await client.preview(draft,'project_check',{capabilities:caps});assert.equal(preview.saved,false);
 const afterPreview=await client.info();assert.equal(afterPreview.project.revision,original.revision);assert.equal(afterPreview.display.preview,true);assert.equal(afterPreview.display.screen,'project_check');results.push('preview does not save');
 const saved=await client.save(draft,{capabilities:caps,revision:original.revision});assert.equal(saved.saved,true);assert.equal(saved.persistent,initial.storage.persistent);savedRevision=saved.revision;
 const afterSave=await client.info();assert.deepEqual(afterSave.display,afterPreview.display);results.push('explicit save does not change display');
 const readback=await client.read(caps);assert.equal(readback.revision,savedRevision);assert.deepEqual(decodeProject(encodeProject(readback.project,caps),caps),decodeProject(bytes,caps));results.push('whole project readback, >4096 byte chunk transfer');
 await assert.rejects(client.save(draft,{capabilities:caps,revision:original.revision}),/409/);assert.equal((await client.info()).project.revision,savedRevision);results.push('stale revision rejected');
 await client.show('project_check');const shown=await client.info();assert.equal(shown.display.preview,false);assert.equal(shown.display.revision,savedRevision);results.push('load saved screen by name');
 await client.show('deep_check');assert.equal((await client.info()).display.screen,'deep_check');await client.show('project_check');results.push('save and load at advertised maximum nesting depth');
 await assert.rejects(client.show('unknown_screen'),/404/);assert.deepEqual((await client.info()).display,shown.display);results.push('unknown name preserves active screen');
 const upload=await(await client.request('begin',{method:'POST',body:encode({intent:'save',size:bytes.length,revision:savedRevision,screen:'project_check'})})).json();
 await client.request('chunk',{method:'POST',query:{token:upload.token,offset:0},body:bytes.subarray(0,17)});
 await assert.rejects(client.request('chunk',{method:'POST',query:{token:upload.token,offset:0},body:bytes.subarray(0,17)}),/400/);
 await assert.rejects(client.request('finish',{method:'POST',query:{token:upload.token}}),/400/);await client.request('cancel',{method:'POST',query:{token:upload.token}});
 assert.equal((await client.info()).project.revision,savedRevision);results.push('duplicate offset/incomplete upload do not publish');
 const after=await(await boundedFetch(origin+'/api/info')).json();assert.equal(after.boot_id,before.boot_id);
 report={origin,before,initial,projectBytes:bytes.length,results,after,afterSave,shown};
 console.log(JSON.stringify({boot:after.boot_id,projectBytes:bytes.length,checks:results.length,storage:afterSave.storage}));
}catch(error){failure=error;
}finally{
 report??={origin,before,initial,results};
 try{
  const status=await client.info();let owned=status.project.revision===savedRevision;
  // A transport timeout can occur after a durable commit. Restore only if
  // readback proves it is exactly this run's candidate, preserving owner edits.
  if(!owned&&attemptedProject){const current=await client.read(caps);owned=isDeepStrictEqual(current.project,decodeProject(encodeProject(attemptedProject,caps),caps));}
  if(!owned)throw Error('Project changed independently; original backup retained');
  await client.save(original.project,{capabilities:caps,revision:status.project.revision});await client.show(original.project.manifest.entry);
  report.restoration={ok:true,revision:(await client.info()).project.revision};
 }catch(error){report.restoration={ok:false,error:String(error)};failure=failure?new AggregateError([failure,error],'Project acceptance/restoration failed'):error;}
 if(failure)report.error=String(failure);
 await writeFile(new URL('../local/project-hardware.json',import.meta.url),JSON.stringify(report,null,2));
}
if(failure)throw failure;
