/**
 * analyser.js — Analyser window content initialiser.
 *
 * The analyser window element is statically authored in index.html with
 * id="win-analyser". This module initialises its interactive sub-components:
 * menu bar, splitter panels, results grid, and Three.js geometry viewer.
 *
 * @param {HTMLElement} viewport — the #viewport element (passed for consistency
 *                                 with the addWindow API, not used directly here)
 */

import { initMenuBar }      from '../components/menuSystem.js';
import { openBatchWindow, loadAndRunBatchEntries } from './batchWindow.js';
import { openPreferencesWindow } from './preferencesWindow.js';
import { openHelpWindow }        from './helpWindow.js';
import { openAboutWindow }       from './aboutWindow.js';
import { initPanelLayout }  from '../components/panels.js';
import { initResultsGrid }  from '../components/grid.js';
import { initTooltips }     from '../components/tooltip.js';
import { initUnitInputs, getBaseValue } from '../components/unitInput.js';
import { showError, showConfirm, showWindowCloseConfirm } from '../components/errorDialog.js';
import { showBalloon, hideBalloon }    from '../components/balloon.js';
import { initDiagramContainer, updateDiagrams,
         renderArrangementSvgStr, renderCircuitSvgStr, renderPhasorSvgStr } from '../components/diagrams.js';
import { computeFromParams, normaliseModel, fmtComplex, fmtComplexLong, buildReportPage, buildDiagramPage, PDF_STYLES } from '../../batch.js';
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

  // File menu
  _initFileMenu(win, viewport);

  // Edit menu
  const menuPreferences = document.getElementById('menu-preferences');
  if (menuPreferences) menuPreferences.addEventListener('click', () => openPreferencesWindow(viewport));

  // Tools menu
  _initToolsMenu(win, viewport);

  // Help menu
  document.getElementById('menu-help-topics')?.addEventListener('click', () => openHelpWindow(viewport));
  document.getElementById('menu-about')?.addEventListener('click',       () => openAboutWindow(viewport));

  // Spacing toggle (symmetric vs unsymmetric)
  _initSpacingToggle(win);

  // Toolbar scroll arrows
  _initToolbarScroll(win);

  // Model suggestion balloons for line-length + voltage
  _initModelHints(win);

  // Sub-conductor spacing accuracy warning
  _initSubSpacingWarning(win);

  // Status bar hover hints
  _initStatusBarHints(win);

  // Diagram panes
  const container = win.querySelector('#canvas-container');
  if (container) initDiagramContainer(container);

  // Close guard — confirm before closing if there are unsaved inputs
  win._closeGuard = (proceed) => {
    if (hasAnalyserInputs()) {
      showWindowCloseConfirm(proceed);
    } else {
      proceed();
    }
  };
}

/**
 * Returns true if the TLA window is currently visible (not hidden/closed).
 */
export function isAnalyserOpen() {
  const win = document.getElementById('win-analyser');
  return !!win && win.style.visibility !== 'hidden';
}

/**
 * Returns true if any numeric input field in the TLA window has a value.
 */
export function hasAnalyserInputs() {
  const win = document.getElementById('win-analyser');
  if (!win) return false;
  return Array.from(win.querySelectorAll('input[type=number]'))
    .some(el => el.value.trim() !== '');
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
  const data  = _collectInputs(win);
  const stamp = _timestamp();
  _triggerDownload(JSON.stringify(data, null, 2), `tadee-inputs_${stamp}.json`, 'application/json');
  const sb = win.querySelector('#sb-status');
  if (sb) sb.textContent = 'Saved';
}

function _exportOutput(win) {
  if (!_lastResults) return;
  const stamp = _timestamp();
  const { inputs, outputs, rows } = _lastResults;
  const comments = [
    `// ${REPORT_META.title}`,
    `// ${REPORT_META.subtitle}`,
    `// Team Members:   ${REPORT_META.team}`,
    `// Date:           ${REPORT_META.date}`,
    `// Generated:      ${_isoTimestamp()}`,
    `// ${REPORT_META.footer}`,
  ].join('\n');
  const body = JSON.stringify({ inputs, outputs }, null, 2);
  _triggerDownload(comments + '\n' + body, `tadee-output_${stamp}.json`, 'application/json');
  const sb = win.querySelector('#sb-status');
  if (sb) sb.textContent = 'Exported';
}

// ─── PDF report ──────────────────────────────────────────────────────────────

