// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov

// A complete update is the base for the next crop. Atomic mode draws into a
// crop-sized scratch canvas. Progressive mode keeps the old affected pixels
// until the stream completes so cancellation cannot leave an invalid base.
export function createFrameSurface(canvas) {
 let ready = false;
 let active, drawPrevious;
 const context = canvas.getContext('2d');
 if (!context) throw Error('frame_canvas_unavailable');
 const scratch = (width, height) => {
  const buffer = canvas.ownerDocument.createElement('canvas');
  buffer.width = width;
  buffer.height = height;
  return buffer;
 };
 const resize = (width, height) => {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
 };
 return {
  begin(frame, {progressive = false} = {}) {
   active?.rollback();
   const {width, height, x, y, cropWidth, cropHeight, full} = frame;
   const oldWidth = canvas.width, oldHeight = canvas.height;
   const sameExtent = oldWidth === width && oldHeight === height;
   if (!full && (!ready || !sameExtent)) throw Error('frame_delta_base');
   let staging, backup;
   let target = context;
   if (progressive) {
    if (ready) {
     backup = scratch(sameExtent ? cropWidth : oldWidth, sameExtent ? cropHeight : oldHeight);
     const saved = backup.getContext('2d');
     if (sameExtent) saved.drawImage(canvas, x, y, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
     else saved.drawImage(canvas, 0, 0);
    }
    resize(width, height);
   } else {
    staging = scratch(cropWidth, cropHeight);
    target = staging.getContext('2d');
   }
   drawPrevious = backup ? (target, width, height) => {
    if (!sameExtent) {
     target.drawImage(backup, 0, 0, width, height);
     return;
    }
    // Restore the crop at source resolution before resampling the screenshot.
    const completed = scratch(oldWidth, oldHeight);
    const copy = completed.getContext('2d');
    copy.drawImage(canvas, 0, 0);
    copy.clearRect(x, y, cropWidth, cropHeight);
    copy.drawImage(backup, x, y);
    target.drawImage(completed, 0, 0, width, height);
   } : undefined;
   const paint = {
    rows(batch) {
     if (active !== paint) return;
     const image = target.createImageData(batch.width, batch.height);
     image.data.set(batch.rgba);
     target.putImageData(image, batch.x - (progressive ? 0 : x), batch.y - (progressive ? 0 : y));
    },
    commit() {
     if (active !== paint) return;
     if (staging) {
      resize(width, height);
      context.drawImage(staging, x, y);
     }
     ready = true;
     active = drawPrevious = undefined;
    },
    rollback() {
     if (active !== paint) return;
     if (progressive) {
      resize(oldWidth, oldHeight);
      if (backup) context.drawImage(backup, sameExtent ? x : 0, sameExtent ? y : 0);
      else context.clearRect(0, 0, canvas.width, canvas.height);
     }
     active = drawPrevious = undefined;
    }
   };
   active = paint;
   return paint;
  },
  drawCompleted(target, width, height) {
   if (!ready) throw Error('preview_frame_unavailable');
   if (drawPrevious) drawPrevious(target, width, height);
   else target.drawImage(canvas, 0, 0, width, height);
  },
  clear() {
   active?.rollback();
   context.clearRect(0, 0, canvas.width, canvas.height);
   ready = false;
  }
 };
}
