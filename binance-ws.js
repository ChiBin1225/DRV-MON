// ============================================================
// binance-ws.js — real-time data via Binance Futures combined
// WebSocket streams. Falls back to REST polling automatically
// if the socket can't stay connected.
// ============================================================
import { backoffMs } from './utils.js';
import { upsertTicker, upsertMarketData, pushLiquidation, setStatus } from './state.js';
import { pollTickersOnce, pollFundingOnce } from './binance-rest.js';

const FSTREAM = 'wss://fstream.binance.com/stream?streams=';
// !ticker@arr        -> 24h rolling ticker for every futures symbol, ~1s
// !markPrice@arr@1s   -> mark price + current funding rate for every symbol, 1s
// !forceOrder@arr     -> every liquidation order across the whole exchange
const STREAMS = ['!ticker@arr', '!markPrice@arr@1s', '!forceOrder@arr'].join('/');

let ws = null;
let reconnectAttempt = 0;
let fallbackTimer = null;
let intentionalClose = false;

// Binance's !ticker@arr / !markPrice@arr@1s streams push EVERY perpetual
// on the exchange (~400+ symbols) once a second, but the UI only ever
// shows ~150 (the matrix universe) + the 3 hero symbols. Without a filter,
// every tick does ~250 wasted Map writes + bus emits + DOM lookups that
// nothing is listening for. `trackedSymbols` starts as null (process
// everything) so hero-card data isn't lost during the brief window before
// the symbol universe is known, then narrows once setTrackedSymbols runs.
let trackedSymbols = null;

export function setTrackedSymbols(symbols) {
  trackedSymbols = new Set(symbols);
}

function isTracked(sym) {
  return trackedSymbols === null || trackedSymbols.has(sym);
}

export function startBinanceFeed() {
  intentionalClose = false;
  connect();
}

export function stopBinanceFeed() {
  intentionalClose = true;
  clearTimeout(fallbackTimer);
  ws?.close();
}

function connect() {
  try {
    ws = new WebSocket(FSTREAM + STREAMS);
  } catch (e) {
    console.error('WS construct failed', e);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectAttempt = 0;
    setStatus('tickerWs', 'live');
    setStatus('liqWs', 'live');
    clearTimeout(fallbackTimer);
  };

  ws.onmessage = (msg) => {
    let payload;
    try { payload = JSON.parse(msg.data); } catch { return; }
    const { stream, data } = payload;
    if (!stream || !data) return;

    if (stream === '!ticker@arr') handleTickerArr(data);
    else if (stream === '!markPrice@arr@1s') handleMarkPriceArr(data);
    else if (stream === '!forceOrder@arr') handleLiquidation(data);
  };

  ws.onerror = () => {
    // onclose fires right after — reconnect logic lives there
  };

  ws.onclose = () => {
    if (intentionalClose) return;
    setStatus('tickerWs', 'error');
    setStatus('liqWs', 'error');
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  reconnectAttempt += 1;
  // after a few failed attempts, keep the UI alive with REST polling
  // while we keep retrying the socket in the background
  if (reconnectAttempt >= 3) {
    setStatus('tickerWs', 'fallback');
    armRestFallback();
  }
  const wait = backoffMs(reconnectAttempt);
  setTimeout(connect, wait);
}

function armRestFallback() {
  clearTimeout(fallbackTimer);
  const tick = async () => {
    try {
      await pollTickersOnce();
      await pollFundingOnce();
    } catch (e) {
      console.error('REST fallback poll failed', e);
    }
    fallbackTimer = setTimeout(tick, 5000);
  };
  tick();
}

function handleTickerArr(arr) {
  for (const t of arr) {
    if (!t.s.endsWith('USDT') || !isTracked(t.s)) continue;
    upsertTicker(t.s, {
      price: parseFloat(t.c),
      chg24: parseFloat(t.P),
      vol24: parseFloat(t.q),   // quote volume (USDT)
      high24: parseFloat(t.h),
      low24: parseFloat(t.l),
    });
  }
}

function handleMarkPriceArr(arr) {
  for (const m of arr) {
    if (!m.s.endsWith('USDT') || !isTracked(m.s)) continue;
    upsertMarketData(m.s, {
      markPrice: parseFloat(m.p),
      funding: parseFloat(m.r),
      nextFundingTime: m.T,
    });
  }
}

function handleLiquidation(d) {
  const o = d.o;
  if (!o) return;
  const qty = parseFloat(o.q);
  const price = parseFloat(o.ap || o.p);
  const usd = qty * price;
  pushLiquidation({
    sym: o.s,
    side: o.S,           // SELL liquidation = a long got liquidated, BUY = a short got liquidated
    price,
    qty,
    usd,
    time: o.T,
  });
}
