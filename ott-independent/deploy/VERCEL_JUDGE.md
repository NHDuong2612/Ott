# UET Arena — Vercel + bộ chấm Docker tại máy BTC

Website: **https://oan-tu-ti-ai-arena.vercel.app/competition**. Không cần mua tên miền.

Sinh viên dùng email đúng `@vnu.edu.vn` và mật khẩu riêng của website. Không gửi mã xác nhận email theo yêu cầu BTC; lọc tên miền không chứng minh chủ hộp thư. Admin hiện có giữ quyền đăng nhập. Xem [chính sách tài khoản và nộp đồng thời](../docs/NOP_DONG_THOI_VNU.md).

## Ai dùng gì?

| Vai trò | Cần dùng/cài |
|---|---|
| Sinh viên | Trình duyệt để đăng ký, nhập mã đội, nộp `bot.py`, xem kết quả/replay. Python và editor để tự phát triển bot là tùy chọn. |
| BTC điều hành | Trình duyệt, tài khoản được cấp quyền BTC, admin panel ở `/competition`. |
| Người kỹ thuật | Một lần cấu hình Vercel + Neon; máy chấm có Docker Desktop (Linux containers). Git và Node 22.16+ dùng cho việc thiết lập mã nguồn/secret. |

## Dữ liệu đi đâu?

```text
Sinh viên / BTC → HTTPS → Vercel (web, đăng nhập, API)
                              ↓
                         Neon PostgreSQL
                    tài khoản / bài nộp / hàng đợi / kết quả
                              ↑
Máy BTC → HTTPS lấy việc → Docker judge → CPython WASI/Wasmtime
          heartbeat và gửi kết quả       (mỗi bot một sandbox)
```

Máy BTC không mở cổng, không cần IP tĩnh, tên miền hay tunnel. Worker chỉ biết địa chỉ Vercel và secret của worker; không có mật khẩu database. Python của sinh viên không được cấp secret, socket hay filesystem của máy BTC. Website không thực thi Python của bài thi trong Vercel Function.

## 1. Thiết lập website — người kỹ thuật làm một lần

1. Kết nối repository với Vercel, dùng `vercel.json` đã có. Giữ deployment production công khai để sinh viên truy cập được.
2. Kết nối Neon; đặt `DATABASE_URL` phía server trong Production. Build chạy `scripts/migrate-vercel.mjs`, tạo schema `arena_competition` riêng và giữ dữ liệu luyện tập/tài khoản hiện có.
3. Tạo cấu hình bộ chấm trên máy BTC:

```powershell
npm run judge:cloud:init
```

Lệnh tạo `.secrets/vercel-judge-token` và `.env.judge.local`; cả hai bị loại khỏi Git và gói upload Vercel. **Không đưa secret vào biến `NEXT_PUBLIC_*`, bài nộp, ảnh chụp hay nhóm sinh viên.**

4. Đặt đúng nội dung file token làm biến server `JUDGE_TOKEN` trong Vercel Production. Với CLI đã đăng nhập, PowerShell có thể dùng:

```powershell
Get-Content .secrets/vercel-judge-token -Raw | npx vercel env add JUDGE_TOKEN production --force --sensitive
npx vercel deploy --prod
```

5. BTC đăng ký tài khoản trên website. Chủ database cấp quyền cho **đúng tài khoản đã xác nhận**:

```powershell
node --env-file=.env.vercel.local scripts/vercel-admin.mjs your@vnu.edu.vn
```

Ở `/competition`, quyền này mở trực tiếp mục **Ban tổ chức**. Không lấy quyền từ tên hiển thị, email tự khai hay header do trình duyệt gửi. Nhiều máy chấm có thể dùng cùng secret; khi thay secret trên Vercel, phải cập nhật tất cả máy được phép rồi redeploy.

## 2. Bật bộ chấm — trên máy BTC

Docker Desktop phải đang chạy. Trong thư mục repository đã cấu hình:

```powershell
docker compose -f compose.judge.yaml --env-file .env.judge.local up -d --build
docker compose -f compose.judge.yaml --env-file .env.judge.local logs --tail 30 judge
```

Container dùng tối đa 2 CPU và 2 GiB RAM. Có một slot kiểm tra bài và một slot chấm trận. Máy nên có RAM 8 GiB trở lên để còn chỗ cho hệ điều hành/Docker; đây là cấu hình khởi đầu, chưa chứng nhận tải 4.000 người.

Không dùng `docker compose up` không có `-f` cho mô hình này: lệnh đó khởi động bản toàn bộ trên máy local, với dữ liệu độc lập.

## 3. Tạo giải và nhận bài

