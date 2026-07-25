// ============================================================
// binance-rest.js — everything Binance doesn't push over WS
// (open interest history, long/short account ratio) plus the
// one-time bootstrap and the REST fallback loop used when the
// WebSocket is down.
// ============================================================
import { state, setUniverse, upsertTicker, upsertMarketData, setConnStatus } from './state.js';
import { sleep } from './utils.js';

const FAPI = 'https://fapi.binance.com';
const TOP_N_FOR_DEPTH_POLL = 45; // OI%/L-S ratio only polled for the most liquid symbols
const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 900; // stay well under Binance's rate limit (418/429)

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.json();
}

/**
 * One parallel Promise.all batch: exchangeInfo (universe) + ticker/24hr
 * (initial price/volume/change) + premiumIndex (initial funding/mark) —
 * fired together, not sequentially, so the first paint doesn't wait on
 * three round trips stacked one after another.
 */
export async function bootstrap() {
  const [exchangeInfo, tickers, premiums] = await Promise.all([
    getJson(`${FAPI}/fapi/v1/exchangeInfo`),
    getJson(`${FAPI}/fapi/v1/ticker/24hr`),
    getJson(`${FAPI}/fapi/v1/premiumIndex`),
  ]);

  const perpetualUsdt = new Set(
    exchangeInfo.symbols
      .filter((s) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
      .map((s) => s.symbol)
  );

  const tickerBySymbol = new Map(tickers.map((t) => [t.symbol, t]));
  const universe = [...perpetualUsdt].sort((a, b) => {
    const va = parseFloat(tickerBySymbol.get(a)?.quoteVolume || 0);
    const vb = parseFloat(tickerBySymbol.get(b)?.quoteVolume || 0);
    return vb - va;
  });

  setUniverse(universe);

  for (const symbol of universe) {
    const t = tickerBySymbol.get(symbol);
    if (t) {
      upsertTicker(symbol, {
        price: parseFloat(t.lastPrice),
        chg24: parseFloat(t.priceChangePercent),
        vol24: parseFloat(t.volume),
        quoteVol24: parseFloat(t.quoteVolume),
      });
    }
  }

  const premiumBySymbol = new Map(premiums.map((p) => [p.symbol, p]));
  for (const symbol of universe) {
    const p = premiumBySymbol.get(symbol);
    if (p) {
      upsertMarketData(symbol, {
        markPrice: parseFloat(p.markPrice),
        funding: parseFloat(p.lastFundingRate) * 100,
        nextFundingTime: p.nextFundingTime,
      });
    }
  }

  return universe;
}

// ---------- OI% (1h) + Long/Short ratio, batched & paced ----------

let depthLoopRunning = false;
let depthLoopStop = false;

export function startDepthPollLoop() {
  if (depthLoopRunning) return;
  depthLoopRunning = true;
  depthLoopStop = false;
  pollDepthDataLoop();
}

export function stopDepthPollLoop() {
  depthLoopStop = true;
  depthLoopRunning = false;
}

async function pollDepthDataLoop() {
  while (!depthLoopStop) {
    if (document.hidden) {
      await sleep(2000);
      continue;
    }
    const targets = state.universe.slice(0, TOP_N_FOR_DEPTH_POLL);
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      if (depthLoopStop) return;
      if (document.hidden) break;
      const batch = targets.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(fetchDepthForSymbol));
      await sleep(BATCH_DELAY_MS);
    }
    await sleep(5000);
  }
}

async function fetchDepthForSymbol(symbol) {
  try {
    const [oiHist, lsRatio] = await Promise.all([
      getJson(`${FAPI}/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=2`),
      getJson(`${FAPI}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`),
    ]);

    const patch = {};
    if (oiHist?.length) {
      const latest = oiHist[oiHist.length - 1];
      const prior = oiHist.length > 1 ? oiHist[0] : latest;
      const oi = parseFloat(latest.sumOpenInterest);
      const oiUsd = parseFloat(latest.sumOpenInterestValue);
      const priorOi = parseFloat(prior.sumOpenInterest) || oi;
      patch.oi = oi;
      patch.oiUsd = oiUsd;
      patch.oiPct1h = priorOi ? ((oi - priorOi) / priorOi) * 100 : 0;
    }
    if (lsRatio?.length) {
      const row = lsRatio[lsRatio.length - 1];
      const ratio = parseFloat(row.longShortRatio);
      const longAccount = parseFloat(row.longAccount) * 100;
      const shortAccount = parseFloat(row.shortAccount) * 100;
      patch.lsRatio = ratio;
      patch.lsLongPct = longAccount;
      patch.lsShortPct = shortAccount;
    }
    if (Object.keys(patch).length) upsertMarketData(symbol, patch);
  } catch {
    // one symbol failing (rate limit / delisting edge case) shouldn't
    // stop the whole batch — just skip it this cycle
  }
}

// ---------- REST fallback when WebSocket is unreachable ----------

let fallbackTimer = null;

export function startRestFallbackPolling() {
  if (fallbackTimer) return;
  const tick = async () => {
    try {
      const [tickers, premiums] = await Promise.all([
        getJson(`${FAPI}/fapi/v1/ticker/24hr`),
        getJson(`${FAPI}/fapi/v1/premiumIndex`),
      ]);
      const premiumBySymbol = new Map(premiums.map((p) => [p.symbol, p]));
      for (const t of tickers) {
        if (!state.trackedSymbols.has(t.symbol)) continue;
        upsertTicker(t.symbol, {
          price: parseFloat(t.lastPrice),
          chg24: parseFloat(t.priceChangePercent),
          vol24: parseFloat(t.volume),
          quoteVol24: parseFloat(t.quoteVolume),
        });
        const p = premiumBySymbol.get(t.symbol);
        if (p) {
          upsertMarketData(t.symbol, {
            markPrice: parseFloat(p.markPrice),
            funding: parseFloat(p.lastFundingRate) * 100,
            nextFundingTime: p.nextFundingTime,
          });
        }
      }
      setConnStatus('fallback');
    } catch {
      // network still down — keep trying on the next tick
    }
  };
  tick();
  fallbackTimer = setInterval(tick, 5000);
}

export function stopRestFallbackPolling() {
  clearInterval(fallbackTimer);
  fallbackTimer = null;
}
