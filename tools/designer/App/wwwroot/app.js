// Presentation only; agent, model and MCP execution stay in SPLA.
window.designerUi = {
  async requestProgressiveFrame(canvas, reference, progressive, resetVersion, connectionId = '', websocket = false, automatic = false) {
    if (!canvas) return;
    let state = canvas.progressiveFrameState;
    if (!state) state = canvas.progressiveFrameState = {generation: 0, running: null, pending: false, surface: null, revision: null, scene: null, resetVersion: -1, connectionId: ''};
    clearTimeout(state.timer);
    if (state.connectionId !== connectionId || state.resetVersion !== resetVersion) {
      state.generation++; state.controller?.abort(); state.surface?.clear();
      state.frameSource?.close(); state.frameSource = null;
      state.revision = null; state.scene = null; state.resetVersion = resetVersion; state.connectionId = connectionId;
    }
    if (state.websocket !== websocket) {
      state.generation++;
      state.controller?.abort();
      if (state.websocket && !websocket)
        void import('./js/browser-tools.js').then(module => module.closeFrameSocket()).catch(() => {});
      state.websocket = websocket;
    }
    state.progressive = progressive;
    state.requestArgs = {reference, progressive, resetVersion, connectionId, websocket};
    state.pending = true;
    state.pendingManual ||= !automatic;
    if (state.running) return state.running;
    const generation = state.generation;
    let refreshInterval = 0;
    state.running = (async () => {
      try {
        while (state.pending && state.generation === generation) {
          state.pending = false;
          const manual = state.pendingManual;
          state.pendingManual = false;
          const progressiveMode = state.progressive;
          const controller = state.controller = new AbortController();
          let module, paint, header, lastProgress = 0;
          try {
            module = await import('./js/browser-tools.js');
            if (state.generation !== generation) return;
            refreshInterval = module.nativeFrameRefreshInterval(websocket);
            if (!manual && document.hidden) { refreshInterval = Math.max(1000, refreshInterval); continue; }
            state.surface ??= module.createFrameSurface(canvas);
            state.frameSource ??= module.registerPreviewFrame(state.surface);
            const reportProgress = (received, total) => {
              if (!controller.signal.aborted && state.generation === generation)
                void reference.invokeMethodAsync('UpdateProgressiveFrame', header?.width ?? 0, header?.height ?? 0,
                  received, total, header?.revision ?? '', connectionId).catch(() => {});
            };
            if (manual) reportProgress(0, 0);
            const capture = async since => module.captureNativeFrame({since, websocket, force: manual, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
              onHeader(meta) {
                if (since != null && state.scene != null && meta.scene !== undefined && meta.scene !== state.scene && !meta.full)
                  throw Error('frame_scene_changed');
                header = meta; paint = state.surface.begin(meta, {progressive: progressiveMode});
                if (!manual) reportProgress(0, 0);
              },
              onRows(rows) { if (paint) paint.rows(rows); },
              onProgress(progress) {
                const now = performance.now();
                if (now - lastProgress < 80 && progress.received < progress.total) return;
                lastProgress = now;
                reportProgress(progress.received, progress.total);
              }
            });
            let result;
            try { result = await capture(state.revision); }
            catch (error) {
              paint?.rollback(); paint = null;
              if (controller.signal.aborted || state.generation !== generation) throw error;
              // A failed delta may have crossed a scene or lost a packet. Recover once from a complete frame.
              state.revision = null; state.scene = null;
              header = null; lastProgress = 0; reportProgress(0, 0);
              result = await capture(undefined);
            }
            if (state.generation !== generation || controller.signal.aborted) { paint?.rollback(); return; }
            if (result.unchanged) {
              void reference.invokeMethodAsync('ProgressiveFrameCompleted', canvas.width, canvas.height,
                state.revision ?? '', connectionId).catch(() => {});
            } else if (paint) {
              paint.commit(); state.revision = result.revision; state.scene = result.scene ?? null;
              state.frameSource.commit(result);
              void reference.invokeMethodAsync('ProgressiveFrameCompleted', result.width, result.height,
                result.revision ?? '', connectionId).catch(() => {});
            }
          } catch (error) {
            paint?.rollback();
            refreshInterval = Math.max(800, refreshInterval);
            if (!controller.signal.aborted && state.generation === generation)
              void reference.invokeMethodAsync('ProgressiveFrameError', String(error?.message ?? error), connectionId).catch(() => {});
          } finally {
            if (state.controller === controller) state.controller = null;
          }
        }
      } finally {
        state.running = null;
        if (state.pending || (refreshInterval > 0 && state.generation === generation)) {
          state.timer = setTimeout(() => {
            if (!canvas.isConnected || !state.requestArgs) return;
            const {reference, progressive, resetVersion, connectionId, websocket} = state.requestArgs;
            void window.designerUi.requestProgressiveFrame(canvas, reference, progressive, resetVersion, connectionId, websocket, !state.pendingManual);
          }, state.pending ? 0 : refreshInterval);
        }
      }
    })();
    return state.running;
  },
  clearProgressiveFrame(canvas) {
    const state = canvas?.progressiveFrameState;
    if (!state) return;
    clearTimeout(state.timer);
    state.requestArgs = null;
    state.generation++; state.pending = state.pendingManual = false;
    state.controller?.abort(); state.surface?.clear();
    state.frameSource?.close(); state.frameSource = null;
    state.controller = null; state.revision = null; state.scene = null; state.connectionId = '';
  },
  copyProgressiveFrame(canvas) {
    if (!canvas || canvas.width < 1 || canvas.height < 1) throw Error('No progressive frame is available');
    const data = canvas.toDataURL('image/png');
    if (data.length > 11184832) throw Error('Progressive frame is too large to copy');
    return data;
  },
  async bindPreviewPointer(image, reference, originalWidth, originalHeight, enabled, connectionId = '') {
    if (!image) return;
    const options = {width: originalWidth, height: originalHeight, enabled};
    if (image.previewPointerBinding && image.previewPointerIdentity === connectionId) {
      image.previewPointerBinding.update(options); return;
    }
    const generation = (image.previewPointerGeneration ?? 0) + 1;
    image.previewPointerGeneration = generation;
    image.previewPointerBinding?.dispose(); delete image.previewPointerBinding;
    const module = await import('./js/browser-tools.js');
    if (image.previewPointerGeneration !== generation || !image.isConnected) return;
    const send = ({x, y, pressed}) => reference.invokeMethodAsync('SendPreviewPointer', x, y, pressed, connectionId);
    const onError = error => { if (image.previewPointerGeneration === generation) void reference.invokeMethodAsync('PreviewPointerError', error.message).catch(() => {}); };
    image.previewPointerIdentity = connectionId;
    image.previewPointerBinding = module.bindPreviewPointer(image, send, {...options, onError});
  },
  unbindPreviewPointer(image) {
    if (!image) return;
    image.previewPointerGeneration = (image.previewPointerGeneration ?? 0) + 1;
    image.previewPointerBinding?.dispose(); delete image.previewPointerBinding;
  },
  bindSplitter(area, handle, reference) {
    if (!area || !handle || handle.splitterCleanup) return;
    let active = false;
    const set = value => {
      const available = area.clientWidth - parseFloat(getComputedStyle(area).paddingLeft) - parseFloat(getComputedStyle(area).paddingRight) - handle.offsetWidth;
      const minimum = Math.max(25, 260 / Math.max(available, 1) * 100);
      const ratio = Math.min(100 - minimum, Math.max(minimum, value));
      area.style.setProperty('--chat-track', `${ratio}fr`);
      area.style.setProperty('--preview-track', `${100 - ratio}fr`);
      handle.setAttribute('aria-valuenow', ratio.toFixed(1));
      return ratio;
    };
    const current = () => parseFloat(handle.getAttribute('aria-valuenow')) || 62;
    const save = () => reference.invokeMethodAsync('SavePaneRatio', current());
    const down = event => {
      if (event.button !== 0) return;
      active = true; handle.setPointerCapture(event.pointerId); event.preventDefault();
    };
    const move = event => {
      if (!active) return;
      const bounds = area.getBoundingClientRect(), style = getComputedStyle(area);
      const left = bounds.left + parseFloat(style.paddingLeft);
      const width = bounds.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - handle.offsetWidth;
      set((event.clientX - left - handle.offsetWidth / 2) / width * 100);
    };
    const up = event => {
      if (!active) return;
      active = false;
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      void save();
    };
    const key = event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
      event.preventDefault();
      set(event.key === 'Home' ? 62 : current() + (event.key === 'ArrowLeft' ? -2 : 2));
      void save();
    };
    const reset = () => { set(62); void save(); };
    const events = {pointerdown: down, pointermove: move, pointerup: up, pointercancel: up, keydown: key, dblclick: reset};
    for (const [name, callback] of Object.entries(events)) handle.addEventListener(name, callback);
    handle.splitterCleanup = () => { for (const [name, callback] of Object.entries(events)) handle.removeEventListener(name, callback); delete handle.splitterCleanup; };
  },
  unbindSplitter(handle) { handle?.splitterCleanup?.(); },
  bindPaste(reference) { window.designerPasteTarget = reference; },
  followChat(force = false) {
    const el = document.querySelector('.conversation');
    if (!el) return;
    if (!el.dataset.scrollReady) {
      el.dataset.scrollReady = '1'; el.follow = true;
      el.addEventListener('scroll', () => { el.follow = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }, {passive: true});
    }
    if (force || el.follow) el.scrollTop = el.scrollHeight;
  }
};
document.addEventListener('keydown', event => {
  if (event.target.matches('.composer textarea') && event.key === 'Enter' && !event.shiftKey && !event.isComposing)
    event.preventDefault();
});

document.addEventListener('paste', async event => {
  if (!event.target.closest?.('.composer') || !window.designerPasteTarget) return;
  const files = Array.from(event.clipboardData?.items ?? [])
    .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
    .map(item => item.getAsFile()).filter(Boolean);
  if (!files.length) return;
  event.preventDefault();
  try {
    if (files.length > 8) throw Error('Не более 8 изображений за одну вставку.');
    for (const [index, file] of files.entries()) {
      if (file.size > 8 * 1024 * 1024) throw Error('Изображение больше 8 МБ.');
      const url = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(Error('Не удалось прочитать буфер.')); reader.readAsDataURL(file);
      });
      await window.designerPasteTarget.invokeMethodAsync('PasteImage',
        `clipboard-${Date.now()}-${index}.${file.type.split('/')[1] || 'png'}`, file.type, url);
    }
  } catch (error) {
    await window.designerPasteTarget.invokeMethodAsync('PasteError', error.message);
  }
});
