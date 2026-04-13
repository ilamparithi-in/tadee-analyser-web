/**
 * taskbar.js — Win98-style taskbar initialiser.
 *
 * Responsibilities:
 *   - Wire up the Start button (no menu yet)
 *
 * @param {HTMLElement} taskbarEl — the #taskbar element
 */
export function initTaskbar(taskbarEl) {
  const startBtn = taskbarEl.querySelector('#start-btn');
  if (!startBtn) return;

  startBtn.addEventListener('click', () => {
    // Start menu not yet implemented
  });
}
