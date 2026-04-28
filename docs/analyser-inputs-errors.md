# analyser.js, unitInput.js & Input Error Handling

This document covers three closely related layers of the analyser window:

1. **`js/ui/windows/analyser.js`** — initialises the `#win-analyser` window, wires every menu, toolbar, form behaviour, file I/O, validation, hints, and the main compute dispatch.
2. **`js/ui/components/unitInput.js`** — unit-conversion for labelled numeric inputs.
3. **`js/ui/components/errorDialog.js`** and **`js/ui/components/balloon.js`** — the two feedback mechanisms (modal dialogs and inline balloon tips) used for validation errors and hints.

---

## 1. `analyser.js`

### Role

The entry point `js/analyser.js` imports and calls `initAnalyserWindow(viewport)`. All real logic lives in `js/ui/windows/analyser.js`.

### Exports

| Export | Description |
|---|---|
| `initAnalyserWindow(viewport)` | Sets up the entire `#win-analyser` window. Called once on page load. |
| `isAnalyserOpen()` | Returns `true` if the window is currently visible. |
| `hasAnalyserInputs()` | Returns `true` if any input field in the analyser window has a non-empty value. Used by the close-guard and File → New. |

---

### Module-level state

```js
let _gridApi     = null;   // set by initGridWindow once the results grid is ready
let _lastResults = null;   // populated after a successful _compute(); enables Export
```

`_lastResults` holds `{ inputs, outputs, rows }`. While `null`, the Export Output button and all Export submenu items are disabled.

---

### Form field contracts

#### `INPUT_FIELDS`

An ordered array of `[inputId, hasUnitSelect]` pairs covering all 13 numeric inputs:

| ID | Has unit select? |
|---|---|
| `line-length` | yes |
| `load-mw` | yes |
| `power-factor` | no |
| `voltage` | yes |
| `frequency` | no |
| `phase-spacing` | yes |
| `dab` | yes |
| `dbc` | yes |
| `dca` | yes |
| `sub-spacing` | yes |
| `strands` | no |
| `dia-strands` | yes |
| `resistance` | yes |

#### `SELECT_FIELDS`

```js
['system-type', 'bundle-count', 'line-model']
```

#### `INPUT_CONTRACT`

Maps HTML input IDs → computation parameter names used in JSON save files and `_compute`:

| HTML ID | Contract key |
|---|---|
| `line-length` | `lineLengthKm` |
| `load-mw` | `recvLoadMW` |
| `power-factor` | `recvPF` |
| `voltage` | `nomSyskV` |
| `frequency` | `frequency` |
| `phase-spacing` | `phaseSpacingM` |
| `dab` | `Dab` |
| `dbc` | `Dbc` |
| `dca` | `Dca` |
| `sub-spacing` | `scSpacingM` |
| `strands` | `scStrands` |
| `dia-strands` | `strandDiaM` |
| `resistance` | `resSCPerKm` |

Unit selector values are saved alongside their inputs as `key_unit` entries (e.g. `lineLengthKm_unit`).

#### `SELECT_CONTRACT`

| HTML ID | Contract key |
|---|---|
| `system-type` | `symmetric` |
| `bundle-count` | `scCount` |
| `line-model` | `model` |

---

### Form I/O helpers

#### `_collectInputs(win)`

Reads all form values into a contract-keyed object. For each numeric input the raw string value is stored under the contract key; for each unit selector the selected `value` is stored as `contractKey_unit`. Select fields are stored directly by contract key.

#### `_applyInputs(win, data)`

Restores form from a plain object. Accepts both contract keys **and** legacy HTML-id keys for backward compatibility with old save files. After applying all values it dispatches a `change` event on `#system-type` to trigger the spacing-row toggle. Returns the count of fields successfully applied.

Key details:
- Numbers are written back as-is (no unit de-conversion — the file stores the display value alongside its unit).
- For select fields, the function matches by `option.value` or `option.textContent`; unknown values are silently skipped.

#### `_clearInputs(win)`

Resets all inputs to `''` and all selects to index 0, then dispatches `#system-type change` to reset the spacing row visibility.

---

### File I/O — save & load

#### `_saveInputs(win)`