function _exportPdf(win) {
  if (!_lastResults) return;
  const { inputs, outputs } = _lastResults;

  // Render all three diagrams at fixed PDF canvas dimensions.
  const svgs = {
    arrangement: renderArrangementSvgStr(inputs,          700, 240),
    circuit:     renderCircuitSvgStr(inputs, outputs,     700, 210),
    phasor:      renderPhasorSvgStr(inputs,  outputs,     700, 260),
  };

  const page1 = buildReportPage(inputs, outputs, 1, 1);
  const page2 = buildDiagramPage(inputs, svgs);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/>
<title>Transmission Line Analysis Report</title>
<style>${PDF_STYLES}</style>
</head>
<body>${page1}
${page2}</body>
</html>`;
  const pw = window.open('', '_blank');
  if (!pw) return;
  pw.document.open();
  pw.document.write(html);
  pw.document.close();
  pw.focus();
  pw.print();
}

function _exportTxt(win) {
  if (!_lastResults) return;
  const { inputs, outputs } = _lastResults;
  const inputRows  = _buildInputRows(inputs);
  const resultRows = _buildResultRows(outputs);

  const HR = '\u2500'.repeat(62);
  const col = (s, w) => String(s).padEnd(w);
  const numCol = (n, s, w) => `${String(n).padStart(2)}.  ${col(s, w)}`;

  const lines = [
    REPORT_META.title.toUpperCase(),
    REPORT_META.subtitle,
    '',
    `Team Members:   ${REPORT_META.team}`,
    `Date:           ${REPORT_META.date}`,
    `Generated:      ${_isoTimestamp()}`,
    '',
    'INPUT PARAMETERS',
    HR,
    ...inputRows.map(([label, val], i) => `${numCol(i + 1, label, 44)}${val}`),
    '',
    'ANALYSIS RESULTS',
    HR,
    ...resultRows.map(([label, val, unit], i) =>
      `${numCol(i + 1, label, 44)}${col(val, 28)}${unit}`
    ),
    '',
    HR,
    REPORT_META.footer,
  ];
  const stamp = _timestamp();
  _triggerDownload(lines.join('\n'), `tadee-results_${stamp}.txt`, 'text/plain');
  const sb = win.querySelector('#sb-status');
  if (sb) sb.textContent = 'Exported';
}

function _exportMd(win) {
  if (!_lastResults) return;
  const { inputs, outputs } = _lastResults;
  const inputRows  = _buildInputRows(inputs);
  const resultRows = _buildResultRows(outputs);

  const lines = [
    `# ${REPORT_META.title}`,
    `> ${REPORT_META.subtitle}`,
    '',
    '| | |',
    '| --- | --- |',
    `| **Team Members** | ${REPORT_META.team} |`,
    `| **Date of Submission** | ${REPORT_META.date} |`,
    `| **Generated** | ${_isoTimestamp()} |`,
    '',
    '## Input Parameters',
    '',
    '| # | Parameter | Value |',
    '| --- | --- | --- |',
    ...inputRows.map(([label, val], i) => `| ${i + 1} | ${label} | ${val} |`),
    '',
    '## Analysis Results',
    '',
    '| # | Parameter | Value | Unit |',
    '| --- | --- | --- | --- |',
    ...resultRows.map(([label, val, unit], i) => `| ${i + 1} | ${label} | ${val} | ${unit} |`),
    '',
    '---',
    `*${REPORT_META.footer}*`,
  ];
  const stamp = _timestamp();
  _triggerDownload(lines.join('\n'), `tadee-results_${stamp}.md`, 'text/markdown');
  const sb = win.querySelector('#sb-status');
  if (sb) sb.textContent = 'Exported';
}

// ─── Report metadata (mirrors buildReportPage) ──────────────────────────────
const REPORT_META = {
  title:    'Transmission Line Analysis Report',
  subtitle: 'Three-Phase Single-Circuit Bundled Conductor Transmission System',
  team:     'Ilamparithi Murali (107124046), Priyadarsan ST (107124084), Srijith M S (107124110)',
  date:     '17/04/2026',
  footer:   'TADEE Group 7 \u2014 Transmission Line Analyser',
};

