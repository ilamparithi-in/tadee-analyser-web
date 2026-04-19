/**
 * diagrams.js — SVG diagram panes for the Analyser window.
 *
 * Pane 1: Bundled conductor arrangement         ← implemented
 * Pane 2: Line model circuit diagram            [placeholder]
 * Pane 3: Phasor diagram                        [placeholder]
 *
 * Public API
 *   initDiagramContainer(container)   — build DOM, draw placeholders
 *   updateDiagrams(inputs, outputs)   — redraw all panes after Compute
 *   bundleOffsets(scCount, spacing)   — exported for PDF report use
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const FONT   = "'Pixelated MS Sans Serif', 'MS Sans Serif', sans-serif";

const MIN_R_PX = 3;           // minimum visible sub-conductor radius in screen px
const FIXED_R_PX          = 7; // sub-conductor radius in good-looking (not-to-scale) mode
const TO_SCALE_R_PX        = 4;  // fixed small radius in to-scale mode — zoom in to see conductors
const FIXED_SC_SPACING_PX = 30; // sub-conductor spacing in good-looking mode

// ─── SVG helpers ─────────────────────────────────────────────────────────────

function _el(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/**
 * Draw a filled arrowhead with its tip at (tipX, tipY) pointing in
 * direction (dirX, dirY) (must be a unit vector).
 */
function _arrowhead(svg, tipX, tipY, dirX, dirY, AL, AW) {
  const bx = tipX - dirX * AL;
  const by = tipY - dirY * AL;
  svg.appendChild(_el('polygon', {
    points: [
      `${tipX},${tipY}`,
      `${bx - dirY * AW},${by + dirX * AW}`,
      `${bx + dirY * AW},${by - dirX * AW}`,
    ].join(' '),
    fill: '#555',
  }));
}

/** Responsive SVG — fills parent, no fixed viewBox; screen px = SVG user units. */
function _mkSvg() {
  return _el('svg', { width: '100%', height: '100%', style: 'display:block;' });
}

function _makePane(title, extraClass) {
  const pane   = document.createElement('div');
  pane.className = 'dpane' + (extraClass ? ' ' + extraClass : '');

  const titleEl = document.createElement('div');
  titleEl.className = 'dpane-title';

  const titleText = document.createElement('span');
  titleText.className   = 'dpane-title-text';
  titleText.textContent = title;

  const controls = document.createElement('div');
  controls.className = 'dpane-controls';

  titleEl.append(titleText, controls);

  const body = document.createElement('div');
  body.className = 'dpane-body';

  pane.append(titleEl, body);
  return [pane, body, controls];
}

const DPANE_ANIM_MS = 150;

/** Wire up maximize / restore toggle on a pane. */
function _initMaximizeBtn(btn, pane) {
  btn.dataset.tooltip = 'Maximize';
  let _animating = false;
  btn.addEventListener('click', () => {
    if (_animating) return;
    const grid = pane.closest('.diagram-grid');
    if (!grid) {
      const maximized = pane.classList.toggle('dpane--maximized');
      btn.dataset.active  = maximized ? 'true' : 'false';
      btn.dataset.tooltip = maximized ? 'Restore' : 'Maximize';
      return;
    }

    const willMaximize = !pane.classList.contains('dpane--maximized');
    const gridRect = grid.getBoundingClientRect();

    // FROM rect — current state (relative to grid)
    const fromRect = pane.getBoundingClientRect();
    const fromX = fromRect.left - gridRect.left;
    const fromY = fromRect.top  - gridRect.top;
    const fromW = fromRect.width;
    const fromH = fromRect.height;

    // TO rect — toggle class, measure, revert (all sync; no repaint between)
    pane.classList.toggle('dpane--maximized');
    const toRect = pane.getBoundingClientRect();
    const toX = toRect.left - gridRect.left;
    const toY = toRect.top  - gridRect.top;
    const toW = toRect.width;
    const toH = toRect.height;
    pane.classList.toggle('dpane--maximized'); // revert until animation ends

    // Animate dotted outline from→to
    _animating = true;
    const outline = document.createElement('div');
    outline.style.cssText =
      `position:absolute;box-sizing:border-box;pointer-events:none;z-index:10;` +
      `border:2px dotted #000;` +
      `left:${fromX}px;top:${fromY}px;width:${fromW}px;height:${fromH}px;`;
    grid.appendChild(outline);
    outline.getBoundingClientRect(); // force layout flush
    outline.style.transition =
      `left ${DPANE_ANIM_MS}ms linear,top ${DPANE_ANIM_MS}ms linear,` +
      `width ${DPANE_ANIM_MS}ms linear,height ${DPANE_ANIM_MS}ms linear`;
    outline.style.left   = toX + 'px';
    outline.style.top    = toY + 'px';
    outline.style.width  = toW + 'px';
    outline.style.height = toH + 'px';

    setTimeout(() => {
      outline.remove();
      if (willMaximize) pane.classList.add('dpane--maximized');
      else              pane.classList.remove('dpane--maximized');
      btn.dataset.active  = willMaximize ? 'true' : 'false';
      btn.dataset.tooltip = willMaximize ? 'Restore' : 'Maximize';
      _animating = false;
    }, DPANE_ANIM_MS + 20);
  });
}

// ─── Module state ─────────────────────────────────────────────────────────────

let _svgBundle  = null;
let _svgCircuit = null;
let _svgPhasor  = null;

// Zoom/pan state for Pane 1.
// tx, ty  : translation in screen px (world origin → screen)
// scale   : screen px per metre
// inputs  : last inputs from Compute (null = no data yet)
const _bs = { tx: 0, ty: 0, scale: 1, inputs: null };

// Interactive view transform layered on top of the base fit.
// Updated directly (no redraw) on wheel/drag/pinch — like a real pinch-zoom.
// panX, panY : additive translation (screen px)
// zoom       : additive scale factor (1 = no extra zoom)
let _view = { zoom: 1, panX: 0, panY: 0 };

// The <g> element that wraps all drawn SVG content inside _svgBundle.
let _bundleG = null;

// Separate overlay <g> for phase dim lines + labels — gets translate-only transform
// so annotations stay fixed screen-size while the conductors zoom.
let _annotG  = null;

// AbortController for Pane 1 event listeners — cleaned up on reinit
let _bundleAC = null;

// Whether to draw circles proportional to physical dimensions (true) or fixed-size (false)
let _toScale = false;

// HTML overlay elements for pane 1 bottom bar (set in initDiagramContainer)
let _bottomBar     = null;
let _overlayRadius = null;
let _overlayScale  = null;

// Pane 2 title text element (updated dynamically with the model name)
let _circuitTitleEl = null;

// Distributed model view toggle: 'ladder' | 'diff'
let _distMode    = 'ladder';
let _distModeBtn = null;  // the toggle button element

// Zoom/pan state for Pane 2 (circuit diagram — CSS transform on _circuitG)
let _viewCircuit  = { zoom: 1, panX: 0, panY: 0 };
let _circuitAC    = null;
let _circuitG     = null;
let _lastOutputs  = null;  // last outputs from updateDiagrams

// Zoom/pan state for Pane 3 (phasor diagram — CSS transform on _phasorG)
let _viewPhasor   = { zoom: 1, panX: 0, panY: 0 };
let _phasorAC     = null;
let _phasorG      = null;
let _phasorLabels    = true;  // show arm names + values table
let _phasorLegendEl = null;   // DOM element for V/I scale legend in bottom bar
let _phasorChkWrap  = null;   // labels checkbox wrapper — hidden until first compute

// ─── Public API ───────────────────────────────────────────────────────────────

// ─── Diagram-grid drag splitters ─────────────────────────────────────────────

