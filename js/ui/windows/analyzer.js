/**
 * analyzer.js — Analyzer window content initialiser.
 *
 * The analyser window element is statically authored in index.html with
 * id="win-analyser". This module initialises its interactive sub-components:
 * menu bar, splitter panels, results grid, and Three.js geometry viewer.
 *
 * @param {HTMLElement} viewport — the #viewport element (passed for consistency
 *                                 with the addWindow API, not used directly here)
 */

import { initMenuBar }      from '../components/menuSystem.js';
import { initPanelLayout }  from '../components/panels.js';
import { initResultsGrid }  from '../components/grid.js';
import { initTooltips }     from '../components/tooltip.js';
import { initUnitInputs, getBaseValue } from '../components/unitInput.js';
import { showError }        from '../components/errorDialog.js';
import { showBalloon, hideBalloon }    from '../components/balloon.js';
import { initDiagramContainer, updateDiagrams } from '../components/diagrams.js';
import { computeFromParams, normaliseModel, fmtComplex, buildReportPage, PDF_STYLES } from '../../batch.js';
import { initPanelPopout }  from '../components/panelPopout.js';

export function initAnalyserWindow(viewport) {
  const win = document.getElementById('win-analyser');
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
    const minVal = () => input.min !== '' ? parseFloat(input.min) : -Infinity;

    // Clamp on any typed input
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      if (!isNaN(v) && v < minVal()) input.value = minVal();
    });

    // Wheel — also clamp
    input.addEventListener('wheel', e => {
      if (document.activeElement !== input) return;
      e.preventDefault();
      const step = parseFloat(input.step) || 1;
      const cur  = parseFloat(input.value) || 0;
      let next = e.deltaY < 0 ? cur + step : cur - step;
      next = Math.max(minVal(), next);
      // For inputs with a fixed step (e.g. power-factor step=0.01), round to
      // avoid floating-point drift (0.1 + 0.01 = 0.10999999…)
      if (input.step && input.step !== 'any') {
        const decimals = (input.step.includes('.') ? input.step.split('.')[1].length : 0);
        next = parseFloat(next.toFixed(decimals));
      }
      // Respect max attribute
      if (input.max !== '') next = Math.min(parseFloat(input.max), next);
      input.value = next;
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

  // Panel pop-out buttons (must come after initPanelLayout)
  initPanelPopout(win, viewport);

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

  // Model suggestion balloons for line-length + voltage
  _initModelHints(win);

  // Sub-conductor spacing accuracy warning
  _initSubSpacingWarning(win);

  // Status bar hover hints
  _initStatusBarHints(win);

  // Diagram panes
  const container = win.querySelector('#canvas-container');
  if (container) initDiagramContainer(container);
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
  let applied = 0;
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
      if (el) { el.value = val; applied++; }
    }
  });
  Object.entries(SELECT_CONTRACT).forEach(([id, key]) => {
    const val = data[key] ?? data[id];
    if (val != null) {
      const el = win.querySelector('#' + id);
      if (el) { el.value = val; applied++; }
    }
  });
  // Notify dependent UI (e.g. spacing toggle) that selects were changed programmatically
  win.querySelector('#system-type')?.dispatchEvent(new Event('change'));
  return applied;
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
  const { inputs, outputs } = _lastResults;
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/>
<title>Transmission Line Analysis Report</title>
<style>${PDF_STYLES}</style>
</head>
<body>${buildReportPage(inputs, outputs, 1, 1)}</body>
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
      let data;
      try {
        data = JSON.parse(e.target.result);
      } catch {
        showError('Invalid file format. The selected file is not a valid JSON file.');
        return;
      }
      const applied = _applyInputs(win, data);
      if (applied === 0) {
        showError('Invalid file format. The selected file does not contain recognised input parameters.');
        return;
      }
      const sb = win.querySelector('#sb-status');
      if (sb) sb.textContent = 'Loaded';
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

    // Skip panels that are currently popped out into their own window —
    // the pop-out module owns their visibility while they are detached.
    if (panelLeft && panelLeft.dataset.poppedOut !== 'true') {
      panelLeft.style.display = showInput ? '' : 'none';
      // When canvas is hidden, let input pane grow to fill the full width
      panelLeft.style.flex = (showInput && !showCanvas) ? '1' : '';
    }
    if (panelRight  && panelRight.dataset.poppedOut  !== 'true') panelRight.style.display  = showCanvas ? '' : 'none';
    if (panelBottom && panelBottom.dataset.poppedOut !== 'true') panelBottom.style.display = showOutput ? '' : 'none';

    // Splitters depend on which panels are currently in the layout
    const leftInLayout   = panelLeft   && panelLeft.dataset.poppedOut   !== 'true' && showInput;
    const rightInLayout  = panelRight  && panelRight.dataset.poppedOut  !== 'true' && showCanvas;
    const bottomInLayout = panelBottom && panelBottom.dataset.poppedOut !== 'true' && showOutput;
    if (splitterV) splitterV.style.display = (leftInLayout && rightInLayout) ? '' : 'none';
    if (topRow)    topRow.style.display    = (leftInLayout || rightInLayout) ? '' : 'none';
    if (splitterH) splitterH.style.display = ((leftInLayout || rightInLayout) && bottomInLayout) ? '' : 'none';
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

