// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Only NaWServer listens. This process reuses the SDK/tool handlers over private pipes.
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeMcpHandler} from './native-http.js';
const option=(key,fallback)=>process.argv.find(s=>s.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;
const port=Number(option('port','5302')),bind=option('bind','127.0.0.1'),device=option('device','http://127.0.0.1:5301');
if(!Number.isInteger(port)||port<0||port>65535||port===443)throw Error('Invalid MCP port');
if(bind!=='127.0.0.1')throw Error('Development MCP gateway is loopback-only; use adb reverse for a phone');
const root=fileURLToPath(new URL('../../',import.meta.url));
const exe=resolve(option('exe',resolve(root,'local/mcp-gateway/Release/nacborui_mcp_gateway.exe')));
const handle=createNativeMcpHandler({device,allowPreview:true,allowSave:true,allowData:true,css:false});
const child=spawn(exe,[String(port),bind],{windowsHide:true,stdio:['pipe','pipe','pipe']});let input=Buffer.alloc(0);
function reply(id,status,text){const data=Buffer.from(text),header=Buffer.alloc(12);header.writeUInt32LE(id);header.writeUInt32LE(status,4);header.writeUInt32LE(data.length,8);child.stdin.write(Buffer.concat([header,data]));}
child.stdout.on('data',chunk=>{input=Buffer.concat([input,chunk]);while(input.length>=12){const id=input.readUInt32LE(0),status=input.readUInt32LE(4),size=input.readUInt32LE(8);if(size>4*1024*1024){child.kill();throw Error('Native MCP envelope limit');}if(input.length<12+size)break;const body=input.subarray(12,12+size).toString('utf8');input=input.subarray(12+size);if(id===0){console.log(JSON.stringify({event:'mcp_ready',url:'http://127.0.0.1:'+status+'/mcp',bind,device,nativePid:child.pid}));continue;}void handle(body).then(text=>reply(id,text?200:202,text)).catch(error=>reply(id,500,JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32603,message:error.message}})));}});
child.stderr.on('data',data=>process.stderr.write(data));child.on('exit',code=>{process.exitCode=code??1;});child.on('error',error=>{console.error(error.message);process.exitCode=1;});
process.stdin.resume();process.stdin.on('end',()=>child.stdin.end());
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{child.stdin.end();});
