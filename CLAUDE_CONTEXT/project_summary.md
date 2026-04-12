# Project Training Summary

## Design Philosophy

This UI is a faithful Windows 98 desktop application — not a styled website. Every decision (animation speed, scrolling, borders, fonts, layout conventions) is derived from how Win98 apps behaved, not from modern UX patterns. Instant, predictable, and flat. No transitions, no smooth scroll, no hover effects beyond what 98.css provides.

---

## A. UI Design Rules

- **98.css is authoritative** — never recreate Win98 styles manually; use library classes: `.window`, `.title-bar`, `.title-bar-controls`, `.window-body`, `.field-row`, `.field-row-stacked`, `.status-bar`, `.status-bar-field`
- Desktop background: `teal`
- 98.css loaded via CDN: `https://unpkg.com/98.css`
- **Bevel/inset shadow rule**: `box-shadow: inset` is a paint-layer — it overlaps the element's content area. Any scrollable container inside a beveled panel must use `margin: 2px` to reserve bevel pixels
- **Status bar** belongs to the window, not any panel — use `<div class="status-bar"><p class="status-bar-field">` from 98.css; place it as a direct child of `.window` after `window-body`
- **Scrollbar duplicate arrows**: 98.css exposes 2 up / 2 down — hide incorrect ones via `::-webkit-scrollbar-button:vertical:start:increment` etc. `{ display: none !important }`
- **Scrollbar thumb**: has no `:active`/`:hover` visual in 98.css — behaves identically at rest, hover, and drag (known limitation)
- Menu bar, toolbar, dropdowns: NOT provided by 98.css — must be custom-built with manual reuse of the 98.css shadow/border vocabulary

---

## B. Interaction Behavior

### Menu Animation
- Model: **cutout + sliding card**
  - `.dropdown` = cutout (`overflow: hidden`, `display: none` when closed, bevel shadow on this element)
  - `.dropdown-inner` = card (`translateY(-100% → 0)`, `steps(8, end)`, `animation-fill-mode: both`)
- Animation plays only on the **first open** in an interaction sequence
- **Hover-switch** (moving from one menu item to another while open): no animation, instant show
- **Rapid reopen** (time since close < `MENU_ANIMATION_DURATION_MS`): no animation
- Class convention: `.animate-open` on `.dropdown-inner` triggers animation; its absence → `animation: none`

### Splitters
- Vertical: drag adjusts `--left-width` CSS variable on `#panel-layout`
- Horizontal: drag adjusts `--bottom-height`; dragging down shrinks bottom panel (`newHeight = startHeight - delta`)
- Minimums: left panel 120px, bottom panel 40px
- Lock `document.body.style.cursor` + `userSelect = 'none'` during drag; restore on `mouseup`
- No animation; no snap; instant DOM update via style property

### Scrolling
- **All scrolling is instant** — no smooth behavior anywhere
- CSS: `html { scroll-behavior: auto; }` and `* { scroll-behavior: auto !important; }` as **two separate rules**
- Never use `scrollIntoView({ behavior: 'smooth' })` in JS

---

## C. Layout System

### Panel Structure
```
[ menu bar                          ]
[ toolbar                           ]
[ window-body (padding: 4px)        ]
  [ #panel-layout (flex column)     ]
    [ #panel-top-row (flex row)     ]
      [ #panel-left ] [.splitter-v] [ #panel-right ]
    [ .splitter-h                   ]
    [ #panel-bottom                 ]
[ .status-bar                       ]
```

- `#panel-layout`: flex column, fixed `height`, CSS vars `--left-width` / `--bottom-height`
- `#panel-top-row`: `flex: 1` — expands to fill all space above bottom panel
- `#panel-left`: `flex: 0 0 var(--left-width)`; `#panel-right`: `flex: 1`
- `#panel-bottom`: `flex: 0 0 var(--bottom-height)`

### Scroll Containment
- Beveled panels: `overflow: hidden` on outer, `margin: 2px` on inner scroll wrapper
- `overflow: auto` on inner container — never on the outer bevel element
- `margin: 2px` is pixel-reservation, not a spacing preference

### Layout Pitfall
- Never use `display: table` / `border-spacing` as a layout wrapper — leaks gaps into siblings
- Use flexbox + `gap` instead

---

## D. Grid System (Results Panel)

### Structure
```
#panel-bottom
  #results-heading   (flex: 0 0 auto, inside bevel, margin: 2px 2px 0 2px)
  #results-scroll    (flex: 1, overflow: auto, margin: 0 2px 2px 2px)
    #results-grid    (inline-block, min-width: 100%)
      #eg-table      (table-layout: fixed, border-collapse: separate, border-spacing: 0)
```

