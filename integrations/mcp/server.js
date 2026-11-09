// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {McpServer} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {serializeDocument} from '../../packages/document-io/index.js';
import {createProject} from '../../packages/project-codec/index.js';
import {bindingContract,compositionContract} from '../../packages/screen-codec/index.js';
import {DeviceClient} from './device.js';
import {DataQueryError} from '../../packages/project-codec/data-query.js';
import {readFile} from 'node:fs/promises';
import {describeWidget,describeStyle} from '../../packages/document-io/ui-reference.js';
import {readUiReference} from './ui-reference.js';

// Optional host adapter over the same project codec/API as the editor.
// Display operations and storage writes are independently removable at registration time.
export function createServer({device,allowApply=false,allowPreview=allowApply,allowSave=false,allowData=false,css=true,fetcher=globalThis.fetch}={}){
 const server=new McpServer({name:'NaCBORUIforLVGL',version:'0.2.0'}),client=device?new DeviceClient(device,{timeout:15000,fetcher}):null;
 const kind=z.enum(['screen','style','project']),doc=z.record(z.string(),z.unknown()).describe('Editable JSON OBJECT, not a JSON-encoded string. Pass the complete object itself. A complete screen has format,id,name,size and root; when node is selected pass only the matching node object; every node has id and type. Do not call JSON.stringify on this parameter; only the outer function.arguments is serialized.'),name=z.string().min(1).max(63);
 const readOnly={readOnlyHint:true,destructiveHint:false,openWorldHint:false},display={readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false},write={readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false};
 const caps=()=>client?client.capabilities():undefined;
 const savedDisplay=async (result,refresh=false)=>{
  if(!result.saved)return result;
  if(refresh){
   try{await client.project.refresh();}
   catch(error){return {...result,displayUpdatedBySave:false,refreshError:error.message,note:'Saved successfully; display refresh failed. Do not repeat the save. Retry refresh_project_display if needed.'};}
  }
  const note=refresh?'Saved and displayed composition refreshed with its selected nested pages.':'Saved only; displayed instances are unchanged. If showing is requested, call refresh_project_display to reload the current composition while retaining selected child pages.';
  try{const status=await client.project.info();return {...result,displayUpdatedBySave:refresh,displayStatusKnown:Boolean(status.display),displayRevisionMatchesSaved:status.display?status.display.revision===result.revision:null,entry:status.project?.entry,display:status.display,note};}
  catch{return {...result,displayUpdatedBySave:refresh,displayStatusKnown:false,note};}
 };

 const add=(name,description,inputSchema,handler,annotations=readOnly,content=data=>[{type:'text',text:JSON.stringify(data)}])=>server.registerTool(name,{description,inputSchema,annotations},async args=>{
  try{return {content:content(await handler(args))};}catch(e){return {isError:true,content:[{type:'text',text:e instanceof DataQueryError?JSON.stringify({error:e.code,message:e.message,status:e.status,...e.details}):e.message}]};}
 });
 const example=async kind=>{const screen=JSON.parse(await readFile(new URL('../../examples/screens/agent-grid-controls.json',import.meta.url),'utf8'));return kind==='screen'?screen:kind==='project'?createProject([screen]):{scope:'global',name:'example',props:{width:320,height:120,bg_color:'#173344',bg_opa:255,text_color:'#ffffff',pad_all:12},attach:false};};
 add('get_ui_reference','JSON authoring documentation for LVGL layouts or styles. Use topic:index to list topics; default overview explains the format. Screen topics include component names, common, bindings-events, view, enumerations/parts/states/flags. Style topics include property aliases and enumerations. This is documentation, not an internal codec contract.',z.object({kind:z.enum(['screen','style']),topic:name.optional()}),readUiReference);
 add('get_example','Complete JSON example: screen is a 2x2 grid with two buttons, a checkbox and text input for a number, styles and bindings. example.* sources/actions are illustrative and must be replaced with real MCP catalog entries.',z.object({kind}),({kind})=>example(kind));
 add('validate_document','Validate screen/style/project JSON with the common validators and actual device capabilities when connected. Does not save or show anything.',z.object({kind,document:doc}),async({kind,document})=>{const capabilities=await caps();serializeDocument(kind,document,'cbor',{capabilities});return {valid:true,kind,checkedAgainst:client?'device':'authoring-format'};});
 if(css)add('convert_css','Import/export the documented CSS subset for a screen or style; errors return diagnostics.',z.object({kind:z.enum(['screen','style']),document:doc,direction:z.enum(['import','export']),css:z.string().max(262144).optional()}),async({kind,document,direction,css})=>{const {importCss,exportCss}=await import('../../packages/css-codec/index.js');const capabilities=await caps();return direction==='export'?{css:exportCss(document,{kind})}:importCss(css??'',{kind,document,capabilities});});
 if(client){
  const bounded={offset:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),limit:z.number().int().min(1).max(64).optional(),maxBytes:z.number().int().min(512).max(16384).optional()};
  const queryFields={group:name.optional(),prefix:z.string().max(63).optional(),name:name.optional(),path:z.string().max(512).optional(),descendants:z.boolean().optional(),detail:z.boolean().optional(),...bounded,catalogRevision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional()};
  const context=(value,maxBytes)=>{const bytes=new TextEncoder().encode(JSON.stringify(value)).length;if(bytes>maxBytes)throw new DataQueryError('device_context_too_large','Device section exceeds maxBytes; narrow name/limit or increase maxBytes',{status:413,maxBytes,bytes});return value;};
  const page=(section,items,{offset=0,limit=16,maxBytes=4096}={})=>{const selected=items.slice(offset,offset+limit),nextOffset=offset+selected.length<items.length?offset+selected.length:null;return context({section,total:items.length,offset,nextOffset,hasMore:nextOffset!==null,items:selected},maxBytes);};
  add('get_device','Actual device capabilities for JSON authoring: summary, widgets, styles, resources or limits. Use name for full JSON method/value metadata; unnamed lists are summaries. For bindings/sources/actions use get_data_catalog. Results are bounded; narrow name/limit or continue with nextOffset.',z.object({section:z.enum(['summary','widgets','styles','resources','limits']).optional(),name:name.optional(),...bounded}).strict(),async({section='summary',name,...options})=>{
   const capabilities=await caps();
   if(section==='summary'){
    const raw=await client.info(),info=Object.fromEntries(['source','name','platform','native_view','boot_id','lvgl'].filter(key=>raw[key]!==undefined).map(key=>[key,raw[key]]));
    return context({section,info,display:capabilities.display,sections:['widgets','styles','resources','limits'],counts:{widgets:capabilities.availableWidgets.length,styles:capabilities.style.methods.length,resources:capabilities.resources.length,sources:capabilities.binding?.sources.length??0,actions:capabilities.binding?.actions.length??0},dataQuery:{tool:'get_data_catalog',kinds:['groups','sources','actions','fields'],defaultLimit:16,defaultMaxBytes:4096,maxBytes:16384}},options.maxBytes??4096);
   }
   if(section==='limits')return context({section,display:capabilities.display,layouts:capabilities.layouts,limits:capabilities.limits,binding:capabilities.binding?.limits,composition:capabilities.composition},options.maxBytes??4096);
   if(section==='resources')return page(section,capabilities.resources.filter(item=>name===undefined||item.name===name),options);
   if(section==='styles')return page(section,capabilities.style.methods.filter(item=>!item.retired&&(name===undefined||item.name===name||item.alias===name)).map(item=>name===undefined?{name:item.name,alias:item.alias}:({...describeStyle(item),alias:item.alias})),options);
   const available=new Set(capabilities.availableWidgets),widgets=[...(capabilities.screen?.widgets??[]).filter(item=>available.has(item.id)),...(capabilities.extensions??[]).filter(item=>available.has(item.id)).map(item=>({...item.contract,id:item.id,name:item.name,abi:item.abi}))];
   return page(section,widgets.filter(item=>name===undefined||item.name===name).map(item=>name===undefined?{name:item.name,methodCount:item.methods?.length??0}:({name:item.name,...describeWidget(item)})),options);
  });
  add('get_data_catalog','Read a bounded page from the actual application data catalog. Start with groups, then select sources/actions by group/prefix, or fields by source name and JSON Pointer path. detail=true returns the selected complete schema. Defaults: 16 items / 4096 bytes. Continue with nextOffset and catalogRevision; 409 requires restarting discovery. No full legacy snapshot is downloaded or filtered.',z.object({kind:z.enum(['groups','sources','actions','fields']).optional(),...queryFields}).strict(),args=>client.data.query({kind:'groups',...args}));
  add('get_display_frame','Capture one fresh real LVGL display frame for visual feedback, including the shell and current nested page. Read-only; no save, navigation, pointer input or OS screenshot. Requires device info.native_view=true; unsupported devices return an explicit error. Use once after applying a meaningful design change, not continuous polling. maxEdge defaults1024; retry smaller if image context is too large. Returns image content plus original/encoded dimensions and display metadata read after capture.',z.object({maxEdge:z.number().int().min(128).max(1024).optional()}).strict(),async args=>{const frame=await client.displayFrame(args),status=await client.project.info();return {...frame,display:status.display,projectRevision:status.project?.revision,displayRevisionMatchesSaved:status.display?status.display.revision===status.project?.revision:null};},readOnly,({bytes,mimeType,...metadata})=>[{type:'text',text:JSON.stringify(metadata)},{type:'image',data:bytes.toString('base64'),mimeType}]);
  add('get_project_status','Read project/storage policy and live composition: display.instance and display.views with selected pages, child instance IDs and load errors.',z.object({}),()=>client.project.info());
  add('get_data','Default: bounded selective values summaries, 16 items / 4096 bytes; composite values are summaries unless detail=true. Select source name and JSON Pointer path for needed values. Explicit snapshot=true requests the legacy snapshot with diagnostics/receipts within maxBytes (max16384), never silently truncated. Snapshot mode accepts only maxBytes. get_data_command reads one receipt.',z.object({snapshot:z.boolean().optional(),kind:z.literal('values').optional(),...queryFields}).strict(),({snapshot=false,...args})=>{
   if(!snapshot)return client.data.query({kind:'values',...args});
   if(Object.keys(args).some(key=>key!=='maxBytes'))throw new DataQueryError('data_query_invalid','Snapshot mode accepts only maxBytes');
   return client.data.readBounded({maxBytes:args.maxBytes});
  });
  add('get_data_command','Read a queued command result by id. Unknown means not yet observed or evicted from bounded history; it does not mean the command was not executed.',z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}),({id})=>client.data.receipt(id));
  if(allowData){
   const wait={wait:z.boolean().optional()},instance=z.number().int().min(1).max(0xffffffff).optional();
   const runtime={...write};
   add('invoke_action','Invoke an application-declared action using its schema. Waits for execution receipt by default; queued/unconfirmed never means success. Does not save a project.',z.object({name,args:z.json().optional(),...wait}),async({name,args=null,wait=true})=>client.data.invoke(name,args,await caps(),{wait}),runtime);
   add('write_source','Write a writable source or its field/array element using the device schema. The application setter remains authoritative. Does not save a project.',z.object({source:name,path:z.array(z.union([z.string(),z.number().int().nonnegative()])).optional(),value:z.json(),...wait}),async({source,path=[],value,wait=true})=>client.data.write(source,path,value,await caps(),{wait}),runtime);
   add('send_event','Send a diagnostic LVGL event to a local node in the specified live page instance; omit instance only for the root. A configured navigation event switches its container through the existing runtime. Does not simulate physical touch or save a project.',z.object({node:name,event:z.enum(bindingContract.events),instance,...wait}),async({node,event,instance,wait=true})=>client.data.event(node,event,instance,await caps(),{wait}),runtime);
  }
  add('read_project','Read the whole saved MCU project as editable JSON. Does not change the display.',z.object({}),async()=>client.project.read(await caps()));
  add('read_project_document','Read a saved screen/style. For large screens first use outline:true (IDs/types/tree without properties), then node:<ID> to read only that subtree with screen-local style context. node/outline apply only to screens. ',z.object({kind:z.enum(['screens','styles']),name,node:name.optional(),outline:z.boolean().optional()}),async({kind,name,node,outline=false})=>client.project.readDocument(kind,name,{capabilities:await caps(),node,outline}));
  if(allowPreview){
   add('preview_project','Show an unsaved project screen on the LCD. Does not write project storage. Requires allowPreview.',z.object({project:doc,screen:name}),async({project,screen})=>client.project.preview(project,screen,{capabilities:await caps()}),display);
   add('refresh_project_display','Reload the displayed saved project in place, preserving current nested view selections by stable node paths. Does not write storage. Use after saving edits; explicit show_project_screen starts navigation from defaults.',z.object({}),()=>client.project.refresh(),display);
   add('show_project_screen','Load a saved screen by name through MCU ProjectService. Does not write storage.',z.object({screen:name}),({screen})=>client.project.show(screen),display);
  }
  if(allowSave){
   add('save_project','Explicitly save the whole project into the MCU configured changes store. Requires a revision from read_project/get_project_status. Does not switch the LCD. RAM stores are volatile. Optional refresh:true reloads the current composition preserving nested selections.',z.object({project:doc,revision:z.string().min(1).max(32),refresh:z.boolean().optional()}),async({project,revision,refresh})=>savedDisplay(await client.project.save(project,{capabilities:await caps(),revision}),refresh),write);
   add('write_project_document','Explicit save with revision. Without node: replace one screen/style document. With node:<ID>: replace only that existing screen subtree; document is a NODE OBJECT with the SAME id, not a whole screen or JSON string. Other branches, bindings/events and styles remain unchanged. Saving is nonvisual by default. Optional refresh:true reloads the current composition preserving nested selections; otherwise: if showing was requested call refresh_project_display to preserve the current composition.',z.object({kind:z.enum(['screens','styles']),name,document:doc,revision:z.string().min(1).max(32),node:name.optional(),refresh:z.boolean().optional()}),async({kind,name,document,revision,node,refresh})=>savedDisplay(await client.project.write(kind,name,document,{capabilities:await caps(),revision,node}),refresh),write);
   add('reset_project_changes','Explicitly discard all changes or one named override, restoring the base. Does not switch the LCD.',z.object({kind:z.enum(['screens','styles']).optional(),name:name.optional(),revision:z.string().min(1).max(32)}),({kind,name,revision})=>{if(Boolean(kind)!==Boolean(name))throw Error('Provide both kind and name, or neither');return client.project.reset({kind,name,revision});},write);
  }
 }
 return server;
}
