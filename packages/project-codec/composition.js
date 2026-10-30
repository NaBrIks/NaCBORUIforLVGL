// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {screenViews,compositionLimits,validateView} from '@lvgl-cbor/screen-codec';

export function projectCompositionGraph(project){
 const nodes=Object.entries(project.screens??{}).map(([id,screen])=>({id,name:screen.name??id,entry:id===project.manifest?.entry})),edges=[];
 for(const [id,screen] of Object.entries(project.screens??{}))for(const view of screenViews(screen))for(const page of view.pages??[])edges.push({from:id,to:page.screen,view:view.node,retention:page.retention??'release',initial:page.screen===view.initial});
 return {nodes,edges};
}
export function validateProjectComposition(project,capabilities){
 const graph=projectCompositionGraph(project);if(!graph.edges.length)return graph;
 const limits=compositionLimits(capabilities),initials=new Map(),computed=new Map(),visiting=new Set();
 for(const [id,screen] of Object.entries(project.screens)){
  const targets=[];for(const {node:_,...view} of screenViews(screen)){const value=validateView(view,capabilities);for(const page of value.pages)if(!Object.hasOwn(project.screens,page.screen))throw Error('Unknown view screen '+page.screen);targets.push(value.initial);}initials.set(id,targets);
 }
 function inspect(id){
  if(visiting.has(id))throw Error('Recursive initial views: '+[...visiting,id].join(' → '));if(computed.has(id))return computed.get(id);
  visiting.add(id);let depth=1,instances=1;
  for(const child of initials.get(id)??[]){const value=inspect(child);depth=Math.max(depth,value.depth+1);instances+=value.instances;}
  visiting.delete(id);if(depth>limits.maxDepth||instances>limits.maxInstances)throw Error('Composition initial depth/instance limit');const result={depth,instances};computed.set(id,result);return result;
 }
 for(const node of graph.nodes)inspect(node.id);return graph;
}