// ─── Model suggestion balloons ───────────────────────────────────────────────

function _modelHintFor(km, kv) {
  // Determine suggested model from value (one of km or kv is provided).
  // Returns { title, message } for a 'info' balloon, or null if value ≤ 0.
  let cat;
  const v = km ?? kv;
  if (v <= 0 || isNaN(v)) return null;

  if (km !== null) {
    cat = km < 80 ? 0 : km <= 250 ? 1 : 2;
  } else {
    cat = kv < 20 ? 0 : kv <= 150 ? 1 : 2;
  }

  const labels = [
    ['Short line',                  '< 80 km   /   < 20 kV'],
    ['Medium line (Nominal \u03c0)', '80 \u2013 250 km   /   20 \u2013 150 kV'],
    ['Long line (Distributed)',     '> 250 km   /   > 150 kV'],
  ];
  return {
    title:   labels[cat][0] + ' suggested',
    message: labels[cat][1],
  };
}

function _initModelHints(win) {
  const lenInput  = win.querySelector('#line-length');
  const lenSelect = win.querySelector('select[data-unit-for="line-length"]');
  const vltInput  = win.querySelector('#voltage');
  const vltSelect = win.querySelector('select[data-unit-for="voltage"]');
  const modelSel  = win.querySelector('#line-model');

  function _selectedCat() {
    const v = modelSel ? modelSel.selectedIndex : -1;
    return v; // 0=Short, 1=Nominal π, 2=Distributed
  }

  function _check(anchorEl, km, kv) {
    const hint = _modelHintFor(km, kv);
    if (!hint) { hideBalloon(); return; }
    const cat = km !== null
      ? (km < 80 ? 0 : km <= 250 ? 1 : 2)
      : (kv < 20 ? 0 : kv <= 150 ? 1 : 2);
    if (cat === _selectedCat()) { hideBalloon(); return; }
    // Only show if the anchor field is currently visible in the viewport
    const r = anchorEl.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= window.innerHeight ||
        r.right  <= 0 || r.left >= window.innerWidth) return;
    showBalloon(anchorEl, { ...hint, type: 'info' });
  }

  function onLen() { _check(lenInput, getBaseValue('line-length', win), null); }
  function onVlt() { _check(vltInput, null, getBaseValue('voltage', win)); }

  // When the model selector itself changes, anchor the balloon to it
  function onModelChange() {
    const km = getBaseValue('line-length', win);
    const kv = getBaseValue('voltage', win);
    const hasKm = !isNaN(km) && km > 0;
    const hasKv = !isNaN(kv) && kv > 0;
    if (!hasKm && !hasKv) { hideBalloon(); return; }
    const hint = hasKm ? _modelHintFor(km, null) : _modelHintFor(null, kv);
    if (!hint) { hideBalloon(); return; }
    const cat = hasKm
      ? (km < 80 ? 0 : km <= 250 ? 1 : 2)
      : (kv < 20 ? 0 : kv <= 150 ? 1 : 2);
    if (cat === _selectedCat()) { hideBalloon(); return; }
    showBalloon(modelSel, { ...hint, type: 'info' });
  }

  lenInput?.addEventListener('input',   onLen);
  lenSelect?.addEventListener('change', onLen);
  vltInput?.addEventListener('input',   onVlt);
  vltSelect?.addEventListener('change', onVlt);
  modelSel?.addEventListener('change',  onModelChange);
}

// ─── Sub-conductor spacing warning ─────────────────────────────────────────

