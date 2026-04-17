/**
 * diagrams.js — SVG diagram panes for the Analyzer window.
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
const FIXED_R_PX          = 10; // sub-conductor radius in good-looking (not-to-scale) mode
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

// AbortController for Pane 1 event listeners — cleaned up on reinit
let _bundleAC = null;

// Whether to draw circles proportional to physical dimensions (true) or fixed-size (false)
let _toScale = false;

// HTML overlay elements for pane 1 bottom bar (set in initDiagramContainer)
let _overlayRadius = null;
let _overlayScale  = null;

// Pane 2 title text element (updated dynamically with the model name)
let _circuitTitleEl = null;

// Zoom/pan state for Pane 2 (circuit diagram — CSS transform on _circuitG)
let _viewCircuit  = { zoom: 1, panX: 0, panY: 0 };
let _circuitAC    = null;
let _circuitG     = null;
let _lastOutputs  = null;  // last outputs from updateDiagrams

// ─── Public API ───────────────────────────────────────────────────────────────

export function initDiagramContainer(container) {
  if (_bundleAC)  { _bundleAC.abort();  _bundleAC  = null; }
  if (_circuitAC) { _circuitAC.abort(); _circuitAC = null; }

  container.innerHTML = '';
  _bs.inputs   = null;
  _bundleG     = null;
  _circuitG    = null;
  _viewCircuit = { zoom: 1, panX: 0, panY: 0 };

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

  const btnMax2 = document.createElement('button');
  btnMax2.className   = 'dpane-btn';
  btnMax2.textContent = '\u25A1';
  _initMaximizeBtn(btnMax2, pane2);
  controls2.appendChild(btnMax2);

  _initCircuitZoom(_svgCircuit);

  const [pane3, body3, controls3] = _makePane('Phasor Diagram', 'dpane-phasor');
  _svgPhasor = _mkSvg();
  body3.appendChild(_svgPhasor);
  const btnMax3 = document.createElement('button');
  btnMax3.className   = 'dpane-btn';
  btnMax3.textContent = '\u25A1';
  _initMaximizeBtn(btnMax3, pane3);
  controls3.appendChild(btnMax3);

  grid.append(pane1, pane2, pane3);
  container.appendChild(grid);

  _initBundleZoom(_svgBundle);
  _drawArrangementPlaceholder();
  _drawStaticPlaceholder(_svgCircuit);
  _drawStaticPlaceholder(_svgPhasor);
}

export function updateDiagrams(inputs, outputs) {
  _bs.inputs  = inputs;
  _lastOutputs = outputs;
  _fitBundleView();
  _redrawArrangement();
  _redrawCircuit(inputs, outputs);
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
}

function _touchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Apply the current _view transform to the content group — no redraw needed. */
function _applyViewTransform() {
  if (!_bundleG) return;
  _bundleG.setAttribute('transform',
    `translate(${_view.panX},${_view.panY}) scale(${_view.zoom})`);
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

  // Asymmetric: place A at (0,0), B at (Dab, 0), compute C
  const ab = inputs.Dab, bc = inputs.Dbc, ca = inputs.Dca;
  const cxRaw = (ca * ca + ab * ab - bc * bc) / (2 * ab);
  const cy2   = ca * ca - cxRaw * cxRaw;
  const cyRaw = cy2 > 0 ? +Math.sqrt(cy2) : 0; // C below AB → downward in SVG

  const gx = (0 + ab + cxRaw) / 3;
  const gy = (0 + 0  + cyRaw) / 3;
  return {
    A: [0      - gx,   0      - gy],
    B: [ab     - gx,   0      - gy],
    C: [cxRaw  - gx,   cyRaw  - gy],
  };
}