function _initDiagramSplitters(grid, splitterV, splitterH) {
  const MIN_COL =  80; // min px for left column (arrangement + phasor)
  const MIN_ROW =  60; // min px for arrangement row or phasor row
  const SPLIT   =   5; // splitter element thickness in px

  // Vertical splitter: drag left/right changes --dg-col1
  splitterV.addEventListener('pointerdown', e => {
    e.preventDefault();
    splitterV.setPointerCapture(e.pointerId);
    const startX     = e.clientX;
    const startWidth = splitterV.getBoundingClientRect().left - grid.getBoundingClientRect().left;
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e) {
      const gridW = grid.getBoundingClientRect().width;
      const newW  = Math.max(MIN_COL, Math.min(startWidth + (e.clientX - startX), gridW - SPLIT - MIN_COL));
      grid.style.setProperty('--dg-col1', newW + 'px');
    }
    function onUp() {
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
  });

  // Horizontal splitter: drag up/down changes --dg-row1
  splitterH.addEventListener('pointerdown', e => {
    e.preventDefault();
    splitterH.setPointerCapture(e.pointerId);
    const startY      = e.clientY;
    const startHeight = splitterH.getBoundingClientRect().top - grid.getBoundingClientRect().top;
    document.body.style.cursor     = 'row-resize';
    document.body.style.userSelect = 'none';

    function onMove(e) {
      const gridH = grid.getBoundingClientRect().height;
      const newH  = Math.max(MIN_ROW, Math.min(startHeight + (e.clientY - startY), gridH - SPLIT - MIN_ROW));
      grid.style.setProperty('--dg-row1', newH + 'px');
    }
    function onUp() {
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
  });
}

export function initDiagramContainer(container) {
  if (_bundleAC)  { _bundleAC.abort();  _bundleAC  = null; }
  if (_circuitAC) { _circuitAC.abort(); _circuitAC = null; }
  if (_phasorAC)  { _phasorAC.abort();  _phasorAC  = null; }

  container.innerHTML = '';
  _bs.inputs   = null;
  _bundleG     = null;
  _annotG      = null;
  _circuitG    = null;
  _phasorG        = null;
  _phasorLegendEl = null;
  _phasorChkWrap  = null;
  _bottomBar      = null;
  _viewCircuit = { zoom: 1, panX: 0, panY: 0 };
  _viewPhasor  = { zoom: 1, panX: 0, panY: 0 };

  const grid = document.createElement('div');
  grid.className = 'diagram-grid';

  const [pane1, body1, controls1] = _makePane('Conductor Arrangement', 'dpane-arrangement');
  _svgBundle = _mkSvg();
  _svgBundle.style.cursor = 'grab';

  // Wrapper holds SVG + bottom overlay bar (checkbox, radius, scale)
  const svgWrap = document.createElement('div');
  svgWrap.className = 'dpane-svg-wrap';

  const bottomBar = document.createElement('div');
  bottomBar.className = 'dpane-bottom-bar';

  // 98.css checkbox requires input BEFORE label as siblings (not input inside label)
  const chkWrap = document.createElement('div');
  chkWrap.className = 'dpane-checkbox-wrap';
  const chkScale = document.createElement('input');
  chkScale.type    = 'checkbox';
  chkScale.id      = 'dpane-toscale-chk';
  chkScale.checked = _toScale;
  chkScale.addEventListener('change', () => {
    _toScale = chkScale.checked;
    if (_bs.inputs) _fitBundleView();
    _redrawArrangement();
  });
  const lblToScale = document.createElement('label');
  lblToScale.setAttribute('for', 'dpane-toscale-chk');
  lblToScale.textContent = 'To scale';
  chkWrap.append(chkScale, lblToScale);

  _overlayRadius = document.createElement('span');
  _overlayRadius.className = 'dpane-overlay-info';

  _overlayScale = document.createElement('span');
  _overlayScale.className = 'dpane-overlay-info dpane-overlay-scale';

  bottomBar.append(chkWrap, _overlayRadius, _overlayScale);
  _bottomBar = bottomBar;
  svgWrap.append(_svgBundle, bottomBar);
  body1.appendChild(svgWrap);

  // Zoom-reset button
  const btnZoomReset = document.createElement('button');
  btnZoomReset.className       = 'dpane-btn';
  btnZoomReset.textContent     = '\u2316'; // ⌖
  btnZoomReset.dataset.tooltip = 'Reset zoom';
  btnZoomReset.addEventListener('click', () => { _fitBundleView(); _redrawArrangement(); });
  controls1.appendChild(btnZoomReset);
  // Maximize button
  const btnMax1 = document.createElement('button');
  btnMax1.className   = 'dpane-btn';
  btnMax1.textContent = '\u25A1'; // □
  _initMaximizeBtn(btnMax1, pane1);
  controls1.appendChild(btnMax1);

  const [pane2, body2, controls2] = _makePane('Circuit Diagram', 'dpane-circuit');
  _circuitTitleEl = pane2.querySelector('.dpane-title-text');
  _svgCircuit = _mkSvg();
  _svgCircuit.style.cursor = 'grab';

  const svgWrap2 = document.createElement('div');
  svgWrap2.className = 'dpane-svg-wrap';
  svgWrap2.appendChild(_svgCircuit);
  body2.appendChild(svgWrap2);

  // Zoom-reset button for circuit pane
  const btnZoomReset2 = document.createElement('button');
  btnZoomReset2.className       = 'dpane-btn';
  btnZoomReset2.textContent     = '\u2316';
  btnZoomReset2.dataset.tooltip = 'Reset zoom';
  btnZoomReset2.addEventListener('click', () => {
    _viewCircuit = { zoom: 1, panX: 0, panY: 0 };
    if (_circuitG) _circuitG.setAttribute('transform', '');
  });
  controls2.appendChild(btnZoomReset2);

  // Distributed-mode toggle (hidden by default; shown only when model=2)
  _distModeBtn = document.createElement('button');
  _distModeBtn.className       = 'dpane-btn dpane-btn-text';
  _distModeBtn.textContent     = '\u0394';
  _distModeBtn.dataset.tooltip = 'Switch to d/dx view';
  _distModeBtn.style.display   = 'none';
  _distModeBtn.addEventListener('click', () => {
    _distMode = _distMode === 'ladder' ? 'diff' : 'ladder';
    _distModeBtn.textContent     = _distMode === 'ladder' ? '\u0394' : '\u2261';
    _distModeBtn.dataset.tooltip = _distMode === 'ladder' ? 'Switch to d/dx view' : 'Switch to ladder view';
    if (_bs.inputs && _lastOutputs) _redrawCircuit(_bs.inputs, _lastOutputs);
  });
  controls2.appendChild(_distModeBtn);

  const btnMax2 = document.createElement('button');
  btnMax2.className   = 'dpane-btn';
  btnMax2.textContent = '\u25A1';
  _initMaximizeBtn(btnMax2, pane2);
  controls2.appendChild(btnMax2);

  _initCircuitZoom(_svgCircuit);

  const [pane3, body3, controls3] = _makePane('Phasor Diagram', 'dpane-phasor');
  _svgPhasor = _mkSvg();
  _svgPhasor.style.cursor = 'grab';

  const svgWrap3 = document.createElement('div');
  svgWrap3.className = 'dpane-svg-wrap';
  svgWrap3.appendChild(_svgPhasor);

  const bottomBar3 = document.createElement('div');
  bottomBar3.className = 'dpane-bottom-bar';
  bottomBar3.style.cssText = 'flex-direction:column;align-items:flex-start;';

  _phasorLegendEl = document.createElement('div');
  _phasorLegendEl.className = 'dpane-overlay-info';
  _phasorLegendEl.style.cssText = 'white-space:normal;display:none;';
  bottomBar3.appendChild(_phasorLegendEl);

  const chkWrap3 = document.createElement('div');
  chkWrap3.className = 'dpane-checkbox-wrap';
  const chkLbls = document.createElement('input');
  chkLbls.type    = 'checkbox';
  chkLbls.id      = 'dpane-phasor-labels-chk';
  chkLbls.checked = _phasorLabels;
  chkLbls.addEventListener('change', () => {
    _phasorLabels = chkLbls.checked;
    if (_bs.inputs && _lastOutputs) _redrawPhasor(_bs.inputs, _lastOutputs);
  });
  const lblLbls = document.createElement('label');
  lblLbls.setAttribute('for', 'dpane-phasor-labels-chk');
  lblLbls.textContent = 'Labels';
  chkWrap3.append(chkLbls, lblLbls);
  chkWrap3.style.display = 'none';
  _phasorChkWrap = chkWrap3;
  bottomBar3.appendChild(chkWrap3);
  svgWrap3.appendChild(bottomBar3);
  body3.appendChild(svgWrap3);

  // Zoom-reset button for phasor pane
  const btnZoomReset3 = document.createElement('button');
  btnZoomReset3.className       = 'dpane-btn';
  btnZoomReset3.textContent     = '\u2316';
  btnZoomReset3.dataset.tooltip = 'Reset zoom';
  btnZoomReset3.addEventListener('click', () => {
    _viewPhasor = { zoom: 1, panX: 0, panY: 0 };
    if (_bs.inputs && _lastOutputs) _redrawPhasor(_bs.inputs, _lastOutputs);
    else if (_phasorG) _phasorG.setAttribute('transform', '');
  });
  controls3.appendChild(btnZoomReset3);

  const btnMax3 = document.createElement('button');
  btnMax3.className   = 'dpane-btn';
  btnMax3.textContent = '\u25A1';
  _initMaximizeBtn(btnMax3, pane3);
  controls3.appendChild(btnMax3);

  const splitterV = document.createElement('div');
  splitterV.className = 'dg-splitter-v';
  const splitterH = document.createElement('div');
  splitterH.className = 'dg-splitter-h';

  grid.append(pane1, splitterH, pane3, splitterV, pane2);
  container.appendChild(grid);
  _initDiagramSplitters(grid, splitterV, splitterH);

  _initBundleZoom(_svgBundle);
  _initPhasorZoom(_svgPhasor);
  _drawArrangementPlaceholder();
  _drawStaticPlaceholder(_svgCircuit);
  _drawStaticPlaceholder(_svgPhasor);
}

export function updateDiagrams(inputs, outputs) {
  _bs.inputs   = inputs;
  _lastOutputs = outputs;
  // Defer to rAF so SVG elements have layout dimensions before we fit/draw.
  requestAnimationFrame(() => {
    _fitBundleView();
    _redrawArrangement();
    _redrawCircuit(inputs, outputs);
    _redrawPhasor(inputs, outputs);
  });
}

// ─── Sub-conductor bundle geometry ───────────────────────────────────────────

/**
 * Returns [[dx, dy], …] offsets for each sub-conductor from the bundle centre.
 * `spacing` is the centre-to-centre distance in any consistent unit.
 *
 * 2 → vertical pair
 * 3 → inverted equilateral triangle (two on top, apex bottom)
 * 4 → square
 *
 * Exported for reuse in the PDF report.
 */
export function bundleOffsets(scCount, spacing) {
  const s = spacing;
  switch (scCount) {
    case 2: return [
      [0, -s / 2],
      [0, +s / 2],
    ];
    case 3: {
      const h = s * Math.sqrt(3) / 2;
      return [
        [-s / 2, -h / 3],       // top-left
        [+s / 2, -h / 3],       // top-right
        [0,      +2 * h / 3],   // apex (bottom) — inverted triangle
      ];
    }
    case 4: return [
      [-s / 2, -s / 2],
      [+s / 2, -s / 2],
      [+s / 2, +s / 2],
      [-s / 2, +s / 2],
    ];
    default: return [[0, 0]];
  }
}

// ─── Zoom / pan for Pane 1 ────────────────────────────────────────────────────

function _initBundleZoom(svg) {
  _bundleAC = new AbortController();
  const sig = { signal: _bundleAC.signal };

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const rect   = svg.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    _zoomAround(e.clientX - rect.left, e.clientY - rect.top, factor);
  }, { passive: false, ...sig });

  let drag = null;
  svg.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); // suppress text selection during drag
    drag = { x: e.clientX, y: e.clientY };
    svg.style.cursor = 'grabbing';
  }, sig);
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    _view.panX += e.clientX - drag.x;
    _view.panY += e.clientY - drag.y;
    drag = { x: e.clientX, y: e.clientY };
    _applyViewTransform();
  }, sig);
  window.addEventListener('mouseup', () => {
    drag = null;
    svg.style.cursor = 'grab';
  }, sig);

  let pinch = null;
  svg.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      const rect = svg.getBoundingClientRect();
      pinch = {
        dist: _touchDist(e.touches),
        mx:   (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        my:   (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
      };
    }
  }, { passive: true, ...sig });
  svg.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && pinch) {
      e.preventDefault();
      const d = _touchDist(e.touches);
      _zoomAround(pinch.mx, pinch.my, d / pinch.dist);
      pinch.dist = d;
    }
  }, { passive: false, ...sig });
  svg.addEventListener('touchend', () => { pinch = null; }, { passive: true, ...sig });

  new ResizeObserver(() => {
    if (_bs.inputs) _fitBundleView();
    _redrawArrangement();
  }).observe(svg);
}

function _zoomAround(pivotX, pivotY, factor) {
  _view.panX = pivotX + (_view.panX - pivotX) * factor;
  _view.panY = pivotY + (_view.panY - pivotY) * factor;
  _view.zoom *= factor;
  _applyViewTransform();
  _redrawAnnotations(); // zoom changes annotation coords — must redraw
}

function _touchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Apply the current _view transform to the content groups — no redraw needed for pan. */
function _applyViewTransform() {
  if (!_bundleG) return;
  _bundleG.setAttribute('transform',
    `translate(${_view.panX},${_view.panY}) scale(${_view.zoom})`);
  // Annotation layer gets only the pan translate; zoom is baked into coords inside _redrawAnnotations.
  if (_annotG) _annotG.setAttribute('transform', `translate(${_view.panX},${_view.panY})`);
}

// ─── Zoom / pan for Pane 2 (circuit diagram) ─────────────────────────────────

function _initCircuitZoom(svg) {
  _circuitAC = new AbortController();
  const sig = { signal: _circuitAC.signal };

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const rect   = svg.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    _viewCircuit.panX = px + (_viewCircuit.panX - px) * factor;
    _viewCircuit.panY = py + (_viewCircuit.panY - py) * factor;
    _viewCircuit.zoom *= factor;
    _applyCircuitTransform();
  }, { passive: false, ...sig });

  let drag = null;
  svg.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag = { x: e.clientX, y: e.clientY };
    svg.style.cursor = 'grabbing';
  }, sig);
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    _viewCircuit.panX += e.clientX - drag.x;
    _viewCircuit.panY += e.clientY - drag.y;
    drag = { x: e.clientX, y: e.clientY };
    _applyCircuitTransform();
  }, sig);
  window.addEventListener('mouseup', () => {
    drag = null;
    if (svg) svg.style.cursor = 'grab';
  }, sig);

  let pinch = null;
  svg.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      const rect = svg.getBoundingClientRect();
      pinch = {
        dist: _touchDist(e.touches),
        mx: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        my: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
      };
    }
  }, { passive: true, ...sig });
  svg.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && pinch) {
      e.preventDefault();
      const d = _touchDist(e.touches);
      const f = d / pinch.dist;
      _viewCircuit.panX = pinch.mx + (_viewCircuit.panX - pinch.mx) * f;
      _viewCircuit.panY = pinch.my + (_viewCircuit.panY - pinch.my) * f;
      _viewCircuit.zoom *= f;
      pinch.dist = d;
      _applyCircuitTransform();
    }
  }, { passive: false, ...sig });
  svg.addEventListener('touchend', () => { pinch = null; }, { passive: true, ...sig });

  new ResizeObserver(() => {
    if (_bs.inputs && _lastOutputs) _redrawCircuit(_bs.inputs, _lastOutputs);
  }).observe(svg);
}

function _applyCircuitTransform() {
  if (!_circuitG) return;
  _circuitG.setAttribute('transform',
    `translate(${_viewCircuit.panX},${_viewCircuit.panY}) scale(${_viewCircuit.zoom})`);
}

function _initPhasorZoom(svg) {
  _phasorAC = new AbortController();
  const sig = { signal: _phasorAC.signal };

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const rect   = svg.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    _viewPhasor.panX = px + (_viewPhasor.panX - px) * factor;
    _viewPhasor.panY = py + (_viewPhasor.panY - py) * factor;
    _viewPhasor.zoom *= factor;
    if (_bs.inputs && _lastOutputs) _redrawPhasor(_bs.inputs, _lastOutputs);
  }, { passive: false, ...sig });

  let drag = null;
  svg.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag = { x: e.clientX, y: e.clientY };
    svg.style.cursor = 'grabbing';
  }, sig);
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    _viewPhasor.panX += e.clientX - drag.x;
    _viewPhasor.panY += e.clientY - drag.y;
    drag = { x: e.clientX, y: e.clientY };
    if (_phasorG) _phasorG.setAttribute('transform', `translate(${_viewPhasor.panX},${_viewPhasor.panY})`);
  }, sig);
  window.addEventListener('mouseup', () => {
    drag = null;
    if (svg) svg.style.cursor = 'grab';
  }, sig);

  let pinch = null;
  svg.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      const rect = svg.getBoundingClientRect();
      pinch = {
        dist: _touchDist(e.touches),
        mx: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        my: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
      };
    }
  }, { passive: true, ...sig });
  svg.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && pinch) {
      e.preventDefault();
      const d = _touchDist(e.touches);
      const f = d / pinch.dist;
      _viewPhasor.panX = pinch.mx + (_viewPhasor.panX - pinch.mx) * f;
      _viewPhasor.panY = pinch.my + (_viewPhasor.panY - pinch.my) * f;
      _viewPhasor.zoom *= f;
      pinch.dist = d;
      if (_bs.inputs && _lastOutputs) _redrawPhasor(_bs.inputs, _lastOutputs);
    }
  }, { passive: false, ...sig });
  svg.addEventListener('touchend', () => { pinch = null; }, { passive: true, ...sig });

  new ResizeObserver(() => {
    if (_bs.inputs && _lastOutputs) _redrawPhasor(_bs.inputs, _lastOutputs);
  }).observe(svg);
}

function _applyPhasorTransform() {
  if (!_phasorG) return;
  _phasorG.setAttribute('transform',
    `translate(${_viewPhasor.panX},${_viewPhasor.panY}) scale(${_viewPhasor.zoom})`);
}

/**
 * Compute the three phase centre positions in metres, centred at the
 * world origin (centroid).  Returns { A:[x,y], B:[x,y], C:[x,y] }.
 *
 * Symmetric  : equilateral triangle, side D.
 *              A at top, B bottom-left, C bottom-right.
 * Asymmetric : proper triangle from Dab/Dbc/Dca.
 *              A upper-left, B upper-right, C bottom (centroid-centred).
 *
 * Exported so the PDF report can call it directly.
 */
export function phasePositions(inputs) {
  const sym = inputs.symmetric === 1 || inputs.symmetric === '1';

  if (sym) {
    const D = inputs.phaseSpacingM;
    const h = D * Math.sqrt(3) / 2;
    return {
      A: [0,        -2 * h / 3],
      B: [-D / 2,   +h / 3],
      C: [+D / 2,   +h / 3],
    };
  }

  // Asymmetric: orient with the longest edge as horizontal base (two phases at
  // the bottom, one at the top), then centre on the centroid.
  const ab = inputs.Dab, bc = inputs.Dbc, ca = inputs.Dca;

  // Choose P1/P2 as the longest-side pair; P3 is the apex.
  let D12, D13, D23, P1n, P2n, P3n;
  if (ab >= bc && ab >= ca) {
    D12 = ab; D13 = ca; D23 = bc; P1n = 'A'; P2n = 'B'; P3n = 'C';
  } else if (bc >= ab && bc >= ca) {
    D12 = bc; D13 = ab; D23 = ca; P1n = 'B'; P2n = 'C'; P3n = 'A';
  } else {
    D12 = ca; D13 = bc; D23 = ab; P1n = 'C'; P2n = 'A'; P3n = 'B';
  }

  // Place P1 at (−D12/2, 0) and P2 at (+D12/2, 0) on the base line.
  // Solve for apex P3 using the two known edge lengths.
  const px  = (D13 * D13 - D23 * D23) / (2 * D12);
  const py2 = D13 * D13 - (px + D12 / 2) * (px + D12 / 2);
  // py is negative so the apex sits ABOVE the base in SVG (smaller y = higher).
  const py  = py2 > 0 ? -Math.sqrt(py2) : 0;

  // Centre on centroid.
  const gx = px / 3;          // gx = (−D12/2 + D12/2 + px) / 3
  const gy = py / 3;          // gy < 0

  const result = {};
  result[P1n] = [-D12 / 2 - gx, -gy]; // base-left  (y > 0 → lower on screen)
  result[P2n] = [+D12 / 2 - gx, -gy]; // base-right (y > 0 → lower on screen)
  result[P3n] = [px - gx,  py - gy];  // apex       (y < 0 → higher on screen)
  return result;
}

