// Presentation only; agent, model and MCP execution stay in SPLA.
window.designerUi = {
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
