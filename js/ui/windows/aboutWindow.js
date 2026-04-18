/**
 * aboutWindow.js — About window module.
 *
 * Singleton window; ~320×200; non-resizable, no maximize.
 * OK button closes the window.
 *
 * Exposes:
 *   openAboutWindow(viewport) — open or raise the About window.
 */

import { openWindow }  from '../components/createWindow.js';
import { raiseWindow } from '../components/windowManager.js';

// ─── Module state ─────────────────────────────────────────────────────────────
let _win = null;

// ─── Public API ───────────────────────────────────────────────────────────────
export function openAboutWindow(viewport) {
  if (_win) {
    raiseWindow(_win);
    return;
  }

  const body = document.createElement('div');
  body.style.cssText = 'padding: 12px 16px; font-size: 11px; display: flex; flex-direction: column; gap: 6px;';
  body.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px;">
      <img src="media/icons/network_drive-16x16.png" width="32" height="32" alt="" style="image-rendering:pixelated;">
      <div>
        <div style="font-weight:bold; font-size:12px;">TADEE Transmission Line Analyser</div>
        <div>Version 1.0</div>
      </div>
    </div>
    <hr style="margin:4px 0;" />
    <div>Three-Phase Single-Circuit Bundled Conductor Transmission System</div>
    <div>TADEE Group 7</div>
    <div style="margin-top:4px; display:flex; justify-content:flex-end;">
      <button id="about-ok-btn" style="width:75px;">OK</button>
    </div>
  `;

  _win = openWindow({
    title:       'About TADEE Analyser',
    width:       320,
    height:      200,
    resizable:   false,
    maximizable: false,
    content:     body,
  }, viewport);

  // Wire OK button after window is in the DOM
  _win.querySelector('#about-ok-btn')?.addEventListener('click', () => {
    _win.querySelector('[aria-label="Close"]')?.click();
  });

  _win._closeGuard = (proceed) => { _win = null; proceed(); };
}