function _fitBundleView() {
  _view = { zoom: 1, panX: 0, panY: 0 };
  const svg = _svgBundle;
  const sw  = Math.max(svg.clientWidth  || 300, 385);
  const sh  = Math.max(svg.clientHeight || 300, 300);

  if (!_bs.inputs) {
    _bs.scale = (Math.min(sw, sh) * 0.3) / 0.04;
    _bs.tx = sw / 2; _bs.ty = sh / 2;
    return;
  }

  const { scStrands, strandDiaM } = _bs.inputs;
  const layers = (3 + Math.sqrt(12 * scStrands - 3)) / 6;
  const rPhys  = (2 * layers - 1) * strandDiaM / 2;

  const phases = phasePositions(_bs.inputs);
  const pts    = Object.values(phases);
  const xs = pts.map(p => p[0]);
  const ys = pts.map(p => p[1]);
  const physW = (Math.max(...xs) - Math.min(...xs)) + 2 * rPhys;
  const physH = (Math.max(...ys) - Math.min(...ys)) + 2 * rPhys;

  _bs.scale = Math.min(
    (sw * 0.72) / (physW || 0.01),
    (sh * 0.72) / (physH || 0.01),
  );
  _bs.tx = sw / 2;
  _bs.ty = sh / 2;
}


// ─── Arrangement redraw ───────────────────────────────────────────────────────

function _redrawArrangement() {
  const svgEl = _svgBundle;
  if (!svgEl) return;
  svgEl.innerHTML = '';
  _bundleG = _el('g');
  svgEl.appendChild(_bundleG);
  // Annotation layer sits above conductors; translate-only (no scale applied here).
  _annotG = _el('g');
  svgEl.appendChild(_annotG);

  if (!_bs.inputs) {
    if (_overlayRadius) _overlayRadius.textContent = '';
    if (_overlayScale)  _overlayScale.textContent  = '';
    if (_bottomBar)     _bottomBar.style.display   = 'none';
    _drawArrangementPlaceholder();
    _applyViewTransform();
    return;
  }
  if (_bottomBar) _bottomBar.style.display = '';

  const { scCount, scStrands, strandDiaM, scSpacingM } = _bs.inputs;
  const { tx, ty, scale } = _bs;

  const layers = (3 + Math.sqrt(12 * scStrands - 3)) / 6;
  const rPhys  = (2 * layers - 1) * strandDiaM / 2;

  // In to-scale mode circles are fixed tiny dots so positions are to scale;
  // zoom in to see them spread apart properly.
  const dispR       = _toScale ? rPhys * scale : FIXED_R_PX;
  const dispSpacing = _toScale ? scSpacingM * scale : FIXED_SC_SPACING_PX;

  // Outermost rim of a bundle in screen px — used as offset base for phase dims
  const bundleExtent = dispSpacing / 2 + dispR;

  const phases = phasePositions(_bs.inputs);

  // ── Bundles (drawn into _bundleG which scales with zoom) ──────────────────
  const PHASE_ORDER = ['A', 'B', 'C'];
  const scr = ph => {
    const [wx, wy] = phases[ph];
    return [tx + wx * scale, ty + wy * scale];
  };
  PHASE_ORDER.forEach((ph, i) => {
    const [cx, cy] = scr(ph);
    // scSpacingM is passed null here — spacing dim goes into the annotation layer
    _drawBundle(
      _bundleG, cx, cy, scCount, dispR, dispSpacing,
      i === 0 ? rPhys : null,
      null,
    );
  });

  // Update bottom-bar overlays
  if (_overlayRadius) {
    _overlayRadius.textContent = `r\u00a0=\u00a0${(rPhys * 100).toFixed(2)}\u00a0cm`;
  }
  _drawScaleBadge();
  _applyViewTransform();
  // Dim lines and labels go into the non-scaling annotation layer.
  _redrawAnnotations();
}

/**
 * Redraw the annotation layer (_annotG): phase dimension lines + phase labels.
 * _annotG gets only a pan translate (no scale), so all drawn elements stay
 * fixed in screen-pixel size.  Positions are pre-multiplied by _view.zoom so
 * the dim endpoints track the zoomed conductor positions correctly.
 */
function _redrawAnnotations() {
  if (!_annotG) return;
  _annotG.innerHTML = '';
  if (!_bs.inputs) return;

  _annotG.setAttribute('transform', `translate(${_view.panX},${_view.panY})`);

  const { scCount, scStrands, strandDiaM, scSpacingM } = _bs.inputs;
  const { tx, ty, scale } = _bs;
  const z = _view.zoom;

  const layers = (3 + Math.sqrt(12 * scStrands - 3)) / 6;
  const rPhys  = (2 * layers - 1) * strandDiaM / 2;
  const dispR       = _toScale ? rPhys * scale : FIXED_R_PX;
  const dispSpacing = _toScale ? scSpacingM * scale : FIXED_SC_SPACING_PX;

  // Bundle outer-rim scaled into annotation coordinate space.
  const bundleExtent = (dispSpacing / 2 + dispR) * z;

  const phases = phasePositions(_bs.inputs);
  // Coords inside _annotG are base-position × zoom (no extra translate — that is
  // the group's own transform).
  const scr = ph => {
    const [wx, wy] = phases[ph];
    return [(tx + wx * scale) * z, (ty + wy * scale) * z];
  };

  // ── Phase spacing dimension lines (drawn first, behind labels) ────────────
  const sym = _bs.inputs.symmetric === 1 || _bs.inputs.symmetric === '1';
  if (sym) {
    const D = _bs.inputs.phaseSpacingM;
    _drawPhaseDim(_annotG, scr('A'), scr('B'), bundleExtent, `D = ${D.toFixed(1)}\u00a0m`);
  } else {
    const fmt = v => v >= 1 ? `${v.toFixed(1)}\u00a0m` : `${(v * 100).toFixed(1)}\u00a0cm`;
    _drawPhaseDim(_annotG, scr('A'), scr('B'), bundleExtent, `Dab = ${fmt(_bs.inputs.Dab)}`, 'top');
    _drawPhaseDim(_annotG, scr('B'), scr('C'), bundleExtent, `Dbc = ${fmt(_bs.inputs.Dbc)}`, 'top');
    _drawDcaHorizDim(
      _annotG, scr('A'), scr('C'),
      [scr('A'), scr('B'), scr('C')], bundleExtent,
      `Dca = ${fmt(_bs.inputs.Dca)}`,
    );
  }

  // ── Sub-conductor spacing annotation (phase A, non-scaling) ───────────────
  if (scCount >= 2) {
    const dispRZ       = dispR * z;
    const dispSpacingZ = dispSpacing * z;
    const offsetsZ     = bundleOffsets(scCount, dispSpacingZ);
    const [acx, acy]   = scr('A');
    const [dx0, dy0]   = offsetsZ[0];
    const [dx1, dy1]   = offsetsZ[1];
    const sCm = (scSpacingM * 100).toFixed(1);
    _drawSpacingDim(
      _annotG,
      acx + dx0, acy + dy0,
      acx + dx1, acy + dy1,
      dispRZ,
      `s = ${sCm}\u00a0cm`,
    );
  }

  // ── Phase labels ──────────────────────────────────────────────────────────
  const PHASE_COLORS = { A: '#cc0000', B: '#ccaa00', C: '#0000cc' };
  ['A', 'B', 'C'].forEach(ph => {
    const [cx, cy] = scr(ph);
    // Keep label gap fixed at 13px but offset from the zoomed bundle rim.
    const labelY = cy + dispR * z + 13;
    for (const [stroke, fill] of [['#fff', 'none'], ['none', PHASE_COLORS[ph]]]) {
      const t = _el('text', {
        x: cx, y: labelY,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-family': FONT, 'font-size': '12', 'font-weight': 'bold',
        fill, stroke, 'stroke-width': '3',
      });
      t.textContent = ph;
      _annotG.appendChild(t);
    }
  });
}


/**
 * Engineering dimension line between two bundle screen centres.
 * The dim line runs directly from centre A to centre B (no offset).
 * Arrowheads tip at the bundle centres.
 * side: 'top'    — label above the line (perp with smaller SVG y)
 *       'bottom' — label below the line (perp with larger SVG y)
 *       null     — auto: label outward from the centroid
 */
function _drawPhaseDim(svg, pA, pB, bundleExtent, label, side = null) {
  const [ax, ay] = pA, [bx, by] = pB;
  const dx = bx - ax, dy = by - ay;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return;

  const ux = dx / dist, uy = dy / dist;
  const AL = 6, AW = 3;

  // Dim line from centre to centre
  svg.appendChild(_el('line', {
    x1: ax, y1: ay, x2: bx, y2: by,
    stroke: '#555', 'stroke-width': '1', 'stroke-dasharray': '4,3',
  }));

  // Arrowheads at each end pointing outward (away from the other centre)
  _arrowhead(svg, ax, ay, -ux, -uy, AL, AW);
  _arrowhead(svg, bx, by, +ux, +uy, AL, AW);

  // Two perpendicular unit vectors to the dim line:
  //   perp1 = (-uy,  ux)  — 90° counter-clockwise
  //   perp2 = ( uy, -ux)  — 90° clockwise
  const [p1x, p1y] = [-uy, ux];
  const [p2x, p2y] = [ uy, -ux];
  let px, py;
  if (side === 'top') {
    // pick the direction whose y-component is more negative (points upward in SVG)
    [px, py] = p1y <= p2y ? [p1x, p1y] : [p2x, p2y];
  } else if (side === 'bottom') {
    // pick the direction whose y-component is more positive (points downward in SVG)
    [px, py] = p1y >= p2y ? [p1x, p1y] : [p2x, p2y];
  } else {
    // auto: outward from centroid. Annotation coords are pre-multiplied by _view.zoom,
    // so the centroid reference must also be zoom-scaled.
    const { tx, ty } = _bs;
    const z = _view.zoom;
    const omx = (ax + bx) / 2 - tx * z;
    const omy = (ay + by) / 2 - ty * z;
    const omLen = Math.sqrt(omx * omx + omy * omy);
    px = omLen > 0.001 ? omx / omLen : +uy;
    py = omLen > 0.001 ? omy / omLen : -ux;
  }

  const lmx = (ax + bx) / 2 + px * 14;
  const lmy = (ay + by) / 2 + py * 14;
  // White halo then coloured fill so label is readable over the dashed line
  const t = _el('text', {
    x: lmx, y: lmy,
    'text-anchor': 'middle', 'dominant-baseline': 'middle',
    'font-family': FONT, 'font-size': '10', fill: '#222',
    stroke: '#fff', 'stroke-width': '2.5', 'paint-order': 'stroke',
  });
  t.textContent = label;
  svg.appendChild(t);
}

/**
 * Dca dimension: drop vertical tick lines from phase A and phase C down to a
 * common y level safely below all bundles, then draw a horizontal arrow between
 * them with the label above it.
 *
 * allPhaseScreenPts — array of [x,y] screen coords for all phases (to find
 *                     the lowest y so we can drop far enough below).
 * bundleExtent      — outer radius of a bundle in screen px.
 */
function _drawDcaHorizDim(svg, pA, pC, allPhaseScreenPts, bundleExtent, label) {
  const [ax, ay] = pA;
  const [cx, cy] = pC;

  const dx = cx - ax;
  const dist = Math.abs(dx);
  if (dist < 1) return;
  const ux = dx / dist; // +1 if C is to the right of A, −1 otherwise

  // Drop zone: well below the lowest bundle rim + padding to clear Dab/Dbc labels
  const maxPY  = Math.max(...allPhaseScreenPts.map(p => p[1]));
  const dropY  = maxPY + bundleExtent + 52; // 52px headroom below lowest bundle

  const AL = 6, AW = 3;
  const tickTop = bundleExtent + 4; // start tick just outside the bundle rim

  // Vertical tick / leader from A downward
  svg.appendChild(_el('line', {
    x1: ax, y1: ay + tickTop,
    x2: ax, y2: dropY + 4,
    stroke: '#777', 'stroke-width': '0.75', 'stroke-dasharray': '3,2',
  }));

  // Vertical tick / leader from C downward
  svg.appendChild(_el('line', {
    x1: cx, y1: cy + tickTop,
    x2: cx, y2: dropY + 4,
    stroke: '#777', 'stroke-width': '0.75', 'stroke-dasharray': '3,2',
  }));

  // Horizontal dashed dim line at dropY
  svg.appendChild(_el('line', {
    x1: ax, y1: dropY, x2: cx, y2: dropY,
    stroke: '#555', 'stroke-width': '1', 'stroke-dasharray': '4,3',
  }));

  // Arrowheads: point outward (away from each other)
  _arrowhead(svg, ax, dropY, -ux,  0, AL, AW);
  _arrowhead(svg, cx, dropY, +ux,  0, AL, AW);

  // Label above the horizontal line
  const lx = (ax + cx) / 2;
  const ly = dropY - 10;
  const t = _el('text', {
    x: lx, y: ly,
    'text-anchor': 'middle', 'dominant-baseline': 'middle',
    'font-family': FONT, 'font-size': '10', fill: '#222',
    stroke: '#fff', 'stroke-width': '2.5', 'paint-order': 'stroke',
  });
  t.textContent = label;
  svg.appendChild(t);
}

// ─── Bundle drawing ───────────────────────────────────────────────────────────

/**
 * Draw `scCount` sub-conductor circles centred at (cx, cy).
 * `dispR`       — display radius (screen px); already clamped to MIN_R_PX
 * `dispSpacing` — display sub-conductor centre-to-centre (screen px)
 * `rPhys`       — physical radius (m) for label text
 * `scSpacingM`  — physical sub-conductor spacing (m) for label text
 */
