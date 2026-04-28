# `js/ui/components/diagrams.js` — Complete Reference

This module owns all three SVG diagram panes in the Canvas panel of the
Analyser window. It handles DOM construction, real-time zoom/pan
interaction, data-driven redraw after each Compute, and static SVG
string export for PDF reports.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Public API](#2-public-api)
3. [Module-Level State](#3-module-level-state)
4. [DOM Structure Built by `initDiagramContainer`](#4-dom-structure-built-by-initdiagramcontainer)
5. [Diagram Grid Splitters](#5-diagram-grid-splitters)
6. [Pane Maximize / Restore Animation](#6-pane-maximize--restore-animation)
7. [Pane 1 — Conductor Arrangement](#7-pane-1--conductor-arrangement)
   - [Bundle Geometry: `bundleOffsets`](#71-bundle-geometry-bundleoffsets)
   - [Phase Positions: `phasePositions`](#72-phase-positions-phasepositions)
   - [Auto-fit: `_fitBundleView`](#73-auto-fit-_fitbundleview)
   - [Two-Layer SVG Architecture](#74-two-layer-svg-architecture)
   - [Redraw Pipeline](#75-redraw-pipeline)
   - [Dimension Line Algorithms](#76-dimension-line-algorithms)
   - [Zoom / Pan Interaction](#77-zoom--pan-interaction)
8. [Pane 2 — Circuit Diagram](#8-pane-2--circuit-diagram)
   - [Model Dispatch](#81-model-dispatch)
   - [Schematic Primitives](#82-schematic-primitives)
   - [Short Line Circuit](#83-short-line-circuit)
   - [Nominal π Circuit](#84-nominal-π-circuit)
   - [Distributed Ladder Circuit](#85-distributed-ladder-circuit)
   - [Distributed d/dx Differential View](#86-distributed-ddx-differential-view)
   - [Current Helpers](#87-current-helpers)
   - [Values Table and Labels](#88-values-table-and-labels)
9. [Pane 3 — Phasor Diagram](#9-pane-3--phasor-diagram)
   - [Scale Computation](#91-scale-computation)
   - [Origin Centering: `_phasorOrigin`](#92-origin-centering-_phasororigin)
   - [Short Line Phasor Construction](#93-short-line-phasor-construction)
   - [Nominal π Phasor Construction](#94-nominal-π-phasor-construction)
   - [Distributed Phasor](#95-distributed-phasor)
   - [Legend and Labels Overlay](#96-legend-and-labels-overlay)
10. [PDF Export Renderers](#10-pdf-export-renderers)
11. [SVG Rendering Conventions](#11-svg-rendering-conventions)
12. [Constants Reference](#12-constants-reference)

---

## 1. Overview

`diagrams.js` is a self-contained module. It keeps all mutable SVG state
privately and exposes a minimal surface area:

```
initDiagramContainer(container)  — build the pane grid, wire interaction
updateDiagrams(inputs, outputs)  — redraw all three panes after Compute
bundleOffsets(scCount, spacing)  — exported for PDF report reuse
phasePositions(inputs)           — exported for PDF report reuse
renderArrangementSvgStr(...)     — SVG string for PDF
renderCircuitSvgStr(...)         — SVG string for PDF
renderPhasorSvgStr(...)          — SVG string for PDF
```

The module uses the SVG coordinate system throughout:
- **+x** points right.
- **+y** points **down** (standard SVG / browser convention).
- A complex phasor `{re, im}` is mapped to screen as `x = re * scale`,
  `y = -im * scale` — the negation converts from the mathematical
  counter-clockwise convention to SVG's clockwise convention.

---

## 2. Public API

| Export | Signature | Purpose |
|---|---|---|
| `initDiagramContainer` | `(container: HTMLElement)` | Builds `.diagram-grid`, creates three panes, SVGs, bottom bars, and wires all interaction. Cleans up any previous `AbortController` listeners first. |
| `updateDiagrams` | `(inputs, outputs)` | Stores the new data, then schedules a `requestAnimationFrame` callback that calls `_fitBundleView`, `_redrawArrangement`, `_redrawCircuit`, and `_redrawPhasor`. The rAF deferral ensures SVG elements have layout dimensions before drawing. |
| `bundleOffsets` | `(scCount, spacing) → [[dx,dy],…]` | Returns sub-conductor centre offsets from bundle centre. |
| `phasePositions` | `(inputs) → {A:[x,y], B:[x,y], C:[x,y]}` | Returns phase conductor centre positions in metres, centred at the world-space centroid. |
| `renderArrangementSvgStr` | `(inputs, w, h) → string` | Renders arrangement to a serialised SVG XML string for embedding in PDF HTML. |
| `renderCircuitSvgStr` | `(inputs, outputs, w, h) → string` | Renders circuit to SVG XML string. |
| `renderPhasorSvgStr` | `(inputs, outputs, w, h) → string` | Renders phasor to SVG XML string. |

---

## 3. Module-Level State

All state is module-private (`let` at top level). The most important fields:

### Base-fit state (`_bs`)

```js
_bs = { tx, ty, scale, inputs }
```

- `tx`, `ty` — screen coordinates of the physical world origin (centroid
  of the three phase centres), in SVG user units (px).
- `scale` — metres to screen pixels conversion factor.
- `inputs` — the last `inputs` object passed to `updateDiagrams`, or
  `null` if no computation has run yet.

### Interactive view offsets

Three separate view-state objects, one per pane:

```js
_view        = { zoom, panX, panY }  // Pane 1 (arrangement)
_viewCircuit = { zoom, panX, panY }  // Pane 2 (circuit)
_viewPhasor  = { zoom, panX, panY }  // Pane 3 (phasor)
```

`zoom` is a multiplicative factor layered on top of `_bs.scale`.
`panX`/`panY` are additive pixel translations.

### Layer `<g>` elements

| Variable | Role |
|---|---|
| `_bundleG` | The scalable content group in Pane 1 (conductors). Gets `translate(panX, panY) scale(zoom)`. |
| `_annotG` | The annotation overlay group in Pane 1 (dim lines, phase labels). Gets `translate(panX, panY)` **only** — no scale. Positions are pre-multiplied by zoom in code. |
| `_circuitG` | The pannable/scalable group in Pane 2. |
| `_phasorG` | The pan-only group in Pane 3 (zoom is baked into coordinate math). |

### Event listener cleanup

Each pane has a corresponding `AbortController`:
`_bundleAC`, `_circuitAC`, `_phasorAC`. All event listeners for that pane
are registered with `{ signal: ac.signal }`. When `initDiagramContainer`
is called again (e.g. panel pop-out reinit), the controllers are aborted
first, removing all listeners without manual bookkeeping.

### Other notable flags

| Variable | Default | Purpose |
|---|---|---|
| `_toScale` | `false` | Whether Pane 1 draws conductors proportional to physical dimensions |
| `_distMode` | `'ladder'` | Distributed circuit view: `'ladder'` or `'diff'` (d/dx element) |
| `_phasorLabels` | `true` | Whether arm name labels are drawn on the phasor diagram |
| `_lastOutputs` | `null` | Cached outputs for re-use when view state changes without new compute |

---

## 4. DOM Structure Built by `initDiagramContainer`

```
div.diagram-grid  (CSS grid: 2 cols × 2 rows with splitters)
  ├── div.dpane.dpane-arrangement   (Pane 1: Arrangement — top-left cell)
  │    ├── div.dpane-title
  │    │    ├── span.dpane-title-text   "Conductor Arrangement"
  │    │    └── div.dpane-controls
  │    │         ├── button.dpane-btn   ⌖ (zoom reset)
  │    │         └── button.dpane-btn   □ (maximize)
  │    └── div.dpane-body
  │         └── div.dpane-svg-wrap
  │              ├── svg                ← _svgBundle
  │              └── div.dpane-bottom-bar
  │                   ├── div.dpane-checkbox-wrap  (To scale checkbox)
  │                   ├── span.dpane-overlay-info  (radius readout)
  │                   └── span.dpane-overlay-info  (scale readout)
  │
  ├── div.dg-splitter-h               (horizontal splitter)
  │
  ├── div.dpane.dpane-phasor           (Pane 3: Phasor — bottom-left cell)
  │    └── div.dpane-body
  │         └── div.dpane-svg-wrap
  │              ├── svg                ← _svgPhasor
  │              └── div.dpane-bottom-bar
  │                   ├── div.dpane-overlay-info  (V/I scale legend)
  │                   └── div.dpane-checkbox-wrap (Labels checkbox, hidden until first compute)
  │
  ├── div.dg-splitter-v               (vertical splitter)
  │
  └── div.dpane.dpane-circuit          (Pane 2: Circuit — right column, both rows)
       ├── div.dpane-title
       │    ├── span.dpane-title-text  (updated dynamically: "Circuit Diagram — Short Line" etc.)
       │    └── div.dpane-controls
       │         ├── button ⌖          (zoom reset)
       │         ├── button Δ/≡        (distributed mode toggle, hidden unless model=2)
       │         └── button □          (maximize)
       └── div.dpane-body
            └── div.dpane-svg-wrap
                 └── svg               ← _svgCircuit
```

**Grid layout** (CSS variables on `.diagram-grid`):
- `--dg-col1` — width of the left column (Panes 1 and 3), draggable.
- `--dg-row1` — height of the top row (Pane 1), draggable.

---

## 5. Diagram Grid Splitters

`_initDiagramSplitters(grid, splitterV, splitterH)` wires two pointer-based
drag handles.

**Vertical splitter** (`div.dg-splitter-v`):
- On `pointerdown`, captures the pointer and records starting `clientX`
  and the current left-column width (`splitter.getBoundingClientRect().left − grid.left`).
- On `pointermove`, computes `newW = clamp(startWidth + Δx, MIN_COL, gridW − SPLIT − MIN_COL)`.
- Writes `--dg-col1: newWpx` on the grid element.
- `MIN_COL = 80 px` prevents either column from disappearing.

**Horizontal splitter** (`div.dg-splitter-h`):
- Same pattern. `startHeight = splitter.top − grid.top`.
- `newH = clamp(startHeight + Δy, MIN_ROW, gridH − SPLIT − MIN_ROW)`.
- Writes `--dg-row1: newHpx`.
- `MIN_ROW = 60 px`.

Both use `window` for `pointermove`/`pointerup` (not the element) so
drags work even if the pointer moves outside the splitter.

---

## 6. Pane Maximize / Restore Animation

`_initMaximizeBtn(btn, pane)` implements the maximize toggle. Without a
`.diagram-grid` ancestor (e.g. after pop-out), it simply class-toggles
`dpane--maximized`.

**When inside the grid, the animation algorithm is:**

1. Measure the pane's current rect (`fromRect`) relative to the grid.
2. Toggle the CSS class (`dpane--maximized`) and immediately measure
   the target rect (`toRect`) — both reads happen synchronously, before
   any repaint.
3. Revert the class toggle (so the pane snaps back to its pre-animate state).
4. Create a `position:absolute` `div` with a dotted border, positioned
   at `fromRect` inside the grid.
5. Force a layout flush (`getBoundingClientRect()`) so the browser
   registers the starting state.
6. Apply a CSS `transition` and set the div's position/size to `toRect`.
   The browser animates the transition (linear, `DPANE_ANIM_MS = 150 ms`).
7. After `DPANE_ANIM_MS + 20 ms`, remove the div and apply the real
   class toggle.

This is the **FLIP technique** (First, Last, Invert, Play), but used on
a throwaway outline div rather than the real element. The pane itself
always jumps instantly; the user sees a dotted outline animate into place,
matching the Win98 window-dragging aesthetic.

---

## 7. Pane 1 — Conductor Arrangement

### 7.1 Bundle Geometry: `bundleOffsets`

```js
export function bundleOffsets(scCount, spacing)
  → [[dx, dy], …]
```

Returns the position of each sub-conductor relative to the bundle centre,
in any consistent unit (`spacing` is the centre-to-centre distance).

| `scCount` | Layout | Geometry |
|---|---|---|
| **2** | Vertical pair | `[0, ±s/2]` |
| **3** | Inverted equilateral triangle | Top-left, top-right, apex at bottom. Height `h = s√3/2`. Offsets centred on the centroid (which is `h/3` from the base, `2h/3` from the apex). |
| **4** | Square | `[±s/2, ±s/2]` |

For the **3-sub-conductor** case:

$$
\text{offsets} = \left[
  \left(-\frac{s}{2},\ -\frac{h}{3}\right),\quad
  \left(+\frac{s}{2},\ -\frac{h}{3}\right),\quad
  \left(0,\ +\frac{2h}{3}\right)
\right],\quad h = \frac{s\sqrt{3}}{2}
$$

The apex is at the bottom (`+y` in SVG) so the triangle points downward —
the "inverted equilateral triangle" arrangement standard in power systems.

### 7.2 Phase Positions: `phasePositions`

```js
export function phasePositions(inputs)
  → { A: [x, y], B: [x, y], C: [x, y] }   // metres, centred at centroid
```

Returns the world-space position of each phase conductor centre, with the
centroid of all three at the origin.

#### Symmetric case

An equilateral triangle of side `D`. Phase A at the top:

$$
A = \left(0,\ -\frac{2h}{3}\right),\quad
B = \left(-\frac{D}{2},\ +\frac{h}{3}\right),\quad
C = \left(+\frac{D}{2},\ +\frac{h}{3}\right),\quad
h = \frac{D\sqrt{3}}{2}
$$

#### Asymmetric case

The three spacings `Dab`, `Dbc`, `Dca` define a scalene triangle.
The algorithm:

1. **Identify the longest side** as the base (`D12`) to maximise
   visual stability. The roles of P1/P2/P3 (apex) are assigned
   accordingly.
2. **Place the base** horizontally: P1 at `(−D12/2, 0)`,
   P2 at `(+D12/2, 0)`.
3. **Solve for the apex** P3 using the two known edge lengths
   `D13` (P1→P3) and `D23` (P2→P3). Using the intersection of
   two circles:

$$
p_x = \frac{D_{13}^2 - D_{23}^2}{2 \cdot D_{12}}
$$
$$
p_y = -\sqrt{D_{13}^2 - \left(p_x + \frac{D_{12}}{2}\right)^2}
$$

   The negative square root places the apex **above** the base
   in SVG (smaller `y` = higher on screen = up in the physical
   tower arrangement).

4. **Centre on the centroid**:

$$
g_x = p_x / 3, \quad g_y = p_y / 3
$$

   Final positions:

$$
\text{P1} = \left(-\frac{D_{12}}{2} - g_x,\ -g_y\right),\quad
\text{P2} = \left(+\frac{D_{12}}{2} - g_x,\ -g_y\right),\quad
\text{P3} = \left(p_x - g_x,\ p_y - g_y\right)
$$

### 7.3 Auto-fit: `_fitBundleView`

`_fitBundleView` resets `_view` to `{zoom:1, panX:0, panY:0}` and
computes the base scale so the arrangement fits snugly in the SVG.

**Algorithm:**

1. Read the SVG element's client dimensions (`sw`, `sh`), clamped
   to at least `385 × 300 px` for safety.
2. If no inputs exist (placeholder state), set a nominal scale
   `(min(sw,sh) × 0.3) / 0.04` (as if a ~4 cm conductor, 30% fill).
3. Otherwise:
   - Compute the physical conductor radius:
     $$
     r_\text{phys} = (2 \cdot \text{layers} - 1) \cdot \frac{d_\text{strand}}{2}
     $$
     where the layer count is derived from the strand count using the
     hexagonal close-pack formula (see §7.5).
   - Find the bounding box of the three phase positions plus one
     conductor radius on each side.
   - Compute the scale factor that fills 72% of `sw`/`sh` while
     preserving aspect ratio:
     $$
     \text{scale} = \min\left(
       \frac{0.72 \cdot sw}{\text{physW}},\;
       \frac{0.72 \cdot sh}{\text{physH}}
     \right)
     $$
4. Set `_bs.tx = sw/2`, `_bs.ty = sh/2` — the world origin is always
   placed at the SVG centre.

### 7.4 Two-Layer SVG Architecture

Pane 1 uses two `<g>` elements inside the SVG:

| Layer | Variable | Transform | Contents |
|---|---|---|---|
| Content | `_bundleG` | `translate(panX, panY) scale(zoom)` | Conductor circles, radius arrows |
| Annotation | `_annotG` | `translate(panX, panY)` only | Phase spacing dim lines, phase labels, sub-conductor spacing dim |

**Why two layers?**

The conductors must scale when zoomed so they grow visually. But dimension
line arrowheads, text labels, and tick marks must stay **constant screen
size** regardless of zoom — otherwise labels become enormous or microscopic.

The annotation layer achieves this by applying only the pan translation
as a group transform. Individual element positions inside `_annotG` are
pre-multiplied by `_view.zoom` in `_redrawAnnotations`. This means zoom
changes require a full redraw of `_annotG` (not just a transform update).

`_applyViewTransform()` handles this split:
```js
_bundleG.setAttribute('transform',
  `translate(${_view.panX},${_view.panY}) scale(${_view.zoom})`);
_annotG.setAttribute('transform',
  `translate(${_view.panX},${_view.panY})`);
```

### 7.5 Redraw Pipeline

`_redrawArrangement()`:

1. Clears the SVG and creates fresh `_bundleG` / `_annotG` groups.
2. If no inputs, draws the placeholder text and returns.
3. Computes the hexagonal close-pack layer count and physical radius:

   ```
   layers = (3 + √(12·scStrands − 3)) / 6
   rPhys  = (2·layers − 1) · strandDiaM / 2
   ```

   This is the formula for a standard ACSR/ACSS stranded conductor:
   a central strand surrounded by concentric hexagonal shells. The
   conductor radius equals the centre-to-outer-rim distance.

4. Computes display radius and display spacing based on the `_toScale`
   flag:
   - **Good-looking mode** (`_toScale = false`): fixed `FIXED_R_PX = 7 px`
     and `FIXED_SC_SPACING_PX = 30 px`. Positions are to-scale;
     conductors are drawn at a legible fixed size.
   - **To-scale mode**: `rPhys × scale` and `scSpacingM × scale`.
     Conductors may appear tiny; the user should zoom in.

5. Calls `_drawBundle(...)` for each phase into `_bundleG`.
6. Updates the bottom bar overlay with the physical radius (`r = … cm`).
7. Calls `_drawScaleBadge()` to update the scale readout overlay.
8. Calls `_applyViewTransform()` to apply any current `_view` offset.
9. Calls `_redrawAnnotations()` to populate `_annotG`.

`_redrawAnnotations()` draws (in order):
- Phase spacing dimension lines (one for symmetric, three for asymmetric).
- Sub-conductor spacing dimension (phase A only, between sub-conductors 0 and 1).
- Phase labels A/B/C with white knockout stroke and phase-specific colour.

### 7.6 Dimension Line Algorithms

#### `_drawPhaseDim(svg, pA, pB, bundleExtent, label, side)`

Draws an engineering dimension line between two phase screen centres.

- **Line**: dashed (`stroke-dasharray: 4,3`) from `pA` to `pB`.
- **Arrowheads**: filled triangles at both ends, pointing outward (away
  from the other endpoint). The tip of each arrowhead is at the phase centre.
- **Label placement** (perpendicular to the line):
  - `side = 'top'`: choose the perpendicular direction with the smaller
    (more negative) `y` component — i.e., upward in SVG.
  - `side = 'bottom'`: choose the larger `y` component — downward.
  - `side = null` (auto): compute the vector from the SVG centre
    `(tx, ty)` to the dim-line midpoint. The label goes in the
    outward direction — away from the centroid of the arrangement.
- The label midpoint is offset 14 px from the dim line midpoint in
  the chosen perpendicular direction. A white halo (`stroke-width: 2.5`)
  is applied before the coloured fill so the text is readable over
  the dashed line.

#### `_drawDcaHorizDim(svg, pA, pC, allPhaseScreenPts, bundleExtent, label)`

Special-cases the `Dca` dimension for the asymmetric arrangement.
`A` and `C` are the two base phases; a direct diagonal line would
overlap the `Dab`/`Dbc` labels. Instead:

1. Compute `dropY`: the screen y of the lowest bundle rim, plus
   `bundleExtent + 52 px` of clearance below to avoid clashing with
   the Dab/Dbc labels.
2. Draw a vertical dashed leader from each phase's rim down to `dropY`.
3. Draw a horizontal dashed dim line at `dropY` between the x-positions
   of A and C.
4. Place outward-pointing arrowheads on the horizontal line.
5. Place the label 10 px above the horizontal line.

#### `_drawSpacingDim(svg, ax, ay, bx, by, dispR, label)`

Draws an engineering dimension line between two **sub-conductor** centres,
offset outward from the bundle so it does not obscure the circles.

1. Compute the unit vector **along** AB: `(ux, uy)`.
2. Compute the perpendicular offset direction: `(px, py) = (+uy, −ux)`.
   - For a vertical pair (AB down = `(0, +1)`): perp = `(+1, 0)` → right. ✓
   - For a horizontal pair (AB right = `(+1, 0)`): perp = `(0, −1)` → up. ✓
3. Offset `OFFSET = dispR + 16 px` outward.
4. Draw extension lines from `dispR + 2 px` past each circle rim to
   `OFFSET + EXT` (5 px overshoot past the dim line).
5. Draw the dim line between the two offset endpoints.
6. Draw inward-pointing arrowheads (pointing toward each other).
7. Place the label `8 px` further outward from the dim line midpoint.

### 7.7 Zoom / Pan Interaction

All three panes share the same zoom/pan architecture, implemented separately
per pane because their view state objects and content groups differ.

**Wheel zoom** (`_zoomAround(pivotX, pivotY, factor)`):

The zoom is applied such that the point under the cursor stays fixed:

```js
_view.panX = pivotX + (_view.panX - pivotX) * factor;
_view.panY = pivotY + (_view.panY - pivotY) * factor;
_view.zoom *= factor;
```

This is equivalent to: translate so that the pivot is at the origin,
scale, translate back. The factor is `1.15` per wheel tick upward and
`1/1.15` downward.

After zooming, Pane 1 calls `_redrawAnnotations()` because annotation
positions depend on `_view.zoom`. Pane 2 only calls `_applyCircuitTransform()`
(the SVG group transform) — no redraw needed. Pane 3 triggers a full
`_redrawPhasor` because zoom is baked into the phasor coordinate math.

**Mouse drag**:
- `mousedown` on the SVG starts a drag; the cursor changes to `grabbing`.
- `mousemove` on `window` (not the SVG) accumulates `panX`/`panY` deltas.
- `mouseup` on `window` ends the drag.
- Listeners are cleaned up via `AbortController` (not `removeEventListener`).

**Pinch-to-zoom (touch)**:
- `touchstart` with exactly 2 touches records the initial finger distance
  (`_touchDist`) and the midpoint as the pivot.
- `touchmove` computes a new factor `f = newDist / prevDist` and calls
  the same zoom-around-pivot math, updating `pinch.dist` each frame.
- `_touchDist` = Euclidean distance between the two touch points:
  `√((x0−x1)² + (y0−y1)²)`.

**ResizeObserver**: each SVG has a `ResizeObserver` that re-fits and
redraws when its container size changes (e.g. window resize, splitter drag).

---

## 8. Pane 2 — Circuit Diagram

### 8.1 Model Dispatch

`_redrawCircuit(inputs, outputs)` clears the SVG, creates a new `_circuitG`,
and dispatches to a per-model renderer based on `inputs.model`:

| `inputs.model` | Renderer |
|---|---|
| `0` (Short) | `_drawShortCircuit` |
| `1` (Nominal π) | `_drawNominalPiCircuit` |
| `2` + `_distMode === 'ladder'` | `_drawDistributedCircuit` |
| `2` + `_distMode === 'diff'` | `_drawDistributedDiff` |

The circuit title text (`_circuitTitleEl`) is updated to reflect the
model name. The distributed-mode toggle button is shown/hidden accordingly.

### 8.2 Schematic Primitives

All schematic drawing uses the SVG namespace and the `_el(tag, attrs)`
helper. Primitives:

| Function | Symbol |
|---|---|
| `_wireSeg(parent, x1, y1, x2, y2)` | Solid 1.5 px black line segment |
| `_junctionDot(parent, x, y)` | Filled 3 px dot (T-junction) |
| `_termNode(parent, x, y)` | Open circle (open terminal node) |
| `_drawResistor(parent, x1, y, x2)` | US zigzag — 6 peaks over 32 px, ±7 px amplitude |
| `_drawInductor(parent, x1, y, x2)` | 4 semicircular bumps above the wire, SVG arc path |
| `_drawSeriesRL(parent, x1, y, x2, hasR)` | Resistor (left half) + inductor (right half) if `hasR`; inductor only otherwise |
| `_drawShuntCap(parent, x, topY, gndY)` | Vertical capacitor: two horizontal plate lines with a 5 px gap, centred between `topY` and `gndY` |
| `_drawGround(parent, x, y)` | Three horizontal lines of decreasing length (14, 9, 4 px) at 4.5 px intervals |
| `_drawVoltageArrow(parent, x, topY, botY, label, side)` | Upward arrow from `botY` to `topY`; label placed 14 px below the tip, left or right |
| `_drawCurrentArrow(parent, x1, x2, y, label)` | Rightward arrow; label centred above |
| `_drawCapCurrentArrow(parent, x, topY, botY, name, side)` | Downward arrow offset 16 px beside a shunt cap |

### 8.3 Short Line Circuit

```
              IS →               IR →
topY: ○──────[R + jXL]──────────○
botY: ○──────────────────────────○

      VS ↑                   VR ↑
```

- `leftX` and `rightX` are padded 90 px from each edge to leave room for
  voltage arrow labels.
- The series element spans `SERIES_W = min(140, 50% of total width)`,
  centred horizontally.
- If `|B.re| < 0.001` (resistanceless line), only the inductor is drawn.
- The `Z = …` label is placed 16 px below the series element centre.
- Values table (bottom-right, fixed to SVG): VS, VR, IS, IR.

### 8.4 Nominal π Circuit

```
       IS →                      IR →
topY: ○──●──[R + jXL]──●──────────○
          |              |
         Y/2            Y/2
          |              |
botY: ○──●──────────────●──────────○

      VS ↑    IC2 ↓  IC1 ↓     VR ↑
```

- Shunt junction dots at `juncL = leftX + 32` and `juncR = rightX − 32`.
- The series element spans `SERIES_W = min(130, 70% of juncL→juncR)`.
- Y/2 value is computed as `1 / (2 · Xc)` and formatted in μS or mS.
- Shunt cap current arrows `IC1` (receiving end, right shunt) and `IC2`
  (sending end, left shunt) are placed beside each capacitor, pointing
  downward.
- Values table: VS, VR, IS, IR, IC1, IC2.

### 8.5 Distributed Ladder Circuit

Draws a ladder network with three explicit cells separated by a dashed
ellipsis (…) to indicate an infinite series:

```
┌─────────[z·Δx]─●─[z·Δx]─●─ ··· ─●─[z·Δx]─●─────┐
│                 │          │        │          │    │
VS               y·Δx      y·Δx    y·Δx       y·Δx  VR
```

**Layout calculation:**

```
j1 = leftX + CELL_W
j2 = j1    + CELL_W
ellL = j2,  ellR = ellL + ELL_W (60 px)
j3 = ellR
j4 = j3 + CELL_W
```

`CELL_W = 170 px` (with R) or `130 px` (inductor-only).

The ellipsis is three 2.5 px dots at `ellL + 14, 24, 34` on both the
top and bottom wire rails. A minimum `rightX` is enforced so that very
small SVG widths don't compress the layout.

The per-unit parameters are derived from ABCD outputs:
```
r/km = B.re / lineLengthKm
x/km = B.im / lineLengthKm
b/km = (1 / Xc) / lineLengthKm
```
and displayed as a combined label below the bottom rail.

### 8.6 Distributed d/dx Differential View

Shows a single infinitesimal element `z(x)·dx` in a dashed border box,
with ellipsis dots on both sides indicating the infinite repetition, and a
dimension arrow labelled `dx` below the box and `l = … km` spanning the
full wire length.

This is the theoretical "telegrapher's equations" representation rather
than the lumped ladder approximation.

The dashed border is an SVG `<rect>` with `stroke-dasharray: 5,3`.
Two dimension arrows:
1. `dx` between `boxL` and `boxR` (24 px below the bottom rail).
2. `l = X km` between `leftX` and `rightX` (56 px below the bottom rail).

### 8.7 Current Helpers

The circuit and phasor renderers work with currents in kA. Both IR and IS
are sourced from the `outputs` object produced by `computeFromParams`:

- `outputs.Ir_kA` — receiving-end current in kA (complex).
- `outputs.Is_A` — sending-end current in **Amperes** despite the name.

**`_IS_kA(outputs)`** — convenience wrapper that divides `outputs.Is_A`
by 1000 to return IS in kA for use alongside IR in the same coordinate
scale.

### 8.8 Values Table and Labels

**`_circuitValuesTable(svg, sw, sh, entries)`**

Appended directly to the `<svg>` element (not `_circuitG`), so it stays
in the bottom-right corner regardless of pan/zoom. Each row has two
`<text>` elements: a white knockout pass and a dark fill pass
(`paint-order: stroke`) to ensure readability over any background.
The text uses `_svgSubText` for subscript rendering.

**`_svgSubText(el, text)`**

Parses known multi-character symbols (e.g. `IC1`, `VR`, `IS`) using a
longest-match-first table and renders them as:
```
base-letter ＋ subscript <tspan font-size="7" dy="3"> ＋ reset <tspan dy="-3">
```
Unrecognised characters are emitted as plain `<tspan>` runs.
The longest-match ordering is important: `IC1` must be checked before
`IC` to avoid mis-tokenising `IC1` as `IC` + `1`.

**`_circuitLabel(parent, x, y, text, anchor)`**

White-knockout label: two identical `<text>` elements, first with
`stroke: #fff, fill: none` (2-3 px wide halo) then `stroke: none, fill: #333`.

---

## 9. Pane 3 — Phasor Diagram

### 9.1 Scale Computation

Each phasor redraw computes two independent scale factors:

```
TGT  = min(sw, sh) × 0.40     // target arm length in screen px
sV   = TGT / maxV              // px per kV (voltage scale)
sI   = (TGT × 0.50) / maxI    // px per kA (current scale)
```

Current phasors are deliberately drawn at 50% of the voltage target
length so they do not dominate when magnitudes are similar in absolute
terms but very different in units.

`sw` and `sh` are `rw × _viewPhasor.zoom` and `rh × _viewPhasor.zoom`,
where `rw`/`rh` are the real SVG pixel dimensions. Zoom is thus baked
into the scale computation: doubling `_viewPhasor.zoom` doubles all arm
lengths.

### 9.2 Origin Centering: `_phasorOrigin`

```js
function _phasorOrigin(pts, sw, sh, PAD=65, cw=null, ch=null)
  → { ox, oy }
```

`pts` is an array of `{x, y}` objects — the screen-relative tip
positions of all phasors (relative to an unknown origin).

**Algorithm:**

1. Find the bounding box of all tip points: `minX, maxX, minY, maxY`.
2. Compute the translation needed to place the bounding box centred in
   the available area `(cw × ch)` with `PAD` margin on all sides:

$$
o_x = \text{PAD} - x_\text{min} + \frac{\max(0,\ c_w - 2\text{PAD} - (x_\text{max} - x_\text{min}))}{2}
$$
$$
o_y = \text{PAD} - y_\text{min} + \frac{\max(0,\ c_h - 2\text{PAD} - (y_\text{max} - y_\text{min}))}{2}
$$

3. Return `{ox, oy}` as the screen position of the phase reference origin
   (where phasors are drawn from).

The `max(0, …)` clause prevents negative centering when the diagram is
wider than the canvas — in that case the diagram is left/top-aligned with
just the PAD margin.

### 9.3 Short Line Phasor Construction

**Circuit relation:** `VS = VR + IR·(R + jXL)`, `IS = IR`.

**Complex arithmetic** (all units kV or kA):

```
pIR        = outputs.Ir_kA                     kA
pIR·R      = { re: pIR.re·R,    im: pIR.im·R }
pIR·jXL    = { re: −pIR.im·XL,  im: pIR.re·XL }
pVS        = pVR + pIR·R + pIR·jXL
```

**Phasors drawn:**
- VR (dark blue, solid) — reference at ∠0°.
- VS (dark red, solid).
- IR = IS (dark green, dashed).

**Construction guides** (thin dashed gray):
- `IR·R` drop: from the tip of VR to the intermediate point.
- `IR·jXL` drop: from the intermediate point to the tip of VS.
- Small label at each segment midpoint, offset 9 px perpendicularly.

### 9.4 Nominal π Phasor Construction

**Circuit relations:**

```
IC1 = j(Y/2)·VR          (receiving-end shunt charging current)
IL  = IR + IC1            (line current through series Z)
VS  = VR + IL·R + IL·jXL  (voltage at sending end)
IC2 = j(Y/2)·VS           (sending-end shunt charging current)
IS  = IL + IC2             (total sending-end current)
```

**Complex multiplications:**

```
IC1.re = −VR.im / (2·Xc) = 0    (since VR is at 0°, VR.im = 0)
IC1.im = +VR.re / (2·Xc)        → IC1 leads VR by 90°
IL     = { re: IR.re + IC1.re,  im: IR.im + IC1.im }
IL·R   = { re: IL.re·R,         im: IL.im·R }
IL·jXL = { re: −IL.im·XL,       im: IL.re·XL }
VS     = VR + IL·R + IL·jXL
IC2.re = −VS.im / (2·Xc)
IC2.im = +VS.re / (2·Xc)
IS     = IL + IC2
```

**Phasors drawn** (7 vectors, all from origin):

| Name | Colour | Style |
|---|---|---|
| VR | dark blue | solid |
| VS | dark red | solid |
| IR | dark green | dashed |
| IC1 | purple | dashed |
| IL | teal | solid |
| IC2 | purple | dashed |
| IS | brown | dashed |

**Construction guides:**
- `IL·R` and `IL·jXL` voltage drops chained from VR tip (gray dashed arrows).
- Thin light-gray head-to-tail lines: IC1 from IR tip (→ IL tip), IC2 from IL tip (→ IS tip).

### 9.5 Distributed Phasor

Draws only four phasors from the origin: VR, VS, IR, IS. No construction
guides are drawn because the distributed line's complex hyperbolic ABCD
parameters don't decompose cleanly into resistive and reactive drops.

### 9.6 Legend and Labels Overlay

**`_phasorLegend(svg, sh, scale_V, scale_I, cV, cI)`**

In live (interactive) mode, writes HTML into `_phasorLegendEl` (the DOM
bottom bar element): two rows with a small coloured line swatch and a
text label showing the scale (e.g. `1 kV = 45.3 px`).

In PDF export mode (`_phasorLegendEl = null`), draws two SVG `<line>`
elements directly into the SVG at the bottom-left corner.

**`_phasorChkWrap`** (the "Labels" checkbox row) is hidden until the
first successful compute. After `_redrawPhasor` is called with data, it
is made visible with `style.display = ''`.

---

## 10. PDF Export Renderers

Three functions create standalone `<svg>` elements (with `viewBox` and
`xmlns` attributes) serialised with `XMLSerializer.serializeToString`.
They are used by `batch.js` to embed diagrams in the HTML report before
PDF print.

| Function | Default `w × h` |
|---|---|
| `renderArrangementSvgStr` | 700 × 240 px |
| `renderCircuitSvgStr` | 700 × 210 px (distributed: forced ≥ 820 wide) |
| `renderPhasorSvgStr` | 700 × 260 px |

**Arrangement export** uses fixed good-looking mode (no `_toScale`).
It computes its own `scale` and `tx`/`ty` from the SVG canvas size and
a `PAD = 55 px` margin. To call `_drawPhaseDim` (which reads `_bs.tx`,
`_bs.ty`, `_view.zoom`) with the correct values, it **temporarily mutates
these module globals**, restoring them immediately after — safe in
single-threaded JavaScript.

**Phasor export** temporarily sets `_phasorLegendEl = null` so that
`_phasorLegend` writes into the SVG instead of the live DOM bottom bar.
The `_savedLegendEl` is restored after rendering.

Both patterns are documented with inline comments explaining the override.

---

## 11. SVG Rendering Conventions

| Convention | Rule |
|---|---|
| **Arrowhead** | Filled `<polygon>` with tip at `(tipX, tipY)`, pointing in direction `(dirX, dirY)` (unit vector). Base width = `2·AW`, length = `AL`. |
| **White knockout** | Text rendered twice: first pass `stroke: #fff, fill: none` (halo); second pass `stroke: none, fill: colour`. Prevents text from becoming unreadable over arrows or dim lines. |
| **Font** | `'Pixelated MS Sans Serif', 'MS Sans Serif', sans-serif` — the Win98 system font loaded by 98.css via CDN. |
| **No viewBox** | Interactive SVGs have no `viewBox`. They use `width:100%; height:100%` so screen px = SVG user units. Transformations are in pixels. |
| **Namespace** | All SVG elements are created with `document.createElementNS(SVG_NS, tag)` where `SVG_NS = 'http://www.w3.org/2000/svg'`. |

---

## 12. Constants Reference

| Constant | Value | Meaning |
|---|---|---|
| `MIN_R_PX` | `3` | Minimum sub-conductor radius in screen pixels (currently unused — `FIXED_R_PX` is used instead) |
| `FIXED_R_PX` | `7` | Sub-conductor radius in good-looking mode |
| `TO_SCALE_R_PX` | `4` | Sub-conductor radius in to-scale mode (not used; `rPhys × scale` is used instead) |
| `FIXED_SC_SPACING_PX` | `30` | Sub-conductor spacing in good-looking mode |
| `DPANE_ANIM_MS` | `150` | Maximize/restore outline animation duration (ms) |
| `MENU_ANIMATION_DURATION_MS` | — | Imported from `timingConfig.js`, not defined here |
