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

  // Double-click only
  el.addEventListener('dblclick', () => action());

  // Single click — select (visual only)
  el.addEventListener('click', e => {
    e.stopPropagation(); // prevent blank-desktop click handler from firing
    _deselectAll();
    el.classList.add('selected');
  });

  return el;
}
