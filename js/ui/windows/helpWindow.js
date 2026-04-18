/**
 * helpWindow.js — Help viewer window (Windows 98 IE Help style).
 *
 * Two-pane layout:
 *   Toolbar   — Hide | Back | Forward | Options | Web Help
 *   Left pane — Contents / Index / Search tabs
 *   Right pane — Content display area
 *
 * Exposes:
 *   openHelpWindow(viewport) — open or raise the Help Topics window.
 */

import { openWindow }  from '../components/createWindow.js';
import { raiseWindow } from '../components/windowManager.js';

// ─── Module state ─────────────────────────────────────────────────────────────
let _win     = null;
let _history = [];   // visited topic id trail
let _histIdx = -1;   // current position in _history

// ─── Help topic data ──────────────────────────────────────────────────────────
const TOPICS = {
  'overview': {
    label: 'TADEE Analyser Help',
    content: `
      <h3>TADEE Transmission Line Analyser — Help</h3>
      <p>Welcome to the TADEE Analyser. Use the <strong>Contents</strong> tab to browse topics by category,
      the <strong>Index</strong> tab for an alphabetical list, or <strong>Search</strong> to
      find topics by keyword.</p>
      <h4>About This Application</h4>
      <p>The TADEE Analyser analyses balanced three-phase AC overhead transmission lines using standard
      ABCD-parameter methods. Supported models: Short, Medium (nominal-&pi;), and Long
      (distributed parameters).</p>
      <h4>Getting Help</h4>
      <ul>
        <li>Select a topic in the left panel to display it here.</li>
        <li>Use <strong>Back</strong> and <strong>Forward</strong> to retrace visited topics.</li>
        <li>Click <strong>Hide</strong> to collapse the navigation panel.</li>
      </ul>
    `,
  },
  'getting-started': {
    label: 'Getting Started',
    content: `
      <h3>Getting Started</h3>
      <p>Follow these steps to perform your first transmission line analysis.</p>
      <h4>Step 1 — Enter Line Parameters</h4>
      <p>Fill in the <strong>Input</strong> panel. Each field has a unit selector — choose the
      unit most convenient for your data. See
      <a href="#" data-topic="input-parameters">Input Parameters</a> for a description of
      each field.</p>
      <h4>Step 2 — Select a Line Model</h4>
      <p>Choose <strong>Short</strong>, <strong>Nominal &pi;</strong>, or <strong>Distributed</strong> from
      the <em>Line model</em> dropdown. See
      <a href="#" data-topic="line-models">Line Models</a> for guidance on which to use.</p>
      <h4>Step 3 — Compute</h4>
      <p>Click the <strong>Compute</strong> button. Results appear in the
      <strong>Results</strong> panel and diagrams update in the <strong>Canvas</strong>
      panel.</p>
      <h4>Step 4 — Review Results</h4>
      <p>Check sending-end voltage, power, voltage regulation, and efficiency. See
      <a href="#" data-topic="results-panel">Reading the Results Panel</a> for details on
      every output field.</p>
    `,
  },
  'input-parameters': {
    label: 'Input Parameters',
    content: `
      <h3>Input Parameters</h3>
      <p>Parameters are grouped into four fieldsets in the Input pane.</p>
      <h4>Electrical Parameters</h4>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#000080;color:#fff;">
          <th style="padding:3px 6px;text-align:left;">Field</th>
          <th style="padding:3px 6px;text-align:left;">Description</th>
        </tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Line length</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Total length of the transmission line (m, km, or miles).</td></tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Receiving end load</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Three-phase real power delivered at the receiving end (W, kW, or MW).</td></tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Power factor (lagging)</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Receiving-end power factor, entered as a value between 0 and 1. Always treated as lagging.</td></tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Nominal system voltage</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Receiving-end line-to-line voltage, RMS (V or kV).</td></tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Frequency (Hz)</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">System frequency. Default is 50 Hz.</td></tr>
        <tr><td style="padding:2px 6px;"><strong>System type</strong></td><td style="padding:2px 6px;"><em>Symmetrical</em>: phases equally spaced at 120°, enter a single spacing value D. <em>Unsymmetrical</em>: enter three individual spacings Dab, Dbc, and Dca.</td></tr>
      </table>
      <h4>Geometry Parameters</h4>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#000080;color:#fff;">
          <th style="padding:3px 6px;text-align:left;">Field</th>
          <th style="padding:3px 6px;text-align:left;">Description</th>
        </tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Phase spacing D</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Centre-to-centre distance between phase conductors (cm or m). Shown when System type is Symmetrical.</td></tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Dab / Dbc / Dca</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Individual phase spacings (cm or m). Shown when System type is Unsymmetrical.</td></tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Sub-conductor count</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Number of sub-conductors per bundle (2, 3, or 4). Select 1 in the Conductor Parameters fieldset if the line is unbundled.</td></tr>
        <tr><td style="padding:2px 6px;"><strong>Sub-conductor spacing</strong></td><td style="padding:2px 6px;">Centre-to-centre spacing between sub-conductors within a bundle (cm or m).</td></tr>
      </table>
      <h4>Conductor Parameters</h4>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#000080;color:#fff;">
          <th style="padding:3px 6px;text-align:left;">Field</th>
          <th style="padding:3px 6px;text-align:left;">Description</th>
        </tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Number of strands</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Total number of strands that make up a single sub-conductor. Used to compute the conductor's GMR.</td></tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Strand diameter</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Outer diameter of each individual strand (mm, cm, or m).</td></tr>
        <tr><td style="padding:2px 6px;"><strong>Resistance</strong></td><td style="padding:2px 6px;">AC resistance per unit length per conductor (&Omega;/m or &Omega;/km).</td></tr>
      </table>
      <h4>Model Selection</h4>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#000080;color:#fff;">
          <th style="padding:3px 6px;text-align:left;">Option</th>
          <th style="padding:3px 6px;text-align:left;">Description</th>
        </tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Short</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Series impedance only; shunt capacitance neglected. Suitable for lines under ~80 km.</td></tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Nominal &pi;</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Adds shunt admittance split equally at each end. Suitable for lines of 80–250 km.</td></tr>
        <tr><td style="padding:2px 6px;"><strong>Distributed</strong></td><td style="padding:2px 6px;">Exact hyperbolic solution using distributed parameters. Best for lines over 250 km.</td></tr>
      </table>
    `,
  },
  'line-models': {
    label: 'Line Models',
    content: `
      <h3>Line Models</h3>
      <p>Select the model that best matches the physical length of your line.</p>
      <h4>Short (&lt; 80 km)</h4>
      <p>Uses only the series impedance (R + jX). Shunt capacitance is neglected. Suitable
      for distribution and subtransmission circuits.</p>
      <h4>Nominal &pi; (80 – 250 km)</h4>
      <p>Adds shunt capacitance split equally at each end. The ABCD parameters account for
      half the total admittance at both the sending and receiving ends.</p>
      <h4>Distributed (&gt; 250 km)</h4>
      <p>Uses the exact hyperbolic solution to the transmission line wave equations. Most
      accurate for very long lines or where surge-impedance precision matters.</p>
    `,
  },
  'results-panel': {
    label: 'Reading the Results Panel',
    content: `
      <h3>Reading the Results Panel</h3>
      <p>After pressing <strong>Compute</strong>, the Results panel shows the following rows.
      Complex values are displayed in polar form (magnitude &ang; angle&deg;).</p>
      <h4>Line Parameters</h4>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#000080;color:#fff;">
          <th style="padding:3px 6px;text-align:left;">Row</th>
          <th style="padding:3px 6px;text-align:left;">Description</th>
        </tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Inductance per phase per km</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Series inductance of one phase per unit length (H/km).</td></tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Capacitance per phase per km</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Shunt capacitance of one phase per unit length (F/km).</td></tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Inductive reactance XL</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Total series inductive reactance of the line (&Omega;).</td></tr>
        <tr><td style="padding:2px 6px;"><strong>Capacitive reactance XC</strong></td><td style="padding:2px 6px;">Total shunt capacitive reactance of the line (&Omega;).</td></tr>
      </table>
      <h4>ABCD Parameters</h4>
      <p>The generalised circuit constants for the selected line model. All four values (A, B, C, D)
      are complex and shown in polar form (magnitude &ang; angle&deg;). Units: A and D are dimensionless, B is in &Omega;,
      C is in S. For a passive reciprocal network AD &minus; BC = 1.</p>
      <h4>Sending-End Quantities</h4>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#000080;color:#fff;">
          <th style="padding:3px 6px;text-align:left;">Row</th>
          <th style="padding:3px 6px;text-align:left;">Description</th>
        </tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Sending end voltage (phase)</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Sending-end phase voltage in polar form (kV &ang; &deg;).</td></tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Sending end voltage (line-to-line)</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Sending-end line-to-line voltage in polar form (kV &ang; &deg;).</td></tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Sending end current Is</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Sending-end current in polar form (A &ang; &deg;).</td></tr>
        <tr><td style="padding:2px 6px;"><strong>Charging current Ic</strong></td><td style="padding:2px 6px;">Shunt charging current in polar form (A &ang; &deg;). Non-zero for Nominal &pi; and Distributed models.</td></tr>
      </table>
      <h4>Performance Indices</h4>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#000080;color:#fff;">
          <th style="padding:3px 6px;text-align:left;">Row</th>
          <th style="padding:3px 6px;text-align:left;">Description</th>
        </tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Voltage regulation</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Percentage voltage rise at the receiving end under no-load relative to full-load voltage (%).</td></tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Power loss (3&phi;)</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Total three-phase real power lost in the line conductors (MW).</td></tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Transmission efficiency</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Ratio of received power to sent power, expressed as a percentage (%).</td></tr>
        <tr><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;"><strong>Surge impedance Zc</strong></td><td style="padding:2px 6px;border-bottom:1px solid #c0c0c0;">Characteristic impedance of the line — the impedance at which reactive power is zero (&Omega;).</td></tr>
        <tr><td style="padding:2px 6px;"><strong>Surge impedance loading SIL</strong></td><td style="padding:2px 6px;">Three-phase load at which the line neither absorbs nor generates reactive power (MW).</td></tr>
      </table>
    `,
  },
  'canvas-diagrams': {
    label: 'Canvas Diagrams',
    content: `
      <h3>Canvas Diagrams</h3>
      <p>The <strong>Canvas</strong> panel holds three diagram subpanes arranged in a
      resizable grid. Drag the splitter bars between panes to resize them. All three diagrams
      update each time you press <strong>Compute</strong>.</p>
      <p>Each subpane supports <strong>scroll-wheel zoom</strong> and
      <strong>click-and-drag pan</strong>. The dividers between panes can be dragged to
      resize the grid.</p>

      <h4>Conductor Arrangement</h4>
      <p>A cross-section view showing the positions of the phase conductors and, where
      applicable, the sub-conductors within each bundle. GMD and GMR annotations are
      drawn on the diagram.</p>
      <p><strong>Controls in the title bar:</strong></p>
      <ul>
        <li><strong>&#x2316; (Reset zoom)</strong> — Resets pan and zoom back to the
        default fit.</li>
        <li><strong>&#x25A1; (Maximize / Restore)</strong> — Expands this pane to fill
        the entire Canvas area, hiding the other two panes. Click again to restore the
        grid layout.</li>
      </ul>
      <p><strong>Bottom bar controls:</strong></p>
      <ul>
        <li><strong>To scale</strong> checkbox — When checked, conductors and spacings are
        drawn proportional to their physical dimensions. When unchecked (default), conductors
        are drawn at a fixed size so they are always clearly visible regardless of the actual
        dimensions.</li>
        <li><strong>Radius</strong> — Displays the computed sub-conductor radius (m).</li>
        <li><strong>Scale</strong> — Displays the current drawing scale (px/m) so you can
        judge the relationship between screen pixels and physical metres.</li>
      </ul>

      <h4>Circuit Diagram</h4>
      <p>A schematic of the equivalent circuit for the selected line model. The pane title
      updates to show the active model name.</p>
      <p><strong>Controls in the title bar:</strong></p>
      <ul>
        <li><strong>&#x2316; (Reset zoom)</strong> — Resets pan and zoom.</li>
        <li><strong>&#x394; / &#x2261; (Toggle view)</strong> — Visible only when the
        <em>Distributed</em> model is selected. Switches the circuit diagram between the
        <strong>ladder model</strong> view (cascaded &pi;-sections approximating the
        distributed line) and the <strong>d/dx differential</strong> view (showing the
        infinitesimal element equations). The button icon changes to indicate the current
        mode: &Delta; = currently showing ladder, &#x2261; = currently showing d/dx.</li>
        <li><strong>&#x25A1; (Maximize / Restore)</strong> — Fills the Canvas area with
        this pane.</li>
      </ul>

      <h4>Phasor Diagram</h4>
      <p>A vector diagram showing the sending-end and receiving-end voltage and current
      phasors (Vs, Vr, Is, Ir) at their correct magnitudes and phase angles. Useful for
      visualising voltage regulation and the phase shift introduced by the line.</p>
      <p><strong>Controls in the title bar:</strong></p>
      <ul>
        <li><strong>&#x2316; (Reset zoom)</strong> — Resets pan and zoom.</li>
        <li><strong>&#x25A1; (Maximize / Restore)</strong> — Fills the Canvas area with
        this pane.</li>
      </ul>

      <h4>Showing and Hiding the Canvas Pane</h4>
      <p>The entire Canvas pane (all three diagrams) can be toggled via
      <strong>View &rarr; Canvas pane &rarr; Whole pane</strong>. Individual diagram
      subpanes can also be hidden independently from the same submenu.</p>
      <p>The Canvas pane itself can be <strong>popped out</strong> into its own floating
      window using the pop-out button (&#x2197;) in the Canvas panel header. The same
      applies to the Input and Results panes.</p>
    `,
  },
  'file-operations': {
    label: 'File Operations',
    content: `
      <h3>File Operations</h3>
      <p>Use the <strong>File</strong> menu to save, open, and export your work.</p>
      <h4>Save (Ctrl+S)</h4>
      <p>Saves the current input parameters as a <code>.json</code> file to your downloads
      folder. This file can be reopened later to restore the same inputs.</p>
      <h4>Open (Ctrl+O)</h4>
      <p>Opens a file picker. The TADEE Analyser accepts three file types:</p>
      <ul>
        <li><strong>Input JSON</strong> — loaded directly into the Input panel.</li>
        <li><strong>Output (results) JSON</strong> — results re-displayed and inputs
        restored.</li>
        <li><strong>Batch JSON</strong> — automatically loaded into Batch Mode.</li>
      </ul>
      <h4>Export Result As&hellip;</h4>
      <p>Exports the most recent computed result in one of the following formats:</p>
      <ul>
        <li><strong>PDF</strong> — formatted report with diagrams.</li>
        <li><strong>JSON</strong> — machine-readable results object.</li>
        <li><strong>TXT</strong> — plain-text report.</li>
        <li><strong>Markdown</strong> — Markdown-formatted report.</li>
      </ul>
    `,
  },
  'batch-mode': {
    label: 'Batch Mode',
    content: `
      <h3>Batch Mode</h3>
      <p>Batch Mode runs the analyser over many parameter combinations at once. Open it via
      <strong>Tools &rarr; Batch Mode</strong> or the toolbar button.</p>
      <h4>Range Sweep</h4>
      <p>Select one field to vary (e.g. Line Length), enter a start, end, and step value,
      then click <strong>Run</strong>. All other parameters are taken from the current Input
      panel.</p>
      <h4>Load JSON</h4>
      <p>Load a <code>.json</code> file containing a batch definition. Two formats are
      accepted:</p>
      <ul>
        <li><strong>Array of objects</strong> — each object is a complete set of line
        parameters.</li>
        <li><strong>Object of arrays</strong> — each key maps to an array of values; all
        arrays must have the same length.</li>
      </ul>
      <h4>Navigating Results</h4>
      <p>Use <strong>&#9668; Prev</strong> and <strong>Next &#9658;</strong> to page through
      results. The <strong>Export</strong> button saves all results as a JSON file or a
      multi-page PDF report.</p>
    `,
  },
  'menu-reference': {
    label: 'Menu Reference',
    content: `
      <h3>Menu Reference</h3>
      <h4>File</h4>
      <ul>
        <li><strong>Save</strong> — Save current inputs as a JSON file.</li>
        <li><strong>Open</strong> — Open an input, output, or batch JSON file.</li>
        <li><strong>Export result as&hellip;</strong> — Export results as PDF, JSON, TXT, or
        Markdown.</li>
      </ul>
      <h4>View</h4>
      <ul>
        <li><strong>Canvas pane</strong> — Toggle individual diagrams on or off.</li>
        <li><strong>Popout panels</strong> — Detach panels into separate floating windows.</li>
      </ul>
      <h4>Tools</h4>
      <ul>
        <li><strong>Batch Mode</strong> — Open the batch analysis window.</li>
        <li><strong>Import Input JSON</strong> — Load a saved input file into the Input
        panel.</li>
        <li><strong>Import Output JSON</strong> — Reload a results file and re-verify by
        recomputing.</li>
        <li><strong>View Calculations</strong> — Open the calculations reference document.</li>
      </ul>
      <h4>Help</h4>
      <ul>
        <li><strong>Help Topics</strong> — Open this window.</li>
        <li><strong>About TADEE Analyser</strong> — Version and project information.</li>
      </ul>
    `,
  },
};

