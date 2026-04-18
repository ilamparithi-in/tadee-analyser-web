# Menu Bar Action Plan

## Status

| Phase | Menu | Status |
|-------|------|--------|
| 1 | File (New, Open, Save, Print, Exit) | ✅ Done |
| 1b | File → Export result as… (submenu: PDF, JSON, TXT, MD) | ✅ Done |
| 2 | Edit → Preferences | ⏳ Pending |
| 3 | View → Canvas pane submenu + Results rename | ⏳ Pending |
| 4 | Tools → Import Input JSON, Import Output JSON, Batch Mode | ⏳ Pending |
| 5 | Help → Help Topics, About… | ⏳ Pending |

---

## Completed Work (Phase 1 + 1b)

### `index.html` — File menu
- `menu-file-new` → clear all inputs with confirmation
- `menu-file-open` → detects file type and routes
- `menu-file-save` → save input JSON
- `menu-export-trigger` → `.has-submenu` flyout trigger (Export result as…)
- `menu-file-print` → print report
- `menu-file-exit` → close with guard
- Removed old `menu-save-as-pdf`
- `#submenu-export` panel (outside overflow-clipped dropdown, position:fixed) with `.submenu-inner` card:
  - `menu-export-pdf` (disabled until Compute)
  - `menu-export-json` (disabled until Compute)
  - `menu-export-txt` (disabled until Compute)
  - `menu-export-md` (disabled until Compute)

### `css/main.css`
- `.has-submenu` — right-padded, `►` arrow via `::after`
- `.submenu-panel` / `.submenu-inner` — `overflow:hidden` clip + Win98-styled card
- `@keyframes slide-right` — `translateX(-100%) → 0`, `steps(8, end)`, 100ms (matches dropdown)

### `js/ui/windows/analyser.js`
- Imports: added `showConfirm`, `openBatchWindow`, `loadAndRunBatchEntries`
- `_clearInputs(win)` — resets all inputs + selects to defaults
- `_isBatchOutputArray(data)` — detects `[{ inputs, outputs }, …]`
- `_isBatchJson(data)` — excludes batch output arrays
- `_isOutputJson(data)` — detects `{ inputs, outputs }` (single result)
- `_openOutputJson(win, data)` — authenticity warning → apply inputs + recompute (translates numeric `symmetric`/`model` back to select strings)
- `_openBatchOutputJson(viewport, data)` — authenticity warning → `loadAndRunBatchEntries`
- `_initFileMenu(win, viewport)` — wires all File menu items + Export submenu hover logic
- `_exportTxt(win)` / `_exportMd(win)` — new export formats
- `_timestamp()` — shared helper (deduplicates inline stamp in `_saveInputs` / `_exportOutput`)
- `_lastResults` now stores `rows` alongside `inputs`/`outputs`
- `_compute` enables `.menu-export-item` elements (replaces dead `#menu-save-as-pdf` ref)

### `js/ui/windows/batchWindow.js`
- `openBatchWindow(viewport)` — exported singleton opener
- `loadAndRunBatchEntries(viewport, entries)` — opens/raises window, injects `_parsedEntries`, switches UI to JSON mode, runs batch immediately

---

## Phase 2 — Edit menu

**`index.html`:**
- Replace all Edit dropdown items with a single: `<button class="dropdown-item" id="menu-preferences">Preferences</button>`

**New file `js/ui/windows/preferencesWindow.js`:**
- `openPreferencesWindow(viewport)` — singleton via `createWindow` / `addWindow`
- Placeholder content; ~400×300; non-resizable; no maximize

**`js/ui/windows/analyser.js`:**
- Import `openPreferencesWindow`; wire `#menu-preferences` → `openPreferencesWindow(viewport)`

---

## Phase 3 — View menu

**`index.html`:**
- Keep `view-pane-input` as-is
- Convert `view-pane-canvas` into a `.has-submenu` parent; its `.submenu` contains:
  - `view-canvas-whole` (check)
  - `<hr>`
  - `view-canvas-arrangement` (check)
  - `view-canvas-phasor` (check)
  - `view-canvas-circuit` (check)
- Rename `view-pane-output` label → "Results"

**`js/ui/windows/analyser.js` — `_initViewMenu`:**
- "Whole pane" = all three sub-items visible; toggling sets all three
- Individual diagram items → show/hide sub-containers in canvas panel
- "Results" → existing `view-pane-output` behaviour

---

## Phase 4 — Tools menu

**`index.html`:**
- Remove `Options…` and `Preferences…`
- Add:
  - `menu-import-input` — Import Input JSON
  - `menu-import-output` — Import Output JSON (always enabled; shows authenticity warning)
  - `<hr>`
  - Keep `menu-batch-mode` — Batch Mode…

**`js/ui/windows/analyser.js`:**
- `menu-import-input` → shared `_openInputFile()` helper (same as Open for input JSON)
- `menu-import-output` → show warning → file picker → `_openOutputJson` or `_openBatchOutputJson`

---

## Phase 5 — Help menu

**`index.html`:**
- `menu-help-topics`, `menu-about`
- Rename "About TADEE Analyser" → "About…"

**New `js/ui/windows/helpWindow.js`:**
- Singleton; ~640×480; scrollable help text + link to `docs/calculations.html`

**New `js/ui/windows/aboutWindow.js`:**
- Singleton; ~320×200; non-resizable/no-maximize; OK button closes

**`js/ui/windows/analyser.js`:**
- Import both; wire `menu-help-topics` → `openHelpWindow`; `menu-about` → `openAboutWindow`

---

## Key Patterns / Conventions

- Submenus: `overflow:hidden` `.submenu-panel` (position:fixed) + `.submenu-inner` sliding card (`@keyframes slide-right`, `steps(8, end)`, 100ms)
- Submenu hover: `mouseenter` shows, `mouseleave` schedules 120ms hide, sibling hover instantly hides
- Singleton windows: module-level `_win` ref; `_win._closeGuard` clears ref on close
- `openWindow(opts, viewport)` from `createWindow.js` for dynamic windows
- All exports from new window modules: `openXxxWindow(viewport)`
- Always `showConfirm` before destructive/questionable actions (close, clear, load output)
- `_timestamp()` for all download filenames
