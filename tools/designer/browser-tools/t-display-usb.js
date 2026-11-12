// SPDX-License-Identifier: MIT
import {encode} from 'cborg';
import {base64ToBytes, bytesToBase64} from './http.js';
import {frameAwait} from '../../../packages/project-codec/native-frame.js';
import {readFramePackets} from '../../../packages/project-codec/progressive-frame.js';

export async function connectTDisplayUsb(bridge) {
 const lifetime = new AbortController();
 let id = 0;
 async function command(args, signal = lifetime.signal) {
  signal.throwIfAborted();
  const request = ++id;
  const data = bytesToBase64(encode({...args, id: request}));
  const result = await frameAwait(bridge.invokeMethodAsync('ExchangeUsb', data, request), signal);
  if (result?.reply?.ok !== true) throw Error(result?.reply?.error ?? 'T-Display USB reply is invalid');
  return result;
 }
 async function inspect(signal) {
  const {reply: {width, height, mode, buffers, pixelFormat, transfer, viewState, viewBands, viewInput}} = await command({op: 'inspect'}, signal);
  if (width !== 320 || height !== 170 || mode !== 'partial' || pixelFormat !== 'RGB565' || transfer !== 'band')
   throw Error('This port did not report the T-Display PARTIAL firmware');
  return {width, height, mode, buffers, pixelFormat, transfer, viewState: viewState === true, viewBands: viewBands === true,
   native_view: true, native_view_input: viewInput === true};
 }
 const device = await inspect();
 const {width, height} = device;
 let previous;
 async function viewState(signal, since = 0) {
  const {reply: {scene, damage, bands, full}} = await command({op: 'view_state', since}, signal);
  if (![scene, damage].every(value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff))
   throw Error('T-Display view state is invalid');
  if (device.viewBands && (!Number.isInteger(bands) || bands < 0 || bands >= 2 ** Math.ceil(height / 6) ||
      typeof full !== 'boolean')) throw Error('T-Display band plan is invalid');
  return {scene, damage, bands, full};
 }

 async function capture(options) {
  const signal = options.signal ? AbortSignal.any([options.signal, lifetime.signal]) : lifetime.signal;
  const since = !options.force && options.since != null ? Number(options.since) : 0;
  const start = device.viewState ? await viewState(signal, device.viewBands ? since : 0) : null;
  const changedBands = device.viewBands;
  if (start && (changedBands ? start.bands === 0 :
      since && previous && start.scene === previous.scene && start.damage === previous.damage))
   return {unchanged: true, revision: options.since};
  const full = changedBands ? start.full : true;
  const bands = [];
  for (let y = 0; y < height; y += 6) {
   if (!changedBands || (start.bands & (1 << (y / 6)))) bands.push(y);
  }
  const startY = bands[0], endY = Math.min(height, bands.at(-1) + 6);
  let index = 0, scene = start?.scene, revision = changedBands ? start.damage : undefined;
  async function band() {
   const y = bands[index++], rows = Math.min(6, height - y);
   const reply = await command({op: 'frame_band', y, rows}, signal);
   const bytes = base64ToBytes(reply.body, 4128);
   const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
   const word = offset => view.getUint16(offset, true);
   if (bytes.length !== 32 + width * rows * 2 || view.getUint32(0, true) !== 0x3146564c ||
       word(16) !== 0 || word(18) !== y || word(20) !== width || word(22) !== rows ||
       word(24) !== width || word(26) !== height || word(28) !== 1 || word(30) !== 1)
    throw Error('T-Display band is invalid');
   const nextScene = view.getUint32(12, true);
   if (scene !== undefined && scene !== nextScene) throw Error('frame_scene_changed');
   scene = nextScene;
   // Each band has its own USB capture sequence. The assembled frame uses the
   // first sequence and accepts bands only from the same LVGL scene.
   revision ??= view.getUint32(8, true);
   view.setUint32(8, revision, true);
   if (changedBands) view.setUint8(3, 50); // LVF2 supports disjoint strips.
   view.setUint16(30, index === bands.length ? 1 : 0, true);
   return bytes;
  }
  let first = await band();
  const stream = new ReadableStream({
   async pull(controller) {
    try {
     if (first) { controller.enqueue(first); first = undefined; return; }
     if (index === bands.length) { controller.close(); return; }
     controller.enqueue(await band());
    } catch (error) { controller.error(error); }
   }
  }, {highWaterMark: 0});
  const response = new Response(stream, {headers: {
   'X-Frame-X': '0', 'X-Frame-Y': String(startY), 'X-Frame-Width': String(width), 'X-Frame-Height': String(height),
   'X-Frame-Crop-Width': String(width), 'X-Frame-Crop-Height': String(endY - startY),
   'X-Frame-Revision': String(revision), 'X-Frame-Scene': String(scene),
   'X-Frame-Full': full ? '1' : '0',
   'X-Frame-Raw-Bytes': String(bands.reduce((sum, y) => sum + width * Math.min(6, height - y) * 2, 0))
  }});
  const frame = await readFramePackets(response, {...options, since: full ? undefined : options.since, signal});
  if (start && (await viewState(signal, revision)).scene !== start.scene) throw Error('frame_scene_changed');
  previous = start;
  return frame;
 }

 const tools = [{name: 'get_device', description: 'Inspect the connected T-Display USB firmware and display.',
  inputSchema: {type: 'object', properties: {}, additionalProperties: false}, annotations: {readOnlyHint: true}}];
 if (device.native_view_input) tools.push({
  name: 'send_view_input', description: 'Send a native LVGL pointer state in original display pixels.',
  inputSchema: {type: 'object', properties: {
   x: {type: 'integer', minimum: 0, maximum: width - 1},
   y: {type: 'integer', minimum: 0, maximum: height - 1},
   pressed: {type: 'boolean'}
  }, required: ['x', 'y', 'pressed'], additionalProperties: false}, annotations: {readOnlyHint: false}
 });
 return {
  metadata: {
   device,
   capabilities: {display: {width, height}},
   instructions: 'T-Display USB provides live display diagnostics and pointer control when advertised.',
   tools
  },
  capture,
  async call(name, args) {
   if (name === 'get_device') return {content: [{type: 'text', text: JSON.stringify(await inspect())}]};
   if (name === 'send_view_input' && device.native_view_input) {
    const {x, y, pressed} = args;
    const {reply} = await command({op: 'view_input', x, y, pressed});
    return {content: [{type: 'text', text: JSON.stringify(reply)}]};
   }
   throw Error('Unsupported T-Display USB tool');
  },
  cancelCall() { return false; },
  dispose() { lifetime.abort(); }
 };
}
