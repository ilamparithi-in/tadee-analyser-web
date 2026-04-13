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
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      // Start menu not yet implemented
    });
  }

  const clock = taskbarEl.querySelector('#taskbar-clock');
  if (clock) {
    const tick = () => {
      const now = new Date();
      clock.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };
    tick();
    setInterval(tick, 1000);
  }
}
