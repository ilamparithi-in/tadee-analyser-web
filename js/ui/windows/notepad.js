/**
 * notepad.js — builds and opens the main Notepad / analysis window
 *
 * Uses createWindow() for the window shell (title-bar, window-body, status-bar),
 * then inserts the menu-bar and toolbar between title-bar and window-body.
 * The panel layout (left input form + right canvas + bottom results) is built
 * as innerHTML and passed as the window-body content.
 *
 * Height 568px matches the original content-sized height when panel-layout was
 * hardcoded at 460px:  title(26) + menu(24) + toolbar(28) + body(468) + status(22).
 * With height: 100% on #panel-layout, this initial size is preserved AND the
 * panels scale correctly when the window is resized.
 */

import { createWindow } from '../components/createWindow.js';
import { addWindow }    from '../components/windowManager.js';

export function initNotepadWindow(viewport) {

  // ── Panel layout — inner content of window-body ───────────────────────────
  const panelLayout = document.createElement('div');
  panelLayout.id = 'panel-layout';
  panelLayout.innerHTML = `
    <div id="panel-top-row">

      <div id="panel-left">
        <div class="panel-content">
          <form id="input-form" style="font-size:11px;">

            <fieldset>
              <legend>Electrical Parameters</legend>
              <div class="field-row-stacked">
                <label for="line-length">Line length (km)</label>
                <input id="line-length" type="number" min="0" step="any" />
              </div>
              <div class="field-row-stacked" style="margin-top:4px;">
                <label for="load-mw">Receiving end load (MW)</label>
                <input id="load-mw" type="number" min="0" step="any" />
              </div>
              <div class="field-row-stacked" style="margin-top:4px;">
                <label for="power-factor">Power factor</label>
                <input id="power-factor" type="number" min="0" max="1" step="0.01" />
              </div>
              <div class="field-row-stacked" style="margin-top:4px;">
                <label for="voltage">Nominal voltage (kV)</label>
                <input id="voltage" type="number" min="0" step="any" />
              </div>
              <div class="field-row-stacked" style="margin-top:4px;">
                <label for="frequency">Frequency (Hz)</label>
                <input id="frequency" type="number" min="0" step="any" value="50" />
              </div>
              <div class="field-row-stacked" style="margin-top:4px;">
                <label for="system-type">System type</label>
                <select id="system-type">
                  <option>Symmetrical</option>
                  <option>Unsymmetrical</option>
                </select>
              </div>
            </fieldset>

            <fieldset style="margin-top:6px;">
              <legend>Geometry Parameters</legend>
              <div class="field-row-stacked">
                <label for="phase-spacing">Phase spacing (m)</label>
                <input id="phase-spacing" type="number" min="0" step="any" />
              </div>
              <div class="field-row-stacked" style="margin-top:4px;">
                <label for="bundle-count">Bundle count</label>
                <select id="bundle-count">
                  <option>2</option>
                  <option>3</option>
                  <option>4</option>
                </select>
              </div>
              <div class="field-row-stacked" style="margin-top:4px;">
                <label for="sub-spacing">Sub-conductor spacing (m)</label>
                <input id="sub-spacing" type="number" min="0" step="any" />
              </div>
            </fieldset>

            <fieldset style="margin-top:6px;">
              <legend>Conductor Parameters</legend>
              <div class="field-row-stacked">
                <label for="strands">Number of strands</label>
                <input id="strands" type="number" min="1" step="1" />
              </div>
              <div class="field-row-stacked" style="margin-top:4px;">
                <label for="resistance">Resistance (Ω/km)</label>
                <input id="resistance" type="number" min="0" step="any" />
              </div>
            </fieldset>

            <fieldset style="margin-top:6px;">
              <legend>Model Selection</legend>
              <div class="field-row-stacked">
                <label for="line-model">Line model</label>
                <select id="line-model">
                  <option>Short</option>
                  <option>Nominal π</option>
                  <option>Distributed</option>
                </select>
              </div>
            </fieldset>

          </form>
        </div>
      </div>

      <div class="splitter-v" id="splitter-v"></div>

      <div id="panel-right">
        <div id="canvas-container"></div>
      </div>

    </div>

    <div class="splitter-h" id="splitter-h"></div>

    <div id="panel-bottom">
      <div id="results-heading">Results</div>
      <div id="results-scroll">
        <div id="results-grid"></div>
      </div>
    </div>
  `;

  // ── Window shell ──────────────────────────────────────────────────────────
  const win = createWindow({
    title:      'Notepad — Untitled',
    width:      700,
    height:     568,   // matches original content-sized height; panels scale via height:100%
    content:    panelLayout,
    statusBar:  'No calculation performed',
  });

  // window-body padding (matches original inline style)
  win.querySelector('.window-body').style.padding = '4px';

  // id for status bar field (external scripts reference it)
  win.querySelector('.status-bar-field').id = 'app-status-bar';

  // ── Menu bar ───────────────────────────────────────────────────────────────
  const menuBar = document.createElement('nav');
  menuBar.className = 'menu-bar';
  menuBar.id = 'menu-bar';
  menuBar.innerHTML = `
    <div class="menu-item" data-menu="file">
      <button>File</button>
      <div class="dropdown"><div class="dropdown-inner">
        <button class="dropdown-item">New</button>
        <button class="dropdown-item">Open…</button>
        <button class="dropdown-item">Save</button>
        <button class="dropdown-item">Save As…</button>
        <hr class="dropdown-separator" />
        <button class="dropdown-item">Print…</button>
        <hr class="dropdown-separator" />
        <button class="dropdown-item">Exit</button>
      </div></div>
    </div>
    <div class="menu-item" data-menu="edit">
      <button>Edit</button>
      <div class="dropdown"><div class="dropdown-inner">
        <button class="dropdown-item" disabled>Undo</button>
        <hr class="dropdown-separator" />
        <button class="dropdown-item">Cut</button>
        <button class="dropdown-item">Copy</button>
        <button class="dropdown-item">Paste</button>
        <button class="dropdown-item">Delete</button>
        <hr class="dropdown-separator" />
        <button class="dropdown-item">Select All</button>
      </div></div>
    </div>
    <div class="menu-item" data-menu="view">
      <button>View</button>
      <div class="dropdown"><div class="dropdown-inner">
        <button class="dropdown-item">Toolbar</button>
        <button class="dropdown-item">Status Bar</button>
        <hr class="dropdown-separator" />
        <button class="dropdown-item">Word Wrap</button>
      </div></div>
    </div>
    <div class="menu-item" data-menu="tools">
      <button>Tools</button>
      <div class="dropdown"><div class="dropdown-inner">
        <button class="dropdown-item">Options…</button>
        <button class="dropdown-item">Preferences…</button>
      </div></div>
    </div>
    <div class="menu-item" data-menu="help">
      <button>Help</button>
      <div class="dropdown"><div class="dropdown-inner">
        <button class="dropdown-item">Help Topics</button>
        <hr class="dropdown-separator" />
        <button class="dropdown-item">About Notepad</button>
      </div></div>
    </div>
  `;

  // ── Toolbar ────────────────────────────────────────────────────────────────
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `
    <button>New</button>
    <button>Open</button>
    <button>Save</button>
    <div class="toolbar-separator"></div>
    <button>Print</button>
  `;

  // Insert menu-bar and toolbar between title-bar and window-body
  const windowBody = win.querySelector('.window-body');
  win.insertBefore(menuBar, windowBody);
  win.insertBefore(toolbar, windowBody);

  addWindow(win, viewport);

  return win;
}