function _fitBundleView() {
  _view = { zoom: 1, panX: 0, panY: 0 };
  const svg = _svgBundle;
  const sw  = svg.clientWidth  || 300;
  const sh  = svg.clientHeight || 300;

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

  if (!_bs.inputs) {
    if (_overlayRadius) _overlayRadius.textContent = '';
    if (_overlayScale)  _overlayScale.textContent  = '';
    _drawArrangementPlaceholder();
    _applyViewTransform();
    return;
  }

  const { scCount, scStrands, strandDiaM, scSpacingM } = _bs.inputs;
  const { tx, ty, scale } = _bs;

  const layers = (3 + Math.sqrt(12 * scStrands - 3)) / 6;
  const rPhys  = (2 * layers - 1) * strandDiaM / 2;

  // In to-scale mode circles are fixed tiny dots so positions are to scale;
  // zoom in to see them spread apart properly.
  const dispR       = _toScale ? TO_SCALE_R_PX : FIXED_R_PX;
  const dispSpacing = _toScale ? scSpacingM * scale : FIXED_SC_SPACING_PX;

  // Outermost rim of a bundle in screen px — used as offset base for phase dims
  const bundleExtent = dispSpacing / 2 + dispR;

  const phases = phasePositions(_bs.inputs);

  // ── Phase spacing dimension lines (drawn first, behind bundles) ──────────
  const sym = _bs.inputs.symmetric === 1 || _bs.inputs.symmetric === '1';

  const scr = ph => {
    const [wx, wy] = phases[ph];
    return [tx + wx * scale, ty + wy * scale];
  };

  if (sym) {
    const D = _bs.inputs.phaseSpacingM;
    const dLabel = `D = ${D.toFixed(1)}\u00a0m`;
    _drawPhaseDim(_bundleG, scr('A'), scr('B'), bundleExtent, dLabel);
  } else {
    const fmt = v => v >= 1 ? `${v.toFixed(1)}\u00a0m` : `${(v * 100).toFixed(1)}\u00a0cm`;
    _drawPhaseDim(_bundleG, scr('A'), scr('B'), bundleExtent, `Dab = ${fmt(_bs.inputs.Dab)}`, 'top');
    _drawPhaseDim(_bundleG, scr('B'), scr('C'), bundleExtent, `Dbc = ${fmt(_bs.inputs.Dbc)}`, 'top');
    // Dca: drop vertical lines from A and C down to a common lower level, then arrow between them
    _drawDcaHorizDim(
      _bundleG, scr('A'), scr('C'),
      [scr('A'), scr('B'), scr('C')], bundleExtent,
      `Dca = ${fmt(_bs.inputs.Dca)}`,
    );
  }

  // ── Bundles ───────────────────────────────────────────────────────────────
  const PHASE_ORDER = ['A', 'B', 'C'];
  PHASE_ORDER.forEach((ph, i) => {
    const [cx, cy] = scr(ph);
    _drawBundle(
      _bundleG, cx, cy, scCount, dispR, dispSpacing,
      i === 0 ? rPhys    : null,   // radius annotation only on A
      i === 0 ? scSpacingM : null, // sub-cond spacing dim only on A
    );
  });

  // ── Phase labels ─────────────────────────────────────────────────────────
  const PHASE_COLORS = { A: '#cc0000', B: '#ccaa00', C: '#0000cc' };
  PHASE_ORDER.forEach(ph => {
    const [cx, cy] = scr(ph);
    // Place label below bundle centre so it doesn't cover sub-conductors
    const labelY = cy + dispR + 13;
    for (const [stroke, fill] of [['#fff', 'none'], ['none', PHASE_COLORS[ph]]]) {
      const t = _el('text', {
        x: cx, y: labelY,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-family': FONT, 'font-size': '12', 'font-weight': 'bold',
        fill, stroke, 'stroke-width': '3',
      });
      t.textContent = ph;
      _bundleG.appendChild(t);
    }
  });

  // Update bottom-bar overlays
  if (_overlayRadius) {
    _overlayRadius.textContent = `r\u00a0=\u00a0${(rPhys * 100).toFixed(2)}\u00a0cm`;
  }
  _drawScaleBadge();
  _applyViewTransform();
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
    // auto: outward from centroid (world origin maps to _bs.tx, _bs.ty)
    const { tx, ty } = _bs;
    const omx = (ax + bx) / 2 - tx;
    const omy = (ay + by) / 2 - ty;
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
  const midY = (topY + botY) / 2;
  parent.appendChild(_el('line', { x1: x, y1: botY, x2: x, y2: topY + AL,
    stroke: '#555', 'stroke-width': '1.5' }));
  _arrowhead(parent, x, topY, 0, -1, AL, AW);
  const lx = side === 'left' ? x - 8 : x + 8;
  _circuitLabel(parent, lx, midY, label, side === 'left' ? 'end' : 'start');
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

  if      (inputs.model === 0) _drawShortCircuit(_circuitG, sw, sh, inputs, outputs);
  else if (inputs.model === 1) _drawNominalPiCircuit(_circuitG, sw, sh, inputs, outputs);
  else                         _drawDistributedCircuit(_circuitG, sw, sh, inputs, outputs);
}

