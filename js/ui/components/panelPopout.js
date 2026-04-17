/**
 * panelPopout.js — Pop panels out into standalone resizable Win98 windows.
 *
 * Each panel (Input, Canvas, Results) has a small ↗ button in its header.
 * Clicking it moves the panel element into a new .window registered with the
 * window manager so it gets full drag / minimize / maximize / resize behaviour.
 * The close button on the pop-out window puts the panel back in its original
 * slot in the main layout and destroys the pop-out window.
 *
 * Key design points:
 *  - The panel DOM element is physically moved (not cloned), so all IDs, event
 *    listeners, canvas state, and references survive unchanged.
 *  - A placeholder <div> is left in the slot so the layout remembers the
 *    original sibling order for restoration.
 *  - Splitters are shown/hidden after each pop-out / restore based on which
 *    panels are currently in the main layout.
 *  - The view-menu checkboxes are disabled while a panel is popped out and
 *    re-enabled when it is restored.
 */

import { addWindow, removeWindow } from './windowManager.js';

// Panel configuration — order matters for z-index cascade
const PANEL_CONFIGS = [
  {
    panelId:    'panel-left',
    title:      'Input',
    viewBtnId:  'view-pane-input',
    defaultW:   300,
    defaultH:   520,
  },
  {
    panelId:    'panel-right',
    title:      'Canvas',
    viewBtnId:  'view-pane-canvas',
    defaultW:   500,
    defaultH:   420,
  },
  {
    panelId:    'panel-bottom',
    title:      'Results',
    viewBtnId:  'view-pane-output',
    defaultW:   700,
    defaultH:   280,
  },
];

/**
 * Initialise pop-out buttons for all three panels in the analyzer window.
 * @param {HTMLElement} win      — #win-analyser element
 * @param {HTMLElement} viewport — #viewport element (WM host)
 */
export function initPanelPopout(win, viewport) {
  PANEL_CONFIGS.forEach(cfg => _initOne(win, viewport, cfg));
}

// ─── Per-panel setup ─────────────────────────────────────────────────────────

function _initOne(win, viewport, cfg) {
  const panel = win.querySelector('#' + cfg.panelId);
  if (!panel) return;

  const btn = panel.querySelector('.panel-popout-btn');
  if (!btn) return;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (panel.dataset.poppedOut === 'true') return; // already out
    _popOut(win, viewport, panel, cfg);
  });
}

// ─── Pop out ─────────────────────────────────────────────────────────────────

const POPOUT_ANIM_MS = 150;

