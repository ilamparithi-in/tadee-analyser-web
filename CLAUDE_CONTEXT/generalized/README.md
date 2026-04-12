# Generalized UI Engineering Rules

These rules are extracted from the `tadee-analyser-web` project (Windows 98-styled engineering analysis tool) and rewritten to apply to **any UI project** — engineering tools, signal processing dashboards, data visualizers, or general web applications.

Each file contains:
- **General principle** (applies anywhere)
- **Project example** (concrete case from this codebase)

---

## Files

| File | Contents |
|---|---|
| [A_ui_design_principles.md](A_ui_design_principles.md) | Design systems, forbidden pixel regions, layering, scroll behavior |
| [B_interaction_design_patterns.md](B_interaction_design_patterns.md) | State machine menus, animation model, rapid interaction, class conventions |
| [C_layout_system_patterns.md](C_layout_system_patterns.md) | Panel/splitter layout, scroll containment, width propagation, status bar |
| [D_data_display_patterns.md](D_data_display_patterns.md) | Data-driven grids, sticky headers, independent column resize |
| [E_rendering_integration_rules.md](E_rendering_integration_rules.md) | CSS layout vs rendering engine, resize handling, CDN importmap |
| [F_architecture_principles.md](F_architecture_principles.md) | Modular components, separation of concerns, UI state model, no-build |
| [G_debugging_principles.md](G_debugging_principles.md) | Diagnose first, layout vs rendering vs logic, debugging checklists |

---

## How to Use in Other Projects

### Signal Processing / Speech Analysis UI
- **D** — grid patterns apply directly to spectrogram or feature table displays
- **E** — canvas resize rules apply to any WebGL/Canvas 2D rendering viewport
- **G** — misdiagnosis table is directly applicable for canvas/overlay bugs

### Engineering Calculation Tools
- **C** — panel layout + splitter pattern works for any tool with input form + result area
- **D** — independent column resize for parameter comparison tables
- **F** — UI state model keeps calculation state separate from display state

### Visualization Dashboards
- **A** — forbidden pixel region rule applies to any chart panel with borders/shadows
- **B** — state machine pattern applies to tabbed panels, filter dropdowns, overlay menus
- **E** — resize handling pattern works for Chart.js, D3, Plotly, or any canvas-based chart

---

## Invariants (Must Not Be Violated in Any Project)

1. `border-collapse: separate; border-spacing: 0` — never `collapse` with sticky headers
2. Rendering engine resize: always pass `updateStyle: false` equivalent (engine-specific)
3. Resize throttle: size-change comparison guard, not `rafPending` when a render loop is active
4. Sticky corner cell: single-axis sticky only — parent row provides the other axis
5. Column resize: explicit table width at init; delta-only updates on drag