1. Calls `_collectInputs(win)` to produce the contract object.
2. Calls `_triggerDownload(json, 'tadee-inputs_TIMESTAMP.json')`.

#### `_loadInputs(win)`

1. Opens a hidden `<input type="file">` picker (`.json` only).
2. Reads the file with `FileReader.readAsText`.
3. `JSON.parse`s the result.
4. Calls `_applyInputs`. Shows `showError` if parse fails or zero fields are applied.

#### `_exportOutput(win)`

Downloads `tadee-output_TIMESTAMP.json` containing the `_lastResults` object prefixed with comment header lines from `REPORT_META`.

#### `_exportPdf(win)`

1. Renders all three SVG strings via `diagrams.js` (`renderArrangementSvgStr`, `renderCircuitSvgStr`, `renderPhasorSvgStr`).
2. Calls `buildReportPage` + `buildDiagramPage` from `batch.js` to produce two HTML pages.
3. Opens a new browser window, writes the combined HTML (including `PDF_STYLES`), and calls `window.print()` once the load event fires.

#### `_exportTxt(win)` / `_exportMd(win)`

Build plain-text or Markdown report tables using:
- `_buildInputRows(inp)` → `[[label, valueString], …]` — 13 rows.
- `_buildResultRows(out)` → `[[label, valueString, unit], …]` — 17 rows covering L/C, X_L/X_C, ABCD parameters, V_S/I_S, voltage regulation, losses, efficiency η, Z_c, and SIL.

#### `REPORT_META`

Hardcoded object with `title`, `subtitle`, team member names and IDs, `date: '17/04/2026'`, and `footer`. Used in export headers and PDF page titles.

---

### File-type detection

Three predicates classify an arbitrary parsed JSON object before routing it to the correct handler:

| Function | Returns `true` when… |
|---|---|
| `_isBatchJson(data)` | Object has a `version` key and an `entries` array — batch input format. |
| `_isBatchOutputArray(data)` | Data is an array whose first element has both `inputs` and `outputs` keys — batch output format. |
| `_isOutputJson(data)` | Object is not an array and has both `inputs` and `outputs` keys — single output format. |

These are used identically by both **File → Open** and **Tools → Import** to route to the correct handler.

---

### Authenticity warnings

When the user opens or imports an output JSON (single or batch), the app cannot trust that the values have not been tampered with. Both handlers display a `showConfirm` dialog before proceeding:

> "Output values in this file may have been modified by an external source.
> The inputs will be loaded and Compute will be run automatically to verify the results."

Only if the user clicks **OK** does the app apply the inputs and re-run `_compute`.

Additionally, `_openOutputJson` must translate back from the numeric-coded fields that `tadee.js` stores internally:
- `inputs.symmetric`: `0` → `'Unsymmetrical'`, `1` → `'Symmetrical'`
- `inputs.model`: `0` → `'Short'`, `1` → `'Nominal π'`, `2` → `'Distributed'`

---

### Menu wiring

#### `_initFileMenu(win, viewport)`

| Menu item | Behaviour |
|---|---|
| **New** | Calls `_clearInputs` directly if no inputs; otherwise shows `showConfirm('Clear all inputs?', …)`. |
| **Open** | File picker → parse → file-type detection → route to batch/output/input handler. |
| **Save** | Calls `_saveInputs(win)`. |
| **Print** | Requires `_lastResults`; builds report HTML with `buildReportPage` + `buildDiagramPage` + `PDF_STYLES`, opens new window, calls `window.print()`. Shows `showError` if no results. |
| **Exit** | Delegates to `win._closeGuard` (set by `windowManager.js`) if present; otherwise clicks the title-bar Close button directly. |
| **Export submenu** | A `position:fixed` flyout panel (`#submenu-export`) shown on `mouseenter` of the trigger item. A 120 ms close timer is used so the mouse can travel from trigger to panel without the panel closing. Dismissed also on hovering other File menu items and on any `document click`. |

Export actions live in the flyout panel:
- **PDF** → `_exportPdf(win)`
- **JSON** → `_exportOutput(win)`
- **TXT** → `_exportTxt(win)`
- **Markdown** → `_exportMd(win)`

#### `_initToolsMenu(win, viewport)`

