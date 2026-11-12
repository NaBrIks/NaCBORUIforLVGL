// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {frameAwait, frameLimits, frameRevision, inspectBmpHeader, openFrameResponse} from './native-frame.js';

function frameExtent(headers, bmp, since) {
 const revisionHeader = headers.get('X-Frame-Revision');
 const revision = revisionHeader === null ? null : frameRevision(revisionHeader);
 const values = ['X-Frame-X', 'X-Frame-Y', 'X-Frame-Width', 'X-Frame-Height'].map(name => headers.get(name));
 if (revision === null && values.every(value => value === null)) {
  return {revision, width: bmp.width, height: bmp.height, x: 0, y: 0, cropWidth: bmp.width, cropHeight: bmp.height, full: true};
 }
 if (revision === null || values.some(value => !/^\d{1,4}$/.test(value ?? ''))) throw Error('frame_extent');
 const [x, y, width, height] = values.map(Number);
 const full = x === 0 && y === 0 && bmp.width === width && bmp.height === height;
 if (!width || !height || width > 8192 || height > 8192 || width * height > frameLimits.pixels || x + bmp.width > width || y + bmp.height > height || (!full && since == null)) throw Error('frame_extent');
 return {revision, width, height, x, y, cropWidth: bmp.width, cropHeight: bmp.height, full};
}

function decodeRow(row, rgba, bits, width) {
 for (let x = 0; x < width; x++) {
  const out = x * 4;
  if (bits === 16) {
   const pixel = row[x * 2] | row[x * 2 + 1] << 8;
   const r = pixel >>> 11, g = pixel >>> 5 & 63, b = pixel & 31;
   rgba[out] = r << 3 | r >>> 2;
   rgba[out + 1] = g << 2 | g >>> 4;
   rgba[out + 2] = b << 3 | b >>> 2;
  } else {
   rgba[out] = row[out + 2];
   rgba[out + 1] = row[out + 1];
   rgba[out + 2] = row[out];
  }
  rgba[out + 3] = 255;
 }
}

// Only a BMP header, one partial row and a batch of decoded rows are retained.
// Each emitted batch is top-down RGBA in absolute native display coordinates.
export async function readNativeFrame(fetcher, origin, {
 since, packets = false, signal = AbortSignal.timeout(15000), delay, onHeader, onRows, onProgress
} = {}) {
 const response = await openFrameResponse(fetcher, origin, {since, packets, signal, delay, stream: true});
 if (response.status === 204) {
  if (since == null) throw Error('frame_unexpected_unchanged');
  return {unchanged: true, revision: frameRevision(response.headers.get('X-Frame-Revision') ?? since)};
 }
 if (response.headers.get('Content-Type')?.split(';')[0].trim() === 'application/x-lvgl-frame') {
  return readFramePackets(response, {since, signal, onHeader, onRows, onProgress});
 }
 const reader = response.body?.getReader();
 if (!reader) throw Error('frame_body_missing');
 const header = new Uint8Array(66);
 let headerSize = 54, position = 0, received = 0;
 let bmp, meta, row, rowBytes = 0, rows = 0;
 let batch = [], batchStart = 0;
 const emit = () => {
  if (!batch.length) return;
  const rgba = new Uint8ClampedArray(batch.length * bmp.width * 4);
  for (let i = 0; i < batch.length; i++) rgba.set(batch[i], (bmp.topDown ? i : batch.length - i - 1) * bmp.width * 4);
  const localY = bmp.topDown ? batchStart : bmp.height - batchStart - batch.length;
  onRows?.({x: meta.x, y: meta.y + localY, width: bmp.width, height: batch.length, rgba});
  batch = [];
 };
 try {
  for (;;) {
   signal.throwIfAborted();
   const {value, done} = await frameAwait(reader.read(), signal);
   if (done) break;
   received += value.byteLength;
   if (received > frameLimits.inputBytes || (bmp && received > bmp.fileBytes)) throw Error('frame_input_size_limit');
   let index = 0;
   while (index < value.byteLength) {
    if (!bmp) {
     const count = Math.min(headerSize - position, value.byteLength - index);
     header.set(value.subarray(index, index + count), position);
     position += count;
     index += count;
     if (position !== headerSize) continue;
     if (headerSize === 54 && header[28] === 16 && header[29] === 0) {
      headerSize = 66;
      continue;
     }
     bmp = inspectBmpHeader(header.subarray(0, headerSize));
     const declaredLength = response.headers.get('Content-Length');
     if (received > bmp.fileBytes || (declaredLength !== null && Number(declaredLength) !== bmp.fileBytes)) throw Error('frame_body_length');
     meta = frameExtent(response.headers, bmp, since);
     row = new Uint8Array(bmp.stride);
     onHeader?.(meta);
     continue;
    }
    if (position < bmp.offset) {
     const count = Math.min(bmp.offset - position, value.byteLength - index);
     position += count;
     index += count;
     continue;
    }
    if (rows === bmp.height) {
     position += value.byteLength - index;
     break;
    }
    const count = Math.min(row.length - rowBytes, value.byteLength - index);
    row.set(value.subarray(index, index + count), rowBytes);
    rowBytes += count;
    position += count;
    index += count;
    if (rowBytes === row.length) {
     if (!batch.length) batchStart = rows;
     const rgba = new Uint8ClampedArray(bmp.width * 4);
     decodeRow(row, rgba, bmp.bits, bmp.width);
     batch.push(rgba);
     rowBytes = 0;
     rows++;
     if (batch.length === 16) emit();
    }
   }
   emit();
   if (bmp) onProgress?.({received, total: bmp.fileBytes});
  }
  signal.throwIfAborted();
  if (!bmp || received !== bmp.fileBytes || rows !== bmp.height) throw Error('frame_body_length');
  return {...meta, unchanged: false};
 } catch (error) {
  void reader.cancel().catch(() => {});
  throw error;
 } finally {
  reader.releaseLock();
 }
}

