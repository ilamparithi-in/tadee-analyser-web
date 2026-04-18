/**
 * batch.js — Pure computation core shared by the main Analyser and Batch Mode.
 *
 * Exports:
 *   computeFromParams(params)  → { inputs, outputs, rows }
 *   RANGEABLE_FIELDS           — descriptor list for the range-sweep UI
 *   buildReportPage(inputs, outputs, pageNum, totalPages)  → HTML string
 *
 * All values in `params` must already be in the canonical base units used by
 * tadee.js (km, MW, kV, Hz, m, Ω/km, …). No unit conversion is performed here.
 */

import { lineCalculations } from './tadee.js';

// ─── Model normaliser ────────────────────────────────────────────────────────
/** Convert a raw line-model select value ('Short', 'Nominal π', …) to 0/1/2. */
export function normaliseModel(raw) {
  const s = String(raw).toLowerCase().trim();
  if (s === '1' || s.includes('pi') || s.includes('π')) return 1;
  if (s === '2' || s.includes('dist'))                   return 2;
  return 0;
}

// ─── Field descriptors ────────────────────────────────────────────────────────
// Used by the range-sweep dropdown in Batch Mode.
// JSON import accepts ALL lineParams keys regardless of this list.
export const RANGEABLE_FIELDS = [
  { id: 'lineLengthKm',  label: 'Line length',                        unit: 'km'   },
  { id: 'recvLoadMW',    label: 'Receiving end load',                  unit: 'MW'   },
  { id: 'recvPF',        label: 'Power factor',                        unit: ''     },
  { id: 'nomSyskV',      label: 'System voltage',                      unit: 'kV'   },
  { id: 'frequency',     label: 'Frequency',                           unit: 'Hz'   },
  { id: 'phaseSpacingM', label: 'Phase spacing (symmetrical)',         unit: 'm'    },
  { id: 'scSpacingM',    label: 'Sub-conductor spacing',               unit: 'm'    },
  { id: 'scStrands',     label: 'Strands per sub-conductor',           unit: ''     },
  { id: 'strandDiaM',    label: 'Strand diameter',                     unit: 'm'    },
  { id: 'resSCPerKm',    label: 'AC resistance per sub-conductor',       unit: 'Ω/km' },
];

// Required numeric keys in every entry (used for validation).
export const REQUIRED_NUMERIC_KEYS = [
  'lineLengthKm', 'recvLoadMW', 'recvPF', 'nomSyskV', 'frequency',
  'scCount', 'scSpacingM', 'scStrands', 'strandDiaM', 'resSCPerKm',
];

// Keys that are required when symmetric=1; Dab/Dbc/Dca required when symmetric=0.
export const SPACING_KEY_SYM   = 'phaseSpacingM';
export const SPACING_KEYS_UNSYM = ['Dab', 'Dbc', 'Dca'];

// ─── Formatting helpers (also used by buildReportPage) ────────────────────────
export function fmtComplex(c) {
  if (typeof c === 'number') return c.toFixed(4);
  const r     = Math.sqrt(c.re * c.re + c.im * c.im);
  const theta = Math.atan2(c.im, c.re) * (180 / Math.PI);
  return `${r.toFixed(4)} ∠ ${theta.toFixed(4)}°`;
}

export function fmtComplexLong(c) {
  if (typeof c === 'number') return c.toFixed(6);
  const r     = Math.sqrt(c.re * c.re + c.im * c.im);
  const theta = Math.atan2(c.im, c.re) * (180 / Math.PI);
  return `${r.toFixed(6)} ∠ ${theta.toFixed(6)}°`;
}

// ─── Core computation ─────────────────────────────────────────────────────────
/**
 * Run a single-entry analysis.
 *
 * @param {object} params  lineParams object — all values in base units.
 * @returns {{ inputs: object, outputs: object, rows: [string, string, string][] }}
 * @throws {Error} on invalid/incomplete params or calc failure.
 */