| Menu item | Behaviour |
|---|---|
| **Import Input JSON** | Rejects output files with a specific error message ("use Tools → Import Output JSON"). Accepts batch input files (opens batch window), plain input files (`_applyInputs`). |
| **Import Output JSON** | Rejects non-output files with a specific error message. Routes batch output arrays to `_openBatchOutputJson` and single output objects to `_openOutputJson`. |

#### `_initViewMenu(win)`

Controls pane and diagram visibility. Two layers:

**Layer 1 — Main panes** (`_apply()`):

Reads `data-checked` on `#view-pane-input`, `#view-pane-canvas`, `#view-pane-output` and shows/hides `#panel-left`, `#panel-right`, `#panel-bottom` accordingly. Panels with `data-popped-out="true"` are skipped (the pop-out module owns them). Splitters (`#splitter-v`, `#splitter-h`, `#panel-top-row`) are shown or hidden based on which combination of panels is currently visible.

Special case: when the Canvas pane is hidden but Input is visible, `panel-left` gets `flex: 1` to fill the full width.

**Layer 2 — Individual diagram panes** (`_applyDiagrams()`):

Reads `data-checked` on `#view-canvas-arrangement`, `#view-canvas-phasor`, `#view-canvas-circuit` and shows/hides the corresponding `.dpane-*` elements inside `#canvas-container`. Also handles CSS grid layout overrides:

| Active panes | Grid override |
|---|---|
| 1 only | Solo pane gets `grid-column: 1 / span 3; grid-row: 1 / span 3`. Both splitters hidden. |
| Arrangement + Phasor (no Circuit) | Both get `grid-column: 1 / span 3`; vertical splitter hidden; horizontal splitter stays. |
| All other combinations | CSS default layout (3-column, 2-row grid). |

After every `_applyDiagrams` call the parent "Canvas pane" check state is synced: the "Whole pane" item reflects whether all three are on; the `#view-pane-canvas` item is `true` if any diagram is on.

**Canvas submenu flyout** (`#submenu-canvas`): mirrors the Export flyout pattern — 120 ms close timer, shown on hover of the `#view-pane-canvas` trigger, dismissed on hovering other View menu items and on `document click`.

---

### `_initSpacingToggle(win)`

Listens to `#system-type change`. When the selected value contains `'unsym'` (case-insensitive), hides `#spacing-sym` and shows `#spacing-unsym`; otherwise the reverse. Runs once on init to set the initial state.

---

### Model hints — `_initModelHints(win)`

Shows an `'info'` balloon on `#line-length`, `#voltage`, or `#line-model` when the entered value suggests a different model than the one currently selected.

**`_modelHintFor(km, kv)`**:

Classifies a line as Short / Medium / Long using two independent scales:

| Category | By length | By voltage |
|---|---|---|
| 0 — Short | < 80 km | < 20 kV |
| 1 — Medium (Nominal π) | 80 – 250 km | 20 – 150 kV |
| 2 — Long (Distributed) | > 250 km | > 150 kV |

Returns `{ title: 'X suggested', message: 'range description' }` or `null` if the value is ≤ 0 or `NaN`.

**Trigger behaviour**:
- `#line-length input` and its unit select → classifies by km.
- `#voltage input` and its unit select → classifies by kV.
- `#line-model change` → re-checks whichever of km/kV is available; anchors the balloon to the model selector itself.

In all cases the balloon is suppressed if the category matches the current model selection, or if the anchor element is off-screen.

---

### Sub-conductor spacing warning — `_initSubSpacingWarning(win)`

Shows a `'warning'` balloon on `#sub-spacing` when the sub-conductor spacing exceeds 1/10 of the minimum phase spacing.

**Threshold rule**: `sc > minPhase / 10`

`minPhase` is computed as:
- Symmetrical system: `getBaseValue('phase-spacing', win)`
- Unsymmetrical system: `Math.min(Dab, Dbc, Dca)` (only values > 0 are considered)

Triggers on changes to: `#sub-spacing`, its unit select, `#phase-spacing`, `#dab`, `#dbc`, `#dca`, their respective unit selects, and `#system-type`.

---

### Power factor warning — `_initPowerFactorWarning(win)`

