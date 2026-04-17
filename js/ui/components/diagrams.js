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

const MIN_R_PX = 3; // minimum visible sub-conductor radius in screen px

// ─── SVG helpers ─────────────────────────────────────────────────────────────

function _el(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** Responsive SVG — fills parent, no fixed viewBox; screen px = SVG user units. */
function _mkSvg() {
  return _el('svg', { width: '100%', height: '100%', style: 'display:block;' });
}

function _makePane(title, extraClass) {
  const pane   = document.createElement('div');
  pane.className = 'dpane' + (extraClass ? ' ' + extraClass : '');
  const titleEl = document.createElement('div');
  titleEl.className   = 'dpane-title';
  titleEl.textContent = title;
  const body = document.createElement('div');
  body.className = 'dpane-body';
  pane.append(titleEl, body);
  return [pane, body];
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

// AbortController for Pane 1 event listeners — cleaned up on reinit
let _bundleAC = null;

// ─── Public API ───────────────────────────────────────────────────────────────

export function initDiagramContainer(container) {
  if (_bundleAC) { _bundleAC.abort(); _bundleAC = null; }

  container.innerHTML = '';
  _bs.inputs = null;

  const grid = document.createElement('div');
  grid.className = 'diagram-grid';

  const [pane1, body1] = _makePane('Conductor Arrangement', 'dpane-arrangement');
  _svgBundle = _mkSvg();
  _svgBundle.style.cursor = 'grab';
  body1.appendChild(_svgBundle);

  const [pane2, body2] = _makePane('Circuit Diagram', 'dpane-circuit');
  _svgCircuit = _mkSvg();
  body2.appendChild(_svgCircuit);

  const [pane3, body3] = _makePane('Phasor Diagram', 'dpane-phasor');
  _svgPhasor = _mkSvg();
  body3.appendChild(_svgPhasor);

  grid.append(pane1, pane2, pane3);
  container.appendChild(grid);

  _initBundleZoom(_svgBundle);
  _drawArrangementPlaceholder();
  _drawStaticPlaceholder(_svgCircuit);
  _drawStaticPlaceholder(_svgPhasor);
}

export function updateDiagrams(inputs, _outputs) {
  _bs.inputs = inputs;
  _fitBundleView();
  _redrawArrangement();
  // Panes 2 & 3 implemented in later parts
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
    drag = { x: e.clientX, y: e.clientY };
    svg.style.cursor = 'grabbing';
  }, sig);
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    _bs.tx += e.clientX - drag.x;
    _bs.ty += e.clientY - drag.y;
    drag = { x: e.clientX, y: e.clientY };
    _redrawArrangement();
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
  _bs.tx    = pivotX + (_bs.tx - pivotX) * factor;
  _bs.ty    = pivotY + (_bs.ty - pivotY) * factor;
  _bs.scale *= factor;
  _redrawArrangement();
}

function _touchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Set the initial scale so the sub-conductor spacing fills the view at a
 * comfortable size. Part 3 will override this to fit the full phase arrangement.
 */
function _fitBundleView() {
  const svg = _svgBundle;
  const sw  = svg.clientWidth  || 300;
  const sh  = svg.clientHeight || 300;
  // Part 3 will use phase spacing as the primary fit dimension.
  // For now fit on scSpacingM so the bundle is clearly visible.
  const refM     = _bs.inputs?.scSpacingM ?? 0.04;
  const targetPx = Math.min(sw, sh) * 0.3;
  _bs.scale = targetPx / refM;
  _bs.tx    = sw / 2;
  _bs.ty    = sh / 2;
}

// ─── Arrangement redraw ───────────────────────────────────────────────────────

function _redrawArrangement() {
  const svg = _svgBundle;
  if (!svg) return;
  svg.innerHTML = '';

  if (!_bs.inputs) {
    _drawArrangementPlaceholder();
    return;
  }

  const { scCount, scStrands, strandDiaM, scSpacingM } = _bs.inputs;
  const { tx, ty, scale } = _bs;

  // Physical conductor radius (m) from strand geometry
  const layers = (3 + Math.sqrt(12 * scStrands - 3)) / 6;
  const rPhys  = (2 * layers - 1) * strandDiaM / 2;

  const dispR       = Math.max(rPhys * scale, MIN_R_PX);
  const dispSpacing = scSpacingM * scale;

  // Part 3 will position all three phase centres here.
  // For now draw one bundle at the world origin → screen (tx, ty).
  _drawBundle(svg, tx, ty, scCount, dispR, dispSpacing, rPhys);

  _drawScaleBadge(svg);
}

// ─── Bundle drawing ───────────────────────────────────────────────────────────

/**
 * Draw `scCount` sub-conductor circles centred at (cx, cy).
 * `dispR`       — display radius (screen px); already clamped to MIN_R_PX
 * `dispSpacing` — display sub-conductor centre-to-centre (screen px)
 * `rPhys`       — physical radius (m) for label text
 */
function _drawBundle(svg, cx, cy, scCount, dispR, dispSpacing, rPhys) {
  const offsets = bundleOffsets(scCount, dispSpacing);

  offsets.forEach(([dx, dy]) => {
    svg.appendChild(_el('circle', {
      cx: cx + dx, cy: cy + dy, r: dispR,
      fill: '#e8e8e8', stroke: '#333', 'stroke-width': '1.5',
    }));
  });

  // Radius annotation on first sub-conductor only
  const [dx0, dy0] = offsets[0];
  const ox = cx + dx0;
  const oy = cy + dy0;

  svg.appendChild(_el('line', {
    x1: ox, y1: oy, x2: ox + dispR, y2: oy,
    stroke: '#555', 'stroke-width': '0.75', 'stroke-dasharray': '2,2',
  }));
  svg.appendChild(_el('line', {
    x1: ox + dispR, y1: oy - 4, x2: ox + dispR, y2: oy + 4,
    stroke: '#555', 'stroke-width': '1',
  }));
  const rMm = (rPhys * 1000).toFixed(1);
  const lbl = _el('text', {
    x: ox + dispR + 5, y: oy,
    'font-family': FONT, 'font-size': '10', fill: '#222',
    'dominant-baseline': 'middle',
  });
  lbl.textContent = `r\u2009=\u2009${rMm}\u00a0mm`;
  svg.appendChild(lbl);
}

// ─── Scale badge ──────────────────────────────────────────────────────────────

function _drawScaleBadge(svg) {
  const sw = svg.clientWidth  || 300;
  const sh = svg.clientHeight || 300;

  const physPerPx = 1 / _bs.scale;
  const label = physPerPx < 1
    ? `1\u2009px\u00a0\u2248\u2009${(physPerPx * 1000).toFixed(2)}\u00a0mm`
    : `1\u2009px\u00a0\u2248\u2009${physPerPx.toFixed(3)}\u00a0m`;

  const PAD = 3, BH = 14, BW = 130;
  const bx = sw - BW - 6, by = sh - BH - 6;

  svg.appendChild(_el('rect', {
    x: bx - PAD, y: by - PAD,
    width: BW + PAD * 2, height: BH + PAD * 2,
    fill: '#f0f0f0', stroke: '#808080', 'stroke-width': '0.5',
  }));
  const t = _el('text', {
    x: bx, y: by + BH / 2,
    'font-family': FONT, 'font-size': '9', fill: '#444',
    'dominant-baseline': 'middle',
  });
  t.textContent = label;
  svg.appendChild(t);
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
  svg.appendChild(t);
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
