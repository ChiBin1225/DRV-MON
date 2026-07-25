// ============================================================
// external-api.js — everything that isn't Binance:
//   - CoinGecko: market cap for the overview panels
//   - alternative.me: Crypto Fear & Greed Index
//
// Note on CoinGlass: their public API requires a paid key and is
// not reachable from a browser without one, so it isn't wired up
// here. Everything CoinGlass would normally supply for a single
// exchange (funding, OI, liquidations, L/S ratio) is already
// covered directly from Binance in binance-ws.js / binance-rest.js.
// If you have a CoinGlass API key for *cross-exchange aggregated*
// data, add calls to https://open-api-v4.coinglass.com here and
// merge the result into state.marketData the same way the Binance
// REST helpers do.
// ============================================================
import { setFearGreed, upsertMarketData, state } from './state.js';
import { sleep } from './utils.js';

const CG = 'https://api.coingecko.com/api/v3';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function loadMarketCaps(vsCurrency = 'usd', perPage = 200) {
  try {
    const rows = await getJson(
      `${CG}/coins/markets?vs_currency=${vsCurrency}&order=market_cap_desc&per_page=${perPage}&page=1&sparkline=false`
    );
    for (const r of rows) {
      const symbol = `${r.symbol.toUpperCase()}USDT`;
      if (state.trackedSymbols.has(symbol)) upsertMarketData(symbol, { mcap: r.market_cap });
    }
  } catch {
    // market cap is decorative — a failed fetch shouldn't break anything else
  }
}

export async function loadFearGreed() {
  try {
    const d = await getJson('https://api.alternative.me/fng/?limit=1');
    const row = d?.data?.[0];
    if (!row) return;
    setFearGreed({
      value: parseInt(row.value, 10),
      label: row.value_classification,
      updatedAt: parseInt(row.timestamp, 10) * 1000,
    });
  } catch {
    // leave previous value in place
  }
}

/** Fear & Greed only moves once a day; alternative.me suggests polling infrequently. */
export function startFearGreedLoop() {
  const tick = async () => {
    if (!document.hidden) await loadFearGreed();
  };
  tick();
  setInterval(tick, 5 * 60 * 1000);
}

export function startMarketCapLoop() {
  const tick = async () => {
    if (!document.hidden) await loadMarketCaps();
  };
  tick();
  setInterval(tick, 5 * 60 * 1000);
}
