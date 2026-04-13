# CLAUDE.md — Project Memory

This file is append-only. Every response must add relevant rules, decisions, and findings.

---

## UI Rules

- Use **98.css** for all UI components — do not recreate Win98 styles manually
- Use standard 98.css classes: `.window`, `.title-bar`, `.title-bar-text`, `.title-bar-controls`, `.window-body`, `.field-row`, etc.
- Background color for the "desktop" is `teal` to mimic Windows 98

## Behavioral Constraints

- **No smooth scrolling anywhere** — all scrolling must be instant (Windows 98 behavior)
- Always include in CSS:
  ```css
  html { scroll-behavior: auto; }
  * { scroll-behavior: auto !important; }
  ```
- Never use `scrollIntoView({ behavior: "smooth" })` or `scrollTo({ behavior: "smooth" })` in JS

## Known Library Limitations

- **98.css scrollbar thumb has no active/drag visual** — no `::-webkit-scrollbar-thumb:active` or `:hover` rule exists in the library; the thumb looks identical at rest, hover, and while dragging
- 98.css fonts are loaded from unpkg CDN (woff/woff2) — requires internet access

## Scrollbar Fixes (applied globally)

- Hide duplicate scrollbar arrows (98.css shows 2 up / 2 down by default):
  ```css
  ::-webkit-scrollbar-button:vertical:start:increment,
  ::-webkit-scrollbar-button:vertical:end:decrement,
  ::-webkit-scrollbar-button:horizontal:start:increment,
  ::-webkit-scrollbar-button:horizontal:end:decrement { display: none !important; }
  ```

## Dependency Rules

- **No npm, bundlers, or build tools**
- All dependencies loaded via CDN only
- Three.js loaded via importmap pointing to unpkg:
  ```json
  { "imports": { "three": "https://unpkg.com/three@0.163.0/build/three.module.js" } }
  ```
- JS files use `type="module"`

## Architecture

- Single HTML entry point: `index.html`
- JS lives in `/js/` directory
- No framework — vanilla HTML/CSS/JS only
- Must be served over HTTP (not `file://`) due to ES modules

## Window Layout Rules (status bar / flex)

Any `.window` managed by the window manager **must** use `display: flex; flex-direction: column` so that a status bar (or any footer element) anchors to the bottom when the window is resized to an explicit height. Apply this globally via `#viewport > .window`.

- Set `.window-body { flex: 1 1 auto; overflow: hidden; min-height: 0; }` — fills all space between title-bar+toolbars and status-bar; `auto` basis preserves content-sized windows while still growing in explicitly-height windows
- Any fixed-height inner layout (e.g. `#panel-layout { height: 460px }`) must be changed to `height: 100%` so it fills the now-growing `.window-body`

Without flex, `.window-body` stays content-sized and the status-bar floats in the middle of a tall resized window.

## Corrections Made

- Removed duplicate scrollbar arrow buttons that 98.css exposes by default
- Split `html, * { scroll-behavior: auto !important; }` into two rules to properly target the `html` element explicitly
- Made `#viewport > .window` flex-column and `.window-body` flex-grow so status bars anchor correctly after resize

## Generalized Rules

Project-specific rules have been extracted into reusable principles in:

`CLAUDE_CONTEXT/generalized/` — 7 files (A–G) covering UI design, interaction patterns, layout, data display, rendering integration, architecture, and debugging. Each rule includes a general principle + project example. Applicable to signal processing UIs, engineering tools, and visualization dashboards.

---

## Phase: Desktop Foundation (branch: feature/desktop-foundation)

### Taskbar

- Taskbar is OS-level UI — lives **outside** `#viewport` in HTML
- `#viewport` height is `calc(100vh - 28px)` to leave room for the taskbar
- Taskbar: `position: fixed; bottom: 0; height: 28px`
- Start button on left, `#task-area` (flex: 1) in center, clock on right

### Start Menu

- `position: fixed; bottom: 28px; left: 0` — anchored just above taskbar
- Toggle: `hidden` attribute added/removed; `animate-open` class triggers animation
- Outside-click closes menu via `document.addEventListener('click')` — `e.stopPropagation()` on menu prevents self-close
- Clicking a menu item closes the menu immediately (no animation on close)
- `:active` style is suppressed on `.start-menu-item` — no press animation

### Start Menu Animation Rule

- **Use the cutout+card pattern for popup menus anchored to OS chrome** — NOT `clip-path`, NOT bare `translateY`
- `translateY` on the outer element bleeds over adjacent OS elements (e.g. taskbar)
- `clip-path` reveals in place — text stays stationary while the clip region changes; looks wrong
- Correct approach: outer container = transparent `overflow: hidden` clipper (no background/bevel); inner element = the actual styled box (background + bevel + content) that animates with `translateY(100%) → translateY(0)`
- The clipper's bottom edge sits at the taskbar; `overflow: hidden` prevents any translateY bleed below it
- Bottom-to-top reveal (menu grows upward from taskbar):
  ```css
  @keyframes start-menu-slide {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
  #start-menu.animate-open #start-menu-inner {
    animation: start-menu-slide 100ms steps(8, end) both;
  }
  ```
- `steps(8, end)` for discrete Win98-style row reveal
- Force animation restart with `void el.offsetWidth` reflow before re-adding class to outer element

### CSS File

- All desktop-level CSS lives in `css/desktop.css`, loaded after `98.css`
