// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {object as only,integerRange} from '@lvgl-cbor/style-codec/values';
import {bindingText,bindingCatalogIsAuthoritative} from './binding-schema.js';
import {compositionContract as C} from './composition-contract.js';

export function compositionLimits(capabilities){
 const value=capabilities?.composition;
 if(value!==undefined){only(value,['version',...Object.keys(C.limits)],'Composition capabilities');if(value.version!==C.version)throw Error('Composition version');for(const key of Object.keys(C.limits))if(value[key]!==undefined&&!integerRange(value[key],key==='inactiveCache'?0:1,C.limits[key]))throw Error('Composition limit '+key);}
 return {...C.limits,...Object.fromEntries(Object.keys(C.limits).filter(key=>value?.[key]!==undefined).map(key=>[key,value[key]]))};
}
export function compositionAvailable(capabilities){return !bindingCatalogIsAuthoritative(capabilities)||capabilities?.composition?.version===C.version;}
export function requireComposition(capabilities){compositionLimits(capabilities);if(!compositionAvailable(capabilities))throw Error('Device composition unavailable');}
export function screenViews(document){const out=[];function walk(node){if(node&&Object.hasOwn(node,'view')&&node.view!==undefined)out.push({node:node.id,...node.view});for(const child of node?.children??[])walk(child);}walk(document?.root);return out;}
export function validateView(view,capabilities){
 requireComposition(capabilities);only(view,['pages','initial','sizing'],'Node view');
 if(!Array.isArray(view.pages)||!view.pages.length||view.pages.length>128)throw Error('View pages limit');
 const names=new Set();const pages=view.pages.map(page=>{only(page,['screen','retention'],'View page');bindingText(page.screen,63,'View screen');if(names.has(page.screen))throw Error('Duplicate view page');names.add(page.screen);const retention=page.retention??'release';if(!C.retention.includes(retention))throw Error('View retention');return {screen:page.screen,retention};});
 bindingText(view.initial,63,'View initial');if(!names.has(view.initial))throw Error('View initial must be a declared page');
 const sizing=view.sizing??'fill';if(!C.sizing.includes(sizing))throw Error('View sizing');return {pages,initial:view.initial,sizing};
}
export function validateNavigation(navigate,capabilities){requireComposition(capabilities);only(navigate,['view','screen'],'Navigation target');bindingText(navigate.view,63,'Navigation view');bindingText(navigate.screen,63,'Navigation screen');return navigate;}
export function encodeViews(document,capabilities){
 const views=screenViews(document).map(({node,...view})=>({node,...validateView(view,capabilities)})),targets=new Map(views.map(view=>[view.node,view]));let navigation=false;
 function walk(node){let count=0;for(const rule of node.events??[])if(rule.navigate){if(++count>1)throw Error('Only one navigation rule per node');navigation=true;validateNavigation(rule.navigate,capabilities);const view=targets.get(rule.navigate.view);if(!view||!view.pages.some(page=>page.screen===rule.navigate.screen))throw Error('Navigation target is not a declared local view page');}for(const child of node.children??[])walk(child);}walk(document.root);
 return views.length||navigation?{views_version:C.version,views}:{};
}
const plain=value=>value instanceof Map?Object.fromEntries([...value].map(([key,item])=>[key,plain(item)])):Array.isArray(value)?value.map(plain):value;
export function decodeViews(data,document){
 const views=plain(data.views??[]);if(!Array.isArray(views))throw Error('Wire views array');const navigate=(plain(data.events??[])).some(rule=>rule.navigate!==undefined);
 if(views.length||navigate){if(data.views_version!==C.version)throw Error('Composition wire version');}else if(data.views_version!==undefined)throw Error('Empty composition version');
 const nodes=new Map();function walk(node){nodes.set(node.id,node);for(const child of node.children??[])walk(child);}walk(document.root);
 for(const view of views){only(view,['node','pages','initial','sizing'],'Wire view');const node=nodes.get(view.node);if(!node||node.view)throw Error('Unknown or duplicate view node');const {node:_,...value}=view;node.view=value;}return document;
}
