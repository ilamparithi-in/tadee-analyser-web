/**
 * grid.js — Excel 97-style results grid.
 * Builds a spreadsheet table dynamically; accepts data at init and via setData().
 * Column widths are computed from the scroll container width on init (ratio-based).
 */

const COLUMNS = [
  { letter: 'A', title: 'Parameter' },
  { letter: 'B', title: 'Value'     },
  { letter: 'C', title: 'Unit'      },
];

const COL_WIDTHS_DEFAULT = [175, 140, 54]; // A : B : C — fixed initial pixel widths

const DEFAULT_ROWS = [
  ['Inductance per phase per km',  '—', 'H/km'],
  ['Capacitance per phase per km', '—', 'F/km'],
  ['Inductive reactance XL',       '—', 'Ω'   ],
  ['Capacitive reactance XC',      '—', 'Ω'   ],
  ['A',                            '—', ''    ],
  ['B',                            '—', 'Ω'   ],
  ['C',                            '—', 'S'   ],
  ['D',                            '—', ''    ],
  ['Sending end voltage (phase)',  '—', 'kV'  ],
  ['Sending end voltage (line)',   '—', 'kV'  ],
  ['Sending end current Is',       '—', 'A'   ],
  ['Charging current Ic',          '—', 'A'   ],
  ['Voltage regulation',           '—', '%'   ],
  ['Power loss (3φ)',               '—', 'MW'  ],
  ['Transmission efficiency',      '—', '%'   ],
  ['Surge impedance Zc',           '—', 'Ω'   ],
  ['Surge impedance loading SIL',  '—', 'MW'  ],
];

const ROW_HDR_WIDTH = 30; // px — left column with row numbers

/**
 * @param {HTMLElement} containerEl — #results-grid element
 * @param {number[]} [ratios]       — optional [A, B, C] ratio overrides (must sum ≤ 1)
 * @returns {{ setCell(row, col, value): void, setData(rows): void }}
 */
export function initResultsGrid(containerEl, ratios) {
  // If caller provides ratio overrides, compute from available width; otherwise use fixed defaults.
  let colWidths;
  if (ratios) {
    const scrollEl  = containerEl.parentElement;
    const scrollW   = (scrollEl?.clientWidth) || window.innerWidth;
    const available = Math.max(100, scrollW - ROW_HDR_WIDTH - (COLUMNS.length + 2));
    colWidths = ratios.map(r => Math.max(30, Math.floor(available * r)));
  } else {
    colWidths = COL_WIDTHS_DEFAULT.map(w => Math.max(30, w));
  }

  const table = document.createElement('table');
  table.id = 'eg-table';

  // <colgroup>
  const colgroup = document.createElement('colgroup');
  const rowHdrCol = document.createElement('col');
  rowHdrCol.style.width = ROW_HDR_WIDTH + 'px';
  colgroup.appendChild(rowHdrCol);

  const colEls = colWidths.map((w) => {
    const col = document.createElement('col');
    col.style.width = w + 'px';
    colgroup.appendChild(col);
    return col;
  });
  table.appendChild(colgroup);

  // Set explicit table width = sum of all column widths so layout is not stretched by browser
  const totalInitWidth = ROW_HDR_WIDTH + colWidths.reduce((a, b) => a + b, 0);
  table.style.width = totalInitWidth + 'px';

  // <thead> — sticky column headers with resize handles
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const corner = document.createElement('th');
  corner.className = 'eg-corner';
  headerRow.appendChild(corner);

  COLUMNS.forEach((col, i) => {
    const th = document.createElement('th');
    th.className = 'eg-col-hdr';
    th.textContent = col.letter;
    th.title = col.title;

    const handle = document.createElement('div');
    handle.className = 'eg-col-resize';
    attachColResize(handle, colEls[i], table);
    th.appendChild(handle);

    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // <tbody> with sticky row-number headers
  const tbody = document.createElement('tbody');
  DEFAULT_ROWS.forEach((cells, rowIdx) => {
    tbody.appendChild(buildRow(rowIdx, cells));
  });
  table.appendChild(tbody);

  containerEl.appendChild(table);

  return {
    /**
     * Update a single result cell.
     * @param {number} row  0-based
     * @param {number} col  0-based (0=Parameter, 1=Value, 2=Unit)
     * @param {string} value
     */
    setCell(row, col, value) {
      const tr = tbody.querySelectorAll('tr')[row];
      if (!tr) return;
      const tds = tr.querySelectorAll('td');
      if (tds[col + 1]) tds[col + 1].textContent = value;
    },

    /**
     * Replace all row data.
     * @param {Array<[string, string, string]>} rows
     */
    setData(rows) {
      tbody.innerHTML = '';
      rows.forEach((cells, i) => tbody.appendChild(buildRow(i, cells)));
    },
  };
}

function buildRow(rowIdx, cells) {
  const tr = document.createElement('tr');

  const rowHdr = document.createElement('td');
  rowHdr.className = 'eg-row-hdr';
  rowHdr.textContent = rowIdx + 1;
  tr.appendChild(rowHdr);

  cells.forEach((text) => {
    const td = document.createElement('td');
    td.textContent = text;
    tr.appendChild(td);
  });

  return tr;
}

function attachColResize(handle, colEl, table) {
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const startX       = e.clientX;
    const startW       = parseInt(colEl.style.width, 10) || 80;
    const startTableW  = parseInt(table.style.width, 10) || table.offsetWidth;

    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e) {
      const newW  = Math.max(30, startW + (e.clientX - startX));
      const delta = newW - startW;
      colEl.style.width  = newW + 'px';
      table.style.width  = Math.max(60, startTableW + delta) + 'px';
    }

    function onUp() {
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

