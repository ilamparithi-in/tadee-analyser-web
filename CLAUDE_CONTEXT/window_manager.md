# Window Manager System — Win98-accurate

## Motion Rules (CRITICAL)

- **No easing anywhere** — all motion is linear or instant
- **No full-window scaling animation** — window does not grow/shrink as a whole
- **No transform-based animation** — only `left`/`top`/`width`/`height` CSS properties

## Drag Behavior — Outline + Teleport

- **During drag**: the actual window does NOT move. A `#wm-outline` div tracks the mouse.
- **On mouseup**: outline is hidden; window `left`/`top` are set instantly to the final position.
- Outline: `position: absolute; border: 2px dotted #000; pointer-events: none; z-index: 9999`
- Outline is a single shared element appended to the viewport by JS on first use.
- Drag uses `document` listeners — continues if pointer leaves the window.

## Resize Behavior — Outline + Teleport

- **During resize**: the window does NOT change size. `#wm-outline` shows proposed dimensions.
- **On mouseup**: window `left`/`top`/`width`/`height` are set instantly to the final values.
- 8 resize handles added as `.wm-resize-handle[data-dir="n|s|e|w|ne|nw|se|sw"]` children of each window.
- Handles are `position: absolute`, 4px strips on edges, 8×8px on corners.
- Minimum window size: `MIN_WIN_W = 120px`, `MIN_WIN_H = 60px` (enforced during resize track).
- Resize guards: blocked when `isMinimized`, `isMaximized`, or `animating`.

## Minimize Behavior — Content-Instant, Size+Position Animated

- **Content hides IMMEDIATELY** via `display: none` on all non-title-bar children.
- **Current size is stamped as explicit px values** (forces browser to see a "from" state).
- **`width`, `height`, `left`, `top` all animate linearly** — `${MINIMIZE_ANIM_MS}ms`, no easing.
- Size AND position both arrive at minimized slot simultaneously.
- `MINIMIZE_ANIM_MS = 150` — fast, mechanical.
- `state.animating = true` during slide; cleared in `setTimeout(MINIMIZE_ANIM_MS + 20)`.
- `win.classList.add('minimized')` for CSS ellipsis on title text.
- `.minimized .title-bar-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px; }`
- Minimized bars stack left-to-right at `y = viewport.clientHeight - TITLE_BAR_H - 2`.

## Maximize Behavior — Instant

- Instantly sets `left: 0; top: 0; width: vpW; height: vpH` — no animation.
- `vpH = viewport.clientHeight` — viewport occupies the full screen (`height: 100%`).
- Window's own status bar (inside the window) remains at the window bottom; included in `vpH`.
- `aria-label` on maximize button: `"Restore"` while maximized.

## Restore Behavior

**From maximize:** Instant — restores `left/top/width/height` from `prevState`.

**From minimize (animated):**
- Content remains hidden (`display: none`) while animation runs.
- Current minimized size stamped as explicit px ("from" state); layout flushed.
- `width`, `height`, `left`, `top` all animate linearly back to `prevState` values — exact reverse of minimize.
- Content revealed (`display: ''`) only after `setTimeout(MINIMIZE_ANIM_MS + 20)`.
- `_relayoutMinimized()` called after animation completes to repack remaining slots.
- `state.animating = true` during animation; blocks additional actions.

## Status Bar Rule

- **Status bar belongs to each window that has one — NOT the viewport.**
- Status bar is inside the `.window` element, after `.window-body`, as a sibling.
- It moves with the window on drag; it fits inside the maximized window frame.
- `body` is a simple `height: 100vh` — no flex-column needed (no global status bar).
- `#viewport` is `position: relative; width: 100%; height: 100%; overflow: hidden`.

## Viewport Container

- `body`: `margin: 0; padding: 0; overflow: hidden; height: 100vh`
- `#viewport`: `position: relative; width: 100%; height: 100%; overflow: hidden`
- `#viewport > .window`: `position: absolute; visibility: hidden; box-sizing: border-box`
  - No `overflow: hidden` on windows — content is hidden via `display: none` in JS, not clipping
  - `visibility: hidden` → JS sets `visibility: visible` after positioning (prevents flash at 0,0)

## Window Capability Flags

Stored as `data-*` attributes; read by `_register` at windowManager init time.

| Attribute | Default | Effect |
|---|---|---|
| `data-resizable` | `true` | If `"false"`, no resize handles added |
| `data-maximizable` | `true` | If `"false"`, maximize button hidden; logic disabled |
| `data-minimizable` | `true` | If `"false"`, minimize button hidden; logic disabled |
| `data-closable` | `true` | If `"false"`, close button hidden; logic disabled |

Close (when enabled) removes the window element from the DOM and deletes it from the registry, then calls `_relayoutMinimized`.

For HTML-authored windows (static in `index.html`), flags are applied by hiding the rendered button. For `createWindow`-built windows, unflagged buttons are simply not rendered.

## State Per Window

```js
{
  x, y,           // current position (px)
  isMinimized,    // boolean
  isMaximized,    // boolean
  animating,      // boolean — true during animate; blocks other actions
  prevState,      // { x, y, width, height, isMaximized } — numeric values
  resizable,      // boolean — from data-resizable
  maximizable,    // boolean — from data-maximizable
  minimizable,    // boolean — from data-minimizable
  closable,       // boolean — from data-closable
  maxBtn,         // reference to maximize button element (null if !maximizable)
}
```

## Z-Index Focus Rules

- Global `zTop` starts at 100 (above 98.css library values).
- Any `mousedown` on a window calls `_focus(win)` → `win.style.zIndex = ++zTop`.
- Title-bar-controls buttons call `e.stopPropagation()` to avoid double-firing focus.

## Files

| File | Purpose |
|---|---|
| `js/ui/components/windowManager.js` | All window management logic — exports `initWindowManager`, `addWindow` |
| `js/windowManager.js` | Thin entry point — calls `initWindowManager` on static windows |
| `js/ui/components/createWindow.js` | Window factory — exports `createWindow`, `openWindow` |
| `js/ui/windows/notepad.js` | Notepad window builder — `initNotepadWindow(viewport)` |
| `js/notepad.js` | Thin entry point for Notepad |

## `addWindow` API

```js
import { addWindow } from './ui/components/windowManager.js';
addWindow(winElement, viewportEl); // appends to viewport + registers with cascaded initial position
```

Cascade counter (`_cascade`) is module-level and shared between `initWindowManager` and `addWindow`, so dynamically-added windows cascade correctly after static windows.
