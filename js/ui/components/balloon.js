/**
 * balloon.js — Win98/XP-style validation balloon tip.
 *
 * Singleton: only one balloon visible at a time.
 *
 *   showBalloon(anchorEl, options)
 *   hideBalloon()
 *
 * options {
 *   title?   : string                        default: type-specific
 *   message  : string
 *   type?    : 'warning' | 'error' | 'info'  default: 'warning'
 *   closable?: boolean                       default: true
 * }
 */

// Icon PNG mapping: type → filename key
const ICON_FILES = {
  info    : 'media/icons/msg_information-16x16.png',
  warning : 'media/icons/msg_warning-16x16.png',
  error   : 'media/icons/msg_error-16x16.png',
};

const DEFAULT_TITLES = {
  warning : 'Invalid value',
  error   : 'Error',
  info    : 'Note',
};

let _el            = null;
let _anchor        = null;
let _observer      = null;
let _scrollEls     = [];
let _rafId         = null;

// ─── Public API ───────────────────────────────────────────────────────────────

export function showBalloon(anchorEl, {
  title    = '',
  message  = '',
  type     = 'warning',
  closable = true,
} = {}) {
  hideBalloon();

  const wrap = document.createElement('div');
  wrap.className  = 'balloon';
  wrap.dataset.type = type;

  // ── Box (the visible balloon body) ─────────────────────────────────────────
  const box = document.createElement('div');
  box.className = 'balloon-box';

  // Header row: icon + title [+ close button]
  const hdr = document.createElement('div');
  hdr.className = 'balloon-hdr';

  const iconEl = document.createElement('span');
  iconEl.className = 'balloon-icon-wrapper';
  iconEl.setAttribute('aria-hidden', 'true');
  const iconImg = new Image(16, 16);
  iconImg.src = ICON_FILES[type] ?? ICON_FILES.warning;
  iconImg.alt = '';
  iconEl.appendChild(iconImg);

  const titleEl = document.createElement('b');
  titleEl.className  = 'balloon-title';
  titleEl.textContent = title || DEFAULT_TITLES[type] || 'Note';

  hdr.appendChild(iconEl);
  hdr.appendChild(titleEl);

  if (closable) {
    const x = document.createElement('button');
    x.className = 'balloon-x';
    x.textContent = '✕';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', hideBalloon);
    hdr.appendChild(x);
  }

  box.appendChild(hdr);

  if (message) {
    const msg = document.createElement('p');
    msg.className   = 'balloon-msg';
    msg.textContent = message;
    box.appendChild(msg);
  }

  // ── Tail (direction set by _reposition) ─────────────────────────────────
  const tail = document.createElement('div');
  tail.className = 'balloon-tail';

  // Default: balloon above, tail below pointing down.
  // _reposition may add balloon--below class & reorder nodes.
  wrap.appendChild(box);
  wrap.appendChild(tail);

  document.body.appendChild(wrap);
  _el = wrap;
  _anchor = anchorEl;

  // Measure and place after DOM insertion
  _reposition(anchorEl);

  // Kick animation on the whole wrapper (box + tail move as one)
  void _el.offsetHeight;
  _el.classList.add('balloon-animate');

  // Hide/reposition as anchor scrolls in and out of view
  _startObserver(anchorEl);
}

export function hideBalloon() {
  if (_observer) { _observer.disconnect(); _observer = null; }
  _scrollEls.forEach(el => el.removeEventListener('scroll', _onScroll));
  _scrollEls = [];
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
  _anchor = null;
  if (_el) { _el.remove(); _el = null; }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function _startObserver(anchorEl) {
  if (_observer) { _observer.disconnect(); }
  _observer = new IntersectionObserver(entries => {
    if (!_el) return;
    if (entries[0].isIntersecting) {
      _reposition(anchorEl);
      _el.style.visibility = '';
      // rAF ensures visibility is applied before the fade-in transition fires
      requestAnimationFrame(() => { if (_el) _el.style.opacity = '1'; });
    } else {
      _el.style.opacity = '0';
      _el.addEventListener('transitionend', function onEnd() {
        if (_el) _el.style.visibility = 'hidden';
        _el?.removeEventListener('transitionend', onEnd);
      }, { once: true });
    }
  }, { threshold: 0 });
  _observer.observe(anchorEl);

  // Walk up the DOM and attach scroll listeners to every scrollable ancestor
  _scrollEls.forEach(el => el.removeEventListener('scroll', _onScroll));
  _scrollEls = _scrollableAncestors(anchorEl);
  _scrollEls.forEach(el => el.addEventListener('scroll', _onScroll, { passive: true }));
}

function _scrollableAncestors(el) {
  const result = [];
  let node = el.parentElement;
  while (node && node !== document.body) {
    const st = getComputedStyle(node);
    if (/auto|scroll/.test(st.overflow + st.overflowY + st.overflowX)) {
      result.push(node);
    }
    node = node.parentElement;
  }
  result.push(window);
  return result;
}

function _onScroll() {
  if (!_anchor || !_el) return;
  // Throttle to one rAF per scroll burst
  if (_rafId) return;
  _rafId = requestAnimationFrame(() => {
    _rafId = null;
    if (!_anchor || !_el) return;
    const r = _anchor.getBoundingClientRect();
    // Hide if the anchor has been scrolled outside any of its scroll containers
    const clipped = _scrollEls.some(sc => {
      if (sc === window) {
        return r.bottom <= 0 || r.top >= window.innerHeight ||
               r.right  <= 0 || r.left >= window.innerWidth;
      }
      const cr = sc.getBoundingClientRect();
      return r.bottom <= cr.top  || r.top  >= cr.bottom ||
             r.right  <= cr.left || r.left >= cr.right;
    });
    if (clipped) {
      hideBalloon();
    } else if (_el.style.visibility !== 'hidden') {
      _reposition(_anchor);
    }
  });
}

function _reposition(anchor) {
  if (!_el) return;

  const a   = anchor.getBoundingClientRect();
  const w   = _el.offsetWidth;
  const h   = _el.offsetHeight;
  const vw  = window.innerWidth;
  const vh  = window.innerHeight;
  const GAP = 2;   // px between tail tip and anchor
  const TAIL_H = 8; // visual protrusion of tail beyond box edge

  // Prefer above; fall back to below
  const above = (a.top - h - TAIL_H - GAP) >= 4;

  let top, left;

  if (above) {
    top = a.top - h - TAIL_H - GAP;
    _el.classList.remove('balloon--below');
    // Ensure tail is AFTER box in DOM
    const tail = _el.querySelector('.balloon-tail');
    const box  = _el.querySelector('.balloon-box');
    if (tail && box && tail.previousElementSibling !== box) _el.appendChild(tail);
  } else {
    top = a.bottom + TAIL_H + GAP;
    _el.classList.add('balloon--below');
    // Ensure tail is BEFORE box in DOM
    const tail = _el.querySelector('.balloon-tail');
    const box  = _el.querySelector('.balloon-box');
    if (tail && box && box.previousElementSibling !== tail) _el.insertBefore(tail, box);
  }

  // Align the tail's left edge (at 14px margin) with the anchor's left edge.
  // The tail center is at balloon-left + 14 + 8 = balloon-left + 22
  left = a.left - 14;

  // Clamp to viewport
  left = Math.max(4, Math.min(left, vw - w - 4));
  top  = Math.max(4, Math.min(top,  vh - h - 4));

  _el.style.left = left + 'px';
  _el.style.top  = top  + 'px';
}
