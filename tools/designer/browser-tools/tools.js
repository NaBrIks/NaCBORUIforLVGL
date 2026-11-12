// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {encode} from 'cborg';
import {serializeDocument} from '../../../packages/document-io/index.js';
import {describeWidget,describeStyle} from '../../../packages/document-io/ui-reference.js';
import {createProject} from '../../../packages/project-codec/index.js';
import {ProjectClient,ProjectSaveUnconfirmed} from '../../../packages/project-codec/client.js';
import {DataClient} from '../../../packages/project-codec/data-client.js';
import {DataQueryError,readBoundedDataJson} from '../../../packages/project-codec/data-query.js';
import {contract} from '../../../packages/style-codec/index.js';
import {screenContract,bindingContract,widgetCatalog,validateBindingCapabilities} from '../../../packages/screen-codec/index.js';
import {importCss,exportCss} from '../../../packages/css-codec/index.js';
import {browserFrame,fetchFrameBmp,frameAwait,isAfterScene} from './frame.js';
import {targetOrigin} from './http.js';

const text=(min=0,max=63)=>({type:'string',minLength:min,maxLength:max}),integer=(minimum=0,maximum=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum,maximum}),bool={type:'boolean'},choice=(...values)=>({type:'string',enum:values});
const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const name=text(1),document={type:'object',description:'Editable JSON OBJECT, not a JSON string. Pass a complete screen/style/project, or the selected NODE OBJECT when node is provided.',additionalProperties:true};
const kind=choice('screen','style','project'),bounded={offset:integer(),limit:integer(1,64),maxBytes:integer(512,16384)},queries={group:name,prefix:text(),name,path:text(0,512),descendants:bool,detail:bool,...bounded,catalogRevision:integer()};
const readOnly={readOnlyHint:true,destructiveHint:false,openWorldHint:false},display={readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false},write={...display,destructiveHint:true};
// Validate only the local tool argument envelope. UI documents and values always
// use the existing shared codecs and application metadata below.
function argumentsFor(value,schema,path='arguments'){
 if(value===undefined&&schema.type==='object')value={};
 if(schema.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error(path+' must be a JSON object');
  for(const key of schema.required??[])if(!Object.hasOwn(value,key))throw Error(path+'.'+key+' is required');
  for(const [key,item] of Object.entries(value)){if(!Object.hasOwn(schema.properties??{},key)){if(schema.additionalProperties===false)throw Error('Unknown '+path+'.'+key);continue;}argumentsFor(item,schema.properties[key],path+'.'+key);}
 }else if(schema.type==='array'){
  if(!Array.isArray(value))throw Error(path+' must be an array');for(const item of value)if(schema.items)argumentsFor(item,schema.items,path+'[]');
 }else if(schema.type==='string'){
  if(typeof value!=='string'||value.length<(schema.minLength??0)||value.length>(schema.maxLength??Number.MAX_SAFE_INTEGER))throw Error(path+' must be bounded text');
 }else if(schema.type==='integer'){
  if(!Number.isSafeInteger(value)||value<(schema.minimum??Number.MIN_SAFE_INTEGER)||value>(schema.maximum??Number.MAX_SAFE_INTEGER))throw Error(path+' must be a bounded integer');
 }else if(schema.type==='boolean'&&typeof value!=='boolean')throw Error(path+' must be boolean');
 if(schema.enum&&!schema.enum.includes(value))throw Error('Unsupported '+path);
 return value;
}
const result=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
const context=(value,maxBytes=4096)=>{const bytes=new TextEncoder().encode(JSON.stringify(value)).length;if(bytes>maxBytes)throw new DataQueryError('device_context_too_large','Device section exceeds maxBytes; narrow name/limit or increase maxBytes',{status:413,maxBytes,bytes});return value;};
const page=(section,items,{offset=0,limit=16,maxBytes=4096}={})=>{const selected=items.slice(offset,offset+limit),nextOffset=offset+selected.length<items.length?offset+selected.length:null;return context({section,total:items.length,offset,nextOffset,hasMore:nextOffset!==null,items:selected},maxBytes);};
export function createBrowserTools({origin,fetcher=globalThis.fetch,references={},example,frameEncoder=browserFrame,getPreviewFrame}={}){
 origin=targetOrigin(origin);let disposed=false,nextCall=0,inputSupported=false,connectedBootId,previewOnly;const lifetime=new AbortController(),transport=fetcher,operations=new Map(),cancelledBeforeStart=new Set();
 const ensure=()=>{if(disposed)throw Error('Direct target disconnected');};
 // Each concurrent tool call owns its clients and signal. No mutable global
 // active-operation slot can cancel a different SPLA tool from the same batch.
 function makeContext(operationSignal=lifetime.signal){
 const fetcher=(input,options={})=>{ensure();operationSignal.throwIfAborted();return transport(input,{...options,signal:options.signal?AbortSignal.any([options.signal,operationSignal]):operationSignal});};
 const saveFetcher=(input,options={})=>fetcher(input,{...options,timeoutMs:new URL(input).searchParams.get('action')==='finish'?65000:15000});
 const project=new ProjectClient(origin,{fetcher,timeout:15000}),saveProject=new ProjectClient(origin,{fetcher:saveFetcher,timeout:15000,saveTimeout:60000,confirmSave:true}),data=new DataClient(origin,{fetcher,timeout:15000}),definitions=[],handlers=new Map();
 const json=async path=>{ensure();const response=await fetcher(origin+path,{method:'GET',signal:AbortSignal.timeout(15000),redirect:'error',cache:'no-store'});const body=await readBoundedDataJson(response,262144);if(!response.ok)throw Error('Device HTTP '+response.status);ensure();return body;};
 const info=()=>json('/api/info');
 async function capabilities(actual){
  const caps=await json('/api/capabilities');
  actual ??= await info();
  if(actual.source!=='device'||caps.format!=='lvgl-cbor-capabilities-1'||caps.style?.sha256!==contract.sha256||actual.contract_sha256!==contract.sha256||caps.screen?.sha256!==screenContract.sha256||actual.screen_contract_sha256!==screenContract.sha256||!Array.isArray(caps.style?.methods)||!caps.limits||!Array.isArray(caps.resources)||!Array.isArray(caps.availableWidgets))throw Error('Device ABI/capabilities mismatch');
  widgetCatalog(caps);validateBindingCapabilities(caps);return {device:actual,capabilities:caps};
 }
 const caps=async()=>(await capabilities()).capabilities;
 const add=(name,description,inputSchema,handler,annotations=readOnly)=>{definitions.push({name,description,inputSchema,annotations});handlers.set(name,{handler,inputSchema,annotations});};
 async function savedDisplay(saved,refresh=false){
  if(!saved.saved)return saved;
  if(refresh)try{await project.refresh();}catch(error){return {...saved,displayUpdatedBySave:false,refreshError:error.message,note:'Saved successfully; display refresh failed. Do not repeat the save. Retry refresh_project_display if needed.'};}
  const note=refresh?'Saved; displayed composition refreshed with its nested page selections.':'Saved only; display unchanged. Use refresh_project_display to retain selected nested pages.';
  try{const status=await project.info();return {...saved,persistent:saved.persistent??status.storage?.persistent,displayUpdatedBySave:refresh,displayStatusKnown:Boolean(status.display),displayRevisionMatchesSaved:status.display?status.display.revision===saved.revision:null,entry:status.project?.entry,display:status.display,note};}catch{return {...saved,displayUpdatedBySave:refresh,displayStatusKnown:false,note};}
 }
 add('get_ui_reference','JSON authoring documentation for LVGL layouts/styles. topic:index lists topics. Uses the same maintained English references as Designer.',object({kind:choice('screen','style'),topic:name},['kind']),({kind,topic='overview'})=>{
  const source=references[kind];if(typeof source!=='string')throw Error('Reference unavailable');const sections=[...source.matchAll(/^## ([^\r\n]+)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)],topics=sections.map(section=>section[1]);if(topic==='index')return {kind,topics};const found=sections.find(section=>section[1]===topic);return found?{kind,topic,markdown:found[0].trim()}:{error:'unknown_reference_topic',kind,topic,topics};
 });
 add('get_example','Complete editable JSON example. Example source/action names are illustrative; replace them with actual target catalog entries.',object({kind},['kind']),({kind})=>{if(!example)throw Error('Example unavailable');return kind==='screen'?structuredClone(example):kind==='project'?createProject([structuredClone(example)]):{scope:'global',name:'example',props:{width:320,height:120,bg_color:'#173344',bg_opa:255,text_color:'#ffffff',pad_all:12},attach:false};});
 add('validate_document','Validate an editable JSON OBJECT using common codecs and current target capabilities. No save or display change.',object({kind,document},['kind','document']),async({kind,document})=>{serializeDocument(kind,document,'cbor',{capabilities:await caps()});return {valid:true,kind,checkedAgainst:'device'};});
 add('convert_css','Import/export supported CSS for a screen/style through the existing shared CSS codec.',object({kind:choice('screen','style'),document,direction:choice('import','export'),css:text(0,262144)},['kind','document','direction']),async({kind,document,direction,css=''})=>direction==='export'?{css:exportCss(document,{kind})}:importCss(css,{kind,document,capabilities:await caps()}));
 add('get_device','Actual target summary or bounded widgets/styles/resources/limits discovery. Use an exact widget name for methods and the appearance guide (visual purpose, color priorities, LVGL parts and scheme roles), if provided. Use get_data_catalog for data and actions.',object({section:choice('summary','widgets','styles','resources','limits'),name,...bounded}),async({section='summary',name,...options})=>{
  if(previewOnly)return context({info:await info()},options.maxBytes);
  const actual=await capabilities(),catalog=actual.capabilities;
  if(section==='summary'){const selected=Object.fromEntries(['source','name','platform','native_view','native_view_input','boot_id','lvgl'].filter(key=>actual.device[key]!==undefined).map(key=>[key,actual.device[key]]));return context({section,info:selected,display:catalog.display,sections:['widgets','styles','resources','limits'],counts:{widgets:catalog.availableWidgets.length,styles:catalog.style.methods.length,resources:catalog.resources.length,sources:catalog.binding?.sources.length??0,actions:catalog.binding?.actions.length??0},dataQuery:{tool:'get_data_catalog',kinds:['groups','sources','actions','fields'],defaultLimit:16,defaultMaxBytes:4096,maxBytes:16384}},options.maxBytes);}
  if(section==='limits')return context({section,display:catalog.display,layouts:catalog.layouts,limits:catalog.limits,binding:catalog.binding?.limits,composition:catalog.composition},options.maxBytes);
  if(section==='resources')return page(section,catalog.resources.filter(item=>name===undefined||item.name===name),options);
  if(section==='styles')return page(section,catalog.style.methods.filter(item=>!item.retired&&(name===undefined||item.name===name||item.alias===name)).map(item=>name===undefined?{name:item.name,alias:item.alias}:{...describeStyle(item),alias:item.alias}),options);
  return page(section,widgetCatalog(catalog).filter(item=>catalog.availableWidgets.includes(item.id)&&(name===undefined||item.name===name)).map(item=>name===undefined?{name:item.name,methodCount:item.methods?.length??0,...(item.appearance?{hasAppearance:true}:{})}:{name:item.name,...describeWidget(item)}),options);
 });
 add('get_data_catalog','Read a bounded real data catalog page: groups, sources, actions or fields. Continue with nextOffset/catalogRevision; restart discovery on 409.',object({kind:choice('groups','sources','actions','fields'),...queries}),args=>data.query({kind:'groups',...args}));
 add('get_project_status','Read native project/storage status and current composition, instance IDs, selected child pages and load errors.',object(),()=>project.info());
 add('get_data','Read bounded selective values. Explicit snapshot:true reads legacy diagnostics/receipts with only maxBytes. Unknown/evicted is distinct from not executed.',object({snapshot:bool,kind:choice('values'),...queries}),({snapshot=false,...args})=>{if(!snapshot)return data.query({kind:'values',...args});if(Object.keys(args).some(key=>key!=='maxBytes'))throw Error('Snapshot accepts only maxBytes');return data.readBounded({maxBytes:args.maxBytes});});
 add('get_data_command','Read one retained execution receipt. Do not poll unknown indefinitely or replay a mutation: inspect actual project/data state. Device restart invalidates old command IDs.',object({id:integer(1)},['id']),async({id})=>{
  const actual=await info();
  if(connectedBootId&&actual.boot_id&&actual.boot_id!==connectedBootId)return {id,state:'interrupted',deviceRestarted:true,note:'The device restarted since connection. Old receipt IDs are invalid and can be reused. Stop polling this ID; inspect saved project and current data, then reconnect. Never replay a mutation blindly.'};
  const receipt=await data.receipt(id);
  return receipt.state==='unknown'?{...receipt,note:'No retained execution result. It may be pending or evicted. Do not poll indefinitely or infer failure; inspect actual project/data state before any retry.'}:receipt;
 });
 add('invoke_action','Invoke an application-registered action. Pass the raw JSON value required by its action schema, for example args:"dusk" for a text schema. Waits for execution receipt by default. No project save or automatic POST retry.',object({name,args:{description:'Actual action value as JSON. For a text schema use a JSON string, without a literal or other binding-expression wrapper.'},wait:bool},['name']),async({name,args=null,wait=true})=>data.invoke(name,args,await caps(),{wait}),write);
 add('write_source','Write a target-declared writable source/field with schema validation. Application setter and receipt remain authoritative.',object({source:name,path:{type:'array',items:{}},value:{},wait:bool},['source','value']),async({source,path=[],value,wait=true})=>data.write(source,path,value,await caps(),{wait}),write);
 add('send_event','Send a diagnostic LVGL event to a local node/root or numbered live page instance. Configured navigation uses the real composition runtime. Not physical touch.',object({node:name,event:choice(...bindingContract.events),instance:integer(1,0xffffffff),wait:bool},['node','event']),async({node,event,instance,wait=true})=>data.event(node,event,instance,await caps(),{wait}),write);
 add('read_project','Read the complete saved project as editable JSON, without display changes.',object(),async()=>project.read(await caps()));
 add('read_project_document','Read a saved screen/style. For screens, outline:true reads IDs/tree; node selects one subtree and its screen-local style context.',object({kind:choice('screens','styles'),name,node:name,outline:bool},['kind','name']),async({kind,name,node,outline=false})=>project.readDocument(kind,name,{capabilities:await caps(),node,outline}));
 add('preview_project','Display an unsaved project screen through native ProjectService. Does not write storage.',object({project:document,screen:name},['project','screen']),async({project:doc,screen})=>project.preview(doc,screen,{capabilities:await caps()}),display);
 add('refresh_project_display','Reload the current saved composition preserving selected nested pages by stable node paths. Does not save.',object(),()=>project.refresh(),display);
 add('show_project_screen','Show a saved page by name; starts its navigation defaults. Does not write project storage.',object({screen:name},['screen']),({screen})=>project.show(screen),display);
 add('save_project','Save the complete project with current revision through existing store. Default nonvisual; refresh:true preserves selected nested pages. Never repeat an unconfirmed save blindly.',object({project:document,revision:text(1,32),refresh:bool},['project','revision']),async({project:doc,revision,refresh})=>savedDisplay(await saveProject.save(doc,{capabilities:await caps(),revision}),refresh),write);
 add('write_project_document','Revision-checked screen/style replacement. With node, document must be the matching NODE OBJECT with the same id. Default nonvisual; refresh:true reloads selected composition.',object({kind:choice('screens','styles'),name,document,revision:text(1,32),node:name,refresh:bool},['kind','name','document','revision']),async({kind,name,document,revision,node,refresh})=>savedDisplay(await saveProject.write(kind,name,document,{capabilities:await caps(),revision,node}),refresh),write);
 add('reset_project_changes','Explicitly discard all changes or a named override with revision. Does not switch the display.',object({kind:choice('screens','styles'),name,revision:text(1,32)},['revision']),({kind,name,revision})=>{if(Boolean(kind)!==Boolean(name))throw Error('Provide both kind and name, or neither');return project.reset({kind,name,revision});},write);
 add('send_view_input','Send one native LVGL pointer state. Coordinates are original display pixels, not PNG or CSS pixels. Uses real hit-testing/events/bindings. Never retries a press or waits for an image; release after a gesture. Target must advertise native_view_input.',object({x:integer(0,8191),y:integer(0,8191),pressed:bool},['x','y','pressed']),async state=>{
  if(!inputSupported)throw Error('display_input_unavailable');
  const signal=AbortSignal.any([operationSignal,AbortSignal.timeout(2000)]);
  const response=await fetcher(origin+'/api/view/input',{method:'POST',headers:{'Content-Type':'application/cbor'},body:encode(state),signal,timeoutMs:2000,redirect:'error'});
  const ack=await readBoundedDataJson(response,1024);if(!response.ok||ack.ok!==true)throw Error(ack.error??'Input HTTP '+response.status);return ack;
 },display);
 add('get_display_frame','Read the last completed LVGL preview as PNG. fresh waits for the next completed update. To verify navigation, keep the previous scene number, navigate separately, then pass it as afterScene to wait for a newer scene. If preview is absent, capture on the target. Never navigates.',object({maxEdge:integer(128,1024),fresh:bool,afterScene:integer(0,0xffffffff)}),async args=>{
  const deadline=AbortSignal.any([operationSignal,AbortSignal.timeout(15000)]);
  const preview=getPreviewFrame?.(args,deadline);
  let frame;
  if(preview!==undefined){
   try {frame=await preview;}
   catch(error){if(deadline.aborted&&!operationSignal.aborted)throw Error('preview_frame_timeout: no matching completed preview within 15 seconds');throw error;}
  }else{
   const frameFetcher=(input,options={})=>fetcher(input,{...options,signal:options.signal?AbortSignal.any([options.signal,deadline]):deadline});
   const infoResponse=await frameFetcher(origin+'/api/info',{method:'GET',redirect:'error'}),actual=await readBoundedDataJson(infoResponse,262144);
   if(!infoResponse.ok)throw Error('Device HTTP '+infoResponse.status);if(actual.native_view!==true)throw Error('display_capture_unavailable');
   let scene, frameRevision;
   const bytes=await fetchFrameBmp(frameFetcher,origin,{signal:deadline,onHeaders(headers){
    const value=headers.get('X-Frame-Scene');
    scene=value===null?undefined:Number(value);
    frameRevision=headers.get('X-Frame-Revision')??undefined;
   }});
   if(args.afterScene!==undefined&&!isAfterScene(scene,args.afterScene))throw Error('display_scene_not_advanced');
   deadline.throwIfAborted();
   const capturedAt=Date.now(),image=await frameAwait(frameEncoder(bytes,args),deadline);
   const status=await new ProjectClient(origin,{fetcher:frameFetcher,timeout:15000}).info();
   frame={...image,source:'device',scene,frameRevision,capturedAt,display:status.display,projectRevision:status.project?.revision,displayRevisionMatchesSaved:status.display?status.display.revision===status.project?.revision:null};
  }
  const {data:base64,mimeType,...metadata}=frame;
  return {content:[{type:'text',text:JSON.stringify(metadata)},{type:'image',data:base64,mimeType}]};
 });

 return {definitions,handlers,capabilities,info};
 }
 const catalog=makeContext();
 return {
  async connect(){
   inputSupported=false;previewOnly=false;
   const device=await catalog.info();
   previewOnly=device.source==='device' && device.native_view===true && device.native_view_ws===true &&
    device.native_view_ws_only===true && device.native_view_packets===true && device.native_view_packet_version===2;
   const actual=previewOnly ? {device,capabilities:{display:device.display}} : await catalog.capabilities(device);
   ensure();inputSupported=device.native_view_input===true;connectedBootId=device.boot_id;
   const tools=catalog.definitions.filter(tool=>previewOnly
    ? tool.name==='get_device'||(tool.name==='send_view_input'&&inputSupported)
    : tool.name!=='send_view_input'||inputSupported);
   return {tools:structuredClone(tools),instructions:previewOnly
    ? 'The target exposes display preview and pointer diagnostics.'
    : 'Local Designer tools execute existing target HTTP/CBOR APIs through shared codecs. Connecting is passive. Preview and save are separate; application permissions remain authoritative.',...actual};
  },
  async call(name,args={},callId='browser-call-'+(++nextCall)){
   let tool,controller;
   try{
    ensure();if(typeof callId!=='string'||!callId||callId.length>64)throw Error('Invalid direct call id');if(operations.has(callId))throw Error('Duplicate direct call id');
    controller=new AbortController();operations.set(callId,controller);
    if(cancelledBeforeStart.delete(callId))controller.abort(Error('Direct call cancelled'));
    const operation=makeContext(AbortSignal.any([lifetime.signal,controller.signal]));tool=operation.handlers.get(name);
    if(!tool)throw Error('Unknown target tool '+name);
    if(previewOnly && name!=='get_device' && name!=='send_view_input')throw Error('Tool unavailable on display-only target');
    const value=await tool.handler(argumentsFor(args,tool.inputSchema));
    return value?.content?value:result(disposed?{...value,connectionClosed:true}:controller.signal.aborted?{...value,callCancelled:true}:value);
   }catch(error){
    const uncertain=tool?.annotations.readOnlyHint===false&&(error instanceof ProjectSaveUnconfirmed||disposed||controller?.signal.aborted||['AbortError','TimeoutError'].includes(error.name)||/unconfirmed|timed? ?out|cancelled|aborted/i.test(error.message));
    return {isError:true,content:[{type:'text',text:uncertain?JSON.stringify({state:'unconfirmed',operation:name,error:error.message,observedRevision:error.observedRevision,note:'Cancellation or connection loss does not prove failure. Read the saved project or execution receipt before retrying; never repeat a mutation blindly.'}):error instanceof DataQueryError?JSON.stringify({error:error.code,message:error.message,status:error.status,...error.details}):error.message}]};
   }finally{if(controller&&operations.get(callId)===controller)operations.delete(callId);}
  },
  cancelCall(callId){
   if(disposed||typeof callId!=='string'||!callId||callId.length>64)return false;
   const controller=operations.get(callId);if(controller){controller.abort(Error('Direct call cancelled'));return true;}
   // Cancel may arrive before the queued WebView invocation. Keep only a bounded
   // set of these GUIDs; a later unrelated call and the connection remain usable.
   cancelledBeforeStart.add(callId);if(cancelledBeforeStart.size>128)cancelledBeforeStart.delete(cancelledBeforeStart.values().next().value);return false;
  },
  dispose(){disposed=true;lifetime.abort(Error('Direct target disconnected'));for(const controller of operations.values())controller.abort(Error('Direct target disconnected'));cancelledBeforeStart.clear();}
 };
}
