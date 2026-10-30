// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const origin=process.argv[2];if(!origin)throw Error('Usage: node tools/check_embedded_assets.mjs http://DEVICE');
const base=new URL('../',import.meta.url),manifest=JSON.parse(await readFile(new URL('examples/s3_style_lab/main/assets.manifest.generated.json',base),'utf8'));
const info=await (await fetch(origin+'/api/info',{signal:AbortSignal.timeout(5000)})).json();assert.equal(info.embedded_editor,true);
const files=[];
for(const file of manifest.files){const path=file.path==='/'?'index.html':file.path.slice(1),expected=await readFile(new URL('frontend/dist/'+path,base)),response=await fetch(origin+file.path,{signal:AbortSignal.timeout(10000)});assert.equal(response.status,200,file.path);const bytes=new Uint8Array(await response.arrayBuffer());assert.deepEqual(bytes,new Uint8Array(expected),file.path);files.push({...file,sha256:createHash('sha256').update(bytes).digest('hex')});}
const report={origin,boot_id:info.boot_id,files,rawBytes:manifest.rawBytes,flashBytes:manifest.flashBytes};await writeFile(new URL('local/modules-device-assets.json',base),JSON.stringify(report,null,2));console.log(JSON.stringify({files:files.length,rawBytes:manifest.rawBytes,flashBytes:manifest.flashBytes,matched:true}));
