# UI Rules

- Use **98.css** for all UI components — do not recreate Win98 styles manually
- Use standard 98.css classes: `.window`, `.title-bar`, `.title-bar-text`, `.title-bar-controls`, `.window-body`, `.field-row`, etc.
- Background color for the "desktop" is `teal` to mimic Windows 98
- 98.css loaded via CDN: `https://unpkg.com/98.css`
- **Bevel is a forbidden pixel region**: content must never occupy bevel pixels (`box-shadow: inset` overlaps the element's own content area at its edges). Enforce with `margin: 2px` on the inner container — NOT with `overflow: hidden`, which clips content rather than displacing it
- The `margin: 2px` rule is pixel-reservation, not visual spacing
