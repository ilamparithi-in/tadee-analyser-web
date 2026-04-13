/**
 * windowManager.js — Win98-accurate window management
 *
 * Behavior rules:
 *   Drag:     outline only during drag; window teleports to final pos on mouseup
 *   Resize:   outline only during resize; window jumps to final size on mouseup
 *   Minimize: content hidden immediately; title bar (window frame) slides linearly
 *             to minimized slot; size is instant, only position animates
 *   Maximize: instant — no animation
 *   Restore:  instant — no animation
 *   Easing:   none anywhere; all motion is linear or instant
 *   Status bar: belongs to each window — NOT the viewport
 *
 * Usage:
 *   import { initWindowManager } from './ui/components/windowManager.js';
 *   initWindowManager(document.getElementById('viewport'));
 */

const MINIMIZED_WIDTH  = 160;  // px — minimized title bar width
const MINIMIZED_GAP    = 4;    // px — gap between minimized bars
const TITLE_BAR_H      = 26;   // px — 98.css title bar height
const CASCADE_STEP     = 28;   // px — cascade offset per window at init
const MINIMIZE_ANIM_MS = 150;  // ms — title bar slides to slot (linear, position only)
const MIN_WIN_W        = 120;  // px — minimum window width during resize
const MIN_WIN_H        = 60;   // px — minimum window height during resize

let zTop = 100;                // global z-index counter
const registry = new Map();   // Map<element, state>
let _cascade = 0;             // cascade counter — shared across init and addWindow

// ─── Shared outline element ───────────────────────────────────────────────────

let _outline = null;

function _getOutline(viewport) {
  if (!_outline) {
    _outline = document.createElement('div');
    _outline.id = 'wm-outline';
    viewport.appendChild(_outline);
  }
  return _outline;
}

function _showOutline(ol, x, y, w, h) {
  ol.style.display = 'block';
  ol.style.left    = x + 'px';
  ol.style.top     = y + 'px';
  ol.style.width   = w + 'px';
  ol.style.height  = h + 'px';
}

// ─── Public init ─────────────────────────────────────────────────────────────

export function initWindowManager(viewportEl) {
  _cascade = 0;
  viewportEl.querySelectorAll(':scope > .window').forEach(win => {
    if (!win.querySelector('.title-bar-controls')) return;
    const x = CASCADE_STEP + _cascade * CASCADE_STEP;
    const y = CASCADE_STEP + _cascade * CASCADE_STEP;
    _cascade++;
    _register(win, viewportEl, x, y);
  });
}

// ─── Programmatic window addition ────────────────────────────────────────────
// Append win to viewport and register it with cascaded initial position.
// Call after createWindow() to make the window live.
export function addWindow(win, viewportEl) {
  viewportEl.appendChild(win);
  const x = CASCADE_STEP + _cascade * CASCADE_STEP;
  const y = CASCADE_STEP + _cascade * CASCADE_STEP;
  _cascade++;
  _register(win, viewportEl, x, y);
  return win;
}

// ─── Registration ────────────────────────────────────────────────────────────

function _register(win, viewport, x, y) {
  // Read capability flags (data-* attributes set by createWindow or HTML author)
  const resizable   = win.dataset.resizable   !== 'false';
  const maximizable = win.dataset.maximizable !== 'false';
  const minimizable = win.dataset.minimizable !== 'false';
  const closable    = win.dataset.closable    !== 'false';

  // For HTML-authored windows: hide buttons that are flagged off
  const controls = win.querySelector('.title-bar-controls');
  if (controls) {
    if (!minimizable) { const b = controls.querySelector('[aria-label="Minimize"]'); if (b) b.style.display = 'none'; }
    if (!maximizable) { const b = controls.querySelector('[aria-label="Maximize"]'); if (b) b.style.display = 'none'; }
    if (!closable)    { const b = controls.querySelector('[aria-label="Close"]');    if (b) b.style.display = 'none'; }
  }

  win.style.width      = win.offsetWidth + 'px';
  win.style.left       = x + 'px';
  win.style.top        = y + 'px';
  win.style.zIndex     = ++zTop;
  win.style.visibility = 'visible';

  const state = {
    x, y,
    isMinimized: false,
    isMaximized: false,
    animating:   false,
    prevState:   null,
    resizable, maximizable, minimizable, closable,
    maxBtn: maximizable ? win.querySelector('.title-bar-controls [aria-label="Maximize"]') : null,
  };

  registry.set(win, state);

  win.addEventListener('mousedown', () => _focus(win));

  const titleBar = win.querySelector('.title-bar');
  titleBar.addEventListener('mousedown', e => {
    if (e.target.closest('.title-bar-controls')) return;
    if (state.animating) return;
    if (state.isMinimized) { _restore(win, state, viewport); return; }
    if (state.isMaximized) return;
    _startDrag(e, win, state, viewport);
  });

  if (minimizable) {
    const minBtn = win.querySelector('.title-bar-controls [aria-label="Minimize"]');
    if (minBtn) {
      minBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (state.animating) return;
        if (state.isMinimized) _restore(win, state, viewport);
        else                   _minimize(win, state, viewport);
      });
    }
  }

  if (state.maxBtn) {
    state.maxBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (state.animating) return;
      if (state.isMaximized) _restore(win, state, viewport);
      else                   _maximize(win, state, viewport);
    });
  }

  if (closable) {
    const closeBtn = win.querySelector('.title-bar-controls [aria-label="Close"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', e => {
        e.stopPropagation();
        registry.delete(win);
        _relayoutMinimized(viewport);
        win.remove();
      });
    }
  }

  if (resizable) _addResizeHandles(win, state, viewport);
}