// ─── Contents tree (grouped) ──────────────────────────────────────────────────
const TREE = [
  { id: 'overview', label: 'TADEE Analyser Help' },
  {
    label: 'Using the TADEE Analyser',
    children: [
      { id: 'getting-started',  label: 'Getting Started' },
      { id: 'input-parameters', label: 'Input Parameters' },
      { id: 'line-models',      label: 'Line Models' },
      { id: 'results-panel',    label: 'Reading the Results Panel' },
    ],
  },
  {
    label: 'Features',
    children: [
      { id: 'canvas-diagrams', label: 'Canvas Diagrams' },
      { id: 'file-operations', label: 'File Operations' },
      { id: 'batch-mode',      label: 'Batch Mode' },
    ],
  },
  { id: 'menu-reference', label: 'Menu Reference' },
];

// ─── Body builder ─────────────────────────────────────────────────────────────
function _buildBody() {
  const body = document.createElement('div');
  body.className = 'help-body';
  body.innerHTML = `
    <div class="help-toolbar toolbar">
      <button id="help-btn-hide">Hide</button>
      <div class="help-toolbar-sep"></div>
      <button id="help-btn-back" disabled>Back</button>
      <button id="help-btn-fwd"  disabled>Forward</button>
      <div class="help-toolbar-sep"></div>
      <button id="help-btn-options">Options</button>
      <button id="help-btn-webhelp">Web Help</button>
    </div>
    <div class="help-main">
      <div id="help-nav" class="help-nav">
        <menu role="tablist" class="help-tabs">
          <li role="tab" id="help-tab-contents" aria-selected="true"><a href="#">Contents</a></li>
          <li role="tab" id="help-tab-index"    aria-selected="false"><a href="#">Index</a></li>
          <li role="tab" id="help-tab-search"   aria-selected="false"><a href="#">Search</a></li>
        </menu>
        <div id="help-panel-contents" class="help-tab-panel is-active" role="tabpanel"></div>
        <div id="help-panel-index"    class="help-tab-panel"           role="tabpanel"></div>
        <div id="help-panel-search"   class="help-tab-panel"           role="tabpanel">
          <div class="help-search-bar">
            <input id="help-search-input" type="text" placeholder="Type keywords&hellip;" />
            <button id="help-search-btn">Search</button>
          </div>
          <div id="help-search-results" class="help-search-results sunken-panel"></div>
        </div>
      </div>
      <div id="help-content" class="help-content sunken-panel"></div>
    </div>
  `;
  return body;
}