/** Returns [[label, valueString], ...] for the input parameters section (mirrors PDF table). */
function _buildInputRows(inp) {
  const modelLabel = ['Short line', 'Nominal \u03c0', 'Distributed parameter'][inp.model] ?? String(inp.model);
  const symLabel   = (inp.symmetric === 1 || inp.symmetric === '1') ? 'Symmetrical' : 'Unsymmetrical';
  const spacingStr = (inp.symmetric === 1 || inp.symmetric === '1')
    ? `${inp.phaseSpacingM} m`
    : `Dab = ${inp.Dab} m, Dbc = ${inp.Dbc} m, Dca = ${inp.Dca} m`;
  return [
    ['Length of the line',                    `${inp.lineLengthKm} km`],
    ['Receiving end load',                    `${inp.recvLoadMW} MW`],
    ['Power factor (receiving end)',           `${inp.recvPF}`],
    ['Nominal system voltage',                `${inp.nomSyskV} kV`],
    ['Power frequency',                       `${inp.frequency} Hz`],
    ['Spacing type',                          symLabel],
    ['Phase conductor spacing',               spacingStr],
    ['Sub-conductors per bundle',             `${inp.scCount}`],
    ['Sub-conductor spacing',                 `${inp.scSpacingM} m`],
    ['Number of strands per sub-conductor',   `${inp.scStrands}`],
    ['Strand diameter',                       `${inp.strandDiaM} m`],
    ['AC resistance per sub-conductor',       `${inp.resSCPerKm} \u03a9/km`],
    ['Line model',                            modelLabel],
  ];
}

/** Returns [[label, valueString, unit], ...] for the results section (mirrors PDF table). */
function _buildResultRows(out) {
  const fc = fmtComplexLong;
  return [
    ['Inductance per phase per km',         out.Lphkm.toExponential(4),              'H/km'],
    ['Capacitance per phase per km',        out.Cphkm.toExponential(4),              'F/km'],
    ['Inductive reactance XL',              out.Xl.toFixed(4),                       '\u03a9'],
    ['Capacitive reactance XC',             out.Xc.toFixed(4),                       '\u03a9'],
    ['ABCD \u2014 A',                       fc(out.A),                               ''],
    ['ABCD \u2014 B',                       fc(out.B),                               '\u03a9'],
    ['ABCD \u2014 C',                       fc(out.C),                               'S'],
    ['ABCD \u2014 D',                       fc(out.D),                               ''],
    ['Sending end voltage (phase)',          fc(out.Vs_phase_kV),                     'kV'],
    ['Sending end voltage (line-to-line)',   fc(out.Vs_line_kV),                      'kV'],
    ['Sending end current Is',              fc(out.Is_A),                            'A'],
    ['Charging current Ic',                 fc(out.Ic_A),                            'A'],
    ['Voltage regulation',                  out.VR.toFixed(4),                       '%'],
    ['Power loss (3\u03c6)',                out.lossMW.toFixed(4),                   'MW'],
    ['Transmission efficiency',             (out.eta * 100).toFixed(2),              '%'],
    ['Surge impedance Zc',                  out.Zc.toFixed(4),                       '\u03a9'],
    ['Surge impedance loading (SIL)',        out.SIL.toFixed(4),                      'MW'],
  ];
}

function _timestamp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}` +
         `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function _isoTimestamp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}` +
         ` ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
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

// ─── File menu ───────────────────────────────────────────────────────────────

function _clearInputs(win) {
  INPUT_FIELDS.forEach(([id]) => {
    const el = win.querySelector('#' + id);
    if (el) el.value = '';
  });
  // Reset selects to their first option (default)
  SELECT_FIELDS.forEach(id => {
    const el = win.querySelector('#' + id);
    if (el) el.selectedIndex = 0;
  });
  win.querySelector('#system-type')?.dispatchEvent(new Event('change'));
  const sb = win.querySelector('#sb-status');
  if (sb) sb.textContent = 'Ready';
}

/** Returns true if every element is a { inputs, outputs } batch-output entry. */
function _isBatchOutputArray(data) {
  return Array.isArray(data) && data.length > 0 &&
    data.every(e => e !== null && typeof e === 'object' &&
      e.inputs  !== null && typeof e.inputs  === 'object' &&
      e.outputs !== null && typeof e.outputs === 'object');
}

/** Returns true if the JSON looks like a batch input file (array or columnar object)
 *  but NOT a batch output file. */
function _isBatchJson(data) {
  if (Array.isArray(data)) return !_isBatchOutputArray(data);
  if (data !== null && typeof data === 'object') {
    const values = Object.values(data);
    return values.length > 0 && values.every(v => Array.isArray(v));
  }
  return false;
}

