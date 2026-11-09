// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Selection of authored project documents; validation stays in the shared codecs.
export function projectDocumentTarget(project,kind,name,node){
 if(!['screens','styles'].includes(kind))throw Error('Project kind');
 if(node!==undefined&&kind!=='screens')throw Error('Node selector requires a screen');
 if(!Object.hasOwn(project[kind],name))throw Error('Project document not found');
 const screen=project[kind][name];
 if(node===undefined)return {container:project[kind],key:name,document:screen};
 const walk=(container,key)=>{const value=container[key];if(value.id===node)return {container,key,document:value};for(let i=0;i<(value.children??[]).length;i++){const found=walk(value.children,i);if(found)return found;}};
 const found=walk(screen,'root');if(!found)throw Error('Project node not found: '+node);return found;
}
export function projectDocumentOutline(screen,node){
 const outline=value=>({id:value.id,type:value.type,children:(value.children??[]).map(outline)});
 return {id:screen.id,name:screen.name,size:screen.size,styleNames:Object.keys(screen.styles??{}),root:outline(node??screen.root)};
}
