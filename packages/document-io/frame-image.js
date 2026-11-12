// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {deflateSync} from 'node:zlib';

export const FRAME_IMAGE_LIMITS=Object.freeze({inputBytes:8*1024*1024+54,pixels:2*1024*1024,maxEdge:1024,pngBytes:1024*1024});
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable=Uint32Array.from({length:256},(_,value)=>{
 for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;
 return value>>>0;
});
function crc32(bytes){let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0;}
function chunk(type,data){
 const bytes=Buffer.allocUnsafe(data.length+12);bytes.writeUInt32BE(data.length,0);bytes.write(type,4,4,'ascii');data.copy(bytes,8);
 bytes.writeUInt32BE(crc32(bytes.subarray(4,8+data.length)),8+data.length);return bytes;
}

function rgb565(value){
 const r=(value>>>11)&31,g=(value>>>5)&63,b=value&31;
 return (((r<<3)|(r>>>2))<<16)|(((g<<2)|(g>>>4))<<8)|((b<<3)|(b>>>2));
}
const formats={
 rgb565_le:{bits:16,read:(p,row,x)=>{const at=row+x*2;return rgb565(p[at]|(p[at+1]<<8));}},
 rgb565_be:{bits:16,read:(p,row,x)=>{const at=row+x*2;return rgb565((p[at]<<8)|p[at+1]);}},
 mono1_msb:{bits:1,read:(p,row,x)=>((p[row+(x>>>3)]>>>(7-(x&7)))&1)?0xffffff:0},
 mono1_lsb:{bits:1,read:(p,row,x)=>((p[row+(x>>>3)]>>>(x&7))&1)?0xffffff:0},
 rgb888:{bits:24,read:(p,row,x)=>{const at=row+x*3;return (p[at]<<16)|(p[at+1]<<8)|p[at+2];}},
 bgr888:{bits:24,read:(p,row,x)=>{const at=row+x*3;return (p[at+2]<<16)|(p[at+1]<<8)|p[at];}},
 bgrx8888:{bits:32,read:(p,row,x)=>{const at=row+x*4;return (p[at+2]<<16)|(p[at+1]<<8)|p[at];}}
};
function rawFrame(frame){
 if(!frame||typeof frame!=='object'||Array.isArray(frame))throw Error('frame_raw_descriptor_required');
 const {width,height,stride,format,pixels}=frame;
 if(!(pixels instanceof Uint8Array))throw Error('frame_raw_bytes_required');
 if(pixels.byteLength>FRAME_IMAGE_LIMITS.inputBytes)throw Error('frame_raw_input_limit');
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>FRAME_IMAGE_LIMITS.pixels)throw Error('frame_raw_pixel_limit');
 if(typeof format!=='string'||!Object.hasOwn(formats,format))throw Error('frame_raw_format_unsupported');
 const {bits,read}=formats[format],packedBytes=Math.ceil(width*bits/8);
 if(!Number.isSafeInteger(stride)||stride<packedBytes||stride>FRAME_IMAGE_LIMITS.inputBytes)throw Error('frame_raw_stride_invalid');
 if(pixels.byteLength!==stride*height)throw Error('frame_raw_pixel_extent');
 return {originalWidth:width,originalHeight:height,stride,pixels,read};
}

// Host-only raw pixels: top-down rows, byte stride, explicit channel/bit order.
// RGB565 expands R5/G6/B5 by repeating high bits; mono bit 0=black, 1=white.
// No device wire header or endpoint is implied by this in-memory API.
export function encodeRawFrame(frame,{maxEdge=FRAME_IMAGE_LIMITS.maxEdge}={}){
 return encodePixels(rawFrame(frame),maxEdge);
}