function _initSubSpacingWarning(win) {
  const subInput  = win.querySelector('#sub-spacing');
  const subSelect = win.querySelector('select[data-unit-for="sub-spacing"]');
  const sysType   = win.querySelector('#system-type');

  function _check() {
    const sc = getBaseValue('sub-spacing', win);
    if (isNaN(sc) || sc <= 0) { hideBalloon(); return; }

    const isUnsym = sysType?.value?.toLowerCase().includes('unsym');
    let minPhase;
    if (isUnsym) {
      const dab = getBaseValue('dab', win);
      const dbc = getBaseValue('dbc', win);
      const dca = getBaseValue('dca', win);
      const vals = [dab, dbc, dca].filter(v => !isNaN(v) && v > 0);
      minPhase = vals.length ? Math.min(...vals) : NaN;
    } else {
      minPhase = getBaseValue('phase-spacing', win);
    }

    if (isNaN(minPhase) || minPhase <= 0) { hideBalloon(); return; }

    if (sc > minPhase / 10) {
      showBalloon(subInput, {
        title: 'Reduced accuracy',
        message: 'Sub-conductor spacing exceeds 1/10 of phase spacing. ' +
                 'The mutual GMD approximation becomes less accurate.',
        type: 'warning',
      });
    } else {
      hideBalloon();
    }
  }

  subInput?.addEventListener('input',   _check);
  subSelect?.addEventListener('change', _check);
  win.querySelector('#phase-spacing')?.addEventListener('input',   _check);
  win.querySelector('select[data-unit-for="phase-spacing"]')?.addEventListener('change', _check);
  win.querySelector('#dab')?.addEventListener('input',   _check);
  win.querySelector('select[data-unit-for="dab"]')?.addEventListener('change', _check);
  win.querySelector('#dbc')?.addEventListener('input',   _check);
  win.querySelector('select[data-unit-for="dbc"]')?.addEventListener('change', _check);
  win.querySelector('#dca')?.addEventListener('input',   _check);
  win.querySelector('select[data-unit-for="dca"]')?.addEventListener('change', _check);
  sysType?.addEventListener('change', _check);
}

// ─── Status bar hover hints ──────────────────────────────────────────────────

const SB_HINTS = {
  // Toolbar
  'btn-compute':        'Run the transmission line analysis with the current input parameters',
  'btn-save-input':     'Save the current input parameters to a JSON file',
  'btn-load-input':     'Load previously saved input parameters from a JSON file',
  'btn-export-output':  'Export the computed results to a JSON file',
  'btn-batch-mode':     'Run batch analysis over a swept range of parameter values',
  'btn-view-code':      'View the transmission line calculation source code',
  'btn-view-calc':      'View the mathematical formulae and derivations used in the calculations',
  // File menu
  'menu-save-as-pdf':   'Generate a formatted PDF report of the input parameters and computed results',
  // View menu check items
  'view-pane-input':    'Show or hide the input parameters pane',
  'view-pane-canvas':   'Show or hide the conductor geometry canvas',
  'view-pane-output':   'Show or hide the results output pane',
  // Electrical inputs
  'line-length':        'Total length of the three-phase transmission line',
  'line-length-unit':   'Select the display unit for line length (value is converted to km for the calculation)',
  'load-mw':            'Active power consumed by the three-phase receiving end load',
  'load-mw-unit':       'Select the display unit for load power (value is converted to MW)',
  'power-factor':       'Power factor of the receiving end load — enter a value between 0 and 1 (lagging assumed)',
  'voltage':            'Nominal line-to-line RMS voltage at the receiving end busbar',
  'voltage-unit':       'Select the display unit for voltage (value is converted to kV)',
  'frequency':          'Power system frequency in Hz — typically 50 Hz or 60 Hz',
  'system-type':        'Symmetrical: equal phase spacing D. Unsymmetrical (transposed): specify Dab, Dbc, Dca individually',
  // Geometry inputs
  'phase-spacing':      'Centre-to-centre distance between adjacent phase conductors (used when Symmetrical is selected)',
  'phase-spacing-unit': 'Select the display unit for phase spacing',
  'dab':                'Centre-to-centre distance between phase A and phase B conductors',
  'dab-unit':           'Select the display unit for Dab',
  'dbc':                'Centre-to-centre distance between phase B and phase C conductors',
  'dbc-unit':           'Select the display unit for Dbc',
  'dca':                'Centre-to-centre distance between phase C and phase A conductors',
  'dca-unit':           'Select the display unit for Dca',
  'bundle-count':       'Number of sub-conductors per bundle — 2, 3, or 4',
  'sub-spacing':        'Centre-to-centre spacing between adjacent sub-conductors within the bundle',
  'sub-spacing-unit':   'Select the display unit for sub-conductor spacing',
  // Conductor inputs
  'strands':            'Total number of strands in each sub-conductor — must satisfy 3n²−3n+1 (valid: 7, 19, 37, 61…)',
  'dia-strands':        'Outer diameter of a single strand; all strands are assumed equal',
  'dia-strands-unit':   'Select the display unit for strand diameter',
  'resistance':         'AC resistance of a single sub-conductor per unit length at operating temperature',
  'resistance-unit':    'Select the display unit for resistance per unit length',
  // Model selection
  'line-model':         'Short: lumped Z only.  Nominal \u03c0: adds shunt Y/2 at each end.  Distributed: exact hyperbolic ABCD model',
};

