# Đánh giá backend network-programming cho 4.000 tài khoản

Ngày kiểm tra: 24/10/2026 (Asia/Bangkok). Phạm vi người dùng xác nhận: 4.000 tài khoản, chỉ một phần online. Không sửa mã nguồn và không gây tải lên production.

## Kết luận

Chưa đủ điều kiện xác nhận backend đáp ứng toàn bộ nhu cầu vận hành cho 4.000 sinh viên. Mã nguồn đã có cơ sở phù hợp cho quản lý tài khoản và vòng loại đông người; điểm chặn thực tế là worker chấm bot đang offline, cộng với thiếu số đo tải và tốc độ xử lý hàng đợi.

## Bằng chứng trực tiếp từ production

GET https://ottv2-game-2hxh.onrender.com/api/health trả về:

```json
{"status":"ok","game":"OTTv2","activeRooms":0,"botPlatform":"worker_offline","botStorage":"ready","botRunner":"offline","timestamp":"2026-10-23T18:44:16.199Z"}
```

Thời điểm phản hồi tương ứng 01:44:16 ngày 24/10/2026, giờ Việt Nam. Đây là tín hiệu sẵn sàng tại một thời điểm, không phải phép đo khả năng chịu tải. Chưa xác minh gói tài nguyên thực tế trong dashboard.

## Những phần đã có trong mã nguồn

- PostgreSQL có khóa, chỉ mục và dữ liệu tài khoản/bot/phiên bản/trận đấu/replay.
- Vòng loại đấu với 1–8 bot chuẩn, đổi bên, thay cho vòng tròn toàn bộ sinh viên. Giải vòng tròn giới hạn 64 người.
- Mỗi tài khoản chỉ có một bài vòng loại đang chờ, tối đa 5 bài/24 giờ; upload tối đa 3 phiên bản đang chờ, 20 phiên bản/24 giờ, 100 phiên bản đang lưu.
- Khóa giao dịch theo tài khoản giúp kiểm tra quota và tạo công việc nhất quán khi có yêu cầu đồng thời.
- Hàng đợi lưu trong DB; nhận job dùng FOR UPDATE SKIP LOCKED, lease, retry và kiểm tra attempt khi ghi kết quả.
- Có thể tách worker kiểm tra mã và worker chạy trận. Mỗi worker hiện xử lý tuần tự.
- Bảng xếp hạng và một số danh sách đã phân trang; điểm vòng loại được tổng kết trước khi đọc BXH.
- Có heartbeat, thống kê worker và trang giám sát quản trị.

Nguồn chính: docs/qualification.md, server/bots/qualifierRoutes.js, server/bots/qualification.js, server/bots/worker.js, server/migrations/005_qualifiers.sql trong project network-programming.

## Điểm còn thiếu hoặc cần xác minh