### Excel 97 Header Behavior
- `<thead>` is sticky: `position: sticky; top: 0; z-index: 2`
- Corner cell: `position: sticky; left: 0; z-index: 3` — **single-axis only** (no `top`)
- Row headers: `position: sticky; left: 0; z-index: 1`
- Column headers: `position: relative` (vertical stickiness from parent `thead`)
- **Never use dual-axis sticky on the corner** — it detaches from the header row
- All header cells: explicit `background: #d4d0c8` (opaque — never transparent)

### Border Rule
- **`border-collapse: separate; border-spacing: 0`** — never `collapse` with sticky headers
- Collapsed borders are shared between cells and don't move with sticky elements → gap/bleed-through
- With `separate`, avoid doubled borders: omit `border-top` and `border-left` on most cells, restore on first-row/first-col selectors

### Column Resizing
- Initial widths: ratio-based (`COL_RATIOS = [0.5, 0.25, 0.25]`), computed from container width at init
- Explicit `table.style.width` set at init (= `ROW_HDR_WIDTH + sum(colWidths)`) — prevents browser from re-stretching columns on every layout pass
- Drag handle (`.eg-col-resize`, `position: absolute; right: -2px`) on each `<th>`
- On drag: resize target `<col>` + adjust `table.style.width` by same delta — other columns untouched
- After user resize: column is permanently independent; no ratio recalculation
- Horizontal overflow handled by `#results-scroll` (`overflow: auto`)

### Modular Rendering
- **No hardcoded data in HTML** — grid built entirely in `grid.js`
- `initResultsGrid(el)` returns `{ setCell(row, col, value), setData(rows) }`
- `setData(rows)` clears tbody and rebuilds — for future calculation results

---

## E. Rendering System (Three.js)

- Canvas lives inside `#canvas-container` within `#panel-right` — not in a separate window
- `container: flex: 1; overflow: hidden; margin: 2px` — fills panel with bevel clearance
- `renderer.domElement.style.display = 'block'` — prevents inline-element gap below canvas
- **`renderer.setSize(w, h, false)`** — always pass `false` as third arg; `true` (default) writes inline `style.width/height` → browser reflow → canvas flash
- **Size-change guard**: `if (w !== lastW || h !== lastH)` — skip `setSize` if dimensions haven't changed; `ResizeObserver` fires on sub-pixel changes so guard is essential
- **No RAF throttle** — a continuous `animate()` loop competes for RAF slots, making `rafPending` flags ineffective; the guard is the only reliable throttle
- `ResizeObserver` must be kept — it's responsible for reacting to splitter-driven container changes
- Continuous render loop: `animate() → requestAnimationFrame(animate)` — unmodified; not event-driven

---

## F. Architecture Decisions

- **No npm, bundlers, or build tools** — CDN-only dependencies
- `type="module"` on all JS — must be served over HTTP (not `file://`)
- Three.js: importmap → `https://unpkg.com/three@0.163.0/build/three.module.js`
- 98.css: `https://unpkg.com/98.css`

### Module Structure
```
js/
  main.js         — Three.js scene init + resize logic
  menu.js         — thin entry: calls initMenuBar()
  panels.js       — thin entry: calls initPanelLayout()
  grid.js         — thin entry: calls initResultsGrid()
  ui/components/
    timingConfig.js   — MENU_ANIMATION_DURATION_MS = 100
    animationUtils.js — restartAnimation(), applyConditionalAnimation()
    menuSystem.js     — full menu state machine
    panels.js         — splitter drag logic
    grid.js           — Excel 97 grid constructor
```

- Entry points are thin wrappers — all logic in `ui/components/`
- No inline scripts or behavior logic in `index.html`

---

## G. Known Limitations

- **98.css scrollbar thumb**: no visual feedback at hover or drag — inherent library limitation
- **98.css fonts**: require internet access (loaded from unpkg CDN)
- **98.css duplicate scrollbar arrows**: must manually hide with CSS targeting specific sub-button pseudo-elements
- **Sticky + `border-collapse: collapse`**: not compatible — always use `separate` for any table with sticky rows/columns
- **RAF + ResizeObserver throttle incompatibility**: RAF flags are cleared by the render loop; size-change comparison is the only effective guard
- **`display: table` layout**: incompatible as a wrapper for mixed sibling elements — use flex
- **Menu/toolbar**: not provided by 98.css — must be custom-built
- **Context menu diagonal animation**: achievable (`translate(-100%, -100%) → translate(0,0)`) but not yet implemented