function _initStatusBarHints(win) {
  const sbHover = win.querySelector('#sb-hover');
  if (!sbHover) return;

  win.addEventListener('mouseover', e => {
    let node = e.target;
    while (node && node !== win) {
      if (node.id && node.id in SB_HINTS) {
        sbHover.textContent = SB_HINTS[node.id];
        return;
      }
      node = node.parentElement;
    }
  });

  win.addEventListener('mouseout', e => {
    if (!win.contains(e.relatedTarget)) {
      sbHover.textContent = '';
    }
  });
}

function _compute(win) {
  const sbStatus = win.querySelector('#sb-status');
  const sbTime   = win.querySelector('#sb-time');

  const t0 = performance.now();

  // ── Read form values ───────────────────────────────────────────────────────
  const v = id => win.querySelector('#' + id);
  const n = id => parseFloat(v(id)?.value ?? '');
  const bv = id => getBaseValue(id, win);

  const isUnsym = v('system-type')?.value?.toLowerCase().includes('unsym');

  const params = {
    lineLengthKm:  bv('line-length'),
    recvLoadMW:    bv('load-mw'),
    recvPF:        n('power-factor'),
    nomSyskV:      bv('voltage'),
    frequency:     n('frequency'),
    symmetric:     isUnsym ? 0 : 1,
    Dab:           isUnsym ? bv('dab')          : bv('phase-spacing'),
    Dbc:           isUnsym ? bv('dbc')          : bv('phase-spacing'),
    Dca:           isUnsym ? bv('dca')          : bv('phase-spacing'),
    phaseSpacingM: isUnsym ? bv('phase-spacing') : bv('phase-spacing'), // hidden when unsym; not used by tadee.js in that case
    scCount:       parseInt(v('bundle-count')?.value ?? '1', 10),
    scSpacingM:    bv('sub-spacing'),
    scStrands:     n('strands'),
    strandDiaM:    bv('dia-strands'),
    resSCPerKm:    bv('resistance'),
    model:         normaliseModel(v('line-model')?.value ?? 'Short'),
  };

  // ── Validate ───────────────────────────────────────────────────────────────
  // phaseSpacingM is hidden (and unused) when unsymmetric — skip it in that case
  const bad = Object.entries(params).filter(([k, val]) => {
    if (k === 'phaseSpacingM' && isUnsym) return false;
    return isNaN(val) && typeof val !== 'string';
  });
  if (bad.length) {
    if (sbStatus) sbStatus.textContent = 'Error: fill all fields';
    showError('Please fill in all required fields before running the analysis.');
    return;
  }

  // ── Run ────────────────────────────────────────────────────────────────────
  try {
    const result = computeFromParams(params);

    if (_gridApi) _gridApi.setData(result.rows);

    // ── Store results for Export Output / PDF ─────────────────────────────────
    _lastResults = { inputs: result.inputs, outputs: result.outputs };
    const btnExport = win.querySelector('#btn-export-output');
    if (btnExport) btnExport.disabled = false;
    const menuPdf = win.querySelector('#menu-save-as-pdf');
    if (menuPdf) menuPdf.disabled = false;

    updateDiagrams(result.inputs, result.outputs);

    const elapsed = (performance.now() - t0).toFixed(1);
    if (sbTime)   sbTime.textContent   = `Time: ${elapsed} ms`;
    if (sbStatus) sbStatus.textContent = 'Done';
  } catch (e) {
    if (sbStatus) sbStatus.textContent = 'Compute error';
    showError(e?.message ?? 'Unknown computation error.');
  }
}