function _drawBundle(svg, cx, cy, scCount, dispR, dispSpacing, rPhys, scSpacingM) {
  const offsets = bundleOffsets(scCount, dispSpacing);

  offsets.forEach(([dx, dy]) => {
    svg.appendChild(_el('circle', {
      cx: cx + dx, cy: cy + dy, r: dispR,
      fill: '#e8e8e8', stroke: '#333', 'stroke-width': '1.5',
    }));
  });

  // Radius annotation — only when rPhys is provided (phase A only)
  if (rPhys != null) {
    const [dx0, dy0] = offsets[0];
    const ox = cx + dx0;
    const oy = cy + dy0;

    // Arrow points left (toward -x), tip on left rim of first sub-conductor
    const ARROW_LEN = Math.min(6, dispR * 0.35);
    const ARROW_W   = ARROW_LEN * 0.5;
    svg.appendChild(_el('line', {
      x1: ox, y1: oy,
      x2: ox - dispR + ARROW_LEN, y2: oy,
      stroke: '#555', 'stroke-width': '0.75', 'stroke-dasharray': '2,2',
    }));
    // Arrowhead tip on circumference, pointing left
    svg.appendChild(_el('polygon', {
      points: [
        `${ox - dispR},${oy}`,
        `${ox - dispR + ARROW_LEN},${oy - ARROW_W}`,
        `${ox - dispR + ARROW_LEN},${oy + ARROW_W}`,
      ].join(' '),
      fill: '#555',
    }));
  }

  // Sub-conductor spacing dimension — only when scSpacingM is provided (phase A only)
  if (scCount >= 2 && scSpacingM != null) {
    const [dx0, dy0] = offsets[0];
    const [dx1, dy1] = offsets[1];
    const sCm = (scSpacingM * 100).toFixed(1);
    _drawSpacingDim(
      svg,
      cx + dx0, cy + dy0,
      cx + dx1, cy + dy1,
      dispR,
      `s = ${sCm}\u00a0cm`,
    );
  }
}

/**
 * Draw an engineering dimension line between two sub-conductor centres
 * (ax,ay) and (bx,by), offset outward from the bundle, with inward
 * arrowheads and a centred label.
 */
function _drawSpacingDim(svg, ax, ay, bx, by, dispR, label) {
  const dx   = bx - ax, dy = by - ay;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return;

  const ux = dx / dist, uy = dy / dist;   // unit along AB
  // Perp offset toward the natural outer side:
  //   vertical pair  → right  (+y perp of down = +right)
  //   horizontal pair → up    (+y perp of right = +up... wait)
  // Using (+uy, -ux): for AB=(0,+1) → perp=(+1,0) right ✓
  //                   for AB=(+1,0) → perp=(0,-1) up   ✓
  const px = +uy, py = -ux;

  const OFFSET = dispR + 16;  // dim line distance from circle centres
  const EXT    = 5;           // extension line overshoot past dim line
  const AL     = 5, AW = 2.5; // arrowhead size (fixed — not inside a circle)

  // Extension lines: from just outside each circle rim → past dim line
  const extStart = dispR + 2;
  [[ax, ay], [bx, by]].forEach(([cx2, cy2]) => {
    svg.appendChild(_el('line', {
      x1: cx2 + px * extStart, y1: cy2 + py * extStart,
      x2: cx2 + px * (OFFSET + EXT), y2: cy2 + py * (OFFSET + EXT),
      stroke: '#777', 'stroke-width': '0.75',
    }));
  });

  // Dim line endpoints
  const lax = ax + px * OFFSET, lay = ay + py * OFFSET;
  const lbx = bx + px * OFFSET, lby = by + py * OFFSET;

  svg.appendChild(_el('line', {
    x1: lax, y1: lay, x2: lbx, y2: lby,
    stroke: '#555', 'stroke-width': '1',
  }));

  // Inward arrowheads: tip at each end, pointing toward the other
  _arrowhead(svg, lax, lay, +ux, +uy, AL, AW);  // A tip → toward B
  _arrowhead(svg, lbx, lby, -ux, -uy, AL, AW);  // B tip → toward A

  // Label at midpoint, nudged further outward so it clears the dim line
  const mx = (lax + lbx) / 2 + px * 8;
  const my = (lay + lby) / 2 + py * 8;
  const t = _el('text', {
    x: mx, y: my,
    'text-anchor': 'middle', 'dominant-baseline': 'middle',
    'font-family': FONT, 'font-size': '10', fill: '#222',
  });
  t.textContent = label;
  svg.appendChild(t);
}

// ─── Circuit diagram (Pane 2) ─────────────────────────────────────────────────

function _fmtPhasor(re, im, unit, decimals = 2) {
  const mag = Math.sqrt(re * re + im * im);
  const ang = Math.atan2(im, re) * 180 / Math.PI;
  return `${mag.toFixed(decimals)}\u2220${ang >= 0 ? '+' : ''}${ang.toFixed(1)}\u00b0\u00a0${unit}`;
}

function _fmtRect(re, im, unit, dec) {
  const sign = im >= 0 ? '\u00a0+\u00a0j' : '\u00a0\u2212\u00a0j';
  return `${re.toFixed(dec)}${sign}${Math.abs(im).toFixed(dec)}\u00a0${unit}`;
}

// ─── Wire and junction primitives ────────────────────────────────────────────

function _wireSeg(parent, x1, y1, x2, y2) {
  parent.appendChild(_el('line', { x1, y1, x2, y2, stroke: '#333', 'stroke-width': '1.5' }));
}

function _junctionDot(parent, x, y) {
  parent.appendChild(_el('circle', { cx: x, cy: y, r: 3, fill: '#333' }));
}

// ─── US schematic symbols ─────────────────────────────────────────────────────

/** US zigzag resistor (horizontal). x1/x2 = outer wire attachment points. */
function _drawResistor(parent, x1, y, x2) {
  const W = 32, H = 7, n = 6;
  const cx = (x1 + x2) / 2, bL = cx - W / 2, bR = cx + W / 2;
  _wireSeg(parent, x1, y, bL, y);
  _wireSeg(parent, bR, y, x2, y);
  const pts = [[bL, y]];
  for (let i = 0; i < n; i++) pts.push([bL + (i + 0.5) * W / n, y + (i % 2 === 0 ? -H : H)]);
  pts.push([bR, y]);
  parent.appendChild(_el('polyline', {
    points: pts.map(p => p.join(',')).join(' '),
    fill: 'none', stroke: '#333', 'stroke-width': '1.5', 'stroke-linejoin': 'round',
  }));
}

/** US inductor bumps (horizontal, 4 arcs above wire). x1/x2 = outer wire attachment points. */
function _drawInductor(parent, x1, y, x2) {
  const nBumps = 4, W = 32;
  const cx = (x1 + x2) / 2, bL = cx - W / 2;
  const r   = W / (2 * nBumps);
  _wireSeg(parent, x1, y, bL, y);
  _wireSeg(parent, bL + W, y, x2, y);
  let d = `M ${bL},${y}`;
  for (let i = 0; i < nBumps; i++) {
    // sweep=1 (CW in SVG y-down) → arc goes above the wire line
    d += ` A ${r},${r} 0 0,1 ${bL + (i + 1) * r * 2},${y}`;
  }
  parent.appendChild(_el('path', { d, fill: 'none', stroke: '#333', 'stroke-width': '1.5' }));
}

/**
 * Series RL: if hasR draws zigzag (left half) + bumps (right half),
 * otherwise just bumps spanning the full range.
 */
function _drawSeriesRL(parent, x1, y, x2, hasR) {
  if (hasR) {
    const mid = (x1 + x2) / 2;
    _drawResistor(parent, x1, y, mid);
    _drawInductor(parent, mid, y, x2);
  } else {
    _drawInductor(parent, x1, y, x2);
  }
}

/**
 * Vertical shunt capacitor.  topY = junction on main wire, gndY = ground symbol top.
 */
function _drawShuntCap(parent, x, topY, gndY) {
  const plateW = 14, gap = 5, midY = (topY + gndY) / 2;
  _wireSeg(parent, x, topY, x, midY - gap / 2);
  _wireSeg(parent, x, midY + gap / 2, x, gndY);
  for (const dy of [-gap / 2, gap / 2]) {
    parent.appendChild(_el('line', {
      x1: x - plateW / 2, y1: midY + dy, x2: x + plateW / 2, y2: midY + dy,
      stroke: '#333', 'stroke-width': '2.5',
    }));
  }
}

function _drawGround(parent, x, y) {
  [14, 9, 4].forEach((w, i) => {
    parent.appendChild(_el('line', {
      x1: x - w / 2, y1: y + i * 4.5, x2: x + w / 2, y2: y + i * 4.5,
      stroke: '#333', 'stroke-width': '1.5',
    }));
  });
}

/** Small open-circle node (terminal junction). */
function _termNode(parent, x, y) {
  parent.appendChild(_el('circle', { cx: x, cy: y, r: 3,
    fill: 'white', stroke: '#333', 'stroke-width': '1.5' }));
}

/**
 * Upward voltage arrow from (x, botY) to (x, topY).
 * side: 'left'  → label to the left  (text-anchor end)
 *       'right' → label to the right (text-anchor start)
 */
function _drawVoltageArrow(parent, x, topY, botY, label, side) {
  const AL = 6, AW = 3;
  parent.appendChild(_el('line', { x1: x, y1: botY, x2: x, y2: topY + AL,
    stroke: '#555', 'stroke-width': '1.5' }));
  _arrowhead(parent, x, topY, 0, -1, AL, AW);
  const lx = side === 'left' ? x - 8 : x + 8;
  // Label sits just below the arrowhead tip (near the top wire)
  _circuitLabel(parent, lx, topY + 14, label, side === 'left' ? 'end' : 'start');
}

// ─── ABCD helpers ─────────────────────────────────────────────────────────────

/** Compute IR (kA) via ABCD back-calc: IR = (VS − A·VR) / B */
function _computeIR(inputs, outputs) {
  const Vr    = inputs.nomSyskV / Math.sqrt(3);
  const numRe = outputs.Vs_phase_kV.re - outputs.A.re * Vr;
  const numIm = outputs.Vs_phase_kV.im - outputs.A.im * Vr;
  const denom = outputs.B.re ** 2 + outputs.B.im ** 2;
  return {
    re: denom > 0 ? (numRe * outputs.B.re + numIm * outputs.B.im) / denom : 0,
    im: denom > 0 ? (numIm * outputs.B.re - numRe * outputs.B.im) / denom : 0,
  };
}

/** IS in kA.  outputs.Is_A stores values in Amperes despite the name. */
function _IS_kA(outputs) {
  return { re: outputs.Is_A.re / 1e3, im: outputs.Is_A.im / 1e3 };
}

// ─── Per-model circuit renderers ──────────────────────────────────────────────

function _redrawCircuit(inputs, outputs) {
  const svg = _svgCircuit;
  if (!svg) return;
  svg.innerHTML = '';
  _circuitG = _el('g');
  svg.appendChild(_circuitG);
  _applyCircuitTransform();

  const sw = svg.clientWidth  || 500;
  const sh = svg.clientHeight || 300;

  const MODEL_NAMES = ['Short Line', 'Nominal \u03c0', 'Distributed'];
  if (_circuitTitleEl)
    _circuitTitleEl.textContent =
      `Circuit Diagram \u2014 ${MODEL_NAMES[inputs.model] ?? 'Unknown'}`;

  // Show/hide the distributed-mode toggle button
  if (_distModeBtn)
    _distModeBtn.style.display = inputs.model === 2 ? '' : 'none';

  if      (inputs.model === 0) _drawShortCircuit(_circuitG, svg, sw, sh, inputs, outputs);
  else if (inputs.model === 1) _drawNominalPiCircuit(_circuitG, svg, sw, sh, inputs, outputs);
  else if (_distMode === 'diff') _drawDistributedDiff(_circuitG, svg, sw, sh, inputs, outputs);
  else                           _drawDistributedCircuit(_circuitG, svg, sw, sh, inputs, outputs);
}

function _drawShortCircuit(g, svg, sw, sh, inputs, outputs) {
  const PAD  = 30;
  const topY = Math.max(sh * 0.40, 90);
  const botY = topY + 56;
  const leftX  = PAD + 90;   // leave room for VS label on the left
  const rightX = sw - PAD - 90;
  const hasR   = Math.abs(outputs.B.re) > 0.001;

  // ── Return wire ───────────────────────────────────────────────────────────
  _wireSeg(g, leftX, botY, rightX, botY);
  _termNode(g, leftX,  botY);
  _termNode(g, rightX, botY);

  // ── Top wire + series element ─────────────────────────────────────────────
  const SERIES_W = Math.min(140, (rightX - leftX) * 0.50);
  const midX = (leftX + rightX) / 2;
  const serL = midX - SERIES_W / 2;
  const serR = midX + SERIES_W / 2;

  _wireSeg(g, leftX,  topY, serL, topY);
  _drawSeriesRL(g, serL, topY, serR, hasR);
  _wireSeg(g, serR, topY, rightX, topY);
  _termNode(g, leftX,  topY);
  _termNode(g, rightX, topY);

  // Z label below series element (series bumps protrude 7px above topY)
  _circuitLabel(g, midX, topY + 16,
    'Z\u00a0=\u00a0' + _fmtRect(outputs.B.re, outputs.B.im, '\u03a9', 3), 'middle');

  // ── Voltage arrows (name only) ────────────────────────────────────────────
  const Vr_kV = inputs.nomSyskV / Math.sqrt(3);
  _drawVoltageArrow(g, leftX,  topY, botY, 'VS', 'left');
  _drawVoltageArrow(g, rightX, topY, botY, 'VR', 'right');

  // ── Current arrows (name only) ────────────────────────────────────────────
  const arrowY = topY - 26;
  const IS = _IS_kA(outputs);
  const IR = _computeIR(inputs, outputs);
  _drawCurrentArrow(g, leftX  + 4, serL - 3, arrowY, 'IS');
  _drawCurrentArrow(g, serR + 3, rightX - 4, arrowY, 'IR');

  // ── Bottom-right values table ─────────────────────────────────────────────
  _circuitValuesTable(svg, svg.clientWidth || sw, svg.clientHeight || sh, [
    { label: 'VS', value: _fmtPhasor(outputs.Vs_phase_kV.re, outputs.Vs_phase_kV.im, 'kV') },
    { label: 'VR', value: Vr_kV.toFixed(3) + '\u2220+0.0\u00b0\u00a0kV' },
    { label: 'IS', value: _fmtPhasor(IS.re, IS.im, 'kA', 3) },
    { label: 'IR', value: _fmtPhasor(IR.re, IR.im, 'kA', 3) },
  ]);
}

