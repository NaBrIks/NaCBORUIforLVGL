// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import test from 'node:test';
import assert from 'node:assert/strict';
import {readNativeFrame} from '../packages/project-codec/progressive-frame.js';

const origin = 'http://device.test';
const red = [255, 0, 0, 255], green = [0, 255, 0, 255], blue = [0, 0, 255, 255];
function bmp({width = 3, height = 2, bits = 16, topDown = true} = {}) {
 const offset = bits === 16 ? 66 : 54;
 const stride = Math.ceil(width * bits / 32) * 4;
 const bytes = new Uint8Array(offset + stride * height);
 const header = new DataView(bytes.buffer);
 bytes.set([0x42, 0x4d]);
 header.setUint32(2, bytes.length, true);
 header.setUint32(10, offset, true);
 header.setUint32(14, 40, true);
 header.setInt32(18, width, true);
 header.setInt32(22, topDown ? -height : height, true);
 header.setUint16(26, 1, true);
 header.setUint16(28, bits, true);
 header.setUint32(34, stride * height, true);
 if (bits === 16) {
  header.setUint32(30, 3, true);
  header.setUint32(54, 0xf800, true);
  header.setUint32(58, 0x07e0, true);
  header.setUint32(62, 0x001f, true);
 }
 const colors = [[red, green, blue], [blue, red, green]];
 for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
   const pixel = colors[(topDown ? y : height - y - 1) % 2][x % 3];
   const at = offset + y * stride + x * (bits / 8);
   if (bits === 16) header.setUint16(at, pixel[0] ? 0xf800 : pixel[1] ? 0x07e0 : 0x001f, true);
   else bytes.set([pixel[2], pixel[1], pixel[0], 0], at);
  }
 }
 return {bytes, offset, stride};
}
function response(body, headers = {}) {
 return new Response(body, {headers: {'Content-Type': 'image/bmp', ...headers}});
}
function deltaHeaders(overrides = {}) {
 return {'X-Frame-Revision': '8', 'X-Frame-X': '2', 'X-Frame-Y': '4', 'X-Frame-Width': '8', 'X-Frame-Height': '8', ...overrides};
}

test('RGB565 rows are emitted before the transfer ends, with a split header, padded stride and absolute crop positions', async () => {
 const {bytes, offset, stride} = bmp();
 let controller, firstRow;
 const first = new Promise(resolve => { firstRow = resolve; });
 const stream = new ReadableStream({start(value) { controller = value; }});
 const headers = [], progress = [], rows = [];
 const loading = readNativeFrame(async (url, options) => {
  assert.equal(url, origin + '/api/view/frame?since=7');
  assert.equal(options.stream, true);
  return response(stream, deltaHeaders({'Content-Length': String(bytes.length)}));
 }, origin, {since: '7', onHeader: value => headers.push(value), onProgress: value => progress.push(value), onRows: value => { rows.push(value); firstRow(); }});
 for (const [a, b] of [[0, 31], [31, 55], [55, offset + stride - 1], [offset + stride - 1, offset + stride]]) controller.enqueue(bytes.subarray(a, b));
 await first;
 assert.deepEqual(headers[0], {revision: '8', width: 8, height: 8, x: 2, y: 4, cropWidth: 3, cropHeight: 2, full: false});
 assert.deepEqual([...rows[0].rgba], [...red, ...green, ...blue]);
 assert.equal(rows[0].y, 4);
 controller.enqueue(bytes.subarray(offset + stride));
 controller.close();
 assert.equal((await loading).revision, '8');
 assert.equal(rows[1].y, 5);
 assert.deepEqual([...rows[1].rgba], [...blue, ...red, ...green]);
 assert.equal(progress.at(-1).received, bytes.length);
 assert.equal(progress.at(-1).total, bytes.length);
});

test('legacy Windows BI_RGB32 bottom-up frame stays opaque and correctly ordered', async () => {
 const rows = [];
 const frame = await readNativeFrame(async () => response(bmp({bits: 32, topDown: false}).bytes), origin, {onRows: value => rows.push(value)});
 assert.equal(frame.revision, null);
 assert.equal(frame.full, true);
 assert.equal(rows.length, 1);
 assert.equal(rows[0].y, 0);
 assert.deepEqual([...rows[0].rgba], [...red, ...green, ...blue, ...blue, ...red, ...green]);
});

