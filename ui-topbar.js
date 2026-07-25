// ============================================================
// ui-topbar.js — the 3 hero price cards (BTC/ETH/SOL) + the
// connection status pill and clock in the header.
// ============================================================
import { bus } from './utils.js';
import { fmtPrice, fmtCompact, fmtPct, pctClass, flash, nowHHMMSS } from './utils.js';

const HERO_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const cellRefs = new Map(); // symbol -> { price, chg, vol, card }

export function initTopbar() {
  const container = document.getElementById('topbar');
  container.innerHTML = HERO_SYMBOLS.map(
    (sym) => `
    <div class="ticker-cell" id="hero-${sym}">
      <div class="ticker-sym">${sym.replace('USDT', '')}/USDT</div>
      <div class="ticker-price" id="hero-${sym}-price">–</div>
      <div class="ticker-sub">
        <span id="hero-${sym}-chg">–</span>
        <span class="c-dim">Vol <span id="hero-${sym}-vol">–</span></span>
      </div>
    </div>`
  ).join('');

  for (const sym of HERO_SYMBOLS) {
    cellRefs.set(sym, {
      card: document.getElementById(`hero-${sym}`),
      price: document.getElementById(`hero-${sym}-price`),
      chg: document.getElementById(`hero-${sym}-chg`),
      vol: document.getElementById(`hero-${sym}-vol`),
    });
  }

  bus.on('ticker:update', ({ symbol, data }) => {
    const refs = cellRefs.get(symbol);
    if (!refs) return;
    refs.price.textContent = fmtPrice(data.price);
    refs.chg.textContent = fmtPct(data.chg24);
    refs.chg.className = pctClass(data.chg24);
    refs.vol.textContent = fmtCompact(data.quoteVol24);
    if (data.prevPrice != null && data.price !== data.prevPrice) {
      flash(refs.card, data.price > data.prevPrice ? 'up' : 'down');
    }
  });

  bus.on('conn:status', updateConnPill);
  updateConnPill('connecting');

  setInterval(() => {
    const clockEl = document.getElementById('live-clock');
    if (clockEl) clockEl.textContent = nowHHMMSS();
  }, 1000);
}

function updateConnPill(status) {
  const pill = document.getElementById('conn-status');
  if (!pill) return;
  if (status === 'live') {
    pill.textContent = '● LIVE';
    pill.className = 'conn-pill live';
  } else if (status === 'fallback') {
    pill.textContent = '● REST FALLBACK';
    pill.className = 'conn-pill fallback';
  } else {
    pill.textContent = '● CONNECTING';
    pill.className = 'conn-pill warn';
  }
}
