// ============================================================
// ui-chart.js — embeds the TradingView "Advanced Chart" widget
// and swaps it whenever the selected symbol / timeframe changes.
// TradingView's widget manages its own data + websocket, so this
// module only needs to (re)create the iframe-based widget.
// ============================================================
import { bus, state } from './state.js';

const TF_MAP = { '1m': '1', '3m': '3', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W' };
let currentTf = '15m';
let widget = null;

export function initChart() {
  renderWidget(state.selectedSymbol, currentTf);

  bus.on('selectedSymbol', (sym) => renderWidget(sym, currentTf));

  document.querySelectorAll('.tf-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tf-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTf = btn.dataset.tf;
      renderWidget(state.selectedSymbol, currentTf);
    });
  });
}

function renderWidget(sym, tf) {
  const host = document.getElementById('tv-chart');
  if (!host) return;
  host.innerHTML = '';
  document.getElementById('chart-title').textContent = `BINANCE:${sym} · PERP`;

  // eslint-disable-next-line no-undef
  widget = new TradingView.widget({
    autosize: true,
    symbol: `BINANCE:${sym}.P`,
    interval: TF_MAP[tf] || '15',
    timezone: 'Asia/Ho_Chi_Minh',
    theme: 'dark',
    style: '1',
    locale: 'vi_VN',
    toolbar_bg: '#060c14',
    enable_publishing: false,
    hide_top_toolbar: false,
    hide_legend: false,
    save_image: false,
    container_id: 'tv-chart',
    backgroundColor: '#020408',
    gridColor: 'rgba(20,37,53,0.5)',
    overrides: {
      'paneProperties.background': '#020408',
      'paneProperties.vertGridProperties.color': 'rgba(20,37,53,0.5)',
      'paneProperties.horzGridProperties.color': 'rgba(20,37,53,0.5)',
    },
  });
}