Shows a `'warning'` balloon on `#power-factor` whenever `parseFloat(pfInput.value) > 1`. Checks anchor visibility before showing. Triggers on `input` event only.

---

### Status bar hints — `_initStatusBarHints(win)`

Populates `#sb-hover` (the right portion of the status bar) as the mouse moves over elements in the window.

Uses a `mouseover` listener on the window element; walks up from `e.target` until it finds a node whose `id` is in the `SB_HINTS` map, then writes the hint text. On `mouseout` when the mouse leaves the window, clears the hint.

`SB_HINTS` covers toolbar buttons, menu items, all input fields, all unit selects, the model select, and the system-type select — 40+ entries total.

---

### Toolbar scroll — `_initToolbarScroll(win)`

When the window is too narrow to show all toolbar buttons, left/right scroll arrow buttons (`.toolbar-scroll-left` / `.toolbar-scroll-right`) are made visible. Each click scrolls `.toolbar-inner` by 80 px. A `ResizeObserver` on the inner element keeps button state updated as the window is resized.

---

### `_compute(win)`

The main analysis dispatch, called by the Compute button and automatically after loading an output JSON.

**Step 1 — Read form values**

Constructs a `params` object with `getBaseValue(id, win)` (base-unit values from `unitInput.js`) and raw `parseFloat` for fields without units:

| `params` key | Source |
|---|---|
| `lineLengthKm` | `getBaseValue('line-length', win)` |
| `recvLoadMW` | `getBaseValue('load-mw', win)` |
| `recvPF` | `parseFloat(#power-factor.value)` |
| `nomSyskV` | `getBaseValue('voltage', win)` |
| `frequency` | `parseFloat(#frequency.value)` |
| `symmetric` | `0` if system-type contains `'unsym'`, else `1` |
| `Dab`, `Dbc`, `Dca` | Phase spacing values (individual if unsym, repeated `phase-spacing` if sym) |
| `phaseSpacingM` | `getBaseValue('phase-spacing', win)` — unused by `tadee.js` when unsym |
| `scCount` | `parseInt(#bundle-count.value, 10)` |
| `scSpacingM` | `getBaseValue('sub-spacing', win)` |
| `scStrands` | `parseFloat(#strands.value)` |
| `strandDiaM` | `getBaseValue('dia-strands', win)` |
| `resSCPerKm` | `getBaseValue('resistance', win)` |
| `model` | `normaliseModel(#line-model.value)` → integer `0/1/2` |

**Step 2 — Validate**

1. Power factor range: if `recvPF > 1`, shows a warning balloon on `#power-factor`, updates `#sb-status` to `'Invalid: Power Factor'`, and returns early.
2. Missing fields: collects all `params` entries where the value is `NaN` (excluding `phaseSpacingM` when unsym, and excluding `Dab/Dbc/Dca` when sym). If any are missing, shows `showError` with a bullet-list of human-readable field names and updates `#sb-status` to `'Fill: <list>'`.

**Step 3 — Run**

Calls `computeFromParams(params)` (from `tadee.js`). On success:
- Updates the results grid via `_gridApi.setData(result.rows)`.
- Stores `_lastResults = { inputs, outputs, rows }`.
- Enables `#btn-export-output` and all `.menu-export-item` elements.
- Calls `updateDiagrams(result.inputs, result.outputs)`.
- Updates `#sb-time` with elapsed milliseconds and `#sb-status` to `'Done'`.
- Plays `media/ding.mp3`.

On exception: sets `#sb-status` to `'Compute error'` and shows `showError(e.message)`.

---

## 2. `unitInput.js`

### Role

Manages unit-conversion selects. Each `<select data-unit-for="inputId">` has `<option>` children carrying a `data-to-base` attribute whose value is the multiplication factor to convert the displayed unit into the base unit expected by `tadee.js`.

### Exports

| Export | Description |
|---|---|
| `initUnitInputs(formEl)` | Queries all `select[data-unit-for]` inside `formEl` and wires each one. |
| `getBaseValue(inputId, scope)` | Returns the numeric value of input `inputId` multiplied by the currently selected `data-to-base` factor. Returns `NaN` for empty or non-numeric inputs. `scope` defaults to `document` but `_compute` always passes `win` to scope queries to the analyser window. |

### How it works

