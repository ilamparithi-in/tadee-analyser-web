/**
 * preferencesWindow.js — Preferences window module.
 *
 * Singleton window; ~400×300; non-resizable, no maximize.
 *
 * Exposes:
 *   openPreferencesWindow(viewport) — open or raise the Preferences window.
 */

import { openWindow }  from '../components/createWindow.js';
import { raiseWindow } from '../components/windowManager.js';

// ─── Module state ─────────────────────────────────────────────────────────────
let _win = null;

// ─── Public API ───────────────────────────────────────────────────────────────
export function openPreferencesWindow(viewport) {
  if (_win) {
    raiseWindow(_win);
    return;
  }

  const body = document.createElement('div');
  body.style.cssText = 'padding: 8px; font-size: 11px;';
  body.innerHTML = `<p>Preferences are not yet available.</p>`;

  _win = openWindow({
    title:       'Preferences',
    width:       400,
    height:      300,
    resizable:   false,
    maximizable: false,
    content:     body,
  }, viewport);

  _win._closeGuard = (proceed) => { _win = null; proceed(); };
}