/** Returns true if the JSON looks like a saved output file ({ inputs, outputs }). */
function _isOutputJson(data) {
  return data !== null && typeof data === 'object' &&
    !Array.isArray(data) &&
    data.inputs  !== null && typeof data.inputs  === 'object' &&
    data.outputs !== null && typeof data.outputs === 'object';
}

/**
 * Show the authenticity warning, then on confirm open/raise the batch window
 * and re-run the batch using the saved input arrays as entries.
 */
function _openBatchOutputJson(viewport, data) {
  showConfirm(
    'Output values in this file may have been modified by an external source.\n\n' +
    'The entries will be re-computed from their saved inputs to verify the results.',
    () => {
      const entries = data.map(e => e.inputs);
      loadAndRunBatchEntries(viewport, entries);
    }
  );
}

/**
 * Show the authenticity warning, then on confirm apply the saved inputs and
 * re-run compute so the grid reflects verified results.
 */
function _openOutputJson(win, data) {
  showConfirm(
    'Output values in this file may have been modified by an external source.\n\n' +
    'The inputs will be loaded and Compute will be run automatically to verify the results.',
    () => {
      // Translate numeric-coded fields back to the select option strings that
      // _applyInputs expects (result.inputs stores computed integers, not raw
      // select text values).
      const MODEL_LABELS = ['Short', 'Nominal \u03c0', 'Distributed'];
      const inputs = { ...data.inputs };
      if (typeof inputs.symmetric === 'number')
        inputs.symmetric = inputs.symmetric === 0 ? 'Unsymmetrical' : 'Symmetrical';
      if (typeof inputs.model === 'number')
        inputs.model = MODEL_LABELS[inputs.model] ?? 'Short';

      const applied = _applyInputs(win, inputs);
      if (applied === 0) {
        showError('Invalid file format. The saved inputs could not be applied.');
        return;
      }
      _compute(win);
    }
  );
}

function _initFileMenu(win, viewport) {
  // New — clear all inputs with confirmation
  win.querySelector('#menu-file-new')?.addEventListener('click', () => {
    if (hasAnalyserInputs()) {
      showConfirm('Clear all inputs?', () => _clearInputs(win));
    } else {
      _clearInputs(win);
    }
  });

  // Open — detect input JSON vs batch JSON and route accordingly
  win.querySelector('#menu-file-open')?.addEventListener('click', () => {
    const picker = document.createElement('input');
    picker.type   = 'file';
    picker.accept = '.json,application/json';
    picker.addEventListener('change', () => {
      const file = picker.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        let data;
        try { data = JSON.parse(e.target.result); }
        catch { showError('Invalid file format. The selected file is not a valid JSON file.'); return; }

        if (_isBatchJson(data)) {
          openBatchWindow(viewport);
        } else if (_isBatchOutputArray(data)) {
          _openBatchOutputJson(viewport, data);
        } else if (_isOutputJson(data)) {
          _openOutputJson(win, data);
        } else {
          const applied = _applyInputs(win, data);
          if (applied === 0) {
            showError('Invalid file format. The selected file does not contain recognised input parameters.');
            return;
          }
          const sb = win.querySelector('#sb-status');
          if (sb) sb.textContent = 'Loaded';
        }
      };
      reader.readAsText(file);
    });
    picker.click();
  });

  // Save — same as toolbar Save Input button
  win.querySelector('#menu-file-save')?.addEventListener('click', () => _saveInputs(win));

  // Print — generate report HTML then call print() (no download)
  win.querySelector('#menu-file-print')?.addEventListener('click', () => {
    if (!_lastResults) {
      showError('No results to print. Run Compute first.');
      return;
    }
    const { inputs, outputs } = _lastResults;
    const svgs = {
      arrangement: renderArrangementSvgStr(inputs,         700, 240),
      circuit:     renderCircuitSvgStr(inputs, outputs,    700, 210),
      phasor:      renderPhasorSvgStr(inputs,  outputs,    700, 260),
    };
    const page1 = buildReportPage(inputs, outputs, 1, 1);
    const page2 = buildDiagramPage(inputs, svgs);
    const html = `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"/>\n<title>Transmission Line Analysis Report</title>\n<style>${PDF_STYLES}</style>\n</head>\n<body>${page1}\n${page2}</body>\n</html>`;
    const pw = window.open('', '_blank');
    if (!pw) return;
    pw.document.open();
    pw.document.write(html);
    pw.document.close();
    pw.focus();
    pw.print();
  });

  // Exit — same as title-bar Close button
  win.querySelector('#menu-file-exit')?.addEventListener('click', () => {
    if (win._closeGuard) {
      win._closeGuard(() => win.querySelector('[aria-label="Close"]')?.click());
    } else {
      win.querySelector('[aria-label="Close"]')?.click();
    }
  });

  // Export result as… submenu — position:fixed panel shown on hover
  const exportTrigger = win.querySelector('#menu-export-trigger');
  const exportPanel   = document.getElementById('submenu-export');

  if (exportTrigger && exportPanel) {
    let _closeTimer = null;

    const _showPanel = () => {
      clearTimeout(_closeTimer);
      const dropdown = exportTrigger.closest('.dropdown');
      const dr = (dropdown || exportTrigger).getBoundingClientRect();
      const tr = exportTrigger.getBoundingClientRect();
      exportPanel.style.left = dr.right + 'px';
      exportPanel.style.top  = tr.top + 'px';
      exportPanel.classList.add('open');
    };

    const _scheduleHide = () => {
      _closeTimer = setTimeout(() => exportPanel.classList.remove('open'), 120);
    };

    exportTrigger.addEventListener('mouseenter', _showPanel);
    exportTrigger.addEventListener('mouseleave', _scheduleHide);
    exportPanel.addEventListener('mouseenter', () => clearTimeout(_closeTimer));
    exportPanel.addEventListener('mouseleave', _scheduleHide);

    // Close when hovering other items in the File menu
    ['menu-file-new', 'menu-file-open', 'menu-file-save', 'menu-file-print', 'menu-file-exit'].forEach(id => {
      win.querySelector('#' + id)?.addEventListener('mouseenter', () => exportPanel.classList.remove('open'));
    });

    // Close when the menu bar is dismissed (document click / switching to another menu)
    document.addEventListener('click', () => exportPanel.classList.remove('open'));
  }

  // Export result as… button actions (panel lives outside #win-analyser, use document)
  document.getElementById('menu-export-pdf')?.addEventListener('click',  () => _exportPdf(win));
  document.getElementById('menu-export-json')?.addEventListener('click', () => _exportOutput(win));
  document.getElementById('menu-export-txt')?.addEventListener('click',  () => _exportTxt(win));
  document.getElementById('menu-export-md')?.addEventListener('click',   () => _exportMd(win));
}

