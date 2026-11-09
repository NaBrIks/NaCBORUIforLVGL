// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
export function applicationMode({pathname,search='',profile}){
 if(pathname==='/viewer'||pathname==='/viewer/')return 'viewer';
 if(pathname==='/editor'||pathname==='/editor/')return 'editor';
 if(!['/','/index.html'].includes(pathname))return 'editor';
 const query=new URLSearchParams(search);
 if(query.get('mode')==='manual'||query.get('sim')==='1')return 'editor';
 if(profile===undefined)return 'loading';
 return profile==='graphics'?'viewer':'editor';
}
