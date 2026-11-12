// SPDX-License-Identifier: MIT
import {base64ToBytes} from './http.js';
import {frameAwait} from '../../../packages/project-codec/native-frame.js';

let nextRequest = 0;
export function socketFrameFetcher(bridge) {
 return async (url, {signal}) => {
  const id = ++nextRequest;
  const since = Number(new URL(url).searchParams.get('since') ?? 0);
  const invoke = (method, ...args) => bridge.invokeMethodAsync(method, id, ...args);
  const abort = () => { void invoke('AbortFrameSocket').catch(() => {}); };
  const remove = () => signal.removeEventListener('abort', abort);
  signal.throwIfAborted();
  signal.addEventListener('abort', abort, {once: true});
  try {
   const metadata = await frameAwait(invoke('BeginFrameSocket', since), signal);
   if (metadata === 'idle') { remove(); return new Response(null, {status: 204}); }
   const names = ['Revision', 'Scene', 'X', 'Y', 'Width', 'Height', 'Crop-Width', 'Crop-Height', 'Raw-Bytes', 'Full'];
   const fields = metadata.split(',');
   if (fields.length !== names.length + 1 || fields[0] !== 'begin' ||
       fields.slice(1).some(value => !/^\d{1,10}$/.test(value))) throw Error('frame_socket_metadata');
   const headers = {'Content-Type': 'application/x-lvgl-frame'};
   for (const [index, name] of names.entries()) headers['X-Frame-' + name] = fields[index + 1];
   const body = new ReadableStream({
    async pull(controller) {
     try {
      const part = await frameAwait(invoke('ReadFrameSocket'), signal);
      if (part.cancelled) throw Error('frame_scene_changed');
      if (part.done) { remove(); controller.close(); return; }
      controller.enqueue(base64ToBytes(part.body, 4096));
     } catch (error) { remove(); abort(); controller.error(error); }
    },
    cancel() { remove(); abort(); }
   }, {highWaterMark: 0});
   return new Response(body, {headers});
  } catch (error) { remove(); abort(); throw error; }
 };
}