// ─── Tree / list population ───────────────────────────────────────────────────
function _populateContents(panel) {
  const ul = document.createElement('ul');
  ul.className = 'tree-view help-tree';
  TREE.forEach(node => {
    const li = document.createElement('li');
    if (node.children) {
      const details = document.createElement('details');
      details.open = true;
      const summary = document.createElement('summary');
      summary.textContent = node.label;
      details.appendChild(summary);
      const childUl = document.createElement('ul');
      node.children.forEach(child => childUl.appendChild(_makeTopicLi(child)));
      details.appendChild(childUl);
      li.appendChild(details);
    } else {
      li.textContent   = node.label;
      li.dataset.topic = node.id;
      li.style.cursor  = 'default';
      li.addEventListener('click', () => _navigate(node.id));
    }
    ul.appendChild(li);
  });
  panel.appendChild(ul);
}

function _populateIndex(panel) {
  const sorted = Object.entries(TOPICS)
    .sort(([, a], [, b]) => a.label.localeCompare(b.label));
  const ul = document.createElement('ul');
  ul.className = 'tree-view help-tree';
  sorted.forEach(([id]) =>
    ul.appendChild(_makeTopicLi({ id, label: TOPICS[id].label })));
  panel.appendChild(ul);
}

function _makeTopicLi({ id, label }) {
  const li = document.createElement('li');
  li.textContent   = label;
  li.dataset.topic = id;
  li.style.cursor  = 'default';
  li.addEventListener('click', () => _navigate(id));
  return li;
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function _navigate(topicId) {
  if (!TOPICS[topicId]) return;
  _history = _history.slice(0, _histIdx + 1);
  _history.push(topicId);
  _histIdx = _history.length - 1;
  _showTopic(topicId);
  _updateNavButtons();
}

function _showTopic(topicId) {
  const topic   = TOPICS[topicId];
  if (!topic) return;
  const content = document.getElementById('help-content');
  if (content) {
    content.innerHTML = topic.content;
    content.querySelectorAll('a[data-topic]').forEach(a => {
      a.href = '#';
      a.addEventListener('click', e => {
        e.preventDefault();
        _navigate(a.dataset.topic);
      });
    });
  }
  // Highlight selected item in Contents and Index tree lists
  document.querySelectorAll('#help-nav [data-topic]').forEach(el =>
    el.setAttribute('aria-selected',
      el.dataset.topic === topicId ? 'true' : 'false'));
}

function _goBack() {
  if (_histIdx > 0) {
    _histIdx--;
    _showTopic(_history[_histIdx]);
    _updateNavButtons();
  }
}

function _goForward() {
  if (_histIdx < _history.length - 1) {
    _histIdx++;
    _showTopic(_history[_histIdx]);
    _updateNavButtons();
  }
}

function _updateNavButtons() {
  const back = document.getElementById('help-btn-back');
  const fwd  = document.getElementById('help-btn-fwd');
  if (back) back.disabled = _histIdx <= 0;
  if (fwd)  fwd.disabled  = _histIdx >= _history.length - 1;
}

function _toggleNav() {
  const nav = document.getElementById('help-nav');
  const btn = document.getElementById('help-btn-hide');
  if (!nav) return;
  const hidden = nav.classList.toggle('help-nav--hidden');
  if (btn) btn.textContent = hidden ? 'Show' : 'Hide';
}

function _switchTab(name) {
  ['contents', 'index', 'search'].forEach(tab => {
    document.getElementById(`help-tab-${tab}`)
      ?.setAttribute('aria-selected', tab === name ? 'true' : 'false');
    const panel = document.getElementById(`help-panel-${tab}`);
    if (panel) panel.classList.toggle('is-active', tab === name);
  });
}

function _doSearch(query) {
  const results = document.getElementById('help-search-results');
  if (!results) return;
  const q = query.trim().toLowerCase();
  if (!q) { results.innerHTML = ''; return; }

  const matches = Object.entries(TOPICS).filter(([, t]) =>
    t.label.toLowerCase().includes(q) ||
    t.content.replace(/<[^>]+>/g, ' ').toLowerCase().includes(q));

  if (matches.length === 0) {
    results.innerHTML =
      '<p style="padding:4px;font-size:11px;margin:0;">No results found.</p>';
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'tree-view help-tree';
  ul.style.margin = '0';
  matches.forEach(([id]) =>
    ul.appendChild(_makeTopicLi({ id, label: TOPICS[id].label })));
  results.innerHTML = '';
  results.appendChild(ul);
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function openHelpWindow(viewport) {
  if (_win) {
    raiseWindow(_win);
    return;
  }

  _history = [];
  _histIdx = -1;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w  = Math.round(Math.min(vw * 0.85, 740));
  const h  = Math.round(Math.min(vh * 0.85, 540));

  const body = _buildBody();

  _win = openWindow({
    title:       'Help Topics',
    width:       w,
    height:      h,
    resizable:   true,
    maximizable: true,
    content:     body,
  }, viewport);

  _win.id = 'win-help';
  _win._closeGuard = proceed => { _win = null; proceed(); };

  // Populate navigation panels
  _populateContents(document.getElementById('help-panel-contents'));
  _populateIndex(document.getElementById('help-panel-index'));

  // Toolbar
  document.getElementById('help-btn-hide')?.addEventListener('click', _toggleNav);
  document.getElementById('help-btn-back')?.addEventListener('click', _goBack);
  document.getElementById('help-btn-fwd') ?.addEventListener('click', _goForward);

  // Tabs
  ['contents', 'index', 'search'].forEach(tab =>
    document.getElementById(`help-tab-${tab}`)
      ?.querySelector('a')
      ?.addEventListener('click', e => { e.preventDefault(); _switchTab(tab); }));

  // Search
  const searchInput = document.getElementById('help-search-input');
  document.getElementById('help-search-btn')
    ?.addEventListener('click', () => _doSearch(searchInput?.value ?? ''));
  searchInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') _doSearch(searchInput.value);
  });

  // Navigate to overview on open
  _navigate('overview');
}
