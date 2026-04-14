/**
 * tooltip.js — Win98-style tooltips with slide-down animation.
 *
 * Any element with a `data-tooltip` attribute gets a tooltip on hover.
 * Usage: initTooltips(rootEl) — observes all data-tooltip elements within rootEl.
 */

import { restartAnimation } from './animationUtils.js';

const DELAY_MS  = 600;
const ANIM_CLASS = 'animate-open';

let _outer = null; // positioned clip container
let _inner = null; // sliding visual card
let _timer = null;

function _ensureTip() {
  if (_outer) return;
  _outer = document.createElement('div');
  _outer.className = 'win98-tooltip';
  _outer.setAttribute('role', 'tooltip');

  _inner = document.createElement('div');
  _inner.className = 'win98-tooltip-inner';
  _outer.appendChild(_inner);

  document.body.appendChild(_outer);
}

function _show(text, x, y) {
  _inner.textContent = text;
  _outer.style.display = 'block';

  // Clamp to viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  _outer.style.left = '0';
  _outer.style.top  = '0';
  const w = _outer.offsetWidth;
  const h = _outer.offsetHeight;
  _outer.style.left = Math.min(x + 12, vw - w - 4) + 'px';
  _outer.style.top  = Math.min(y + 20, vh - h - 4) + 'px';

  restartAnimation(_inner, ANIM_CLASS);
}

function _hide() {
  clearTimeout(_timer);
  _timer = null;
  if (_outer) _outer.style.display = 'none';
}

/**
 * @param {HTMLElement} rootEl  — scope: only elements inside rootEl are observed
 */
export function initTooltips(rootEl) {
  _ensureTip();

  let _cursorX = 0;
  let _cursorY = 0;

  rootEl.addEventListener('mousemove', e => {
    _cursorX = e.clientX;
    _cursorY = e.clientY;
  });

  rootEl.addEventListener('mouseover', e => {
    const target = e.target.closest('[data-tooltip]');
    if (!target) { _hide(); return; }

    const text = target.dataset.tooltip;
    if (!text) { _hide(); return; }

    clearTimeout(_timer);
    _timer = setTimeout(() => _show(text, _cursorX, _cursorY), DELAY_MS);
  });

  rootEl.addEventListener('mouseout', e => {
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;
    _hide();
  });

  rootEl.addEventListener('mousedown', _hide);
  rootEl.addEventListener('scroll', _hide, true);
}
