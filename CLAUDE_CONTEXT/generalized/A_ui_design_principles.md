# A. UI Design Principles

## Use a Design System — Do Not Recreate Base Styles

**Principle:** Always adopt an existing design system for foundational styles (typography, buttons, inputs, windows, focus rings). Never recreate base styles from scratch mid-project.

- Consistency comes from the system, not per-component overrides.
- Manual recreation of system styles produces visual drift and maintenance debt.
- Identify what the design system does *not* provide and document those gaps explicitly.

**Project example:** `98.css` provides `.window`, `.title-bar`, `.field-row`, buttons, etc. What it does *not* provide is documented in `98css_limitations.md` — scrollbar thumb drag states, duplicate scrollbar arrows, menu bars/dropdowns. These must be custom-built.

---

## Forbidden Pixel Regions

**Principle:** Some pixels on an element's boundary are already owned by the design system's visual treatment (e.g., inset shadow, border bevel, outline). Content and scroll containers must never occupy those pixels.

- Identify the "forbidden zone" thickness (usually 1–2px).
- Reserve it with `margin` on the inner container — not `overflow: hidden` (which clips) or `padding` (which expands the hit area).

**Project example:** `box-shadow: inset` in 98.css is drawn over the element's own edge pixels. `.panel-content { margin: 2px }` reserves the bevel zone. This is a pixel-reservation problem, not overflow.

---

## Layering Rules

**Principle:** Establish a fixed z-index hierarchy before placing overlapping elements. Assign by category, not by individual element.

| Layer | Type | Example z-index |
|---|---|---|
| Background | panels, canvas | 0–1 |
| Body cells | table/grid data | 1 |
| Sticky row/col headers | always-visible data labels | 2 |
| Overlays | dropdowns, tooltips | 10+ |
| Modals | blocking UI | 100+ |

- Sticky elements (table headers, frozen columns) require explicit z-index; otherwise they are occluded by body content during scroll.
- Never assign z-index to non-positioned elements — it has no effect.

**Project example:** `thead { position: sticky; top: 0; z-index: 2 }`, `.eg-row-hdr { z-index: 1 }`. Corner cell gets z-index 3 within thead to sit above its own sibling column headers.

---

## Scroll Behavior Consistency

**Principle:** Scroll behavior (smooth vs. instant) must match the design system's UX paradigm. Mixing them within a page creates jarring feel discontinuities.

- Override at the root level: `html { scroll-behavior: auto }` + `* { scroll-behavior: auto !important }` (two rules, not combined — browser specificity differs).
- Never call `scrollIntoView({ behavior: 'smooth' })` or `scrollTo({ behavior: 'smooth' })` in JS when the design targets an instant-scroll experience.

**Project example:** Windows 98 has no smooth scrolling anywhere. Both CSS and JS are locked to instant scroll.
