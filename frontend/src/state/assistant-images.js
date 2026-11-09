// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Browser-only image preparation; attachments never enter project/configuration data.
import {assistantImageLimits,imageDimensions,imageSize,validateImageFiles} from '../../../packages/project-codec/image-metadata.js';
export {assistantImageLimits,imageDimensions,imageSize,validateImageFiles};
const canvasBlob=(canvas,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Image encoding failed')),'image/jpeg',quality));
function dataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Image read failed'));reader.readAsDataURL(blob);});}
export async function prepareAssistantImage(file,{decode=globalThis.createImageBitmap,canvas=()=>document.createElement('canvas')}={}){
 validateImageFiles([file]);const header=new Uint8Array(await file.arrayBuffer());imageDimensions(header,file.type);
 const image=await decode(file);let output;
 try{
  if(image.width*image.height>assistantImageLimits.inputPixels)throw Error('Image resolution is too large');
  let size=imageSize(image.width,image.height);const target=canvas(),context=target.getContext('2d');if(!context)throw Error('Image canvas unavailable');
  for(let attempt=0;attempt<5;attempt++){
   target.width=size.width;target.height=size.height;context.fillStyle='#ffffff';context.fillRect(0,0,size.width,size.height);context.drawImage(image,0,0,size.width,size.height);
   output=await canvasBlob(target,attempt===0?.88:.75);
   if(output.size<=assistantImageLimits.bytes)return {name:String(file.name||'clipboard').slice(0,128),mime:output.type,width:size.width,height:size.height,bytes:output.size,dataUrl:await dataUrl(output)};
   size=imageSize(size.width,size.height,Math.max(1,Math.floor(Math.max(size.width,size.height)*.75)));
  }
  throw Error('Image is too large after resizing');
 }finally{image.close?.();}
}
export async function uploadAssistantImages(client,images,capabilities,{active=()=>{},progress=()=>{},id=crypto.randomUUID()}={}){
 if(!Array.isArray(images)||images.length>assistantImageLimits.count)throw Error('At most 4 images');
 const prepared=images.map((image,index)=>{
  const prefix='data:'+image.mime+';base64,';
  if(!['image/jpeg','application/json'].includes(image.mime)||typeof image.dataUrl!=='string'||!image.dataUrl.startsWith(prefix))throw Error('Invalid prepared image');
  const data=image.dataUrl.slice(prefix.length);if(!data.length||data.length>131072||data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw Error('Invalid prepared image size');
  let name='';for(const point of String(image.name||'image')){if(new TextEncoder().encode(name+point).length>128)break;name+=point;}
  return {id:id+'-'+index,name,mime:image.mime,data};
 });
 const invoke=async(name,args)=>{active();const result=await client.invoke(name,args,capabilities);active();if(result.state!=='completed')throw Error('Image command completion unconfirmed; do not resend automatically');};
 await invoke('assistant.images_clear',true);
 for(let index=0;index<prepared.length;index++){
  const image=prepared[index];progress(index+1,prepared.length);
  await invoke('assistant.image_begin',{id:image.id,name:image.name,mime:image.mime,size:image.data.length});
  for(let offset=0;offset<image.data.length;offset+=2048)await invoke('assistant.image_chunk',{id:image.id,offset,data:image.data.slice(offset,offset+2048)});
  await invoke('assistant.image_commit',{id:image.id});
 }
}

export function validateAssistantFiles(files,currentCount=0){const items=Array.from(files);if(items.length+currentCount>assistantImageLimits.count)throw Error('At most 4 attachments');for(const file of items){if(file.type==='application/json'||/\.json$/i.test(file.name||'')){if(!file.size||file.size>1024*1024)throw Error('JSON input file limit is 1 MiB');}else validateImageFiles([file]);}return items;}
export async function prepareAssistantAttachment(file){if(file.type!=='application/json'&&!/\.json$/i.test(file.name||''))return prepareAssistantImage(file);validateAssistantFiles([file]);const value=JSON.parse(await file.text());if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Attach a JSON screen/style/project object');const blob=new Blob([JSON.stringify(value)],{type:'application/json'});if(blob.size>65536)throw Error('JSON document exceeds 64 KiB after whitespace removal');return {name:String(file.name||'document.json').slice(0,128),mime:'application/json',bytes:blob.size,dataUrl:await dataUrl(blob)};}
