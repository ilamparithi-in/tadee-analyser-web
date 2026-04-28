# `index.html` — Structure & Responsibilities

This is the single HTML entry point for the entire application.
It is a pure static file — no server-side rendering, no bundler output.
It must be served over HTTP (not `file://`) because the JavaScript
files use ES modules.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Head — Dependencies & Stylesheets](#2-head--dependencies--stylesheets)
3. [Layout Skeleton](#3-layout-skeleton)
4. [The `#viewport` Container](#4-the-viewport-container)
5. [The `#desktop` Layer](#5-the-desktop-layer)
6. [Window: Transmission Line Analyser (`#win-analyser`)](#6-window-transmission-line-analyser-win-analyser)
   - [Title Bar](#61-title-bar)
   - [Menu Bar (`#menu-bar`)](#62-menu-bar-menu-bar)
   - [Toolbar](#63-toolbar)
   - [Panel Layout (`#panel-layout`)](#64-panel-layout-panel-layout)
   - [Status Bar](#65-status-bar)
7. [Window: Calculations Viewer (`#win-calc-viewer`)](#7-window-calculations-viewer-win-calc-viewer)
8. [Window: Code Viewer (`#win-code-viewer`)](#8-window-code-viewer-win-code-viewer)
9. [Submenu Flyouts](#9-submenu-flyouts)
10. [The `#taskbar`](#10-the-taskbar)
11. [Script Loading Order](#11-script-loading-order)
12. [What `index.html` Does NOT Do](#12-what-indexhtml-does-not-do)

---

## 1. Overview

`index.html` authors the complete DOM upfront. Every window, every panel,
every input field, and every button is a static HTML element. JavaScript
**activates** the page rather than building it. This pattern means:

- A fresh browser load shows the page structure immediately (no JS-generated layout flash).
- IDs referenced by JavaScript are guaranteed to exist in the DOM when scripts run.
- There is no hydration step, no virtual DOM, and no framework.

The visual theme is **Windows 98**, implemented with the
[98.css](https://jdan.github.io/98.css/) library loaded via CDN.
The desktop background is teal, matching the Win98 default.

---

## 2. Head — Dependencies & Stylesheets

```html
<link rel="stylesheet" href="https://unpkg.com/98.css" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
<script defer src=".../katex.min.js"></script>
<script defer src=".../auto-render.min.js" onload="..."></script>
<link rel="stylesheet" href="css/main.css" />
```

| Dependency | Purpose |
|---|---|
| **98.css** (unpkg CDN) | All Win98 visual styles — windows, title bars, buttons, select elements, scrollbars |
| **KaTeX** (jsDelivr CDN) | LaTeX math rendering inside the Calculations Viewer |
| **`css/main.css`** | Project-specific styles: desktop, panels, toolbar, tooltips, scrollbar fixes |

### KaTeX readiness signal

`auto-render.min.js` fires `document._katexReady = true` and dispatches a
`katex:ready` custom event on the document when it finishes loading. The
Calculations Viewer (`js/calcViewer.js`) listens for this event before
attempting to render math.

### No importmap

Three.js is not used in the current build (the old `main.js` Three.js
prototype is no longer loaded). There is no `<script type="importmap">` in
`index.html`.

---

## 3. Layout Skeleton

```
<body>
  <div id="viewport">          ← clipping/positioning context for all windows
    <div id="desktop">         ← icon layer (z-index 0)
    <div id="win-analyser">    ← main application window
    <div id="win-calc-viewer"> ← calculations pop-up window
    <div id="win-code-viewer"> ← source code pop-up window
    <div id="submenu-export">  ← flyout submenu (position:fixed)
    <div id="submenu-canvas">  ← flyout submenu (position:fixed)
  </div>
  <div id="taskbar">           ← Win98 taskbar (outside viewport, fixed height)
```

Windows are positioned with `position: absolute` inside `#viewport`.
The taskbar sits below the viewport and has a fixed height set by the
CSS custom property `--taskbar-h: 30px`.

---

## 4. The `#viewport` Container

```css
#viewport {
  position: relative;
  width: 100%;
  height: calc(100% - var(--taskbar-h));
  overflow: hidden;
}
```

All windows live inside `#viewport`. It acts as the coordinate space for
absolute positioning and clips anything that goes off-screen. Its height
accounts for the taskbar at the bottom.

Windows start with `visibility: hidden` (set by `css/main.css`) and are
made visible by `windowManager.js` via `raiseWindow()`.

The `data-start-hidden="true"` attribute on each window element is a signal
to the window manager to skip cascade-positioning on first show (the window
is instead raised to its authored `style="width: …; height: …"` default).

---

## 5. The `#desktop` Layer

```html
<div id="desktop"></div>
```

The desktop element itself is empty in HTML. Its icons are injected
at runtime by `js/desktop.js` → `js/ui/components/desktop.js`.

The three icons that appear are:

| Icon | Action |
|---|---|
| **My Computer** | Opens the author's GitHub profile (external link, with confirm dialog) |
| **Transmission Line Analyser** | Raises and maximizes `#win-analyser` |
| **View Source Code** | Opens the GitHub repository (external link, with confirm dialog) |

Desktop icons support single-click (select) and double-click (activate).
`js/desktop.js` also registers keyboard guards for Ctrl+R / F5 (reload)
and Ctrl+W (close tab), showing a Win98-style confirm dialog when the
analyser window has unsaved inputs open.

---

## 6. Window: Transmission Line Analyser (`#win-analyser`)

This is the primary application window. It is **the only window with a
menu bar and a toolbar**. Its full structure is:

```
div#win-analyser.window
  ├── div.title-bar            ← Win98 title bar with minimize/maximize/close
  ├── nav.menu-bar#menu-bar    ← application menu
  ├── div.toolbar              ← scrollable button toolbar
  └── div.window-body
       └── div#panel-layout
            ├── div#panel-top-row
            │    ├── div#panel-left      (Input panel)
            │    ├── div.splitter-v      (drag handle)
            │    └── div#panel-right     (Canvas panel)
            ├── div.splitter-h           (drag handle)
            └── div#panel-bottom         (Results panel)
       div.status-bar                    ← three status fields
```

### 6.1 Title Bar

Standard 98.css title bar. Includes:
- A 16×16 `<img>` icon (`media/icons/network_drive-16x16.png`) before the title text.
- Three control buttons: Minimize, Maximize, Close.

Behaviour is wired entirely by `js/ui/components/windowManager.js`.
No JS code is needed in `index.html` itself.

### 6.2 Menu Bar (`#menu-bar`)

A `<nav>` element with five top-level menu items, each structured as:

```html
<div class="menu-item" data-menu="file">
  <button>File</button>
  <div class="dropdown">
    <div class="dropdown-inner">
      <!-- items -->
    </div>
  </div>
</div>
```

The `data-menu` attribute identifies the menu for JavaScript but is
not functionally required by 98.css — open/close logic is in
`js/ui/components/menuSystem.js`.

**Menu items and their IDs:**

| Menu | Item | Element ID |
|---|---|---|
| File | New | `menu-file-new` |
| File | Open… | `menu-file-open` |
| File | Save | `menu-file-save` |
| File | Export result as… | `menu-export-trigger` (triggers `#submenu-export` flyout) |
| File | Print… | `menu-file-print` |
| File | Exit | `menu-file-exit` |
| Edit | Preferences | `menu-preferences` |
| View | Input pane | `view-pane-input` (checkable) |
| View | Canvas pane | `view-pane-canvas` (checkable, has submenu) |
| View | Results | `view-pane-output` (checkable) |
| Tools | Import Input JSON… | `menu-import-input` |
| Tools | Import Output JSON… | `menu-import-output` |
| Tools | Batch Mode… | `menu-batch-mode` |
| Help | Help Topics | `menu-help-topics` |
| Help | About… | `menu-about` |

Checkable items use the class `dropdown-check` and a `data-checked`
attribute. Items with submenus use `has-submenu`. Both are CSS/JS
conventions, not 98.css built-ins.

### 6.3 Toolbar

```html
<div class="toolbar">
  <button class="toolbar-scroll-btn toolbar-scroll-left">◄</button>
  <div class="toolbar-inner">
    <!-- buttons and separators -->
  </div>
  <button class="toolbar-scroll-btn toolbar-scroll-right">►</button>
</div>
```

The toolbar is **horizontally scrollable**. When the window is too
narrow to show all buttons, the left/right arrow buttons scroll the
`div.toolbar-inner` container. The scroll arrows are wired by
`_initToolbarScroll()` inside `js/ui/windows/analyser.js`.

**Toolbar buttons and their IDs:**

| Button | ID | Notes |
|---|---|---|
| Compute | `btn-compute` | Runs the transmission line calculation |
| Save Input | `btn-save-input` | Downloads inputs as JSON |
| Load Input | `btn-load-input` | Opens a file picker to load JSON |
| Export Output | `btn-export-output` | Disabled until a computation result exists |
| Batch Mode | `btn-batch-mode` | Opens the Batch Mode window |
| View Code | `btn-view-code` | Opens the Code Viewer window |
| View Calculations | `btn-view-calc` | Opens the Calculations Viewer window |

`data-tooltip` attributes on each button are read by
`js/ui/components/tooltip.js` to show Win98-style tooltip balloons.

### 6.4 Panel Layout (`#panel-layout`)

The window body contains a three-panel resizable layout:

```
┌────────────────┬──────────────────────┐
│  #panel-left   │    #panel-right      │
│  (Input)       │    (Canvas)          │
├────────────────┴──────────────────────┤
│          #panel-bottom                │
│          (Results)                    │
└───────────────────────────────────────┘
```

- **Vertical splitter** (`#splitter-v`) divides left from right.
- **Horizontal splitter** (`#splitter-h`) divides the top row from the bottom.
- Sizes are stored as CSS custom properties `--left-width` and `--bottom-height`
  on `#panel-layout`. The splitter logic lives in `js/ui/components/panels.js`.
- Each panel has a **pop-out button** (↗, class `panel-popout-btn`) that
  tears the panel into a floating window. Wired by `js/ui/components/panelPopout.js`.

#### Input Panel (`#panel-left`)

Contains `#input-form`, a plain HTML `<form>` (not submitted — used only
for grouping). Inputs are organised into four `<fieldset>` groups:

| Fieldset | Key inputs |
|---|---|
| **Electrical Parameters** | Line length, load (MW), power factor, voltage, frequency, system type |
| **Geometry Parameters** | Phase spacing (symmetric or three-way asymmetric Dab/Dbc/Dca), sub-conductor count, sub-conductor spacing |
| **Conductor Parameters** | Strand count, strand diameter, resistance per km |
| **Model Selection** | Line model (Short / Nominal π / Distributed) |

Most numeric inputs have an accompanying `<select>` unit dropdown.
The unit inputs are handled by `js/ui/components/unitInput.js`, which
reads `data-unit-for`, `data-base-unit`, and `data-to-base` attributes
to convert to SI base units before computation.

The **System type** select (`#system-type`) toggles between `#spacing-sym`
(single `D` field) and `#spacing-unsym` (`Dab`/`Dbc`/`Dca` fields).
The toggle is wired by `_initSpacingToggle()` in
`js/ui/windows/analyser.js`.

#### Canvas Panel (`#panel-right`)

Contains only `#canvas-container` — an empty `<div>` that is populated
at runtime by `js/ui/components/diagrams.js` with three SVG diagrams:
arrangement, phasor, and circuit.

#### Results Panel (`#panel-bottom`)

```html
<div id="panel-bottom">
  <div id="results-heading">Results<button class="panel-popout-btn">↗</button></div>
  <div id="results-scroll">
    <div id="results-grid"></div>
  </div>
</div>
```

`#results-grid` is populated by `js/ui/components/grid.js` after each
computation. It renders a two-column key/value table of all output quantities.

### 6.5 Status Bar

```html
<div class="status-bar">
  <p class="status-bar-field" id="sb-hover"></p>
  <p class="status-bar-field" id="sb-time">Time: 0 ms</p>
  <p class="status-bar-field" id="sb-status">Ready</p>
</div>
```

Three 98.css status bar fields:
- `#sb-hover` — Shows a hint when hovering over a button or input.
- `#sb-time` — Shows the last computation time in milliseconds.
- `#sb-status` — Shows "Ready", "Computing…", or error states.

---

## 7. Window: Calculations Viewer (`#win-calc-viewer`)

```html
<div id="win-calc-viewer" class="window" data-start-hidden="true"
     style="width: 820px; height: 600px;">
```

A secondary window, hidden on load. Opened by the **View Calculations**
toolbar button. Its body contains:

| Element | ID | Role |
|---|---|---|
| Toolbar div | `calc-viewer-toolbar` | Contains a single Print button |
| Print button | `calc-viewer-print` | Triggers `window.print()` scoped to the viewer |
| Scroll container | `calc-viewer-scroll` | Overflow-y: auto |
| Content div | `calc-viewer-content` | Populated by `js/calcViewer.js` with KaTeX-rendered HTML |

The content is loaded from `docs/calculations.html` via `fetch()` when
the window is first opened. KaTeX auto-render runs after the HTML is
injected.

---

## 8. Window: Code Viewer (`#win-code-viewer`)

```html
<div id="win-code-viewer" class="window" data-start-hidden="true"
     style="width: 780px; height: 520px;">
```

A secondary window showing the raw source of `tadee.js`. Its body is:

```html
<pre id="code-viewer-pre">
  <code id="code-viewer-code">Loading…</code>
</pre>
```

`js/codeViewer.js` fetches `js/tadee.js` and sets the text content of
`#code-viewer-code`. No syntax highlighting library is used — the Win98
monospace `<pre>` style is sufficient.

---

## 9. Submenu Flyouts

Two `position: fixed` submenu panels live at the bottom of `#viewport`.
They are invisible by default and are shown/positioned by JavaScript
when the corresponding menu trigger is hovered.

### `#submenu-export`

Triggered by hovering `#menu-export-trigger` (the "Export result as…"
item in the File menu).

Items: **PDF**, **JSON**, **TXT**, **Markdown (MD)** — all disabled until
a computation result exists.

IDs: `menu-export-pdf`, `menu-export-json`, `menu-export-txt`, `menu-export-md`.

### `#submenu-canvas`

Triggered by hovering `#view-pane-canvas` (the "Canvas pane" item in
the View menu).

Items: **Whole pane** (toggle), **Arrangement** (toggle), **Phasor** (toggle),
**Circuit** (toggle).

IDs: `view-canvas-whole`, `view-canvas-arrangement`, `view-canvas-phasor`,
`view-canvas-circuit`.

Both submenus use the pattern:
```html
<div class="submenu-panel">      ← overflow:hidden clip container
  <div class="submenu-inner">    ← sliding Win98-style card
    <!-- items -->
  </div>
</div>
```

---

## 10. The `#taskbar`

```html
<div id="taskbar">
  <button id="start-btn">...</button>
  <div id="taskbar-sep"></div>
  <div id="taskbar-tasks"></div>
  <div id="taskbar-tray">
    <div id="taskbar-clock"></div>
  </div>
</div>
```

The taskbar is outside `#viewport` and sits at the very bottom of the
page. Parts:

| Element | Purpose |
|---|---|
| `#start-btn` | Start button (placeholder — no menu yet) |
| `#taskbar-sep` | Visual divider between Start and window buttons |
| `#taskbar-tasks` | Window buttons injected here by `windowManager.js` when windows are opened |
| `#taskbar-clock` | Live clock updated every second by `js/ui/components/taskbar.js` |

The taskbar clock is wired by the separate entry point `js/taskbar.js`.

---

## 11. Script Loading Order

Scripts are loaded at the **bottom of `<body>`** (after all HTML is parsed)
as ES modules (`type="module"`). Execution is deferred by default.

```html
<!-- Window manager must come first so its registry is populated
     before per-window scripts try to call raiseWindow() etc. -->
<script type="module" src="js/windowManager.js"></script>

<!-- Per-window initialisers -->
<script type="module" src="js/analyser.js"></script>
<script type="module" src="js/desktop.js"></script>
<script type="module" src="js/codeViewer.js"></script>
<script type="module" src="js/calcViewer.js"></script>
<script type="module" src="js/batchWindow.js"></script>

<!-- Taskbar (separate entry point, outside #viewport) -->
<script type="module" src="js/taskbar.js"></script>
```

Each top-level file in `js/` is a thin **entry point** — it finds a DOM
element by ID and calls the appropriate initialiser from `js/ui/`. The
real logic lives in the `js/ui/components/` and `js/ui/windows/` trees.

**Why `windowManager.js` is first:** It calls `initWindowManager()`,
which scans `#viewport` for `.window` children and registers them all.
Subsequent scripts call functions like `raiseWindow()` that depend on that
registry. Module execution order within a single document is top-down,
so placing it first guarantees the registry exists.

---

## 12. What `index.html` Does NOT Do

- **No build step output** — this is hand-authored HTML, not generated.
- **No inline JavaScript** — all behaviour is in external `.js` modules.
- **No inline CSS** (except `style=""` width/height on windows and a few
  `display:none` overrides for conditional sections like `#spacing-unsym`).
- **No forms that submit** — the `<form id="input-form">` is purely structural.
- **No server-side templating** — the file is identical in development and
  production.
- **No HiDPI scaling script** — that feature is described in `CLAUDE.md`
  as a planned pattern but is not currently present in `index.html`.
