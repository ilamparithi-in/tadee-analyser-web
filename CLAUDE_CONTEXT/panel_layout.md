# Panel Layout

## Structure

```
[ menu bar                          ]
[ toolbar                           ]
[ window-body                       ]
  [ Input Panel ] [ Canvas Area     ]
  [ Results (full width)            ]
```

## Inset Shadow Overlap Rule (IMPORTANT)

**Problem:** `box-shadow: inset` is a paint effect — it is drawn over the element's content area at the edges. `.panel-content` filling 100% of the panel shares pixels with the bevel, causing visible overlap during scroll.

**Fix:** `margin: 2px` on `.panel-content` — reserves the 2px bevel zone so content and scrollbar never occupy the shadow pixels.

```css
.panel-content {
  flex: 1; overflow: auto; padding: 6px;
  margin: 2px;  /* ← keeps content clear of inset bevel */
}
```

**Rule:** Any scrollable inner container inside a Win98 beveled panel must have `margin: 2px` (matching inset shadow thickness). This is NOT an overflow problem — it is a pixel-reservation problem.

## Results Panel — Excel 97 Grid (updated)

Structure:
```
#panel-bottom  (flex column, overflow: hidden, bevel shadow)
  #results-heading  (flex: 0 0 auto, heading label, margin: 2px 2px 0 2px)
  #results-scroll   (flex: 1, overflow: auto, margin: 0 2px 2px 2px)
    #results-grid   (inline-block, min-width: 100%)
      #eg-table     (table-layout: fixed, border-collapse: collapse)
```

- Grid in `js/ui/components/grid.js`; loaded via thin entry `js/grid.js`
- **NO hardcoded data in HTML** — grid built entirely in JS
- Column widths computed from `#results-scroll.clientWidth` on init using `COL_RATIOS = [0.5, 0.25, 0.25]`
- `ROW_HDR_WIDTH = 30px` subtracted from available width before ratio distribution
- API: `initResultsGrid(el)` returns `{ setCell(row, col, value), setData(rows) }`
- `setData(rows)` clears tbody and rebuilds rows — use for calculation results
- Column resize: `.eg-col-resize` drag handle on right of each `<th>` → updates `<col>` px width
- `buildRow(rowIdx, cells)` helper keeps tbody construction DRY

## Grid Column Resize — Independence Rule

- **Set explicit `table.style.width` in px at init** (= `ROW_HDR_WIDTH + sum(colWidths)`). Without this, `table-layout: fixed` + no explicit width causes browsers to stretch columns proportionally to fill their container — columns appear to rescale on every layout pass.
- **On drag, update `table.style.width` by the same delta** as the column resize. This means: resize col A wider by 20px → table gets 20px wider. Other columns are untouched.
- Once a column has been dragged, its `<col style="width: Npx">` is independent. No global recalculation, no ratio restoration.
- Horizontal scroll in `#results-scroll` (`overflow: auto`) handles tables wider than the container.
- Pass `table` reference into `attachColResize(handle, colEl, table)` — required to update total width.

## Grid Corner Cell — Sticky Positioning Rule

- **Corner cell must use single-axis sticky only**: `position: sticky; left: 0` (no `top`)
- **Vertical stickiness for the entire header row is handled by `<thead>` itself**: `#eg-table thead { position: sticky; top: 0; z-index: 2 }`
- **Never apply dual-axis sticky (`top: 0; left: 0`) to the corner cell** — causes it to appear independent/floating from column headers
- Column header cells (`.eg-col-hdr`): `position: relative` (needed for `position: absolute` resize handles); vertical stickiness comes from parent `<thead>` being sticky
- Row header cells (`.eg-row-hdr`): `position: sticky; left: 0; z-index: 1`
- Z-index hierarchy: `thead` (2) > `.eg-corner` inside thead (3 local, above col-hdrs) > `.eg-row-hdr` (1)
- **Bug pattern to avoid**: combining column headers in a shared selector with `.eg-corner` for sticky-top, then overriding `.eg-col-hdr { position: relative }` — this strips sticky from col-hdrs leaving only the corner sticky, making it look orphaned

## Grid Header Opacity and Border Rule

- **NEVER use `border-collapse: collapse` on a table with sticky headers** — collapsed borders are shared between cells and don't move with sticky elements, causing border "bleed-through" gaps that look like transparency
- Always use `border-collapse: separate; border-spacing: 0` for tables with sticky rows/columns
- With `border-separate`, each cell owns its own borders — apply them selectively to avoid doubling:
  - Omit `border-top` and `border-left` on most cells, then restore on edges (first row, first col)
  - Pattern: `border: 1px solid X; border-top: none; border-left: none` + restore on specific selectors
- Header cells (`.eg-corner`, `.eg-col-hdr`, `.eg-row-hdr`) must explicitly set `background: #d4d0c8` (opaque — never transparent)
- `z-index` stack: `thead` (2) > `.eg-corner` (3) > `.eg-row-hdr` (1) — ensures header row paints above body cells