1. **Worker production offline — chặn luồng chấm bài.** Database hoạt động không đồng nghĩa nền tảng có thể kiểm tra mã và chạy trận. Cần triển khai worker với sandbox hoạt động, rồi kiểm chứng upload → validation → trận đấu → replay → điểm.
2. **Chưa có kiểm thử tải đại diện cho 4.000 tài khoản.** Test 5.000 bản ghi dùng PGlite để kiểm tra truy vấn và phân trang; không chứng minh nhiều người đăng nhập/nộp bài/xem replay cùng lúc, nhiều worker cùng chạy hoặc năng lực sandbox thật. Xem tests/bot-qualifiers.integration.test.js:249.
3. **Chưa định lượng tốc độ chấm và thời gian chờ.** server/bots/worker.js:237 xử lý từng job nối tiếp. Với 4.000 bài × 2 bot chuẩn × 2 bên × 1 vòng = 16.000 trận. Nếu giả định mỗi trận 30 giây, một worker cần khoảng 133 giờ, 10 worker cần khoảng 13,3 giờ trong điều kiện lý tưởng; chưa tính validation, retry, giới hạn sandbox và tranh chấp DB. Đây là minh họa, không phải benchmark.
4. **Cấu hình lưu trong repo dùng web và PostgreSQL free.** render.yaml:7 và :26. Theo https://render.com/docs/free, PostgreSQL free có 1 GB, hết hạn sau 30 ngày và không có backup được quản lý. Chưa xác minh gói hiện tại trên dashboard; nếu vẫn dùng cấu hình này thì cần phương án dữ liệu bền vững trước vận hành chính thức. Với 16.000 trận, tối đa 300 nước/trận, có thể phát sinh tới 4,8 triệu dòng replay cho một lượt nộp.
5. **Một số đường đọc dễ tăng tải.** /practice/bots trả toàn bộ phiên bản READY, chưa phân trang (platformRouter.js:170). Replay tải lại mỗi 1,5 giây (js/replayPage.js:106); mỗi lần backend đọc toàn bộ nước của trận và dựng lại trạng thái (platformRouter.js:570). Với 300 người xem liên tục, riêng replay tạo khoảng 200 yêu cầu/giây, nếu mỗi người mở một trang và các yêu cầu hoàn tất đúng nhịp. Cần đo và cân nhắc cache, dữ liệu gia tăng hoặc giảm polling.
6. **Giới hạn yêu cầu chưa đầy đủ.** Limiter đăng nhập/đăng ký dùng email và Map trong RAM (platformRouter.js:22), không có giới hạn chung theo IP trong mã đã kiểm tra. Chưa có cơ chế từ chối theo độ đầy hàng đợi toàn hệ thống. Quota theo tài khoản không tự giới hạn tổng tải từ hàng nghìn tài khoản. Tạo bot cũng chưa có quota số bot.
7. **Pool DB cần tính theo toàn hệ thống.** Web tối đa 8 kết nối (server.js:69); mỗi worker tối đa 3 (worker.js:21). Một web và 10 worker có ngân sách pool tối đa 38 kết nối, chưa tính công cụ khác. Các con số này không phải giới hạn số tài khoản và cũng không tự chứng minh đủ tải; cần so với tài nguyên DB và độ trễ truy vấn.
8. **Chơi người–người chưa sẵn sàng mở rộng bằng cách nhân bản server đơn thuần.** Phòng ở RAM (server/room.js:12); server gửi toàn bộ danh sách phòng đến tất cả WebSocket khi có thay đổi (server/server.js:146). Nếu có nhiều người chơi đồng thời, cần đo tải, xử lý client chậm và có phương án định tuyến/lưu trạng thái phòng khi tăng số server hoặc restart.
9. **Chưa liên kết tài khoản với danh sách sinh viên.** docs/qualification.md:13 xác nhận điều này. Đây là yêu cầu quản lý thi nếu cần mỗi sinh viên một tài khoản, không phải giới hạn dung lượng lưu 4.000 tài khoản.

## Kiểm chứng nên hoàn thành trước khi mở chính thức

- Xác nhận số người online cao điểm và thời hạn mong muốn chấm hết một đợt.
- Bật worker và hoàn thành một luồng bot thật trên sandbox; kiểm tra retry và phục hồi khi worker bị dừng.
- Dùng môi trường thử tương đương production với 4.000 tài khoản, nhiều phiên bản bot và dữ liệu replay đại diện.
- Thử các mức 100, 300, 500 người hoạt động đồng thời như các kịch bản ban đầu; đây là đề xuất, không phải số người online đã được chốt.
- Trộn đăng nhập, xem BXH, upload, nộp vòng loại và xem replay; có đợt tăng tải gần hạn nộp.
- Đo p95/p99, tỷ lệ lỗi, CPU/RAM, pool DB đang chờ, số job hoàn tất/phút, tuổi job lâu nhất và thời gian tiêu hết hàng đợi.
- Chạy nhiều worker trên PostgreSQL thật; kiểm chứng không ghi kết quả trùng và không mất job khi restart/mất kết nối.
- Kiểm tra dung lượng và khả năng phục hồi từ bản sao lưu. Chọn cấu hình tài nguyên dựa trên kết quả đo.

## Kiểm thử trong lần đánh giá này

- Kiểm thử vòng loại độc lập đã PASS: truy vấn PostgreSQL nhúng, quota, chấm điểm, phân trang BXH 5.000 bản ghi.
- Bộ kiểm thử tổng thể chưa đạt trong lần đánh giá này: dừng ở tests/server.integration.test.js:66 với `server should start`, kể cả khi chạy lại ngoài sandbox. Một phép chẩn đoán tạo tiến trình trong sandbox báo EPERM. Chạy server riêng ngoài sandbox, bỏ cấu hình database, đã in thông báo khởi động thành công. Vì vậy chưa đủ bằng chứng quy lỗi này cho logic backend; cần làm rõ môi trường/thời gian chờ và chạy lại bộ test. Các test phía sau điểm dừng chưa được xác minh bởi lần chạy tổng thể này.
- Log bộ kiểm thử: D:/VNU/year3/Ott/network-programming-audit-tests.log.
- Không có phép thử tải production hoặc benchmark sandbox thật trong lần đánh giá này.
