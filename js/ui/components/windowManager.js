/**
 * windowManager.js
 *
 * Handles per-window: drag, z-index focus, minimize, maximize, restore.
 * Operates on direct .window children of a viewport container element.
 *
 * Animation model: bounding-box interpolation via CSS transition.
 *   1. Read current rendered box (offsetWidth/Height + state.x/y).
 *   2. Set explicit pixel values (force layout).
 *   3. Add CSS transition.
 *   4. Set final pixel values → browser transitions between them.
 *   5. After transition, clear transition property.
 * Content is NEVER hidden during animation — window clips via overflow:hidden (CSS).
 *
 * Usage:
 *   import { initWindowManager } from './ui/components/windowManager.js';
 *   initWindowManager(document.getElementById('viewport'));
 */

const MINIMIZED_WIDTH = 160;  // px width of a collapsed (minimized) window bar
const MINIMIZED_GAP   = 4;    // px gap between minimized bars
const TITLE_BAR_H     = 26;   // 98.css title bar height (px)
const CASCADE_STEP    = 28;   // px cascade offset per window
const ANIM_DURATION   = 150;  // ms — fast, mechanical (Win98 feel)

let zTop = 100;                // global z-index counter; starts above all library values
const registry = new Map();   // Map<element, state>

/**
 * Register all direct .window children of viewportEl that have title-bar-controls.
 * @param {HTMLElement} viewportEl
 */
export function initWindowManager(viewportEl) {
  let cascade = 0;
  viewportEl.querySelectorAll(':scope > .window').forEach(win => {
    if (!win.querySelector('.title-bar-controls')) return;
    const x = CASCADE_STEP + cascade * CASCADE_STEP;
    const y = CASCADE_STEP + cascade * CASCADE_STEP;
    cascade++;
    _register(win, viewportEl, x, y);
  });
}

// ─── Registration ────────────────────────────────────────────────────────────

function _register(win, viewport, x, y) {
  // Ensure explicit pixel width so animation has a numeric start value
  win.style.width      = win.offsetWidth + 'px';
  win.style.left       = x + 'px';
  win.style.top        = y + 'px';
  win.style.zIndex     = ++zTop;
  win.style.visibility = 'visible'; // reveal after positioning (CSS hides initially)

  const state = {
    x,
    y,
    isMinimized: false,
    isMaximized: false,
    animating:   false,
    prevState:   null,
    maxBtn: win.querySelector('.title-bar-controls [aria-label="Maximize"]'),
  };

  registry.set(win, state);

  // Bring to front on any interaction
  win.addEventListener('mousedown', () => _focus(win));

  // Title bar: drag or restore-from-minimized
  const titleBar = win.querySelector('.title-bar');
  titleBar.addEventListener('mousedown', e => {
    if (e.target.closest('.title-bar-controls')) return;
    if (state.animating) return;
    if (state.isMinimized) { _restore(win, state, viewport); return; }
    if (state.isMaximized) return; // maximized windows are not draggable
    _startDrag(e, win, state);
  });

  // Minimize button
  const minBtn = win.querySelector('.title-bar-controls [aria-label="Minimize"]');
  if (minBtn) {
    minBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (state.animating) return;
      if (state.isMinimized) _restore(win, state, viewport);
      else                   _minimize(win, state, viewport);
    });
  }

  // Maximize / Restore toggle
  if (state.maxBtn) {
    state.maxBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (state.animating) return;
      if (state.isMaximized) _restore(win, state, viewport);
      else                   _maximize(win, state, viewport);
    });
  }
}

// ─── Focus (z-order) ─────────────────────────────────────────────────────────

function _focus(win) {
  win.style.zIndex = ++zTop;
}

// ─── Drag ────────────────────────────────────────────────────────────────────

