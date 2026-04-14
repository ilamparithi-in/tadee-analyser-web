/**
 * menuSystem.js
 * Handles menu bar open/close logic, animation suppression for rapid
 * interactions, and hover-switching between menu items.
 */

import { MENU_ANIMATION_DURATION_MS, RAPID_REOPEN_THRESHOLD_MS } from './timingConfig.js';
import { applyConditionalAnimation } from './animationUtils.js';

const ANIM_CLASS = 'animate-open';

/**
 * Initialise a menu bar element.
 * @param {HTMLElement} menuBarEl - The nav element with id/class "menu-bar"
 */
export function initMenuBar(menuBarEl) {
  const menuItems = menuBarEl.querySelectorAll('.menu-item');

  // Internal state
  const state = {
    isMenuOpen: false,
    activeMenu: null,      // currently open .menu-item element
    lastClosedAt: 0,       // timestamp of last close
  };

  function shouldAnimate() {
    // Suppress animation on rapid reopen or during hover-switch
    const timeSinceClose = Date.now() - state.lastClosedAt;
    return timeSinceClose > RAPID_REOPEN_THRESHOLD_MS;
  }

  function openMenu(item) {
    const inner = item.querySelector('.dropdown-inner');
    if (!inner) return;

    const animate = shouldAnimate(); // always animate on hover-switch (Win98 behaviour)
    closeAll(false); // close without updating timestamp (hover-switch)

    item.classList.add('open');
    applyConditionalAnimation(inner, ANIM_CLASS, animate);

    state.isMenuOpen = true;
    state.activeMenu = item;
  }

  function closeAll(updateTimestamp = true) {
    menuItems.forEach(item => item.classList.remove('open'));
    if (updateTimestamp) {
      state.lastClosedAt = Date.now();
    }
    state.isMenuOpen = false;
    state.activeMenu = null;
  }

  menuItems.forEach(item => {
    const btn = item.querySelector(':scope > button');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item === state.activeMenu) {
        closeAll();
      } else {
        openMenu(item);
      }
    });

    // Hover-switch: if any menu already open, switch instantly (no animation)
    btn.addEventListener('mouseenter', () => {
      if (state.isMenuOpen && item !== state.activeMenu) {
        openMenu(item);
      }
    });
  });

  document.addEventListener('click', () => closeAll());
}
