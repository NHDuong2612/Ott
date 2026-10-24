# Đánh giá hệ thống Ott cho 4.000 tài khoản

Ngày: 24/10/2026, Asia/Bangkok. Project được kiểm tra: `D:/VNU/year3/Ott/oan-tu-ti-ai-arena-main`.

## Kết luận

Ott có nền tảng chức năng và bằng chứng nhận bài đáng kể, nhưng chưa đủ bằng chứng để cam kết toàn bộ hệ thống phục vụ ổn định 4.000 tài khoản. Với một phần người dùng online, cần chốt tải cao điểm và số đội trong mỗi giải. Nếu 4.000 tài khoản tương ứng 4.000 đội cùng một giải, mã hiện tại có nút thắt rõ ràng ở bảng điểm, số trận, khóa ghi dùng chung và thao tác quản trị. Đây không phải kết luận rằng database không lưu nổi 4.000 tài khoản.

## Các mô hình triển khai

- Vercel + Neon PostgreSQL cho web/API/dữ liệu, Docker tại máy BTC để chấm chính thức.
- Toàn bộ local: Next.js + PostgreSQL + Docker judge, cấu hình trong compose.local.yaml.
- Docker/SQLite cũ và Sites/D1 luyện tập là các môi trường độc lập. Bằng chứng Neon không tự chứng minh tốc độ SQLite hoặc máy local.
- Luyện tập Python chạy trong trình duyệt; điểm giải chính thức lấy từ worker Wasmtime/CPython WASI. Đây là cách tách tải và ranh giới tin cậy phù hợp.

## Bằng chứng đã đối chiếu

### Kiểm tra trực tiếp trong lần này

- `https://oan-tu-ti-ai-arena.vercel.app/health` trả `ok`; endpoint này chỉ chạy SELECT 1, không kiểm tra worker.
- API công khai `/api/competition` trả runtime `cpython-3.15.0-wasmtime-50.0.1-v1`; thấy các giải 100 đội và QA VNU ở trạng thái `published`.
- Các kiểm thử engine, chơi người, request origin và mẫu sandbox local chạy thành công.
- Không có node_modules và không tìm thấy Docker trong môi trường kiểm tra này; chưa chạy lại đầy đủ bộ test PostgreSQL, bộ chấm Wasmtime hoặc E2E. Không đọc secret, không tạo giải/bài thử trên production.
- Đã đo riêng hàm standings từ mã nguồn bằng dữ liệu giả trong bộ nhớ. Kết quả bên dưới không bao gồm database, HTTP, auth hay chạy Python.

### Bằng chứng có sẵn trong tài liệu bàn giao

- docs/NOP_DONG_THOI_VNU.md ghi nhận 4.000 bài nộp tổng cộng, 64 yêu cầu database đồng thời: 4.000 thành công, 0 lỗi; 50,712 giây, 78,88 bài/giây, p95 871 ms. Phép thử gọi đường nhận bài với membership giả trong schema riêng, không đo HTTP/auth/polling/chấm bot.
- docs/TEST_100_DOI.md ghi nhận giải thật qua API với 100 đội, 100 validation, 304 ván ở lần cuối, 404 lần ghi kết quả job duy nhất, replay được kiểm tra. Việc API công khai còn hiển thị giải published hỗ trợ sự tồn tại của giải; lần đánh giá này không tải lại toàn bộ export để độc lập xác nhận 304 replay.
- Tài liệu còn ghi nhận sandbox độc hại, lease/retry/idempotency, backup/restore và smoke HTTP 16 POST trùng. Đây là bằng chứng bàn giao, không phải tất cả đều được chạy lại lần này.

## Phát hiện ưu tiên

### 1. Tính bảng điểm lặp toàn bộ dữ liệu — ưu tiên cao

