// Explicit hardware acceptance. Run prepare, reset the board, then verify.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {ProjectClient} from '../packages/project-codec/client.js';
import {encodeProject} from '../packages/project-codec/index.js';
import {fingerprint} from '../packages/project-codec/catalog.js';
import {createBlankScreen,createNode} from '../frontend/src/screen-model.js';
const [origin,phase]=process.argv.slice(2);if(!origin||!['prepare','verify'].includes(phase))throw Error('Usage: project_persistence.mjs http://DEVICE prepare|verify');
const fetcher=async(url,options={})=>{const start=Date.now();if(process.env.PROJECT_TRACE)console.log('request',new URL(url).search);try{const response=await fetch(url,{...options,signal:options.signal??AbortSignal.timeout(15000)});if(process.env.PROJECT_TRACE)console.log('response',response.status,Date.now()-start);return response;}catch(error){if(process.env.PROJECT_TRACE)console.log('failed',Date.now()-start);throw error;}},client=new ProjectClient(origin,{fetcher});
const caps=await(await fetcher(origin+'/api/capabilities')).json(),info=await(await fetcher(origin+'/api/info')).json(),current=await client.read(caps),status=await client.info();
assert.equal(status.storage.persistent,true);const path=new URL('../local/project-persistence.json',import.meta.url);
if(phase==='prepare'){
 assert.ok(!current.project.screens.storage_probe&&!current.project.styles.storage_probe);
 const project=structuredClone(current.project),screen=createBlankScreen('storage_probe','Persistence verification'),label=createNode('label','probe');
 label.props.text='Saved before restart';label.styles=[{ref:'global:storage_probe'}];screen.root.children.push(label);
 project.screens.storage_probe=screen;project.styles.storage_probe={scope:'global',name:'storage_probe',attach:false,props:{text_color:'#22cc88'}};
 const expected=fingerprint(encodeProject(project,caps)),test={origin,before:current,boot:info.boot_id,expected,hash:expected};
 await writeFile(path,JSON.stringify(test,null,2));
 const start=Date.now();
 try {const saved=await client.save(project,{capabilities:caps,revision:current.revision});assert.equal(saved.revision,expected);}
 catch(error){if((await client.info()).project.revision!==expected)throw error;test.prepareResponseLost=true;}
 test.saveMs=Date.now()-start;await writeFile(path,JSON.stringify(test,null,2));
 console.log(JSON.stringify({saved:expected,boot:info.boot_id,saveMs:test.saveMs,next:'reset board, then verify'}));
}else{
 const test=JSON.parse(await readFile(path,'utf8'));assert.equal(test.origin,origin);assert.notEqual(info.boot_id,test.boot);assert.equal(current.revision,test.expected);
 assert.equal(fingerprint(encodeProject(current.project,caps)),test.hash);assert.ok(current.project.screens.storage_probe&&current.project.styles.storage_probe);
 const screen=status.catalog.documents.find(d=>d.kind==='screens'&&d.name==='storage_probe'),style=status.catalog.documents.find(d=>d.kind==='styles'&&d.name==='storage_probe');
 assert.equal(screen.origin,'changes');assert.equal(style.origin,'changes');assert.ok(screen.location.endsWith('.cbor'));assert.ok(style.location.endsWith('.cbor'));
 await client.show('storage_probe');await client.save(test.before.project,{capabilities:caps,revision:current.revision});await client.show(test.before.project.manifest.entry);
 test.result={boot:info.boot_id,revision:current.revision,screen,style,restored:(await client.info()).project.revision};await writeFile(path,JSON.stringify(test,null,2));console.log(JSON.stringify(test.result));
}
