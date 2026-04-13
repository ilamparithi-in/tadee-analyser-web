# Project Architecture

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

## Custom UI Component Rule

- Any custom behavior (menus, panels, animations, etc.) must live in reusable modules, not inline scripts or HTML
- All custom JS lives under `/js/ui/components/`
- Entry points (e.g. `menu.js`) are thin wrappers that import and call module functions

## File Structure
```
tadee-analyser-web/
├── index.html                        (static windows only; Notepad is JS-created)
├── CLAUDE.md
├── CLAUDE_CONTEXT/
│   ├── ui_rules.md
│   ├── scrolling_behavior.md
│   ├── 98css_limitations.md
│   ├── project_architecture.md
│   ├── panel_layout.md
│   ├── menu_bar.md
│   ├── window_manager.md
│   └── window_creation.md
└── js/
    ├── main.js                       (Three.js canvas init + resize)
    ├── menu.js                       (thin entry → menuSystem.js)
    ├── panels.js                     (thin entry → splitter logic)
    ├── grid.js                       (thin entry → grid.js component)
    ├── windowManager.js              (thin entry → initWindowManager on static windows)
    ├── notepad.js                    (thin entry → initNotepadWindow)
    └── ui/
        ├── components/
        │   ├── windowManager.js      (drag/resize/minimize/maximize/close — exports initWindowManager, addWindow)
        │   ├── createWindow.js       (window factory — exports createWindow, openWindow)
        │   ├── menuSystem.js
        │   ├── timingConfig.js
        │   ├── animationUtils.js
        │   └── grid.js
        └── windows/
            └── notepad.js            (Notepad window — menu, toolbar, panel layout, status bar)
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

