// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
test('product MCP has no external host adapter or launch configuration',()=>{
 assert.equal(existsSync(new URL('integrations/mcp/',root)),false);
 const configs=['.mcp.json','.codex/config.toml'].map(path=>readFileSync(new URL(path,root),'utf8')).join('\n');
 assert.doesNotMatch(configs,/integrations[\\/]mcp|run-http|nacborui_mcp_gateway|@modelcontextprotocol/);
 const session=readFileSync(new URL('tools/designer/Core/DesignerSession.cs',root),'utf8');
 assert.doesNotMatch(session,/new StdioTransport|Options\.McpCommand|Options\.McpArguments/);
 assert.match(session,/new HttpTransport/);
});
