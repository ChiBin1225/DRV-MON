// ============================================================
// ui-table.js — the dense multi-coin matrix. Price/24h%/volume
// update per-cell (not a full re-render) on every websocket tick
// so the UI never freezes even with 150+ symbols streaming.
// Funding comes from the same WS. OI% and L/S ratio have no push
// stream on Binance, so they're polled for the top-by-volume
// symbols in small batches on a timer.
//
// Perf notes:
//  - DOM refs for every row/cell are cached once in `cellRefs` at build
//    time instead of calling getElementById() on every single tick —
//    with ~150 symbols ticking roughly once a second that's ~150 fewer
//    DOM lookups per second.
//  - The table hydrates from whatever is already in `state` the instant
//    rows are built, instead of showing "–" until the next websocket
//    message happens to include that symbol.
//  - The OI%/L-S REST poll loop pauses while the tab is hidden — no
//    point burning API quota and CPU updating cells nobody can see.
// ============================================================
import { bus, state, setSelectedSymbol } from './state.js';
import { fNum, fPrice, fPct, clsForVal, flash, sleep } from './utils.js';
import { getOpenInterestChangePct, getLongShortRatio } from './binance-rest.js';

let universe = [];        // ordered list of symbols currently shown
let universeSet = new Set();
let cellRefs = new Map(); // sym -> { price, chg, vol, funding, oipct, ls }
let sortKey = 'vol24';
let sortDir = -1;
let searchQuery = '';

/** @param {string[]} universeSymbols — top-N symbols already resolved by the bootstrap call in main.js */
export async function initTable(universeSymbols) {
  universe = universeSymbols;
  universeSet = new Set(universe);

  document.getElementById('table-search').addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toUpperCase();
    applyFilterAndSort();
  });
  document.querySelectorAll('#matrix-table thead th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      sortDir = sortKey === key ? sortDir * -1 : -1;
      sortKey = key;
      document.querySelectorAll('#matrix-table thead th').forEach((t) => t.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(sortDir === -1 ? 'sort-desc' : 'sort-asc');
      applyFilterAndSort();
    });
  });

  buildRows();
  hydrateFromState();
  applyFilterAndSort();
  document.getElementById('matrix-loading').style.display = 'none';
  document.getElementById('matrix-table').style.display = '';

  // live cell updates — cheap, targeted DOM writes only, no lookups
  bus.on('ticker', ({ sym, prev, next }) => updateRowCells(sym, prev, next));
  bus.on('marketData', ({ sym, next }) => updateFundingCell(sym, next));

  pollDepthDataLoop();
}

function buildRows() {
  const tbody = document.getElementById('matrix-tbody');
  tbody.innerHTML = universe.map((sym, i) => `
    <tr data-sym="${sym}">
      <td class="c-dim td-rank">${i + 1}</td>
      <td class="c-sym">${sym.replace('USDT', '')}</td>
      <td class="c-price" data-cell="price">–</td>
      <td data-cell="chg">–</td>
      <td data-cell="vol">–</td>
      <td data-cell="funding">–</td>
      <td data-cell="oipct">–</td>
      <td data-cell="ls">–</td>
    </tr>
  `).join('');

  cellRefs.clear();
  tbody.querySelectorAll('tr').forEach((tr) => {
    const sym = tr.dataset.sym;
    cellRefs.set(sym, {
      tr,
      price: tr.querySelector('[data-cell="price"]'),
      chg: tr.querySelector('[data-cell="chg"]'),
      vol: tr.querySelector('[data-cell="vol"]'),
      funding: tr.querySelector('[data-cell="funding"]'),
      oipct: tr.querySelector('[data-cell="oipct"]'),
      ls: tr.querySelector('[data-cell="ls"]'),
    });
    tr.addEventListener('click', () => {
      tbody.querySelectorAll('tr.row-selected').forEach((t) => t.classList.remove('row-selected'));
      tr.classList.add('row-selected');
      setSelectedSymbol(sym);
    });
  });
}

/** Paint whatever's already in state immediately — REST bootstrap data or
 *  websocket ticks that arrived while the table was still being built —
 *  instead of leaving cells on "–" until the next tick happens to include them. */