const packetHeaderBytes = 32;
const packetPayloadLimit = 4096;
function packetHeader(bytes) {
 const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
 if (view.getUint32(0, true) !== 0x3146564c && view.getUint32(0, true) !== 0x3246564c) throw Error('frame_packet_magic');
 const packet = {
  version: view.getUint8(3) - 48, payloadBytes: view.getUint32(4, true), revision: view.getUint32(8, true), scene: view.getUint32(12, true),
  x: view.getUint16(16, true), y: view.getUint16(18, true), width: view.getUint16(20, true), height: view.getUint16(22, true),
  canvasWidth: view.getUint16(24, true), canvasHeight: view.getUint16(26, true),
  format: view.getUint16(28, true), flags: view.getUint16(30, true)
 };
 const decodedBytes = packet.width * packet.height * 2;
 const rle = Boolean(packet.flags & 2);
 if (packet.format !== 1 || packet.flags > (packet.version === 2 ? 3 : 1) || !packet.width || !packet.height ||
     decodedBytes > packetPayloadLimit ||
     !packet.canvasWidth || !packet.canvasHeight || packet.canvasWidth > 8192 || packet.canvasHeight > 8192 ||
     packet.canvasWidth * packet.canvasHeight > frameLimits.pixels ||
     packet.x + packet.width > packet.canvasWidth || packet.y + packet.height > packet.canvasHeight ||
     packet.payloadBytes !== (rle ? 0 : decodedBytes)) throw Error('frame_packet_format');
 return {...packet, rle, decodedBytes};
}
function packetExtent(headers, first, since) {
 const length = headers.get('Content-Length');
 const wireBytes = length === null ? null : Number(length);
 if (wireBytes !== null && (!Number.isSafeInteger(wireBytes) || wireBytes <= packetHeaderBytes || wireBytes > frameLimits.inputBytes)) throw Error('frame_body_length');
 const heightHeader = headers.get('X-Frame-Crop-Height');
 const cropHeight = /^\d{1,4}$/.test(heightHeader ?? '') ? Number(heightHeader) : 0;
 if (!cropHeight || cropHeight > first.canvasHeight) throw Error('frame_packet_extent');
 const pixelBytes = cropHeight * first.width * 2;
 const minRecords = Math.ceil(cropHeight / Math.floor(packetPayloadLimit / (first.width * 2)));
 if (wireBytes !== null && (wireBytes < pixelBytes + minRecords * packetHeaderBytes ||
     wireBytes > pixelBytes + cropHeight * packetHeaderBytes || (wireBytes - pixelBytes) % packetHeaderBytes)) throw Error('frame_body_length');
 const meta = frameExtent(headers, {width: first.width, height: cropHeight}, since);
 if (meta.revision === null || Number(meta.revision) !== first.revision || meta.width !== first.canvasWidth || meta.height !== first.canvasHeight || meta.x !== first.x || meta.y !== first.y) throw Error('frame_packet_extent');
 return {meta: {...meta, scene: first.scene}, wireBytes, pixelBytes};
}
function packetRegionExtent(headers, first, since) {
 const number = name => {
  const value = headers.get(name);
  if (!/^\d{1,10}$/.test(value ?? '')) throw Error('frame_packet_extent');
  return Number(value);
 };
 const cropWidth = number('X-Frame-Crop-Width'), cropHeight = number('X-Frame-Crop-Height');
 const raw = number('X-Frame-Raw-Bytes'), fullFlag = number('X-Frame-Full');
 const meta = frameExtent(headers, {width: cropWidth, height: cropHeight}, since);
 if (!cropWidth || !cropHeight || raw < 2 || raw % 2 || raw > meta.width * meta.height * 2 ||
     fullFlag > 1 || (!fullFlag && since == null) ||
     (fullFlag && (!meta.full || raw !== meta.width * meta.height * 2)) ||
     meta.revision === null || Number(meta.revision) !== first.revision || number('X-Frame-Scene') !== first.scene ||
     first.canvasWidth !== meta.width || first.canvasHeight !== meta.height) throw Error('frame_packet_extent');
 return {meta: {...meta, full: fullFlag === 1, scene: first.scene}, wireBytes: null, pixelBytes: raw};
}

