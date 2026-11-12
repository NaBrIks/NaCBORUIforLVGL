// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Composition of the existing direct HTTP clients for native acceptance scripts.
import {ProjectClient} from '../../packages/project-codec/client.js';
import {DataClient} from '../../packages/project-codec/data-client.js';
import {encodeProject} from '../../packages/project-codec/index.js';
export async function connectNativeApi(origin){
 const response=await fetch(new URL('/api/capabilities',origin));if(!response.ok)throw Error('Capabilities HTTP '+response.status);
 const capabilities=await response.json(),project=new ProjectClient(origin),data=new DataClient(origin);
 return {
  capabilities,project,data,
  read:()=>project.read(capabilities),status:()=>project.info(),
  preview:({project:document,screen})=>project.preview(document,screen,{capabilities}),
  save:({project:document,revision})=>project.save(document,{revision,capabilities}),
  show:({screen})=>project.show(screen),reset:options=>project.reset(options),refresh:()=>project.refresh(),
  catalog:(options={})=>data.query({kind:'groups',...options}),
  values:(options={})=>data.query({kind:'values',...options}),
  invoke:({name,args})=>data.invoke(name,args,capabilities),
  write:({source,path=[],value})=>data.write(source,path,value,capabilities),
  event:({node,event,instance})=>data.event(node,event,instance,capabilities),
  validate:({document})=>{encodeProject(document,capabilities);return {valid:true};}
 };
}