#### `_wire(sel)`

Closes over `prevFactor` (initialised from the currently selected option at wiring time). On `change`:

```
newDisplay = (rawInputValue × prevFactor) / newFactor
```

Rounds the result with `toPrecision(10)` to suppress floating-point noise from the division. Updates `prevFactor` to the new factor.

This means the **input field always shows a value in the currently selected unit**, and the conversion happens seamlessly when the user switches units. The user never has to manually re-enter a value after changing units.

#### `_selectedFactor(sel)`

```js
parseFloat(sel.selectedOptions[0]?.dataset.toBase ?? '1')
```

Defaults to `1` if no option is selected or no `data-to-base` attribute exists.

### Example: line length

```html
<input id="line-length" type="number">
<select data-unit-for="line-length">
  <option value="km"  data-to-base="1">km</option>
  <option value="mi"  data-to-base="1.60934">mi</option>
  <option value="m"   data-to-base="0.001">m</option>
</select>
```

If the user types `100` km and then switches to miles, the input shows `62.1371…` mi. `getBaseValue('line-length', win)` always returns the value in km regardless of which unit is shown.

---

## 3. Error & feedback system

There are two distinct feedback mechanisms: **modal dialogs** for blocking messages, and **balloon tips** for inline field-level feedback.

---

### `errorDialog.js` — modal dialogs

All five dialog types share the same lazy-init pattern: DOM is created on first use and reused on subsequent calls. All dialogs are `position:fixed`, full-viewport overlay, `z-index: 99999`.

#### `showError(message)`

- Red `×` icon (32×32 `msg_error-0.png`).
- Title bar: **"Error"**.
- Single **OK** button.
- Plays `media/chord.mp3`.
- Closes on: OK click, title-bar Close, Escape key, or clicking outside the window.
- Message is auto-capitalised (first character).
- Uses `white-space: pre-wrap` so `\n` characters in error messages render as line breaks.

#### `showInfo(message)`

- Blue info icon (32×32 `msg_information-0.png`).
- Title bar: **"Display Tip"**.
- Single **OK** button.
- Plays `media/ding.mp3`.
- Message is set as `innerHTML` (supports HTML formatting).
- Closes on: OK click, title-bar Close, Escape, Enter, or clicking outside.

#### `showConfirm(message, onOk, onCancel?)`

- Blue info icon (32×32 `msg_information-0.png`).
- Title bar: **"Confirm Navigation"**.
- **OK** and **Cancel** buttons.
- Plays `media/ding.mp3`.
- `onOk` called when user clicks OK or presses Enter.
- `onCancel` called (if provided) when user clicks Cancel, title-bar Close, or Escape.
- Outside-tap dismissal is gated by a 400 ms delay after opening (`_cfmOverlayEnabled`), preventing a lingering touch from a preceding tap from accidentally cancelling the dialog.

#### `showBeforeUnload(onConfirm)`

- Question mark icon (32×32 `msg_question-0.png`).
- Title bar: **"Confirm Page Refresh"**.
- Buttons: **"Discard Changes"** (confirm) and **"Stay on Page"** (cancel).
- Plays `media/chimes.mp3`.
- Focus lands on **Stay on Page** (safe default).
- Used to intercept browser refresh/navigation when inputs are present.

#### `showWindowCloseConfirm(onOk, onCancel?)`

- Question mark icon (32×32 `msg_question-0.png`).
- Title bar: **"Confirm Close"**.
- Message: *"The Transmission Line Analyser has unsaved input data. Are you sure you want to close it? All entered values will be lost."*
- Buttons: **Close** and **Cancel**.
- Plays `media/chimes.mp3`.
- Focus lands on **Cancel** (safe default).
- **No background dimming** — the overlay is `background: transparent`. Only pointer events are blocked.
- Built using `createWindow()` (the same factory used for real app windows) rather than raw HTML.

---

### `balloon.js` — inline balloon tips

A singleton: only one balloon is visible at a time. Calling `showBalloon` while one is already shown first calls `hideBalloon` internally.

#### `showBalloon(anchorEl, options)`

```js
showBalloon(element, {
  title?   : string,            // default: type-specific (see DEFAULT_TITLES)
  message  : string,
  type?    : 'warning' | 'error' | 'info',  // default: 'warning'
  closable?: boolean,           // default: true; adds ✕ close button in header
})
```

