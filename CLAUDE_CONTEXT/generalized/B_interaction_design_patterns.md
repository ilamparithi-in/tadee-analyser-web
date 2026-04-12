# B. Interaction Design Patterns

## Menu System — State Machine Model

**Principle:** Any multi-item reveal system (menus, tabs, accordions) should be modelled as an explicit state machine with a single source of truth. Never infer open/closed state from the DOM.

State object (minimum):
```js
{
  isOpen: false,          // is any item currently revealed?
  activeItem: null,       // reference to the currently open item element
  lastClosedAt: 0         // timestamp of most recent close
}
```

Rules:
- Only one item is active at a time — opening one closes the currently active item.
- `lastClosedAt` enables time-based suppression of re-open behavior (e.g., animations).
- `isOpen` enables hover-switching without re-triggering open animation.

**Project example:** `menuSystem.js` — `{ isMenuOpen, activeMenu, lastClosedAt }` drives menu bar dropdowns. Hover over a sibling item closes the current one and opens the next without animation.

---

## Animation Model — Mask + Moving Content

**Principle:** Prefer "cutout + content slide" animations over CSS transforms applied directly to the full element. This gives you bevel/shadow on the outer container (always full size) while the content slides inside it.

```
.outer (the mask)   — overflow: hidden, full final size, bevel/shadow
  .inner (content)  — translates from off-screen into position
```

- `animation-fill-mode: both` — applies `from` keyframe before first tick, preventing flash at t=0.
- Stepped timing (`steps(N, end)`) produces discrete frame-by-frame reveal for retro/technical aesthetics.

**Project example:** `.dropdown` is the mask (fixed size, inset shadow). `.dropdown-inner` slides from `translateY(-100%)` to `translateY(0)` — the bevel never animates or resizes.

---

## Rapid Interaction Handling — Time-Based Suppression

**Principle:** When a user interacts rapidly (e.g., hover-switching, double-clicking to open/close), suppress secondary effects (animations, network requests, state resets) using a time threshold, not a flag.

Pattern:
```js
const THRESHOLD_MS = 150; // equal to animation duration
function shouldAnimate(state) {
  if (state.isOpen) return false;                          // already open — hover-switch
  if (Date.now() - state.lastClosedAt < THRESHOLD_MS) return false;  // rapid reopen
  return true;
}
```

- `isOpen` check handles hover-switch case (no time gap between close and open).
- `lastClosedAt` check handles the rapid open → close → open sequence.
- Store `lastClosedAt = Date.now()` on every close.

**Project example:** `timingConfig.js` defines `RAPID_REOPEN_THRESHOLD_MS = MENU_ANIMATION_DURATION_MS`. The menu animation only plays on the first open in a new interaction sequence.

---

## Animation Class Convention

**Principle:** Drive animations with a single toggle class, not inline styles or JS property mutations. The CSS rule provides the animation; the class presence determines whether it runs.

```css
.component                            { animation: none; }
.component.animate-open               { animation: my-anim 200ms both; }
```

- Removing the class immediately stops/resets the animation.
- Use `element.classList.add/remove('animate-open')` — never `element.style.animation`.

**Project example:** `.animate-open` added to `.dropdown-inner` conditionally. Without it, the dropdown appears instantly with no animation.
