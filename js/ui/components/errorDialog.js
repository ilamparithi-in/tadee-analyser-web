/**
 * errorDialog.js
 *
 * Win98-style modal error dialog with synthesised chord.wav sound (Web Audio).
 * The chord is a C-major triad (C4/E4/G4) with exponential decay — approximates
 * the Windows 98 chord.wav without requiring an external audio file.
 *
 * Usage:
 *   import { showError } from './errorDialog.js';
 *   showError('Something went wrong.');
 */

let _overlayEl = null;
let _msgEl     = null;
let _okBtn     = null;

// ─── One-time DOM setup ───────────────────────────────────────────────────────

function _ensureDOM() {
  if (_overlayEl) return;

  _overlayEl = document.createElement('div');
  _overlayEl.id = 'err-dialog-overlay';
  _overlayEl.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.35);' +
    'z-index:99999;display:none;align-items:center;justify-content:center;';

  const win = document.createElement('div');
  win.className = 'window';
  win.style.cssText = 'width:320px;position:relative;';

  win.innerHTML = `
    <div class="title-bar" id="err-dialog-titlebar">
      <div class="title-bar-text">Error</div>
      <div class="title-bar-controls">
        <button aria-label="Close" id="err-dialog-close"></button>
      </div>
    </div>
    <div class="window-body" style="display:flex;gap:12px;align-items:flex-start;padding:12px 12px 8px;">
      <img src="media/icons/msg_error-0.png" width="32" height="32" alt="" style="flex:0 0 32px;">
      <p id="err-dialog-msg" style="margin:0;font-size:11px;line-height:1.5;word-break:break-word;"></p>
    </div>
    <div style="display:flex;justify-content:center;padding:4px 12px 10px;">
      <button id="err-dialog-ok" style="min-width:75px;">OK</button>
    </div>`;

  _overlayEl.appendChild(win);
  document.body.appendChild(_overlayEl);

  _msgEl = win.querySelector('#err-dialog-msg');
  _okBtn = win.querySelector('#err-dialog-ok');

  const close = () => _hide();
  _okBtn.addEventListener('click', close);
  win.querySelector('#err-dialog-close').addEventListener('click', close);

  // Close on overlay click (outside the window)
  _overlayEl.addEventListener('click', e => { if (e.target === _overlayEl) _hide(); });

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _overlayEl.style.display !== 'none') _hide();
  });
}

function _hide() {
  if (_overlayEl) _overlayEl.style.display = 'none';
}

// ─── Audio — synthesised C-major chord (Win98 chord.wav approximation) ───────

function _playChord() {
  try {
    const audio = new Audio('media/chord.mp3');
    audio.play();
  } catch {
    // Audio not available — fail silently
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Display a Win98-style error dialog with the given message and play chord.wav.
 * @param {string} message
 */
export function showError(message) {
  _ensureDOM();
  const msg = message ? message.charAt(0).toUpperCase() + message.slice(1) : message;
  _msgEl.textContent = msg;
  _overlayEl.style.display = 'flex';
  _okBtn.focus();
  _playChord();
}
