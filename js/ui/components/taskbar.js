/**
 * taskbar.js — Win98 taskbar and start menu
 *
 * Responsibilities:
 *   - Clock: updates every second, HH:MM format
 *   - Start button: toggles start menu open/closed (instant, no animation)
 *   - Outside click: closes start menu when clicking anywhere outside it
 */

const startBtn  = document.getElementById('start-btn');
const startMenu = document.getElementById('start-menu');
const clock     = document.getElementById('taskbar-clock');

// ── Clock ─────────────────────────────────────────────────────────────────────

function updateClock() {
  const now = new Date();
  const h   = String(now.getHours()).padStart(2, '0');
  const m   = String(now.getMinutes()).padStart(2, '0');
  clock.textContent = `${h}:${m}`;
}

updateClock();
setInterval(updateClock, 1000);

// ── Start menu toggle ─────────────────────────────────────────────────────────

function openMenu() {
  startMenu.classList.add('open');
  startBtn.classList.add('active');
}

function closeMenu() {
  startMenu.classList.remove('open');
  startBtn.classList.remove('active');
}

function isMenuOpen() {
  return startMenu.classList.contains('open');
}

startBtn.addEventListener('click', e => {
  e.stopPropagation(); // prevent document handler from immediately closing
  if (isMenuOpen()) closeMenu();
  else              openMenu();
});

// ── Outside click — closes menu ───────────────────────────────────────────────

document.addEventListener('click', e => {
  if (!isMenuOpen()) return;
  // Close unless the click was inside the start menu itself
  if (!startMenu.contains(e.target)) {
    closeMenu();
  }
});
