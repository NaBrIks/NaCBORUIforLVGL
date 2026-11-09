// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeMcpHandler} from './native-http.js';

const request=(id,method,params)=>JSON.stringify({jsonrpc:'2.0',id,method,params});
const notify=method=>JSON.stringify({jsonrpc:'2.0',method});

test('native body adapter uses shared MCP handlers over stateless SDK HTTP transport',async()=>{
 const handle=createNativeMcpHandler();
 const initialize=JSON.parse(await handle(request(1,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'native-test',version:'1'}})));
 assert.equal(initialize.id,1);
 assert.equal(initialize.result.serverInfo.name,'NaCBORUIforLVGL');

 assert.equal(await handle(notify('notifications/initialized')),'');

 const listed=JSON.parse(await handle(request(2,'tools/list',{})));
 assert.equal(listed.id,2);
 const names=listed.result.tools.map(tool=>tool.name);
 assert.ok(names.includes('get_ui_reference'));
 assert.ok(names.includes('validate_document'));

 const called=JSON.parse(await handle(request(3,'tools/call',{name:'get_ui_reference',arguments:{kind:'screen',topic:'index'}})));
 assert.equal(called.id,3);
 assert.equal(called.result.isError,undefined);
 assert.ok(called.result.content[0].text.length>0);
});