function _drawNominalPiCircuit(g, svg, sw, sh, inputs, outputs) {
  const PAD  = 30;
  const topY = Math.max(sh * 0.35, 80);
  const botY = topY + 80;
  const leftX  = PAD + 90;
  const rightX = sw - PAD - 90;
  const hasR   = Math.abs(outputs.B.re) > 0.001;

  const juncL = leftX  + 32;
  const juncR = rightX - 32;

  // ── Return wire ───────────────────────────────────────────────────────────
  _wireSeg(g, leftX, botY, rightX, botY);
  _termNode(g, leftX,  botY);
  _termNode(g, rightX, botY);

  // ── Top wires + series element ────────────────────────────────────────────
  const SERIES_W = Math.min(130, (juncR - juncL) * 0.70);
  const midX = (juncL + juncR) / 2;
  const serL = midX - SERIES_W / 2;
  const serR = midX + SERIES_W / 2;

  _wireSeg(g, leftX, topY, juncL, topY);
  _wireSeg(g, juncL, topY, serL,  topY);
  _drawSeriesRL(g, serL, topY, serR, hasR);
  _wireSeg(g, serR, topY, juncR,  topY);
  _wireSeg(g, juncR, topY, rightX, topY);
  _termNode(g, leftX,  topY);
  _termNode(g, rightX, topY);
  _junctionDot(g, juncL, topY);
  _junctionDot(g, juncR, topY);

  // ── Y/2 shunts (cap connects junctions to return wire) ────────────────────
  _drawShuntCap(g, juncL, topY, botY);
  _drawShuntCap(g, juncR, topY, botY);
  _junctionDot(g, juncL, botY);
  _junctionDot(g, juncR, botY);

  // ── Labels ────────────────────────────────────────────────────────────────
  // Z: below series, above the cap midpoint
  _circuitLabel(g, midX, topY + 16,
    'Z\u00a0=\u00a0' + _fmtRect(outputs.B.re, outputs.B.im, '\u03a9', 3), 'middle');

  const Y_half = 1 / (2 * outputs.Xc);
  const Ylbl   = Y_half < 1e-3
    ? `j${(Y_half * 1e6).toFixed(1)}\u00a0\u03bcS`
    : `j${(Y_half * 1e3).toFixed(3)}\u00a0mS`;
  // Y/2 labels beside each cap, at the cap midpoint
  const capMidY = (topY + botY) / 2;
  _circuitLabel(g, juncL - 10, capMidY, 'Y/2\u00a0=\u00a0' + Ylbl, 'end');
  _circuitLabel(g, juncR + 10, capMidY, 'Y/2\u00a0=\u00a0' + Ylbl, 'start');

  // ── Voltage arrows (name only) ───────────────────────────────────────────────
  const Vr_kV = inputs.nomSyskV / Math.sqrt(3);
  const pVS  = outputs.Vs_phase_kV;
  const pVR  = { re: Vr_kV, im: 0 };
  _drawVoltageArrow(g, leftX,  topY, botY, 'VS', 'left');
  _drawVoltageArrow(g, rightX, topY, botY, 'VR', 'right');

  // ── Currents (name only on arrows, values in table) ─────────────────────────
  const arrowY = topY - 26;
  const IS = _IS_kA(outputs);
  const IR = _computeIR(inputs, outputs);
  _drawCurrentArrow(g, leftX  + 4, juncL - 4, arrowY, 'IS');
  _drawCurrentArrow(g, juncR + 4, rightX - 4, arrowY, 'IR');

  // IC1 = j(Y/2)·VR (receiving-end, right shunt), IC2 = j(Y/2)·VS (sending-end, left shunt)
  const pIC1 = { re: -pVR.im / (2 * outputs.Xc), im: pVR.re / (2 * outputs.Xc) };
  const pIC2 = { re: -pVS.im / (2 * outputs.Xc), im: pVS.re / (2 * outputs.Xc) };
  _drawCapCurrentArrow(g, juncR, topY, botY, 'IC1', 'right');
  _drawCapCurrentArrow(g, juncL, topY, botY, 'IC2', 'left');

  // ── Bottom-right values table ──────────────────────────────────────────────
  _circuitValuesTable(svg, svg.clientWidth || sw, svg.clientHeight || sh, [
    { label: 'VS',  value: _fmtPhasor(pVS.re,  pVS.im,  'kV') },
    { label: 'VR',  value: Vr_kV.toFixed(3) + '\u2220+0.0\u00b0\u00a0kV' },
    { label: 'IS',  value: _fmtPhasor(IS.re,   IS.im,   'kA', 3) },
    { label: 'IR',  value: _fmtPhasor(IR.re,   IR.im,   'kA', 3) },
    { label: 'IC1', value: _fmtPhasor(pIC1.re, pIC1.im, 'kA', 3) },
    { label: 'IC2', value: _fmtPhasor(pIC2.re, pIC2.im, 'kA', 3) },
  ]);
}

function _drawDistributedCircuit(g, svg, sw, sh, inputs, outputs) {
  // Fixed logical canvas width so elements never compress below comfortable size
  const CANVAS_W = Math.max(sw, 820);
  const PAD  = 30;
  const topY = Math.max(sh * 0.35, 80);
  const botY = topY + 90;          // more vertical headroom for caps
  const leftX  = PAD + 90;
  const rightX = CANVAS_W - PAD - 90;
  const hasR   = Math.abs(outputs.B.re) > 0.001;

  // Three cells: [cell][cap][cell][cap][···60px···][cell][cap][rightX]
  // Each cell gets a fixed comfortable width
  const CELL_W = hasR ? 170 : 130;   // wider when resistor is included
  const ELL_W  = 60;
  // Layout: leftX → cell1 → j1 → cell2 → j2 → ell → j3 → cell3 → j4 → rightX
  const j1    = leftX  + CELL_W;
  const j2    = j1     + CELL_W;
  const ellL  = j2;
  const ellR  = ellL   + ELL_W;
  const j3    = ellR;
  const j4    = j3     + CELL_W;
  // short wire from j4 to rightX
  const TRAIL = 30;
  // If j4 + TRAIL > rightX, push rightX out (canvas is pannable anyway)
  const actualRightX = Math.max(rightX, j4 + TRAIL);

  // ── Return wire ───────────────────────────────────────────────────────────
  _wireSeg(g, leftX, botY, actualRightX, botY);
  _termNode(g, leftX,        botY);
  _termNode(g, actualRightX, botY);

  // ── Cell 1 ────────────────────────────────────────────────────────────────
  _drawSeriesRL(g, leftX + 2, topY, j1, hasR);
  _junctionDot(g, j1, topY);
  _drawShuntCap(g, j1, topY, botY);
  _junctionDot(g, j1, botY);

  // ── Cell 2 ────────────────────────────────────────────────────────────────
  _drawSeriesRL(g, j1, topY, j2, hasR);
  _junctionDot(g, j2, topY);
  _drawShuntCap(g, j2, topY, botY);
  _junctionDot(g, j2, botY);

  // ── Ellipsis break ────────────────────────────────────────────────────────
  for (const lineY of [topY, botY]) {
    _wireSeg(g, j2, lineY, ellL + 8, lineY);
    _wireSeg(g, ellR - 8, lineY, ellR, lineY);
    for (let d = 0; d < 3; d++)
      g.appendChild(_el('circle', { cx: ellL + 14 + d * 10, cy: lineY, r: 2.5, fill: '#555' }));
  }

  // ── Cell 3 (after ellipsis) ───────────────────────────────────────────────
  _drawSeriesRL(g, j3, topY, j4, hasR);
  _junctionDot(g, j3, topY);  // junction at left end of cell3
  _junctionDot(g, j3, botY);
  _junctionDot(g, j4, topY);
  _drawShuntCap(g, j4, topY, botY);
  _junctionDot(g, j4, botY);

  // Trail wire to right terminal
  _wireSeg(g, j4, topY, actualRightX, topY);
  _termNode(g, leftX,        topY);
  _termNode(g, actualRightX, topY);

  // ── Annotations ───────────────────────────────────────────────────────────
  _circuitLabel(g, leftX + CELL_W / 2, topY - 18, 'z\u00b7\u0394x', 'middle');
  _circuitLabel(g, j1 + 10, (topY + botY) / 2, 'y\u00b7\u0394x', 'start');

  const r_km = outputs.B.re / inputs.lineLengthKm;
  const x_km = outputs.B.im / inputs.lineLengthKm;
  const b_km = (1 / outputs.Xc) / inputs.lineLengthKm;
  _circuitLabel(g, (leftX + actualRightX) / 2, botY + 20,
    `z\u00a0=\u00a0${r_km.toFixed(3)}\u00a0+\u00a0j${x_km.toFixed(3)}\u00a0\u03a9/km` +
    `\u2002|\u2002b\u00a0=\u00a0${(b_km * 1e6).toFixed(2)}\u00a0\u03bcS/km`, 'middle');

  // ── Voltage arrows (name only) ────────────────────────────────────────────
  const Vr_kV = inputs.nomSyskV / Math.sqrt(3);
  _drawVoltageArrow(g, leftX,        topY, botY, 'VS', 'left');
  _drawVoltageArrow(g, actualRightX, topY, botY, 'VR', 'right');

  // ── Current arrows (name only) ────────────────────────────────────────────
  const IS = _IS_kA(outputs);
  const IR = _computeIR(inputs, outputs);
  const arrowY = topY - 28;
  _drawCurrentArrow(g, leftX + 4, leftX + CELL_W * 0.45, arrowY, 'IS');
  _drawCurrentArrow(g, j4 + 4, actualRightX - 4, arrowY, 'IR');

  // ── Bottom-right values table ─────────────────────────────────────────────
  _circuitValuesTable(svg, svg.clientWidth || sw, svg.clientHeight || sh, [
    { label: 'VS', value: _fmtPhasor(outputs.Vs_phase_kV.re, outputs.Vs_phase_kV.im, 'kV') },
    { label: 'VR', value: Vr_kV.toFixed(3) + '\u2220+0.0\u00b0\u00a0kV' },
    { label: 'IS', value: _fmtPhasor(IS.re, IS.im, 'kA', 3) },
    { label: 'IR', value: _fmtPhasor(IR.re, IR.im, 'kA', 3) },
  ]);
}

// ─── Distributed d/dx view (differential element) ────────────────────────────

function _drawDistributedDiff(g, svg, sw, sh, inputs, outputs) {
  const CANVAS_W = Math.max(sw, 820);
  const PAD  = 30;
  const topY = Math.max(sh * 0.32, 70);
  const botY = topY + 90;
  const leftX  = PAD + 90;
  const rightX = CANVAS_W - PAD - 90;
  const hasR   = Math.abs(outputs.B.re) > 0.001;
  const midX   = (leftX + rightX) / 2;

  // Box is wide enough to hold the series RL element comfortably
  const BOX_HALF = hasR ? 90 : 70;
  const boxL = midX - BOX_HALF, boxR = midX + BOX_HALF;

  // Dashed box border
  g.appendChild(_el('rect', {
    x: boxL, y: topY - 18, width: boxR - boxL, height: botY - topY + 36,
    fill: 'none', stroke: '#888', 'stroke-width': '1', 'stroke-dasharray': '5,3', rx: '3',
  }));

  // ── Top wire ─────────────────────────────────────────────────────────────
  for (let d = 0; d < 3; d++)
    g.appendChild(_el('circle', { cx: leftX + 14 + d * 10, cy: topY, r: 2.5, fill: '#555' }));
  _wireSeg(g, leftX + 44, topY, boxL, topY);
  _drawSeriesRL(g, boxL, topY, boxR, hasR);
  _wireSeg(g, boxR, topY, rightX - 44, topY);
  for (let d = 0; d < 3; d++)
    g.appendChild(_el('circle', { cx: rightX - 40 + d * 10, cy: topY, r: 2.5, fill: '#555' }));
  _termNode(g, leftX,  topY);
  _termNode(g, rightX, topY);

  // ── Shunt cap at right end of box ────────────────────────────────────────
  _junctionDot(g, boxR, topY);
  _drawShuntCap(g, boxR, topY, botY);
  _junctionDot(g, boxR, botY);

  // ── Bottom wire ───────────────────────────────────────────────────────────
  for (let d = 0; d < 3; d++)
    g.appendChild(_el('circle', { cx: leftX + 14 + d * 10, cy: botY, r: 2.5, fill: '#555' }));
  _wireSeg(g, leftX + 44, botY, rightX - 44, botY);
  for (let d = 0; d < 3; d++)
    g.appendChild(_el('circle', { cx: rightX - 40 + d * 10, cy: botY, r: 2.5, fill: '#555' }));
  _termNode(g, leftX,  botY);
  _termNode(g, rightX, botY);

  // ── dx dimension arrow ────────────────────────────────────────────────────
  const dimY = botY + 24;
  _wireSeg(g, boxL, dimY - 5, boxL, dimY + 5);
  _wireSeg(g, boxR, dimY - 5, boxR, dimY + 5);
  _wireSeg(g, boxL + 8, dimY, boxR - 8, dimY);
  _arrowhead(g, boxL, dimY, -1, 0, 6, 3);
  _arrowhead(g, boxR, dimY, +1, 0, 6, 3);
  _circuitLabel(g, midX, dimY + 15, 'dx', 'middle');

  // ── l dimension arrow ─────────────────────────────────────────────────────
  const dimY2 = dimY + 32;
  _wireSeg(g, leftX,  dimY2 - 5, leftX,  dimY2 + 5);
  _wireSeg(g, rightX, dimY2 - 5, rightX, dimY2 + 5);
  _wireSeg(g, leftX + 8, dimY2, rightX - 8, dimY2);
  _arrowhead(g, leftX,  dimY2, -1, 0, 6, 3);
  _arrowhead(g, rightX, dimY2, +1, 0, 6, 3);
  _circuitLabel(g, midX, dimY2 + 15, 'l\u00a0=\u00a0' + inputs.lineLengthKm.toFixed(1) + '\u00a0km', 'middle');

  // ── Labels ────────────────────────────────────────────────────────────────
  _circuitLabel(g, midX,      topY - 24, 'z(x)\u00b7dx', 'middle');
  _circuitLabel(g, boxR + 12, (topY + botY) / 2, 'y\u00b7dx', 'start');
  _circuitLabel(g, boxL + 6,  topY + 24, 'V+dV', 'start');
  _circuitLabel(g, boxR - 6,  topY + 24, 'V',    'end');

  // ── Voltage arrows (name only) ────────────────────────────────────────────
  const Vr_kV = inputs.nomSyskV / Math.sqrt(3);
  _drawVoltageArrow(g, leftX,  topY, botY, 'VS', 'left');
  _drawVoltageArrow(g, rightX, topY, botY, 'VR', 'right');

  // ── IS / IR current arrows (name only) ───────────────────────────────────
  const arrowY = topY - 10;
  const IS = _IS_kA(outputs);
  const IR = _computeIR(inputs, outputs);
  _drawCurrentArrow(g, leftX + 4, leftX + 44, arrowY, 'IS');
  _drawCurrentArrow(g, rightX - 48, rightX - 4, arrowY, 'IR');

  // ── Bottom-right values table ─────────────────────────────────────────────
  _circuitValuesTable(svg, svg.clientWidth || sw, svg.clientHeight || sh, [
    { label: 'VS', value: _fmtPhasor(outputs.Vs_phase_kV.re, outputs.Vs_phase_kV.im, 'kV') },
    { label: 'VR', value: Vr_kV.toFixed(3) + '\u2220+0.0\u00b0\u00a0kV' },
    { label: 'IS', value: _fmtPhasor(IS.re, IS.im, 'kA', 3) },
    { label: 'IR', value: _fmtPhasor(IR.re, IR.im, 'kA', 3) },
  ]);
}

