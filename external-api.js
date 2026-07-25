// ============================================================
// external-api.js — non-Binance data sources.
//   - CoinGecko: market cap + fallback price/volume if Binance is down
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

const CG = 'https://api.coingecko.com/api/v3';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** symbol (e.g. "BTC") -> market cap USD, for the top N coins by market cap */
export async function getMarketCaps(vsCurrency = 'usd', perPage = 200) {
  const rows = await getJson(
    `${CG}/coins/markets?vs_currency=${vsCurrency}&order=market_cap_desc&per_page=${perPage}&page=1&sparkline=false`
  );
  const map = {};
  for (const r of rows) map[r.symbol.toUpperCase()] = r.market_cap;
  return map;
}

export async function getFearGreedIndex() {
  const d = await getJson('https://api.alternative.me/fng/?limit=1');
  const row = d?.data?.[0];
  if (!row) return null;
  return {
    value: parseInt(row.value, 10),
    label: row.value_classification,
    updatedAt: parseInt(row.timestamp, 10) * 1000,
  };
}
