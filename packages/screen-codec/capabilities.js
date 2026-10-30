// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {contract,checkStyleCapabilities} from '@lvgl-cbor/style-codec';
import {screenContract} from './contract.js';
import {widgetCatalog} from './widget-catalog.js';
import {bindingContract} from './binding-contract.js';
import {compositionContract} from './composition-contract.js';
export function offlineCapabilities(){
  return {format:'lvgl-cbor-capabilities-1',source:'offline',style:contract,screen:screenContract,composition:{version:compositionContract.version,...compositionContract.limits},binding:{version:bindingContract.version,sources:[],actions:[],events:bindingContract.events,limits:bindingContract.limits},availableWidgets:screenContract.widgets.map(w=>w.id),layouts:[0,1,2],resources:[],limits:{stylePacketBytes:contract.maxPacketBytes,screenPacketBytes:screenContract.limits.packetBytes,...screenContract.limits},roundtrip:'canonical-v1'};
}
export function checkScreenCapabilities(document,capabilities){
 if(!capabilities)return;
 if(capabilities.format!=='lvgl-cbor-capabilities-1'||capabilities.screen?.sha256!==screenContract.sha256||capabilities.style?.sha256!==contract.sha256)throw Error('Device screen contract mismatch');
 const available=new Set(capabilities.availableWidgets),widgets=widgetCatalog(capabilities);
 let nodes=0;const walk=(node,depth)=>{
  const widget=widgets.find(w=>w.name===node.type);
  if(!widget||!available.has(widget.id))throw Error('Device widget unavailable: '+node.type);
  nodes+=1+(node.type==='button'&&node.props?.text!==undefined?1:0);
  if(nodes>capabilities.limits.nodes||depth>capabilities.limits.depth||(node.type==='button'&&node.props?.text!==undefined&&depth+1>capabilities.limits.depth))throw Error('Device node/depth limit');
  checkStyleCapabilities(node.style,capabilities);for(const rule of node.styleRules??[])checkStyleCapabilities(rule.props,capabilities);
  if(node.props?.src&&!capabilities.resources.some(r=>r.name===node.props.src&&r.type==='const void *'))throw Error('Device image resource unavailable: '+node.props.src);
  for(const child of node.children??[])walk(child,depth+1);
 };
 for(const definition of Object.values(document.styles??{}))checkStyleCapabilities(definition.props,capabilities);
 walk(document.root,1);
}