// ─── Shared circuit label utilities ──────────────────────────────────────────

/** Rightward current arrow from x1 to x2 at height y, label centred above. */
function _drawCurrentArrow(parent, x1, x2, y, label) {
  if (x2 - x1 < 8) return;
  const AL = 5, AW = 2.5;
  parent.appendChild(_el('line', { x1, y1: y, x2: x2 - AL, y2: y, stroke: '#555', 'stroke-width': '1' }));
  _arrowhead(parent, x2, y, 1, 0, AL, AW);
  _circuitLabel(parent, (x1 + x2) / 2, y - 4, label, 'middle');
}

/**
 * Downward charging-current arrow offset beside a shunt cap.
 * side: 'left' | 'right' — which side of the cap wire to place the arrow.
 * Label is written below the arrowhead tip.
 */
function _drawCapCurrentArrow(parent, x, topY, botY, name, side = 'right') {
  const OFFSET = 16;
  const ax = side === 'right' ? x + OFFSET : x - OFFSET;
  const AL = 5, AW = 2.5;
  parent.appendChild(_el('line', { x1: ax, y1: topY, x2: ax, y2: botY - AL,
    stroke: '#555', 'stroke-width': '1' }));
  _arrowhead(parent, ax, botY, 0, 1, AL, AW);
  const anchor = side === 'right' ? 'start' : 'end';
  const labelX = ax + (side === 'right' ? 4 : -4);
  _circuitLabel(parent, labelX, botY + 10, name, anchor);
}

// ─── SVG subscript-text helper ──────────────────────────────────────────────
// Longest match first so 'IC1'/'IC2' are caught before 'IC'.
const _SVG_SUB = [
  ['IC1', 'I', 'C1'], ['IC2', 'I', 'C2'],
  ['VR',  'V', 'R' ], ['VS',  'V', 'S' ],
  ['IR',  'I', 'R' ], ['IS',  'I', 'S' ],
  ['IC',  'I', 'C' ], ['IL',  'I', 'L' ],
  ['XL',  'X', 'L' ], ['XC',  'X', 'C' ],
  ['Zc',  'Z', 'c' ],
];
/**
 * Append text to a SVG <text>/<tspan> element, applying subscript <tspan>
 * formatting to known variable names like VS, VR, IS, IR, IC1, IL, etc.
 */
function _svgSubText(el, text) {
  let rem = text;
  while (rem.length) {
    let hit = false;
    for (const [sym, base, sub] of _SVG_SUB) {
      if (rem.startsWith(sym)) {
        const b = _el('tspan'); b.textContent = base; el.appendChild(b);
        const s = _el('tspan', { 'font-size': '7', dy: '3' }); s.textContent = sub; el.appendChild(s);
        const r = _el('tspan', { dy: '-3' }); r.textContent = ''; el.appendChild(r);
        rem = rem.slice(sym.length); hit = true; break;
      }
    }
    if (!hit) {
      let end = 1;
      while (end < rem.length && !_SVG_SUB.some(([s]) => rem.slice(end).startsWith(s))) end++;
      const plain = _el('tspan'); plain.textContent = rem.slice(0, end); el.appendChild(plain);
      rem = rem.slice(end);
    }
  }
}

/**
 * Fixed bottom-right SVG values table (appended to svg, not the pannable g).
 * entries: [{label, value}]
 */
function _circuitValuesTable(svg, sw, sh, entries) {
  const ROW_H = 13, PAD_R = 8, PAD_B = 8;
  const startY = sh - PAD_B - entries.length * ROW_H;
  const tg = _el('g');
  svg.appendChild(tg);
  entries.forEach((entry, i) => {
    const rowY = startY + i * ROW_H + ROW_H / 2;
    for (const [stroke, fill] of [['#fff', 'none'], ['none', '#333']]) {
      const t = _el('text', {
        x: sw - PAD_R, y: rowY,
        'text-anchor': 'end', 'dominant-baseline': 'middle',
        'font-family': FONT, 'font-size': '9',
        fill, stroke, 'stroke-width': stroke === '#fff' ? '2.5' : '0', 'paint-order': 'stroke',
      });
      _svgSubText(t, entry.label);
      t.appendChild(document.createTextNode('\u00a0=\u00a0' + entry.value));
      tg.appendChild(t);
    }
  });
}

/** White-knockout text label, readable on any background. */
function _circuitLabel(parent, x, y, text, anchor = 'middle') {
  if (!text) return;
  for (const [stroke, fill] of [['#fff', 'none'], ['none', '#333']]) {
    const t = _el('text', {
      x, y, 'text-anchor': anchor, 'dominant-baseline': 'auto',
      'font-family': FONT, 'font-size': '10',
      fill, stroke, 'stroke-width': stroke === '#fff' ? '3' : '0', 'paint-order': 'stroke',
    });
    t.textContent = text;
    parent.appendChild(t);
  }
}

// ─── Scale badge ──────────────────────────────────────────────────────────────

function _drawScaleBadge() {
  if (!_overlayScale) return;
  if (!_toScale) {
    _overlayScale.style.display = 'none';
    return;
  }
  _overlayScale.style.display = '';
  const physPerPx = 1 / _bs.scale;
  _overlayScale.textContent = physPerPx < 1
    ? `1\u2009px\u00a0\u2248\u2009${(physPerPx * 1000).toFixed(2)}\u00a0mm`
    : `1\u2009px\u00a0\u2248\u2009${physPerPx.toFixed(3)}\u00a0m`;
}

// ─── Placeholders ─────────────────────────────────────────────────────────────

// ─── Pane 3: Phasor Diagram ───────────────────────────────────────────────────

/** Complex addition for plain {re,im} objects */
function cAdd(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
/** Complex magnitude */
function cMag(p)    { return Math.hypot(p.re, p.im); }

/**
 * Draw a coloured arrow from (ox, oy) by (dx, dy) in screen coords.
 * Optionally dashed. AL/AW = arrowhead length/half-width (optional, defaults 9/4.5).
 */
function _phasorVec(g, ox, oy, dx, dy, color, dashArray = null, AL = 9, AW = 4.5) {
  const tx = ox + dx, ty = oy + dy;
  const dist = Math.hypot(dx, dy);
  if (dist < 5) return;
  const udx = dx / dist, udy = dy / dist;
  const attrs = {
    x1: ox, y1: oy, x2: tx - udx * AL, y2: ty - udy * AL,
    stroke: color, 'stroke-width': '1.8',
  };
  if (dashArray) attrs['stroke-dasharray'] = dashArray;
  g.appendChild(_el('line', attrs));
  g.appendChild(_el('polygon', {
    points: [
      `${tx.toFixed(2)},${ty.toFixed(2)}`,
      `${(tx - udx*AL - udy*AW).toFixed(2)},${(ty - udy*AL + udx*AW).toFixed(2)}`,
      `${(tx - udx*AL + udy*AW).toFixed(2)},${(ty - udy*AL - udx*AW).toFixed(2)}`,
    ].join(' '),
    fill: color,
  }));
}

/**
 * Label at a phasor tip, offset in the phasor direction.
 * White-stroke knockout so it reads over any arrow.
 */
function _phasorLabel(g, tx, ty, color, text, dx, dy) {
  const dist = Math.hypot(dx, dy);
  const udx = dist > 0 ? dx / dist : 1;
  const udy = dist > 0 ? dy / dist : 0;
  const OFFSET = 14;
  const lx = tx + udx * OFFSET;
  const ly = ty + udy * OFFSET;
  const anchor = udx > 0.25 ? 'start' : udx < -0.25 ? 'end' : 'middle';
  const t = _el('text', {
    x: lx, y: ly,
    'text-anchor': anchor, 'dominant-baseline': 'middle',
    'font-family': FONT, 'font-size': '10', fill: color,
    stroke: '#fff', 'stroke-width': '3', 'stroke-linejoin': 'round',
    'paint-order': 'stroke fill',
  });
  t.textContent = text;
  g.appendChild(t);
}

/**
 * Name-only label at the mid-point of a phasor arm, offset perpendicularly.
 * (tx, ty) = absolute tip position; (dx, dy) = phasor direction vector.
 */
function _phasorArmLabel(g, tx, ty, color, name, dx, dy) {
  if (!_phasorLabels) return;
  const dist = Math.hypot(dx, dy);
  if (dist < 10) return;
  const mx = tx - dx / 2;
  const my = ty - dy / 2;
  const attrs = {
    x: mx, y: my,
    'text-anchor': 'middle', 'dominant-baseline': 'middle',
    'font-family': FONT, 'font-size': '10',
  };
  // Pass 1: white knockout (fill+stroke both white so tspan borders don't leak)
  const bg = _el('text', { ...attrs, fill: '#fff', stroke: '#fff', 'stroke-width': '3', 'stroke-linejoin': 'round', 'paint-order': 'stroke fill' });
  _svgSubText(bg, name);
  g.appendChild(bg);
  // Pass 2: colored fill, no stroke
  const fg = _el('text', { ...attrs, fill: color });
  _svgSubText(fg, name);
  g.appendChild(fg);
}

/**
 * Bottom-right value table.  entries = [{name, value, color}]
 * Appended directly to svg (not the pannable g) so it stays fixed.
 */
function _phasorValuesTable(svg, sw, sh, entries) {
  const ROW_H = 14, PAD_R = 8, PAD_B = 8;
  const startY = sh - PAD_B - entries.length * ROW_H;
  const tg = _el('g');
  svg.appendChild(tg);
  entries.forEach((entry, i) => {
    const rowY = startY + i * ROW_H + ROW_H / 2;
    const t = _el('text', {
      x: sw - PAD_R, y: rowY,
      'text-anchor': 'end', 'dominant-baseline': 'middle',
      'font-family': FONT, 'font-size': '9', fill: '#333',
    });
    const nameSpan = _el('tspan', { fill: entry.color });
    _svgSubText(nameSpan, entry.name);
    t.appendChild(nameSpan);
    t.appendChild(document.createTextNode('\u00a0=\u00a0' + entry.value));
    tg.appendChild(t);
  });
}

/** Small gray dashed construction arrow (thin, small head) */
function _conVec(g, ox, oy, dx, dy) {
  _phasorVec(g, ox, oy, dx, dy, '#888', '4,3', 6, 3);
}

/**
 * Small text at the midpoint of a construction segment,
 * offset perpendicularly so it doesn't sit on the arrow.
 */
function _conLabel(g, x1, y1, dx, dy, text) {
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return;
  const nx = -dy / dist * 9, ny = dx / dist * 9;
  const attrs = {
    x: x1 + dx / 2 + nx, y: y1 + dy / 2 + ny,
    'text-anchor': 'middle', 'dominant-baseline': 'middle',
    'font-family': FONT, 'font-size': '9',
  };
  const bg = _el('text', { ...attrs, fill: '#fff', stroke: '#fff', 'stroke-width': '2.5', 'stroke-linejoin': 'round', 'paint-order': 'stroke fill' });
  _svgSubText(bg, text);
  g.appendChild(bg);
  const fg = _el('text', { ...attrs, fill: '#666' });
  _svgSubText(fg, text);
  g.appendChild(fg);
}

/** Scale legend — updates the DOM bottom bar when live, falls back to SVG for PDF export. */
function _phasorLegend(svg, sh, scale_V, scale_I, cV, cI) {
  if (_phasorLegendEl) {
    _phasorLegendEl.textContent = '';
    const mkRow = (color, dashed, text) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:4px;';
      const sw = document.createElement('span');
      sw.style.cssText = `display:inline-block;width:20px;height:0;border-bottom:2px ${dashed ? 'dashed' : 'solid'} ${color};flex-shrink:0;`;
      const lb = document.createElement('span');
      lb.textContent = text;
      row.append(sw, lb);
      return row;
    };
    _phasorLegendEl.appendChild(mkRow(cV, false, `Voltage\u2002(1\u2009kV\u00a0=\u00a0${scale_V.toFixed(1)}\u2009px)`));
    _phasorLegendEl.appendChild(mkRow(cI, true,  `Current\u2002(1\u2009kA\u00a0=\u00a0${scale_I.toFixed(1)}\u2009px)`));
    _phasorLegendEl.style.display = '';
    return;
  }
  // SVG path (PDF export — no live DOM)
  const LX = 8, LY = sh - 36;
  const lg = _el('g');
  svg.appendChild(lg);
  lg.appendChild(_el('line', { x1: LX, y1: LY, x2: LX + 22, y2: LY,
    stroke: cV, 'stroke-width': '1.8' }));
  const tV = _el('text', { x: LX + 27, y: LY, 'dominant-baseline': 'middle',
    'font-family': FONT, 'font-size': '9', fill: '#333' });
  tV.textContent = `Voltage\u2002(1\u2009kV\u00a0=\u00a0${scale_V.toFixed(1)}\u2009px)`;
  lg.appendChild(tV);
  const CY = LY + 13;
  lg.appendChild(_el('line', { x1: LX, y1: CY, x2: LX + 22, y2: CY,
    stroke: cI, 'stroke-width': '1.8', 'stroke-dasharray': '6,3' }));
  const tI = _el('text', { x: LX + 27, y: CY, 'dominant-baseline': 'middle',
    'font-family': FONT, 'font-size': '9', fill: '#333' });
  tI.textContent = `Current\u2002(1\u2009kA\u00a0=\u00a0${scale_I.toFixed(1)}\u2009px)`;
  lg.appendChild(tI);
}

