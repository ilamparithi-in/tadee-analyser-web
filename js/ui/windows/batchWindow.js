/**
 * batchWindow.js — Batch Mode window module.
 *
 * Exposes:
 *   initBatchWindow(viewport)  — called once from js/batchWindow.js (bootstrap).
 *     Wires #btn-batch-mode (toolbar) and #menu-batch-mode (menu) to open the
 *     batch window.  Subsequent clicks raise the existing singleton window.
 *
 * Two input modes:
 *   Range Sweep — picks one field to vary, reads all others from the
 *                 current analyser form as a base snapshot.
 *   Load JSON   — loads a file with either:
 *                   • array-of-objects: [ { lineLengthKm, …, model }, … ]
 *                   • object-of-arrays: { lineLengthKm: […], …, model: […] }
 *                 Both normalised to array-of-objects before processing.
 *
 * Results displayed as a mail-merge viewer (◄ Prev / Entry N of M / Next ►).
 * Exports: JSON (array-of-objects with inputs + outputs) and multi-page PDF.
 */

import { openWindow }    from '../components/createWindow.js';
import { raiseWindow }   from '../components/windowManager.js';
import { getBaseValue }  from '../components/unitInput.js';
import { showError }     from '../components/errorDialog.js';
import {
  computeFromParams,
  normaliseModel,
  buildReportPage,
  PDF_STYLES,
  RANGEABLE_FIELDS,
  REQUIRED_NUMERIC_KEYS,
  SPACING_KEY_SYM,
  SPACING_KEYS_UNSYM,
} from '../../batch.js';

// ─── Module state ─────────────────────────────────────────────────────────────
let _win     = null;   // singleton window element
let _results = [];     // { inputs, outputs, rows }[]  — populated after Run
let _idx     = 0;      // current mail-merge index (0-based)

const MAX_ENTRIES = 500;

// ─── Public init ─────────────────────────────────────────────────────────────
export function initBatchWindow(viewport) {
  // Wire both trigger points (toolbar button + menu item)
  ['btn-batch-mode', 'menu-batch-mode'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => _openOrRaise(viewport));
  });
}

export function openBatchWindow(viewport) {
  _openOrRaise(viewport);
}

/**
 * Open (or raise) the batch window, inject a pre-parsed entries array,
 * switch the UI to JSON mode, and run the batch immediately.
 * entries must be an array of lineParams base-unit objects.
 */
