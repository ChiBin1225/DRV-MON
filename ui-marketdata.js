// ============================================================
// ui-marketdata.js — funding rate, open interest, long/short
// ratio panel for the currently selected symbol. Funding/mark
// price stream live from the WS; OI% and L/S ratio are polled
// (Binance has no push stream for either) on a light interval.
// ============================================================
import { bus, state } from './state.js';
import { fNum, fPct, clsForVal } from './utils.js';
import { getOpenInterest, getOpenInterestChangePct, getLongShortRatio } from './binance-rest.js';

let pollTimer = null;

export function initMarketDataPanel() {
  render();
  bus.on('marketData', ({ sym }) => { if (sym === state.selectedSymbol) render(); });
  bus.on('ticker', ({ sym }) => { if (sym === state.selectedSymbol) render(); });
  bus.on('selectedSymbol', () => { render(); refreshPolled(); });

  refreshPolled();
  pollTimer = setInterval(refreshPolled, 30000);
}

async function refreshPolled() {
  const sym = state.selectedSymbol;
  try {
    const [oi, oiPct, ls] = await Promise.all([
      getOpenInterest(sym),
      getOpenInterestChangePct(sym, '1h'),
      getLongShortRatio(sym),
    ]);
    if (sym !== state.selectedSymbol) return; // user switched away mid-flight
    const price = state.tickers.get(sym)?.price;
    document.getElementById('md-oi').textContent = oi != null ? `${fNum(oi, 0)} contracts` : '–';
    document.getElementById('md-oi-usd').textContent = price ? `≈ $${fNum(oi * price, 0)}` : '';
    const oiPctEl = document.getElementById('md-oi-pct');
    oiPctEl.textContent = oiPct != null ? fPct(oiPct) + ' (1h)' : '–';
    oiPctEl.className = `md-sub ${clsForVal(oiPct)}`;

    if (ls) {
      const longPct = (ls.ratio / (1 + ls.ratio)) * 100;
      document.getElementById('md-ls-ratio').textContent = ls.ratio.toFixed(2);
      document.getElementById('md-ls-long').style.width = `${longPct.toFixed(1)}%`;
      document.getElementById('md-ls-long-lbl').textContent = `L ${longPct.toFixed(1)}%`;
      document.getElementById('md-ls-short-lbl').textContent = `S ${(100 - longPct).toFixed(1)}%`;
    }
  } catch (e) {
    console.error('marketdata poll failed', e);
  }
}

function render() {
  const sym = state.selectedSymbol;
  const md = state.marketData.get(sym) || {};
  document.getElementById('md-symbol').textContent = sym;

  const fEl = document.getElementById('md-funding');
  if (md.funding != null) {
    fEl.textContent = fPct(md.funding * 100, 4);
    fEl.className = `md-big ${clsForVal(md.funding)}`;
  } else {
    fEl.textContent = '–';
  }

  const next = md.nextFundingTime ? new Date(md.nextFundingTime) : null;
  document.getElementById('md-funding-next').textContent = next
    ? `Kỳ tiếp theo: ${next.toLocaleTimeString('vi-VN')}`
    : '';

  document.getElementById('md-mark').textContent = md.markPrice != null ? `$${fNum(md.markPrice, 2)}` : '–';
}
