/**
 * calcViewer.js (window module)
 *
 * Fetches docs/calculations.html, injects it into #win-calc-viewer, then
 * fires KaTeX auto-render to typeset all LaTeX math.
 *
 * KaTeX is loaded as a deferred <script> in index.html; we wait for the
 * 'katex:ready' custom event before calling renderMathInElement.
 */
import { raiseWindow } from '../components/windowManager.js';

const DOC_PATH = 'docs/calculations.html';

export function initCalcViewerWindow(/* viewport */) {
  const btn = document.getElementById('btn-view-calc');
  if (btn) btn.addEventListener('click', () => _open());

  const printBtn = document.getElementById('calc-viewer-print');
  if (printBtn) printBtn.addEventListener('click', _print);
}

// ─── Open / lazy-load ────────────────────────────────────────────────────────

let _loaded = false;

async function _open() {
  const win = document.getElementById('win-calc-viewer');
  if (!win) return;

  // Responsive size, centered over the analyzer window
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isMobile = vw < 700;
  const w = Math.round(isMobile ? Math.min(vw, 480) : Math.min(vw * 0.85, 820));
  const h = Math.round(isMobile ? Math.min(vh, 520) : Math.min(vh * 0.85, 600));
  win.style.width  = w + 'px';
  win.style.height = h + 'px';

  const analyzer = document.getElementById('win-notepad');
  let cx, cy;
  if (analyzer) {
    cx = analyzer.offsetLeft + analyzer.offsetWidth  / 2;
    cy = analyzer.offsetTop  + analyzer.offsetHeight / 2;
  } else {
    cx = vw / 2;
    cy = vh / 2;
  }
  win.style.left = Math.round(Math.max(0, cx - w / 2)) + 'px';
  win.style.top  = Math.round(Math.max(0, cy - h / 2)) + 'px';

  raiseWindow(win);

  if (_loaded) return;
  _loaded = true;

  const content = document.getElementById('calc-viewer-content');
  if (!content) return;
  content.innerHTML = 'Loading…';

  try {
    const resp = await fetch(DOC_PATH);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    content.innerHTML = html;
    await _renderMath(content);
  } catch (err) {
    content.innerHTML = `<p style="color:#c00">Could not load ${DOC_PATH}: ${err.message}</p>`;
  }
}

// ─── KaTeX rendering ─────────────────────────────────────────────────────────

function _renderMath(el) {
  return new Promise(resolve => {
    function _run() {
      if (typeof window.renderMathInElement === 'function') {
        window.renderMathInElement(el, {
          delimiters: [
            { left: '$$',   right: '$$',   display: true  },
            { left: '\\[',  right: '\\]',  display: true  },
            { left: '\\(',  right: '\\)',  display: false },
          ],
          throwOnError: false,
        });
        resolve();
      } else {
        // KaTeX auto-render not yet loaded — wait for the ready event
        document.addEventListener('katex:ready', () => {
          window.renderMathInElement(el, {
            delimiters: [
              { left: '$$',   right: '$$',   display: true  },
              { left: '\\[',  right: '\\]',  display: true  },
              { left: '\\(',  right: '\\)',  display: false },
            ],
            throwOnError: false,
          });
          resolve();
        }, { once: true });
      }
    }
    _run();
  });
}

// ─── Print ───────────────────────────────────────────────────────────────────

function _print() {
  const content = document.getElementById('calc-viewer-content');
  if (!content) return;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Transmission Line — Calculations</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"/>
  <style>
    body { font-family: serif; font-size: 13pt; max-width: 900px; margin: 2cm auto; color: #000; }
    h2 { font-size: 18pt; border-bottom: 1px solid #000; padding-bottom: 4px; }
    h3 { font-size: 14pt; margin-top: 1.5em; }
    h4 { font-size: 12pt; margin-top: 1em; }
    p  { line-height: 1.6; }
    .katex-display { margin: 1em 0; overflow: visible; padding-bottom: 0.2em; }
  </style>
</head>
<body>
${content.innerHTML}
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