export function loadAndRunBatchEntries(viewport, entries) {
  _openOrRaise(viewport);
  // _win is now guaranteed to exist
  _parsedEntries = entries;

  // Switch UI to JSON mode
  const jsonRadio  = _win.querySelector('#batch-mode-json');
  const rangePanel = _win.querySelector('#batch-range-panel');
  const jsonPanel  = _win.querySelector('#batch-json-panel');
  if (jsonRadio)  jsonRadio.checked         = true;
  if (rangePanel) rangePanel.style.display  = 'none';
  if (jsonPanel)  jsonPanel.style.display   = '';

  const fileName   = _win.querySelector('#batch-file-name');
  const jsonStatus = _win.querySelector('#batch-json-status');
  if (fileName)   fileName.textContent   = '(imported from output file)';
  if (jsonStatus) {
    jsonStatus.textContent = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} loaded.`;
    jsonStatus.style.color = '#000';
  }

  _runBatch(_win);
}

// ─── Window lifecycle ─────────────────────────────────────────────────────────
function _openOrRaise(viewport) {
  if (_win) {
    raiseWindow(_win);
    return;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w  = Math.round(Math.min(vw * 0.88, 820));
  const h  = Math.round(Math.min(vh * 0.88, 620));

  _win = openWindow({
    title:       'Batch Mode',
    width:       w,
    height:      h,
    resizable:   true,
    maximizable: true,
    minimizable: true,
    closable:    true,
    content:     _buildContent(),
  }, viewport);

  _win.id = 'win-batch';

  // Clear singleton ref when the window is closed so it can be re-opened
  _win._closeGuard = (proceed) => {
    _win     = null;
    _results = [];
    _idx     = 0;
    _parsedEntries = null;
    proceed();
  };

  // Position: offset from analyser window
  const analyser = document.getElementById('win-analyser');
  if (analyser) {
    const ax = analyser.offsetLeft;
    const ay = analyser.offsetTop;
    _win.style.left = Math.round(Math.min(ax + 32, vw - w - 8)) + 'px';
    _win.style.top  = Math.round(Math.min(ay + 32, vh - h - 8)) + 'px';
  }

  _wireContent(_win);
}

// ─── Window HTML ──────────────────────────────────────────────────────────────
function _buildContent() {
  // Build the field dropdown options from RANGEABLE_FIELDS
  const fieldOptions = RANGEABLE_FIELDS
    .map(f => `<option value="${f.id}" data-unit="${f.unit}">${f.label}</option>`)
    .join('\n          ');

  return `
<div id="batch-body" style="display:flex;flex-direction:column;height:100%;overflow:hidden;font-size:11px;box-sizing:border-box;padding:4px 6px;">

  <!-- ── Input Source ─────────────────────────────────────────────────── -->
  <fieldset style="margin:0 0 4px;flex-shrink:0;">
    <legend>Input Source</legend>

    <!-- Mode radio row -->
    <div class="field-row" style="margin-bottom:6px;">
      <input type="radio" name="batch-mode-radio" id="batch-mode-range" value="range" checked>
      <label for="batch-mode-range">Range Sweep</label>
      <span style="display:inline-block;width:24px;flex-shrink:0;"></span>
      <input type="radio" name="batch-mode-radio" id="batch-mode-json"  value="json">
      <label for="batch-mode-json">Load JSON</label>
    </div>

    <!-- Range panel -->
    <div id="batch-range-panel">
      <div class="field-row" style="margin-bottom:4px;align-items:center;">
        <label for="batch-field" style="width:86px;flex-shrink:0;">Sweep field:</label>
        <select id="batch-field" style="flex:1;">
          ${fieldOptions}
        </select>
        <span id="batch-field-unit" style="margin-left:5px;width:38px;display:inline-block;color:#555;"></span>
      </div>
      <div class="field-row" style="margin-bottom:4px;align-items:center;flex-wrap:wrap;gap:4px;">
        <label style="margin-right:4px;flex-shrink:0;">From:</label>
        <input type="number" id="batch-from"  style="width:76px;" step="any" min="0">
        <label style="margin-left:6px;flex-shrink:0;">To:</label>
        <input type="number" id="batch-to"    style="width:76px;" step="any" min="0">
        <label style="margin-left:6px;flex-shrink:0;">Step:</label>
        <input type="number" id="batch-step"  style="width:76px;" step="any" min="0">
        <span  id="batch-range-preview" style="margin-left:8px;color:#555;font-style:italic;"></span>
      </div>
    </div>

    <!-- JSON panel (hidden by default) -->
    <div id="batch-json-panel" style="display:none;">
      <div class="field-row" style="margin-bottom:4px;align-items:center;">
        <button id="batch-browse-btn">Browse…</button>
        <input type="file" id="batch-file-input" accept=".json,application/json" style="display:none;">
        <span  id="batch-file-name"   style="margin-left:8px;color:#555;font-style:italic;">No file selected</span>
      </div>
      <div class="field-row">
        <span id="batch-json-status" style="color:#555;font-style:italic;"></span>
      </div>
    </div>
  </fieldset>

  <!-- ── Run row ───────────────────────────────────────────────────────── -->
  <div class="field-row" style="margin-bottom:4px;flex-shrink:0;align-items:center;">
    <button id="batch-run-btn">Run Batch</button>
    <span   id="batch-run-status" style="margin-left:10px;color:#444;"></span>
  </div>

  <hr style="margin:2px 0 4px;flex-shrink:0;border:none;border-top:1px solid #808080;">

  <!-- ── Results section (hidden until batch runs) ─────────────────────── -->
  <div id="batch-results-section" style="display:none;flex:1;flex-direction:column;overflow:hidden;min-height:0;">

    <!-- Navigation bar -->
    <div class="field-row" style="margin-bottom:4px;flex-shrink:0;align-items:center;">
      <button id="batch-prev-btn">◄ Prev</button>
      <span   id="batch-nav-label" style="margin:0 10px;font-weight:bold;">Entry 1 of 1</span>
      <button id="batch-next-btn">Next ►</button>
    </div>

    <!-- Side-by-side: inputs left, results right -->
    <div style="display:flex;flex:1;overflow:hidden;min-height:0;gap:4px;">

      <!-- Input parameters for the current entry -->
      <div style="flex:0 0 210px;overflow-y:scroll;border:1px solid #808080;background:#fff;">
        <table id="batch-input-table" style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:#d4d0c8;position:sticky;top:0;z-index:1;">
              <th style="padding:2px 4px;text-align:left;border-bottom:1px solid #808080;white-space:nowrap;">Parameter</th>
              <th style="padding:2px 4px;text-align:left;border-bottom:1px solid #808080;">Value</th>
            </tr>
          </thead>
          <tbody id="batch-input-tbody">
          </tbody>
        </table>
      </div>

      <!-- Computed results for the current entry -->
      <div style="flex:1;overflow-y:scroll;border:1px solid #808080;background:#fff;">
        <table id="batch-output-table" style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:#d4d0c8;position:sticky;top:0;z-index:1;">
              <th style="padding:2px 4px;text-align:left;border-bottom:1px solid #808080;">Parameter</th>
              <th style="padding:2px 4px;text-align:left;border-bottom:1px solid #808080;">Value</th>
              <th style="padding:2px 4px;text-align:left;border-bottom:1px solid #808080;">Unit</th>
            </tr>
          </thead>
          <tbody id="batch-output-tbody">
          </tbody>
        </table>
      </div>
    </div>

    <!-- Export buttons -->
    <div class="field-row" style="margin-top:4px;flex-shrink:0;">
      <button id="batch-export-json-btn">Export JSON</button>
      <button id="batch-export-pdf-btn"  style="margin-left:4px;">Export PDF</button>
    </div>
  </div>

</div>`;
}

// ─── Wire all handlers ────────────────────────────────────────────────────────
function _wireContent(win) {
  const q = id => win.querySelector('#' + id);

  // ── Mode radio ─────────────────────────────────────────────────────────────
  const rangePanel = q('batch-range-panel');
  const jsonPanel  = q('batch-json-panel');

  win.querySelectorAll('input[name="batch-mode-radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isRange = q('batch-mode-range').checked;
      rangePanel.style.display = isRange ? '' : 'none';
      jsonPanel.style.display  = isRange ? 'none' : '';
    });
  });

  // ── Field dropdown — update unit label + live preview ──────────────────────
  const fieldSel   = q('batch-field');
  const unitLabel  = q('batch-field-unit');
  const preview    = q('batch-range-preview');

  function _updateUnit() {
    const opt = fieldSel.selectedOptions[0];
    unitLabel.textContent = opt?.dataset.unit ?? '';
    _updatePreview();
  }
  fieldSel.addEventListener('change', _updateUnit);
  _updateUnit();

  function _updatePreview() {
    const from  = parseFloat(q('batch-from')?.value  ?? '');
    const to    = parseFloat(q('batch-to')?.value    ?? '');
    const step  = parseFloat(q('batch-step')?.value  ?? '');
    if (isNaN(from) || isNaN(to) || isNaN(step) || step <= 0 || from > to) {
      preview.textContent = '';
      return;
    }
    const count = Math.floor((to - from) / step + 1 + 1e-9);
    preview.textContent = `${count} entr${count === 1 ? 'y' : 'ies'}`;
    preview.style.color = count > MAX_ENTRIES ? '#c00' : '#555';
  }

  ['batch-from', 'batch-to', 'batch-step'].forEach(id => {
    q(id)?.addEventListener('input', _updatePreview);
  });

  // ── JSON browse ───────────────────────────────────────────────────────────
  const browseBtn   = q('batch-browse-btn');
  const fileInput   = q('batch-file-input');
  const fileName    = q('batch-file-name');
  const jsonStatus  = q('batch-json-status');

  browseBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    fileName.textContent = file.name;
    jsonStatus.textContent = 'Reading…';
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const raw      = JSON.parse(e.target.result);
        const entries  = _normaliseBatchJson(raw);
        const errMsg   = _validateEntries(entries);
        if (errMsg) {
          jsonStatus.textContent = 'Error: ' + errMsg;
          jsonStatus.style.color = '#c00';
          _parsedEntries = null;
          showError(errMsg);
        } else {
          _parsedEntries = entries;
          jsonStatus.textContent = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} loaded.`;
          jsonStatus.style.color = '#000';
        }
      } catch (err) {
        const msg = 'Parse error: ' + (err.message ?? err);
        jsonStatus.textContent = msg;
        jsonStatus.style.color = '#c00';
        _parsedEntries = null;
        showError(msg);
      }
    };
    reader.readAsText(file);
  });

  // ── Run Batch ─────────────────────────────────────────────────────────────
  q('batch-run-btn').addEventListener('click', () => _runBatch(win));

  // ── Navigation ────────────────────────────────────────────────────────────
  q('batch-prev-btn').addEventListener('click', () => {
    if (_idx > 0) { _idx--; _renderEntry(win); }
  });
  q('batch-next-btn').addEventListener('click', () => {
    if (_idx < _results.length - 1) { _idx++; _renderEntry(win); }
  });

  // ── Export ────────────────────────────────────────────────────────────────
  q('batch-export-json-btn').addEventListener('click', () => _exportJson());
  q('batch-export-pdf-btn').addEventListener('click',  () => _exportPdf());
}

