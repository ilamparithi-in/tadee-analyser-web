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

// ─── Public API ───────────────────────────────────────────────────────────────

export function initDiagramContainer(container) {
  if (_bundleAC) { _bundleAC.abort(); _bundleAC = null; }

  container.innerHTML = '';
  _bs.inputs = null;
  _bundleG   = null;

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
  body2.appendChild(_svgCircuit);
  const btnMax2 = document.createElement('button');
  btnMax2.className   = 'dpane-btn';
  btnMax2.textContent = '\u25A1';
  _initMaximizeBtn(btnMax2, pane2);
  controls2.appendChild(btnMax2);

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
  _bs.inputs = inputs;
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

/**
 * Format a complex number as magnitude∠angle°.
 * mag in the given unit string (e.g. 'kV', 'A', 'Ω').
 */
function _fmtPhasor(re, im, unit, decimals = 2) {
  const mag = Math.sqrt(re * re + im * im);
  const ang = Math.atan2(im, re) * 180 / Math.PI;
  const angStr = (ang >= 0 ? '+' : '') + ang.toFixed(1) + '\u00b0';
  return `${mag.toFixed(decimals)}\u2220${angStr}\u00a0${unit}`;
}

function _redrawCircuit(inputs, outputs) {
  const svg = _svgCircuit;
  if (!svg) return;
  svg.innerHTML = '';

  const sw = svg.clientWidth  || 400;
  const sh = svg.clientHeight || 300;

  // ── Layout constants ──────────────────────────────────────────────────────
  const PAD   = 24;          // margin from SVG edges
  const BUS_W = 6;           // bus bar half-width
  const BUS_H = sh * 0.42;   // bus bar half-height
  const CY    = sh * 0.46;   // vertical centre of the circuit (slightly above mid)

  const leftX  = PAD + BUS_W;
  const rightX = sw - PAD - BUS_W;

  // ── Model name in title bar ───────────────────────────────────────────────
  const MODEL_NAMES = ['Short Line', 'Nominal \u03c0', 'Distributed'];
  const modelName   = MODEL_NAMES[inputs.model] ?? 'Unknown';
  if (_circuitTitleEl) _circuitTitleEl.textContent = `Circuit Diagram \u2014 ${modelName}`;

  // ── Bus bars ──────────────────────────────────────────────────────────────
  // Left bus (VS)
  svg.appendChild(_el('rect', {
    x: leftX - BUS_W, y: CY - BUS_H,
    width: BUS_W * 2, height: BUS_H * 2,
    fill: '#555',
  }));
  // Right bus (VR)
  svg.appendChild(_el('rect', {
    x: rightX - BUS_W, y: CY - BUS_H,
    width: BUS_W * 2, height: BUS_H * 2,
    fill: '#555',
  }));

  // ── Connecting wires to the series branch ─────────────────────────────────
  // Will be completed in Parts 2 & 3; for now draw a plain wire from bus to bus
  const wireY = CY;
  svg.appendChild(_el('line', {
    x1: leftX + BUS_W, y1: wireY,
    x2: rightX - BUS_W, y2: wireY,
    stroke: '#333', 'stroke-width': '2',
  }));

  // ── Voltage labels ────────────────────────────────────────────────────────
  const labelOffset = BUS_H + 14;

  // VS label (left bus, below)
  const Vs_re = outputs.Vs_phase_kV.re;
  const Vs_im = outputs.Vs_phase_kV.im;
  const vsLabel = 'VS = ' + _fmtPhasor(Vs_re, Vs_im, 'kV');
  _circuitLabel(svg, leftX, CY + labelOffset, vsLabel, 'middle');

  // VR label (right bus, below) — receiving end at angle 0°
  const Vr_kV = inputs.nomSyskV / Math.sqrt(3);
  const vrLabel = 'VR = ' + Vr_kV.toFixed(2) + '\u2220+0.0\u00b0\u00a0kV';
  _circuitLabel(svg, rightX, CY + labelOffset, vrLabel, 'middle');
}

/** Render a text label with white knockout stroke (readable on any background). */
function _circuitLabel(svg, x, y, text, anchor = 'middle') {
  for (const [stroke, fill] of [['#fff', 'none'], ['none', '#333']]) {
    const t = _el('text', {
      x, y,
      'text-anchor': anchor, 'dominant-baseline': 'hanging',
      'font-family': FONT, 'font-size': '10',
      fill, stroke, 'stroke-width': stroke === '#fff' ? '3' : '0',
      'paint-order': 'stroke',
    });
    t.textContent = text;
    svg.appendChild(t);
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
