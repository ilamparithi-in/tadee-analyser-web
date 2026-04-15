/**
 * analyzer.js — Analyzer window content initialiser.
 *
 * The Notepad window element is statically authored in index.html with
 * id="win-notepad". This module initialises its interactive sub-components:
 * menu bar, splitter panels, results grid, and Three.js geometry viewer.
 *
 * @param {HTMLElement} viewport — the #viewport element (passed for consistency
 *                                 with the addWindow API, not used directly here)
 */

import * as THREE           from 'three';
import { initMenuBar }      from '../components/menuSystem.js';
import { initPanelLayout }  from '../components/panels.js';
import { initResultsGrid }  from '../components/grid.js';
import { initTooltips }     from '../components/tooltip.js';
import { initUnitInputs, getBaseValue } from '../components/unitInput.js';
import { lineCalculations } from '../../tadee.js';
import { showError }        from '../components/errorDialog.js';

export function initNotepadWindow(viewport) {
  const win = document.getElementById('win-notepad');
  if (!win) return;

  // Tooltips
  initTooltips(win);

  // Unit dropdowns
  const form = win.querySelector('#input-form');
  if (form) initUnitInputs(form);

  // Prevent scroll-wheel on focused number inputs from scrolling the panel.
  // stopPropagation alone doesn't block native CSS overflow scroll — preventDefault
  // is required, so we also manually apply the step to preserve increment behaviour.
  win.querySelectorAll('input[type=number]').forEach(input => {
    input.addEventListener('wheel', e => {
      if (document.activeElement !== input) return;
      e.preventDefault();
      const step = parseFloat(input.step) || 1;
      const cur  = parseFloat(input.value) || 0;
      input.value = e.deltaY < 0 ? cur + step : cur - step;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, { passive: false });
  });

  // Menu bar
  const menuBar = win.querySelector('#menu-bar');
  if (menuBar) initMenuBar(menuBar);

  // View menu pane toggles
  _initViewMenu(win);

  // Splitter panel layout
  const layout = win.querySelector('#panel-layout');
  if (layout) initPanelLayout(layout);

  // Results grid
  const grid = win.querySelector('#results-grid');
  if (grid) _gridApi = initResultsGrid(grid);

  // Compute button
  const btnCompute = win.querySelector('#btn-compute');
  if (btnCompute) {
    btnCompute.addEventListener('click', () => _compute(win));
  }

  // Save / Load / Export buttons
  const btnSave = win.querySelector('#btn-save-input');
  if (btnSave) btnSave.addEventListener('click', () => _saveInputs(win));

  const btnLoad = win.querySelector('#btn-load-input');
  if (btnLoad) btnLoad.addEventListener('click', () => _loadInputs(win));

  const btnExport = win.querySelector('#btn-export-output');
  if (btnExport) btnExport.addEventListener('click', () => _exportOutput(win));

  const menuSaveAsPdf = win.querySelector('#menu-save-as-pdf');
  if (menuSaveAsPdf) menuSaveAsPdf.addEventListener('click', () => _exportPdf(win));

  // Spacing toggle (symmetric vs unsymmetric)
  _initSpacingToggle(win);

  // Three.js geometry viewer
  const container = win.querySelector('#canvas-container');
  if (container) _initThreeJs(container);
}

let _gridApi = null;
let _lastResults = null; // populated after a successful compute; enables Export Output

// ─── Input field descriptors ─────────────────────────────────────────────────
// Each entry: [inputId, hasUnitSelect]
const INPUT_FIELDS = [
  ['line-length',    true],
  ['load-mw',        true],
  ['power-factor',   false],
  ['voltage',        true],
  ['frequency',      false],
  ['phase-spacing',  true],
  ['dab',            true],
  ['dbc',            true],
  ['dca',            true],
  ['sub-spacing',    true],
  ['strands',        false],
  ['dia-strands',    true],
  ['resistance',     true],
];
const SELECT_FIELDS = ['system-type', 'bundle-count', 'line-model']; // kept for reference

// Contract-name mapping for save/load  (input-id → contract key)
const INPUT_CONTRACT = {
  'line-length':   'lineLengthKm',
  'load-mw':       'recvLoadMW',
  'power-factor':  'recvPF',
  'voltage':       'nomSyskV',
  'frequency':     'frequency',
  'phase-spacing': 'phaseSpacingM',
  'dab':           'Dab',
  'dbc':           'Dbc',
  'dca':           'Dca',
  'sub-spacing':   'scSpacingM',
  'strands':       'scStrands',
  'dia-strands':   'strandDiaM',
  'resistance':    'resSCPerKm',
};
const SELECT_CONTRACT = {
  'system-type':  'symmetric',   // stored as raw select value
  'bundle-count': 'scCount',
  'line-model':   'model',
};

function _collectInputs(win) {
  const data = {};
  INPUT_FIELDS.forEach(([id, hasUnit]) => {
    const key = INPUT_CONTRACT[id] ?? id;
    const el  = win.querySelector('#' + id);
    if (!el) return;
    data[key] = el.value;
    if (hasUnit) {
      const sel = win.querySelector(`select[data-unit-for="${id}"]`);
      if (sel) data[key + '_unit'] = sel.value;
    }
  });
  Object.entries(SELECT_CONTRACT).forEach(([id, key]) => {
    const el = win.querySelector('#' + id);
    if (el) data[key] = el.value;
  });
  return data;
}

function _applyInputs(win, data) {
  INPUT_FIELDS.forEach(([id, hasUnit]) => {
    const key = INPUT_CONTRACT[id] ?? id;
    // Accept contract key first, fall back to legacy html-id key
    const val     = data[key]     ?? data[id];
    const unitVal = data[key + '_unit'] ?? data[id + '-unit'];
    if (hasUnit && unitVal != null) {
      const sel = win.querySelector(`select[data-unit-for="${id}"]`);
      if (sel) sel.value = unitVal;
    }
    if (val != null) {
      const el = win.querySelector('#' + id);
      if (el) el.value = val;
    }
  });
  Object.entries(SELECT_CONTRACT).forEach(([id, key]) => {
    const val = data[key] ?? data[id];
    if (val != null) {
      const el = win.querySelector('#' + id);
      if (el) el.value = val;
    }
  });
}

function _saveInputs(win) {
  const data    = _collectInputs(win);
  const now     = new Date();
  const pad     = n => String(n).padStart(2, '0');
  const stamp   = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}` +
                  `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  _triggerDownload(JSON.stringify(data, null, 2), `tadee-inputs_${stamp}.json`, 'application/json');
  const sb = win.querySelector('#sb-status');
  if (sb) sb.textContent = 'Saved';
}

