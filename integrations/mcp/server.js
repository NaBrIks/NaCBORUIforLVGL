// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {McpServer} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {serializeDocument,parseDocument} from '../../packages/document-io/index.js';
import {createProject} from '../../packages/project-codec/index.js';
import {contract} from '../../packages/style-codec/contract.js';
import {screenContract} from '../../packages/screen-codec/contract.js';
import {bindingContract,compositionContract} from '../../packages/screen-codec/index.js';
import {DeviceClient} from './device.js';
import {readFile} from 'node:fs/promises';

// Optional host adapter over the same project codec/API as the editor.
// Display operations and storage writes are independently removable at registration time.
export function createServer({device,allowApply=false,allowPreview=allowApply,allowSave=false,allowData=false,css=true}={}){
 const server=new McpServer({name:'NaCBORUIforLVGL',version:'0.2.0'}),client=device?new DeviceClient(device,{timeout:15000}):null;
 const kind=z.enum(['screen','style','project']),doc=z.record(z.string(),z.unknown()),name=z.string().min(1).max(63);
 const readOnly={readOnlyHint:true,destructiveHint:false,openWorldHint:false},display={readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false},write={readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false};
 const caps=()=>client?client.capabilities():undefined;
 const add=(name,description,inputSchema,handler,annotations=readOnly)=>server.registerTool(name,{description,inputSchema,annotations},async args=>{
  try{const data=await handler(args);return {content:[{type:'text',text:JSON.stringify(data)}]};}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}
 });
 const example=async kind=>{const screen=JSON.parse(await readFile(new URL('../../examples/screens/absolute.json',import.meta.url),'utf8'));return kind==='screen'?screen:kind==='project'?createProject([screen]):{scope:'global',name:'example',props:{width:320,height:120,bg_color:'#173344',bg_opa:255,text_color:'#ffffff',pad_all:12},attach:false};};
 function base64(value){if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw Error('Invalid base64');return new Uint8Array(Buffer.from(value,'base64'));}
 add('get_contract','Bundled screen/style/binding/composition contract. Actual sources, actions, native components and limits come from get_device.',z.object({kind:z.enum(['screen','style','binding','composition'])}),({kind})=>({screen:screenContract,style:contract,binding:bindingContract,composition:compositionContract})[kind]);
 add('get_example','Editable JSON example of a whole project, screen or named style.',z.object({kind}),({kind})=>example(kind));
 add('compile_document','Validate and compile screen/style/project JSON to CBOR. Does not send or save anything.',z.object({kind,document:doc}),async({kind,document})=>{
  const capabilities=await caps(),bytes=serializeDocument(kind,document,'cbor',{capabilities});return {bytes:bytes.length,cborBase64:Buffer.from(bytes).toString('base64'),document:parseDocument(kind,bytes,{capabilities}),checkedAgainst:client?'device':'bundled-contract'};
 });
 add('decode_document','Decode screen/style/project CBOR to editable JSON, using the configured device native catalog when available.',z.object({kind,cborBase64:z.string().min(1).max(2800000)}),async({kind,cborBase64})=>parseDocument(kind,base64(cborBase64),{format:'cbor',capabilities:await caps()}));
 if(css)add('convert_css','Import/export the documented CSS subset for a screen or style; errors return diagnostics.',z.object({kind:z.enum(['screen','style']),document:doc,direction:z.enum(['import','export']),css:z.string().max(262144).optional()}),async({kind,document,direction,css})=>{const {importCss,exportCss}=await import('../../packages/css-codec/index.js');const capabilities=await caps();return direction==='export'?{css:exportCss(document,{kind})}:importCss(css??'',{kind,document,capabilities});});
 if(client){
  add('get_device','Read configured device INFO and actual capabilities, including its native component catalog.',z.object({}),async()=>({info:await client.info(),capabilities:await client.capabilities()}));
  add('get_project_status','Read project/storage policy and live composition: display.instance and display.views with selected pages, child instance IDs and load errors.',z.object({}),()=>client.project.info());
  add('get_data','Read live source values with known/unknown states, revisions, diagnostics and bounded command receipts. Source/action schemas come from get_device capabilities.binding.',z.object({}),()=>client.data.read());
  add('get_data_command','Read a queued command result by id. Unknown means not yet observed or evicted from bounded history; it does not mean the command was not executed.',z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}),({id})=>client.data.receipt(id));
  if(allowData){
   const wait={wait:z.boolean().optional()},instance=z.number().int().min(1).max(0xffffffff).optional();
   const runtime={...write};
   add('invoke_action','Invoke an application-declared action using its schema. Waits for execution receipt by default; queued/unconfirmed never means success. Does not save a project.',z.object({name,args:z.json().optional(),...wait}),async({name,args=null,wait=true})=>client.data.invoke(name,args,await caps(),{wait}),runtime);
   add('write_source','Write a writable source or its field/array element using the device schema. The application setter remains authoritative. Does not save a project.',z.object({source:name,path:z.array(z.union([z.string(),z.number().int().nonnegative()])).optional(),value:z.json(),...wait}),async({source,path=[],value,wait=true})=>client.data.write(source,path,value,await caps(),{wait}),runtime);
   add('send_event','Send a diagnostic LVGL event to a local node in the specified live page instance; omit instance only for the root. A configured navigation event switches its container through the existing runtime. Does not simulate physical touch or save a project.',z.object({node:name,event:z.enum(bindingContract.events),instance,...wait}),async({node,event,instance,wait=true})=>client.data.event(node,event,instance,await caps(),{wait}),runtime);
  }
  add('read_project','Read the whole saved MCU project as editable JSON. Does not change the display.',z.object({}),async()=>client.project.read(await caps()));
  add('read_project_document','Read one named screen/style from the saved MCU project.',z.object({kind:z.enum(['screens','styles']),name}),async({kind,name})=>{const {project,revision}=await client.project.read(await caps());if(!Object.hasOwn(project[kind],name))throw Error('Project document not found');return {document:project[kind][name],revision};});
  if(allowPreview){
   add('preview_project','Show an unsaved project screen on the LCD. Does not write project storage. Requires allowPreview.',z.object({project:doc,screen:name}),async({project,screen})=>client.project.preview(project,screen,{capabilities:await caps()}),display);
   add('show_project_screen','Load a saved screen by name through MCU ProjectService. Does not write storage.',z.object({screen:name}),({screen})=>client.project.show(screen),display);
  }
  if(allowSave){
   add('save_project','Explicitly save the whole project into the MCU configured changes store. Requires a revision from read_project/get_project_status. Does not switch the LCD. RAM stores are volatile.',z.object({project:doc,revision:z.string().min(1).max(32)}),async({project,revision})=>client.project.save(project,{capabilities:await caps(),revision}),write);
   add('write_project_document','Explicitly save one named screen/style using a whole-project transaction with the supplied revision. Does not switch the LCD.',z.object({kind:z.enum(['screens','styles']),name,document:doc,revision:z.string().min(1).max(32)}),async({kind,name,document,revision})=>{const capabilities=await caps(),saved=await client.project.read(capabilities);if(saved.revision!==revision)throw Error('project_revision_conflict');Object.defineProperty(saved.project[kind],name,{value:document,enumerable:true,writable:true,configurable:true});return client.project.save(saved.project,{capabilities,revision});},write);
   add('reset_project_changes','Explicitly discard all changes or one named override, restoring the base. Does not switch the LCD.',z.object({kind:z.enum(['screens','styles']).optional(),name:name.optional(),revision:z.string().min(1).max(32)}),({kind,name,revision})=>{if(Boolean(kind)!==Boolean(name))throw Error('Provide both kind and name, or neither');return client.project.reset({kind,name,revision});},write);
  }
 }
 return server;
}