// A deliberately narrow host encoder for native_view.cpp BITMAPINFOHEADER frames,
// with ordinary 24-bit/bottom-up BI_RGB accepted too. It never decodes other BMPs.
export function encodeFrameImage(input,{maxEdge=FRAME_IMAGE_LIMITS.maxEdge}={}){
 if(!(input instanceof Uint8Array))throw Error('frame_bmp_bytes_required');
 if(input.byteLength>FRAME_IMAGE_LIMITS.inputBytes)throw Error('frame_bmp_input_limit');
 if(input.byteLength<54)throw Error('frame_bmp_header_truncated');
 const bmp=Buffer.from(input.buffer,input.byteOffset,input.byteLength);
 if(bmp[0]!==66||bmp[1]!==77||bmp.readUInt32LE(14)!==40||bmp.readUInt32LE(6)!==0)throw Error('frame_bmp_header_invalid');
 if(bmp.readUInt32LE(2)!==bmp.length)throw Error('frame_bmp_file_size');
 const originalWidth=bmp.readInt32LE(18),signedHeight=bmp.readInt32LE(22),originalHeight=Math.abs(signedHeight);
 if(originalWidth<=0||!originalHeight||originalWidth*originalHeight>FRAME_IMAGE_LIMITS.pixels)throw Error('frame_bmp_pixel_limit');
 const bits=bmp.readUInt16LE(28);
 if(bmp.readUInt16LE(26)!==1||![24,32].includes(bits)||bmp.readUInt32LE(30)!==0)throw Error('frame_bmp_format_unsupported');
 const channels=bits/8,stride=Math.ceil(originalWidth*channels/4)*4,pixelBytes=stride*originalHeight,offset=bmp.readUInt32LE(10),imageBytes=bmp.readUInt32LE(34);
 if(offset<54||offset>bmp.length||pixelBytes!==bmp.length-offset||(imageBytes!==0&&imageBytes!==pixelBytes))throw Error('frame_bmp_pixel_extent');
 const frame=rawFrame({width:originalWidth,height:originalHeight,stride,format:bits===32?'bgrx8888':'bgr888',pixels:bmp.subarray(offset)});
 return encodePixels(frame,maxEdge,signedHeight>0);
}

// One bounded RGB scanline/PNG path for raw and BMP inputs. Read source pixels
// directly through their format reader; never allocate a full-frame RGB/XRGB copy.
function encodePixels({originalWidth,originalHeight,stride,pixels,read},maxEdge,bottomUp=false){
 if(!Number.isSafeInteger(maxEdge)||maxEdge<1||maxEdge>FRAME_IMAGE_LIMITS.maxEdge)throw Error('frame_image_edge_limit');
 const scale=Math.min(1,maxEdge/Math.max(originalWidth,originalHeight));
 const width=Math.max(1,Math.round(originalWidth*scale)),height=Math.max(1,Math.round(originalHeight*scale));
 const rowBytes=width*3+1,scanlines=Buffer.allocUnsafe(rowBytes*height);
 for(let y=0;y<height;y++){
  const sourceY=Math.min(originalHeight-1,Math.floor((y+.5)*originalHeight/height));
  const sourceRow=(bottomUp?originalHeight-1-sourceY:sourceY)*stride,targetRow=y*rowBytes;
  scanlines[targetRow]=0;
  for(let x=0;x<width;x++){
   const sourceX=Math.min(originalWidth-1,Math.floor((x+.5)*originalWidth/width)),color=read(pixels,sourceRow,sourceX),target=targetRow+1+x*3;
   scanlines[target]=color>>>16;scanlines[target+1]=color>>>8;scanlines[target+2]=color;
  }
 }

 let compressed;
 try{compressed=deflateSync(scanlines,{level:6,maxOutputLength:FRAME_IMAGE_LIMITS.pngBytes-57});}
 catch(error){if(error.code==='ERR_BUFFER_TOO_LARGE')throw Error('frame_png_size_limit');throw error;}
 const size=compressed.length+57;
 if(size>FRAME_IMAGE_LIMITS.pngBytes)throw Error('frame_png_size_limit');
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
 const bytes=Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',compressed),chunk('IEND',Buffer.alloc(0))],size);
 return {bytes,width,height,originalWidth,originalHeight,mimeType:'image/png'};
}