DOM structure (appended to `document.body`):

```
div.balloon[data-type="warning|error|info"]
  div.balloon-box
    div.balloon-hdr
      span.balloon-icon-wrapper > img (16×16 icon)
      b.balloon-title
      [button.balloon-x if closable]
    p.balloon-msg
  div.balloon-tail
```

The tail is a CSS-only pointer triangle. Its position (above or below the anchor) is determined by `_reposition`:
- **Above** (default): balloon is placed `anchorTop - height - 8px - 2px` from viewport top; tail appears at the bottom of the balloon pointing down.
- **Below** (fallback when above does not fit): balloon placed at `anchorBottom + 8px + 2px`; the `.balloon--below` class is added; tail order in DOM is swapped (tail before box) so the tail appears at the top.

Horizontal alignment: the tail's left edge is pinned to `anchorLeft - 14px`, clamped to stay within the viewport.

#### `hideBalloon()`

Removes the balloon element, disconnects the `IntersectionObserver`, removes all scroll listeners, and cancels any pending `requestAnimationFrame`.

#### Scroll and visibility tracking

After placing the balloon, `_startObserver(anchorEl)`:
1. Creates an `IntersectionObserver` on the anchor element. When the anchor becomes visible the balloon fades in and is repositioned; when it leaves view the balloon fades out.
2. Walks the anchor's DOM ancestors and attaches `scroll` listeners to every element with `overflow: auto|scroll`. These listeners call `_reposition` (if still visible) or `hideBalloon` (if the anchor has been scrolled out of all scroll containers) — throttled to one `requestAnimationFrame` per scroll burst.

#### Icon mapping

| `type` | Icon file |
|---|---|
| `info` | `media/icons/msg_information-16x16.png` |
| `warning` | `media/icons/msg_warning-16x16.png` |
| `error` | `media/icons/msg_error-16x16.png` |

---

## 4. Validation flow summary

The following table shows every validation or hint in the analyser window, its trigger, the feedback mechanism used, and whether it is blocking:

| Condition | Trigger | Mechanism | Blocking? |
|---|---|---|---|
| Any numeric input empty / NaN at compute time | Compute button | `showError` (modal) | Yes — returns early |
| Power factor > 1 at compute time | Compute button | `showError` + balloon on `#power-factor` | Yes — returns early |
| Power factor > 1 while typing | `#power-factor input` | Balloon (warning) on `#power-factor` | No |
| Line length / voltage suggests different model | `#line-length`, `#voltage` input or unit change | Balloon (info) on length/voltage field | No |
| Model selector changed, value suggests mismatch | `#line-model change` | Balloon (info) on `#line-model` | No |
| Sub-conductor spacing > 1/10 phase spacing | `#sub-spacing`, `#phase-spacing`, `#dab/dbc/dca` input or unit change, `#system-type change` | Balloon (warning) on `#sub-spacing` | No |
| File is not valid JSON | File picker onload | `showError` (modal) | Yes |
| JSON file has zero recognised input fields | File picker onload | `showError` (modal) | Yes |
| Output JSON opened (may be tampered) | File → Open or Tools → Import Output JSON | `showConfirm` (modal with OK/Cancel) | Yes — proceeds only on OK |
| Batch output JSON opened | File → Open or Tools → Import Output JSON | `showConfirm` (modal with OK/Cancel) | Yes — proceeds only on OK |
| Input file passed to Tools → Import Output JSON | Tools → Import Output JSON | `showError` (modal) | Yes |
| Output file passed to Tools → Import Input JSON | Tools → Import Input JSON | `showError` (modal) | Yes |
| Print/Export attempted with no results | File → Print or Export buttons | `showError` (modal) | Yes |
| Window closed with unsaved inputs | Title-bar Close or File → Exit | `showWindowCloseConfirm` (modal, no dim) | Yes — proceeds only on Close |
| Page refresh with inputs present | `beforeunload` equivalent | `showBeforeUnload` (modal) | Yes — proceeds only on Discard |
| Compute error (exception thrown by tadee.js) | Compute button | `showError` (modal) | Yes (compute returns) |
