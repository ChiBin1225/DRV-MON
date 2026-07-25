// ============================================================
// ui-overview.js — top gainers/losers strip + Fear & Greed gauge.
// Gainers/losers are recomputed from the live ticker map on an
// interval (cheap — just a sort over data already in memory).
// ============================================================
import { bus, state } from './state.js';
import { fPct, fNum } from './utils.js';
import { getFearGreedIndex } from './external-api.js';
import { setFearGreed } from './state.js';

export function initOverviewPanel() {
  refreshGainersLosers();
  setInterval(refreshGainersLosers, 4000);

  refreshFearGreed();
  setInterval(refreshFearGreed, 5 * 60 * 1000);

  bus.on('fearGreed', renderFearGreed);
}

function refreshGainersLosers() {
  if (document.hidden) return; // nothing visible to update — skip the sort/render work entirely
  const rows = [...state.tickers.values()].filter((t) => t.vol24 > 5_000_000 && t.chg24 !== undefined);
  if (!rows.length) return;
  const sorted = [...rows].sort((a, b) => b.chg24 - a.chg24);
  renderStrip('gainers-strip', sorted.slice(0, 10), true);
  renderStrip('losers-strip', sorted.slice(-10).reverse(), false);
  updateStatsBar(rows, sorted);
}

function updateStatsBar(rows, sortedByChg) {
  const adv = rows.filter((t) => t.chg24 > 0).length;
  const dec = rows.filter((t) => t.chg24 < 0).length;
  const totalVol = rows.reduce((s, t) => s + (t.vol24 || 0), 0);

  const fundingVals = [...state.marketData.values()].map((m) => m.funding).filter((f) => f != null);
  const avgFunding = fundingVals.length ? fundingVals.reduce((s, f) => s + f, 0) / fundingVals.length : null;

  const top = sortedByChg[0];
  const bottom = sortedByChg[sortedByChg.length - 1];

  setText('stat-coins', rows.length);
  setText('stat-adv', adv);
  setText('stat-dec', dec);
  setText('stat-vol', `$${fNum(totalVol)}`);
  setText('stat-favg', avgFunding != null ? fPct(avgFunding * 100, 4) : '–');
  setText('stat-topgain', top ? `${top.sym.replace('USDT', '')} ${fPct(top.chg24)}` : '–');
  setText('stat-toploss', bottom ? `${bottom.sym.replace('USDT', '')} ${fPct(bottom.chg24)}` : '–');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function renderStrip(id, rows, isGain) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = rows.map((r) => `
    <div class="mover-chip">
      <span class="mover-sym">${r.sym.replace('USDT', '')}</span>
      <span class="mover-chg ${isGain ? 'c-pos' : 'c-neg'}">${fPct(r.chg24)}</span>
    </div>
  `).join('') || '<span class="c-dim">–</span>';
}

async function refreshFearGreed() {
  try {
    const fg = await getFearGreedIndex();
    setFearGreed(fg);
  } catch (e) {
    console.error('fear&greed fetch failed', e);
  }
}

function renderFearGreed(fg) {
  if (!fg) return;
  const marker = document.getElementById('fg-marker');
  const valEl = document.getElementById('fg-value');
  const lblEl = document.getElementById('fg-label');
  if (marker) marker.style.left = `${fg.value}%`;
  if (valEl) {
    valEl.textContent = fg.value;
    valEl.className = `fg-value ${fg.value >= 55 ? 'c-pos' : fg.value <= 45 ? 'c-neg' : ''}`;
  }
  if (lblEl) lblEl.textContent = fg.label.toUpperCase();
}