/**
 * Given a list of screen-relative points (relative to an unknown origin),
 * return (ox, oy) — the screen position of the origin — so the whole diagram
 * is centred with PAD margin on all sides.
 */
function _phasorOrigin(pts, sw, sh, PAD = 65, cw = null, ch = null) {
  cw = cw ?? sw;
  ch = ch ?? sh;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const ox = PAD - minX + Math.max(0, cw - 2 * PAD - (maxX - minX)) / 2;
  const oy = PAD - minY + Math.max(0, ch - 2 * PAD - (maxY - minY)) / 2;
  return { ox, oy };
}

function _redrawPhasor(inputs, outputs) {
  const svg = _svgPhasor;
  if (!svg) return;
  svg.innerHTML = '';
  _phasorG = _el('g');
  svg.appendChild(_phasorG);
  // Pan only — zoom is baked into the coordinate calculation below so that
  // arrowheads, stroke-widths and text stay constant screen-px while arm
  // lengths scale with _viewPhasor.zoom.
  if (_viewPhasor.panX !== 0 || _viewPhasor.panY !== 0)
    _phasorG.setAttribute('transform', `translate(${_viewPhasor.panX},${_viewPhasor.panY})`);
  if (_phasorChkWrap) _phasorChkWrap.style.display = '';
  const rw = svg.clientWidth  || 400;
  const rh = svg.clientHeight || 300;
  const sw = rw * _viewPhasor.zoom;
  const sh = rh * _viewPhasor.zoom;
  if      (inputs.model === 0) _drawShortPhasor(_phasorG, svg, sw, sh, rw, rh, inputs, outputs);
  else if (inputs.model === 1) _drawNominalPiPhasor(_phasorG, svg, sw, sh, rw, rh, inputs, outputs);
  else                          _drawDistPhasor(_phasorG, svg, sw, sh, rw, rh, inputs, outputs);
}

// ── Short line: VS = VR + IR·(R + jXL),  IS = IR ─────────────────────────────
function _drawShortPhasor(g, svg, sw, sh, rw, rh, inputs, outputs) {
  const VR_kV  = inputs.nomSyskV / Math.sqrt(3);
  const pVR    = { re: VR_kV, im: 0 };
  const pIR    = _computeIR(inputs, outputs);             // kA (= IS)
  const R = outputs.B.re, XL = outputs.B.im;
  const pIRRi  = { re: pIR.re * R,   im: pIR.im * R   }; // IR·R   kV
  const pIRXLi = { re: -pIR.im * XL, im: pIR.re * XL  }; // IR·jXL kV
  const pVS    = cAdd(cAdd(pVR, pIRRi), pIRXLi);

  const maxV = Math.max(cMag(pVR), cMag(pVS)) || 1;
  const maxI = cMag(pIR) || 0.001;
  const TGT  = Math.min(sw, sh) * 0.40;
  const sV   = TGT / maxV;
  const sI   = (TGT * 0.50) / maxI;
  const sv = p => ({ x: p.re * sV, y: -p.im * sV });
  const si = p => ({ x: p.re * sI, y: -p.im * sI });

  const vVR   = sv(pVR);
  const vVS   = sv(pVS);
  const vDRR  = sv(pIRRi);
  const vDXL  = sv(pIRXLi);
  const vInt  = { x: vVR.x + vDRR.x, y: vVR.y + vDRR.y };
  const iIR   = si(pIR);

  const { ox, oy } = _phasorOrigin(
    [{ x: 0, y: 0 }, vVR, vVS, vInt, iIR], sw, sh, 65, rw, rh);

  // Reference axis
  const axMax = Math.max(vVR.x, vVS.x, iIR.x, 0);
  g.appendChild(_el('line', { x1: ox - 15, y1: oy, x2: ox + axMax + 15, y2: oy,
    stroke: '#ccc', 'stroke-width': '0.7', 'stroke-dasharray': '4,4' }));

  // Construction: IR·R and IR·jXL drops chained from VR tip
  _conVec(g, ox + vVR.x, oy + vVR.y, vDRR.x, vDRR.y);
  _conVec(g, ox + vInt.x, oy + vInt.y, vDXL.x, vDXL.y);
  _conLabel(g, ox + vVR.x, oy + vVR.y, vDRR.x, vDRR.y, 'IR\u00b7R');
  _conLabel(g, ox + vInt.x, oy + vInt.y, vDXL.x, vDXL.y, 'IR\u00b7X\u2097');

  // Main phasors
  const C_VR = '#000099', C_VS = '#990000', C_I = '#005000';
  _phasorVec(g, ox, oy, vVR.x, vVR.y, C_VR);
  _phasorVec(g, ox, oy, vVS.x, vVS.y, C_VS);
  _phasorVec(g, ox, oy, iIR.x, iIR.y, C_I, '6,3');

  g.appendChild(_el('circle', { cx: ox, cy: oy, r: 3, fill: '#333' }));

  _phasorArmLabel(g, ox+vVR.x, oy+vVR.y, C_VR, 'VR', vVR.x, vVR.y);
  _phasorArmLabel(g, ox+vVS.x, oy+vVS.y, C_VS, 'VS', vVS.x, vVS.y);
  _phasorArmLabel(g, ox+iIR.x, oy+iIR.y, C_I,  'IR\u00a0=\u00a0IS', iIR.x, iIR.y);

  _phasorValuesTable(svg, rw, rh, [
    { name: 'VR',                 value: _fmtPhasor(VR_kV, 0, 'kV'),              color: C_VR },
    { name: 'VS',                 value: _fmtPhasor(pVS.re, pVS.im, 'kV'),        color: C_VS },
    { name: 'IR\u00a0=\u00a0IS', value: _fmtPhasor(pIR.re, pIR.im, 'kA', 3),    color: C_I  },
  ]);
  _phasorLegend(svg, rh, sV, sI, C_VR, C_I);
}

// ── Nominal π: full textbook construction (Fig 2.8.6) ────────────────────────
//   VR ref → IR lagging → IC1 = j(Y/2)VR → IL = IR+IC1
//   VS = VR + IL·R + IL·jXL (voltage chain)
//   IC2 = j(Y/2)VS → IS = IL+IC2
function _drawNominalPiPhasor(g, svg, sw, sh, rw, rh, inputs, outputs) {
  const VR_kV = inputs.nomSyskV / Math.sqrt(3);
  const pVR   = { re: VR_kV, im: 0 };
  const pIR   = _computeIR(inputs, outputs);             // kA

  // IC1 = j·(Y/2)·VR,  Y = 1/Xc  →  j·VR/(2·Xc)  [kA]
  const pIC1  = { re: -pVR.im / (2 * outputs.Xc), im: pVR.re / (2 * outputs.Xc) };
  const pIL   = cAdd(pIR, pIC1);                         // line current kA

  const R = outputs.B.re, XL = outputs.B.im;
  const pILRi  = { re: pIL.re * R,   im: pIL.im * R   }; // IL·R   kV
  const pILXLi = { re: -pIL.im * XL, im: pIL.re * XL  }; // IL·jXL kV
  const pVS    = cAdd(cAdd(pVR, pILRi), pILXLi);         // ≈ outputs.Vs_phase_kV

  // IC2 = j·(Y/2)·VS  [kA]
  const pIC2  = { re: -pVS.im / (2 * outputs.Xc), im: pVS.re / (2 * outputs.Xc) };
  const pIS   = cAdd(pIL, pIC2);                         // ≈ _IS_kA(outputs)

  const maxV = Math.max(cMag(pVR), cMag(pVS)) || 1;
  const maxI = Math.max(cMag(pIR), cMag(pIL), cMag(pIS), cMag(pIC1), cMag(pIC2)) || 0.001;
  const TGT  = Math.min(sw, sh) * 0.40;
  const sV   = TGT / maxV;
  const sI   = (TGT * 0.50) / maxI;
  const sv = p => ({ x: p.re * sV, y: -p.im * sV });
  const si = p => ({ x: p.re * sI, y: -p.im * sI });

  // Screen displacements from origin
  const vVR   = sv(pVR),  vVS  = sv(pVS);
  const vDRR  = sv(pILRi), vDXL = sv(pILXLi);
  const vInt  = { x: vVR.x + vDRR.x, y: vVR.y + vDRR.y }; // VR + IL·R tip
  const iIR   = si(pIR),  iIL  = si(pIL),  iIS  = si(pIS);
  const iIC1  = si(pIC1), iIC2 = si(pIC2);
  // Head-to-tail helper tips (for construction guides)
  const iIC1fromIR = { x: iIR.x + iIC1.x, y: iIR.y + iIC1.y }; // ≈ iIL
  const iIC2fromIL = { x: iIL.x + iIC2.x, y: iIL.y + iIC2.y }; // ≈ iIS

  const { ox, oy } = _phasorOrigin([
    { x: 0, y: 0 }, vVR, vVS, vInt,
    iIR, iIC1, iIL, iIC2, iIS, iIC1fromIR, iIC2fromIL,
  ], sw, sh, 65, rw, rh);

  // Reference axis
  const axMax = Math.max(vVR.x, vVS.x, iIR.x, iIL.x, 0);
  g.appendChild(_el('line', { x1: ox - 15, y1: oy, x2: ox + axMax + 20, y2: oy,
    stroke: '#ccc', 'stroke-width': '0.7', 'stroke-dasharray': '4,4' }));

  // Voltage construction drops (IL·R then IL·jXL chained from VR tip)
  _conVec(g, ox + vVR.x, oy + vVR.y, vDRR.x, vDRR.y);
  _conVec(g, ox + vInt.x, oy + vInt.y, vDXL.x, vDXL.y);
  _conLabel(g, ox + vVR.x, oy + vVR.y, vDRR.x, vDRR.y, 'IL\u00b7R');
  _conLabel(g, ox + vInt.x, oy + vInt.y, vDXL.x, vDXL.y, 'IL\u00b7X\u2097');

  // Head-to-tail current construction hints (thin dashed): IC1 from IR tip → IL
  g.appendChild(_el('line', {
    x1: ox + iIR.x, y1: oy + iIR.y,
    x2: ox + iIC1fromIR.x, y2: oy + iIC1fromIR.y,
    stroke: '#bbb', 'stroke-width': '0.8', 'stroke-dasharray': '3,2',
  }));
  // IC2 from IL tip → IS
  g.appendChild(_el('line', {
    x1: ox + iIL.x, y1: oy + iIL.y,
    x2: ox + iIC2fromIL.x, y2: oy + iIC2fromIL.y,
    stroke: '#bbb', 'stroke-width': '0.8', 'stroke-dasharray': '3,2',
  }));

  // Main voltage phasors
  const C_VR = '#000099', C_VS = '#990000';
  _phasorVec(g, ox, oy, vVR.x, vVR.y, C_VR);
  _phasorVec(g, ox, oy, vVS.x, vVS.y, C_VS);

  // Main current phasors
  const C_IR = '#005000', C_IL = '#007777', C_IC = '#660066', C_IS = '#884400';
  _phasorVec(g, ox, oy, iIR.x,  iIR.y,  C_IR, '6,3');
  _phasorVec(g, ox, oy, iIC1.x, iIC1.y, C_IC, '4,2');
  _phasorVec(g, ox, oy, iIL.x,  iIL.y,  C_IL);
  _phasorVec(g, ox, oy, iIC2.x, iIC2.y, C_IC, '4,2');
  _phasorVec(g, ox, oy, iIS.x,  iIS.y,  C_IS, '6,3');

  g.appendChild(_el('circle', { cx: ox, cy: oy, r: 3, fill: '#333' }));

  _phasorArmLabel(g, ox+vVR.x,  oy+vVR.y,  C_VR, 'VR',  vVR.x,  vVR.y);
  _phasorArmLabel(g, ox+vVS.x,  oy+vVS.y,  C_VS, 'VS',  vVS.x,  vVS.y);
  _phasorArmLabel(g, ox+iIR.x,  oy+iIR.y,  C_IR, 'IR',  iIR.x,  iIR.y);
  _phasorArmLabel(g, ox+iIC1.x, oy+iIC1.y, C_IC, 'IC1', iIC1.x, iIC1.y);
  _phasorArmLabel(g, ox+iIL.x,  oy+iIL.y,  C_IL, 'IL',  iIL.x,  iIL.y);
  _phasorArmLabel(g, ox+iIC2.x, oy+iIC2.y, C_IC, 'IC2', iIC2.x, iIC2.y);
  _phasorArmLabel(g, ox+iIS.x,  oy+iIS.y,  C_IS, 'IS',  iIS.x,  iIS.y);

  _phasorValuesTable(svg, rw, rh, [
    { name: 'VR',  value: _fmtPhasor(VR_kV, 0, 'kV'),            color: C_VR },
    { name: 'VS',  value: _fmtPhasor(pVS.re, pVS.im, 'kV'),      color: C_VS },
    { name: 'IR',  value: _fmtPhasor(pIR.re, pIR.im, 'kA', 3),   color: C_IR },
    { name: 'IC1', value: _fmtPhasor(pIC1.re, pIC1.im, 'kA', 3), color: C_IC },
    { name: 'IL',  value: _fmtPhasor(pIL.re, pIL.im, 'kA', 3),   color: C_IL },
    { name: 'IC2', value: _fmtPhasor(pIC2.re, pIC2.im, 'kA', 3), color: C_IC },
    { name: 'IS',  value: _fmtPhasor(pIS.re, pIS.im, 'kA', 3),   color: C_IS },
  ]);
  _phasorLegend(svg, rh, sV, sI, C_VR, C_IL);
}