// ─── JSON normalisation (both formats → array-of-objects) ────────────────────
function _normaliseBatchJson(raw) {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw !== null && typeof raw === 'object') {
    const keys = Object.keys(raw);
    if (keys.length === 0) throw new Error('Empty object.');
    if (!keys.every(k => Array.isArray(raw[k])))
      throw new Error('Expected array-of-objects or object-of-arrays (columnar format).');
    const len = raw[keys[0]].length;
    if (!keys.every(k => raw[k].length === len))
      throw new Error('All arrays must be the same length (columnar format).');
    return Array.from({ length: len }, (_, i) => {
      const entry = {};
      keys.forEach(k => { entry[k] = raw[k][i]; });
      return entry;
    });
  }
  throw new Error('Unrecognised batch JSON format. Expected array or object.');
}

// ─── Per-entry validation ────────────────────────────────────────────────────
/** Returns an error string, or '' if all entries are valid. */
function _validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0)
    return 'File contains no entries.';
  if (entries.length > MAX_ENTRIES)
    return `File contains ${entries.length} entries — maximum is ${MAX_ENTRIES}.`;

  for (let i = 0; i < entries.length; i++) {
    const e   = entries[i];
    const tag = `Entry ${i + 1}`;

    if (e === null || typeof e !== 'object')
      return `${tag}: not an object.`;

    // Required numeric keys
    for (const k of REQUIRED_NUMERIC_KEYS) {
      if (e[k] === undefined || e[k] === null)
        return `${tag}: missing required key "${k}".`;
      if (isNaN(Number(e[k])))
        return `${tag}: key "${k}" has non-numeric value "${e[k]}".`;
    }

    // model key
    if (e.model === undefined || e.model === null)
      return `${tag}: missing required key "model".`;

    // Spacing keys
    const sym = Number(e.symmetric ?? 1);
    if (sym === 0) {
      for (const k of SPACING_KEYS_UNSYM) {
        if (e[k] === undefined || e[k] === null)
          return `${tag}: unsymmetric mode requires "${k}".`;
        if (isNaN(Number(e[k])))
          return `${tag}: key "${k}" has non-numeric value "${e[k]}".`;
      }
    } else {
      if (e[SPACING_KEY_SYM] === undefined || e[SPACING_KEY_SYM] === null)
        return `${tag}: symmetric mode requires "${SPACING_KEY_SYM}".`;
      if (isNaN(Number(e[SPACING_KEY_SYM])))
        return `${tag}: key "${SPACING_KEY_SYM}" has non-numeric value.`;
    }
  }
  return '';
}