test('unchanged replies skip painting and malformed or unbased crops fail before painting', async () => {
 const unchanged = async () => new Response(null, {status: 204, headers: {'X-Frame-Revision': '8'}});
 const noPaint = () => assert.fail('Invalid or unchanged update must not emit rows');
 assert.deepEqual(await readNativeFrame(unchanged, origin, {since: '8', onRows: noPaint}), {unchanged: true, revision: '8'});
 await assert.rejects(readNativeFrame(unchanged, origin), /unexpected_unchanged/);
 const {bytes} = bmp();
 for (const headers of [deltaHeaders({'X-Frame-Y': '7'}), deltaHeaders({'X-Frame-Revision': '4294967296'}), {'X-Frame-Revision': '8'}]) {
  await assert.rejects(readNativeFrame(async () => response(bytes, headers), origin, {since: '7', onRows: noPaint}), /frame_extent|frame_revision/);
 }
 await assert.rejects(readNativeFrame(async () => response(bytes, deltaHeaders()), origin, {onRows: noPaint}), /frame_extent/);
});

test('truncation and cancellation cannot acknowledge a partial frame', async () => {
 const {bytes, offset, stride} = bmp();
 await assert.rejects(readNativeFrame(async () => response(bytes.subarray(0, bytes.length - 1)), origin), /frame_body_length/);
 const abort = new AbortController();
 let cancelled = false;
 const stream = new ReadableStream({
  start(controller) { controller.enqueue(bytes.subarray(0, offset + stride)); },
  cancel() { cancelled = true; }
 });
 await assert.rejects(readNativeFrame(async () => response(stream), origin, {signal: abort.signal, onRows: () => abort.abort()}), /aborted/i);
 assert.equal(cancelled, true);
});

function packet({width = 4, height = 1, x = 0, y = 0, canvasWidth = width, canvasHeight = height, revision = 9, scene = 7, flags = 0, pixel = 0xf800} = {}) {
 const bytes = new Uint8Array(32 + width * height * 2);
 const view = new DataView(bytes.buffer);
 bytes.set([0x4c, 0x56, 0x46, 0x31]);
 view.setUint32(4, bytes.length - 32, true);
 view.setUint32(8, revision, true);
 view.setUint32(12, scene, true);
 [x, y, width, height, canvasWidth, canvasHeight, 1, flags].forEach((value, i) => view.setUint16(16 + i * 2, value, true));
 for (let offset = 32; offset < bytes.length; offset += 2) view.setUint16(offset, pixel, true);
 return bytes;
}
const concatenate = (...parts) => Uint8Array.from(Buffer.concat(parts));
function packetResponse(body, {x = 0, y = 0, width = 4, height = 2, cropHeight = height, length} = {}) {
 const headers = {'Content-Type': 'application/x-lvgl-frame', 'X-Frame-Revision': '9', 'X-Frame-X': String(x), 'X-Frame-Y': String(y), 'X-Frame-Width': String(width), 'X-Frame-Height': String(height), 'X-Frame-Crop-Height': String(cropHeight)};
 if (length !== undefined) headers['Content-Length'] = String(length);
 return new Response(body, {headers});
}

test('negotiated LVF1 full frame paints complete variable-height records and reports their wire progress', async () => {
 const first = packet({width: 800, height: 2, canvasHeight: 5});
 const middle = packet({width: 800, y: 2, canvasHeight: 5, pixel: 0x001f});
 const last = packet({width: 800, height: 2, y: 3, canvasHeight: 5, flags: 1, pixel: 0x07e0});
 const length = first.length + middle.length + last.length;
 let source, firstPaint;
 const painted = new Promise(resolve => { firstPaint = resolve; });
 const stream = new ReadableStream({start(controller) { source = controller; }});
 const rows = [], progress = [];
 const transfer = readNativeFrame(async (url, options) => {
  assert.equal(url, origin + '/api/view/frame?packets=1');
  assert.match(options.headers.Accept, /application\/x-lvgl-frame/);
  assert.equal(options.stream, true);
  return packetResponse(stream, {width: 800, height: 5, length});
 }, origin, {packets: true, onRows: value => { rows.push(value); firstPaint(); }, onProgress: value => progress.push(value)});
 source.enqueue(first.subarray(0, 31));
 source.enqueue(first.subarray(31, first.length - 1));
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(rows.length, 0, 'partial LVF1 record never reaches canvas');
 source.enqueue(first.subarray(first.length - 1));
 await painted;
 assert.equal(rows[0].height, 2);
 assert.deepEqual([...rows[0].rgba.subarray(0, 4)], red);
 assert.deepEqual(progress, [{received: first.length, total: length}]);
 source.enqueue(concatenate(middle, last));
 source.close();
 const frame = await transfer;
 assert.deepEqual([frame.revision, frame.scene, frame.full], ['9', 7, true]);
 assert.deepEqual(rows.map(row => [row.y, row.height, [...row.rgba.subarray(0, 4)]]), [[0, 2, red], [2, 1, blue], [3, 2, green]]);
 assert.deepEqual(progress.at(-1), {received: length, total: length});
});

