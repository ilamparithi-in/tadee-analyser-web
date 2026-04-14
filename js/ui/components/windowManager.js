/**
 * windowManager.js — Win98-accurate window management.
 *
 * Motion rules:
 *   - No easing anywhere — linear or instant only.
 *   - No transform-based animation — only left/top/width/height.
 *   - Drag:   outline tracks mouse; window teleports on mouseup.
 *   - Resize: outline tracks proposed size; window jumps on mouseup.
 *   - Minimize/Restore: content hidden instantly; size+pos animated linear.
 *   - Maximize/Restore: instant.
 *
 * Exports: initWindowManager(viewport), addWindow(winEl, viewportEl)
 */

const MINIMIZE_ANIM_MS  = 150;
const CASCADE_STEP      = 20;
const CASCADE_START_X   = 20;
const CASCADE_START_Y   = 20;
const MIN_WIN_W         = 120;
const MIN_WIN_H         = 60;
const MINIMIZED_SLOT_W  = 160;

let _viewport     = null;
let _taskbarTasks = null;  // #taskbar-tasks container for window buttons
let _outline      = null;  // shared #wm-outline element — created once on first use
let _cascade      = 0;     // shared with addWindow for correct cascade across static + dynamic
let  zTop         = 100;   // z-index counter, starts above 98.css library values

/** @type {Map<HTMLElement, Object>} */
const registry = new Map();

// ─── Outline helper ──────────────────────────────────────────────────────────

