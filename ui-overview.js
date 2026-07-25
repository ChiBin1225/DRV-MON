// ============================================================
// ui-overview.js — top gainers/losers strips, Fear & Greed
// gauge, and the stats-bar (adv/dec, avg funding, etc).
//
// Ticker updates arrive many times per second across ~150
// symbols; recomputing "top 10 gainers out of the whole universe"
// on every single tick would mean sorting the entire universe
// hundreds of times a second for no visible benefit. Instead this
// recomputes on a fixed interval (throttled), which is invisible
// to the eye but a large win for CPU.
// ============================================================
import { bus } from './utils.js';
import { state } from './state.js';
import { fmtCompact, fmtPct } from './utils.js';

const RECOMPUTE_MS = 2000;

export function initOverview() {
  bus.on('feargreed:update', renderFearGreed);
  const fg = state.fearGreed;
  if (fg) renderFearGreed(fg);

  recomputeAll();
  setInterval(() => {
    if (!document.hidden) recomputeAll();
  }, RECOMPUTE_MS);
}

function recomputeAll() {
  const rows = [...state.tickers.entries()]
    .filter(([, d]) => d.price != null && d.chg24 != null)
    .map(([symbol, d]) => ({ symbol, ...d }));

  if (!rows.length) return;

  renderMovers(rows);
  renderStatsBar(rows);
}

function renderMovers(rows) {
  const gainers = [...rows].sort((a, b) => b.chg24 - a.chg24).slice(0, 10);
  const losers = [...rows].sort((a, b) => a.chg24 - b.chg24).slice(0, 10);

  document.getElementById('gainers-strip').innerHTML = gainers
    .map(
      (r, i) => `<div class="mover-row"><span class="c-dim">${i + 1}</span><span class="c-sym">${r.symbol.replace(
        'USDT',
        ''
      )}</span><span class="c-pos">${fmtPct(r.chg24)}</span></div>`
    )
    .join('');

  document.getElementById('losers-strip').innerHTML = losers
    .map(
      (r, i) => `<div class="mover-row"><span class="c-dim">${i + 1}</span><span class="c-sym">${r.symbol.replace(
        'USDT',
        ''
      )}</span><span class="c-neg">${fmtPct(r.chg24)}</span></div>`
    )
    .join('');
}

function renderStatsBar(rows) {
  const adv = rows.filter((r) => r.chg24 > 0).length;
  const dec = rows.filter((r) => r.chg24 < 0).length;
  const totalVol = rows.reduce((sum, r) => sum + (r.quoteVol24 || 0), 0);

  const fundings = [...state.marketData.values()].map((d) => d.funding).filter((f) => f != null);
  const avgFunding = fundings.length ? fundings.reduce((a, b) => a + b, 0) / fundings.length : null;

  const topGain = [...rows].sort((a, b) => b.chg24 - a.chg24)[0];
  const topLoss = [...rows].sort((a, b) => a.chg24 - b.chg24)[0];

  set('stat-coins', rows.length);
  set('stat-adv', adv);
  set('stat-dec', dec);
  set('stat-vol', fmtCompact(totalVol));
  set('stat-favg', avgFunding != null ? fmtPct(avgFunding) : '–');
  set('stat-topgain', topGain ? `${topGain.symbol.replace('USDT', '')} ${fmtPct(topGain.chg24)}` : '–');
  set('stat-toploss', topLoss ? `${topLoss.symbol.replace('USDT', '')} ${fmtPct(topLoss.chg24)}` : '–');
  set('stat-liq30', fmtCompact(state.liqTotals.total));
}

function set(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderFearGreed(fg) {
  if (!fg) return;
  document.getElementById('fg-value').textContent = fg.value;
  document.getElementById('fg-label').textContent = translateLabel(fg.label);
  const marker = document.getElementById('fg-marker');
  marker.style.left = `${fg.value}%`;
}

function translateLabel(label) {
  const map = {
    'Extreme Fear': 'EXTREME FEAR',
    Fear: 'FEAR',
    Neutral: 'NEUTRAL',
    Greed: 'GREED',
    'Extreme Greed': 'EXTREME GREED',
  };
  return map[label] || label?.toUpperCase() || '–';
}
