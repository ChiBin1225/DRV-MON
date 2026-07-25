// ============================================================
// ui-liquidations.js — live liquidation feed + rolling 30-min
// totals. Prepends new rows via a single DOM insert per event
// (no full-list re-render), caps the visible list, and gives
// large liquidations a highlight class.
// ============================================================
import { bus } from './utils.js';
import { fmtCompact, fmtPrice } from './utils.js';

const MAX_VISIBLE_ROWS = 40;
const BIG_LIQ_USD = 100000;

export function initLiquidations() {
  const list = document.getElementById('liq-list');
  const totalEl = document.getElementById('liq-total-30m');
  const longEl = document.getElementById('liq-long-30m');
  const shortEl = document.getElementById('liq-short-30m');

  bus.on('liq:new', (liq) => {
    const row = document.createElement('div');
    row.className = 'liq-row ' + (liq.side === 'long' ? 'liq-long' : 'liq-short') + (liq.usd >= BIG_LIQ_USD ? ' liq-big' : '');
    row.innerHTML = `
      <span class="liq-sym">${liq.symbol.replace('USDT', '')}</span>
      <span class="liq-side">${liq.side === 'long' ? 'LONG' : 'SHORT'}</span>
      <span class="liq-usd">${fmtCompact(liq.usd)}</span>
      <span class="liq-price c-dim">${fmtPrice(liq.price)}</span>
    `;
    list.prepend(row);
    while (list.children.length > MAX_VISIBLE_ROWS) {
      list.removeChild(list.lastChild);
    }
  });

  bus.on('liq:totals', (totals) => {
    totalEl.textContent = fmtCompact(totals.total);
    longEl.textContent = fmtCompact(totals.long);
    shortEl.textContent = fmtCompact(totals.short);
  });
}
