// ============================================================
// binance-rest.js — REST calls to Binance Futures. Used for:
//   1) initial snapshot / fallback when the WS drops
//   2) data that has no realtime stream (open interest, L/S ratio)
// ============================================================
import { upsertTicker, upsertMarketData } from './state.js';

const FAPI = 'https://fapi.binance.com';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 418 || res.status === 429) throw new Error(String(res.status));
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Everything the app needs to paint its first frame, fetched in a single
 * parallel wave instead of two sequential passes. Previously,
 * pollTickersOnce() and getSymbolUniverse() each called /ticker/24hr
 * independently — same ~400-symbol payload downloaded and parsed twice,
 * one round trip after the other. bootstrap() fetches exchangeInfo,
 * ticker/24hr, and premiumIndex concurrently and derives everything
 * (full ticker map + the top-N symbol universe + funding map) from that
 * single ticker/24hr response.
 */
export async function bootstrap(universeLimit = 150) {
  const [info, tickers, funding] = await Promise.all([
    getJson(`${FAPI}/fapi/v1/exchangeInfo`),
    getJson(`${FAPI}/fapi/v1/ticker/24hr`),
    getJson(`${FAPI}/fapi/v1/premiumIndex`),
  ]);

  const perpUsdt = new Set(
    info.symbols
      .filter((s) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
      .map((s) => s.symbol)
  );

  const tickerMap = {};
  for (const t of tickers) {
    if (!t.symbol.endsWith('USDT')) continue;
    tickerMap[t.symbol] = {
      price: parseFloat(t.lastPrice),
      chg24: parseFloat(t.priceChangePercent),
      vol24: parseFloat(t.quoteVolume),
      high24: parseFloat(t.highPrice),
      low24: parseFloat(t.lowPrice),
    };
  }

  const universe = tickers
    .filter((t) => perpUsdt.has(t.symbol))
    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
    .slice(0, universeLimit)
    .map((t) => t.symbol);

  const fundingMap = {};
  for (const r of funding) {
    if (!r.symbol.endsWith('USDT')) continue;
    fundingMap[r.symbol] = {
      markPrice: parseFloat(r.markPrice),
      funding: parseFloat(r.lastFundingRate),
      nextFundingTime: r.nextFundingTime,
    };
  }

  return { tickerMap, universe, fundingMap };
}

/** All USDT-margined perpetual symbols, sorted by 24h quote volume desc.
 *  Kept for callers that only need the universe (e.g. a manual refresh)
 *  without redoing the full bootstrap; prefer bootstrap() at boot time. */
export async function getSymbolUniverse(limit = 150) {
  const info = await getJson(`${FAPI}/fapi/v1/exchangeInfo`);
  const perpUsdt = new Set(
    info.symbols
      .filter((s) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
      .map((s) => s.symbol)
  );
  const tickers = await getJson(`${FAPI}/fapi/v1/ticker/24hr`);
  return tickers
    .filter((t) => perpUsdt.has(t.symbol))
    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
    .slice(0, limit)
    .map((t) => t.symbol);
}

/** One-shot REST snapshot for all symbols — used at boot and as WS fallback */
export async function pollTickersOnce() {
  const tickers = await getJson(`${FAPI}/fapi/v1/ticker/24hr`);
  for (const t of tickers) {
    if (!t.symbol.endsWith('USDT')) continue;
    upsertTicker(t.symbol, {
      price: parseFloat(t.lastPrice),
      chg24: parseFloat(t.priceChangePercent),
      vol24: parseFloat(t.quoteVolume),
      high24: parseFloat(t.highPrice),
      low24: parseFloat(t.lowPrice),
    });
  }
}

export async function pollFundingOnce() {
  const rows = await getJson(`${FAPI}/fapi/v1/premiumIndex`);
  for (const r of rows) {
    if (!r.symbol.endsWith('USDT')) continue;
    upsertMarketData(r.symbol, {
      markPrice: parseFloat(r.markPrice),
      funding: parseFloat(r.lastFundingRate),
      nextFundingTime: r.nextFundingTime,
    });
  }
}

/** Current open interest in contracts, plus USD notional using last price */
export async function getOpenInterest(sym) {
  const d = await getJson(`${FAPI}/fapi/v1/openInterest?symbol=${sym}`);
  return parseFloat(d.openInterest);
}

/** % change in OI over the lookback window (default 1h, 5m buckets) */
export async function getOpenInterestChangePct(sym, period = '1h') {
  const rows = await getJson(`${FAPI}/futures/data/openInterestHist?symbol=${sym}&period=${period}&limit=2`);
  if (!rows || rows.length < 2) return null;
  const a = parseFloat(rows[0].sumOpenInterest);
  const b = parseFloat(rows[rows.length - 1].sumOpenInterest);
  if (!a) return null;
  return ((b - a) / a) * 100;
}

/** Global long/short account ratio, most recent 5m bucket */
export async function getLongShortRatio(sym) {
  const rows = await getJson(`${FAPI}/futures/data/globalLongShortAccountRatio?symbol=${sym}&period=5m&limit=1`);
  if (!rows || !rows.length) return null;
  return {
    ratio: parseFloat(rows[0].longShortRatio),
    longAccount: parseFloat(rows[0].longAccount),
    shortAccount: parseFloat(rows[0].shortAccount),
  };
}

/** Recent funding rate history (for a small sparkline / avg-of-3) */
export async function getFundingHistory(sym, limit = 3) {
  const rows = await getJson(`${FAPI}/fapi/v1/fundingRate?symbol=${sym}&limit=${limit}`);
  return rows.map((r) => parseFloat(r.fundingRate));
}

export { FAPI };