function readRleBytes(value, index, payload, state) {
 while (index < value.length && state.fill < payload.length) {
  if (!state.remaining) {
   const token = value[index++];
   state.remaining = (token & 127) + 1;
   state.repeat = Boolean(token & 128);
   if ((state.repeat && state.remaining < 3) || state.fill + state.remaining * 2 > payload.length)
    throw Error('frame_packet_rle');
  } else if (state.low === undefined) {
   state.low = value[index++];
  } else {
   const high = value[index++];
   const count = state.repeat ? state.remaining : 1;
   for (let i = 0; i < count; i++) {
    payload[state.fill++] = state.low;
    payload[state.fill++] = high;
   }
   state.low = undefined;
   state.remaining -= count;
  }
 }
 return index;
}

export async function readFramePackets(response, {since, signal = AbortSignal.timeout(15000), onHeader, onRows, onProgress} = {}) {
 const reader = response.body?.getReader();
 if (!reader) throw Error('frame_body_missing');
 const header = new Uint8Array(packetHeaderBytes);
 let headerFill = 0, payloadFill = 0, received = 0, complete = 0, rows = 0;
 let packet, payload, meta, wireBytes, pixelBytes, version, rle;
 let decoded = 0, last = false;
 try {
  for (;;) {
   signal.throwIfAborted();
   const {value, done} = await frameAwait(reader.read(), signal);
   if (done) break;
   received += value.byteLength;
   if (received > frameLimits.inputBytes || (wireBytes != null && received > wireBytes)) throw Error('frame_body_length');
   let index = 0;
   while (index < value.byteLength) {
    if (!packet) {
     if (last) throw Error('frame_packet_trailing');
     const count = Math.min(packetHeaderBytes - headerFill, value.byteLength - index);
     header.set(value.subarray(index, index + count), headerFill);
     index += count;
     headerFill += count;
     if (headerFill !== packetHeaderBytes) continue;
     packet = packetHeader(header);
     if (!meta) {
      version = packet.version;
      ({meta, wireBytes, pixelBytes} = version === 2
       ? packetRegionExtent(response.headers, packet, since) : packetExtent(response.headers, packet, since));
      if (wireBytes !== null && received > wireBytes) throw Error('frame_body_length');
      onHeader?.(meta);
     }
     const remaining = meta.cropHeight - rows;
     const inExtent = packet.x >= meta.x && packet.y >= meta.y &&
       packet.x + packet.width <= meta.x + meta.cropWidth && packet.y + packet.height <= meta.y + meta.cropHeight;
     if (packet.version !== version || packet.revision !== Number(meta.revision) || packet.scene !== meta.scene ||
         packet.canvasWidth !== meta.width || packet.canvasHeight !== meta.height || !inExtent ||
         ((version === 1 || meta.full) && (packet.x !== meta.x || packet.y !== meta.y + rows ||
          packet.width !== meta.cropWidth || packet.height > remaining)) ||
         decoded + packet.decodedBytes > pixelBytes ||
         Boolean(packet.flags & 1) !== (decoded + packet.decodedBytes === pixelBytes)) throw Error('frame_packet_sequence');
     payload = new Uint8Array(packet.decodedBytes);
     rle = packet.rle ? {fill: 0, remaining: 0} : null;
    }
    if (rle) {
     index = readRleBytes(value, index, payload, rle);
     if (rle.fill !== payload.length) continue;
    } else {
     const count = Math.min(payload.length - payloadFill, value.byteLength - index);
     payload.set(value.subarray(index, index + count), payloadFill);
     payloadFill += count;
     index += count;
     if (payloadFill !== payload.length) continue;
    }
    const rgba = new Uint8ClampedArray(packet.width * packet.height * 4);
    for (let y = 0; y < packet.height; y++) {
     decodeRow(payload.subarray(y * packet.width * 2, (y + 1) * packet.width * 2), rgba.subarray(y * packet.width * 4), 16, packet.width);
    }
    onRows?.({x: packet.x, y: packet.y, width: packet.width, height: packet.height, rgba});
    complete += packetHeaderBytes + payload.length;
    decoded += payload.length;
    rows += packet.height;
    last = Boolean(packet.flags & 1);
    onProgress?.({received: wireBytes === null ? decoded : complete, total: wireBytes ?? pixelBytes});
    packet = undefined;
    payload = undefined;
    headerFill = payloadFill = 0;
   }
  }
  signal.throwIfAborted();
  if (!meta || !last || (wireBytes !== null && received !== wireBytes) || decoded !== pixelBytes || packet || headerFill) throw Error('frame_body_length');
  return {...meta, unchanged: false, transferredBytes: received};
 } catch (error) {
  void reader.cancel().catch(() => {});
  throw error;
 } finally {
  reader.releaseLock();
 }
}