function _getOutline() {
  if (!_outline) {
    _outline = document.createElement('div');
    _outline.id = 'wm-outline';
    _outline.style.cssText =
      'position:absolute;border:2px dotted #000;pointer-events:none;' +
      'z-index:9999;display:none;box-sizing:border-box;';
    _viewport.appendChild(_outline);
  }
  return _outline;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Register all .window direct children already in the viewport.
 * @param {HTMLElement} viewport
 */
export function initWindowManager(viewport) {
  _viewport     = viewport;
  _taskbarTasks = document.querySelector('#taskbar-tasks');
  viewport.querySelectorAll(':scope > .window').forEach(win => _register(win));

  // Deactivate all windows when clicking outside any window
  viewport.addEventListener('mousedown', e => {
    if (!e.target.closest('.window')) {
      registry.forEach((s, w) => {
        const tb = w.querySelector('.title-bar');
        if (tb) tb.classList.add('inactive');
        if (s.taskBtn) s.taskBtn.setAttribute('aria-pressed', 'false');
      });
    }
  });

  // Keep maximized windows filling the viewport when it resizes
  new ResizeObserver(() => {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    registry.forEach((s, w) => {
      if (s.isMaximized && !s.animating) {
        w.style.width  = vw + 'px';
        w.style.height = vh + 'px';
      }
    });
  }).observe(viewport);
}

/**
 * Append a window element to the viewport and register it with the WM.
 * The cascade counter is shared with initWindowManager so dynamically-added
 * windows continue the cascade sequence naturally.
 * @param {HTMLElement} winEl
 * @param {HTMLElement} viewportEl
 */
/**
 * Bring a window to the front. Restores it first if minimized.
 * @param {HTMLElement} winEl
 */
export function raiseWindow(winEl) {
  const s = registry.get(winEl);
  if (!s) return;
  if (s.isHidden) {
    s.isHidden = false;
    winEl.style.visibility = 'visible';
    if (s.taskBtn) s.taskBtn.style.display = '';
  }
  if (s.isMinimized) _restore(winEl);
  _focus(winEl);
}

export function addWindow(winEl, viewportEl) {
  if (!_viewport) _viewport = viewportEl;
  if (!viewportEl.contains(winEl)) viewportEl.appendChild(winEl);
  _register(winEl);
}

// ─── Registration ────────────────────────────────────────────────────────────

function _register(win) {
  if (registry.has(win)) return; // guard against double-registration

  // Read capability flags from data-* attributes (default true)
  const resizable   = win.dataset.resizable   !== 'false';
  const maximizable = win.dataset.maximizable  !== 'false';
  const minimizable = win.dataset.minimizable  !== 'false';
  const closable    = win.dataset.closable     !== 'false';

  // Locate title-bar control buttons
  const controls  = win.querySelector('.title-bar-controls');
  const minBtn    = controls?.querySelector('button[aria-label="Minimize"]')   ?? null;
  const maxBtn    = controls?.querySelector('button[aria-label="Maximize"]')   ?? null;
  const closeBtn  = controls?.querySelector('button[aria-label="Close"]')      ?? null;

  // Hide buttons for disabled capabilities (HTML-authored windows)
  if (!minimizable && minBtn)   minBtn.style.display   = 'none';
  if (!maximizable && maxBtn)   maxBtn.style.display   = 'none';
  if (!closable    && closeBtn) closeBtn.style.display = 'none';

  // Cascade initial position
  const x = CASCADE_START_X + _cascade * CASCADE_STEP;
  const y = CASCADE_START_Y + _cascade * CASCADE_STEP;
  _cascade++;

  const startHidden = win.dataset.startHidden === 'true';

  win.style.left       = x + 'px';
  win.style.top        = y + 'px';
  win.style.visibility = startHidden ? 'hidden' : 'visible';

  const state = {
    x, y,
    isHidden:    startHidden,
    isMinimized: false,
    isMaximized: false,
    animating:   false,
    prevState:   null,
    resizable,
    maximizable,
    minimizable,
    closable,
    maxBtn,
    taskBtn:     null,
  };
  registry.set(win, state);

  // ── Taskbar button ───────────────────────────────────────────────────────────
  if (_taskbarTasks) {
    const label   = win.querySelector('.title-bar-text')?.textContent?.trim() || 'Window';
    const taskBtn = document.createElement('button');
    taskBtn.className   = 'taskbar-task-btn';
    taskBtn.textContent = label;
    taskBtn.setAttribute('aria-pressed', 'false');
    if (startHidden) taskBtn.style.display = 'none';
    taskBtn.addEventListener('click', () => {
      const s = registry.get(win);
      if (!s || s.isHidden) return;
      if (s.isMinimized) {
        _restoreFromMin(win);
        _focus(win);
      } else {
        // Win98: clicking the active window’s button minimizes it; otherwise bring to front
        const tb = win.querySelector('.title-bar');
        if (tb && !tb.classList.contains('inactive')) {
          _minimize(win);
        } else {
          raiseWindow(win);
        }
      }
    });
    _taskbarTasks.appendChild(taskBtn);
    state.taskBtn = taskBtn;
  }

  // ── Focus on any mousedown ────────────────────────────────────────────────
  win.addEventListener('mousedown', () => _focus(win));

  // ── Title-bar drag + double-click maximize ────────────────────────────────
  const titleBar = win.querySelector('.title-bar');
  if (titleBar) {
    titleBar.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('.title-bar-controls')) return;
      e.preventDefault(); // prevent browser text-selection from swallowing mouseup
      const s = registry.get(win);
      if (s.isMinimized || s.animating) return;
      if (s.isMaximized) _startDragFromMaximized(win, e);
      else               _startDrag(win, e);
    });

    titleBar.addEventListener('dblclick', e => {
      e.preventDefault(); // prevent text selection on the title-bar text
      if (e.target.closest('.title-bar-controls')) return;
      // Cancel any drag that was started by the second mousedown of the dblclick
      if (win._cancelDrag) { win._cancelDrag(); }
      const s = registry.get(win);
      if (!s.maximizable || s.animating) return;
      if (s.isMaximized) _restoreFromMax(win);
      else _maximize(win);
    });
  }

  // ── Resize handles ────────────────────────────────────────────────────────
  if (resizable) _addResizeHandles(win);

  // ── Title-bar control buttons ─────────────────────────────────────────────
  if (minBtn) {
    minBtn.addEventListener('mousedown', e => e.stopPropagation());
    minBtn.addEventListener('click', e => {
      e.stopPropagation();
      const s = registry.get(win);
      if (!s.minimizable || s.animating) return;
      if (s.isMinimized) { _restore(win); _focus(win); }
      else { _focus(win); _minimize(win); }
    });
  }

  if (maxBtn) {
    maxBtn.addEventListener('mousedown', e => e.stopPropagation());
    maxBtn.addEventListener('click', e => {
      e.stopPropagation();
      const s = registry.get(win);
      if (!s.maximizable || s.animating) return;
      _focus(win);
      if (s.isMaximized) _restoreFromMax(win);
      else _maximize(win);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('mousedown', e => e.stopPropagation());
    closeBtn.addEventListener('click', e => {
      e.stopPropagation();
      const s = registry.get(win);
      if (!s.closable) return;
      if (win.dataset.startHidden === 'true') {
        // App windows hide rather than close so they can be reopened
        if (s.isMinimized) {
          s.isMinimized = false;
          win.classList.remove('minimized');
        }
        if (s.isMaximized) s.isMaximized = false;
        s.isHidden = true;
        win.style.visibility = 'hidden';
        // Mark title bar inactive and hide taskbar button
        const tb = win.querySelector('.title-bar');
        if (tb) tb.classList.add('inactive');
        if (s.taskBtn) s.taskBtn.style.display = 'none';
      } else {
        if (s.taskBtn) s.taskBtn.remove();
        registry.delete(win);
        win.remove();
      }
    });
  }

  _focus(win);
}

// ─── Focus ────────────────────────────────────────────────────────────────────

function _focus(win) {
  win.style.zIndex = ++zTop;
  // Toggle inactive title bar styling and taskbar button pressed state
  registry.forEach((s, w) => {
    const tb      = w.querySelector('.title-bar');
    const focused = w === win;
    if (tb) tb.classList.toggle('inactive', !focused);
    if (s.taskBtn) s.taskBtn.setAttribute('aria-pressed', focused ? 'true' : 'false');
  });
  // Notify desktop so it can deselect icons
  if (_viewport) _viewport.dispatchEvent(new CustomEvent('wm:focus'));
}

// ─── Drag from maximized (restore-then-drag) ─────────────────────────────────

/**
 * Dragging while maximized: on first mouse movement, instantly restore the
 * window to its pre-maximize size and pin the cursor at the same horizontal
 * fraction of the title bar. Subsequent movement uses the normal outline drag.
 */
function _startDragFromMaximized(win, e) {
  const s          = registry.get(win);
  const outline    = _getOutline();
  const mdX        = e.clientX;  // mousedown position
  const mdY        = e.clientY;
  const vpW        = _viewport.clientWidth;
  const titleBar   = win.querySelector('.title-bar');
  const titleBarH  = titleBar ? titleBar.offsetHeight : 18;

  // Horizontal fraction within the maximized (full-width) title bar
  const grabFrac     = mdX / vpW;
  // Vertical offset of cursor within the title bar (clamped to title bar height)
  const grabOffsetY  = Math.min(mdY, titleBarH - 2);

  let restored   = false;
  let startWinX, startWinY, firstMoveX, firstMoveY;

  function doRestore(moveX, moveY) {
    const restoreW = s.prevState.width;
    const restoreH = s.prevState.height;

    // Position so cursor lands at the same fractional x, same y offset in title bar
    let newX = moveX - grabFrac * restoreW;
    let newY = moveY - grabOffsetY;
    // Keep at least 40px of title bar visible inside the viewport
    newX = Math.max(-(restoreW - 40), newX);
    newY = Math.max(0, newY);

    s.isMaximized = false;
    if (s.maxBtn) s.maxBtn.setAttribute('aria-label', 'Maximize');

    win.style.transition = '';
    win.classList.remove('wm-transitioning');
    win.style.left   = newX + 'px';
    win.style.top    = newY + 'px';
    win.style.width  = restoreW + 'px';
    win.style.height = restoreH + 'px';
    s.x = newX;
    s.y = newY;

    startWinX  = newX;
    startWinY  = newY;
    firstMoveX = moveX;
    firstMoveY = moveY;
  }

  function onMove(e) {
    if (!restored) {
      restored = true;
      doRestore(e.clientX, e.clientY);
      outline.style.left    = startWinX + 'px';
      outline.style.top     = startWinY + 'px';
      outline.style.width   = win.offsetWidth  + 'px';
      outline.style.height  = win.offsetHeight + 'px';
      outline.style.display = 'block';
      return;
    }
    outline.style.left = (startWinX + e.clientX - firstMoveX) + 'px';
    outline.style.top  = (startWinY + e.clientY - firstMoveY) + 'px';
  }

  function cancel() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    outline.style.display = 'none';
    win._cancelDrag = null;
  }

  function onUp(e) {
    cancel();
    if (!restored) return; // click without drag — leave window maximized, do nothing
    const newX = startWinX + e.clientX - firstMoveX;
    const newY = startWinY + e.clientY - firstMoveY;
    win.style.left = newX + 'px';
    win.style.top  = newY + 'px';
    const st = registry.get(win);
    if (st) { st.x = newX; st.y = newY; }
  }

  win._cancelDrag = cancel;
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ─── Drag (outline + teleport) ────────────────────────────────────────────────

function _startDrag(win, e) {
  const outline     = _getOutline();
  const startMouseX = e.clientX;
  const startMouseY = e.clientY;
  const startWinX   = win.offsetLeft;
  const startWinY   = win.offsetTop;
  let   dragging    = false; // outline hidden until first actual movement

  outline.style.left   = startWinX + 'px';
  outline.style.top    = startWinY + 'px';
  outline.style.width  = win.offsetWidth  + 'px';
  outline.style.height = win.offsetHeight + 'px';
  // NOTE: display stays 'none' until first mousemove

  function onMove(e) {
    if (!dragging) {
      dragging = true;
      outline.style.display = 'block';
    }
    outline.style.left = (startWinX + e.clientX - startMouseX) + 'px';
    outline.style.top  = (startWinY + e.clientY - startMouseY) + 'px';
  }

  function cancel() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    outline.style.display = 'none';
    win._cancelDrag = null;
  }

  function onUp(e) {
    cancel();
    const newX = startWinX + e.clientX - startMouseX;
    const newY = startWinY + e.clientY - startMouseY;
    win.style.left = newX + 'px';
    win.style.top  = newY + 'px';
    const s = registry.get(win);
    if (s) { s.x = newX; s.y = newY; }
  }

  win._cancelDrag = cancel;
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ─── Resize handles (outline + teleport) ─────────────────────────────────────

function _addResizeHandles(win) {
  for (const dir of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    const h = document.createElement('div');
    h.className   = 'wm-resize-handle';
    h.dataset.dir = dir;
    win.appendChild(h);
    h.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      const s = registry.get(win);
      if (!s || s.isMinimized || s.isMaximized || s.animating) return;
      _startResize(win, dir, e);
    });
  }
}

