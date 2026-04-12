# D. Data Display Patterns

## Spreadsheet / Grid Model

**Principle:** Build tabular data displays as fully data-driven components. No hardcoded rows or headers in HTML. Expose a minimal API (`setCell`, `setData`) and let the component own its DOM.

```js
const grid = initGrid(containerEl);
grid.setData(rows);        // full refresh
grid.setCell(r, c, value); // single cell update
```

- Initialize with empty rows; populate from data separately.
- `setData` clears and rebuilds tbody — use for bulk updates (calculation results).
- `setCell` patches individual cells — use for streaming or incremental updates.

**Project example:** `initResultsGrid(el)` in `js/ui/components/grid.js`. No data in HTML. `setData` rebuilds tbody from a 2D array.

---

## Sticky Headers — Border and Z-Index Rules

**Principle:** `border-collapse: collapse` is incompatible with `position: sticky`. Collapsed borders are shared between adjacent cells and do not move with sticky elements — this causes visual gaps/bleed during scroll.

**Required pattern:**
```css
table { border-collapse: separate; border-spacing: 0; }
thead { position: sticky; top: 0; z-index: 2; }
```

- Apply borders selectively to avoid doubling: omit `border-top` and `border-left` on most cells; restore on first-row and first-column selectors.
- All header cells (corner, column headers, row headers) must have an **explicit opaque background** — transparent backgrounds cause body content to show through during scroll.

**Corner cell rule:** Apply single-axis sticky only — `position: sticky; left: 0`. The vertical stickiness is inherited from `<thead>`. Adding `top: 0` to the corner cell makes it an independent sticky element that detaches from the header row on vertical scroll.

**Project example:** `#eg-table { border-collapse: separate; border-spacing: 0 }`. Corner cell: `position: sticky; left: 0` only. `thead` provides top stickiness.

---

## Independent Column Resizing

**Principle:** User-initiated column resize must not redistribute other columns. The table must have an explicit pixel width; the resize only changes the target column and the table total — all other columns are untouched.

Steps:
1. At init, set `table.style.width = totalPx + 'px'` explicitly (sum of all column widths).
2. On drag, compute `delta = newWidth - oldWidth`.
3. Apply: `colEl.style.width = newWidth + 'px'` and `table.style.width = (tableWidth + delta) + 'px'`.
4. Horizontal scroll on the container handles tables wider than the viewport.

Without step 1, `table-layout: fixed` with no explicit width causes the browser to stretch columns proportionally to fill the container — making all columns re-distribute on every drag.

**Project example:** `attachColResize(handle, colEl, table)` in `grid.js`. `COL_RATIOS` set initial widths; after any drag, widths are independent.

---

## Row Header Column Width

**Principle:** Reserve a fixed-width column for row labels. Subtract this width before distributing remaining space to data columns via ratios.

```js
const ROW_HDR_WIDTH = 30; // px
const available = container.clientWidth - ROW_HDR_WIDTH;
const colWidths = COL_RATIOS.map(r => Math.floor(r * available));
```

**Project example:** `ROW_HDR_WIDTH = 30` in `grid.js`. Row numbers (1, 2, 3…) occupy the first column; data columns share the rest.
