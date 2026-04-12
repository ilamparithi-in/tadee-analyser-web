# 98.css Limitations

- **Scrollbar thumb has no active/drag visual** — no `::-webkit-scrollbar-thumb:active` or `:hover` rule exists; thumb looks identical at rest, hover, and while dragging
- 98.css fonts loaded from unpkg CDN (woff/woff2) — requires internet access
- 98.css exposes duplicate scrollbar arrow buttons by default (2 up / 2 down) — must be hidden manually:
  ```css
  ::-webkit-scrollbar-button:vertical:start:increment,
  ::-webkit-scrollbar-button:vertical:end:decrement,
  ::-webkit-scrollbar-button:horizontal:start:increment,
  ::-webkit-scrollbar-button:horizontal:end:decrement { display: none !important; }
  ```
