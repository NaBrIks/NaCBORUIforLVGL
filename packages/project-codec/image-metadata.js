// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Pure raster metadata checks shared by browser preparation and the host receiver.
export const assistantImageLimits=Object.freeze({count:4,inputBytes:8*1024*1024,inputPixels:32*1024*1024,dimension:1024,bytes:96*1024});
const mimeTypes=new Set(['image/png','image/jpeg','image/webp']);
const ascii=(bytes,offset,length)=>String.fromCharCode(...bytes.subarray(offset,offset+length));
const uint16=(bytes,offset)=>bytes[offset]*256+bytes[offset+1];
const uint24=(bytes,offset)=>bytes[offset]+bytes[offset+1]*256+bytes[offset+2]*65536;
export function imageDimensions(bytes,mime){
 if(!(bytes instanceof Uint8Array)||bytes.length<24||!mimeTypes.has(mime))throw Error('Use PNG, JPEG or WebP images');
 let width=0,height=0;
 if(mime==='image/png'&&ascii(bytes,0,8)==='\x89PNG\r\n\x1a\n'&&ascii(bytes,12,4)==='IHDR'){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);width=view.getUint32(16);height=view.getUint32(20);
 }else if(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216){
  let offset=2;
  while(offset+4<bytes.length){
   if(bytes[offset++]!==255)break;while(bytes[offset]===255)offset++;const marker=bytes[offset++];
   if(marker===217||marker===218)break;
   if(marker===216||marker>=208&&marker<=215)continue;
   const length=uint16(bytes,offset);if(length<2||offset+length>bytes.length)break;
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=8){height=uint16(bytes,offset+3);width=uint16(bytes,offset+5);break;}
   offset+=length;
  }
 }else if(mime==='image/webp'&&ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,4)==='WEBP'){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=12;
  while(offset+8<=bytes.length){
   const kind=ascii(bytes,offset,4),length=view.getUint32(offset+4,true),start=offset+8;if(start+length>bytes.length)break;
   if(kind==='VP8X'&&length>=10){width=uint24(bytes,start+4)+1;height=uint24(bytes,start+7)+1;break;}
   if(kind==='VP8L'&&length>=5&&bytes[start]===47){width=(bytes[start+1]|(bytes[start+2]&63)<<8)+1;height=((bytes[start+2]>>6)|bytes[start+3]<<2|(bytes[start+4]&15)<<10)+1;break;}
   if(kind==='VP8 '&&length>=10&&ascii(bytes,start+3,3)==='\x9d\x01\x2a'){width=view.getUint16(start+6,true)&16383;height=view.getUint16(start+8,true)&16383;break;}
   offset=start+length+(length&1);
  }
 }
 if(!width||!height)throw Error('Invalid image header');
 if(width*height>assistantImageLimits.inputPixels||width>16384||height>16384)throw Error('Image resolution is too large');
 return {width,height};
}
export function imageSize(width,height,dimension=assistantImageLimits.dimension){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||!Number.isSafeInteger(dimension)||dimension<=0)throw Error('Invalid image dimensions');
 const scale=Math.min(1,dimension/Math.max(width,height));return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
export function validateImageFiles(files,currentCount=0){
 const items=Array.from(files);if(!Number.isInteger(currentCount)||currentCount<0||items.length+currentCount>assistantImageLimits.count)throw Error('At most 4 images');
 for(const file of items){if(!mimeTypes.has(file.type))throw Error('Use PNG, JPEG or WebP images');if(!Number.isSafeInteger(file.size)||file.size<=0||file.size>assistantImageLimits.inputBytes)throw Error('Image file limit is 8 MiB');}
 return items;
}
