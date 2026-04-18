import { raiseWindow, maximizeWindow } from './windowManager.js';

const ICONS = [
  {
    id:    'icon-my-computer',
    label: 'My Computer',
    img:   'media/icons/computer_explorer_cool-0.png',
    action() {
      window.open('https://github.com/ilamparithi-in', '_blank', 'noopener,noreferrer');
    },
  },
  {
    id:    'icon-tla',
    label: 'Transmission\nLine Analyzer',
    img:   'media/icons/network_drive-5.png',
    action() {
      const win = document.getElementById('win-analyser');
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

  // Active Desktop project info — top-right corner
  const info = document.createElement('div');
  info.id = 'active-desktop-info';
  info.innerHTML =
    '<div class="adi-title">TADEE Group 7</div>' +
    '<div class="adi-subtitle">Transmission Line Analyser</div>' +
    '<hr class="adi-sep" />' +
    '<ul class="adi-members">' +
    '<li>Ilamparithi Murali <span class="adi-roll">107124046</span></li>' +
    '<li>Priyadarsan ST <span class="adi-roll">107124084</span></li>' +
    '<li>Srijith M S <span class="adi-roll">107124110</span></li>' +
    '</ul>';
  containerEl.appendChild(info);

  // Active Desktop zoom notice — bottom-right corner
  const notice = document.createElement('div');
  notice.id = 'active-desktop-notice';
  notice.innerHTML =
    '<span class="adn-icon" aria-hidden="true">i</span>' +
    '<span class="adn-text">For the best experience on a high&#8209;resolution display, ' +
    'press <kbd>Ctrl</kbd>&nbsp;+&nbsp;<kbd>+</kbd> to increase zoom.</span>' +
    '<button class="adn-close" aria-label="Close notice" title="Close">✕</button>';
  containerEl.appendChild(notice);
  notice.querySelector('.adn-close').addEventListener('click', () => notice.remove());

  // Legalese — bottom-right corner, below the zoom notice
  const legal = document.createElement('div');
  legal.id = 'desktop-legalese';
  legal.innerHTML =
    'Windows\u00ae is a registered trademark of Microsoft Corporation.<br>' +
    'This project is not affiliated with or endorsed by Microsoft.<br>' +
    'UI styles by <a href="https://github.com/jdan/98.css" target="_blank" rel="noopener noreferrer">98.css</a> (MIT). ' +
    'Icons from <a href="https://win98icons.alexmeub.com/" target="_blank" rel="noopener noreferrer">win98icons.alexmeub.com</a>.';
  containerEl.appendChild(legal);

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

function _createIcon({ id, label, img: imgSrc, action }) {
  const el = document.createElement('div');
  el.className = 'desktop-icon';
  el.id = id;

  const img = document.createElement('div');
  img.className = 'desktop-icon-img';
  img.setAttribute('aria-hidden', 'true');
  if (imgSrc) img.style.backgroundImage = `url('${imgSrc}')`;

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
