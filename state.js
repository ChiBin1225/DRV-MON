// ============================================================
// state.js — single in-memory store. Modules mutate through the
// exported setters and subscribe via `bus` instead of reaching
// into each other's internals.
// ============================================================
import { EventBus } from './utils.js';

export const bus = new EventBus();

export const state = {
  // symbol -> { sym, price, prevPrice, chg24, vol24, quoteVol24, high24, low24, updatedAt }
  tickers: new Map(),

  // symbol -> { funding, nextFundingTime, oi, oiUsd, lsRatio, updatedAt }
  marketData: new Map(),

  // rolling buffer of recent liquidation events, newest first
  liquidations: [],

  // currently selected symbol for chart + market-data panel
  selectedSymbol: 'BTCUSDT',

  // fear & greed index snapshot
  fearGreed: null,

  // connection status flags, surfaced in the header
  status: {
    tickerWs: 'connecting',   // connecting | live | fallback | error
    liqWs: 'connecting',
  },
};

export function upsertTicker(sym, patch) {
  const prev = state.tickers.get(sym);
  const next = { ...prev, sym, ...patch, updatedAt: Date.now() };
  state.tickers.set(sym, next);
  bus.emit('ticker', { sym, prev, next });
}

export function upsertMarketData(sym, patch) {
  const prev = state.marketData.get(sym) || {};
  const next = { ...prev, ...patch, updatedAt: Date.now() };
  state.marketData.set(sym, next);
  bus.emit('marketData', { sym, next });
}

export function pushLiquidation(evt) {
  state.liquidations.unshift(evt);
  if (state.liquidations.length > 150) state.liquidations.length = 150;
  bus.emit('liquidation', evt);
}

export function setStatus(key, val) {
  state.status[key] = val;
  bus.emit('status', { key, val });
}

export function setSelectedSymbol(sym) {
  state.selectedSymbol = sym;
  bus.emit('selectedSymbol', sym);
}

export function setFearGreed(fg) {
  state.fearGreed = fg;
  bus.emit('fearGreed', fg);
}
