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
├── index.html
├── CLAUDE.md
├── CLAUDE_CONTEXT/
│   ├── ui_rules.md
│   ├── scrolling_behavior.md
│   ├── 98css_limitations.md
│   ├── project_architecture.md
│   └── menu_bar.md
└── js/
    ├── main.js
    ├── menu.js            (thin entry point)
    └── ui/
        └── components/
            ├── timingConfig.js
            ├── animationUtils.js
            └── menuSystem.js
```

