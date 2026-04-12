# G. Debugging Principles

## Diagnose Before Fixing

**Principle:** Never apply a fix before confirming the root cause. Assumption-based fixes introduce new bugs alongside the original one and make root causes harder to find later.

Workflow:
1. Observe the symptom precisely (when does it happen, what exactly changes).
2. Identify the system boundary (layout? rendering? logic? data?).
3. Form one hypothesis. Test it in isolation.
4. Only then write the fix.

**Project example:** Three.js canvas flash. Initial assumption: ResizeObserver firing too often. Actual cause: `renderer.setSize(w, h)` with default `updateStyle: true` was writing `canvas.style.width/height` inline on every call — triggering browser reflow. Fix was `false` as third arg + a size-change guard.

---

## Distinguish Rendering vs. Layout vs. Logic Issues

**Principle:** Visual bugs have three distinct origins. Each requires different diagnostic tools.

| Issue type | Diagnostic approach |
|---|---|
| **Layout bug** — wrong size, wrong position, overflow | Browser DevTools layout panel, computed styles, box model inspector |
| **Rendering bug** — flash, gap, wrong color, z-order | Verify z-index, background opacity, `border-collapse`, sticky + scroll interaction |
| **Logic bug** — wrong value, wrong state, unexpected behavior | Console `console.log(state)`, breakpoints, isolate in a minimal repro |

- Header transparency gaps during scroll → rendering bug (border-collapse interaction with sticky).
- Column resize redistributing → logic bug (missing explicit table width).
- Canvas flash → rendering bug caused by layout side-effect (inline style write).

---

## Sticky Header Debugging Checklist

When sticky headers show visual artifacts (gaps, transparency, detached corner):

1. Is `border-collapse: collapse`? → Change to `separate; border-spacing: 0`.
2. Are header backgrounds set to opaque? → Add explicit `background` to all `th` headers.
3. Is the corner cell using dual-axis sticky `(top + left)`? → Remove `top: 0` from the corner cell; `thead` provides it.
4. Is z-index set on `thead` and `.row-header`? → `thead: z-index 2`, row headers: `z-index 1`.

---

## Resize Throttle Debugging

**Principle:** Before adding throttle/debounce to a ResizeObserver, confirm the problem is actually over-firing. Log the call count and sizes first.

```js
new ResizeObserver(entries => {
  const { width, height } = entries[0].contentRect;
  console.log('resize fired', width, height);
  onResize();
}).observe(container);
```

- If the same size fires repeatedly → add size-change guard (not RAF throttle).
- If truly firing hundreds of times/sec → investigate circular layout dependency (resize causes layout change causes resize).
- RAF throttle shares the queue with render loop — it only works if the render loop does NOT use RAF continuously.

**Project example:** `rafPending` throttle failed because `animate()` resets it every frame. Size-change guard (`w !== lastW || h !== lastH`) was the correct solution.

---

## Avoid These Common Misdiagnoses

| Symptom | Wrong diagnosis | Correct diagnosis |
|---|---|---|
| Sticky header shows gaps on scroll | "z-index too low" | `border-collapse: collapse` — collapsed borders don't move |
| Canvas flashes on resize | "ResizeObserver fires too often" | `updateStyle: true` writes inline style causing reflow |
| Column widths redistribute on drag | "column min-width unset" | Table has no explicit `width` — browser redistributes to fill container |
| RAF throttle not working | "throttle threshold too small" | Render loop resets `rafPending` every frame — use size guard |
| Scrollbar looks broken | "CSS specificity issue" | Design system exposes extra scrollbar buttons (must be hidden explicitly) |