function _openFilePicker(accept, onData) {
  const picker = document.createElement('input');
  picker.type   = 'file';
  picker.accept = accept;
  picker.addEventListener('change', () => {
    const file = picker.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => onData(e.target.result, file.name);
    reader.readAsText(file);
  });
  picker.click();
}

function _initToolsMenu(win, viewport) {
  // Import Input JSON — same routing as File → Open but restricted to input JSON
  document.getElementById('menu-import-input')?.addEventListener('click', () => {
    _openFilePicker('.json,application/json', (text) => {
      let data;
      try { data = JSON.parse(text); }
      catch { showError('Invalid file format. The selected file is not a valid JSON file.'); return; }

      if (_isBatchJson(data)) {
        openBatchWindow(viewport);
        return;
      }
      if (_isBatchOutputArray(data) || _isOutputJson(data)) {
        showError('This file contains output results, not input parameters.\nUse Tools → Import Output JSON to load it.');
        return;
      }
      const applied = _applyInputs(win, data);
      if (applied === 0) {
        showError('Invalid file format. The selected file does not contain recognised input parameters.');
        return;
      }
      const sb = win.querySelector('#sb-status');
      if (sb) sb.textContent = 'Loaded';
    });
  });

  // Import Output JSON — always enabled; shows authenticity warning then loads
  document.getElementById('menu-import-output')?.addEventListener('click', () => {
    _openFilePicker('.json,application/json', (text) => {
      let data;
      try { data = JSON.parse(text); }
      catch { showError('Invalid file format. The selected file is not a valid JSON file.'); return; }

      if (_isBatchOutputArray(data)) {
        _openBatchOutputJson(viewport, data);
      } else if (_isOutputJson(data)) {
        _openOutputJson(win, data);
      } else {
        showError('This file does not appear to contain output results.\nUse Tools → Import Input JSON to load input parameters.');
      }
    });
  });
}