`competition/store.mjs:197` đọc toàn bộ entries, series vòng bảng và games đã xong. Đoạn dòng 215 lọc danh sách series một lần cho mỗi đội: O(số đội × số cặp đấu). `readOverview` dòng 406 gọi lại standings trên mỗi request; giao diện `app/competition/page.tsx:47` cập nhật mỗi 15 giây khi tab hiển thị và giải chưa published. Response đặt no-store trong `competition/vercel.mjs:33`.

Phép đo dùng đúng hàm standings được trích từ file, chạy cùng JavaScript context với fixture. Tất cả cặp đã hoàn tất và hòa; mỗi kích thước đo một lần:

| Quy mô | Bảng | Cặp | Ván | Thời gian tính JavaScript |
|---|---:|---:|---:|---:|
| 100 đội | 32 | 108 | 216 | 5 ms |
| 4.000 đội | 128 | 60.512 | 121.024 | 28.126 ms |

Trường hợp lớn có 242.048.000 lượt xét cặp trong vòng lặp xử lý đồng điểm. Thời gian phụ thuộc máy và dữ liệu, không phải p95 production hay cam kết thời gian HTTP. Cấu trúc thuật toán đủ để xác định đây là điểm cần sửa: gom cặp theo đội/bảng, tính điểm khi cập nhật kết quả hoặc cache theo phiên bản giải; phân trang/đọc theo bảng và giảm payload overview.

Kết quả máy đọc được: `D:/VNU/year3/Ott/ott-standings-audit.json`.

### 2. 4.000 đội tạo ít nhất 121.024 ván vòng bảng

`configSchema` chỉ cho tối đa 128 bảng (store.mjs:16), mỗi bảng tối đa 32 đội (dòng 175), vòng tròn hai ván đổi bên (dòng 187 và 158). Với 4.000 đội chia 128 bảng cân bằng: 32 bảng × 32 đội và 96 bảng × 31 đội.

Số ván vòng bảng = 32×32×31 + 96×31×30 = 121.024. Chưa tính loại trực tiếp và cặp phụ.

`judge/worker.mjs:52` có một slot validation và một slot chạy ván cho mỗi replica. Ví dụ giả định 5 giây/ván, phần vòng bảng cần khoảng 168 giờ với một replica, hoặc 16,8 giờ với 10 replica trong điều kiện lý tưởng, chưa tính retry, validation, nghẽn DB hay tranh chấp CPU. Đây là tính toán minh họa, chưa có benchmark bot sinh viên.

Cần chốt số đội/giải và hạn hoàn tất chấm. Nếu cả 4.000 đội thi chung, cân nhắc vòng sơ loại hoặc thể thức ít cặp hơn, hoặc phân giải trước; việc đổi thể thức cần được BTC chốt. Tăng replica trên cùng một máy không tự tăng CPU thực tế.

### 3. Mọi thao tác điều khiển và worker còn chia sẻ khóa độc quyền

`competition/postgres.mjs:31` khóa theo schema: bài nộp có khóa chia sẻ và khóa riêng theo đội; lease/heartbeat/finish/freeze/join/nhập đội dùng khóa độc quyền chung. `competition/vercel.mjs:41` đưa tất cả thao tác worker vào đường này. Vì vậy test nhận bài nhanh không chứng minh nhiều worker cập nhật kết quả nhanh khi có các thao tác khác.

Khóa chung hỗ trợ tính đúng hiện tại, nhưng tạo điểm tuần tự giữa các giải và worker. Một lần freeze lớn còn tạo toàn bộ lịch trong một transaction. Cần đo thời gian giữ/chờ khóa khi vừa nhận bài vừa chạy worker; nếu nghẽn, thiết kế lại khóa theo giải/job và cơ chế claim SKIP LOCKED, giữ các bất biến chống kết quả trùng và freeze.

### 4. Trang giải và công cụ quản trị chưa phù hợp toàn bộ dữ liệu lớn