export function computeFromParams(params) {
  const calc = new lineCalculations(params);

  const lc   = calc.LandCperPhasePerKm();
  const xl   = calc.XLandXC();
  const abcd = calc.ABCDparams();
  const vs   = calc.Vs_kV_line_phase();
  const is   = calc.Is_A();
  const ich  = calc.Icharging_A();
  const vr   = calc.percent_VR();
  const pl   = calc.power_loss_MW_and_efficiency();

  const Lphkm  = lc.inductance;
  const Cphkm  = lc.capacitance;
  const Xl     = xl.Reactance_L;
  const Xc     = xl.Reactance_C;
  const lossMW = pl.power_loss_MW;
  const eta    = pl.efficiency;

  const rows = [
    ['Inductance per phase per km',  Lphkm.toExponential(4),              'H/km'],
    ['Capacitance per phase per km', Cphkm.toExponential(4),              'F/km'],
    ['Inductive reactance XL',       Xl.toFixed(4),                       'Ω'],
    ['Capacitive reactance XC',      Xc.toFixed(4),                       'Ω'],
    ['A',                            fmtComplex(abcd.A),                   ''],
    ['B',                            fmtComplex(abcd.B),                   'Ω'],
    ['C',                            fmtComplex(abcd.C),                   'S'],
    ['D',                            fmtComplex(abcd.D),                   ''],
    ['Sending end voltage (phase)',   fmtComplex(vs.phase)      + ' kV',   ''],
    ['Sending end voltage (line)',    fmtComplex(vs.linetoline) + ' kV',   ''],
    ['Sending end current Is',        fmtComplex(is),                      'A'],
    ['Charging current Ic',           fmtComplex(ich),                     'A'],
    ['Voltage regulation',            vr.toFixed(4),                       '%'],
    ['Power loss (3φ)',                lossMW.toFixed(4),                   'MW'],
    ['Transmission efficiency',       (eta * 100).toFixed(2),              '%'],
    ['Surge impedance Zc',            calc.Zc().toFixed(4),                'Ω'],
    ['Surge impedance loading SIL',   calc.SIL_MW().toFixed(4),            'MW'],
  ];

  const outputs = {
    Lphkm, Cphkm, Xl, Xc,
    A: { re: abcd.A.re, im: abcd.A.im },
    B: { re: abcd.B.re, im: abcd.B.im },
    C: { re: abcd.C.re, im: abcd.C.im },
    D: { re: abcd.D.re, im: abcd.D.im },
    Vs_phase_kV: { re: vs.phase.re,      im: vs.phase.im      },
    Vs_line_kV:  { re: vs.linetoline.re, im: vs.linetoline.im },
    Is_A:  { re: is.re,  im: is.im  },
    Ic_A:  { re: ich.re, im: ich.im },
    VR: vr, lossMW, eta,
    Zc: calc.Zc(), SIL: calc.SIL_MW(),
  };

  return { inputs: { ...params }, outputs, rows };
}

// ─── Report page builder ─────────────────────────────────────────────────────
/**
 * Build a single A4 HTML report body fragment (no <html>/<head>).
 * Wrap N calls in <html><head>…styles…</head><body>…pages…</body></html>
 * with page-break-after: always on every page div except the last.
 *
 * @param {object} inp       inputs object from a computeFromParams result
 * @param {object} out       outputs object from a computeFromParams result
 * @param {number} pageNum   1-based page index
 * @param {number} total     total page count
 * @returns {string}         HTML fragment string
 */
