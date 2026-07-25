// ============================================================
// main.js — app entry point. Wires every module together.
// Loaded as <script type="module" src="js/main.js">.
//
// Boot sequence, optimized for time-to-first-live-data:
//   1) UI modules mount immediately (cheap, synchronous DOM writes).
//   2) The websocket connection is opened right away — its handshake
//      then proceeds *concurrently* with the REST bootstrap below,
//      instead of waiting for REST to finish first. Ticks that arrive
//      before the symbol universe is known are processed for every
//      symbol (see binance-ws.js) so hero-card data is never lost.
//   3) A single parallel REST wave (exchangeInfo + ticker/24hr +
//      premiumIndex, fired together — see bootstrap() in
//      binance-rest.js) replaces what used to be two sequential
//      passes that each fetched /ticker/24hr independently.
//   4) Once that resolves, the matrix universe is known: the table
//      builds its rows and hydrates them straight from state (no
//      waiting for the next tick), and the websocket handler starts
//      filtering to just those ~150 symbols instead of processing
//      the full ~400-symbol exchange firehose.
// ============================================================
import { startBinanceFeed, setTrackedSymbols } from './binance-ws.js';
import { bootstrap } from './binance-rest.js';
import { upsertTicker, upsertMarketData } from './state.js';
import { initTopbar } from './ui-topbar.js';
import { initChart } from './ui-chart.js';
import { initMarketDataPanel } from './ui-marketdata.js';
import { initLiquidationsPanel } from './ui-liquidations.js';
import { initOverviewPanel } from './ui-overview.js';
import { initTable } from './ui-table.js';

const HERO_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

function startClock() {
  const el = document.getElementById('live-clock');
  if (!el) return;
  const tick = () => { el.textContent = new Date().toLocaleTimeString('vi-VN', { hour12: false }); };
  tick();
  setInterval(tick, 1000);
}

async function boot() {
  startClock();

  // 1) Mount every UI module up front — they read from `state` (empty
  //    for now) and subscribe to `bus`, so mounting early costs nothing
  //    and means they're already listening the instant data shows up.
  initTopbar();
  initChart();
  initMarketDataPanel();
  initLiquidationsPanel();
  initOverviewPanel();

  // 2) Open the websocket immediately — don't make its handshake wait
  //    behind the REST calls below. The two happen concurrently.
  startBinanceFeed();

  // 3) One parallel REST wave for the initial snapshot + symbol universe.
  try {
    const { tickerMap, universe, fundingMap } = await bootstrap(150);
    for (const [sym, t] of Object.entries(tickerMap)) upsertTicker(sym, t);
    for (const [sym, m] of Object.entries(fundingMap)) upsertMarketData(sym, m);

    // From here on, ignore ticks for the ~250 symbols the UI never shows.
    setTrackedSymbols([...universe, ...HERO_SYMBOLS]);

    await initTable(universe);
  } catch (e) {
    console.error('bootstrap REST failed', e);
  }

  document.getElementById('boot-overlay')?.remove();
}

boot();