function _calcBounds(dir, startLeft, startTop, startW, startH, dx, dy) {
  let l = startLeft, t = startTop, w = startW, h = startH;
  if (dir.includes('e')) { w = Math.max(MIN_WIN_W, startW + dx); }
  if (dir.includes('s')) { h = Math.max(MIN_WIN_H, startH + dy); }
  if (dir.includes('w')) { w = Math.max(MIN_WIN_W, startW - dx); l = startLeft + (startW - w); }
  if (dir.includes('n')) { h = Math.max(MIN_WIN_H, startH - dy); t = startTop  + (startH - h); }
  return { l, t, w, h };
}

function _startResize(win, dir, e) {
  const outline     = _getOutline();
  const startMouseX = e.clientX;
  const startMouseY = e.clientY;
  const startLeft   = win.offsetLeft;
  const startTop    = win.offsetTop;
  const startW      = win.offsetWidth;
  const startH      = win.offsetHeight;

  outline.style.left    = startLeft + 'px';
  outline.style.top     = startTop  + 'px';
  outline.style.width   = startW    + 'px';
  outline.style.height  = startH    + 'px';
  outline.style.display = 'block';

  function onMove(e) {
    const { l, t, w, h } = _calcBounds(dir, startLeft, startTop, startW, startH,
      e.clientX - startMouseX, e.clientY - startMouseY);
    outline.style.left   = l + 'px';
    outline.style.top    = t + 'px';
    outline.style.width  = w + 'px';
    outline.style.height = h + 'px';
  }

  function onUp(e) {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    outline.style.display = 'none';

    const { l, t, w, h } = _calcBounds(dir, startLeft, startTop, startW, startH,
      e.clientX - startMouseX, e.clientY - startMouseY);
    win.style.left   = l + 'px';
    win.style.top    = t + 'px';
    win.style.width  = w + 'px';
    win.style.height = h + 'px';

    const s = registry.get(win);
    if (s) { s.x = l; s.y = t; }
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ─── Minimize ─────────────────────────────────────────────────────────────────

/** Convert a taskbar button's bounding rect to viewport-relative coordinates. */
function _btnToViewportRect(btn) {
  const vr = _viewport.getBoundingClientRect();
  const br = btn.getBoundingClientRect();
  return { x: br.left - vr.left, y: br.top - vr.top, w: br.width, h: br.height };
}

function _minimize(win) {
  const s = registry.get(win);
  if (!s || s.isMinimized || s.animating) return;

  // Save state for restore
  if (s.isMaximized && s.prevState) {
    s.prevState = {
      x:           s.prevState.x,
      y:           s.prevState.y,
      width:       s.prevState.width,
      height:      s.prevState.height,
      isMaximized: true,
    };
  } else {
    s.prevState = {
      x:           win.offsetLeft,
      y:           win.offsetTop,
      width:       win.offsetWidth,
      height:      win.offsetHeight,
      isMaximized: false,
    };
  }

  if (s.isMaximized) {
    s.isMaximized = false;
    if (s.maxBtn) s.maxBtn.setAttribute('aria-label', 'Maximize');
  }

  // Measure target: taskbar button position in viewport coordinates
  const target = s.taskBtn
    ? _btnToViewportRect(s.taskBtn)
    : { x: 0, y: _viewport.clientHeight - 22, w: MINIMIZED_SLOT_W, h: 22 };

  // Immediately hide all non-title-bar children
  Array.from(win.children).forEach(child => {
    if (!child.classList.contains('title-bar') &&
        !child.classList.contains('wm-resize-handle')) {
      child.style.display = 'none';
    }
  });

  // Stamp current geometry as explicit px ("from" state), flush
  win.style.width  = s.prevState.width  + 'px';
  win.style.height = s.prevState.height + 'px';
  win.style.left   = s.prevState.x      + 'px';
  win.style.top    = s.prevState.y      + 'px';
  win.getBoundingClientRect();

  s.isMinimized = true;
  s.animating   = true;
  win.classList.add('minimized', 'wm-transitioning');

  win.style.transition = `left   ${MINIMIZE_ANIM_MS}ms linear,
                          top    ${MINIMIZE_ANIM_MS}ms linear,
                          width  ${MINIMIZE_ANIM_MS}ms linear,
                          height ${MINIMIZE_ANIM_MS}ms linear`;
  win.style.left   = target.x + 'px';
  win.style.top    = target.y + 'px';
  win.style.width  = target.w + 'px';
  win.style.height = target.h + 'px';

  setTimeout(() => {
    win.style.transition = '';
    win.classList.remove('wm-transitioning');
    win.style.visibility = 'hidden';  // window disappears — taskbar button remains
    s.animating = false;
    // Deactivate: remove focus from this window now it is hidden
    const tb = win.querySelector('.title-bar');
    if (tb) tb.classList.add('inactive');
    if (s.taskBtn) s.taskBtn.setAttribute('aria-pressed', 'false');
  }, MINIMIZE_ANIM_MS + 20);
}

// ─── Maximize ─────────────────────────────────────────────────────────────────

function _maximize(win) {
  const s = registry.get(win);
  if (!s || s.isMaximized || s.isMinimized || s.animating) return;

  s.prevState = {
    x:           win.offsetLeft,
    y:           win.offsetTop,
    width:       win.offsetWidth,
    height:      win.offsetHeight,
    isMaximized: false,
  };

  // Hide content + strip chrome immediately — only title bar gradient visible
  Array.from(win.children).forEach(child => {
    if (!child.classList.contains('title-bar') &&
        !child.classList.contains('wm-resize-handle')) {
      child.style.display = 'none';
    }
  });
  win.classList.add('wm-transitioning');

  // Stamp current geometry as explicit px ("from" state), flush
  win.style.left   = s.prevState.x      + 'px';
  win.style.top    = s.prevState.y      + 'px';
  win.style.width  = s.prevState.width  + 'px';
  win.style.height = s.prevState.height + 'px';
  win.getBoundingClientRect();

  s.isMaximized = true;
  s.animating   = true;
  if (s.maxBtn) s.maxBtn.setAttribute('aria-label', 'Restore');

  win.style.transition = `left   ${MINIMIZE_ANIM_MS}ms linear,
                          top    ${MINIMIZE_ANIM_MS}ms linear,
                          width  ${MINIMIZE_ANIM_MS}ms linear,
                          height ${MINIMIZE_ANIM_MS}ms linear`;
  win.style.left   = '0';
  win.style.top    = '0';
  win.style.width  = _viewport.clientWidth  + 'px';
  win.style.height = _viewport.clientHeight + 'px';

  setTimeout(() => {
    win.style.transition = '';
    win.classList.remove('wm-transitioning');
    s.animating = false;
    s.x = 0;
    s.y = 0;
    // Reveal content now that position is final
    Array.from(win.children).forEach(child => {
      if (!child.classList.contains('title-bar') &&
          !child.classList.contains('wm-resize-handle')) {
        child.style.display = '';
      }
    });
  }, MINIMIZE_ANIM_MS + 20);
}

// ─── Restore ──────────────────────────────────────────────────────────────────

function _restore(win) {
  const s = registry.get(win);
  if (!s || s.animating) return;
  if (s.isMaximized)  { _restoreFromMax(win); return; }
  if (s.isMinimized)  { _restoreFromMin(win); }
}

function _restoreFromMax(win) {
  const s = registry.get(win);
  if (!s || !s.isMaximized || s.animating) return;

  const prev = s.prevState;

  // Hide content + strip chrome immediately — only title bar gradient visible
  Array.from(win.children).forEach(child => {
    if (!child.classList.contains('title-bar') &&
        !child.classList.contains('wm-resize-handle')) {
      child.style.display = 'none';
    }
  });
  win.classList.add('wm-transitioning');

  // Stamp current (maximized) geometry as explicit px, flush
  win.style.left   = win.offsetLeft   + 'px';
  win.style.top    = win.offsetTop    + 'px';
  win.style.width  = win.offsetWidth  + 'px';
  win.style.height = win.offsetHeight + 'px';
  win.getBoundingClientRect();

  s.isMaximized = false;
  s.animating   = true;
  if (s.maxBtn) s.maxBtn.setAttribute('aria-label', 'Maximize');

  win.style.transition = `left   ${MINIMIZE_ANIM_MS}ms linear,
                          top    ${MINIMIZE_ANIM_MS}ms linear,
                          width  ${MINIMIZE_ANIM_MS}ms linear,
                          height ${MINIMIZE_ANIM_MS}ms linear`;
  win.style.left   = prev.x      + 'px';
  win.style.top    = prev.y      + 'px';
  win.style.width  = prev.width  + 'px';
  win.style.height = prev.height + 'px';

  setTimeout(() => {
    win.style.transition = '';
    win.classList.remove('wm-transitioning');
    s.animating = false;
    s.x = prev.x;
    s.y = prev.y;
    // Reveal content
    Array.from(win.children).forEach(child => {
      if (!child.classList.contains('title-bar') &&
          !child.classList.contains('wm-resize-handle')) {
        child.style.display = '';
      }
    });
  }, MINIMIZE_ANIM_MS + 20);
}

function _restoreFromMin(win) {
  const s    = registry.get(win);
  const prev = s.prevState;
  if (!prev || s.animating) return;

  // Re-measure button position at restore time (may differ from minimize time)
  const startPos = s.taskBtn
    ? _btnToViewportRect(s.taskBtn)
    : { x: 0, y: _viewport.clientHeight - 22, w: MINIMIZED_SLOT_W, h: 22 };

  const targetX = prev.isMaximized ? 0                      : prev.x;
  const targetY = prev.isMaximized ? 0                      : prev.y;
  const targetW = prev.isMaximized ? _viewport.clientWidth  : prev.width;
  const targetH = prev.isMaximized ? _viewport.clientHeight : prev.height;

  s.animating = true;
  win.classList.add('wm-transitioning');

  // Snap to button position then make visible (no transition yet)
  win.style.transition = '';
  win.style.left   = startPos.x + 'px';
  win.style.top    = startPos.y + 'px';
  win.style.width  = startPos.w + 'px';
  win.style.height = startPos.h + 'px';
  win.style.visibility = 'visible';
  win.getBoundingClientRect(); // flush

  win.style.transition = `left   ${MINIMIZE_ANIM_MS}ms linear,
                          top    ${MINIMIZE_ANIM_MS}ms linear,
                          width  ${MINIMIZE_ANIM_MS}ms linear,
                          height ${MINIMIZE_ANIM_MS}ms linear`;
  win.style.left   = targetX + 'px';
  win.style.top    = targetY + 'px';
  win.style.width  = targetW + 'px';
  win.style.height = targetH + 'px';

  setTimeout(() => {
    win.style.transition = '';
    win.classList.remove('wm-transitioning');
    s.animating   = false;
    s.isMinimized = false;
    win.classList.remove('minimized');

    // Reveal all non-title-bar children
    Array.from(win.children).forEach(child => {
      if (!child.classList.contains('title-bar') &&
          !child.classList.contains('wm-resize-handle')) {
        child.style.display = '';
      }
    });

    if (prev.isMaximized) {
      s.isMaximized = true;
      s.x = 0;
      s.y = 0;
      s.prevState = prev;
      if (s.maxBtn) s.maxBtn.setAttribute('aria-label', 'Restore');
    } else {
      s.x = prev.x;
      s.y = prev.y;
    }
  }, MINIMIZE_ANIM_MS + 20);
}