test('LVF1 delta checks its crop, sequence, epoch, last marker and packet size', async () => {
 const geometry = {x: 6, y: 2, width: 800, height: 480, cropHeight: 2};
 const base = {x: 6, y: 2, canvasWidth: 800, canvasHeight: 480};
 const first = packet(base);
 const last = packet({...base, y: 3, flags: 1});
 const read = (body, options = {}) => readNativeFrame(async url => {
  assert.equal(url, origin + '/api/view/frame?packets=1&since=8');
  return packetResponse(body, geometry);
 }, origin, {packets: true, since: '8', ...options});
 const frame = await read(concatenate(first, last));
 assert.deepEqual([frame.x, frame.y, frame.cropWidth, frame.cropHeight, frame.full], [6, 2, 4, 2, false]);
 for (const malformed of [
  packet({...base, y: 4, flags: 1}), packet({...base, y: 3, flags: 1, scene: 8}),
  packet({...base, y: 3, flags: 1, revision: 10}), packet({...base, y: 3}),
  packet({...base, y: 3, flags: 3})
 ]) await assert.rejects(read(concatenate(first, malformed)), /frame_packet_sequence|frame_packet_format/);
 await assert.rejects(read(concatenate(first, last.subarray(0, last.length - 1))), /frame_body_length/);
 await assert.rejects(read(concatenate(first, last, Uint8Array.of(0))), /frame_packet_trailing/);
 const oversized = packet({width: 800, height: 3, flags: 1});
 await assert.rejects(readNativeFrame(async () => packetResponse(oversized, {width: 800, height: 3}), origin, {packets: true}), /frame_packet_format/);
 await assert.rejects(readNativeFrame(async () => packetResponse(concatenate(first, last), geometry), origin, {packets: true}), /frame_extent/);
});

test('negotiation keeps legacy full BMP and unchanged responses interoperable', async () => {
 const frame = await readNativeFrame(async () => response(bmp().bytes), origin, {packets: true, since: '8'});
 assert.equal(frame.full, true);
 assert.equal(frame.revision, null);
 const unchanged = await readNativeFrame(async () => new Response(null, {status: 204, headers: {'X-Frame-Revision': '9'}}), origin, {packets: true, since: '9', onRows: () => assert.fail('unchanged frame painted')});
 assert.deepEqual(unchanged, {unchanged: true, revision: '9'});
});

test('LVF2 accepts separated RAW/RLE zones across arbitrary reads and rejects incomplete RLE', async () => {
 const left = packet({width: 3, x: 2, y: 1, canvasWidth: 20, canvasHeight: 10, flags: 2});
 left[3] = 0x32;
 new DataView(left.buffer).setUint32(4, 0, true);
 const right = packet({width: 2, x: 15, y: 8, canvasWidth: 20, canvasHeight: 10, flags: 1, pixel: 0x07e0});
 right[3] = 0x32;
 const wire = concatenate(left.subarray(0, 32), Uint8Array.of(0x82, 0, 0xf8), right);
 const headers = {'Content-Type': 'application/x-lvgl-frame', 'X-Frame-Revision': '9', 'X-Frame-Scene': '7',
  'X-Frame-X': '2', 'X-Frame-Y': '1', 'X-Frame-Width': '20', 'X-Frame-Height': '10',
  'X-Frame-Crop-Width': '15', 'X-Frame-Crop-Height': '8', 'X-Frame-Raw-Bytes': '10', 'X-Frame-Full': '0'};
 const read = (data, options) => readNativeFrame(async url => {
  assert.equal(url, origin + '/api/view/frame?packets=2&since=8');
  return new Response(new ReadableStream({start(controller) {
   for (const value of data) controller.enqueue(Uint8Array.of(value));
   controller.close();
  }}), {headers});
 }, origin, {packets: 2, since: '8', ...options});
 const rows = [], progress = [];
 const frame = await read(wire, {onRows: row => rows.push(row), onProgress: step => progress.push(step)});
 assert.equal(frame.transferredBytes, 71);
 assert.equal(frame.full, false);
 assert.deepEqual(rows.map(row => [row.x, row.y, ...row.rgba]), [[2, 1, ...red, ...red, ...red], [15, 8, ...green, ...green]]);
 assert.deepEqual(progress, [{received: 6, total: 10}, {received: 10, total: 10}]);
 await assert.rejects(read(wire.subarray(0, 34)), /frame_body_length/);
 const invalid = wire.slice();
 invalid[32] = 0x83;
 await assert.rejects(read(invalid), /frame_packet_rle/);
});
