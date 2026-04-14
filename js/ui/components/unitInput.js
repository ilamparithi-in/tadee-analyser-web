/**
 * unitInput.js — unit conversion for labelled number inputs.
 *
 * Each unit <select> carries:
 *   data-unit-for="<input-id>"   — target input
 *   data-base-unit="<label>"     — the canonical unit used for computation
 *
 * Each <option> carries:
 *   data-to-base="<factor>"      — multiply displayed value by this to get base-unit value
 *
 * When the user switches unit, the displayed value is converted so the
 * underlying quantity stays the same. getBaseValue(inputId) returns the value
 * expressed in the base unit, ready for computation.
 */

/**
 * @param {HTMLElement} formEl — the <form> (or any ancestor) containing the unit selects
 */
export function initUnitInputs(formEl) {
  formEl.querySelectorAll('select[data-unit-for]').forEach(sel => _wire(sel));
}

/**
 * Return the value of an input converted to its base unit.
 * Returns NaN if the input is empty or non-numeric.
 * @param {string} inputId
 * @param {HTMLElement} [scope=document]
 */
export function getBaseValue(inputId, scope = document) {
  const input = scope.getElementById(inputId);
  if (!input) return NaN;
  const sel = scope.querySelector(`select[data-unit-for="${inputId}"]`);
  const raw = parseFloat(input.value);
  if (!sel || isNaN(raw)) return raw;
  const factor = parseFloat(sel.selectedOptions[0]?.dataset.toBase ?? '1');
  return raw * factor;
}

// ─── Internal ────────────────────────────────────────────────────────────────

function _wire(sel) {
  let prevFactor = _selectedFactor(sel);

  sel.addEventListener('change', () => {
    const inputEl = document.getElementById(sel.dataset.unitFor);
    if (!inputEl) return;

    const newFactor = _selectedFactor(sel);
    const raw = parseFloat(inputEl.value);

    if (!isNaN(raw) && prevFactor !== 0) {
      // Convert: base_value = raw * prevFactor  →  new_display = base_value / newFactor
      const baseValue  = raw * prevFactor;
      const newDisplay = baseValue / newFactor;
      // Round to avoid floating-point noise (up to 10 significant figures)
      inputEl.value = parseFloat(newDisplay.toPrecision(10));
    }

    prevFactor = newFactor;
  });
}

function _selectedFactor(sel) {
  return parseFloat(sel.selectedOptions[0]?.dataset.toBase ?? '1');
}