// ─── Focus (z-order) ─────────────────────────────────────────────────────────

function _focus(win) {
  win.style.zIndex = ++zTop;
}

// ─── Drag — outline only, teleport on release ────────────────────────────────

function _startDrag(e, win, state, viewport) {
  e.preventDefault();
  const ol      = _getOutline(viewport);
  const winW    = win.offsetWidth;
  const winH    = win.offsetHeight;
  const originX = e.clientX - state.x;
  const originY = e.clientY - state.y;
  let ox = state.x, oy = state.y;

  _showOutline(ol, state.x, state.y, winW, winH);

  function onMove(ev) {
    ox = ev.clientX - originX;
    oy = ev.clientY - originY;
    ol.style.left = ox + 'px';
    ol.style.top  = oy + 'px';
  }

  function onUp() {
    ol.style.display = 'none';
    state.x = ox;
    state.y = oy;
    win.style.left = ox + 'px';
    win.style.top  = oy + 'px';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ─── Resize handles ──────────────────────────────────────────────────────────

const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

function _addResizeHandles(win, state, viewport) {
  RESIZE_DIRS.forEach(dir => {
    const handle = document.createElement('div');
    handle.className  = 'wm-resize-handle';
    handle.dataset.dir = dir;
    win.appendChild(handle);
    handle.addEventListener('mousedown', e => {
      if (state.isMinimized || state.isMaximized || state.animating) return;
      e.preventDefault();
      e.stopPropagation();
      _startResize(e, win, state, viewport, dir);
    });
  });
}

function _startResize(e, win, state, viewport, dir) {
  const ol         = _getOutline(viewport);
  const startX     = e.clientX;
  const startY     = e.clientY;
  const startW     = win.offsetWidth;
  const startH     = win.offsetHeight;
  const startLeft  = state.x;
  const startTop   = state.y;
  let ox = startLeft, oy = startTop, ow = startW, oh = startH;

  _showOutline(ol, startLeft, startTop, startW, startH);

  function onMove(ev) {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    let nx = startLeft, ny = startTop, nw = startW, nh = startH;

    if (dir.includes('e')) nw = Math.max(MIN_WIN_W, startW + dx);
    if (dir.includes('s')) nh = Math.max(MIN_WIN_H, startH + dy);
    if (dir.includes('w')) { nw = Math.max(MIN_WIN_W, startW - dx); nx = startLeft + (startW - nw); }
    if (dir.includes('n')) { nh = Math.max(MIN_WIN_H, startH - dy); ny = startTop  + (startH - nh); }

    ox = nx; oy = ny; ow = nw; oh = nh;
    _showOutline(ol, nx, ny, nw, nh);
  }

  function onUp() {
    ol.style.display = 'none';
    state.x = ox;
    state.y = oy;
    win.style.left   = ox + 'px';
    win.style.top    = oy + 'px';
    win.style.width  = ow + 'px';
    win.style.height = oh + 'px';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// All non-title-bar, non-resize-handle children (menu, toolbar, body, status bar…)
function _nonTitleChildren(win) {
  return Array.from(win.children).filter(c =>
    !c.classList.contains('title-bar') &&
    !c.classList.contains('wm-resize-handle')
  );
}

// ─── Minimize ────────────────────────────────────────────────────────────────

function _minimize(win, state, viewport) {
  let count = 0;
  registry.forEach(s => { if (s.isMinimized) count++; });

  state.prevState = {
    x: state.x, y: state.y,
    width:  win.offsetWidth,
    height: win.offsetHeight,
    isMaximized: state.isMaximized,
  };

  state.isMinimized = true;
  state.isMaximized = false;
  if (state.maxBtn) state.maxBtn.setAttribute('aria-label', 'Maximize');
  win.classList.add('minimized');

  // Hide content IMMEDIATELY — title bar is all that remains
  _nonTitleChildren(win).forEach(c => { c.style.display = 'none'; });

  // Set explicit current size so the browser has a "from" value to animate from
  win.style.transition = '';
  win.style.width  = win.offsetWidth  + 'px';
  win.style.height = win.offsetHeight + 'px';

  const toX = count * (MINIMIZED_WIDTH + MINIMIZED_GAP);
  const toY = viewport.clientHeight - TITLE_BAR_H - 2;

  // Force layout flush so browser sees the current position/size as the "from" state
  void win.offsetWidth;

  // Animate position AND size — linear, no easing
  win.style.transition = `left ${MINIMIZE_ANIM_MS}ms linear, top ${MINIMIZE_ANIM_MS}ms linear, width ${MINIMIZE_ANIM_MS}ms linear, height ${MINIMIZE_ANIM_MS}ms linear`;
  state.animating = true;
  state.x = toX;
  state.y = toY;
  win.style.left   = toX + 'px';
  win.style.top    = toY + 'px';
  win.style.width  = MINIMIZED_WIDTH + 'px';
  win.style.height = TITLE_BAR_H + 'px';

  setTimeout(() => {
    win.style.transition = '';
    state.animating = false;
  }, MINIMIZE_ANIM_MS + 20);
}

// ─── Maximize — instant ───────────────────────────────────────────────────────

function _maximize(win, state, viewport) {
  state.prevState = {
    x: state.x, y: state.y,
    width:  win.offsetWidth,
    height: win.offsetHeight,
    isMaximized: false,
  };

  state.isMaximized = true;
  state.x = 0;
  state.y = 0;

  win.style.transition = '';
  win.style.left   = '0';
  win.style.top    = '0';
  win.style.width  = viewport.clientWidth  + 'px';
  win.style.height = viewport.clientHeight + 'px';

  if (state.maxBtn) state.maxBtn.setAttribute('aria-label', 'Restore');
  _focus(win);
}

// ─── Restore — instant ────────────────────────────────────────────────────────

function _restore(win, state, viewport) {
  if (!state.prevState) return;
  const prev = state.prevState;
  const wasMinimized = state.isMinimized;

  state.isMinimized = false;
  state.isMaximized = prev.isMaximized || false;
  state.prevState   = null;

  if (wasMinimized) {
    win.classList.remove('minimized');
    // Keep children hidden until animation completes
    _nonTitleChildren(win).forEach(c => { c.style.display = 'none'; });

    // Stamp current minimized size as explicit "from" values
    win.style.transition = '';
    win.style.width  = MINIMIZED_WIDTH + 'px';
    win.style.height = TITLE_BAR_H + 'px';

    // Force layout flush
    void win.offsetWidth;

    // Animate position + size back to restored values — reverse of minimize
    state.animating = true;
    win.style.transition = `left ${MINIMIZE_ANIM_MS}ms linear, top ${MINIMIZE_ANIM_MS}ms linear, width ${MINIMIZE_ANIM_MS}ms linear, height ${MINIMIZE_ANIM_MS}ms linear`;
    state.x = prev.x;
    state.y = prev.y;
    win.style.left   = prev.x      + 'px';
    win.style.top    = prev.y      + 'px';
    win.style.width  = prev.width  + 'px';
    win.style.height = prev.height + 'px';

    if (state.maxBtn) {
      state.maxBtn.setAttribute('aria-label', state.isMaximized ? 'Restore' : 'Maximize');
    }

    setTimeout(() => {
      win.style.transition = '';
      _nonTitleChildren(win).forEach(c => { c.style.display = ''; });
      state.animating = false;
      _relayoutMinimized(viewport);
      _focus(win);
    }, MINIMIZE_ANIM_MS + 20);

    return;
  }

  win.style.transition = '';
  state.x = prev.x;
  state.y = prev.y;
  win.style.left   = prev.x      + 'px';
  win.style.top    = prev.y      + 'px';
  win.style.width  = prev.width  + 'px';
  win.style.height = prev.height + 'px';

  if (state.maxBtn) {
    state.maxBtn.setAttribute('aria-label', state.isMaximized ? 'Restore' : 'Maximize');
  }

  _focus(win);
}

// ─── Minimized slot layout ────────────────────────────────────────────────────

function _relayoutMinimized(viewport) {
  const y = viewport.clientHeight - TITLE_BAR_H - 2;
  let count = 0;
  registry.forEach((s, w) => {
    if (!s.isMinimized) return;
    const x = count * (MINIMIZED_WIDTH + MINIMIZED_GAP);
    s.x = x;
    s.y = y;
    w.style.left = x + 'px';
    w.style.top  = y + 'px';
    count++;
  });
}
