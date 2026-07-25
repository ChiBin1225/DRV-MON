// ============================================================
// ui-cvd.js — Cumulative Volume Delta panel for the selected
// symbol. Delta itself is accumulated in state.js from the
// aggTrade WebSocket (binance-ws.js); this module only renders
// it plus a lightweight sparkline sampled on an interval (not
// per-trade — sampling every 2s is plenty for a visual trend and
// keeps this off the WS message hot path entirely).
// ============================================================
import { bus } from './utils.js';
import { state } from './state.js';
import { fmtCompact, pctClass, flash } from './utils.js';

const MAX_POINTS = 60; // 60 * 2s = 2 min of visible history
let history = [];
let sampleTimer = null;

const el = {};

export function initCvd() {
  el.value = document.getElementById('cvd-value');
  el.symbol = document.getElementById('cvd-symbol');
  el.spark = document.getElementById('cvd-spark');

  bus.on('symbol:selected', (symbol) => {
    el.symbol.textContent = symbol;
    history = [];
    renderSpark();
  });

  bus.on('cvd:update', (value) => {
    el.value.textContent = (value >= 0 ? '+' : '') + fmtCompact(value);
    el.value.className = 'md-big ' + pctClass(value);
    flash(el.value, value >= 0 ? 'up' : 'down');
  });

  el.symbol.textContent = state.selectedSymbol;

  clearInterval(sampleTimer);
  sampleTimer = setInterval(() => {
    if (document.hidden) return;
    const current = state.cvd.get(state.selectedSymbol) || 0;
    history.push(current);
    if (history.length > MAX_POINTS) history.shift();
    renderSpark();
  }, 2000);
}

function renderSpark() {
  if (!el.spark) return;
  if (history.length < 2) {
    el.spark.innerHTML = '';
    return;
  }
  const max = Math.max(...history.map(Math.abs), 1);
  el.spark.innerHTML = history
    .map((v) => {
      const heightPct = Math.max(4, (Math.abs(v) / max) * 100);
      const cls = v >= 0 ? 'spark-bar spark-up' : 'spark-bar spark-down';
      return `<span class="${cls}" style="height:${heightPct}%"></span>`;
    })
    .join('');
}
