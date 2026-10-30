// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {build} from 'vite';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url),reports=[];
const oldFiles=process.env.VITE_LVGL_CBOR_FILES,oldCss=process.env.VITE_LVGL_CBOR_CSS;
try{
 for(const [name,files,css] of [['files-only',true,false],['css-only',false,true],['minimal',false,false]]){
  process.env.VITE_LVGL_CBOR_FILES=String(files);process.env.VITE_LVGL_CBOR_CSS=String(css);
  const outDir=fileURLToPath(new URL('local/editor-'+name,base));
  await build({root:fileURLToPath(new URL('frontend',base)),configFile:fileURLToPath(new URL('frontend/vite.config.js',base)),logLevel:'silent',build:{outDir,emptyOutDir:true}});
  const entries=await readdir(outDir+'/assets');assert.equal(entries.some(f=>f.startsWith('DocumentFiles-')),files,name);assert.equal(entries.some(f=>f.startsWith('CssTransfer-')),css,name);
  assert.equal(entries.some(f=>f.startsWith('DocumentFiles-')&&f.endsWith('.css')),files,name+' file CSS');assert.equal(entries.some(f=>f.startsWith('CssTransfer-')&&f.endsWith('.css')),css,name+' import CSS');
  let flashBytes=gzipSync(await readFile(outDir+'/index.html')).length;
  for(const file of entries)flashBytes+=gzipSync(await readFile(outDir+'/assets/'+file)).length;
  reports.push({name,files,css,assets:entries,flashBytes});
 }
}finally{for(const [key,value] of [['VITE_LVGL_CBOR_FILES',oldFiles],['VITE_LVGL_CBOR_CSS',oldCss]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
await writeFile(new URL('local/modules-optional-builds.json',base),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
