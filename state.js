// ============================================================
// state.js — single source of truth. UI modules subscribe to
// bus events; API modules write here and emit. Nobody reaches
// into another module's DOM directly.
// ============================================================
import { bus } from './utils.js';

export const state = {
  connStatus: 'connecting', // connecting | live | fallback
  universe: [],             // ["BTCUSDT", "ETHUSDT", ...] sorted by 24h volume desc
  trackedSymbols: new Set(),// same set, for O(1) WS filtering
  tickers: new Map(),       // symbol -> { price, prevPrice, chg24, vol24, quoteVol24 }
  marketData: new Map(),    // symbol -> { funding, nextFundingTime, markPrice, oi, oiUsd, oiPct1h, lsRatio, lsLongPct, lsShortPct, mcap }
  liquidations: [],         // recent forceOrder events, newest first, capped
  liqTotals: { total: 0, long: 0, short: 0 }, // rolling 30-min USD totals
  fearGreed: null,          // { value, label }
  selectedSymbol: 'BTCUSDT',
  cvd: new Map(),           // symbol -> running cumulative volume delta (session)
};

export function setConnStatus(status) {
  state.connStatus = status;
  bus.emit('conn:status', status);
}

export function setUniverse(symbols) {
  state.universe = symbols;
  state.trackedSymbols = new Set(symbols);
  bus.emit('universe:ready', symbols);
}

export function upsertTicker(symbol, patch) {
  const prev = state.tickers.get(symbol) || {};
  const next = { ...prev, prevPrice: prev.price, ...patch };
  state.tickers.set(symbol, next);
  bus.emit('ticker:update', { symbol, data: next });
}

export function upsertMarketData(symbol, patch) {
  const prev = state.marketData.get(symbol) || {};
  const next = { ...prev, ...patch };
  state.marketData.set(symbol, next);
  bus.emit('marketdata:update', { symbol, data: next });
  if (symbol === state.selectedSymbol) bus.emit('marketdata:selected', next);
}

export function pushLiquidation(liq) {
  state.liquidations.unshift(liq);
  if (state.liquidations.length > 80) state.liquidations.length = 80;

  const cutoff = Date.now() - 30 * 60 * 1000;
  state.liquidations = state.liquidations.filter((l) => l.time >= cutoff);
  const totals = state.liquidations.reduce(
    (acc, l) => {
      acc.total += l.usd;
      acc[l.side === 'long' ? 'long' : 'short'] += l.usd;
      return acc;
    },
    { total: 0, long: 0, short: 0 }
  );
  state.liqTotals = totals;
  bus.emit('liq:new', liq);
  bus.emit('liq:totals', totals);
}

export function setFearGreed(fg) {
  state.fearGreed = fg;
  bus.emit('feargreed:update', fg);
}

export function setSelectedSymbol(symbol) {
  if (symbol === state.selectedSymbol) return;
  state.selectedSymbol = symbol;
  bus.emit('symbol:selected', symbol);
  const md = state.marketData.get(symbol);
  if (md) bus.emit('marketdata:selected', md);
}

export function addCvdDelta(symbol, deltaUsd) {
  const prev = state.cvd.get(symbol) || 0;
  const next = prev + deltaUsd;
  state.cvd.set(symbol, next);
  if (symbol === state.selectedSymbol) bus.emit('cvd:update', next);
  return next;
}

export function resetCvd(symbol) {
  state.cvd.set(symbol, 0);
  if (symbol === state.selectedSymbol) bus.emit('cvd:update', 0);
}