function _drawShortCircuit(g, sw, sh, inputs, outputs) {
  const PAD = 24, TERM_R = 4;
  const wireY  = sh * 0.45;
  const leftX  = PAD + TERM_R;
  const rightX = sw - PAD - TERM_R;
  const hasR   = Math.abs(outputs.B.re) > 0.001;

  const Vr_kV = inputs.nomSyskV / Math.sqrt(3);
  _drawTerminal(g, leftX,  wireY, '+',
    'VS\u00a0=\u00a0' + _fmtPhasor(outputs.Vs_phase_kV.re, outputs.Vs_phase_kV.im, 'kV'));
  _drawTerminal(g, rightX, wireY, '+',
    'VR\u00a0=\u00a0' + Vr_kV.toFixed(2) + '\u2220+0.0\u00b0\u00a0kV');

  const SERIES_W = Math.min(140, (rightX - leftX - 30) * 0.55);
  const midX = (leftX + rightX) / 2;
  const serL = midX - SERIES_W / 2;
  const serR = midX + SERIES_W / 2;

  _wireSeg(g, leftX + TERM_R, wireY, serL, wireY);
  _drawSeriesRL(g, serL, wireY, serR, hasR);
  _wireSeg(g, serR, wireY, rightX - TERM_R, wireY);
  _circuitLabel(g, midX, wireY + 20,
    'Z\u00a0=\u00a0' + _fmtRect(outputs.B.re, outputs.B.im, '\u03a9', 2), 'middle');

  const IS = _IS_kA(outputs);
  const IR = _computeIR(inputs, outputs);
  const arrowY = wireY - 20;
  _drawCurrentArrow(g, leftX + TERM_R + 3, serL - 3, arrowY,
    'IS\u00a0=\u00a0' + _fmtPhasor(IS.re, IS.im, 'kA', 3));
  _drawCurrentArrow(g, serR + 3, rightX - TERM_R - 3, arrowY,
    'IR\u00a0=\u00a0' + _fmtPhasor(IR.re, IR.im, 'kA', 3));
}

function _drawNominalPiCircuit(g, sw, sh, inputs, outputs) {
  const PAD = 24, TERM_R = 4;
  const wireY    = sh * 0.40;
  const shuntBot = wireY + 52;
  const leftX    = PAD + TERM_R;
  const rightX   = sw - PAD - TERM_R;
  const hasR     = Math.abs(outputs.B.re) > 0.001;

  const juncL = leftX  + 28;
  const juncR = rightX - 28;

  const Vr_kV = inputs.nomSyskV / Math.sqrt(3);
  _drawTerminal(g, leftX,  wireY, '+',
    'VS\u00a0=\u00a0' + _fmtPhasor(outputs.Vs_phase_kV.re, outputs.Vs_phase_kV.im, 'kV'));
  _drawTerminal(g, rightX, wireY, '+',
    'VR\u00a0=\u00a0' + Vr_kV.toFixed(2) + '\u2220+0.0\u00b0\u00a0kV');

  // Outer wires and series mid-section
  const SERIES_W = Math.min(140, (juncR - juncL - 20) * 0.75);
  const midX = (juncL + juncR) / 2;
  const serL = midX - SERIES_W / 2;
  const serR = midX + SERIES_W / 2;

  _wireSeg(g, leftX + TERM_R, wireY, juncL, wireY);
  _wireSeg(g, juncL, wireY, serL, wireY);
  _drawSeriesRL(g, serL, wireY, serR, hasR);
  _wireSeg(g, serR, wireY, juncR, wireY);
  _wireSeg(g, juncR, wireY, rightX - TERM_R, wireY);

  _junctionDot(g, juncL, wireY);
  _junctionDot(g, juncR, wireY);

  // Y/2 shunts
  _drawShuntCap(g, juncL, wireY, shuntBot);
  _drawGround(g, juncL, shuntBot);
  _drawShuntCap(g, juncR, wireY, shuntBot);
  _drawGround(g, juncR, shuntBot);

  // Z value below series
  _circuitLabel(g, midX, wireY + 18,
    'Z\u00a0=\u00a0' + _fmtRect(outputs.B.re, outputs.B.im, '\u03a9', 2), 'middle');

  // Y/2 value centred below diagram
  const Y_half = 1 / (2 * outputs.Xc);
  const Yunit  = Y_half < 0.001
    ? `j${(Y_half * 1e6).toFixed(1)}\u00a0\u03bcS`
    : `j${(Y_half * 1e3).toFixed(3)}\u00a0mS`;
  _circuitLabel(g, midX, shuntBot + 22,
    'Y/2\u00a0=\u00a0' + Yunit, 'middle');
  // Side labels for caps
  _circuitLabel(g, juncL - 12, (wireY + shuntBot) / 2, 'Y/2', 'end');
  _circuitLabel(g, juncR + 12, (wireY + shuntBot) / 2, 'Y/2', 'start');

  const IS = _IS_kA(outputs);
  const IR = _computeIR(inputs, outputs);
  const arrowY = wireY - 20;
  _drawCurrentArrow(g, leftX + TERM_R + 3, juncL - 4, arrowY,
    'IS\u00a0=\u00a0' + _fmtPhasor(IS.re, IS.im, 'kA', 3));
  _drawCurrentArrow(g, juncR + 4, rightX - TERM_R - 3, arrowY,
    'IR\u00a0=\u00a0' + _fmtPhasor(IR.re, IR.im, 'kA', 3));
}

