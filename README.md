# DRV MON v2 — Real-Time Crypto Trading Dashboard

Bản rebuild của [DRV-MON](https://chibin1225.github.io/DRV-MON/), nâng cấp thành dashboard
real-time kiểu CoinGlass/TradingView, kiến trúc module hóa.

## 1. Cấu trúc file

```
DRV-MON-v2/
├── .github/
│   └── workflows/
│       └── deploy.yml       # GitHub Actions: tự deploy lên Pages mỗi lần push main
├── .nojekyll                # Tắt xử lý Jekyll mặc định của GitHub Pages
├── .gitignore
├── index.html               # Bố cục trang, nạp CSS + các module JS (ES Modules)
├── css/
│   └── style.css           # Toàn bộ giao diện (dark trading terminal)
└── js/
    ├── utils.js             # Hàm tiện ích thuần: format số, flash hiệu ứng, debounce, EventBus
    ├── state.js              # Kho state trung tâm + pub/sub (mọi module đọc/ghi qua đây)
    ├── binance-ws.js          # WebSocket Binance Futures: giá, funding, thanh lý real-time
    ├── binance-rest.js        # REST Binance: universe symbol, OI, L/S ratio, fallback khi WS rớt
    ├── external-api.js        # CoinGecko (vốn hóa) + Fear & Greed Index
    ├── ui-topbar.js           # 3 thẻ giá lớn BTC/ETH/SOL
    ├── ui-chart.js             # Nhúng TradingView Advanced Chart widget
    ├── ui-marketdata.js        # Panel funding / open interest / long-short ratio
    ├── ui-liquidations.js      # Feed thanh lý real-time, highlight lệnh lớn
    ├── ui-overview.js          # Top gainers/losers + gauge Fear & Greed
    ├── ui-table.js             # Bảng ma trận toàn bộ coin (~150 symbol)
    └── main.js                 # Điểm khởi động — gọi các init theo thứ tự
```

Mỗi file JS chỉ lo một việc (API hoặc UI), giao tiếp qua `state.js` và `EventBus`
(`bus.on(...)`, `bus.emit(...)`) — không có module nào gọi thẳng vào DOM của module khác.

## 2. Chạy thử

Vì dùng ES Modules (`<script type="module">`), trình duyệt sẽ chặn bằng `file://` do CORS.
Cần chạy qua HTTP server, đơn giản nhất:

```bash
cd DRV-MON-v2
python3 -m http.server 8080
# rồi mở http://localhost:8080
```

Hoặc dùng extension "Live Server" của VS Code.

## 3. Deploy lên GitHub Pages

Repo này đã sẵn sàng deploy — không cần build step (thuần HTML/CSS/JS + ES Modules).
Có `.github/workflows/deploy.yml` (GitHub Actions) và `.nojekyll` (tắt xử lý Jekyll mặc định
của GitHub Pages, vì site này không dùng Jekyll và có file/thư mục JS không cần bị Jekyll đụng vào).

**Bước 1 — đẩy code lên GitHub:**
```bash
git init
git add .
git commit -m "DRV MON v2 — real-time dashboard"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

**Bước 2 — bật Pages (chọn 1 trong 2 cách):**

**Cách A — GitHub Actions (khuyến nghị, đã cấu hình sẵn):**
1. Vào repo → **Settings → Pages**.
2. Ở mục **Build and deployment → Source**, chọn **GitHub Actions**.
3. Xong. Mỗi lần push vào `main`, workflow `.github/workflows/deploy.yml` tự chạy và deploy —
   xem tiến trình ở tab **Actions**. URL site hiện ở tab Actions sau khi job `deploy` chạy xong,
   dạng `https://<user>.github.io/<repo>/`.

**Cách B — Deploy from branch (cổ điển, không cần Actions):**
1. Vào **Settings → Pages**.
2. **Source** chọn **Deploy from a branch** → branch `main`, thư mục `/ (root)`.
3. Có thể xóa `.github/workflows/deploy.yml` nếu dùng cách này (không bắt buộc, để cũng không sao,
   Pages source đang chọn "Deploy from a branch" thì workflow đó đơn giản là không được dùng tới).

Cả 2 cách đều publish thẳng các file tĩnh trong repo, không có bước build/transpile nào —
đúng những gì đang có trong thư mục này chạy y hệt trên Pages.

**Lưu ý về đường dẫn:** mọi liên kết CSS/JS trong `index.html` đều là **relative path**
(`css/style.css`, `js/main.js`, không có dấu `/` ở đầu) — nên chạy đúng dù Pages phục vụ ở
`https://<user>.github.io/<repo>/` (project page, có subpath) hay ở domain gốc (user/org page
`<user>.github.io`). Không cần sửa gì thêm khi đổi loại repo.

## 4. Nguồn dữ liệu & cách lấy real-time

| Dữ liệu | Nguồn | Cơ chế |
|---|---|---|
| Giá, %24h, volume | Binance Futures WS `!ticker@arr` | Push liên tục ~1s, mọi symbol trong 1 kết nối |
| Funding rate, mark price | Binance Futures WS `!markPrice@arr@1s` | Push mỗi giây |
| Thanh lý (liquidations) | Binance Futures WS `!forceOrder@arr` | Push ngay khi có lệnh thanh lý trên toàn sàn |
| Open Interest, % thay đổi OI | Binance REST `/futures/data/openInterestHist` | Poll theo lô (không có push stream cho OI) |
| Long/Short ratio | Binance REST `/futures/data/globalLongShortAccountRatio` | Poll theo lô |
| Vốn hóa thị trường | CoinGecko `/coins/markets` | Poll |
| Fear & Greed Index | alternative.me `/fng/` | Poll mỗi 5 phút |
| Chart đa khung thời gian | TradingView widget (`BINANCE:{SYM}.P`) | Widget tự quản lý WS riêng |

**Về CoinGlass**: API chính thức của CoinGlass yêu cầu API key trả phí và không cho gọi thẳng
từ browser (không có CORS công khai). Vì funding/OI/liquidation/L-S ratio ở đây đã lấy trực
tiếp từ Binance (miễn phí, real-time), dashboard không phụ thuộc CoinGlass. Nếu bạn có key
CoinGlass để lấy dữ liệu tổng hợp *nhiều sàn cùng lúc*, thêm lời gọi tới
`https://open-api-v4.coinglass.com` trong `external-api.js` và merge kết quả vào
`state.marketData` giống cách `binance-rest.js` đang làm — cấu trúc đã sẵn để cắm thêm nguồn.

**Về Fallback**: nếu WebSocket rớt (mạng, firewall chặn WS, Binance bảo trì), sau 3 lần
reconnect thất bại, `binance-ws.js` tự chuyển badge trạng thái sang "REST FALLBACK" và bắt đầu
poll REST mỗi 5s trong lúc vẫn âm thầm thử reconnect WS ở nền — không cần người dùng làm gì.

## 5. Ghi chú tối ưu hiệu năng (đã áp dụng)

**Khởi động nhanh hơn (giảm độ trễ round-trip đầu tiên):**
- `bootstrap()` trong `binance-rest.js` gộp 3 lệnh gọi REST (`exchangeInfo`, `ticker/24hr`,
  `premiumIndex`) thành **1 đợt `Promise.all` song song duy nhất**, thay vì bản trước đó gọi
  `ticker/24hr` hai lần ở hai bước tuần tự khác nhau (tốn 1 round-trip thừa hoàn toàn).
- WebSocket được mở **ngay lập tức, song song** với đợt REST bootstrap thay vì đợi REST xong
  mới mở — bắt tay WS (DNS+TCP+TLS+Upgrade) và REST fetch chạy cùng lúc, không xếp hàng.
- Thêm `<link rel="preconnect">` tới toàn bộ domain API (Binance REST/WS, CoinGecko,
  alternative.me, TradingView) ngay trong `<head>` — trình duyệt mở kết nối trước khi code JS
  kịp gọi fetch/WebSocket đầu tiên, cắt bớt 100–300ms bắt tay TLS trên kết nối lạnh.
- `tv.js` (TradingView) tải với `defer` thay vì chặn parser HTML, trong khi vẫn đảm bảo chạy
  trước `main.js` (script `type="module"` luôn tự defer) nhờ đúng thứ tự trong tài liệu.
- Bảng matrix và top bar **hydrate ngay từ `state`** khi vừa dựng DOM xong, thay vì hiện "–"
  và đợi tick WebSocket tiếp theo mới có dữ liệu — dữ liệu REST vừa fetch được sơn lên ngay.

**Giảm tải xử lý mỗi giây (WS "firehose" filtering):**
- Stream `!ticker@arr` / `!markPrice@arr@1s` của Binance đẩy TOÀN BỘ ~400+ symbol trên sàn mỗi
  giây, dù dashboard chỉ hiển thị ~150 (bảng matrix) + 3 (BTC/ETH/SOL). `binance-ws.js` giờ lọc
  theo `trackedSymbols` (set 1 lần sau khi biết universe) — bỏ qua ngay tại tầng WS thay vì để
  lọt xuống UI, cắt khoảng **60% lượt ghi Map + emit bus + tra cứu DOM thừa mỗi giây**.

**Bỏ forced synchronous reflow trong animation giá:**
- Hiệu ứng flash xanh/đỏ trước đây dùng class-toggle + `void el.offsetWidth` để ép reflow đồng
  bộ (bắt buộc để animation retrigger được) — với ~150 coin tick mỗi giây, đó là tới 150 lần ép
  trình duyệt tính lại layout đồng bộ mỗi giây, nguyên nhân giật hình thường gặp nhất ở dashboard
  real-time. Đã thay bằng `Element.animate()` (Web Animations API) — mỗi lần gọi tạo animation
  độc lập chạy trên compositor, không cần đọc `offsetWidth`, không chặn main thread.

**Cache DOM reference thay vì querying lại:**
- `ui-table.js` và `ui-topbar.js` cache toàn bộ `<td>`/`<span>` liên quan vào `Map` một lần lúc
  dựng bảng (`cellRefs`), rồi tái sử dụng ở mọi lần update sau — loại bỏ hoàn toàn
  `getElementById()`/`querySelector()` khỏi đường xử lý tick (trước đây gọi lại mỗi tick, mỗi
  symbol).
- Khi sort/lọc lại bảng, các `<tr>` được gom vào `DocumentFragment` rồi append một lần, thay vì
  append từng dòng — chỉ 1 lần reflow cho cả thao tác sắp xếp lại thay vì N lần.

**Tạm dừng khi không cần thiết:**
- Vòng lặp poll OI%/L-S ratio (`pollDepthDataLoop`) và vòng cập nhật gainers/losers tự tạm dừng
  khi `document.hidden === true` — không tốn API quota lẫn CPU vẽ lại UI khi tab đang chạy nền
  (dashboard "để mở cả ngày" là use case chính, nên đây là khoản tiết kiệm thực tế đáng kể).

**Vẫn giữ từ bản trước:**
- 1 kết nối WebSocket duy nhất cho cả giá + funding + thanh lý (combined stream).
- Batch 3 symbol/lượt, cách nhau ~900ms khi poll OI%/L-S ratio, tránh rate-limit 418/429.
- `async/await` + `Promise.all` cho mọi lô gọi REST song song.

**Có thể làm tiếp nếu cần hơn nữa:**
- Cache response `openInterestHist` phía client (TTL vài giây) nếu mở nhiều tab cùng lúc.
- Chuyển bảng matrix sang virtual scrolling nếu tăng universe lên >300 dòng.
- Service Worker cache cho `tv.js` + font để giảm round-trip khi tải lại trang.

## 6. Có thể mở rộng thêm

- Order book depth (Binance WS `<symbol>@depth`)
- CVD spot vs futures (đã có trong bản gốc DRV MON — có thể port lại vào `ui-table.js`
  làm cột riêng nếu cần)
- Composite squeeze-score / signal badges (logic gốc trong bản DRV MON cũ, ~800 dòng — có
  thể tách thành `js/signals.js` riêng nếu bạn muốn giữ lại toàn bộ hệ thống chấm điểm)
- Lưu watchlist / cột đã ẩn vào `localStorage` (lưu ý: không dùng được trong artifact
  preview của Claude.ai, nhưng chạy bình thường khi host thật)
