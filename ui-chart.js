// ============================================================
// ui-chart.js — TradingView widget embed. Owns the timeframe
// buttons and reacts to symbol selection from the matrix table.
// The widget manages its own WebSocket internally; we only ever
// re-create it on symbol/timeframe change.
// ============================================================
import { bus } from './utils.js';
import { state, setSelectedSymbol } from './state.js';
import { subscribeCvd } from './binance-ws.js';
import { resetCvd } from './state.js';

const TF_MAP = { '1m': '1', '3m': '3', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W' };
let currentTf = '15m';
let widget = null;

export function initChart() {
  document.querySelectorAll('.tf-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tf-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTf = btn.dataset.tf;
      renderWidget(state.selectedSymbol);
    });
  });

  bus.on('symbol:selected', (symbol) => {
    document.getElementById('chart-title').textContent = `BINANCE:${symbol} · PERP`;
    document.getElementById('md-symbol').textContent = symbol;
    renderWidget(symbol);
    resetCvd(symbol);
    subscribeCvd(symbol);
  });

  renderWidget(state.selectedSymbol);
  subscribeCvd(state.selectedSymbol);
}

function renderWidget(symbol) {
  const container = document.getElementById('tv-chart');
  if (!container || typeof TradingView === 'undefined') return;
  container.innerHTML = '';
  widget = new TradingView.widget({
    autosize: true,
    symbol: `BINANCE:${symbol}.P`,
    interval: TF_MAP[currentTf] || '15',
    timezone: 'Asia/Ho_Chi_Minh',
    theme: 'dark',
    style: '1',
    locale: 'vi_VN',
    toolbar_bg: '#050709',
    enable_publishing: false,
    hide_top_toolbar: false,
    hide_legend: false,
    save_image: false,
    container_id: 'tv-chart',
    backgroundColor: '#050709',
    gridColor: 'rgba(255,255,255,0.05)',
  });
}

export function selectSymbolFromTable(symbol) {
  setSelectedSymbol(symbol);
}
