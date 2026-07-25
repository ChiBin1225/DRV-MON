// ============================================================
// main.js — startup sequence. The WebSocket is opened immediately,
// in parallel with the REST bootstrap batch, instead of waiting
// for REST to finish first — the WS handshake (DNS+TCP+TLS+Upgrade)
// and the REST fetches race each other instead of queueing.
// ============================================================
import { bootstrap, startDepthPollLoop } from './binance-rest.js';
import { startMainSocket } from './binance-ws.js';
import { startFearGreedLoop, startMarketCapLoop } from './external-api.js';

import { initTopbar } from './ui-topbar.js';
import { initChart } from './ui-chart.js';
import { initMarketData } from './ui-marketdata.js';
import { initCvd } from './ui-cvd.js';
import { initLiquidations } from './ui-liquidations.js';
import { initOverview } from './ui-overview.js';
import { initTable } from './ui-table.js';

function initUi() {
  initTopbar();
  initChart();
  initMarketData();
  initCvd();
  initLiquidations();
  initOverview();
  initTable();
}

async function start() {
  initUi();

  // WS opens now; REST bootstrap runs concurrently — whichever
  // resolves first starts painting data, nothing blocks on the other.
  startMainSocket();

  try {
    await bootstrap();
    startDepthPollLoop();
    startFearGreedLoop();
    startMarketCapLoop();
  } catch (err) {
    console.error('Bootstrap thất bại:', err);
  } finally {
    const boot = document.getElementById('boot-overlay');
    if (boot) boot.style.display = 'none';
  }
}

start();
