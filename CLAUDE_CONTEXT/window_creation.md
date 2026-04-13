# Window Creation — Modular Factory

## Files

- `js/ui/components/createWindow.js` — factory (`createWindow`, `openWindow`)
- `js/ui/components/windowManager.js` — manager (`initWindowManager`, `addWindow`)

---

## API

### `createWindow(options)` → Element
Creates and returns a `.window` element. **Not yet added to the DOM.** Use when you need to mutate the element before showing it.

### `openWindow(options, viewportEl)` → Element
Creates, appends to viewport, and registers with the window manager in one call. Returns the window element.

### `addWindow(winEl, viewportEl)` → Element
Appends an existing `.window` element to the viewport and registers it. Useful when you build the element yourself (e.g. from HTML template) and want to add it dynamically after page load.

---

## Options

| Option       | Type             | Default    | Description |
|-------------|-----------------|------------|-------------|
| `title`      | string           | `'Window'` | Title bar text |
| `width`      | number           | `400`      | Initial width in px |
| `height`     | number \| null   | `null`     | Initial height in px; `null` = content-sized |
| `resizable`  | boolean          | `true`     | Whether resize handles are added |
| `maximizable`| boolean          | `true`     | Whether maximize button appears and works |
| `minimizable`| boolean          | `true`     | Whether minimize button appears and works |
| `closable`   | boolean          | `true`     | Whether close button appears; click removes window from DOM |
| `content`    | string \| Element| `''`       | Placed inside `.window-body` (innerHTML or DOM element) |
| `statusBar`  | string \| null   | `null`     | Status bar text; `null` = no status bar rendered |
| `id`         | string \| null   | `null`     | Optional `id` attribute on the window element |

---

## How Flags Work

Flags are stored as `data-*` attributes on the `.window` element:
```html
<div class="window" data-resizable="false" data-maximizable="false">
```
The window manager reads these during `_register` and:
- Skips adding resize handles if `data-resizable="false"`
- Skips wiring minimize/maximize click handlers if flagged off
- Hides the corresponding button for HTML-authored windows with those flags
- Close button click removes the window from the DOM and the registry

**HTML-authored windows** (in `index.html`) can also use these `data-*` attributes directly without going through the factory.

---

## Usage Examples

```js
import { openWindow } from './ui/components/createWindow.js';

// Fixed-size dialog — no resize or maximize
openWindow({
  title: 'About',
  width: 320,
  resizable: false,
  maximizable: false,
  minimizable: false,
  content: '<p>Version 1.0</p>',
}, document.getElementById('viewport'));

// Tool window with status bar
const win = openWindow({
  title: 'Output',
  width: 500,
  height: 300,
  statusBar: 'Ready',
  content: '<pre id="output-log"></pre>',
}, document.getElementById('viewport'));
// win.querySelector('#output-log').textContent = 'hello';
```

```js
// Build body separately, then open
import { createWindow, addWindow } from './ui/components/createWindow.js'; // addWindow via windowManager

// Wait — use openWindow for simplicity, or:
import { openWindow } from './ui/components/createWindow.js';
const viewport = document.getElementById('viewport');

const body = document.createElement('div');
body.innerHTML = '<p>Dynamic content</p>';
openWindow({ title: 'Dynamic', content: body, width: 400 }, viewport);
```

---

## Window Manager — `data-*` Reference

| Attribute               | Values          | Effect |
|------------------------|-----------------|--------|
| `data-resizable`        | `"false"`       | No resize handles added |
| `data-maximizable`      | `"false"`       | Maximize button hidden; maximize logic disabled |
| `data-minimizable`      | `"false"`       | Minimize button hidden; minimize logic disabled |
| `data-closable`         | `"false"`       | Close button hidden; close logic disabled |

Absence of attribute = `true` (default enabled).

---

## Complex Windows (menu + toolbar)

`createWindow` builds: title-bar → window-body → [status-bar]. For windows needing extra chrome (menu-bar, toolbar) between title-bar and window-body, build the shell with `createWindow` then insert additional elements before `.window-body`, then call `addWindow`:

```js
import { createWindow } from '../components/createWindow.js';
import { addWindow }    from '../components/windowManager.js';

const win = createWindow({ title: 'My App', width: 700, height: 568, content: panelEl, statusBar: 'Ready' });

// Insert extra chrome in order (first inserted = closest to title-bar)
const windowBody = win.querySelector('.window-body');
win.insertBefore(menuBar, windowBody);
win.insertBefore(toolbar, windowBody);

addWindow(win, viewport);
```

## Script Execution Order (programmatic windows)

When a window is created by JS (not in static HTML), scripts that query its DOM elements must run **after** the window-creation script. ES modules execute in `<script>` document order:

```html
<script type="module" src="js/windowManager.js"></script>  <!-- registers static windows -->
<script type="module" src="js/notepad.js"></script>         <!-- creates Notepad DOM -->
<script type="module" src="js/menu.js"></script>            <!-- queries #menu-bar etc -->
<script type="module" src="js/panels.js"></script>
<script type="module" src="js/grid.js"></script>
```

## Initial Size and Pane Scaling

For windows with inner flex/panel layouts, set an explicit `height` in `createWindow` so `height: 100%` on inner layouts resolves correctly:
- `createWindow({ height: 568 })` sets `win.style.height = '568px'`
- The window is `display: flex; flex-direction: column` (applied by window manager CSS)  
- `.window-body { flex: 1 1 auto }` grows to fill remaining space
- `#panel-layout { height: 100% }` fills the window-body — works because flex gives window-body a definite height
- On resize, `win.style.height` is updated by the window manager → same mechanism continues to work

Without an explicit `height` on the window, `height: 100%` on inner layouts resolves to 0 (no definite container height).


