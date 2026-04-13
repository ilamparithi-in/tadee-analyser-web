# Project Architecture

> **Phase**: Desktop Foundation (branch: `feature/desktop-foundation`)
> Previous branch was a training playground — all code rewritten from scratch.

- Single HTML entry point: `index.html`
- JS lives in `/js/` directory
- No framework — vanilla HTML/CSS/JS only
- **No npm, bundlers, or build tools**
- All dependencies loaded via CDN only
- JS files use `type="module"`
- Must be served over HTTP (not `file://`) due to ES modules
- Three.js loaded via importmap:
  ```json
  { "imports": { "three": "https://unpkg.com/three@0.163.0/build/three.module.js" } }
  ```

## OS-Level vs Application UI

- **OS-level UI** (taskbar, start menu, system clock) lives **outside** `#viewport` in the HTML
- **Application UI** (windows, panels) lives inside `#viewport`
- This separation must be maintained — never put taskbar/system elements inside `#viewport`

## Taskbar Interaction Rules

- Start button toggles start menu (click again closes, no animation)
- Clicking outside the start menu closes it
- `e.stopPropagation()` prevents outside-click listener from triggering on start-menu clicks
- Clock updates every second via `setInterval`

## Custom UI Component Rule

- Any custom behavior (menus, panels, animations, etc.) must live in reusable modules, not inline scripts or HTML
- All custom JS lives under `/js/ui/components/`
- OS-level components (taskbar etc.) are loaded **directly** from `index.html` — no thin wrapper needed

## File Structure (current — desktop-foundation phase)
```
tadee-analyser-web/
├── index.html                        (desktop shell: viewport + taskbar + start menu)
├── CLAUDE.md
├── CLAUDE_CONTEXT/
└── js/
    └── ui/
        └── components/
            └── taskbar.js            (OS-level: start button, menu toggle, outside-click, clock)
```

## Script Execution Order in index.html

ES modules run in `<script>` document order. Order matters for programmatic windows:

```html
<script type="module" src="js/windowManager.js"></script>  <!-- 1. register static windows -->
<script type="module" src="js/notepad.js"></script>         <!-- 2. create Notepad DOM -->
<script type="module" src="js/main.js"></script>            <!-- 3. Three.js canvas -->
<script type="module" src="js/menu.js"></script>            <!-- 4. queries #menu-bar (exists after step 2) -->
<script type="module" src="js/panels.js"></script>          <!-- 5. splitter logic -->
<script type="module" src="js/grid.js"></script>            <!-- 6. results grid -->
```

Any window whose DOM elements are queried by other scripts must be created (steps 1–2) before those scripts run.

