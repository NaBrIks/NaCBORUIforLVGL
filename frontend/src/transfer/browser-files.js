// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
export function downloadBytes(bytes,filename,mime){
 const url=URL.createObjectURL(new Blob([bytes],{type:mime})),link=document.createElement('a');
 link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function readBoundedFile(file,maxBytes){
 if(!file||file.size<1||file.size>maxBytes)throw Error('Размер файла: 1..'+maxBytes+' байт');
 const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length!==file.size)throw Error('Неполный файл');return bytes;
}
