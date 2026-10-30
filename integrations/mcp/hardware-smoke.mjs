// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Explicit hardware test: changes the screen on the device passed on the command line.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {serializeDocument,parseDocument} from '../../packages/document-io/index.js';
import {importCss,exportCss} from '../../packages/css-codec/index.js';
import {createScreen} from '../../frontend/src/screen-model.js';
import {createProject} from '../../packages/project-codec/index.js';

const origin=process.argv[2];if(!origin)throw Error('Usage: node integrations/mcp/hardware-smoke.mjs http://DEVICE');
const before=await (await fetch(origin+'/api/info')).json(),client=new Client({name:'lvgl-cbor-hardware-check',version:'0.1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./index.js',import.meta.url))],env:{PATH:process.env.PATH,LVGL_CBOR_DEVICE:origin,LVGL_CBOR_ALLOW_PREVIEW:'1'},stderr:'pipe'}));
const results=[];
async function call(name,args){
 if(name==='apply_document'){
  let project,screen;
  if(args.kind==='screen'){screen=args.document;project=createProject([screen]);}
  else{screen=createScreen('style-preview','Style preview');screen.root.children=[];screen.root.style={};const style={...args.document,scope:'global',attach:false};screen.root.styles=[{ref:'global:'+style.name}];project=createProject([screen],{styles:{[style.name]:style}});}
  name='preview_project';args={project,screen:screen.id};
 }
 const response=await client.callTool({name,arguments:args});assert.notEqual(response.isError,true,JSON.stringify(response));return JSON.parse(response.content[0].text);
}
try{
 const device=await call('get_device',{});assert.equal(device.info.boot_id,before.boot_id);
 await call('apply_document',{kind:'style',document:{scope:'screen',name:'module-check',copy:'global:base',props:{text_color:'#80dfb0',bg_color:'#173344',width:420,height:150},attach:true}});
 for(const name of ['absolute','flex','grid','nested','shared','widgets']){
  const document=JSON.parse(await readFile(new URL('../../examples/screens/'+name+'.json',import.meta.url),'utf8'));
  for(const format of ['json','cbor']){const bytes=serializeDocument('screen',document,format,{capabilities:device.capabilities}),loaded=parseDocument('screen',bytes,{capabilities:device.capabilities});const ack=await call('apply_document',{kind:'screen',document:loaded});assert.ok(ack.nodes>0);results.push({name,format,bytes:bytes.length,nodes:ack.nodes});}
 }
 let document=createScreen('module-check','Modules · JSON CBOR CSS MCP');document.root.children[0].props.text='JSON / CBOR / CSS / MCP';document.root.children[1].children[0].props.text='75 %';document.root.children[1].children[1].props.value=75;
 const css='#root { background-color:#101820; padding:24px; } #content { border:2px solid #36b58c; background-color:#173344; } #value {color:#80dfb0;} #level::indicator {background-color:#36b58c;}';
 const conversion=await call('convert_css',{kind:'screen',document,css,direction:'import'});assert.equal(conversion.ok,true);document=conversion.document;
 // Repeated CSS export/import and both file encodings before each real application.
 for(let i=0;i<20;i++){
  const cssText=exportCss(document),converted=importCss(cssText,{document});assert.equal(converted.ok,true,JSON.stringify(converted.diagnostics));document=converted.document;
  const format=i%2?'json':'cbor',bytes=serializeDocument('screen',document,format,{capabilities:device.capabilities});document=parseDocument('screen',bytes,{capabilities:device.capabilities});
  const ack=await call('apply_document',{kind:'screen',document});assert.equal(ack.nodes,5);results.push({name:'css-file-replace-'+i,format,nodes:ack.nodes});
 }
 const after=await (await fetch(origin+'/api/info')).json();assert.equal(after.boot_id,before.boot_id);
 const report={origin,before,results,after,document};await writeFile(new URL('../../local/modules-hardware-smoke.json',import.meta.url),JSON.stringify(report,null,2));
 await writeFile(new URL('../../local/modules-verified-screen.json',import.meta.url),JSON.stringify(document,null,2));
 console.log(JSON.stringify({screenApplications:results.length,styleApplications:1,boot_id:after.boot_id,embedded_editor:after.embedded_editor}));
}finally{try{const saved=await call('get_project_status',{});await call('show_project_screen',{screen:saved.project.entry});}finally{await client.close();}}