function _startDrag(e, win, state) {
  e.preventDefault();
  const originX = e.clientX - state.x;
  const originY = e.clientY - state.y;

  function onMove(ev) {
    state.x = ev.clientX - originX;
    state.y = ev.clientY - originY;
    win.style.left = state.x + 'px';
    win.style.top  = state.y + 'px';
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ─── Animation ───────────────────────────────────────────────────────────────

/**
 * Animate the ENTIRE window (position + size) from its current rendered box
 * to toBox, using a CSS transition. Content is never hidden; window clips via
 * overflow:hidden set in CSS.
 *
 * @param {{ left, top, width, height }} toBox  — target values in px
 * @param {Function} onComplete
 */
function _animateTo(win, state, toBox, onComplete) {
  // Capture actual current rendered dimensions
  const fromBox = {
    left:   state.x,
    top:    state.y,
    width:  win.offsetWidth,
    height: win.offsetHeight,
  };

  // Set explicit "from" pixel values so the browser has a numeric start point
  win.style.left   = fromBox.left   + 'px';
  win.style.top    = fromBox.top    + 'px';
  win.style.width  = fromBox.width  + 'px';
  win.style.height = fromBox.height + 'px';

  // Force layout flush so the browser registers the "from" state before adding transition
  void win.offsetWidth;

  win.style.transition =
    `left ${ANIM_DURATION}ms linear, top ${ANIM_DURATION}ms linear, ` +
    `width ${ANIM_DURATION}ms linear, height ${ANIM_DURATION}ms linear`;

  // Update state to match the target
  state.x = toBox.left;
  state.y = toBox.top;
  state.animating = true;

  // Trigger animation by applying final values
  win.style.left   = toBox.left   + 'px';
  win.style.top    = toBox.top    + 'px';
  win.style.width  = toBox.width  + 'px';
  win.style.height = toBox.height + 'px';

  setTimeout(() => {
    win.style.transition = '';
    state.animating = false;
    onComplete();
  }, ANIM_DURATION + 20);
}

// ─── Minimize ────────────────────────────────────────────────────────────────

function _minimize(win, state, viewport) {
  let count = 0;
  registry.forEach(s => { if (s.isMinimized) count++; });

  state.prevState = {
    x:           state.x,
    y:           state.y,
    width:       win.offsetWidth,
    height:      win.offsetHeight,
    isMaximized: state.isMaximized,
  };

  state.isMinimized = true;
  state.isMaximized = false;
  if (state.maxBtn) state.maxBtn.setAttribute('aria-label', 'Maximize');

  // Add .minimized class for title-text ellipsis (CSS rule)
  win.classList.add('minimized');

  const toX = count * (MINIMIZED_WIDTH + MINIMIZED_GAP);
  const toY = viewport.clientHeight - TITLE_BAR_H - 2;

  _animateTo(win, state, { left: toX, top: toY, width: MINIMIZED_WIDTH, height: TITLE_BAR_H }, () => {
    // Lock to title-bar height after animation; overflow:hidden clips the content
    win.style.height = TITLE_BAR_H + 'px';
  });
}

// ─── Maximize ────────────────────────────────────────────────────────────────

function _maximize(win, state, viewport) {
  state.prevState = {
    x:           state.x,
    y:           state.y,
    width:       win.offsetWidth,
    height:      win.offsetHeight,
    isMaximized: false,
  };

  state.isMaximized = true;
  if (state.maxBtn) state.maxBtn.setAttribute('aria-label', 'Restore');
  _focus(win);

  _animateTo(win, state, {
    left:   0,
    top:    0,
    width:  viewport.clientWidth,
    height: viewport.clientHeight,   // viewport is flex:1, already excludes status bar
  }, () => {});
}

// ─── Restore ─────────────────────────────────────────────────────────────────

function _restore(win, state, viewport) {
  if (!state.prevState) return;
  const prev = state.prevState;

  const wasMinimized  = state.isMinimized;
  state.isMinimized   = false;
  state.isMaximized   = prev.isMaximized || false;
  state.prevState     = null;

  if (wasMinimized) win.classList.remove('minimized');

  if (state.maxBtn) {
    state.maxBtn.setAttribute('aria-label', state.isMaximized ? 'Restore' : 'Maximize');
  }

  _animateTo(win, state, {
    left:   prev.x,
    top:    prev.y,
    width:  prev.width,
    height: prev.height,
  }, () => {
    if (wasMinimized) _relayoutMinimized(viewport);
    _focus(win);
  });
}

// ─── Minimized layout ────────────────────────────────────────────────────────

/**
 * Re-assigns horizontal positions to all currently-minimized windows so there
 * are no gaps after one is restored.
 */
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