BTC vào `/competition` → **Ban tổ chức → Tạo giải đấu mới**. Chốt luật và giới hạn, nhập đội, cấp mã riêng, mở nhận bài. Sinh viên dùng tài khoản của mình và đổi mã để gắn đúng đội. Nộp file `.py`, hoặc lấy `bot.py` từ commit đầy đủ trong repo công khai đã được BTC gắn cho đội.

Worker tự kiểm tra bài. Mỗi đội tối đa hai bài chờ, 200 phiên bản/giải và một lần nộp mỗi 5 giây. Bài lỗi bị đánh dấu không hợp lệ; khi khóa, hệ thống chọn bài hợp lệ mới nhất trước hạn. Sau hạn, BTC khóa danh sách, hệ thống chia bảng và chạy hai ván đổi bên cho mỗi cặp. Hoàn tất loại trực tiếp → BTC kiểm tra → công bố.

## 4. Mất mạng, tắt máy, tiếp tục

Website vẫn nhận bài khi máy chấm tắt; bài chờ trong PostgreSQL. Máy hoạt động trở lại sẽ tiếp tục nhận việc. Lease dài 90 giây, heartbeat mỗi 20 giây; kết quả từ lease cũ bị từ chối. Gửi lại cùng kết quả không cộng điểm hai lần. Lỗi hạ tầng được thử hữu hạn; BTC xem hàng đợi và thử lại sau khi xử lý nguyên nhân.

Worker rảnh tăng khoảng lấy việc từ khoảng 5 đến 15 giây. Giao diện đang mở tự cập nhật khoảng 15 giây; giải đã công bố ngừng polling tự động. Thời gian có kết quả còn phụ thuộc số bài chờ, CPU và thời gian bot, không cam kết tức thì.

Hết buổi thi, dừng worker để tránh polling giữ database luôn thức và tiêu hao hạn mức miễn phí:

```powershell
docker compose -f compose.judge.yaml --env-file .env.judge.local stop
```

Lần sau bật lại bằng lệnh `up -d` ở trên. Để tăng số máy chấm, chuẩn bị cùng mã nguồn/runtime, địa chỉ Vercel và file secret riêng tư trên máy được BTC quản lý; không chia sẻ `.env.vercel.local` vì file đó có quyền database.

## 5. Kiểm tra trước ngày thi và sao lưu

- Trang công khai tải được, đăng nhập/nộp bài hoạt động; bộ chấm không secret phải nhận HTTP 401.
- BTC thấy worker vừa kết nối. Nộp bot mẫu và bot cố tình sai; xem validation, replay và kết quả.
- Thử tắt/bật worker. Bài còn trong hàng đợi và kết quả hoàn tất không bị chấm/cộng điểm lại.
- Xuất toàn bộ giải từ admin panel để giữ cấu hình, source đã khóa và replay. Backup database dùng chức năng backup/export PostgreSQL của tài khoản Neon; export giải không thay thế backup tài khoản.
- Xem hạn mức Vercel/Neon trước và trong giải. Không giả định gói miễn phí chịu được 4.000 sinh viên đồng thời. Đo tải trước khi mở rộng quy mô.

Các lệnh kiểm thử cho người bảo trì:

```powershell
npm test
npm run test:competition
npm run test:competition:api
node --env-file=.env.vercel.local tests/competition-postgres.test.mjs
```

Bài PostgreSQL tạo schema kiểm thử có tên ngẫu nhiên rồi xóa đúng schema đó; không xóa dữ liệu giải chính thức. `tests/cloud-e2e.test.mjs` chỉ chạy khi chủ động bật cờ riêng, tạo tài khoản và giải DEMO có nhãn trên đúng website này.

## Giới hạn cần hiểu

Đây là cấu hình pilot tiết kiệm: thao tác ghi giải đấu được tuần tự hóa bằng khóa giao dịch PostgreSQL để giữ tính đúng; truy vấn đọc không chờ khóa ghi đó. Nếu đo thấy nghẽn, bước tiếp theo là khóa theo giải và cấp job bằng row lock, cùng cache bảng điểm. Không cần Redis/Kafka ở cấu hình hiện tại.

Tài khoản/bài nộp từng nằm trong volume Docker cũ vẫn ở đó, **không tự động nhập vào website công khai**. Dữ liệu Vercel cũ được giữ. Không có SSO trường, xác minh email tự động hoặc khôi phục mật khẩu; BTC xác nhận danh sách và phát mã riêng. Sandbox hạn chế thiệt hại nhưng vẫn cần cập nhật runtime/OS và chỉ đặt bộ chấm trên máy do BTC quản lý.