// ─── Snapshot the current analyser form values ────────────────────────────────
/** Returns a lineParams base-unit object from the current analyser window state. */
function _snapAnalyserParams() {
  const win = document.getElementById('win-analyser');
  if (!win) return null;
  const v  = id => win.querySelector('#' + id);
  const n  = id => parseFloat(v(id)?.value ?? '');
  const bv = id => getBaseValue(id, win);
  const isUnsym = v('system-type')?.value?.toLowerCase().includes('unsym');
  return {
    lineLengthKm:  bv('line-length'),
    recvLoadMW:    bv('load-mw'),
    recvPF:        n('power-factor'),
    nomSyskV:      bv('voltage'),
    frequency:     n('frequency'),
    symmetric:     isUnsym ? 0 : 1,
    Dab:           isUnsym ? bv('dab')           : bv('phase-spacing'),
    Dbc:           isUnsym ? bv('dbc')           : bv('phase-spacing'),
    Dca:           isUnsym ? bv('dca')           : bv('phase-spacing'),
    phaseSpacingM: bv('phase-spacing'),
    scCount:       parseInt(v('bundle-count')?.value ?? '2', 10),
    scSpacingM:    bv('sub-spacing'),
    scStrands:     n('strands'),
    strandDiaM:    bv('dia-strands'),
    resSCPerKm:    bv('resistance'),
    model:         normaliseModel(v('line-model')?.value ?? 'Short'),
  };
}

