// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {projectCompositionGraph} from '../../../../packages/project-codec/index.js';
import {compositionLimits} from '@lvgl-cbor/screen-codec';
import {clone,findNode,createBlankScreen} from '../../screen-model.js';

// These paths are preview choices, not new page kinds or persisted project metadata.
export function pagePreviewTargets(project,screenId,capabilities){
 const graph=projectCompositionGraph(project),entry=project.manifest.entry,paths=[];
 const limits=compositionLimits(capabilities);
 function visit(id,path,seen){
  if(paths.length>=32||path.length>=limits.maxDepth||seen.has(id))return;
  if(id===screenId){if(path.length)paths.push(path);return;}
  const next=new Set([...seen,id]);for(const edge of graph.edges.filter(edge=>edge.from===id))visit(edge.to,[...path,{from:edge.from,view:edge.view,to:edge.to}],next);
 }
 visit(entry,[],new Set());
 // Unmounted reusable pages can still be inspected in their declared direct host.
 if(screenId!==entry&&!paths.length)for(const edge of graph.edges.filter(edge=>edge.to===screenId&&edge.from!==screenId).slice(0,32))paths.push([{from:edge.from,view:edge.view,to:edge.to}]);
 return [{key:'standalone',label:'Отдельно',path:[]},...paths.map(path=>({key:JSON.stringify(path),label:'В контейнере: '+path.map(edge=>(project.screens[edge.from]?.name??edge.from)+' / '+edge.view).join(' → '),path}))];
}

export function buildPagePreview(project,screenId,target,display){
 const copy=clone(project),path=target?.path??[];
 if(!copy.screens[screenId])throw Error('Страница не найдена: '+screenId);
 for(const edge of path){const host=findNode(copy.screens[edge.from],edge.view);if(!host?.view?.pages.some(page=>page.screen===edge.to))throw Error('Место вставки страницы изменено');host.view.initial=edge.to;}
 let root=path[0]?.from??screenId;
 // The physical LCD needs a full-size root; preserve the page design size inside it.
 if(display&&(copy.screens[root].size.width!==display.width||copy.screens[root].size.height!==display.height)){
  let id='__page_preview__';while(copy.screens[id])id+='_';
  const frame=createBlankScreen(id,'Page preview');frame.theme='none';frame.size={...display};frame.root.style={pad_all:0,border_width:0,radius:0,bg_opa:255,bg_color:'#101e28'};
  frame.root.flags={SCROLLABLE:true};frame.root.view={pages:[{screen:root,retention:'release'}],initial:root,sizing:'design'};copy.screens[id]=frame;root=id;
 }
 return {project:copy,screen:root,path:path.map(edge=>edge.view)};
}