function _initViewMenu(win) {
  const topRow      = win.querySelector('#panel-top-row');
  const panelLeft   = win.querySelector('#panel-left');
  const splitterV   = win.querySelector('#splitter-v');
  const panelRight  = win.querySelector('#panel-right');
  const splitterH   = win.querySelector('#splitter-h');
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

  // Individual diagram pane visibility (queried lazily as container is built after init)
  function _applyDiagrams() {
    const container = win.querySelector('#canvas-container');
    if (!container) return;
    const showArr = document.getElementById('view-canvas-arrangement')?.dataset.checked === 'true';
    const showPha = document.getElementById('view-canvas-phasor')?.dataset.checked      === 'true';
    const showCir = document.getElementById('view-canvas-circuit')?.dataset.checked     === 'true';

    const paneArr = container.querySelector('.dpane-arrangement');
    const panePha = container.querySelector('.dpane-phasor');
    const paneCir = container.querySelector('.dpane-circuit');
    const splV    = container.querySelector('.dg-splitter-v');
    const splH    = container.querySelector('.dg-splitter-h');

    if (paneArr) paneArr.style.display = showArr ? '' : 'none';
    if (panePha) panePha.style.display = showPha ? '' : 'none';
    if (paneCir) paneCir.style.display = showCir ? '' : 'none';

    // Reset any previously applied grid overrides before re-evaluating
    [paneArr, panePha, paneCir].forEach(p => {
      if (p) { p.style.gridColumn = ''; p.style.gridRow = ''; }
    });
    if (splV) splV.style.display = '';
    if (splH) splH.style.display = '';

    const activeCount = [showArr, showPha, showCir].filter(Boolean).length;

    if (activeCount === 1) {
      // Single active pane fills the whole grid
      const solo = showArr ? paneArr : showPha ? panePha : paneCir;
      if (solo) { solo.style.gridColumn = '1 / span 3'; solo.style.gridRow = '1 / span 3'; }
      if (splV) splV.style.display = 'none';
      if (splH) splH.style.display = 'none';
    } else if (showArr && showPha && !showCir) {
      // Arrangement + Phasor only: both span the full width; hide vertical splitter
      if (paneArr) paneArr.style.gridColumn = '1 / span 3';
      if (panePha) panePha.style.gridColumn = '1 / span 3';
      if (splV)    splV.style.display = 'none';
      // splH stays visible between arrangement (row 1) and phasor (row 3)
    }
    // All other cases (all three on, or any two-pane combo involving circuit): CSS defaults

    // Sync parent "Whole pane" and canvas pane check states
    const allOn = showArr && showPha && showCir;
    const anyOn = showArr || showPha || showCir;
    const wholeBtn  = document.getElementById('view-canvas-whole');
    const canvasBtn = document.getElementById('view-pane-canvas');
    if (wholeBtn)  wholeBtn.dataset.checked  = allOn ? 'true' : 'false';
    if (canvasBtn) canvasBtn.dataset.checked = anyOn ? 'true' : 'false';
    _apply();
  }

  // Wire simple check-toggle items
  ['view-pane-input', 'view-pane-output'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      btn.dataset.checked = btn.dataset.checked === 'true' ? 'false' : 'true';
      _apply();
    });
  });

  // "Whole pane" — show or hide all three diagrams at once
  const wholeBtn = document.getElementById('view-canvas-whole');
  if (wholeBtn) {
    wholeBtn.addEventListener('click', () => {
      const newVal = wholeBtn.dataset.checked === 'true' ? 'false' : 'true';
      ['view-canvas-arrangement', 'view-canvas-phasor', 'view-canvas-circuit'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.dataset.checked = newVal;
      });
      wholeBtn.dataset.checked = newVal;
      const canvasBtn = document.getElementById('view-pane-canvas');
      if (canvasBtn) canvasBtn.dataset.checked = newVal;
      _applyDiagrams();
    });
  }

  // Individual diagram toggles
  ['view-canvas-arrangement', 'view-canvas-phasor', 'view-canvas-circuit'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      btn.dataset.checked = btn.dataset.checked === 'true' ? 'false' : 'true';
      _applyDiagrams();
    });
  });

  // Canvas submenu flyout
  const canvasTrigger = document.getElementById('view-pane-canvas');
  const canvasPanel   = document.getElementById('submenu-canvas');

  if (canvasTrigger && canvasPanel) {
    let _closeTimer = null;

    const _showPanel = () => {
      clearTimeout(_closeTimer);
      const dropdown = canvasTrigger.closest('.dropdown');
      const dr = (dropdown || canvasTrigger).getBoundingClientRect();
      const tr = canvasTrigger.getBoundingClientRect();
      canvasPanel.style.left = dr.right + 'px';
      canvasPanel.style.top  = tr.top + 'px';
      canvasPanel.classList.add('open');
    };

    const _scheduleHide = () => {
      _closeTimer = setTimeout(() => canvasPanel.classList.remove('open'), 120);
    };

    canvasTrigger.addEventListener('mouseenter', _showPanel);
    canvasTrigger.addEventListener('mouseleave', _scheduleHide);
    canvasPanel.addEventListener('mouseenter', () => clearTimeout(_closeTimer));
    canvasPanel.addEventListener('mouseleave', _scheduleHide);

    // Close when hovering other View menu items
    ['view-pane-input', 'view-pane-output'].forEach(id => {
      document.getElementById(id)?.addEventListener('mouseenter', () => canvasPanel.classList.remove('open'));
    });

    document.addEventListener('click', () => canvasPanel.classList.remove('open'));
  }
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
  'view-pane-canvas':   'Show or hide individual canvas diagram panes',
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