// ─── Batch state (JSON mode) ──────────────────────────────────────────────────
let _parsedEntries = null;   // validated array-of-objects from JSON load

// ─── Run Batch ────────────────────────────────────────────────────────────────
function _runBatch(win) {
  const q         = id => win.querySelector('#' + id);
  const statusEl  = q('batch-run-status');
  const isRange   = q('batch-mode-range').checked;

  statusEl.textContent = '';
  statusEl.style.color = '#444';

  // ── Build entries array ────────────────────────────────────────────────────
  let entries;

  if (isRange) {
    const base = _snapAnalyserParams();
    if (!base) {
      const msg = 'Analyser window not found.';
      statusEl.textContent = 'Error: ' + msg; statusEl.style.color = '#c00';
      showError(msg);
      return;
    }
    const isUnsym = base.symmetric === 0;
    const missingFields = Object.entries(base).filter(([k, val]) => {
      if (k === 'phaseSpacingM' && isUnsym) return false;
      if ((k === 'Dab' || k === 'Dbc' || k === 'Dca') && !isUnsym) return false;
      return typeof val === 'number' && isNaN(val);
    });
    if (missingFields.length) {
      const FIELD_LABELS = {
        lineLengthKm: 'Line Length',         recvLoadMW:    'Receiving Load',
        recvPF:       'Power Factor',         nomSyskV:      'System Voltage',
        frequency:    'Frequency',            Dab:           'Phase Spacing Dab',
        Dbc:          'Phase Spacing Dbc',    Dca:           'Phase Spacing Dca',
        phaseSpacingM:'Phase Spacing',        scSpacingM:    'Sub-conductor Spacing',
        scStrands:    'Number of Strands',    strandDiaM:    'Strand Diameter',
        resSCPerKm:   'AC Resistance',
      };
      const shortList = missingFields.map(([k]) => FIELD_LABELS[k] ?? k).join(', ');
      const bulletList = missingFields.map(([k]) => '\u2022 ' + (FIELD_LABELS[k] ?? k)).join('\n');
      statusEl.textContent = 'Error: fill these fields: ' + shortList; statusEl.style.color = '#c00';
      showError('Fill in these analyser fields:\n\n' + bulletList);
      return;
    }

    const fieldId = q('batch-field')?.value;
    const from    = parseFloat(q('batch-from')?.value  ?? '');
    const to      = parseFloat(q('batch-to')?.value    ?? '');
    const step    = parseFloat(q('batch-step')?.value  ?? '');

    const _err = (short, full) => { statusEl.textContent = 'Error: ' + short; statusEl.style.color = '#c00'; showError(full ?? short); };
    if (!fieldId)              { _err('select a sweep field.',      'Please select a field to sweep.'); return; }
    if (isNaN(from) || isNaN(to)) { _err('enter From and To values.', 'Please enter numeric From and To values.'); return; }
    if (isNaN(step) || step <= 0) { _err('step must be > 0.',         'Step must be a positive number.'); return; }
    if (from > to)             { _err('From must be ≤ To.',        'From value must be less than or equal to To.'); return; }

    const count = Math.floor((to - from) / step + 1 + 1e-9);
    if (count > MAX_ENTRIES) {
      showError(`Range produces ${count} entries — maximum is ${MAX_ENTRIES}.\nReduce the range or increase the step.`);
      return;
    }

    entries = [];
    for (let i = 0; i < count; i++) {
      const v = parseFloat((from + i * step).toPrecision(12));
      entries.push({ ...base, [fieldId]: v });
    }
  } else {
    // JSON mode
    if (!_parsedEntries) {
      const msg = 'Please load a valid JSON file before running the batch.';
      statusEl.textContent = 'Error: load a valid JSON file first.'; statusEl.style.color = '#c00';
      showError(msg);
      return;
    }
    entries = _parsedEntries;
  }

  // ── Compute ────────────────────────────────────────────────────────────────
  _results = [];
  let errorCount = 0;
  const t0 = performance.now();

  for (let i = 0; i < entries.length; i++) {
    // Coerce all numeric fields (JSON may have string values)
    const raw = entries[i];
    const p   = {};
    for (const [k, v] of Object.entries(raw)) {
      const n = Number(v);
      p[k] = isNaN(n) ? v : n;
    }
    // model: normalise if it came in as a string label from JSON
    if (typeof p.model !== 'number' || !Number.isInteger(p.model)) {
      p.model = normaliseModel(String(p.model));
    }

    try {
      _results.push(computeFromParams(p));
    } catch (err) {
      // Store an error sentinel so the mail-merge can show it
      _results.push({ inputs: p, outputs: null, rows: null, error: err.message ?? String(err) });
      errorCount++;
    }
  }

  // ── Show results section ───────────────────────────────────────────────────
  const section = win.querySelector('#batch-results-section');
  if (section) section.style.display = 'flex';

  _idx = 0;
  _renderEntry(win);

  const total   = _results.length;
  const elapsed = (performance.now() - t0).toFixed(1);
  if (errorCount === 0) {
    statusEl.textContent = `Done — ${total} entr${total === 1 ? 'y' : 'ies'} computed. (${elapsed} ms)`;
    statusEl.style.color = '#000';
  } else {
    statusEl.textContent = `Done — ${total - errorCount} ok, ${errorCount} error${errorCount > 1 ? 's' : ''}. (${elapsed} ms)`;
    statusEl.style.color = '#c00';
  }
}

