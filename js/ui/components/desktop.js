import { raiseWindow, maximizeWindow } from './windowManager.js';

const ICONS = [
  {
    id:    'icon-my-computer',
    label: 'My Computer',
    img:   null,
    action() {
      window.open('https://github.com/ilamparithi-in', '_blank', 'noopener,noreferrer');
    },
  },
  {
    id:    'icon-tla',
    label: 'Transmission\nLine Analyzer',
    img:   null,
    action() {
      const win = document.getElementById('win-notepad');
      if (!win) return;
      // Set a viewport-responsive initial size so that restoring from maximized
      // snaps to something sensible on both desktop and mobile.
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isMobile = vw < 700;
      win.style.width  = (isMobile ? Math.min(vw, 480)  : Math.min(vw * 0.85, 900)) + 'px';
      win.style.height = (isMobile ? Math.min(vh, 520)  : Math.min(vh * 0.85, 580)) + 'px';
      win.style.left   = '20px';
      win.style.top    = '20px';
      raiseWindow(win);
      maximizeWindow(win);
    },
  },
];

/**
 * @param {HTMLElement} containerEl  — the #desktop element
 */
export function initDesktop(containerEl) {
  for (const icon of ICONS) {
    const el = _createIcon(icon);
    containerEl.appendChild(el);
  }

  // Deselect all icons when clicking blank desktop space
  containerEl.addEventListener('click', e => {
    if (e.target === containerEl) _deselectAll();
  });

  // Deselect all icons when any window receives focus
  const viewport = document.getElementById('viewport');
  if (viewport) viewport.addEventListener('wm:focus', _deselectAll);
}

function _deselectAll() {
  document.querySelectorAll('.desktop-icon.selected').forEach(i => i.classList.remove('selected'));
}

function _createIcon({ id, label, action }) {
  const el = document.createElement('div');
  el.className = 'desktop-icon';
  el.id = id;

  const img = document.createElement('div');
  img.className = 'desktop-icon-img';
  img.setAttribute('aria-hidden', 'true');

  const lbl = document.createElement('span');
  lbl.className = 'desktop-icon-label';
  lbl.textContent = label;

  el.appendChild(img);
  el.appendChild(lbl);

  // Double-click (mouse) or double-tap (touch) opens the icon
  el.addEventListener('dblclick', () => action());

  // Touch double-tap: two taps within 300 ms
  let _lastTap = 0;
  el.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    const now = Date.now();
    if (now - _lastTap < 300) {
      e.preventDefault();
      e.stopPropagation(); // prevent viewport deactivation from undoing the focus
      action();
      _lastTap = 0;
    } else {
      _lastTap = now;
    }
  });

  // Single click — select (visual only)
  el.addEventListener('click', e => {
    e.stopPropagation(); // prevent blank-desktop click handler from firing
    _deselectAll();
    el.classList.add('selected');
  });

  return el;
}