export function buildReportPage(inp, out, pageNum, total) {
  const i = inp;
  const o = out;

  const modelLabel = ['Short line', 'Nominal π', 'Distributed parameter'][i.model] ?? i.model;
  const symLabel   = (i.symmetric === 1 || i.symmetric === '1' || i.symmetric === 'symmetrical')
                     ? 'Symmetrical' : 'Unsymmetrical';
  const bundleLabel = String(i.scCount);

  const spacingStr = (i.symmetric === 1 || i.symmetric === '1' || i.symmetric === 'symmetrical')
    ? `${i.phaseSpacingM} m`
    : `Dab = ${i.Dab} m, Dbc = ${i.Dbc} m, Dca = ${i.Dca} m`;

  return `
<div class="report-page">
  <h1>Transmission Line Analysis Report</h1>
  <p class="subtitle">Three-Phase Single-Circuit Bundled Conductor Transmission System</p>
  ${total > 1 ? `<p class="batch-label">Entry ${pageNum} of ${total}</p>` : ''}

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
    <tr><td>7</td><td>Phase conductor spacing</td><td class="val">${spacingStr}</td></tr>
    <tr><td>8</td><td>Sub-conductors per bundle</td><td class="val">${bundleLabel}</td></tr>
    <tr><td>9</td><td>Sub-conductor spacing</td><td class="val">${i.scSpacingM} m</td></tr>
    <tr><td>10</td><td>Number of strands per sub-conductor</td><td class="val">${i.scStrands}</td></tr>
    <tr><td>11</td><td>Strand diameter</td><td class="val">${i.strandDiaM} m</td></tr>
    <tr><td>12</td><td>AC resistance per sub-conductor</td><td class="val">${i.resSCPerKm} Ω/km</td></tr>
    <tr><td>13</td><td>Line model</td><td class="val">${modelLabel}</td></tr>
  </table>

  <h2>Analysis Results</h2>
  <table class="data">
    <tr><th>#</th><th>Parameter</th><th>Value</th><th>Unit</th></tr>
    <tr><td>1</td><td>Inductance per phase per km</td><td class="val">${o.Lphkm.toExponential(4)}</td><td>H/km</td></tr>
    <tr><td>2</td><td>Capacitance per phase per km</td><td class="val">${o.Cphkm.toExponential(4)}</td><td>F/km</td></tr>
    <tr><td>3</td><td>Inductive reactance X<sub>L</sub></td><td class="val">${o.Xl.toFixed(4)}</td><td>Ω</td></tr>
    <tr><td>4</td><td>Capacitive reactance X<sub>C</sub></td><td class="val">${o.Xc.toFixed(4)}</td><td>Ω</td></tr>
    <tr><td>5</td><td>ABCD — A</td><td class="val">${fmtComplexLong(o.A)}</td><td></td></tr>
    <tr><td>6</td><td>ABCD — B</td><td class="val">${fmtComplexLong(o.B)}</td><td>Ω</td></tr>
    <tr><td>7</td><td>ABCD — C</td><td class="val">${fmtComplexLong(o.C)}</td><td>S</td></tr>
    <tr><td>8</td><td>ABCD — D</td><td class="val">${fmtComplexLong(o.D)}</td><td></td></tr>
    <tr><td>9</td><td>Sending end voltage (phase)</td><td class="val">${fmtComplexLong(o.Vs_phase_kV)}</td><td>kV</td></tr>
    <tr><td>10</td><td>Sending end voltage (line-to-line)</td><td class="val">${fmtComplexLong(o.Vs_line_kV)}</td><td>kV</td></tr>
    <tr><td>11</td><td>Sending end current I<sub>s</sub></td><td class="val">${fmtComplexLong(o.Is_A)}</td><td>A</td></tr>
    <tr><td>12</td><td>Charging current I<sub>c</sub></td><td class="val">${fmtComplexLong(o.Ic_A)}</td><td>A</td></tr>
    <tr><td>13</td><td>Voltage regulation</td><td class="val">${o.VR.toFixed(4)}</td><td>%</td></tr>
    <tr><td>14</td><td>Power loss (3φ)</td><td class="val">${o.lossMW.toFixed(4)}</td><td>MW</td></tr>
    <tr><td>15</td><td>Transmission efficiency</td><td class="val">${(o.eta * 100).toFixed(2)}</td><td>%</td></tr>
    <tr><td>16</td><td>Surge impedance Z<sub>c</sub></td><td class="val">${o.Zc.toFixed(4)}</td><td>Ω</td></tr>
    <tr><td>17</td><td>Surge impedance loading (SIL)</td><td class="val">${o.SIL.toFixed(4)}</td><td>MW</td></tr>
  </table>

  <p class="footer">TADEE Group 7 — Transmission Line Analyser</p>
</div>`;
}

