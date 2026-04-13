// taskbar.js — OS-level taskbar: start button toggle, outside-click close, live clock

export function initTaskbar() {
  const startBtn  = document.getElementById('start-btn');
  const startMenu = document.getElementById('start-menu');
  const clock     = document.getElementById('clock');

  // Toggle start menu on button click
  startBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (startMenu.hasAttribute('hidden')) {
      startMenu.removeAttribute('hidden');
      // Force reflow so removing+re-adding the class restarts the animation
      startMenu.classList.remove('animate-open');
      void startMenu.offsetWidth;
      startMenu.classList.add('animate-open');
    } else {
      startMenu.setAttribute('hidden', '');
      startMenu.classList.remove('animate-open');
    }
  });

  // Close start menu when clicking anywhere outside it or the start button
  document.addEventListener('click', () => {
    startMenu.setAttribute('hidden', '');
  });

  // Close menu when an item is clicked; stop propagation so outside-click listener doesn't double-fire
  startMenu.addEventListener('click', (e) => {
    if (e.target.classList.contains('start-menu-item')) {
      startMenu.setAttribute('hidden', '');
    }
    e.stopPropagation();
  });

  // Live clock
  function updateClock() {
    const now = new Date();
    clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  updateClock();
  setInterval(updateClock, 1000);
}

initTaskbar();
