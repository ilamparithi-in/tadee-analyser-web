/**
 * contextMenu.js — Win98-style context menu.
 *
 * Positioned with its bottom-left corner at the cursor (taskbar right-click).
 * Animation: inner card slides from translate(-100%, 100%) → translate(0,0),
 * clipped by an overflow:hidden wrapper — reveals diagonally from cursor
 * (bottom-left) toward top-right. Uses steps(8, end) to match the menu bar.
 */

let _clip    = null;   // outer clipping wrapper (position:fixed, overflow:hidden)
let _inner   = null;   // inner styled card (.dropdown-inner)
let _cleanup = null;

export function showContextMenu(x, y, items) {
  _dismiss();

  const { clip, inner } = _ensureElements();

  // ── Build items into inner card ──────────────────────────────────────────────
  inner.innerHTML = '';
  for (const item of items) {
    if (item.separator) {
      const hr = document.createElement('hr');
      hr.className = 'dropdown-separator';
      inner.appendChild(hr);
    } else {
      const btn = document.createElement('button');
      btn.className   = 'dropdown-item';
      btn.textContent = item.label;
      if (item.disabled) {
        btn.disabled = true;
      } else {
        btn.addEventListener('click', () => { _dismiss(); item.action?.(); });
      }
      inner.appendChild(btn);
    }
  }

  // ── Measure at off-screen position ───────────────────────────────────────────
  inner.classList.remove('ctx-animate');
  clip.style.left    = '-9999px';
  clip.style.top     = '-9999px';
  clip.style.width   = 'auto';
  clip.style.height  = 'auto';
  clip.style.display = 'block';

  const mw  = clip.offsetWidth;
  const mh  = clip.offsetHeight;
  const vpw = window.innerWidth;
  const vph = window.innerHeight;

  // Bottom-left of menu at cursor; clamp so menu stays inside viewport
  const cx = Math.min(x, vpw - mw);
  const cy = Math.max(0, y - mh);

  clip.style.left   = cx + 'px';
  clip.style.top    = cy + 'px';
  clip.style.width  = mw + 'px';
  clip.style.height = mh + 'px';

  // ── Diagonal animation (bottom-left → top-right) ─────────────────────────────
  // inner starts at translate(-100%, 100%) = off to left and below the clip box,
  // i.e. exactly at cursor position. slides to (0,0) revealing the menu upward-right.
  void inner.offsetHeight;
  inner.classList.add('ctx-animate');

  // ── Dismiss listeners ────────────────────────────────────────────────────────
  function onPointerDown(e) {
    if (!clip.contains(e.target)) _dismiss();
  }
  function onKey(e) {
    if (e.key === 'Escape') _dismiss();
  }
  document.addEventListener('pointerdown', onPointerDown, { capture: true });
  document.addEventListener('keydown',     onKey,         { capture: true });
  _cleanup = () => {
    document.removeEventListener('pointerdown', onPointerDown, { capture: true });
    document.removeEventListener('keydown',     onKey,         { capture: true });
  };
}

export function dismissContextMenu() { _dismiss(); }

// ─── Internal ────────────────────────────────────────────────────────────────

function _dismiss() {
  if (_cleanup) { _cleanup(); _cleanup = null; }
  if (_clip)    { _clip.style.display = 'none'; }
}

function _ensureElements() {
  if (_clip) return { clip: _clip, inner: _inner };

  // Outer: clipping vessel only — no background, no border
  _clip = document.createElement('div');
  _clip.className = 'ctx-clip';
  _clip.style.cssText = 'position:fixed;z-index:99998;overflow:hidden;display:none;';

  // Inner: the visible Win98-styled card
  _inner = document.createElement('div');
  _inner.className = 'ctx-inner dropdown-inner';

  _clip.appendChild(_inner);
  document.body.appendChild(_clip);
  return { clip: _clip, inner: _inner };
}
