// ============================================================
// ui-table.js — the ~150-row market matrix. Built once from the
// universe, then every tick updates only the exact <td> that
// changed via a cached Map of cell references — no
// getElementById/querySelector and no innerHTML rebuild on the
// per-tick path. Sorting/filtering rebuilds row order via a
// single DocumentFragment append (one reflow for the whole
// operation instead of one per row).
// ============================================================
import { bus } from './utils.js';
import { state } from './state.js';
import { debounce, fmtPrice, fmtCompact, fmtPct, pctClass, flash } from './utils.js';
import { selectSymbolFromTable } from './ui-chart.js';

const cellRefs = new Map(); // symbol -> { row, price, chg, vol, funding, oipct, ls }
let sortKey = null;
let sortDir = 1;
let searchQuery = '';

export function initTable() {
  bus.on('universe:ready', buildRows);
  bus.on('ticker:update', ({ symbol, data }) => patchRow(symbol, data));
  bus.on('marketdata:update', ({ symbol, data }) => patchMarketDataCells(symbol, data));

  document.getElementById('table-search').addEventListener(
    'input',
    debounce((e) => {
      searchQuery = e.target.value.trim().toUpperCase();
      applyFilterAndSort();
    }, 150)
  );

  document.querySelectorAll('#matrix-table thead th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      sortDir = sortKey === key ? -sortDir : 1;
      sortKey = key;
      document.querySelectorAll('#matrix-table thead th').forEach((h) => h.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
      applyFilterAndSort();
    });
  });
}

function buildRows(universe) {
  const tbody = document.getElementById('matrix-tbody');
  const frag = document.createDocumentFragment();

  universe.forEach((symbol, i) => {
    const tr = document.createElement('tr');
    tr.dataset.sym = symbol;
    tr.id = `row-${symbol}`;
    tr.innerHTML = `
      <td class="c-dim td-rank">${i + 1}</td>
      <td class="c-sym">${symbol.replace('USDT', '')}</td>
      <td class="c-price" id="td-price-${symbol}">–</td>
      <td id="td-chg-${symbol}">–</td>
      <td id="td-vol-${symbol}">–</td>
      <td id="td-funding-${symbol}">–</td>
      <td id="td-oipct-${symbol}">–</td>
      <td id="td-ls-${symbol}">–</td>
    `;
    tr.addEventListener('click', () => selectSymbolFromTable(symbol));
    frag.appendChild(tr);

    cellRefs.set(symbol, {
      row: tr,
      price: tr.querySelector(`#td-price-${symbol}`),
      chg: tr.querySelector(`#td-chg-${symbol}`),
      vol: tr.querySelector(`#td-vol-${symbol}`),
      funding: tr.querySelector(`#td-funding-${symbol}`),
      oipct: tr.querySelector(`#td-oipct-${symbol}`),
      ls: tr.querySelector(`#td-ls-${symbol}`),
    });
  });

  tbody.innerHTML = '';
  tbody.appendChild(frag);

  document.getElementById('matrix-loading').style.display = 'none';
  document.getElementById('matrix-table').style.display = '';
  document.getElementById('matrix-count').textContent = `${universe.length} / ${universe.length}`;
}

function patchRow(symbol, data) {
  const refs = cellRefs.get(symbol);
  if (!refs) return;
  refs.price.textContent = fmtPrice(data.price);
  refs.chg.textContent = fmtPct(data.chg24);
  refs.chg.className = pctClass(data.chg24);
  refs.vol.textContent = fmtCompact(data.quoteVol24);
  if (data.prevPrice != null && data.price !== data.prevPrice) {
    flash(refs.row, data.price > data.prevPrice ? 'up' : 'down');
  }
}

function patchMarketDataCells(symbol, data) {
  const refs = cellRefs.get(symbol);
  if (!refs) return;
  if (data.funding != null) {
    refs.funding.textContent = fmtPct(data.funding);
    refs.funding.className = pctClass(data.funding);
  }
  if (data.oiPct1h != null) {
    refs.oipct.textContent = fmtPct(data.oiPct1h);
    refs.oipct.className = pctClass(data.oiPct1h);
  }
  if (data.lsRatio != null) {
    refs.ls.textContent = data.lsRatio.toFixed(2);
  }
}

function applyFilterAndSort() {
  const tbody = document.getElementById('matrix-tbody');
  let rows = [...tbody.children];

  let visible = 0;
  rows.forEach((tr) => {
    const show = !(searchQuery && !tr.dataset.sym.includes(searchQuery));
    tr.style.display = show ? '' : 'none';
    if (show) visible += 1;
  });
  document.getElementById('matrix-count').textContent = `${visible} / ${rows.length}`;

  if (!sortKey) return;

  const getValue = (tr) => {
    const symbol = tr.dataset.sym;
    const t = state.tickers.get(symbol) || {};
    const m = state.marketData.get(symbol) || {};
    switch (sortKey) {
      case 'sym':
        return symbol;
      case 'price':
        return t.price ?? -Infinity;
      case 'chg24':
        return t.chg24 ?? -Infinity;
      case 'vol24':
        return t.quoteVol24 ?? -Infinity;
      case 'funding':
        return m.funding ?? -Infinity;
      case 'oipct':
        return m.oiPct1h ?? -Infinity;
      case 'ls':
        return m.lsRatio ?? -Infinity;
      default:
        return 0;
    }
  };

  rows.sort((a, b) => {
    const va = getValue(a);
    const vb = getValue(b);
    if (va < vb) return -1 * sortDir;
    if (va > vb) return 1 * sortDir;
    return 0;
  });

  const frag = document.createDocumentFragment();
  rows.forEach((tr) => frag.appendChild(tr));
  tbody.appendChild(frag);
}
