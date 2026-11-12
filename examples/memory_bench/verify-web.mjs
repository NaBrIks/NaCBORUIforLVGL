// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {encode} from 'cborg';
import {fetchFrameBmp, inspectBmp} from '../../packages/project-codec/native-frame.js';
import {readNativeFrame, readFramePackets} from '../../packages/project-codec/progressive-frame.js';

const origin = new URL(process.argv[2]).origin;
const output = process.argv[3] ? pathToFileURL(resolve(process.argv[3]) + sep) :
  new URL('./out/full/', import.meta.url);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const read = async (path, options = {}) => {
  const response = await fetch(origin + path, {signal:AbortSignal.timeout(15000), ...options});
  assert.ok(response.ok, path + ' returned ' + response.status);
  return response;
};
const status = async () => (await read('/api/project')).json();

const before = await status();
assert.equal(before.project.id,'memory-bench');
const index = await (await read('/')).text();
const script = index.match(/src="(\/assets\/[^"]+\.js)"/);
assert.ok(script);
assert.ok((await (await read(script[1])).arrayBuffer()).byteLength > 100);
assert.ok((await (await read('/api/capabilities')).json()).binding);

const mediaHash = () => {
  const hash = createHash('sha256');
  return {
    rows({x,y,width,height,rgba}) {
      for(let row=0; row<height; row++) {
        if(y+row < 251 || y+row >= 379 || x > 592 || x+width < 784) continue;
        const start = (row*width + 592-x)*4;
        hash.update(rgba.subarray(start,start+192*4));
      }
    },
    digest: () => hash.digest('hex'),
  };
};
const startHttp = performance.now();
let chunks = 0;
const httpMedia = mediaHash();
const full = await readNativeFrame(fetch,origin,{packets:2,onRows:rows => {
  chunks++;
  httpMedia.rows(rows);
}});
assert.equal(full.width,800);
assert.equal(full.height,480);
assert.ok(chunks > 1);
const httpMs = Math.round(performance.now() - startHttp);

const startWs = performance.now();
const {headers,parts} = await new Promise((resolve,reject) => {
  const url = new URL('/api/view/ws',origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  const parts = [];
  let headers;
  function done(error) {
    clearTimeout(timer);
    socket.close();
    if(error) reject(error);
    else resolve({headers,parts});
  }
  const timer = setTimeout(() => done(Error('WS frame timeout')),20000);
  socket.addEventListener('open',() => socket.send('0'));
  socket.addEventListener('error',() => done(Error('WS transport error')));
  socket.addEventListener('message',({data}) => {
    if(data instanceof ArrayBuffer) parts.push(new Uint8Array(data));
    else if(data === 'end') done();
    else if(typeof data === 'string' && data.startsWith('begin,')) {
      const keys = ['Revision','Scene','X','Y','Width','Height','Crop-Width','Crop-Height','Raw-Bytes','Full'];
      const values = data.split(',').slice(1);
      headers = new Headers(keys.map((key,index) => ['X-Frame-'+key,values[index]]));
    } else done(Error('Unexpected WS frame message: '+data));
  });
});
assert.equal(parts[0]?.slice(0,4).toString(),'76,86,70,50');
const wire = new ReadableStream({
  start(controller) {
    for(const part of parts) controller.enqueue(part);
    controller.close();
  },
});
const wsMedia = mediaHash();
const ws = await readFramePackets(new Response(wire,{headers}),{onRows:wsMedia.rows});
assert.equal(ws.width,800);
assert.equal(ws.height,480);
const wsMs = Math.round(performance.now()-startWs);
const referenceGif = httpMedia.digest();
let gifAnimated = wsMedia.digest() !== referenceGif;
for(let attempt=0; !gifAnimated && attempt<2; attempt++) {
  await wait(130);
  const next = mediaHash();
  await readNativeFrame(fetch,origin,{packets:2,onRows:next.rows});
  gifAnimated = next.digest() !== referenceGif;
}
assert.ok(gifAnimated,'GIF region did not change');


const click = async (x,y) => {
  for(const pressed of [true,false]) {
    const reply = await (await read('/api/view/input',{method:'POST',
      headers:{'Content-Type':'application/cbor'},body:encode({x,y,pressed})})).json();
    assert.equal(reply.ok,true);
    await wait(90);
  }
};
await click(265,463);
await wait(400);
const current = await status();
assert.equal(current.display.views.find(view => view.node === 'content')?.selected,'alternate');
await mkdir(output,{recursive:true});
let photo;
for(let attempt=0; attempt<3; attempt++) {
  try {
    photo = await fetchFrameBmp(fetch,origin);
    break;
  } catch(error) {
    if(attempt === 2 || error.cause?.code !== 'UND_ERR_RES_CONTENT_LENGTH_MISMATCH') throw error;
    await wait(250);
  }
}
assert.deepEqual(inspectBmp(photo),{width:800,height:480});
await writeFile(new URL('screen.bmp',output),photo);
const canvasColor = async () => {
  let color;
  await readNativeFrame(fetch,origin,{packets:2,onRows:({x,y,width,height,rgba}) => {
    if(x > 590 || y > 410 || x+width <= 590 || y+height <= 410) return;
    const offset = ((410-y)*width+590-x)*4;
    color = rgba.slice(offset,offset+3).join(',');
  }});
  assert.ok(color);
  return color;
};
await click(590,463);
await wait(400);
const cream = await canvasColor();
await click(700,463);
await wait(400);
assert.notEqual(await canvasColor(),cream,'Dark scheme must update the canvas');
await click(590,463);
await wait(400);
assert.equal(await canvasColor(),cream,'Cream scheme must restore the canvas');
await click(78,463);
await wait(400);
assert.equal((await status()).display.views.find(view => view.node === 'content')?.selected,'dashboard');
const result = {width:800,height:480,httpMs,wsMs,httpParts:chunks,wsBytes:parts.reduce((sum,p)=>sum+p.length,0),
  editor:true,projectApi:true,pointer:true,scheme:true,gifAnimated};
await writeFile(new URL('web.json',output),JSON.stringify(result,null,2)+'\n');
console.log(result);
