# DRV MON v2 — Real-Time Crypto Trading Dashboard

Bản rebuild của [DRV-MON](https://chibin1225.github.io/DRV-MON/), nâng cấp thành dashboard
real-time kiểu CoinGlass/TradingView, kiến trúc module hóa.

## 1. Cấu trúc file

```
DRV-MON/
├── .github/
│   └── workflows/
│       └── deploy.yml       # GitHub Actions: tự deploy lên Pages mỗi lần push main
├── .nojekyll                # Tắt xử lý Jekyll mặc định của GitHub Pages
├── index.html               # Bố cục trang, nạp CSS + các module JS (ES Modules)
├── css/
│   └── style.css            # Toàn bộ giao diện (dark trading terminal)
└── js/
    ├── utils.js              # Hàm tiện ích thuần: format số, flash hiệu ứng, debounce, EventBus
    ├── state.js               # Kho state trung tâm + pub/sub (mọi module đọc/ghi qua đây)
    ├── binance-ws.js           # WebSocket Binance Futures: giá, funding, thanh lý, aggTrade (CVD) real-time
    ├── binance-rest.js         # REST Binance: universe symbol, OI, L/S ratio, fallback khi WS rớt
    ├── external-api.js         # CoinGecko (vốn hóa) + Fear & Greed Index
    ├── ui-topbar.js             # 3 thẻ giá lớn BTC/ETH/SOL
    ├── ui-chart.js              # Nhúng TradingView Advanced Chart widget
    ├── ui-marketdata.js         # Panel funding / open interest / long-short ratio
    ├── ui-cvd.js                # Panel Cumulative Volume Delta cho symbol đang chọn
    ├── ui-liquidations.js       # Feed thanh lý real-time, highlight lệnh lớn
    ├── ui-overview.js           # Top gainers/losers + gauge Fear & Greed + stats-bar
    ├── ui-table.js              # Bảng ma trận toàn bộ coin (~150+ symbol)
    └── main.js                  # Điểm khởi động — gọi các init theo thứ tự

```

Mỗi file JS chỉ lo một việc (API hoặc UI), giao tiếp qua `state.js` và `EventBus`
(`bus.on(...)`, `bus.emit(...)`) — không có module nào gọi thẳng vào DOM của module khác.

## 2. Chạy thử

Vì dùng ES Modules (`<script type="module">`), trình duyệt sẽ chặn bằng `file://` do CORS.
Cần chạy qua HTTP server, đơn giản nhất:

```bash
cd DRV-MON
python3 -m http.server 8080
# rồi mở http://localhost:8080
```

## 3. Deploy lên GitHub Pages — thay thế toàn bộ repo cũ

Vì đây là nâng cấp thay hết code cũ, cách sạch nhất là **xóa hết file cũ trong repo và đẩy
trọn bộ thư mục này lên**, thay vì sửa từng file:

```bash
# trong thư mục DRV-MON đã tải về
git init
git add .
git commit -m "DRV MON v2 — real-time dashboard, thêm CVD"
git branch -M main
git remote add origin https://github.com/ChiBin1225/DRV-MON.git
git push -u origin main --force
```

`--force` là bắt buộc ở đây vì lịch sử commit mới này không liên quan tới repo cũ trên GitHub.
Nếu muốn giữ lịch sử cũ, thay vào đó: xóa hết file trong repo qua giao diện web (trừ `.git`),
rồi upload toàn bộ file mới vào, commit bình thường.

**Bật Pages (chỉ cần làm 1 lần):**
1. Vào repo → **Settings → Pages**.
2. **Build and deployment → Source** → chọn **GitHub Actions**.
3. Xong — mỗi lần push `main`, workflow tự chạy, xem tiến trình ở tab **Actions**.

## 4. Nguồn dữ liệu & cách lấy real-time

| Dữ liệu | Nguồn | Cơ chế |
|---|---|---|
| Giá, %24h, volume | Binance Futures WS `!ticker@arr` | Push liên tục ~1s, mọi symbol trong 1 kết nối |
| Funding rate, mark price | Binance Futures WS `!markPrice@arr@1s` | Push mỗi giây |
| Thanh lý (liquidations) | Binance Futures WS `!forceOrder@arr` | Push ngay khi có lệnh thanh lý trên toàn sàn |
| **CVD (Cumulative Volume Delta)** | Binance Futures WS `<symbol>@aggTrade` | Push mỗi trade khớp lệnh của symbol đang chọn trên chart |
| Open Interest, % thay đổi OI | Binance REST `/futures/data/openInterestHist` | Poll theo lô (không có push stream cho OI) |
| Long/Short ratio | Binance REST `/futures/data/globalLongShortAccountRatio` | Poll theo lô |
| Vốn hóa thị trường | CoinGecko `/coins/markets` | Poll mỗi 5 phút |
| Fear & Greed Index | alternative.me `/fng/` | Poll mỗi 5 phút |
| Chart đa khung thời gian | TradingView widget (`BINANCE:{SYM}.P`) | Widget tự quản lý WS riêng |

**Về CVD**: tính từ stream `aggTrade` của symbol đang chọn — mỗi trade khớp, nếu bên mua là
market maker (`m: true`) nghĩa là lệnh market SELL vừa ăn vào orderbook (bán chủ động, CVD trừ),
ngược lại là mua chủ động (CVD cộng). Giá trị là **CVD phiên hiện tại** (reset khi đổi symbol
hoặc load lại trang), không phải CVD tích lũy toàn lịch sử — muốn giữ qua các lần tải trang cần
lưu vào `localStorage` (không dùng được trong artifact preview của Claude.ai, nhưng chạy bình
thường khi host thật). Panel chỉ mở 1 kết nối `aggTrade` tại một thời điểm — đổi symbol trên
chart sẽ tự đóng stream cũ và mở stream mới, không tích lũy socket rác.

**Về CoinGlass**: API chính thức yêu cầu key trả phí, không có CORS công khai cho browser. Vì
funding/OI/liquidation/L-S ratio/CVD ở đây đã lấy trực tiếp từ Binance (miễn phí, real-time),
dashboard không phụ thuộc CoinGlass. Muốn thêm dữ liệu tổng hợp *nhiều sàn cùng lúc*, thêm lời
gọi tới `https://open-api-v4.coinglass.com` trong `external-api.js`.

**Về Fallback**: nếu WebSocket rớt (mạng, firewall chặn WS, Binance bảo trì), sau 3 lần
reconnect thất bại, `binance-ws.js` tự chuyển badge trạng thái sang "REST FALLBACK" và bắt đầu
poll REST mỗi 5s trong lúc vẫn âm thầm thử reconnect WS ở nền — không cần người dùng làm gì.

## 5. Ghi chú tối ưu hiệu năng (đã áp dụng)

**Khởi động nhanh hơn:**
- `bootstrap()` gộp 3 lệnh REST (`exchangeInfo`, `ticker/24hr`, `premiumIndex`) thành 1 đợt
  `Promise.all` song song duy nhất.
- WebSocket mở ngay lập tức, song song với REST bootstrap, thay vì đợi REST xong mới mở.
- `<link rel="preconnect">` tới mọi domain API ngay trong `<head>`.
- `tv.js` tải với `defer`, không chặn parser HTML.

**Giảm tải xử lý mỗi giây:**
- Lọc `!ticker@arr` / `!markPrice@arr@1s` theo `trackedSymbols` ngay tại tầng WS — bỏ symbol
  không hiển thị trước khi lọt xuống UI.
- CVD chỉ mở 1 stream `aggTrade` cho đúng 1 symbol đang chọn, không subscribe tất cả.

**Bỏ forced synchronous reflow:**
- Hiệu ứng flash xanh/đỏ dùng `Element.animate()` (Web Animations API) thay vì class-toggle +
  `offsetWidth` — animation chạy trên compositor, không chặn main thread dù ~150 coin tick/giây.

**Cache DOM reference:**
- `ui-table.js` và `ui-topbar.js` cache toàn bộ `<td>`/`<span>` vào `Map` một lần lúc dựng bảng,
  tái sử dụng ở mọi update sau — không `getElementById`/`querySelector` trên đường xử lý tick.
- Sort/lọc bảng dùng `DocumentFragment`, chỉ 1 lần reflow cho cả thao tác.

**Throttle tính toán tổng hợp:**
- Top gainers/losers, stats-bar tính lại mỗi 2s (không phải mỗi tick) — tránh sort lại toàn bộ
  ~150 symbol hàng trăm lần/giây trong khi mắt người không phân biệt được chênh lệch đó.

**Tạm dừng khi không cần thiết:**
- Poll OI%/L-S ratio, market cap, Fear & Greed, và lấy mẫu sparkline CVD đều tự tạm dừng khi
  `document.hidden === true`.

**Vẫn giữ:**
- 1 kết nối WebSocket duy nhất cho giá + funding + thanh lý (combined stream), CVD dùng socket
  riêng vì đây là stream theo-symbol chứ không phải toàn sàn.
- Batch 3 symbol/lượt, cách nhau ~900ms khi poll OI%/L-S ratio, tránh rate-limit 418/429.

## 6. Có thể mở rộng thêm

- CVD spot vs futures (hiện chỉ có futures — thêm 1 aggTrade stream từ `api.binance.com` cho
  spot và vẽ chồng 2 đường để so sánh).
- Order book depth (Binance WS `<symbol>@depth`).
- Composite squeeze-score / signal badges.
- Lưu watchlist / CVD lịch sử vào `localStorage` khi host thật (ngoài artifact preview).
