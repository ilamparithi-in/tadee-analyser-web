import { initDesktop } from './ui/components/desktop.js';
import { showBeforeUnload } from './ui/components/errorDialog.js';

const desktop = document.getElementById('desktop');
if (desktop) initDesktop(desktop);

// ─── Refresh / close guard ────────────────────────────────────────────────────
// Intercept keyboard shortcuts for reload and tab-close, showing our own Win98
// confirm dialog instead of the browser default.
// For browser-button refresh/close and address-bar navigation, beforeunload
// fires and shows the browser's own generic dialog (unavoidable limitation).
//
// Reload shortcuts:  F5, Ctrl+R, Cmd+R, Ctrl+Shift+R, Cmd+Shift+R
// Tab-close shorts:  Ctrl+W, Cmd+W

let _allowReload = false;

window.addEventListener('beforeunload', e => {
  if (_allowReload) return;
  e.preventDefault();
  return ''; // triggers browser's own "Leave site?" for non-keyboard navigation
});

document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  const isReload = e.key === 'F5' || (mod && key === 'r');
  const isClose  = mod && key === 'w';

  if (!isReload && !isClose) return;
  e.preventDefault();
  e.stopImmediatePropagation();

  if (isClose) {
    showBeforeUnload(() => {
      _allowReload = true;
      window.close(); // only works if the tab was opened by script; otherwise silently ignored
    });
  } else {
    showBeforeUnload(() => {
      _allowReload = true;
      location.reload();
    });
  }
}, true); // capture phase so it fires before any other handler
