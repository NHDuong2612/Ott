# Dashboard ban tổ chức

Mở `/competition`, đăng nhập tài khoản BTC, chọn **Ban tổ chức → Tổng quan điều hành** và chọn giải. **Cấu hình & danh sách** chứa biểu mẫu cấu hình, nhập đội và cấp mã tham gia.

## Chức năng

- Tiến độ đội đăng ký, kích hoạt, nộp bài, bài mới nhất và đội đủ điều kiện trước hạn.
- Hai hàng đợi kiểm tra bài và chấm ván; job chờ, chạy, hoàn tất, thất bại và lease hết hạn.
- Tín hiệu worker trong 90 giây, phiên bản runtime, số job đang giữ của giải đang xem. Worker là tài nguyên dùng chung, không phải số máy dành riêng cho giải.
- Số job hoàn tất trong 15 phút, thời gian xử lý lần chạy cuối và ước tính hàng đợi hiện tại. Không ước tính khi mẫu ít, worker mất tín hiệu, giải tạm dừng hoặc có job lỗi/hết lease. Không bao gồm các vòng chưa tạo lịch.
- Kiểm tra trước khi khóa: giai đoạn, hạn nộp, cấu hình, mọi phiên bản còn chờ, số đội đủ điều kiện; cảnh báo đội bị loại khỏi lịch và worker chưa sẵn sàng. Máy chủ vẫn kiểm tra lại tại thời điểm khóa.
- Phân biệt lỗi hạ tầng có thể thử lại với bài không hợp lệ và ván xử thua do bot lỗi. Có replay và nhật ký 20 thao tác gần nhất.
- Mở nhận bài, tạm dừng/tiếp tục, rà soát rồi khóa bài, công bố kết quả và xuất dữ liệu theo quyền/giai đoạn hiện có.

Thể thức hiện tại vẫn là **chia bảng → loại trực tiếp**. Vòng sơ loại đấu bot chuẩn BTC, tự chọn top N và tự lấy toàn bộ repository GitHub không thuộc thay đổi này.

## Dữ liệu và triển khai

`GET /api/competition?dashboard=1&event=<id>` chỉ dành cho BTC. API tổng hợp bằng SQL, không tính lại bảng xếp hạng, không tải mã nguồn, replay hay snapshot toàn bộ giải. Danh sách sự cố giới hạn 25 mỗi loại, worker 20. Giao diện tự cập nhật mỗi 15 giây khi tab trình duyệt đang hiển thị; giải đã công bố dùng nút cập nhật thủ công.

`deploy/competition-schema.sql` bổ sung `jobs.started_at`, `jobs.finished_at`, `games.reason` và các chỉ mục bằng migration cộng thêm. **Áp dụng schema trước khi đưa phiên bản web/worker mới vào phục vụ**. Luồng triển khai hiện có chạy schema này. SQLite tự nâng schema khi mở cơ sở dữ liệu. Các job lịch sử không có thời gian chạy vẫn để trống; không dùng ngày tạo để giả lập tốc độ chấm.

## Kiểm tra

- `npm run test:operations`: quyền, số liệu bài nộp, hạn nộp, điều kiện khóa, phạm vi giải, worker, tốc độ/ước tính, nhóm lỗi và timestamp không đổi khi gửi kết quả trùng.
- `npm run test:competition`: luồng giải đấu và khả năng mở lại dữ liệu.
- `npm run test:competition:api`: kiểm tra quyền API, kể cả header giả mạo BTC.
- `node tests/competition-postgres.test.mjs`: kiểm thử PostgreSQL trong schema tạm, có xác nhận kiểu số liệu dashboard. Chỉ chạy khi đã cấu hình môi trường PostgreSQL kiểm thử phù hợp.

Các kiểm thử này xác minh chức năng, chưa thay thế kiểm thử tải HTTP với 4.000 tài khoản trên cấu hình triển khai thực tế.

### Xác minh tại máy phát triển (24/10/2026)

Đã chạy đạt kiểm thử operations, competition và Vercel API; kiểm tra TypeScript và ESLint cho các tệp giao diện mới/sửa. Bản dựng Next.js production đã thành công. Kiểm tra trình duyệt qua gateway với cơ sở dữ liệu SQLite riêng: đăng nhập BTC, chọn giải, số liệu tổng hợp, chặn khóa khi có bài chờ, tạm dừng/tiếp tục có nhật ký, xem bài lỗi và biểu mẫu cấu hình. Đã kiểm tra bố cục ở 1280 px và 390 px; màn hình nhỏ không tràn ngang, không ghi nhận lỗi console.

Chưa chạy kiểm thử tích hợp PostgreSQL do phiên này không có cơ sở dữ liệu kiểm thử được cấu hình. Chưa áp dụng migration lên cơ sở dữ liệu đang phục vụ và chưa triển khai website.