// ─── Mail-merge display ───────────────────────────────────────────────────────
const INPUT_DISPLAY_ROWS = [
  ['Line length',                  i => `${i.lineLengthKm} km`],
  ['Receiving end load',           i => `${i.recvLoadMW} MW`],
  ['Power factor',                 i => String(i.recvPF)],
  ['System voltage',               i => `${i.nomSyskV} kV`],
  ['Frequency',                    i => `${i.frequency} Hz`],
  ['Spacing type',                 i => (i.symmetric === 0 || i.symmetric === '0') ? 'Unsymmetrical' : 'Symmetrical'],
  ['Phase spacing',                i => (i.symmetric === 0 || i.symmetric === '0')
                                          ? `Dab=${i.Dab} Dbc=${i.Dbc} Dca=${i.Dca} m`
                                          : `${i.phaseSpacingM} m`],
  ['Bundle count',                 i => String(i.scCount)],
  ['Sub-cond. spacing',            i => `${i.scSpacingM} m`],
  ['Strands',                      i => String(i.scStrands)],
  ['Strand diameter',              i => `${i.strandDiaM} m`],
  ['Resistance / sub-cond.',       i => `${i.resSCPerKm} Ω/km`],
  ['Line model',                   i => (['Short', 'Nominal π', 'Distributed'])[normaliseModel(String(i.model))]],
];

