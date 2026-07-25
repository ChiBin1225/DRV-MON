// ============================================================
// ui-topbar.js — the 3 hero price cards (BTC/ETH/SOL) + connection
// status pill in the header. DOM refs are cached once at init and
// hydrated immediately from whatever's already in state, instead of
// leaving the cards on "–" until the next websocket tick.
// ============================================================
import { bus, state } from './state.js';
import { fNum, fPrice, fPct, flash } from './utils.js';

const WATCH = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const refs = new Map(); // sym -> { price, chg, vol }

export function initTopbar() {
  const wrap = document.getElementById('topbar');
  wrap.innerHTML = WATCH.map((sym) => `
    <div class="hero-card">
      <div class="hero-sym">${sym.replace('USDT', '')}<span class="hero-pair">/USDT</span></div>
      <div class="hero-price" data-cell="price">–</div>
      <div class="hero-row">
        <span class="chg-badge" data-cell="chg">–</span>
        <span class="hero-vol" data-cell="vol">Vol –</span>
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('.hero-card').forEach((card, i) => {
    refs.set(WATCH[i], {
      price: card.querySelector('[data-cell="price"]'),
      chg: card.querySelector('[data-cell="chg"]'),
      vol: card.querySelector('[data-cell="vol"]'),
    });
  });

  hydrateFromState();

  bus.on('ticker', ({ sym, prev, next }) => {
    const r = refs.get(sym);
    if (!r) return;
    paint(r, prev, next);
  });

  bus.on('status', ({ key, val }) => {
    if (key !== 'tickerWs') return;
    const pill = document.getElementById('conn-status');
    if (!pill) return;
    const map = {
      live: ['LIVE', 'ok'],
      connecting: ['CONNECTING', 'warn'],
      fallback: ['REST FALLBACK', 'warn'],
      error: ['RECONNECTING', 'err'],
    };
    const [label, cls] = map[val] || ['–', 'warn'];
    pill.textContent = `● ${label}`;
    pill.className = `conn-pill ${cls}`;
  });
}

function hydrateFromState() {
  for (const [sym, r] of refs) {
    const t = state.tickers.get(sym);
    if (t) paint(r, undefined, t);
  }
}

function paint(r, prev, next) {
  r.price.textContent = `$${fPrice(next.price)}`;
  if (prev?.price !== undefined && next.price !== prev.price) {
    flash(r.price, next.price > prev.price ? 1 : -1);
  }
  r.chg.textContent = fPct(next.chg24);
  r.chg.className = `chg-badge ${next.chg24 >= 0 ? 'pos' : 'neg'}`;
  r.vol.textContent = `Vol $${fNum(next.vol24)}`;
}
