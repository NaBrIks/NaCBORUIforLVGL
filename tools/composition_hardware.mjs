// Explicit, non-persistent acceptance of the S3 composition example. Real data;
// diagnostic clicked events exercise LVGL callbacks, not physical touch input.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {encode} from 'cborg';
import {ProjectClient} from '../packages/project-codec/client.js';
const [origin,file]=process.argv.slice(2);
if(!origin||!file)throw Error('Usage: node tools/composition_hardware.mjs http://DEVICE shell-project.json');
const project=JSON.parse(await readFile(file,'utf8')),client=new ProjectClient(origin);
const json=async path=>{const response=await fetch(origin+path,{signal:AbortSignal.timeout(10000),cache:'no-store'});assert.equal(response.status,200,path);return response.json();};
const value=(data,name)=>{const source=data.sources.find(source=>source.name===name);assert.equal(source?.state,'known',name);return source.value;};
async function until(read,predicate,label,timeout=15000){
 const end=Date.now()+timeout;let result;
 do{result=await read();if(predicate(result))return result;await delay(250);}while(Date.now()<end);
 throw Error(label+': '+JSON.stringify(result));
}
async function command(body){
 const response=await fetch(origin+'/api/data',{method:'POST',headers:{'Content-Type':'application/cbor'},body:encode(body),signal:AbortSignal.timeout(10000)});
 assert.equal(response.status,202);const {id}=await response.json();
 const data=await until(()=>json('/api/data'),data=>data.commands.some(command=>command.id===id),'command receipt');
 const result=data.commands.find(command=>command.id===id);assert.equal(result.ok,true,JSON.stringify(result));return result;
}
const checks=[],before=await json('/api/info'),capabilities=await json('/api/capabilities'),stored=await client.info(),initialData=await json('/api/data');
const report={origin,checkedAt:new Date().toISOString(),before,stored,checks,physicalTouchTested:false};
const slot=status=>status.display.views.find(view=>view.instance===status.display.instance&&view.node==='content');
async function navigate(index,screen){
 await command({kind:'event',node:'nav-'+index,event:'clicked'});
 const status=await until(()=>client.info(),status=>slot(status)?.selected===screen,'navigation '+screen);
 assert.equal(slot(status).error,'');assert.ok(slot(status).pageInstance>0);return slot(status).pageInstance;
}
try{
 assert.equal(capabilities.composition.version,1);report.capabilities=capabilities.composition;
 await client.preview(project,'shell',{capabilities});
 const initial=await client.info();assert.equal(initial.display.screen,'shell');assert.equal(slot(initial).selected,'dashboard');assert.equal(slot(initial).error,'');
 const dashboard=slot(initial).pageInstance,radar=await navigate(1,'radar'),trip=await navigate(2,'trip');
 assert.equal(await navigate(0,'dashboard'),dashboard);
 assert.notEqual(await navigate(2,'trip'),trip);
 assert.equal(await navigate(1,'radar'),radar);
 checks.push('nested local navigation; retain/cache reuse; release recreates');
 report.instances={dashboard,radar,trip};
 // Allowed transition graph may contain a cycle; active tree must reject it.
 const failing=structuredClone(project),root=failing.screens.shell.root,content=root.children.find(node=>node.id==='content');
 content.view.pages.push({screen:'shell',retention:'release'});
 root.children.find(node=>node.id==='navigation').children[1].events=[{event:'clicked',navigate:{view:'content',screen:'shell'}}];
 await client.preview(failing,'shell',{capabilities});await command({kind:'event',node:'nav-1',event:'clicked'});
 const failed=await until(()=>client.info(),status=>slot(status)?.error==='composition_cycle','error placeholder');
 assert.equal(slot(failed).selected,'shell');assert.equal(slot(failed).pageInstance,0);report.failed=failed.display;
 checks.push('cycle transition keeps selection and reports empty child/error placeholder');
 await client.preview(project,'shell',{capabilities});
 const finalData=await json('/api/data'),after=await json('/api/info'),status=await client.info();
 assert.equal(finalData.diagnostics.bindingErrors,initialData.diagnostics.bindingErrors);assert.equal(after.boot_id,before.boot_id);assert.equal(status.project.revision,stored.project.revision);
 assert.notEqual(status.display.instance,initial.display.instance);report.after=after;report.final=status;report.diagnostics=finalData.diagnostics;
 checks.push('full preview resets instances; no new binding errors/reboot/persistent write');
 const readSystem=async()=>{const data=await json('/api/data');report.system={clock:value(data,'system.clock'),network:value(data,'system.network')};return report.system;};
 const {clock,network}=await until(readSystem,system=>Number.isInteger(system.clock.unixSeconds),'confirmed NTP time',45000);
 assert.equal(network.connected,true);assert.equal(network.ip,new URL(origin).hostname);assert.equal(clock.timezone,'YEKT-5');
 assert.ok(Math.abs(clock.unixSeconds-Date.now()/1000)<10);await delay(1500);const advanced=value(await json('/api/data'),'system.clock');assert.ok(advanced.unixSeconds>clock.unixSeconds);
 report.system={clock,advanced,network};checks.push('real SNTP time, advancing seconds, timezone and IP sources');
}catch(error){report.error=String(error);throw error;}
finally{await writeFile(new URL('../local/composition-hardware.json',import.meta.url),JSON.stringify(report,null,2));}
console.log(JSON.stringify({checks:checks.length,boot:report.after.boot_id,system:report.system,diagnostics:report.diagnostics}));
