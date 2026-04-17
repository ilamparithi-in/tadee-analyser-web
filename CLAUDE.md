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

## HiDPI Scaling

- Auto-scale via inline sync script in `<head>` — runs before render to avoid flash
- Two-branch formula based on `devicePixelRatio`:
  - **DPR > 1** (browser/OS already scaling): zoom = 1, no change
  - **DPR ≤ 1** (raw HiDPI, e.g. Linux 100% scaling): `zoom = max(1, screen.width / 1463)`
    - Reference 1463px = 2560 ÷ 1.75 (the target display at the desired zoom)
    - 2560px screen → 1.75×, 1920px screen → ~1.31×, ≤1463px → 1.0× (no scale)
- DPR changes (moving between displays, browser zoom change) are watched via `matchMedia('(resolution: Xdppx)')` with `{ once: true }` + re-register pattern
- Applied as `document.documentElement.style.zoom` (CSS `zoom` on `html`)

## Corrections Made

- Removed duplicate scrollbar arrow buttons that 98.css exposes by default
- Split `html, * { scroll-behavior: auto !important; }` into two rules to properly target the `html` element explicitly
