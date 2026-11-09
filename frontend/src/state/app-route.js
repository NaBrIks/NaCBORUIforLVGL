// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
const editorPaths=new Set(['/','/index.html','/editor','/editor/']);
export function applicationMode({pathname,search='',profile}){
 if(pathname==='/viewer'||pathname==='/viewer/')return 'viewer';
 if(!editorPaths.has(pathname))return 'editor';
 const query=new URLSearchParams(search);
 if(query.get('mode')==='manual'||query.get('sim')==='1')return 'editor';
 if(profile===undefined)return 'loading';
 return profile==='graphics'?'studio':'editor';
}