function _popOut(win, viewport, panel, cfg) {
  // Record parent + insert position for later restoration
  const parent      = panel.parentElement;
  const nextSibling = panel.nextSibling;

  // Insert a zero-size placeholder so we know where to put it back
  const placeholder = document.createElement('div');
  placeholder.className = 'panel-popout-placeholder';
  placeholder.style.cssText = 'display:none;flex:none;width:0;height:0;overflow:hidden;';
  parent.insertBefore(placeholder, panel);

  // Capture the panel rect (viewport-relative) BEFORE the panel is moved
  const panelRectFrom = panel.getBoundingClientRect();
  const vpORect   = viewport.getBoundingClientRect();
  const fromX = panelRectFrom.left - vpORect.left;
  const fromY = panelRectFrom.top  - vpORect.top;
  const fromW = panelRectFrom.width;
  const fromH = panelRectFrom.height;

  // Mark the panel as popped out (lets _initViewMenu skip it in _apply)
  panel.dataset.poppedOut = 'true';
  // Remove any inline display:none the view menu might have set
  panel.style.display = '';
  panel.style.flex    = '';

  // Build the pop-out window element BEFORE calling addWindow so we can
  // attach the restore listener first (listener order matters — ours must
  // fire before the WM's close handler removes the window from the DOM)
  const popWin = document.createElement('div');
  popWin.className = 'window panel-popout-window';
  popWin.style.width  = Math.min(cfg.defaultW, viewport.clientWidth) + 'px';
  popWin.style.height = cfg.defaultH + 'px';
  // Sanitise title to avoid XSS — cfg.title is a static string but belt-and-braces
  const safeTitle = cfg.title.replace(/[<>&"]/g, c =>
    ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;' }[c]));
  popWin.innerHTML = `
    <div class="title-bar">
      <div class="title-bar-text">${safeTitle}</div>
      <div class="title-bar-controls">
        <button aria-label="Minimize"></button>
        <button aria-label="Maximize"></button>
        <button aria-label="Close"></button>
      </div>
    </div>
    <div class="window-body panel-popout-body"></div>`;

  const body     = popWin.querySelector('.panel-popout-body');
  const closeBtn = popWin.querySelector('button[aria-label="Close"]');

  // stopImmediatePropagation prevents the WM's close handler from firing;
  // we handle WM cleanup ourselves after the collapse animation.
  closeBtn.addEventListener('click', e => {
    e.stopImmediatePropagation();
    _restore(win, panel, placeholder, parent, nextSibling, popWin, cfg, viewport);
  });

  // Move panel into popup
  panel.classList.add('panel-popped-out');
  body.appendChild(panel);

  // Register with the window manager (this also appends popWin to viewport)
  addWindow(popWin, viewport);

  // Clamp to settle the final target position
  _clampWindow(popWin, viewport);
  const toX = parseFloat(popWin.style.left)   || 0;
  const toY = parseFloat(popWin.style.top)    || 0;
  const toW = parseFloat(popWin.style.width)  || cfg.defaultW;
  const toH = parseFloat(popWin.style.height) || cfg.defaultH;

  // Animate: stamp button rect as start, hide content, flush, then transition to target
  body.style.display = 'none';
  popWin.classList.add('wm-transitioning');
  popWin.style.left   = fromX + 'px';
  popWin.style.top    = fromY + 'px';
  popWin.style.width  = fromW + 'px';
  popWin.style.height = fromH + 'px';
  popWin.getBoundingClientRect(); // force layout flush

  popWin.style.transition =
    `left ${POPOUT_ANIM_MS}ms linear, top ${POPOUT_ANIM_MS}ms linear,` +
    ` width ${POPOUT_ANIM_MS}ms linear, height ${POPOUT_ANIM_MS}ms linear`;
  popWin.style.left   = toX + 'px';
  popWin.style.top    = toY + 'px';
  popWin.style.width  = toW + 'px';
  popWin.style.height = toH + 'px';

  setTimeout(() => {
    popWin.style.transition = '';
    popWin.classList.remove('wm-transitioning');
    body.style.display = '';
    // Connect resize observer only after animation so clamp doesn't fight it
    const _vpResizeObs = new ResizeObserver(() => _clampWindow(popWin, viewport));
    _vpResizeObs.observe(viewport);
    popWin._popoutResizeObs = _vpResizeObs;
  }, POPOUT_ANIM_MS + 20);

  // Update splitters now that the panel has left the main layout
  _updateLayout(win);

  // Disable corresponding View menu checkbox
  const viewBtn = document.getElementById(cfg.viewBtnId);
  if (viewBtn) viewBtn.disabled = true;
}

// ─── Restore ─────────────────────────────────────────────────────────────────

function _restore(win, panel, placeholder, parent, nextSibling, popWin, cfg, viewport) {
  // Disconnect resize observer immediately so clamp doesn't fight the animation
  if (popWin._popoutResizeObs) {
    popWin._popoutResizeObs.disconnect();
    delete popWin._popoutResizeObs;
  }

  // Move panel back to its original slot immediately
  panel.classList.remove('panel-popped-out');
  delete panel.dataset.poppedOut;

  if (placeholder.parentElement) {
    placeholder.parentElement.insertBefore(panel, placeholder);
    placeholder.remove();
  } else if (nextSibling && nextSibling.parentElement === parent) {
    parent.insertBefore(panel, nextSibling);
  } else {
    parent.appendChild(panel);
  }

  // Re-enable View menu checkbox and re-apply layout
  const viewBtn = document.getElementById(cfg.viewBtnId);
  if (viewBtn) viewBtn.disabled = false;
  _updateLayout(win);

  // Capture the panel rect now that it's back in the main layout
  const panelRectTo = panel.getBoundingClientRect();
  const vpRect    = viewport.getBoundingClientRect();
  const toX = panelRectTo.left - vpRect.left;
  const toY = panelRectTo.top  - vpRect.top;
  const toW = panelRectTo.width;
  const toH = panelRectTo.height;

  // Animate popWin collapsing back toward the button
  const body = popWin.querySelector('.panel-popout-body');
  if (body) body.style.display = 'none'; // panel already gone; hide empty body
  popWin.classList.add('wm-transitioning');
  popWin.style.left   = popWin.offsetLeft   + 'px';
  popWin.style.top    = popWin.offsetTop    + 'px';
  popWin.style.width  = popWin.offsetWidth  + 'px';
  popWin.style.height = popWin.offsetHeight + 'px';
  popWin.getBoundingClientRect(); // force layout flush

  popWin.style.transition =
    `left ${POPOUT_ANIM_MS}ms linear, top ${POPOUT_ANIM_MS}ms linear,` +
    ` width ${POPOUT_ANIM_MS}ms linear, height ${POPOUT_ANIM_MS}ms linear`;
  popWin.style.left   = toX + 'px';
  popWin.style.top    = toY + 'px';
  popWin.style.width  = toW + 'px';
  popWin.style.height = toH + 'px';

  setTimeout(() => removeWindow(popWin), POPOUT_ANIM_MS + 20);
}

// ─── Viewport clamp ──────────────────────────────────────────────────────────

/**
 * Keep the pop-out window within the viewport horizontally.
 * Skips maximized windows (their title-bar Restore button is the tell).
 */
function _clampWindow(win, viewport) {
  if (win.querySelector('.title-bar-controls [aria-label="Restore"]')) return;
  const vw   = viewport.clientWidth;
  const curW = parseInt(win.style.width)  || 0;
  const curL = parseInt(win.style.left)   || 0;
  const newW = Math.min(curW, vw);
  const newL = Math.max(0, Math.min(curL, vw - newW));
  if (newW !== curW) win.style.width = newW + 'px';
  if (newL !== curL) win.style.left  = newL + 'px';
}

// ─── Splitter / top-row visibility ───────────────────────────────────────────

/**
 * After any pop-out or restore, recalculate which splitters and rows should
 * be visible based on which panels are currently *in the main layout*.
 *
 * A panel is "in the main layout" when its dataset.poppedOut is not 'true'.
 * We also respect the view menu's data-checked state so that panels hidden via
 * the View menu are treated as absent too.
 */
export function updatePanelLayout(win) {
  _updateLayout(win);
}

function _updateLayout(win) {
  const panelLeft   = win.querySelector('#panel-left');
  const panelRight  = win.querySelector('#panel-right');
  const panelBottom = win.querySelector('#panel-bottom');
  const splitterV   = win.querySelector('#splitter-v');
  const splitterH   = win.querySelector('#splitter-h');
  const topRow      = win.querySelector('#panel-top-row');

  const _inLayout = (panel, viewId) => {
    if (!panel) return false;
    if (panel.dataset.poppedOut === 'true') return false;
    const btn = document.getElementById(viewId);
    return !btn || btn.dataset.checked !== 'false';
  };

  const hasLeft   = _inLayout(panelLeft,   'view-pane-input');
  const hasRight  = _inLayout(panelRight,  'view-pane-canvas');
  const hasBottom = _inLayout(panelBottom, 'view-pane-output');

  // When canvas is absent from the layout, let input pane fill the full width
  if (panelLeft && panelLeft.dataset.poppedOut !== 'true') {
    panelLeft.style.flex = (hasLeft && !hasRight) ? '1' : '';
  }

  if (splitterV) splitterV.style.display = (hasLeft && hasRight) ? '' : 'none';
  if (topRow)    topRow.style.display    = (hasLeft || hasRight) ? '' : 'none';
  if (splitterH) splitterH.style.display = ((hasLeft || hasRight) && hasBottom) ? '' : 'none';
}