## Canvas Resize Rule

- **Always call `renderer.setSize(w, h, false)`** — the third arg `updateStyle: false` prevents Three.js from writing `canvas.style.width/height` inline, which would cause browser reflow and flash on every call
- **Guard with a size-change check** — compare `w !== lastW || h !== lastH` before calling `setSize`; ResizeObserver fires on every layout change (including sub-pixel), so skip when nothing meaningful changed
- **Do NOT use RAF throttling** — a continuous `animate()` loop also uses RAF; both compete for the same queue, making `rafPending` reset every frame regardless — the guard is the only effective throttle
- Keep `ResizeObserver` — it must remain to handle panel splitter resizes; the size-change guard makes it safe
- Pattern:
  ```js
  let lastW = 0, lastH = 0;
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (w > 0 && h > 0 && (w !== lastW || h !== lastH)) {
      lastW = w; lastH = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }
  new ResizeObserver(resize).observe(container);
  ```

## Status Bar Rule (updated)

- **Status bar belongs to the window, not to any panel**
- Uses **98.css built-in classes**: `<div class="status-bar"><p class="status-bar-field" id="app-status-bar">...</p></div>`
- Do NOT use custom `#app-status-bar` CSS rule — `.status-bar-field` from 98.css gives correct sunken inset look
- Custom raised `box-shadow` was incorrect; 98.css `.status-bar-field` uses `inset -1px -1px #dfdfdf, inset 1px 1px grey`

## Canvas in Geometry Panel

- **`#canvas-container` lives inside `#panel-right`** — NOT in a separate window
- No `.panel-content` wrapper in `#panel-right` — canvas-container fills directly with `flex: 1; margin: 2px; overflow: hidden`
- `main.js` uses `ResizeObserver` on `#canvas-container` to call `renderer.setSize(w, h)` and update `camera.aspect`
- `renderer.domElement.style.display = 'block'` prevents inline gap under canvas
- Window 4 (standalone Canvas demo window) removed — canvas now inside the app panel

 into four 98.css `<fieldset>` blocks:

| Fieldset | Fields |
|---|---|
| Electrical Parameters | Line length, Load (MW), Power factor, Voltage (kV), Frequency, System type |
| Geometry Parameters | Phase spacing, Bundle count, Sub-conductor spacing |
| Conductor Parameters | Strands, Resistance (Ω/km) |
| Model Selection | Line model (Short / Nominal π / Distributed) |

- All fields use `.field-row-stacked` (label above input, 98.css class)
- `select` elements used for System type, Bundle count, Line model
- No validation logic — structure only

## 98.css Form Limitations

- `.field-row-stacked` provides label-above-input stacking; no built-in label-left alignment in 98.css
- `fieldset` uses a custom border-image in 98.css — renders correctly without custom overrides
- `input[type=number]` styled identically to text inputs by 98.css — no spinner styling differences
- Left panel needs `overflow-y: auto` when form content exceeds panel height


- Vertical splitter (`#splitter-v`, `.splitter-v`): adjusts `--left-width` CSS variable on `#panel-layout`
- Horizontal splitter (`#splitter-h`, `.splitter-h`): adjusts `--bottom-height` CSS variable
- Drag down on horizontal splitter → bottom panel shrinks (delta = clientY - startY, newHeight = start - delta)
- Minimum sizes: left panel 120px, bottom panel 40px
- `document.body.style.cursor` overridden during drag to prevent cursor flicker
- `document.body.style.userSelect = 'none'` prevents text selection during drag; restored on mouseup

## Layout method (updated)

- `#panel-layout`: `display: flex; flex-direction: column; height: 284px`
  - `#panel-top-row`: `flex: 1; display: flex` — top section expands to fill all space above bottom panel
  - splitter-h: `flex: 0 0 4px`
  - `#panel-bottom`: `flex: 0 0 var(--bottom-height)` — fixed height, CSS var controlled by JS
- Left panel: `flex: 0 0 var(--left-width)`, right panel: `flex: 1`
- Splitters styled with `box-shadow: inset` for Win98 raised-bar appearance


**Problem:** `display: table` with `border-spacing` added internal gaps that the sibling bottom panel couldn't match, causing misalignment.

**Solution:** replaced with flexbox:

```
outer wrapper: display: flex; flex-direction: column; gap: 4px;
  top row:     display: flex; gap: 4px;
    left:      flex: 0 0 220px;
    right:     flex: 1;
  bottom:      (block child of outer — gets full width automatically)
```

- `gap` on flex containers replaces `border-spacing` — gap only applies between flex children, not at outer edges, so bottom panel aligns exactly with the top row
- `flex: 1` on right panel fills all remaining space after fixed left panel
- Bottom panel is a direct block child of the outer flex-column → inherits full container width with no extra CSS

**Pitfall to avoid:** `display: table` `border-spacing` leaks into sibling elements — never use it as a layout wrapper when sibling elements must align with it. Use flex `gap` instead.

