# TADEE Transmission Line Analyser

A browser-based tool for analysing balanced three-phase AC overhead transmission lines using standard ABCD-parameter methods. Built with a Windows 98-style interface using [98.css](https://github.com/jdan/98.css).

**TADEE Group 4 — Version 1.1**

---

## Overview

The TADEE Analyser models single-circuit bundled-conductor overhead transmission lines. Three line models are supported:

| Model | Suitable for | Description |
|---|---|---|
| **Short** | < 80 km | Series impedance only; shunt capacitance neglected |
| **Nominal π** | 80 – 250 km | Shunt capacitance split equally at each end |
| **Distributed** | > 250 km | Exact hyperbolic solution using distributed parameters |

---

## Features

### Input Parameters
- Line length, receiving-end load, power factor, nominal voltage, and frequency
- Symmetrical (single D) or unsymmetrical (Dab, Dbc, Dca) conductor geometry
- Bundled conductor support: 1–4 sub-conductors per bundle with configurable spacing
- Conductor strand count, strand diameter, and AC resistance per unit length

### Results
- Inductance and capacitance per phase per km
- Inductive and capacitive reactance
- ABCD generalised circuit constants (polar form)
- Sending-end voltage (phase and line-to-line), sending-end current, and charging current
- Voltage regulation, three-phase power loss, transmission efficiency
- Surge impedance (Zc) and surge impedance loading (SIL)

### Canvas Diagrams
Three interactive diagram subpanes, each supporting scroll-wheel zoom and click-and-drag pan:
- **Conductor Arrangement** — cross-section view with GMD/GMR annotations; optional to-scale rendering
- **Circuit Diagram** — equivalent circuit schematic for the selected model; distributed model includes ladder and d/dx differential views
- **Phasor Diagram** — Vs, Vr, Is, Ir phasors at correct magnitudes and angles

### File Operations
- **Save / Open** — save and restore input parameters as JSON
- **Export result as** — PDF report, JSON, plain text, or Markdown
- **Batch Mode** — run the analyser over many parameter combinations at once, via a range sweep or a loaded JSON file (array-of-objects or object-of-arrays format); export all results as JSON or multi-page PDF

---

## Running Locally

The app uses ES modules and must be served over HTTP — opening `index.html` directly from the filesystem (`file://`) will not work.

**Python (recommended):**
```bash
cd tadee-analyser-web
python3 -m http.server 8080
```
Then open [http://localhost:8080](http://localhost:8080) in your browser.

**Node.js (npx serve):**
```bash
npx serve .
```

**VS Code Live Server extension:** right-click `index.html` → *Open with Live Server*.

> Internet access is required for CDN-loaded assets (98.css fonts, KaTeX). The app will still function without it, but fonts and math rendering may degrade.

---

## Dependencies

All dependencies are loaded from CDN — no build step or package manager required.

| Library | Purpose | Licence |
|---|---|---|
| [98.css](https://github.com/jdan/98.css) | Windows 98-style UI | MIT |
| [KaTeX](https://katex.org/) v0.16.11 | Math typesetting | MIT |
| [Win98 Icons](https://win98icons.alexmeub.com/) | Icon set by Alex Meub | — |

---

## Licence

Copyright © 2026 Ilamparithi Murali. Released under the [MIT License](LICENSE).

Windows® is a registered trademark of Microsoft Corporation. This project is not affiliated with or endorsed by Microsoft Corporation.

---

*Dedicated to the past, present and future efforts of Dr. M. P. Selvan.*

