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

import { addWindow } from './windowManager.js';

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
 * @param {HTMLElement} win      — #win-notepad element
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

function _popOut(win, viewport, panel, cfg) {
  // Record parent + insert position for later restoration
  const parent      = panel.parentElement;
  const nextSibling = panel.nextSibling;

  // Insert a zero-size placeholder so we know where to put it back
  const placeholder = document.createElement('div');
  placeholder.className = 'panel-popout-placeholder';
  placeholder.style.cssText = 'display:none;flex:none;width:0;height:0;overflow:hidden;';
  parent.insertBefore(placeholder, panel);

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

  // Add our restore listener BEFORE addWindow registers the WM listener.
  // Both are on the same target element; at AT_TARGET phase they fire in
  // registration order, so ours runs first and moves the panel back before
  // the WM's handler removes popWin from the DOM.
  closeBtn.addEventListener('click', () => {
    _restore(win, panel, placeholder, parent, nextSibling, popWin, cfg);
  });

  // Move panel into popup
  panel.classList.add('panel-popped-out');
  body.appendChild(panel);

  // Register with the window manager (this also appends popWin to viewport)
  addWindow(popWin, viewport);

  // Clamp position after WM sets cascade coords, then keep clamped on resize
  _clampWindow(popWin, viewport);
  const _vpResizeObs = new ResizeObserver(() => _clampWindow(popWin, viewport));
  _vpResizeObs.observe(viewport);
  popWin._popoutResizeObs = _vpResizeObs;

  // Update splitters now that the panel has left the main layout
  _updateLayout(win);

  // Disable corresponding View menu checkbox
  const viewBtn = document.getElementById(cfg.viewBtnId);
  if (viewBtn) viewBtn.disabled = true;
}

// ─── Restore ─────────────────────────────────────────────────────────────────

function _restore(win, panel, placeholder, parent, nextSibling, popWin, cfg) {
  // Move panel back to its original position (before the placeholder, which
  // is at the original slot), then remove the placeholder
  panel.classList.remove('panel-popped-out');
  delete panel.dataset.poppedOut;

  // nextSibling is the element that was after the panel originally;
  // placeholder is now at that position — insert before placeholder, then remove it
  if (placeholder.parentElement) {
    placeholder.parentElement.insertBefore(panel, placeholder);
    placeholder.remove();
  } else if (nextSibling && nextSibling.parentElement === parent) {
    parent.insertBefore(panel, nextSibling);
  } else {
    parent.appendChild(panel);
  }

  // Let WM clean up popWin (its close handler runs next and calls win.remove())
  // which is fine because panel is no longer a descendant of popWin.

  // Disconnect the viewport resize observer
  if (popWin._popoutResizeObs) {
    popWin._popoutResizeObs.disconnect();
    delete popWin._popoutResizeObs;
  }

  // Re-enable View menu checkbox and re-apply layout
  const viewBtn = document.getElementById(cfg.viewBtnId);
  if (viewBtn) {
    viewBtn.disabled = false;
  }

  _updateLayout(win);
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