// ─── Diagrams page builder ────────────────────────────────────────────────────
/**
 * Build the diagrams page (page 2 of the single-input report).
 *
 * @param {object} inp   inputs object from computeFromParams result
 * @param {{ arrangement: string, circuit: string, phasor: string }} svgs
 *                       Pre-rendered SVG XML strings from diagrams.js render functions
 * @returns {string}     HTML fragment (no <html>/<head>)
 */
export function buildDiagramPage(inp, svgs) {
  const MODEL_NAMES = ['Short Line', 'Nominal \u03c0', 'Distributed Parameter'];
  const modelLabel  = MODEL_NAMES[inp.model] ?? inp.model;
  return `
<div class="report-page diagrams-page">
  <h2>Diagrams</h2>

  <div class="diag-section">
    <h3>1. Conductor Arrangement</h3>
    <div class="diag-box">${svgs.arrangement}</div>
  </div>

  <div class="diag-section">
    <h3>2. Circuit Diagram &mdash; ${modelLabel}</h3>
    <div class="diag-box">${svgs.circuit}</div>
  </div>

  <div class="diag-section">
    <h3>3. Phasor Diagram</h3>
    <div class="diag-box">${svgs.phasor}</div>
  </div>

  <p class="footer">TADEE Group 7 — Transmission Line Analyser</p>
</div>`;
}

// ─── Shared PDF stylesheet ────────────────────────────────────────────────────
export const PDF_STYLES = `
  @font-face {
    font-family: 'Pixelated MS Sans Serif';
    src: url('https://unpkg.com/98.css@0.1.21/dist/ms_sans_serif.woff2') format('woff2'),
         url('https://unpkg.com/98.css@0.1.21/dist/ms_sans_serif.woff')  format('woff');
    font-weight: normal;
  }
  @font-face {
    font-family: 'Pixelated MS Sans Serif';
    src: url('https://unpkg.com/98.css@0.1.21/dist/ms_sans_serif_bold.woff2') format('woff2'),
         url('https://unpkg.com/98.css@0.1.21/dist/ms_sans_serif_bold.woff')  format('woff');
    font-weight: bold;
  }
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Pixelated MS Sans Serif', 'MS Sans Serif', sans-serif;
    font-size: 11pt; color: #000; margin: 0; padding: 0.8cm 1.1cm;
    -webkit-font-smoothing: none; font-smooth: never;
  }
  .report-page { page-break-after: always; }
  .report-page:last-child { page-break-after: auto; }
  h1 { font-size: 16pt; text-align: center; margin-bottom: 2px; }
  .subtitle { text-align: center; font-size: 10pt; margin-bottom: 4px; }
  .batch-label { text-align: center; font-size: 10pt; font-weight: bold;
                  margin-bottom: 12px; color: #444; }
  .meta { font-size: 10pt; margin-bottom: 12px; }
  .meta td { padding: 1px 6px; }
  h2 { font-size: 13pt; border-bottom: 1px solid #000;
       margin: 16px 0 6px; padding-bottom: 2px; }
  table.data { border-collapse: collapse; width: 100%; font-size: 10pt; }
  table.data th { background: #d4d0c8; border: 1px solid #808080;
                  padding: 3px 6px; text-align: left; }
  table.data td { border: 1px solid #808080; padding: 3px 6px; }
  table.data tr:nth-child(even) td { background: #f5f5f5; }
  .val { font-family: 'Courier New', monospace; }
  .footer { font-size: 9pt; text-align: center; margin-top: 24px; color: #555; }
  /* ── Diagrams page ───────────────────────────────────────────────────────── */
  .diagrams-page h2 { margin-bottom: 8px; }
  .diag-section { margin-bottom: 10px; }
  .diag-section h3 { font-size: 11pt; font-weight: bold;
                     margin: 0 0 3px; padding-bottom: 1px;
                     border-bottom: 1px solid #ccc; }
  .diag-box { border: 1px solid #808080; background: #fff;
               overflow: hidden; line-height: 0; }
  .diag-box svg { width: 100%; height: auto; display: block; }
`;
