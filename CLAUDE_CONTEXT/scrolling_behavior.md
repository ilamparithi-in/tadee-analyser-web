# Scrolling Behavior

- **All scrolling must be instantaneous** — no smooth animation anywhere (Windows 98 behavior)
- Applies to: mouse wheel, keyboard scrolling, programmatic scrolling
- Always include in CSS:
  ```css
  html { scroll-behavior: auto; }
  * { scroll-behavior: auto !important; }
  ```
- Never use `scrollIntoView({ behavior: "smooth" })` or `scrollTo({ behavior: "smooth" })` in JS
- Split `html, * { scroll-behavior: auto !important; }` into two rules — the combined selector doesn't correctly override `html` in all browsers
