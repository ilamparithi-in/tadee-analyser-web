# F. Architecture Principles

## Modular Components

**Principle:** Each distinct UI behavior lives in its own module. Modules export a single init function. Entry-point scripts are thin wrappers that call init functions.

```
/js/
  main.js              ← entry: init rendering
  menu.js              ← entry: calls initMenuBar()
  ui/
    components/
      menuSystem.js    ← owns all menu logic
      panels.js        ← owns splitter drag
      grid.js          ← owns grid DOM + API
      timingConfig.js  ← single source for timing constants
      animationUtils.js← reusable animation helpers
```

- No behavior logic belongs in `index.html` inline scripts.
- `timingConfig.js` is the single source of truth for all animation durations — never hardcode timing in CSS and JS separately.

**Project example:** `menu.js` is three lines: import `initMenuBar`, call it. All logic is in `ui/components/menuSystem.js`.

---

## Separation of Concerns

**Principle:** Separate code by axis of change, not by file size.

| Concern | Owns |
|---|---|
| **UI Structure** | HTML markup, CSS layout |
| **Interaction Logic** | Event handlers, state machines, animation |
| **Rendering** | Canvas/WebGL init, scene management, render loop |
| **Data** | Calculation engine, data transformation, grid population |

- Interaction logic must not know about rendering internals.
- Rendering must not know about UI panel structure.
- Data layer must not produce DOM — it returns plain objects; the grid component renders them.

**Project example:** `grid.js` owns DOM. Calculation code (future) will call `grid.setData(results)` — it doesn't touch tbody directly.

---

## UI State Model

**Principle:** Group state by what changes it and what reads it. At minimum three buckets:

| State Bucket | What it is | Where it lives |
|---|---|---|
| **Menu state** | `{ isOpen, activeMenu, lastClosedAt }` | JS module variable in `menuSystem.js` |
| **Grid state** | Row/cell values, column widths | DOM is source of truth (read via `querySelector`) |
| **Layout state** | Panel sizes | CSS variables on `#panel-layout` |

- DOM as source of truth (grid): avoids double state; cell read = `td.textContent`.
- CSS variables as source of truth (layout): avoids JS ↔ CSS sync bugs.
- JS module variable (menu): state is behavior-critical and must not be readable from DOM.

---

## No-Build / CDN-Only Constraint

**Principle:** When no build tooling is allowed, apply these rules:

- All dependencies must be importable directly as ES modules from a CDN.
- Use importmap for version pinning and bare specifier aliases.
- All JS files must use `type="module"`.
- Must be served over HTTP — ES modules have CORS/scheme restrictions on `file://`.
- No tree-shaking: load only what you need; avoid large libraries with many unused exports.

**Project example:** No npm, no Webpack, no Vite. 98.css from unpkg via `<link>`. Three.js via importmap. Served via local HTTP server for development.
