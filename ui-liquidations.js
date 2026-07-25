// ============================================================
// ui-liquidations.js — live liquidation feed, driven purely off
// the Binance !forceOrder@arr websocket stream (state.liquidations).
// Large liquidations (>= LARGE_USD) get a highlighted row + pulse.
// ============================================================
import { bus, state } from './state.js';
import { fNum } from './utils.js';

const LARGE_USD = 250_000;
const HUGE_USD = 1_000_000;
const MAX_ROWS = 60;

export function initLiquidationsPanel() {
  const list = document.getElementById('liq-list');
  list.innerHTML = '';

  bus.on('liquidation', (evt) => {
    const row = document.createElement('div');
    row.className = `liq-row ${evt.usd >= HUGE_USD ? 'liq-huge' : evt.usd >= LARGE_USD ? 'liq-large' : ''}`;
    // side "SELL" liquidation order = an over-leveraged LONG got force-closed
    const isLongLiq = evt.side === 'SELL';
    row.innerHTML = `
      <span class="liq-side ${isLongLiq ? 'c-neg' : 'c-pos'}">${isLongLiq ? 'LONG LIQ' : 'SHORT LIQ'}</span>
      <span class="liq-sym">${evt.sym.replace('USDT', '')}</span>
      <span class="liq-usd">$${fNum(evt.usd, 0)}</span>
      <span class="liq-time">${new Date(evt.time).toLocaleTimeString('vi-VN')}</span>
    `;
    list.prepend(row);
    while (list.children.length > MAX_ROWS) list.lastChild.remove();

    updateTotals();
  });

  updateTotals();
  setInterval(updateTotals, 5000);
}

function updateTotals() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  const recent = state.liquidations.filter((e) => e.time >= cutoff);
  const longUsd = recent.filter((e) => e.side === 'SELL').reduce((s, e) => s + e.usd, 0);
  const shortUsd = recent.filter((e) => e.side === 'BUY').reduce((s, e) => s + e.usd, 0);
  document.getElementById('liq-total-30m').textContent = `$${fNum(longUsd + shortUsd, 0)}`;
  document.getElementById('liq-long-30m').textContent = `$${fNum(longUsd, 0)}`;
  document.getElementById('liq-short-30m').textContent = `$${fNum(shortUsd, 0)}`;
  const statEl = document.getElementById('stat-liq30');
  if (statEl) statEl.textContent = `$${fNum(longUsd + shortUsd, 0)}`;
}