function _exportOutput(win) {
  if (!_lastResults) return;
  const now   = new Date();
  const pad   = n => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}` +
                `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  _triggerDownload(JSON.stringify(_lastResults, null, 2), `tadee-output_${stamp}.json`, 'application/json');
  const sb = win.querySelector('#sb-status');
  if (sb) sb.textContent = 'Exported';
}

// ─── PDF report ──────────────────────────────────────────────────────────────

function _exportPdf(win) {
  if (!_lastResults) return;
  const r  = _lastResults;
  const i  = r.inputs;
  const o  = r.outputs;

  const modelLabel = ['Short line', 'Nominal π', 'Distributed parameter'][i.model] ?? i.model;
  const symLabel   = (i.symmetric === 1 || i.symmetric === '1' || i.symmetric === 'symmetrical')
                     ? 'Symmetrical' : 'Unsymmetrical';
  const bundleLabel = ['', '2', '3', '4'][i.scCount] ?? i.scCount;

  const fc = (c) => {
    if (typeof c === 'number') return c.toFixed(6);
    const s = c.im < 0 ? ' − ' : ' + ';
    return `${c.re.toFixed(6)}${s}j${Math.abs(c.im).toFixed(6)}`;
  };
  const fcObj = (c) => {
    const s = c.im < 0 ? ' − ' : ' + ';
    return `${c.re.toFixed(6)}${s}j${Math.abs(c.im).toFixed(6)}`;
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Transmission Line Analysis Report</title>
<style>
  @page { size: A4; margin: 2cm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Times New Roman', serif;
    font-size: 11pt;
    color: #000;
    margin: 0;
  }
  h1 { font-size: 16pt; text-align: center; margin-bottom: 2px; }
  .subtitle { text-align: center; font-size: 10pt; margin-bottom: 16px; }
  .meta { font-size: 10pt; margin-bottom: 12px; }
  .meta td { padding: 1px 6px; }
  h2 { font-size: 13pt; border-bottom: 1px solid #000; margin: 16px 0 6px; padding-bottom: 2px; }
  table.data { border-collapse: collapse; width: 100%; font-size: 10pt; }
  table.data th { background: #d4d0c8; border: 1px solid #808080;
                  padding: 3px 6px; text-align: left; }
  table.data td { border: 1px solid #808080; padding: 3px 6px; }
  table.data tr:nth-child(even) td { background: #f5f5f5; }
  .val { font-family: 'Courier New', monospace; }
  .footer { font-size: 9pt; text-align: center; margin-top: 24px; color: #555; }
</style>
</head>
<body>
<h1>Transmission Line Analysis Report</h1>
<p class="subtitle">Three-Phase Single-Circuit Bundled Conductor Transmission System</p>

<table class="meta">
  <tr><td><b>Team Members:</b></td><td>Ilamparithi Murali (107124046), Priyadarsan ST (107124084), Srijith M S (107124110)</td></tr>
  <tr><td><b>Date of Submission:</b></td><td>17/04/2026</td></tr>
</table>

<h2>Input Parameters</h2>
<table class="data">
  <tr><th>#</th><th>Parameter</th><th>Value</th></tr>
  <tr><td>1</td><td>Length of the line</td><td class="val">${i.lineLengthKm} km</td></tr>
  <tr><td>2</td><td>Receiving end load</td><td class="val">${i.recvLoadMW} MW</td></tr>
  <tr><td>3</td><td>Power factor (receiving end)</td><td class="val">${i.recvPF}</td></tr>
  <tr><td>4</td><td>Nominal system voltage</td><td class="val">${i.nomSyskV} kV</td></tr>
  <tr><td>5</td><td>Power frequency</td><td class="val">${i.frequency} Hz</td></tr>
  <tr><td>6</td><td>Spacing type</td><td class="val">${symLabel}</td></tr>
  <tr><td>7</td><td>Phase conductor spacing</td><td class="val">${i.phaseSpacingM} m</td></tr>
  <tr><td>8</td><td>Sub-conductors per bundle</td><td class="val">${i.scCount}</td></tr>
  <tr><td>9</td><td>Sub-conductor spacing</td><td class="val">${i.scSpacingM} m</td></tr>
  <tr><td>10</td><td>Number of strands per sub-conductor</td><td class="val">${i.scStrands}</td></tr>
  <tr><td>11</td><td>Diameter of each strand</td><td class="val">${i.strandDiaM} m</td></tr>
  <tr><td>12</td><td>Resistance per sub-conductor per km</td><td class="val">${i.resSCPerKm} Ω/km</td></tr>
  <tr><td>13</td><td>Line model</td><td class="val">${modelLabel}</td></tr>
</table>

<h2>Output Results</h2>
<table class="data">
  <tr><th>#</th><th>Quantity</th><th>Value</th><th>Unit</th></tr>
  <tr><td>1</td><td>Inductance per phase per km</td><td class="val">${o.Lphkm.toExponential(6)}</td><td>H/km</td></tr>
  <tr><td>2</td><td>Capacitance per phase per km</td><td class="val">${o.Cphkm.toExponential(6)}</td><td>F/km</td></tr>
  <tr><td>3</td><td>Inductive reactance X<sub>L</sub></td><td class="val">${o.Xl.toFixed(4)}</td><td>Ω</td></tr>
  <tr><td>4</td><td>Capacitive reactance X<sub>C</sub></td><td class="val">${o.Xc.toFixed(4)}</td><td>Ω</td></tr>
  <tr><td>5a</td><td>ABCD — A</td><td class="val">${fcObj(o.A)}</td><td></td></tr>
  <tr><td>5b</td><td>ABCD — B</td><td class="val">${fcObj(o.B)}</td><td>Ω</td></tr>
  <tr><td>5c</td><td>ABCD — C</td><td class="val">${fcObj(o.C)}</td><td>S</td></tr>
  <tr><td>5d</td><td>ABCD — D</td><td class="val">${fcObj(o.D)}</td><td></td></tr>
  <tr><td>7</td><td>Sending end voltage (phase)</td><td class="val">${fcObj(o.Vs_phase_kV)}</td><td>kV</td></tr>
  <tr><td>7</td><td>Sending end voltage (line-to-line)</td><td class="val">${fcObj(o.Vs_line_kV)}</td><td>kV</td></tr>
  <tr><td>8</td><td>Sending end current I<sub>s</sub></td><td class="val">${fcObj(o.Is_A)}</td><td>A</td></tr>
  <tr><td>9</td><td>Charging current I<sub>c</sub></td><td class="val">${fcObj(o.Ic_A)}</td><td>A</td></tr>
  <tr><td>10</td><td>Percentage voltage regulation</td><td class="val">${o.VR.toFixed(4)}</td><td>%</td></tr>
  <tr><td>11</td><td>Power loss in the line (3φ)</td><td class="val">${o.loss.toFixed(4)}</td><td>MW</td></tr>
  <tr><td>12</td><td>Transmission efficiency</td><td class="val">${(o.eta * 100).toFixed(2)}</td><td>%</td></tr>
  <tr><td>13</td><td>Surge impedance Z<sub>c</sub> (lossless)</td><td class="val">${o.Zc.toFixed(4)}</td><td>Ω</td></tr>
  <tr><td>14</td><td>Surge impedance loading SIL (3φ, lossless)</td><td class="val">${o.SIL.toFixed(4)}</td><td>MW</td></tr>
</table>

<p class="footer">Generated by TADEE Transmission Line Analyser — Group 7</p>
</body>
</html>`;

  const pw = window.open('', '_blank');
  if (!pw) return;
  pw.document.open();
  pw.document.write(html);
  pw.document.close();
  pw.focus();
  pw.print();
}

function _triggerDownload(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function _loadInputs(win) {
  const input    = document.createElement('input');
  input.type     = 'file';
  input.accept   = '.json,application/json';
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        _applyInputs(win, data);
        const sb = win.querySelector('#sb-status');
        if (sb) sb.textContent = 'Loaded';
      } catch {
        const sb = win.querySelector('#sb-status');
        if (sb) sb.textContent = 'Load failed: invalid JSON';
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

function _initViewMenu(win) {
  const topRow    = win.querySelector('#panel-top-row');
  const panelLeft = win.querySelector('#panel-left');
  const splitterV = win.querySelector('#splitter-v');
  const panelRight  = win.querySelector('#panel-right');
  const splitterH = win.querySelector('#splitter-h');
  const panelBottom = win.querySelector('#panel-bottom');

  function _apply() {
    const showInput  = document.getElementById('view-pane-input')?.dataset.checked  === 'true';
    const showCanvas = document.getElementById('view-pane-canvas')?.dataset.checked === 'true';
    const showOutput = document.getElementById('view-pane-output')?.dataset.checked === 'true';

    if (panelLeft) {
      panelLeft.style.display = showInput ? '' : 'none';
      // When canvas is hidden, let input pane grow to fill the full width
      panelLeft.style.flex = (showInput && !showCanvas) ? '1' : '';
    }
    if (panelRight)  panelRight.style.display  = showCanvas ? '' : 'none';
    if (splitterV)   splitterV.style.display   = (showInput && showCanvas) ? '' : 'none';
    if (topRow)      topRow.style.display      = (showInput || showCanvas) ? '' : 'none';
    if (panelBottom) panelBottom.style.display = showOutput ? '' : 'none';
    if (splitterH)   splitterH.style.display   = ((showInput || showCanvas) && showOutput) ? '' : 'none';
  }

  ['view-pane-input', 'view-pane-canvas', 'view-pane-output'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      btn.dataset.checked = btn.dataset.checked === 'true' ? 'false' : 'true';
      _apply();
    });
  });
}

function _initSpacingToggle(win) {
  const sel   = win.querySelector('#system-type');
  const rowSym   = win.querySelector('#spacing-sym');
  const rowUnsym = win.querySelector('#spacing-unsym');
  function _update() {
    const isUnsym = sel?.value?.toLowerCase().includes('unsym');
    if (rowSym)   rowSym.style.display   = isUnsym ? 'none' : '';
    if (rowUnsym) rowUnsym.style.display = isUnsym ? ''     : 'none';
  }
  sel?.addEventListener('change', _update);
  _update();
}

function _normaliseModel(raw) {
  const s = raw.toLowerCase().trim();
  if (s.includes('pi') || s.includes('π')) return 1;
  if (s.includes('dist'))                   return 2;
  return 0;
}

function _fmtComplex(c) {
  if (typeof c === 'number') return c.toFixed(4);
  const sign = c.im < 0 ? ' - ' : ' + ';
  return `${c.re.toFixed(4)}${sign}j${Math.abs(c.im).toFixed(4)}`;
}

function _compute(win) {
  const sbStatus = win.querySelector('#sb-status');
  const sbTime   = win.querySelector('#sb-time');

  const t0 = performance.now();

  // ── Read form values ───────────────────────────────────────────────────────
  const v = id => win.querySelector('#' + id);
  const n = id => parseFloat(v(id)?.value ?? '');
  const bv = id => getBaseValue(id, win);

  const params = {
    lineLengthKm:  bv('line-length'),
    recvLoadMW:    bv('load-mw'),
    recvPF:        n('power-factor'),
    nomSyskV:      bv('voltage'),
    frequency:     n('frequency'),
    symmetric:     v('system-type')?.value?.toLowerCase().includes('unsym') ? 0 : 1,
    Dab:           v('system-type')?.value?.toLowerCase().includes('unsym') ? bv('dab') : bv('phase-spacing'),
    Dbc:           v('system-type')?.value?.toLowerCase().includes('unsym') ? bv('dbc') : bv('phase-spacing'),
    Dca:           v('system-type')?.value?.toLowerCase().includes('unsym') ? bv('dca') : bv('phase-spacing'),
    phaseSpacingM: bv('phase-spacing'),
    scCount:       parseInt(v('bundle-count')?.value ?? '1', 10),
    scSpacingM:    bv('sub-spacing'),
    scStrands:     n('strands'),
    strandDiaM:    bv('dia-strands'),
    resSCPerKm:    bv('resistance'),
    model:         _normaliseModel(v('line-model')?.value ?? 'Short'),
  };

  // ── Validate ───────────────────────────────────────────────────────────────
  const bad = Object.entries(params).filter(([, v]) => isNaN(v) && typeof v !== 'string');
  if (bad.length) {
    if (sbStatus) sbStatus.textContent = 'Error: fill all fields';
    return;
  }

  // ── Run ────────────────────────────────────────────────────────────────────
  let calc;
  try {
    calc = new lineCalculations(params);

    const lc   = calc.LandCperPhasePerKm();
    const xl   = calc.XLandXC();
    const abcd = calc.ABCDparams();
    const vs   = calc.Vs_kV_line_phase();
    const is   = calc.Is_A();
    const ich  = calc.Icharging_A();
    const vr   = calc.percent_VR();
    const pl   = calc.power_loss_MW_and_efficiency();

    // tadee.js property names:
    //   LandCperPhasePerKm → { inductance, capacitance }
    //   XLandXC            → { Reactance_L, Reactance_C }
    //   power_loss…        → { power_loss_MW, efficiency }
    const Lphkm  = lc.inductance;
    const Cphkm  = lc.capacitance;
    const Xl     = xl.Reactance_L;
    const Xc     = xl.Reactance_C;
    const loss   = pl.power_loss_MW;
    const eta    = pl.efficiency;

    const rows = [
      ['Inductance per phase per km',  Lphkm.toExponential(4),           'H/km'],
      ['Capacitance per phase per km', Cphkm.toExponential(4),           'F/km'],
      ['Inductive reactance XL',       Xl.toFixed(4),                    'Ω'],
      ['Capacitive reactance XC',      Xc.toFixed(4),                    'Ω'],
      ['A',                            _fmtComplex(abcd.A),              ''],
      ['B',                            _fmtComplex(abcd.B),              'Ω'],
      ['C',                            _fmtComplex(abcd.C),              'S'],
      ['D',                            _fmtComplex(abcd.D),              ''],
      ['Sending end voltage (phase)',   _fmtComplex(vs.phase) + ' kV',   ''],
      ['Sending end voltage (line)',    _fmtComplex(vs.linetoline) + ' kV', ''],
      ['Sending end current Is',        _fmtComplex(is),                 'A'],
      ['Charging current Ic',           _fmtComplex(ich),                'A'],
      ['Voltage regulation',            vr.toFixed(4),                   '%'],
      ['Power loss (3φ)',                loss.toFixed(4),                 'MW'],
      ['Transmission efficiency',       (eta * 100).toFixed(2),          '%'],
      ['Surge impedance Zc',            calc.Zc().toFixed(4),            'Ω'],
      ['Surge impedance loading SIL',   calc.SIL_MW().toFixed(4),        'MW'],
    ];

    if (_gridApi) _gridApi.setData(rows);

    // ── Store results for Export Output / PDF ─────────────────────────────────
    _lastResults = {
      inputs: { ...params },
      outputs: {
        Lphkm, Cphkm, Xl, Xc,
        A: { re: abcd.A.re, im: abcd.A.im },
        B: { re: abcd.B.re, im: abcd.B.im },
        C: { re: abcd.C.re, im: abcd.C.im },
        D: { re: abcd.D.re, im: abcd.D.im },
        Vs_phase_kV: { re: vs.phase.re,      im: vs.phase.im      },
        Vs_line_kV:  { re: vs.linetoline.re, im: vs.linetoline.im },
        Is_A:  { re: is.re,  im: is.im  },
        Ic_A:  { re: ich.re, im: ich.im },
        VR: vr, loss, eta,
        Zc: calc.Zc(), SIL: calc.SIL_MW(),
      },
    };
    const btnExport = win.querySelector('#btn-export-output');
    if (btnExport) btnExport.disabled = false;
    const menuPdf = win.querySelector('#menu-save-as-pdf');
    if (menuPdf) menuPdf.disabled = false;

    const elapsed = (performance.now() - t0).toFixed(1);
    if (sbTime)   sbTime.textContent   = `Time: ${elapsed} ms`;
    if (sbStatus) sbStatus.textContent = 'Done';
  } catch (e) {
    if (sbStatus) sbStatus.textContent = 'Compute error';
    showError(e?.message ?? 'Unknown computation error.');
  }
}

function _initThreeJs(container) {
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  camera.position.z = 2;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshNormalMaterial()
  );
  scene.add(cube);

  let lastW = 0, lastH = 0;

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 0 && h > 0 && (w !== lastW || h !== lastH)) {
      lastW = w; lastH = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  resize();
  new ResizeObserver(resize).observe(container);

  (function animate() {
    requestAnimationFrame(animate);
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
    renderer.render(scene, camera);
  })();
}
