/**
 * panels.js — reusable draggable splitter logic for panel layouts.
 * Resizes panels by updating CSS variables on the layout root element.
 */

const MIN_LEFT_WIDTH    = 120; // px
const MIN_BOTTOM_HEIGHT =  40; // px

/**
 * @param {HTMLElement} layoutEl  — #panel-layout root
 */
export function initPanelLayout(layoutEl) {
  const panelLeft   = layoutEl.querySelector('#panel-left');
  const panelBottom = layoutEl.querySelector('#panel-bottom');
  const splitterV   = layoutEl.querySelector('#splitter-v');
  const splitterH   = layoutEl.querySelector('#splitter-h');

  // --- Vertical splitter (left ↔ right) ---
  splitterV.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    splitterV.setPointerCapture(e.pointerId);
    const startX     = e.clientX;
    const startWidth = panelLeft.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e) {
      const newWidth = Math.max(MIN_LEFT_WIDTH, startWidth + (e.clientX - startX));
      layoutEl.style.setProperty('--left-width', newWidth + 'px');
    }

    function onUp() {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      splitterV.removeEventListener('pointermove', onMove);
      splitterV.removeEventListener('pointerup',   onUp);
    }

    splitterV.addEventListener('pointermove', onMove);
    splitterV.addEventListener('pointerup',   onUp);
  });

  // --- Horizontal splitter (top ↔ bottom) ---
  splitterH.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    splitterH.setPointerCapture(e.pointerId);
    const startY      = e.clientY;
    const startHeight = panelBottom.getBoundingClientRect().height;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    function onMove(e) {
      // dragging down (delta > 0) → bottom shrinks
      const newHeight = Math.max(MIN_BOTTOM_HEIGHT, startHeight - (e.clientY - startY));
      layoutEl.style.setProperty('--bottom-height', newHeight + 'px');
    }

    function onUp() {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      splitterH.removeEventListener('pointermove', onMove);
      splitterH.removeEventListener('pointerup',   onUp);
    }

    splitterH.addEventListener('pointermove', onMove);
    splitterH.addEventListener('pointerup',   onUp);
  });
}
