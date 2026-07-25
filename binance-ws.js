// ============================================================
// binance-ws.js — one combined WebSocket for price + funding +
// liquidations across the whole exchange, filtered down to
// `state.trackedSymbols` at the parsing layer (Binance pushes
// ~400+ symbols/sec on !ticker@arr and !markPrice@arr@1s whether
// we want them or not — filtering here means updates for symbols
// we don't display never touch state, the bus, or the DOM at all).
//
// A second, separate WS subscribes to aggTrade for whichever
// symbol is currently selected in the chart, to drive the CVD
// panel — opened/closed on demand so we're never paying for trade
// tick volume on 150 symbols simultaneously.
// ============================================================
import { state, setConnStatus, upsertTicker, upsertMarketData, pushLiquidation, addCvdDelta } from './state.js';
import { sleep } from './utils.js';
import { startRestFallbackPolling, stopRestFallbackPolling } from './binance-rest.js';

const WS_BASE = 'wss://fstream.binance.com/stream?streams=';
const COMBINED_STREAMS = ['!ticker@arr', '!markPrice@arr@1s', '!forceOrder@arr'];

let mainSocket = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
let fallbackActive = false;

let cvdSocket = null;
let cvdSymbol = null;

export function startMainSocket() {
  const url = WS_BASE + COMBINED_STREAMS.join('/');
  mainSocket = new WebSocket(url);

  mainSocket.onopen = () => {
    reconnectAttempts = 0;
    if (fallbackActive) {
      fallbackActive = false;
      stopRestFallbackPolling();
    }
    setConnStatus('live');
  };

  mainSocket.onmessage = (evt) => {
    let msg;
    try {
      msg = JSON.parse(evt.data);
    } catch {
      return;
    }
    const stream = msg.stream;
    const data = msg.data;
    if (!stream || !data) return;

    if (stream.startsWith('!ticker@arr')) handleTickerArray(data);
    else if (stream.startsWith('!markPrice@arr')) handleMarkPriceArray(data);
    else if (stream.startsWith('!forceOrder@arr')) handleForceOrder(data);
  };

  mainSocket.onclose = () => {
    scheduleReconnect();
  };

  mainSocket.onerror = () => {
    mainSocket?.close();
  };
}

function scheduleReconnect() {
  reconnectAttempts += 1;
  if (reconnectAttempts >= 3 && !fallbackActive) {
    fallbackActive = true;
    setConnStatus('fallback');
    startRestFallbackPolling();
  } else if (reconnectAttempts < 3) {
    setConnStatus('connecting');
  }
  const delay = Math.min(1000 * 2 ** Math.min(reconnectAttempts, 5), 30000);
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(startMainSocket, delay);
}

function handleTickerArray(rows) {
  for (const t of rows) {
    const symbol = t.s;
    if (!state.trackedSymbols.has(symbol)) continue;
    upsertTicker(symbol, {
      price: parseFloat(t.c),
      chg24: parseFloat(t.P),
      vol24: parseFloat(t.v),
      quoteVol24: parseFloat(t.q),
    });
  }
}

function handleMarkPriceArray(rows) {
  for (const m of rows) {
    const symbol = m.s;
    if (!state.trackedSymbols.has(symbol)) continue;
    upsertMarketData(symbol, {
      markPrice: parseFloat(m.p),
      funding: parseFloat(m.r) * 100, // as %
      nextFundingTime: m.T,
    });
  }
}

function handleForceOrder(evt) {
  const o = evt.o;
  if (!o) return;
  const symbol = o.s;
  if (!state.trackedSymbols.has(symbol)) return;
  const qty = parseFloat(o.q);
  const price = parseFloat(o.ap) || parseFloat(o.p);
  const usd = qty * price;
  // SELL force order = a long position got liquidated; BUY = a short got liquidated.
  const side = o.S === 'SELL' ? 'long' : 'short';
  pushLiquidation({
    symbol,
    side,
    usd,
    price,
    time: o.T || Date.now(),
  });
}

// ---------- CVD: per-symbol aggTrade stream, swapped on selection ----------

export function subscribeCvd(symbol) {
  if (symbol === cvdSymbol) return;
  cvdSocket?.close();
  cvdSymbol = symbol;
  const url = `wss://fstream.binance.com/ws/${symbol.toLowerCase()}@aggTrade`;
  cvdSocket = new WebSocket(url);
  cvdSocket.onmessage = (evt) => {
    let t;
    try {
      t = JSON.parse(evt.data);
    } catch {
      return;
    }
    const qty = parseFloat(t.q);
    const price = parseFloat(t.p);
    const usd = qty * price;
    // m === true means the buyer is the market maker -> aggressive SELL.
    const delta = t.m ? -usd : usd;
    addCvdDelta(symbol, delta);
  };
  cvdSocket.onclose = () => {
    if (cvdSymbol === symbol) {
      // symbol still selected but socket dropped — retry shortly
      setTimeout(() => {
        if (cvdSymbol === symbol) subscribeCvd(symbol);
      }, 2000);
    }
  };
}

export async function restartMainSocketHard() {
  mainSocket?.close();
  clearTimeout(reconnectTimer);
  reconnectAttempts = 0;
  await sleep(300);
  startMainSocket();
}
