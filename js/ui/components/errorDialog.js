/**
 * errorDialog.js
 *
 * Win98-style modal dialogs.
 *
 * Usage:
 *   import { showError }   from './errorDialog.js';
 *   import { showConfirm } from './errorDialog.js';
 *
 *   showError('Something went wrong.');
 *   showConfirm('Message text', onOk, onCancel);
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

function _playDing() {
  try {
    const audio = new Audio('media/ding.mp3');
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

// ─── Confirm dialog ───────────────────────────────────────────────────────────

let _cfmOverlayEl = null;
let _cfmMsgEl     = null;
let _cfmOkBtn     = null;
let _cfmCancelBtn = null;
let _cfmOnOk      = null;
let _cfmOnCancel  = null;

function _ensureConfirmDOM() {
  if (_cfmOverlayEl) return;

  _cfmOverlayEl = document.createElement('div');
  _cfmOverlayEl.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.35);' +
    'z-index:99999;display:none;align-items:center;justify-content:center;';

  const win = document.createElement('div');
  win.className = 'window';
  win.style.cssText = 'width:340px;position:relative;';

  win.innerHTML = `
    <div class="title-bar">
      <div class="title-bar-text">Confirm Navigation</div>
      <div class="title-bar-controls">
        <button aria-label="Close" id="cfm-dialog-close"></button>
      </div>
    </div>
    <div class="window-body" style="display:flex;gap:12px;align-items:flex-start;padding:12px 12px 8px;">
      <img src="media/icons/msg_information-0.png" width="32" height="32" alt="" style="flex:0 0 32px;">
      <p id="cfm-dialog-msg" style="margin:0;font-size:11px;line-height:1.5;word-break:break-word;"></p>
    </div>
    <div style="display:flex;justify-content:center;gap:8px;padding:4px 12px 10px;">
      <button id="cfm-dialog-ok"     style="min-width:75px;">OK</button>
      <button id="cfm-dialog-cancel" style="min-width:75px;">Cancel</button>
    </div>`;

  _cfmOverlayEl.appendChild(win);
  document.body.appendChild(_cfmOverlayEl);

  _cfmMsgEl     = win.querySelector('#cfm-dialog-msg');
  _cfmOkBtn     = win.querySelector('#cfm-dialog-ok');
  _cfmCancelBtn = win.querySelector('#cfm-dialog-cancel');

  const ok = () => { _cfmOverlayEl.style.display = 'none'; _cfmOnOk?.(); };
  const cancel = () => { _cfmOverlayEl.style.display = 'none'; _cfmOnCancel?.(); };

  _cfmOkBtn.addEventListener('click', ok);
  _cfmCancelBtn.addEventListener('click', cancel);
  win.querySelector('#cfm-dialog-close').addEventListener('click', cancel);
  _cfmOverlayEl.addEventListener('click', e => { if (e.target === _cfmOverlayEl) cancel(); });
  document.addEventListener('keydown', e => {
    if (_cfmOverlayEl.style.display === 'none') return;
    if (e.key === 'Escape') cancel();
    if (e.key === 'Enter')  ok();
  });
}

/**
 * Show a Win98-style confirmation dialog with OK / Cancel.
 * Plays ding.mp3 and shows the information icon.
 * @param {string}    message
 * @param {Function}  onOk
 * @param {Function}  [onCancel]
 */
export function showConfirm(message, onOk, onCancel) {
  _ensureConfirmDOM();
  _cfmMsgEl.innerHTML = message;
  _cfmOnOk     = onOk ?? null;
  _cfmOnCancel = onCancel ?? null;
  _cfmOverlayEl.style.display = 'flex';
  _cfmOkBtn.focus();
  _playDing();
}

// ─── Before-unload dialog (refresh guard) ────────────────────────────────────

let _buOverlayEl = null;
let _buOnConfirm = null;

function _ensureBeforeUnloadDOM() {
  if (_buOverlayEl) return;

  _buOverlayEl = document.createElement('div');
  _buOverlayEl.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.35);' +
    'z-index:99999;display:none;align-items:center;justify-content:center;';

  const win = document.createElement('div');
  win.className = 'window';
  win.style.cssText = 'width:360px;position:relative;';

  win.innerHTML = `
    <div class="title-bar">
      <div class="title-bar-text">Confirm Page Refresh</div>
      <div class="title-bar-controls">
        <button aria-label="Close" id="bu-dialog-close"></button>
      </div>
    </div>
    <div class="window-body" style="display:flex;gap:12px;align-items:flex-start;padding:12px 12px 8px;">
      <img src="media/icons/msg_question-0.png" width="32" height="32" alt="" style="flex:0 0 32px;">
      <p style="margin:0;font-size:11px;line-height:1.5;">
        Are you sure you want to refresh the page?<br><br>
        All unsaved changes — including your inputs and computed results — will be lost.
      </p>
    </div>
    <div style="display:flex;justify-content:center;gap:8px;padding:4px 12px 10px;">
      <button id="bu-dialog-ok"     style="min-width:120px;">Discard Changes</button>
      <button id="bu-dialog-cancel" style="min-width:100px;">Stay on Page</button>
    </div>`;

  _buOverlayEl.appendChild(win);
  document.body.appendChild(_buOverlayEl);

  const okBtn     = win.querySelector('#bu-dialog-ok');
  const cancelBtn = win.querySelector('#bu-dialog-cancel');

  const confirm = () => { _buOverlayEl.style.display = 'none'; _buOnConfirm?.(); };
  const cancel  = () => { _buOverlayEl.style.display = 'none'; };

  okBtn.addEventListener('click', confirm);
  cancelBtn.addEventListener('click', cancel);
  win.querySelector('#bu-dialog-close').addEventListener('click', cancel);
  _buOverlayEl.addEventListener('click', e => { if (e.target === _buOverlayEl) cancel(); });
  document.addEventListener('keydown', e => {
    if (_buOverlayEl.style.display === 'none') return;
    if (e.key === 'Escape') cancel();
    if (e.key === 'Enter')  { e.preventDefault(); confirm(); }
  });
}

function _playChimes() {
  try {
    const audio = new Audio('media/chimes.mp3');
    audio.play();
  } catch {
    // Audio not available — fail silently
  }
}

/**
 * Show a Win98-style "confirm refresh" dialog.
 * Plays chimes.mp3 and shows the question icon.
 * @param {Function} onConfirm  Called when the user clicks "Discard Changes"
 */
export function showBeforeUnload(onConfirm) {
  _ensureBeforeUnloadDOM();
  _buOnConfirm = onConfirm ?? null;
  _buOverlayEl.style.display = 'flex';
  _buOverlayEl.querySelector('#bu-dialog-cancel').focus();
  _playChimes();
}
