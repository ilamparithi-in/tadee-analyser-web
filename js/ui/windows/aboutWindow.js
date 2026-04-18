/**
 * aboutWindow.js — About window module.
 *
 * Singleton window; resizable.
 * Auto-sizes to fit content exactly (no initial scrollbars), capped to viewport.
 * OK button closes the window.
 *
 * Exposes:
 *   openAboutWindow(viewport) — open or raise the About window.
 */

import { openWindow }  from '../components/createWindow.js';
import { raiseWindow } from '../components/windowManager.js';

// ─── Module state ─────────────────────────────────────────────────────────────
let _win = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _extLink(url, label) {
  return `<a href="#" data-ext="${url}">${label}</a>`;
}

/**
 * Measure the natural scrollHeight of `el` when laid out at `width` px.
 * The element is temporarily attached to a hidden off-screen probe.
 */
function _measureHeight(el, width) {
  const probe = document.createElement('div');
  probe.style.cssText =
    `position:absolute;visibility:hidden;top:-9999px;left:0;width:${width}px;`;
  document.body.appendChild(probe);
  probe.appendChild(el);
  const h = probe.scrollHeight;
  probe.remove(); // el is detached again
  return h;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function openAboutWindow(viewport) {
  if (_win) {
    raiseWindow(_win);
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex; flex-direction:column; height:100%;';

  const body = document.createElement('div');
  body.style.cssText = 'padding: 12px 16px; font-size: 11px; display: flex; flex-direction: column; gap: 0; flex:1; min-height:0; overflow-y:auto;';
  body.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
      <img src="media/icons/network_drive-16x16.png" width="32" height="32" alt="" style="image-rendering:pixelated; flex-shrink:0;">
      <div>
        <div style="font-weight:bold; font-size:13px;">TADEE Transmission Line Analyser</div>
        <div style="color:#555;">Three-Phase Single-Circuit Bundled Conductor Transmission System</div>
        <div style="margin-top:2px;">Version 1.0 &nbsp;&mdash;&nbsp; TADEE Group 4</div>
      </div>
    </div>
    <hr style="margin:0 0 8px;" />

    <div style="display:flex; flex-direction:column; gap:10px;">

      <div>
        <div style="font-weight:bold; margin-bottom:3px;">Source Code</div>
        <div>${_extLink('https://github.com/ilamparithi-in/tadee-analyser-web', 'github.com/ilamparithi-in/tadee-analyser-web')}</div>
      </div>

      <div>
        <div style="font-weight:bold; margin-bottom:3px;">Licence</div>
        <div>Copyright &copy; 2026 Ilamparithi Murali.</div>
        <div style="margin-top:3px;">
          This software is released under the
          ${_extLink('https://opensource.org/licenses/MIT', 'MIT License')}.
          Permission is hereby granted, free of charge, to any person obtaining a copy
          of this software and associated documentation files, to deal in the Software
          without restriction, including without limitation the rights to use, copy,
          modify, merge, publish, distribute, sublicense, and/or sell copies of the
          Software, subject to the above copyright notice and this permission notice
          being included in all copies or substantial portions of the Software.
        </div>
        <div style="margin-top:3px; color:#555;">
          THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
          IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
          FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
          AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
          LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
          OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
          THE SOFTWARE.
        </div>
      </div>

      <div>
        <div style="font-weight:bold; margin-bottom:3px;">Open-Source Attributions</div>
        <table style="border-collapse:collapse; width:100%; background:#c0c0c0; border:2px solid; border-color:#fff #808080 #808080 #fff;">
          <thead>
            <tr style="background:#000080; color:#fff;">
              <th style="padding:2px 8px; text-align:left; font-weight:normal; white-space:nowrap;">Library</th>
              <th style="padding:2px 8px; text-align:left; font-weight:normal;">Description</th>
              <th style="padding:2px 8px; text-align:left; font-weight:normal; white-space:nowrap;">Licence</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid #808080;">
              <td style="padding:2px 8px; white-space:nowrap;">${_extLink('https://github.com/jdan/98.css', '98.css')}</td>
              <td style="padding:2px 8px;">Windows 98-style CSS library by Jordan Scales.</td>
              <td style="padding:2px 8px; white-space:nowrap;">MIT</td>
            </tr>
            <tr style="border-bottom:1px solid #808080;">
              <td style="padding:2px 8px; white-space:nowrap;">${_extLink('https://katex.org/', 'KaTeX')} v0.16.11</td>
              <td style="padding:2px 8px;">Math typesetting. &copy; Khan Academy and contributors.</td>
              <td style="padding:2px 8px; white-space:nowrap;">MIT</td>
            </tr>
            <tr>
              <td style="padding:2px 8px; white-space:nowrap;">${_extLink('https://win98icons.alexmeub.com/', 'Win98 Icons')}</td>
              <td style="padding:2px 8px;">Windows 98-era icon set by Alex Meub.</td>
              <td style="padding:2px 8px; white-space:nowrap;">&mdash;</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <div style="font-weight:bold; margin-bottom:3px;">Trademark Notice</div>
        <div style="color:#555;">
          Windows&reg; is a registered trademark of Microsoft Corporation.
          This project is not affiliated with or endorsed by Microsoft Corporation.
        </div>
      </div>

      <div style="border-top:1px solid #c0c0c0; padding-top:8px; font-style:italic; color:#444;">
        Dedicated to the past, present and future efforts of Dr.&nbsp;M.&nbsp;P.&nbsp;Selvan.
      </div>

    </div>
  `;

  const footer = document.createElement('div');
  footer.style.cssText = 'padding: 6px 16px 8px; display:flex; justify-content:flex-end; border-top:1px solid #808080;';
  footer.innerHTML = `<button id="about-ok-btn" style="width:75px;">OK</button>`;

  // ── Compute dimensions to fit content without scrollbars ──────────────────
  // IMPORTANT: measure BEFORE appending to wrapper — _measureHeight moves the
  // element into an off-screen probe, which would detach it from wrapper.
  // Title bar ≈ 27px + 2px window border top/bottom + 4px window-body padding top/bottom = ~35px
  const CHROME_H  = 36;
  const MARGIN    = 40; // breathing room from viewport edges
  const vpW       = viewport.clientWidth;
  const vpH       = viewport.clientHeight;
  const winW      = Math.min(480, vpW - MARGIN);
  // Measure content at target inner width (subtract ~8px for window borders)
  // Add ~35px for the fixed footer (padding 6+8 + border 1 + button ~21)
  const FOOTER_H  = 36;
  const contentH  = _measureHeight(body, winW - 8);

  wrapper.appendChild(body);
  wrapper.appendChild(footer);
  const winH      = Math.min(contentH + CHROME_H + FOOTER_H, vpH - MARGIN);

  _win = openWindow({
    title:       'About TADEE Analyser',
    width:       winW,
    height:      winH,
    resizable:   true,
    maximizable: false,
    content:     wrapper,
  }, viewport);

  // Make the window a flex column so window-body fills remaining height
  _win.style.display       = 'flex';
  _win.style.flexDirection = 'column';
  const wb = _win.querySelector('.window-body');
  if (wb) {
    wb.style.cssText += ';flex:1;min-height:0;overflow:hidden;padding:0;display:flex;flex-direction:column;';
  }

  // Wire external links — open in new tab
  _win.querySelectorAll('a[data-ext]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      window.open(a.dataset.ext, '_blank', 'noopener,noreferrer');
    });
  });

  // Wire OK button
  _win.querySelector('#about-ok-btn')?.addEventListener('click', () => {
    _win.querySelector('[aria-label="Close"]')?.click();
  });

  _win._closeGuard = (proceed) => { _win = null; proceed(); };
}