function _drawDistributedCircuit(g, sw, sh, inputs, outputs) {
  const PAD = 24, TERM_R = 4;
  const wireY    = sh * 0.38;
  const shuntBot = wireY + 50;
  const leftX    = PAD + TERM_R;
  const rightX   = sw - PAD - TERM_R;
  const hasR     = Math.abs(outputs.B.re) > 0.001;
  const N        = 3;

  const Vr_kV = inputs.nomSyskV / Math.sqrt(3);
  _drawTerminal(g, leftX,  wireY, '+',
    'VS\u00a0=\u00a0' + _fmtPhasor(outputs.Vs_phase_kV.re, outputs.Vs_phase_kV.im, 'kV'));
  _drawTerminal(g, rightX, wireY, '+',
    'VR\u00a0=\u00a0' + Vr_kV.toFixed(2) + '\u2220+0.0\u00b0\u00a0kV');

  const innerW = rightX - leftX - TERM_R * 2 - 8;
  const cellW  = innerW / N;
  const startX = leftX + TERM_R + 4;

  for (let i = 0; i < N; i++) {
    const x0    = startX + i * cellW;
    const x1    = x0 + cellW;
    const serL  = x0 + 2;
    const serR  = x1 - 4;

    _drawSeriesRL(g, serL, wireY, serR, hasR);

    // Shunt at right end of each cell (omit last cell — right terminal is there)
    if (i < N - 1) {
      _junctionDot(g, x1, wireY);
      _drawShuntCap(g, x1, wireY, shuntBot);
      _drawGround(g, x1, shuntBot);
    }
  }

  // Final link from last series end to right terminal
  const lastSerR = startX + N * cellW - 4;
  _wireSeg(g, lastSerR, wireY, rightX - TERM_R, wireY);

  // Annotations on cell 0
  _circuitLabel(g, startX + cellW / 2, wireY + 15, 'z\u00b7\u0394x', 'middle');
  _circuitLabel(g, startX + cellW + 16, (wireY + shuntBot) / 2, 'y\u00b7\u0394x', 'start');

  // Bottom parameter summary
  const r_km = outputs.B.re / inputs.lineLengthKm;
  const x_km = outputs.B.im / inputs.lineLengthKm;
  const b_km = (1 / outputs.Xc) / inputs.lineLengthKm;
  _circuitLabel(g, (leftX + rightX) / 2, shuntBot + 22,
    `z\u00a0=\u00a0${r_km.toFixed(3)}\u00a0+\u00a0j${x_km.toFixed(3)}\u00a0\u03a9/km` +
    `\u2002|\u2002b\u00a0=\u00a0${(b_km * 1e6).toFixed(2)}\u00a0\u03bcS/km`,
    'middle');

  // IS / IR arrows
  const IS = _IS_kA(outputs);
  const IR = _computeIR(inputs, outputs);
  const arrowY = wireY - 20;
  _drawCurrentArrow(g, leftX + TERM_R + 2, startX + cellW / 3, arrowY,
    'IS\u00a0=\u00a0' + _fmtPhasor(IS.re, IS.im, 'kA', 3));
  _drawCurrentArrow(g, lastSerR + 2, rightX - TERM_R - 2, arrowY,
    'IR\u00a0=\u00a0' + _fmtPhasor(IR.re, IR.im, 'kA', 3));
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
