# C. Layout System Patterns

## Panel-Based Layout with Draggable Splitters

**Principle:** Divide application area into named regions (panels). Use CSS variables to store each panel's runtime size. Splitter drag updates the variable; every panel reads it.

```css
#panel-layout {
  --left-width: 280px;
  --bottom-height: 200px;
}
#panel-left  { width: var(--left-width); }
#panel-right { flex: 1; }
#panel-bottom { height: var(--bottom-height); }
```

- Update only the CSS variable on drag — do not update N elements individually.
- Flexbox + CSS variable achieve the complete resize with a single JS write per mouse event.
- Store panel sizes in CSS variables, not JS state, so CSS-computed layouts (min-width, max-height, etc.) continue to apply.

**Project example:** `panels.js` updates `#panel-layout` CSS vars `--left-width` / `--bottom-height` on `mousemove`. All panel widths derive from these two variables.

---

## Scroll Containment Pattern

**Principle:** Use a two-layer structure for scrollable regions: an outer frame (no scroll, sized by layout) + an inner scroll container (overflow: auto/scroll, flex: 1).

```
.panel-outer   { display: flex; flex-direction: column; overflow: hidden; }
  .panel-inner { flex: 1; overflow: auto; margin: 2px; }
```

- `overflow: hidden` on the outer prevents the layout frame from growing to fit content.
- `flex: 1` on the inner expands it to fill all remaining space.
- `margin` on the inner reserves the forbidden pixel region (see A. UI Design Principles).

**Project example:** `#panel-bottom` is `overflow: hidden`. `#results-scroll` inside it is `overflow: auto; flex: 1`. The grid table grows arbitrarily; the panel frame does not.

---

## Width Propagation Rules

**Principle:** Sizes must flow from the layout frame into any contained component via measurement at runtime, not hardcoded values. Compute sizes after layout is established.

- Use `containerEl.clientWidth` and `containerEl.clientHeight` (not `offsetWidth`, not `getBoundingClientRect()` unless you need viewport-relative coords).
- Measure after the element is visible in the DOM — sizes are zero before first paint.
- Use `ResizeObserver` to re-measure when the container changes size.

**Project example:** `initResultsGrid(el)` measures `#results-scroll.clientWidth` at init to distribute column widths via `COL_RATIOS`. `main.js` uses `ResizeObserver` on `#canvas-container` to resize the Three.js renderer.

---

## Status/Context Bar Placement

**Principle:** Application-level status belongs to the window/app shell, not to any content panel. Panel-level components should expose a callback or shared API to update it.

- Status bar is a single element per window, outside all panels.
- Panels write to it via a reference or API (`updateStatus(msg)`), never by creating their own status indicators.

**Project example:** `<div class="status-bar">` is a direct child of `.window-body`, placed after panel layout. Panels call `document.getElementById('app-status-bar').textContent = '...'`.
