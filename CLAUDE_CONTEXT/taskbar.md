# Taskbar & Start Menu

## Phase

This is the **desktop-foundation** branch — the start of the actual project implementation.
The `main` branch / training playground code must NOT be reused directly.

---

## Structure Rule: Taskbar is OS-Level UI

- The taskbar lives **outside** `#desktop` — it is not an application window
- `#desktop` is for application windows only
- `body` uses `display: flex; flex-direction: column`:
  - `#desktop` → `flex: 1 1 auto` — all space above taskbar
  - `#taskbar` → `flex: 0 0 auto` — fixed height, always at bottom

```
body (flex column, height: 100vh)
├── #desktop     (flex: 1 — application windows appended here)
└── #taskbar     (flex: 0 — OS chrome, always at bottom)
    ├── #start-btn
    ├── #task-area   (flex: 1 — future window buttons)
    ├── #taskbar-clock
    └── #start-menu  (position: absolute; bottom: 100%; left: 0)
```

---

## Taskbar CSS

- `height: 28px`, `background: silver`
- Raised bevel via `box-shadow: inset`
- `position: relative` — required to anchor `#start-menu` with `bottom: 100%`

## Start Menu

- `position: absolute; bottom: 100%; left: 0` — opens directly above taskbar, left-aligned
- `display: none` by default; `.open` class sets `display: block` — **no animation**
- `z-index: 9999` — above all desktop windows

## Start Menu Interaction Rules (Win98)

- Click Start → open (if closed) or close (if open) — **instant toggle, no animation**
- Click anywhere outside start menu → close
- Click Start again while open → close
- `e.stopPropagation()` on start button click prevents the document `click` handler from immediately closing the menu that was just opened

---

## Clock

- Updated every second via `setInterval(1000)`
- Format: `HH:MM` (24-hour, zero-padded)
- Styled with inset (sunken) `box-shadow` — matches Win98 system tray

---

## Font Rule (CRITICAL)

**Font must be defined globally, never per-component.**

- Set `body { font-family: Arial; font-size: 12px; }` explicitly in global CSS — matches 98.css; guarantees the font is present even before the CDN stylesheet loads
- Add `*, *::before, *::after { font-family: inherit; font-size: inherit; }` to force inheritance into browser UA-overridden elements (`button`, `input`, `select`, etc.)
- Never set `font-family` on individual components — let body → inheritance do the work
- Without the explicit `body` declaration, if 98.css CDN is slow the font falls back to browser default before the stylesheet arrives

## Clock Rule

**Clock must size relative to taskbar height, not text content.**

- Use `align-self: stretch` on `#taskbar-clock` so it fills the full taskbar height
- Use `display: flex; align-items: center` for vertical centering of the text
- Use `padding: 0 6px` (horizontal only) — vertical space comes from `align-self: stretch`
- The bevel (`box-shadow: inset`) scales with the element height, not content

## Start Button Rule

**Start button supports icon + text and must be content-sized, not fixed width.**

- `min-width: unset` — overrides 98.css default button min-width (75px)
- `display: inline-flex; align-items: center; gap: 4px` — icon and text in a row
- Icon: `<span class="start-icon" aria-hidden="true">` — CSS-only Win98 4-color logo
- Icon CSS uses 4 `linear-gradient` layers as `background` positioned in a 2×2 grid (red, green, blue, yellow)

## Menu Highlight Rule (MANDATORY PATTERN)

**Highlight must be applied to inner wrapper, never overlap bevel borders.**

Structure:
```html
<li role="menuitem">
  <span class="menu-item-inner">Item text</span>
</li>
```

Rules:
- Outer `li`: `padding: 0` — no padding or background on outer element
- Inner `.menu-item-inner`: `display: block; padding: 4px 24px 4px 12px` — carries all spacing
- Hover: `li:hover .menu-item-inner { background: navy; color: #fff }` — highlight on inner only
- The container bevel (`box-shadow: inset`) lives on the `#start-menu` wrapper — never touched by hover

**Apply this pattern to ALL menus in this project** — not just the start menu.

| File | Purpose |
|---|---|
| `index.html` | Desktop layout: `#desktop` + `#taskbar` + `#start-menu` structure |
| `js/ui/components/taskbar.js` | Clock, start menu toggle, outside-click detection |
