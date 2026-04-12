# Window Manager System

## Animation Model — Bounding Box Interpolation

- **Never animate only the title bar** — the entire window element (position + size) is animated as one rectangle.
- **Never hide content during animation** — `overflow: hidden` on the window (set in CSS) clips content naturally as dimensions change.
- **Pattern:**
  1. Read current rendered box: `state.x/y` + `win.offsetWidth/offsetHeight`
  2. Set those as explicit inline pixel values (ensures CSS has a numeric "from" state)
  3. `void win.offsetWidth` — force layout flush so browser registers "from" before transition
  4. Set `win.style.transition` with all four properties (`left, top, width, height`)
  5. Write final pixel values → browser transitions
  6. `setTimeout(ANIM_DURATION + 20, clearTransition)` → remove transition after completion
- **Duration:** `ANIM_DURATION = 150ms`, `linear` — fast and mechanical (Win98 feel)
- **Guard:** `state.animating = true` during transition; button/drag handlers check this and return early

## Viewport Container

- All top-level `.window` elements live inside `<div id="viewport">` inside `<body>`
- `body`: `display: flex; flex-direction: column; margin: 0; padding: 0; overflow: hidden; height: 100vh`
- `#viewport`: `position: relative; width: 100%; flex: 1; overflow: hidden` — `flex: 1` makes it fill all space above the status bar
- `#viewport > .window`: `position: absolute; visibility: hidden; overflow: hidden` — JS sets `visibility: visible` after positioning; `overflow: hidden` clips content for animation

## Status Bar Placement Rule

- **Status bar belongs to the page layout, NOT any window**
- Place as a sibling AFTER `</div><!-- /#viewport -->`, direct child of `<body>`
- `body` is `display: flex; flex-direction: column` → status bar is `flex: 0 0 auto` at the bottom
- `#viewport` is `flex: 1` → its `clientHeight` already excludes the status bar height
- Maximized window uses `viewport.clientHeight` for height → naturally never covers the status bar

## Minimized Title Ellipsis Rule

- When a window is minimized, its title bar text must not wrap. CSS via `.minimized` class:
  ```css
  .minimized .title-bar-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px; }
  ```
- `win.classList.add('minimized')` on minimize; `win.classList.remove('minimized')` on restore
- `max-width: 100px` leaves room for title-bar-controls buttons within `MINIMIZED_WIDTH = 160px`

## Initialization

- `initWindowManager(viewportEl)` in `js/ui/components/windowManager.js`
- Only registers windows that have a `.title-bar-controls` element
- Nested windows excluded via `:scope > .window` selector
- At registration: `win.style.width = win.offsetWidth + 'px'` — ensures numeric width for animation
- Entry point: `js/windowManager.js` (thin) → imports and calls `initWindowManager`

## State Per Window

```js
{
  x, y,           // current position (px)
  isMinimized,    // boolean
  isMaximized,    // boolean
  animating,      // boolean — blocks new actions during transition
  prevState,      // { x, y, width, height, isMaximized } — stored as numbers
  maxBtn,         // reference to the maximize button element
}
```

- `prevState` stores numeric `width`/`height` (from `offsetWidth`/`offsetHeight`) — not style strings
- `state.animating` prevents rapid double-clicks from corrupting transition state

## Z-Index (Focus) Rules

- Global counter `zTop` starts at 100
- `_focus(win)` increments and assigns `zTop` to `win.style.zIndex`
- Any `mousedown` on a window fires `_focus`
- Title-bar-controls buttons call `e.stopPropagation()` to prevent conflicts

## Drag Rules

- Drag starts on `mousedown` on the title bar (excluding `.title-bar-controls`)
- Disabled when `isMaximized` or `animating`
- Replaced by restore when `isMinimized`
- Uses `document` event listeners — drag continues if pointer leaves the window

## Minimize Behavior (No Taskbar)

- Minimized windows collapse to a horizontal bar at the bottom of `#viewport`
- On minimize: animate entire window to `{ left: slotX, top: vpH - 26 - 2, width: 160, height: 26 }`
- Content is clipped by `overflow: hidden` as window shrinks — no `display: none` on children
- After animation: `win.style.height = TITLE_BAR_H + 'px'` locks it to title-bar only
- Bars stack left-to-right: `x = count × (MINIMIZED_WIDTH + MINIMIZED_GAP)`
- Restore re-packs remaining minimized bars after animation completes

## Maximize Behavior

- Animate to `{ 0, 0, viewport.clientWidth, viewport.clientHeight }`
- `viewport.clientHeight` (flex:1) already excludes status bar — maximized window never covers it
- `aria-label` toggles: `"Maximize"` ↔ `"Restore"`

## Files

| File | Purpose |
|---|---|
| `js/ui/components/windowManager.js` | All window management logic |
| `js/windowManager.js` | Thin entry point |