function _initToolbarScroll(win) {
  const inner  = win.querySelector('.toolbar-inner');
  const btnL   = win.querySelector('.toolbar-scroll-left');
  const btnR   = win.querySelector('.toolbar-scroll-right');
  if (!inner || !btnL || !btnR) return;

  const STEP = 80; // px per click

  function _update() {
    const canLeft  = inner.scrollLeft > 0;
    const canRight = inner.scrollLeft + inner.clientWidth < inner.scrollWidth - 1;
    btnL.classList.toggle('visible', canLeft  || canRight);
    btnR.classList.toggle('visible', canLeft  || canRight);
    btnL.disabled = !canLeft;
    btnR.disabled = !canRight;
  }

  btnL.addEventListener('click', () => { inner.scrollLeft -= STEP; _update(); });
  btnR.addEventListener('click', () => { inner.scrollLeft += STEP; _update(); });
  inner.addEventListener('scroll', _update, { passive: true });

  new ResizeObserver(_update).observe(inner);
  _update();
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
    if ((k === 'Dab' || k === 'Dbc' || k === 'Dca') && !isUnsym) return false; // covered by phaseSpacingM when symmetric
    return isNaN(val) && typeof val !== 'string';
  });
  if (bad.length) {
    const FIELD_LABELS = {
      lineLengthKm: 'Line Length',         recvLoadMW:    'Receiving Load',
      recvPF:       'Power Factor',         nomSyskV:      'System Voltage',
      frequency:    'Frequency',            Dab:           'Phase Spacing Dab',
      Dbc:          'Phase Spacing Dbc',    Dca:           'Phase Spacing Dca',
      phaseSpacingM:'Phase Spacing',        scSpacingM:    'Sub-conductor Spacing',
      scStrands:    'Number of Strands',    strandDiaM:    'Strand Diameter',
      resSCPerKm:   'AC Resistance',
    };
    const shortList = bad.map(([k]) => FIELD_LABELS[k] ?? k).join(', ');
    if (sbStatus) sbStatus.textContent = 'Fill: ' + shortList;
    showError('Fill in these fields:\n\n' + bad.map(([k]) => '\u2022 ' + (FIELD_LABELS[k] ?? k)).join('\n'));
    return;
  }

  // ── Run ────────────────────────────────────────────────────────────────────
  try {
    const result = computeFromParams(params);

    if (_gridApi) _gridApi.setData(result.rows);

    // ── Store results for Export Output / PDF ─────────────────────────────────
    _lastResults = { inputs: result.inputs, outputs: result.outputs, rows: result.rows };
    const btnExport = win.querySelector('#btn-export-output');
    if (btnExport) btnExport.disabled = false;
    document.querySelectorAll('.menu-export-item').forEach(el => { el.disabled = false; });

    updateDiagrams(result.inputs, result.outputs);

    const elapsed = (performance.now() - t0).toFixed(1);
    if (sbTime)   sbTime.textContent   = `Time: ${elapsed} ms`;
    if (sbStatus) sbStatus.textContent = 'Done';
    try { new Audio('media/ding.mp3').play(); } catch { /* ignore */ }
  } catch (e) {
    if (sbStatus) sbStatus.textContent = 'Compute error';
    showError(e?.message ?? 'Unknown computation error.');
  }
}