// ── Distributed (ABCD): generic VR, VS, IR, IS from origin ───────────────────
function _drawDistPhasor(g, svg, sw, sh, rw, rh, inputs, outputs) {
  const VR_kV = inputs.nomSyskV / Math.sqrt(3);
  const pVR   = { re: VR_kV, im: 0 };
  const pVS   = outputs.Vs_phase_kV;
  const pIS   = _IS_kA(outputs);
  const pIR   = _computeIR(inputs, outputs);

  const maxV = Math.max(cMag(pVR), cMag(pVS)) || 1;
  const maxI = Math.max(cMag(pIS), cMag(pIR)) || 0.001;
  const TGT  = Math.min(sw, sh) * 0.40;
  const sV   = TGT / maxV;
  const sI   = (TGT * 0.50) / maxI;
  const sv = p => ({ x: p.re * sV, y: -p.im * sV });
  const si = p => ({ x: p.re * sI, y: -p.im * sI });

  const vVR = sv(pVR), vVS = sv(pVS);
  const iIR = si(pIR), iIS = si(pIS);

  const { ox, oy } = _phasorOrigin(
    [{ x: 0, y: 0 }, vVR, vVS, iIR, iIS], sw, sh, 65, rw, rh);

  const axMax = Math.max(vVR.x, vVS.x, iIR.x, iIS.x, 0);
  g.appendChild(_el('line', { x1: ox - 15, y1: oy, x2: ox + axMax + 15, y2: oy,
    stroke: '#ccc', 'stroke-width': '0.7', 'stroke-dasharray': '4,4' }));

  const C_VR = '#000099', C_VS = '#990000', C_IR = '#005000', C_IS = '#884400';
  _phasorVec(g, ox, oy, vVR.x, vVR.y, C_VR);
  _phasorVec(g, ox, oy, vVS.x, vVS.y, C_VS);
  _phasorVec(g, ox, oy, iIR.x, iIR.y, C_IR, '6,3');
  _phasorVec(g, ox, oy, iIS.x, iIS.y, C_IS, '6,3');

  g.appendChild(_el('circle', { cx: ox, cy: oy, r: 3, fill: '#333' }));

  _phasorArmLabel(g, ox+vVR.x, oy+vVR.y, C_VR, 'VR', vVR.x, vVR.y);
  _phasorArmLabel(g, ox+vVS.x, oy+vVS.y, C_VS, 'VS', vVS.x, vVS.y);
  _phasorArmLabel(g, ox+iIR.x, oy+iIR.y, C_IR, 'IR', iIR.x, iIR.y);
  _phasorArmLabel(g, ox+iIS.x, oy+iIS.y, C_IS, 'IS', iIS.x, iIS.y);

  _phasorValuesTable(svg, rw, rh, [
    { name: 'VR', value: _fmtPhasor(VR_kV, 0, 'kV'),          color: C_VR },
    { name: 'VS', value: _fmtPhasor(pVS.re, pVS.im, 'kV'),    color: C_VS },
    { name: 'IR', value: _fmtPhasor(pIR.re, pIR.im, 'kA', 3), color: C_IR },
    { name: 'IS', value: _fmtPhasor(pIS.re, pIS.im, 'kA', 3), color: C_IS },
  ]);
  _phasorLegend(svg, rh, sV, sI, C_VR, C_IR);
}

// ─── PDF diagram renderers (static, no module state) ─────────────────────────

/**
 * Render the conductor arrangement diagram to an SVG XML string for PDF export.
 * Uses fixed "good-looking" (not-to-scale) mode with auto-fit centering.
 *
 * @param {object} inputs  From computeFromParams result
 * @param {number} w       SVG width in user units (screen px)
 * @param {number} h       SVG height in user units (screen px)
 * @returns {string}       SVG XML suitable for inline embedding in HTML
 */
export function renderArrangementSvgStr(inputs, w = 700, h = 240) {
  const { scCount, scStrands, strandDiaM, scSpacingM } = inputs;
  const layers = (3 + Math.sqrt(12 * scStrands - 3)) / 6;
  const rPhys  = (2 * layers - 1) * strandDiaM / 2;
  const phases = phasePositions(inputs);
  const pts    = Object.values(phases);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  // PAD reserves space for phase labels, dim lines, and annotations
  const PAD = 55;
  const scale = Math.min(
    (w - 2 * PAD) / (maxX - minX || 0.01),
    (h - 2 * PAD) / (maxY - minY || 0.01),
  );
  const rangeX = (maxX - minX) * scale, rangeY = (maxY - minY) * scale;
  const tx = PAD + (-minX) * scale + Math.max(0, (w - 2 * PAD - rangeX) / 2);
  const ty = PAD + (-minY) * scale + Math.max(0, (h - 2 * PAD - rangeY) / 2);
  const dispR       = FIXED_R_PX;
  const dispSpacing = FIXED_SC_SPACING_PX;
  const bundleExtent = dispSpacing / 2 + dispR;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns',   SVG_NS);
  svg.setAttribute('width',   w);
  svg.setAttribute('height',  h);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  // White background for clean print output
  svg.appendChild(_el('rect', { x: 0, y: 0, width: w, height: h, fill: '#fff' }));

  const bundleG = _el('g');
  const annotG  = _el('g');
  svg.appendChild(bundleG);
  svg.appendChild(annotG);

  const scrAbs = ph => {
    const [wx, wy] = phases[ph];
    return [tx + wx * scale, ty + wy * scale];
  };

  // Draw bundles at absolute positions (display radius + spacing, not to scale)
  ['A', 'B', 'C'].forEach((ph, i) => {
    const [cx, cy] = scrAbs(ph);
    _drawBundle(bundleG, cx, cy, scCount, dispR, dispSpacing,
      i === 0 ? rPhys : null, null);
  });

  // Phase spacing dim lines
  const sym = inputs.symmetric === 1 || inputs.symmetric === '1' || inputs.symmetric === 'symmetrical';
  if (sym) {
    // _drawPhaseDim side=null reads _bs.tx/ty and _view.zoom for the auto-outward logic;
    // temporarily override these with PDF canvas values (sync — safe in single-threaded JS).
    const prevBsTx = _bs.tx, prevBsTy = _bs.ty, prevZoom = _view.zoom;
    _bs.tx = tx; _bs.ty = ty; _view.zoom = 1;
    _drawPhaseDim(annotG, scrAbs('A'), scrAbs('B'), bundleExtent,
      `D\u00a0=\u00a0${inputs.phaseSpacingM.toFixed(1)}\u00a0m`);
    _bs.tx = prevBsTx; _bs.ty = prevBsTy; _view.zoom = prevZoom;
  } else {
    const fmt = v => v >= 1 ? `${v.toFixed(1)}\u00a0m` : `${(v * 100).toFixed(1)}\u00a0cm`;
    _drawPhaseDim(annotG, scrAbs('A'), scrAbs('B'), bundleExtent,
      `Dab\u00a0=\u00a0${fmt(inputs.Dab)}`, 'top');
    _drawPhaseDim(annotG, scrAbs('B'), scrAbs('C'), bundleExtent,
      `Dbc\u00a0=\u00a0${fmt(inputs.Dbc)}`, 'top');
    _drawDcaHorizDim(annotG, scrAbs('A'), scrAbs('C'),
      ['A', 'B', 'C'].map(p => scrAbs(p)), bundleExtent,
      `Dca\u00a0=\u00a0${fmt(inputs.Dca)}`);
  }

  // Sub-conductor spacing annotation (phase A only, first two sub-conductors)
  if (scCount >= 2) {
    const offsets  = bundleOffsets(scCount, dispSpacing);
    const [acx, acy] = scrAbs('A');
    _drawSpacingDim(annotG,
      acx + offsets[0][0], acy + offsets[0][1],
      acx + offsets[1][0], acy + offsets[1][1],
      dispR, `s\u00a0=\u00a0${(scSpacingM * 100).toFixed(1)}\u00a0cm`);
  }

  // Phase labels
  const PHASE_COLORS = { A: '#cc0000', B: '#ccaa00', C: '#0000cc' };
  ['A', 'B', 'C'].forEach(ph => {
    const [cx, cy] = scrAbs(ph);
    const labelY = cy + dispR + 13;
    for (const [stroke, fill] of [['#fff', 'none'], ['none', PHASE_COLORS[ph]]]) {
      const t = _el('text', {
        x: cx, y: labelY,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-family': FONT, 'font-size': '12', 'font-weight': 'bold',
        fill, stroke, 'stroke-width': '3',
      });
      t.textContent = ph;
      annotG.appendChild(t);
    }
  });

  // Radius annotation — bottom-left corner (SVG text, no checkboxes)
  for (const [stroke, fill] of [['#fff', 'none'], ['none', '#333']]) {
    const t = _el('text', {
      x: 6, y: h - 5,
      'text-anchor': 'start', 'dominant-baseline': 'auto',
      'font-family': FONT, 'font-size': '9',
      fill, stroke, 'stroke-width': stroke === '#fff' ? '2' : '0', 'paint-order': 'stroke',
    });
    t.textContent = `r\u00a0=\u00a0${(rPhys * 100).toFixed(2)}\u00a0cm`;
    svg.appendChild(t);
  }

  return new XMLSerializer().serializeToString(svg);
}

/**
 * Render the circuit diagram to an SVG XML string for PDF export.
 * Distributed lines use the ladder view.
 *
 * @param {object} inputs   From computeFromParams result
 * @param {object} outputs  From computeFromParams result
 * @param {number} w        SVG width in px (distributed will be forced ≥820)
 * @param {number} h        SVG height in px
 * @returns {string}        SVG XML suitable for inline embedding in HTML
 */
export function renderCircuitSvgStr(inputs, outputs, w = 700, h = 210) {
  // Distributed circuit needs a fixed wider canvas (the drawing function enforces ≥820)
  const svgW = inputs.model === 2 ? Math.max(w, 820) : w;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns',   SVG_NS);
  svg.setAttribute('width',   svgW);
  svg.setAttribute('height',  h);
  svg.setAttribute('viewBox', `0 0 ${svgW} ${h}`);
  svg.appendChild(_el('rect', { x: 0, y: 0, width: svgW, height: h, fill: '#fff' }));

  const g = _el('g');
  svg.appendChild(g);

  if      (inputs.model === 0) _drawShortCircuit(g, svg, svgW, h, inputs, outputs);
  else if (inputs.model === 1) _drawNominalPiCircuit(g, svg, svgW, h, inputs, outputs);
  else                          _drawDistributedCircuit(g, svg, svgW, h, inputs, outputs);

  return new XMLSerializer().serializeToString(svg);
}

/**
 * Render the phasor diagram to an SVG XML string for PDF export.
 *
 * @param {object} inputs   From computeFromParams result
 * @param {object} outputs  From computeFromParams result
 * @param {number} w        SVG width in px
 * @param {number} h        SVG height in px
 * @returns {string}        SVG XML suitable for inline embedding in HTML
 */
export function renderPhasorSvgStr(inputs, outputs, w = 700, h = 260) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns',   SVG_NS);
  svg.setAttribute('width',   w);
  svg.setAttribute('height',  h);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.appendChild(_el('rect', { x: 0, y: 0, width: w, height: h, fill: '#fff' }));

  const g = _el('g');
  svg.appendChild(g);

  // Temporarily suppress the live legend DOM element so _phasorLegend draws
  // into the SVG instead of updating the bottom-bar overlay.
  const _savedLegendEl = _phasorLegendEl;
  _phasorLegendEl = null;
  // sw/sh = zoomed dims (~2× real); rw/rh = real canvas size for fixed-position elements
  if      (inputs.model === 0) _drawShortPhasor(g, svg, w * 2, h * 2, w, h, inputs, outputs);
  else if (inputs.model === 1) _drawNominalPiPhasor(g, svg, w * 2, h * 2, w, h, inputs, outputs);
  else                          _drawDistPhasor(g, svg, w * 2, h * 2, w, h, inputs, outputs);
  _phasorLegendEl = _savedLegendEl;

  return new XMLSerializer().serializeToString(svg);
}

// ─── Placeholders (static) ────────────────────────────────────────────────────

function _drawArrangementPlaceholder() {
  const svg = _svgBundle;
  const sw  = svg.clientWidth  || 300;
  const sh  = svg.clientHeight || 300;
  const t = _el('text', {
    x: sw / 2, y: sh / 2,
    'text-anchor': 'middle', 'dominant-baseline': 'middle',
    'font-family': FONT, 'font-size': '11', fill: '#888',
  });
  t.textContent = 'Press Compute to display';
  (_bundleG || svg).appendChild(t);
}

function _drawStaticPlaceholder(svg) {
  svg.innerHTML = '';
  const t = _el('text', {
    x: '50%', y: '50%',
    'text-anchor': 'middle', 'dominant-baseline': 'middle',
    'font-family': FONT, 'font-size': '11', fill: '#888',
  });
  t.textContent = 'Press Compute to display';
  svg.appendChild(t);
}
