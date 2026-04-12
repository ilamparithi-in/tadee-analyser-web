# E. Rendering Integration Rules

## Separation of Concerns: CSS Layout vs. Rendering Engine

**Principle:** CSS controls the layout frame (position, size, overflow). The rendering engine (WebGL, Canvas 2D, SVG) controls what is drawn inside that frame. These two systems must never mix their responsibilities.

- CSS sizes the container element. The rendering engine reads `container.clientWidth / clientHeight` and handles the rest internally.
- Never let the rendering engine write CSS layout properties (e.g., `canvas.style.width`, `canvas.style.height`). This triggers browser reflow and pollutes the CSS layout model.
- The rendering canvas should be `position: absolute; width: 100%; height: 100%` inside `position: relative` container, or sized purely via the engine's API.

**Project example (Three.js):** `#canvas-container { flex: 1; overflow: hidden; margin: 2px }` — CSS owns the container. `renderer.setSize(w, h, false)` (note `false`) --- Three.js sets internal resolution only, never touches `canvas.style`.

---

## Resize Handling — Avoid Per-Frame Resize

**Principle:** Never resize a rendering viewport on every animation frame. Resize is a layout event, not a render event. The render loop and the resize handler are separate concerns.

- Use `ResizeObserver` to detect layout changes — not polling inside `requestAnimationFrame`.
- Guard with a size-change comparison: skip if width and height haven't changed.
- Do not use a `rafPending` boolean throttle — if the render loop and the ResizeObserver both use RAF, the same queue is shared; `rafPending` is reset every frame by the loop regardless of resize.

```js
let lastW = 0, lastH = 0;
function onResize() {
  const w = container.clientWidth, h = container.clientHeight;
  if (w > 0 && h > 0 && (w !== lastW || h !== lastH)) {
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);  // or canvas resize equivalent
    onAspectChange(w / h);
  }
}
new ResizeObserver(onResize).observe(container);
```

**Project example (Three.js):** `main.js` — `ResizeObserver` + `(w !== lastW || h !== lastH)` guard. Replaced an incorrect `rafPending` throttle that was being reset each frame by `animate()`.

---

## Rendering Viewport Placeholder Rule

**Principle:** A rendering viewport with a placeholder (e.g., a spinning demo object) must be designed so the placeholder is trivially replaceable. Initialization code, camera setup, scene management, and the render loop should all be in a single module, accepting a container element.

- `initRenderer(containerEl)` — returns references to scene, camera, renderer.
- Caller replaces placeholder geometry with real data by clearing the scene and adding new objects.

**Project example:** `js/main.js` renders a spinning cube placeholder in `#panel-right`. The actual line geometry visualization will replace it by clearing the scene.

---

## CDN-Loaded Rendering Libraries (importmap)

**Principle:** Use importmap to alias CDN-hosted ES module libraries to short bare specifiers. This keeps `import` statements clean and version pinned in one place.

```html
<script type="importmap">
  { "imports": { "three": "https://unpkg.com/three@0.163.0/build/three.module.js" } }
</script>
```

- Pin exact versions in the importmap — never use `@latest` in production.
- All files that import the library use the bare specifier (`import * as THREE from 'three'`), not the full CDN URL.

**Project example:** Three.js loaded via importmap. `main.js` uses `import * as THREE from 'three'`.
