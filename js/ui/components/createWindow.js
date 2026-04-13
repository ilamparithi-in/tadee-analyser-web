/**
 * createWindow.js — programmatic Win98 window factory
 *
 * createWindow(options) → .window Element (not yet in DOM)
 * openWindow(options, viewportEl) → creates + registers + returns the window
 *
 * Options:
 *   title        {string}          Title bar text                  (default: 'Window')
 *   width        {number}          Initial width in px             (default: 400)
 *   height       {number|null}     Initial height in px; null = content-sized (default: null)
 *   resizable    {boolean}         Allow resize handles            (default: true)
 *   maximizable  {boolean}         Show & enable maximize button   (default: true)
 *   minimizable  {boolean}         Show & enable minimize button   (default: true)
 *   closable     {boolean}         Show & enable close button      (default: true)
 *   content      {string|Element}  innerHTML string or DOM element placed in .window-body
 *   statusBar    {string|null}     Status bar text; null = no status bar (default: null)
 *   id           {string|null}     Optional id for the window element
 *
 * Example:
 *   import { openWindow } from './ui/components/createWindow.js';
 *   const win = openWindow({
 *     title: 'About',
 *     width: 320,
 *     resizable: false, maximizable: false,
 *     content: '<p>Version 1.0</p>',
 *     statusBar: 'Ready',
 *   }, document.getElementById('viewport'));
 */

import { addWindow } from './windowManager.js';

export function createWindow({
  title       = 'Window',
  width       = 400,
  height      = null,
  resizable   = true,
  maximizable = true,
  minimizable = true,
  closable    = true,
  content     = '',
  statusBar   = null,
  id          = null,
} = {}) {
  const win = document.createElement('div');
  win.className = 'window';
  if (id) win.id = id;
  win.style.width = width + 'px';
  if (height !== null) win.style.height = height + 'px';

  // Flags stored as data attributes — windowManager reads these during _register
  if (!resizable)   win.dataset.resizable   = 'false';
  if (!maximizable) win.dataset.maximizable = 'false';
  if (!minimizable) win.dataset.minimizable = 'false';
  if (!closable)    win.dataset.closable    = 'false';

  // ── Title bar ──────────────────────────────────────────────────────────────
  const titleBar = document.createElement('div');
  titleBar.className = 'title-bar';

  const titleText = document.createElement('div');
  titleText.className = 'title-bar-text';
  titleText.textContent = title;
  titleBar.appendChild(titleText);

  const controls = document.createElement('div');
  controls.className = 'title-bar-controls';
  // Only render buttons that are enabled — consistent with 98.css button order
  if (minimizable) { const b = document.createElement('button'); b.setAttribute('aria-label', 'Minimize'); controls.appendChild(b); }
  if (maximizable) { const b = document.createElement('button'); b.setAttribute('aria-label', 'Maximize'); controls.appendChild(b); }
  if (closable)    { const b = document.createElement('button'); b.setAttribute('aria-label', 'Close');    controls.appendChild(b); }
  titleBar.appendChild(controls);
  win.appendChild(titleBar);

  // ── Window body ────────────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'window-body';
  if (content instanceof Element) {
    body.appendChild(content);
  } else {
    body.innerHTML = content;
  }
  win.appendChild(body);

  // ── Optional status bar ────────────────────────────────────────────────────
  if (statusBar !== null) {
    const sb = document.createElement('div');
    sb.className = 'status-bar';
    const field = document.createElement('p');
    field.className = 'status-bar-field';
    field.textContent = statusBar;
    sb.appendChild(field);
    win.appendChild(sb);
  }

  return win;
}

// Convenience: create + append to viewport + register in one call.
export function openWindow(options, viewportEl) {
  const win = createWindow(options);
  addWindow(win, viewportEl);
  return win;
}
