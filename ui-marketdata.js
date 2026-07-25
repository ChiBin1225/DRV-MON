// ============================================================
// ui-marketdata.js — funding / mark price / OI / L-S ratio panel
// for whichever symbol is currently selected in the chart/table.
// ============================================================
import { bus } from './utils.js';
import { state } from './state.js';
import { fmtPrice, fmtCompact, fmtPct, pctClass, flash } from './utils.js';

const el = {};

export function initMarketData() {
  el.funding = document.getElementById('md-funding');
  el.fundingNext = document.getElementById('md-funding-next');
  el.mark = document.getElementById('md-mark');
  el.oi = document.getElementById('md-oi');
  el.oiUsd = document.getElementById('md-oi-usd');
  el.oiPct = document.getElementById('md-oi-pct');
  el.lsRatio = document.getElementById('md-ls-ratio');
  el.lsLongBar = document.getElementById('md-ls-long');
  el.lsLongLbl = document.getElementById('md-ls-long-lbl');
  el.lsShortLbl = document.getElementById('md-ls-short-lbl');

  bus.on('marketdata:selected', render);

  const current = state.marketData.get(state.selectedSymbol);
  if (current) render(current);
}

function render(d) {
  if (d.funding != null) {
    el.funding.textContent = fmtPct(d.funding);
    el.funding.className = 'md-big ' + pctClass(d.funding);
    flash(el.funding, d.funding >= 0 ? 'up' : 'down');
  }
  if (d.nextFundingTime) {
    const mins = Math.max(0, Math.round((d.nextFundingTime - Date.now()) / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    el.fundingNext.textContent = `Kỳ tiếp theo: ${h}h ${m}m`;
  }
  if (d.markPrice != null) el.mark.textContent = fmtPrice(d.markPrice);
  if (d.oi != null) el.oi.textContent = fmtCompact(d.oi, '');
  if (d.oiUsd != null) el.oiUsd.textContent = '≈ ' + fmtCompact(d.oiUsd);
  if (d.oiPct1h != null) {
    el.oiPct.textContent = fmtPct(d.oiPct1h) + ' (1h)';
    el.oiPct.className = 'md-sub ' + pctClass(d.oiPct1h);
  }
  if (d.lsRatio != null) el.lsRatio.textContent = d.lsRatio.toFixed(2);
  if (d.lsLongPct != null && d.lsShortPct != null) {
    el.lsLongBar.style.width = `${d.lsLongPct}%`;
    el.lsLongLbl.textContent = `L ${d.lsLongPct.toFixed(1)}%`;
    el.lsShortLbl.textContent = `S ${d.lsShortPct.toFixed(1)}%`;
  }
}
