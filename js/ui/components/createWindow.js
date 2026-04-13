/**
 * createWindow.js — programmatic window factory.
 *
 * createWindow(opts)  → returns a .window HTMLElement (not yet in DOM)
 * openWindow(opts, viewport) → creates, registers with WM, returns element
 */

import { addWindow } from './windowManager.js';

const DEFAULTS = {
  title:       'Window',
  width:       300,
  height:      200,
  resizable:   true,
  maximizable: true,
  minimizable: true,
  closable:    true,
  /** @type {string|HTMLElement} innerHTML string or element to place in window-body */
  content:     '',
};

/**
 * Build and return a .window element (not appended to the DOM).
 * @param {Partial<typeof DEFAULTS>} opts
 * @returns {HTMLElement}
 */
export function createWindow(opts = {}) {
  const o = { ...DEFAULTS, ...opts };

  const win = document.createElement('div');
  win.className = 'window';
  win.style.width      = o.width  + 'px';
  win.style.height     = o.height + 'px';
  win.style.boxSizing  = 'border-box';

  if (!o.resizable)   win.dataset.resizable   = 'false';
  if (!o.maximizable) win.dataset.maximizable  = 'false';
  if (!o.minimizable) win.dataset.minimizable  = 'false';
  if (!o.closable)    win.dataset.closable     = 'false';

  // ── Title bar ──────────────────────────────────────────────────────────────
  const titleBar = document.createElement('div');
  titleBar.className = 'title-bar';

  const titleText = document.createElement('div');
  titleText.className   = 'title-bar-text';
  titleText.textContent = o.title;
  titleBar.appendChild(titleText);

  const controls = document.createElement('div');
  controls.className = 'title-bar-controls';

  if (o.minimizable) {
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Minimize');
    controls.appendChild(btn);
  }
  if (o.maximizable) {
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Maximize');
    controls.appendChild(btn);
  }
  if (o.closable) {
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Close');
    controls.appendChild(btn);
  }

  titleBar.appendChild(controls);
  win.appendChild(titleBar);

  // ── Window body ────────────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'window-body';

  if (typeof o.content === 'string') {
    body.innerHTML = o.content;
  } else if (o.content instanceof HTMLElement) {
    body.appendChild(o.content);
  }

  win.appendChild(body);

  return win;
}

/**
 * Create a window and register it with the window manager.
 * @param {Partial<typeof DEFAULTS>} opts
 * @param {HTMLElement} viewport
 * @returns {HTMLElement} the window element
 */
export function openWindow(opts, viewport) {
  const win = createWindow(opts);
  addWindow(win, viewport);
  return win;
}
