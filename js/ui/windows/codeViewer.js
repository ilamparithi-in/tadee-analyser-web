/**
 * codeViewer.js (window module)
 *
 * Fetches js/tadee.js from the server and renders it with lightweight
 * regex-based syntax highlighting inside #win-code-viewer.
 *
 * The window is authored statically in index.html and registered by
 * initWindowManager automatically — this module only wires up content.
 */
import { raiseWindow } from '../components/windowManager.js';

const SOURCE_PATH = 'js/tadee.js';

export function initCodeViewerWindow(/* viewport */) {
  // Content is lazy-loaded the first time the window is opened.
  // The btn-view-code button in the analyzer toolbar triggers open.
  const btn = document.getElementById('btn-view-code');
  if (btn) {
    btn.addEventListener('click', () => _open());
  }
}

// ─── Open / lazy-load ────────────────────────────────────────────────────────

let _loaded = false;

async function _open() {
  const win = document.getElementById('win-code-viewer');
  if (!win) return;

  // Set a viewport-responsive size (same pattern as the analyzer window)
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isMobile = vw < 700;
  const w = Math.round(isMobile ? Math.min(vw, 460)  : Math.min(vw * 0.85, 780));
  const h = Math.round(isMobile ? Math.min(vh, 480)  : Math.min(vh * 0.85, 520));
  win.style.width  = w + 'px';
  win.style.height = h + 'px';

  // Center over the analyzer window if it exists, otherwise center in viewport
  const analyzer = document.getElementById('win-analyser');
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

  if (!_loaded) {
    _loaded = true;
    const codeEl = document.getElementById('code-viewer-code');
    if (codeEl) codeEl.innerHTML = 'Loading…';
    try {
      const resp = await fetch(SOURCE_PATH);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const src = await resp.text();
      const highlighted = _highlight(src);
      if (codeEl) codeEl.innerHTML = highlighted;

      // Build line-number gutter from the rendered text content so the count
      // always matches the visual lines exactly (trailing newline excluded).
      const pre = document.getElementById('code-viewer-pre');
      if (pre && codeEl && !document.getElementById('code-viewer-linenos')) {
        const lines = codeEl.textContent.replace(/\n$/, '').split('\n');
        const gutter = document.createElement('span');
        gutter.id = 'code-viewer-linenos';
        gutter.setAttribute('aria-hidden', 'true');
        gutter.textContent = lines.map((_, i) => i + 1).join('\n');
        pre.insertBefore(gutter, codeEl);
      }
    } catch (err) {
      const codeEl = document.getElementById('code-viewer-code');
      if (codeEl) {
        codeEl.textContent = `Could not load ${SOURCE_PATH}:\n${err.message}`;
        codeEl.style.color = '#f44';
      }
    }
  }
}

// ─── Syntax highlighter ──────────────────────────────────────────────────────
//
// Strategy: tokenise left-to-right with a single regex alternation.
// Order matters — longer / more specific patterns first.

const KEYWORDS = new Set([
  'break','case','catch','class','const','continue','debugger','default',
  'delete','do','else','export','extends','finally','for','from','function',
  'if','import','in','instanceof','let','new','of','return','static',
  'super','switch','this','throw','try','typeof','var','void','while','with',
  'yield','async','await','null','undefined','true','false','NaN','Infinity',
  'Math','Number','String','Array','Object','Promise','Error',
]);

// Token types in order of priority (first match wins)
const TOKEN_RE = new RegExp(
  [
    // 1. Line comments
    '(\\/\\/[^\\n]*)',
    // 2. Block comments
    '(\\/\\*[\\s\\S]*?\\*\\/)',
    // 3. Template literal (backtick) — catch before strings
    '(`(?:[^`\\\\]|\\\\.)*`)',
    // 4. Double-quoted string
    '("(?:[^"\\\\]|\\\\.)*")',
    // 5. Single-quoted string
    "('(?:[^'\\\\]|\\\\.)*')",
    // 6. Numbers (hex, float, int)
    '(\\b0x[0-9a-fA-F]+\\b|\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)',
    // 7. Identifiers — classify as keyword / class / function-call / plain
    '([A-Za-z_$][\\w$]*)',
    // 8. Everything else (operators, punctuation, whitespace)
    '([^])',
  ].join('|'),
  'g',
);

function _escape(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _highlight(src) {
  let out = '';
  let prev = '';   // previous non-whitespace token text (for fn-name detection)

  TOKEN_RE.lastIndex = 0;
  for (const m of src.matchAll(TOKEN_RE)) {
    const [, lineCmt, blockCmt, tmpl, dstr, sstr, num, ident, other] = m;

    if (lineCmt || blockCmt) {
      out += `<span class="cv-cmt">${_escape(m[0])}</span>`;
    } else if (tmpl || dstr || sstr) {
      out += `<span class="cv-str">${_escape(m[0])}</span>`;
    } else if (num) {
      out += `<span class="cv-num">${_escape(num)}</span>`;
    } else if (ident) {
      const e = _escape(ident);
      if (KEYWORDS.has(ident)) {
        out += `<span class="cv-kw">${e}</span>`;
        prev = ident;
        continue;
      }
      // Class name: PascalCase and preceded by 'class' or 'new' or 'extends'
      if (/^[A-Z]/.test(ident) &&
          (prev === 'class' || prev === 'new' || prev === 'extends')) {
        out += `<span class="cv-cls">${e}</span>`;
      } else if (prev === 'function' || prev === '.') {
        // Function declaration name, or method/property after dot
        out += `<span class="cv-fn">${e}</span>`;
      } else {
        out += e;
      }
      prev = ident;
      continue;
    } else if (other) {
      const e = _escape(other);
      out += e;
      if (other.trim()) prev = other; // track operators/punctuation
      continue;
    }

    prev = m[0].trim() ? m[0] : prev;
  }

  return out;
}
