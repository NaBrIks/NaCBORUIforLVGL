// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/server';
import {createServer} from './server.js';

// Adapt one raw JSON-RPC body to the SDK's standard Web Streamable HTTP transport.
// The native NaWServer owns the listener and forwards each request body here.
export function createNativeMcpHandler({device,allowPreview=false,allowSave=false,allowData=false,css=true,fetcher=globalThis.fetch}={}){
 return async body=>{
  if(typeof body!=='string')throw new TypeError('MCP request body must be a string');
  const server=createServer({device,allowPreview,allowSave,allowData,css,fetcher});
  const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  try{
   await server.connect(transport);
   const request=new Request('http://127.0.0.1:5302/mcp',{method:'POST',headers:{accept:'application/json, text/event-stream','content-type':'application/json'},body});
   const response=await transport.handleRequest(request);
   return await response.text();
  }finally{
   await server.close();
  }
 };
}