function _renderEntry(win) {
  const q     = id => win.querySelector('#' + id);
  const total = _results.length;
  const entry = _results[_idx];

  q('batch-nav-label').textContent = `Entry ${_idx + 1} of ${total}`;
  q('batch-prev-btn').disabled = _idx === 0;
  q('batch-next-btn').disabled = _idx === total - 1;

  // ── Input table ────────────────────────────────────────────────────────────
  const iTbody = q('batch-input-tbody');
  if (iTbody) {
    iTbody.innerHTML = '';
    const inp = entry.inputs;
    INPUT_DISPLAY_ROWS.forEach(([label, fmt], ri) => {
      const tr = document.createElement('tr');
      tr.style.background = ri % 2 === 1 ? '#f5f5f5' : '';
      const tdL = document.createElement('td');
      tdL.style.cssText = 'padding:2px 4px;border-bottom:1px solid #e0e0e0;white-space:nowrap;color:#222;';
      tdL.textContent = label;
      const tdV = document.createElement('td');
      tdV.style.cssText = 'padding:2px 4px;border-bottom:1px solid #e0e0e0;font-family:monospace;font-size:10px;';
      try { tdV.textContent = fmt(inp); } catch { tdV.textContent = '—'; }
      tr.appendChild(tdL);
      tr.appendChild(tdV);
      iTbody.appendChild(tr);
    });
  }

  // ── Output table ───────────────────────────────────────────────────────────
  const oTbody = q('batch-output-tbody');
  if (oTbody) {
    oTbody.innerHTML = '';
    if (entry.error) {
      const tr  = document.createElement('tr');
      const td  = document.createElement('td');
      td.colSpan = 3;
      td.style.cssText = 'padding:6px 8px;color:#c00;font-style:italic;';
      td.textContent = 'Computation error: ' + entry.error;
      tr.appendChild(td);
      oTbody.appendChild(tr);
    } else {
      entry.rows.forEach(([name, value, unit], ri) => {
        const tr = document.createElement('tr');
        tr.style.background = ri % 2 === 1 ? '#f5f5f5' : '';
        [
          { text: name,  css: 'padding:2px 4px;border-bottom:1px solid #e0e0e0;white-space:nowrap;' },
          { text: value, css: 'padding:2px 4px;border-bottom:1px solid #e0e0e0;font-family:monospace;font-size:10px;' },
          { text: unit,  css: 'padding:2px 4px;border-bottom:1px solid #e0e0e0;color:#555;' },
        ].forEach(({ text, css }) => {
          const td = document.createElement('td');
          td.style.cssText = css;
          td.textContent = text;
          tr.appendChild(td);
        });
        oTbody.appendChild(tr);
      });
    }
  }
}

// ─── Export JSON ──────────────────────────────────────────────────────────────
function _exportJson() {
  if (_results.length === 0) return;
  const payload = _results.map(r => ({
    inputs:  r.inputs,
    outputs: r.outputs,
    error:   r.error ?? undefined,
  }));
  const now   = new Date();
  const pad   = n => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}` +
                `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  _triggerDownload(JSON.stringify(payload, null, 2), `tadee-batch-output_${stamp}.json`, 'application/json');
}

// ─── Export PDF (Phase 3 provides the actual implementation) ──────────────────
function _exportPdf() {
  if (_results.length === 0) return;
  const total = _results.length;
  const pages = _results
    .map((r, i) => {
      if (r.error) return `<div class="report-page"><p style="color:#c00;padding:40px;">Entry ${i+1} of ${total}: computation error — ${r.error}</p></div>`;
      return buildReportPage(r.inputs, r.outputs, i + 1, total);
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/>
<title>Batch Analysis Report</title>
<style>${PDF_STYLES}</style>
</head>
<body>${pages}<script>window.addEventListener('load',()=>window.print())<\/script></body>
</html>`;

  const pw = window.open('', '_blank');
  if (!pw) return;
  pw.document.open();
  pw.document.write(html);
  pw.document.close();
  pw.focus();
}

// ─── Utility ─────────────────────────────────────────────────────────────────
function _triggerDownload(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
