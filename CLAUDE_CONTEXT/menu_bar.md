# Menu Bar & Toolbar — Observations

## Menu State Machine

- The menu system is a **state machine** — only one menu active at a time
- Internal state object: `{ isMenuOpen, activeMenu, lastClosedAt }`
  - `isMenuOpen`: guards hover-switch animation (no anim if already open)
  - `activeMenu`: reference to the currently open `.menu-item` element
  - `lastClosedAt`: timestamp; suppresses animation if reopen occurs before `RAPID_REOPEN_THRESHOLD_MS`
- Closing triggers: click outside, opening a different menu item
- Hover-switching always bypasses animation (independent of `lastClosedAt`)

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

## Menu Animation Model (cutout + sliding card)

- `.dropdown` = the cutout: `overflow: hidden`, sized to full final dimensions, `display: none` when closed
- `.dropdown-inner` = the card: slides from `translateY(-100%)` to `translateY(0)` inside the cutout
- `animation-fill-mode: both` → applies `from` keyframe before first tick so card is invisible at t=0
- `steps(8, end)` gives discrete row-reveal matching Win98 style
- The bevel (`inset box-shadow`) stays on `.dropdown` (the cutout) — always full-size, not animated

## Menu bar vs context menu animation

| | Menu bar dropdown | Context menu (right-click) |
|---|---|---|
| Cutout position | Below the menu bar item | At click coordinates |
| Card start position | Above cutout (translateY -100%) | Bottom-right of card at cutout top-left |
| Direction | Straight down | Diagonal down-right |

Context menu diagonal animation would require animating both `translateX(-100%)` and `translateY(-100%)` simultaneously. This is achievable with `translate(-100%, -100%)` → `translate(0, 0)`, but it is **not currently implemented** (no context menu exists yet).

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



