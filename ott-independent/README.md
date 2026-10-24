# Ott độc lập — Dashboard ban tổ chức

Bản website Ott riêng, giữ các chức năng hiện có và bổ sung dashboard BTC trong `/competition`. Tài khoản, bài nộp, hàng đợi, kết quả và bộ chấm được thiết lập riêng cho bản mới.

Đọc [hướng dẫn triển khai và cấp quyền BTC](docs/INDEPENDENT_OTT.md). Không dùng project Vercel, database hoặc khóa bộ chấm của website cũ.

## Chạy trên máy

Cần Node 22.16–24 và Docker Desktop.

```powershell
npm ci
npm run local:init
docker compose -f compose.local.yaml up -d --build --wait
```

Mở **http://localhost:3001/competition**. Docker dùng tên project và volume riêng để chạy song song với bản cũ.

## Đưa lên Internet

Tạo project Vercel mới và Neon database mới, trống. Cấu hình và các bước cấp quyền BTC nằm trong [hướng dẫn bản độc lập](docs/INDEPENDENT_OTT.md). Build sẽ từ chối database cũ hoặc database của bản cài đặt khác.

Bản đầy đủ đã triển khai tại **https://ott-independent.vercel.app**. Mở **https://ott-independent.vercel.app/competition** để vào giải đấu. Link `ott-dashboard-btc-review` trước đây chỉ dùng giới thiệu dashboard; dữ liệu và tài khoản trên website mới được tạo riêng.

## Kiểm tra

```powershell
npm run test:independent
npm run test:operations
npm run test:competition
npm run test:competition:api
```

Các kiểm tra trên, bản dựng Next.js, luồng giải đấu trên PostgreSQL mới và đăng ký/đăng nhập trên URL triển khai đã chạy thành công ngày 25/10/2026. Tài khoản `24020104@vnu.edu.vn` đã được cấp quyền BTC. Chưa chạy bộ chấm Docker hoặc kiểm thử tải thực tế của 4.000 tài khoản.

[Tính năng dashboard và cách sử dụng](docs/DASHBOARD_BTC.md). Các tài liệu kế thừa có thể còn địa chỉ/cấu hình của bản gốc; ưu tiên hướng dẫn bản độc lập ở trên.
