# Menu Bar & Toolbar — Observations

## What 98.css provides natively
- No `.menu-bar`, `.dropdown`, or `.toolbar` classes exist in 98.css
- Button styles apply to toolbar buttons automatically
- Window/border shadow styles can be reused on dropdowns manually

## What must be custom-built
- Menu bar layout (flex row with `position: relative` items)
- Dropdown positioning (absolute, `top: 100%`)
- Active/open menu item highlight — must manually set `background: navy; color: #fff`
- Hover highlight on dropdown items — must manually override button styles
- Toolbar separator — custom `div` with grey border + white shadow

## Menu Animation Model (cutout + sliding card) — CORRECTED

**Rule**: the outer element is a transparent `overflow: hidden` clipper with **no background and no bevel**. The inner element is the actual styled box (background + bevel + content) that animates with `translateY`. This ensures:
- Nothing bleeds outside the clipper bounds (e.g. over the taskbar or adjacent OS chrome)
- The whole box — background, bevel, and text — moves together as one unit

**Do NOT put background/bevel on the clipper** — it would render statically while only the content moves, which looks wrong.

**Do NOT animate with `clip-path`** — `clip-path` reveals the content in place; text stays stationary while the clip region changes, which also looks wrong.

| Element | Role | Has background/bevel? | Animates? |
|---|---|---|---|
| Outer (`.dropdown`, `#start-menu`) | `overflow: hidden` clipper | ❌ No | ❌ No |
| Inner (`.dropdown-inner`, `#start-menu-inner`) | Styled card | ✅ Yes | ✅ Yes |

- `animation-fill-mode: both` → applies `from` keyframe before first tick so card is invisible at t=0
- `steps(8, end)` gives discrete row-reveal matching Win98 style
- Force animation restart with `void el.offsetWidth` reflow before re-adding the class

## Menu bar dropdown

- Cutout (`.dropdown`): `overflow: hidden`, `display: none` when closed, no background
- Card (`.dropdown-inner`): background + bevel, slides `translateY(-100%) → translateY(0)` (down into view)

## Start menu

- Cutout (`#start-menu`): `position: fixed; bottom: 28px; overflow: hidden`, no background
- Card (`#start-menu-inner`): background + bevel, slides `translateY(100%) → translateY(0)` (up into view)
- `animate-open` class on outer triggers `#start-menu.animate-open #start-menu-inner { animation: ... }`

## Context menu (right-click) — not yet implemented

- Cutout: positioned at click coordinates, `overflow: hidden`, no background/bevel
- Card: background + bevel, slides diagonally `translate(-100%, -100%) → translate(0, 0)` (diagonal down-right into view)
- Same cutout+card pattern — outer clips, inner animates

## Rapid Interaction Handling

- Animation is suppressed if time since last close < `RAPID_REOPEN_THRESHOLD_MS` (= `MENU_ANIMATION_DURATION_MS`)
- Hover-switching between menu items never animates (`state.isMenuOpen` flag checked in `shouldAnimate()`)
- Only the *first* open in a new interaction sequence plays the animation

## Reusable Component Structure

All custom UI logic lives in `/js/ui/components/`:

| File | Purpose |
|---|---|
| `timingConfig.js` | Single source for all animation durations |
| `animationUtils.js` | `applyConditionalAnimation()`, `restartAnimation()` helpers |
| `menuSystem.js` | Full menu state machine (`initMenuBar(el)`) |

- `menu.js` is now a thin entry point: imports `initMenuBar` and calls it
- No custom behavior logic belongs in `index.html` or inline scripts

## Animation Class Convention

- `.animate-open` added to `.dropdown-inner` when animation should play
- `.dropdown-inner` without `.animate-open` → `animation: none` (instant show)
- CSS uses `.menu-item.open > .dropdown > .dropdown-inner.animate-open` to trigger keyframe