- Overview trả tất cả đội và bảng điểm; admin nhận toàn bộ membership (store.mjs:397,404).
- Danh sách series bị cắt 500 mục và recent games 50 mục, chưa có phân trang để xem tiếp (dòng 399,401). Giới hạn số dòng không tương đương phân trang.
- Import roster trong app/competition/page.tsx:59 duyệt tuần tự; mỗi đội mới cần một POST tạo đội và một POST cấp mã. 4.000 đội mới tương ứng khoảng 8.000 request, khó phục hồi thao tác dài khi mất mạng/tab đóng.
- Export (store.mjs:413) đọc toàn bộ source/replay/audit vào RAM rồi trả một JSON. Với hàng trăm nghìn ván cần xuất theo luồng hoặc thành file nền, phân trang API và quản lý lưu trữ.

### 5. Nhận bài đã có nền tảng tốt nhưng chưa kiểm chứng toàn bộ tải HTTP

Đã có transaction nguồn/job/audit, chống trùng hash, 64 KiB/bài, 5 giây/phiên bản, tối đa 2 pending và 200 phiên bản/đội, phân quyền dựa trên membership. Đường nộp PostgreSQL cho đội khác nhau ghi đồng thời.

Còn cần kiểm thử HTTP hỗn hợp với tài khoản/phiên đăng nhập thật: đăng nhập, đổi mã, nộp, cập nhật trang giải, replay; đồng thời chạy worker. Chọn ví dụ 100/300/500 người hoạt động để thăm dò, rồi căn theo số online cao điểm thực tế. Các mức này chưa phải năng lực đã được chứng minh.

### 6. Vận hành và danh tính

- Health hiện tại không cho biết judge còn sống, độ dài/tuổi hàng đợi hoặc tốc độ chấm. Worker hiện tại chưa được xác minh trực tiếp trong lần đánh giá này; không kết luận online/offline từ health.
- Máy BTC và kết nối Internet là phần của hệ thống cloud judge. Cần kế hoạch worker dự phòng, backup/restore và cảnh báo job quá lâu. Repo đã có công cụ backup local; chưa xác minh lịch backup đang chạy.
- Compose local giới hạn DB 1 CPU/1 GB RAM, app 2 CPU/2 GB, judge 2 CPU/2 GB. Đây là cấu hình, không phải benchmark đủ cho 4.000 người.
- Theo chính sách đã ghi, email chỉ lọc đúng @vnu.edu.vn, không xác minh hộp thư. Mã mời riêng theo email/MSSV là lớp kiểm soát bổ sung; không tự đổi yêu cầu này thành bắt buộc OTP. BTC vẫn cần quy trình xử lý chiếm địa chỉ và cấp mã.
- Một đội được lưu tối đa 200 source; cần hạn mức dung lượng, lưu trữ replay/audit và chính sách giữ dữ liệu dựa trên quy mô thực tế. Không áp giới hạn gói Render của project khác cho Ott.

## Thứ tự hoàn thiện đề xuất

1. Sửa thuật toán bảng điểm và cache kết quả theo phiên bản giải; giảm payload overview.
2. Chốt số đội mỗi giải/thể thức để hạn chế số ván; đo thời gian bot thật và tính worker theo thời hạn.
3. Kiểm thử HTTP đồng thời với worker; đo p95/p99, lỗi, CPU/RAM, pool DB, thời gian chờ khóa, tuổi job và throughput.
4. Bổ sung import theo lô có thể tiếp tục, phân trang đội/cặp/ván và export nền/streaming.
5. Xác minh readiness judge, cảnh báo, backup/restore và quota hạ tầng trước ngày thi; tối ưu khóa ghi dựa trên đo đạc.

Kết luận sử dụng: đã có bằng chứng tốt cho luồng nhận bài 4.000 lượt và giải thử 100 đội; chưa đủ cơ sở duyệt một giải 4.000 đội hoặc cam kết toàn bộ trải nghiệm của 4.000 tài khoản dưới tải cao điểm.