function hydrateFromState() {
  for (const [sym, refs] of cellRefs) {
    const t = state.tickers.get(sym);
    if (t) {
      refs.price.textContent = `$${fPrice(t.price)}`;
      refs.chg.textContent = fPct(t.chg24);
      refs.chg.className = clsForVal(t.chg24);
      refs.vol.textContent = `$${fNum(t.vol24)}`;
    }
    const m = state.marketData.get(sym);
    if (m?.funding != null) {
      refs.funding.textContent = fPct(m.funding * 100, 4);
      refs.funding.className = clsForVal(m.funding);
    }
  }
}

function updateRowCells(sym, prev, next) {
  const refs = cellRefs.get(sym);
  if (!refs) return; // symbol not in the currently-shown universe
  refs.price.textContent = `$${fPrice(next.price)}`;
  if (prev?.price !== undefined && next.price !== prev.price) flash(refs.price, next.price > prev.price ? 1 : -1);

  refs.chg.textContent = fPct(next.chg24);
  refs.chg.className = clsForVal(next.chg24);
  refs.vol.textContent = `$${fNum(next.vol24)}`;
}

function updateFundingCell(sym, md) {
  const refs = cellRefs.get(sym);
  if (!refs || md.funding == null) return;
  refs.funding.textContent = fPct(md.funding * 100, 4);
  refs.funding.className = clsForVal(md.funding);
}

function applyFilterAndSort() {
  const rows = [...document.querySelectorAll('#matrix-tbody tr')];
  const keyFor = (tr) => {
    const sym = tr.dataset.sym;
    const t = state.tickers.get(sym) || {};
    const m = state.marketData.get(sym) || {};
    switch (sortKey) {
      case 'sym': return sym;
      case 'price': return t.price ?? -Infinity;
      case 'chg24': return t.chg24 ?? -Infinity;
      case 'vol24': return t.vol24 ?? -Infinity;
      case 'funding': return m.funding ?? -Infinity;
      case 'oipct': return m.oiPct ?? -Infinity;
      case 'ls': return m.lsRatio ?? -Infinity;
      default: return 0;
    }
  };

  let visible = 0;
  rows.forEach((tr) => {
    const show = !(searchQuery && !tr.dataset.sym.includes(searchQuery));
    tr.style.display = show ? '' : 'none';
    if (show) visible += 1;
  });
  const countEl = document.getElementById('matrix-count');
  if (countEl) countEl.textContent = `${visible} / ${rows.length}`;

  rows.sort((a, b) => {
    const va = keyFor(a), vb = keyFor(b);
    if (typeof va === 'string') return va.localeCompare(vb) * sortDir * -1;
    return (va - vb) * sortDir;
  });

  const tbody = document.getElementById('matrix-tbody');
  const frag = document.createDocumentFragment();
  rows.forEach((tr) => frag.appendChild(tr));
  tbody.appendChild(frag); // single reflow for the whole reorder, not one append per row
}

/** Poll OI% and L/S ratio for the top-N symbols by volume, in small
 *  batches with a short delay between them to stay well under
 *  Binance's rate limits. Runs forever on a slow cadence, and pauses
 *  entirely while the tab is in the background. */
async function pollDepthDataLoop() {
  const BATCH = 3;
  const DELAY_MS = 900;
  while (true) {
    if (document.hidden) {
      await sleep(3000);
      continue;
    }

    const top = [...state.tickers.values()]
      .sort((a, b) => (b.vol24 ?? 0) - (a.vol24 ?? 0))
      .slice(0, 45)
      .map((t) => t.sym)
      .filter((s) => universeSet.has(s));

    for (let i = 0; i < top.length; i += BATCH) {
      if (document.hidden) break; // stop mid-loop the moment the tab is backgrounded
      const batch = top.slice(i, i + BATCH);
      await Promise.all(batch.map(async (sym) => {
        try {
          const [oiPct, ls] = await Promise.all([
            getOpenInterestChangePct(sym, '1h'),
            getLongShortRatio(sym),
          ]);
          const refs = cellRefs.get(sym);
          if (refs) {
            refs.oipct.textContent = oiPct != null ? fPct(oiPct) : '–';
            refs.oipct.className = clsForVal(oiPct);
            if (ls) refs.ls.textContent = ls.ratio.toFixed(2);
          }
          const prevMd = state.marketData.get(sym) || {};
          state.marketData.set(sym, { ...prevMd, oiPct, lsRatio: ls?.ratio ?? prevMd.lsRatio });
        } catch (e) {
          // rate-limited or transient — just skip this symbol this round
        }
      }));
      await sleep(DELAY_MS);
    }
    await sleep(5000);
  }
}
