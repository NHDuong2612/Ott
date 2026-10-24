# Nộp đồng thời và tài khoản VNU

## Tài khoản

Sinh viên đăng ký với đúng tên miền `@vnu.edu.vn` và mật khẩu riêng của website. Server chuẩn hóa chữ thường, kiểm tra lại tên miền ở tầng lưu tài khoản; không chỉ kiểm tra trên form. Không chấp nhận `@uet.vnu.edu.vn`, tên miền gần giống hoặc `@vnu.edu.vn.attacker.com`.

Theo yêu cầu BTC, không gửi OTP và không tích hợp SSO. Vì vậy **email này chưa được xác minh**; người khác vẫn có thể đăng ký trước bằng địa chỉ của sinh viên. Mã mời đội dùng một lần, gắn email/mã sinh viên và do BTC phát riêng vẫn bắt buộc. Không dùng danh sách email tự khai làm bằng chứng danh tính. Khi phát hiện chiếm tên, BTC cần đối chiếu sinh viên ngoài hệ thống trước khi xử lý tài khoản; không tự chuyển đội dựa trên email tự khai.

Admin hiện có được phép đăng nhập bằng địa chỉ cũ. Tài khoản thường ngoài VNU không đăng nhập được và phiên cũ cũng không được dùng tiếp; dữ liệu lịch sử không bị xóa. Không có tài khoản admin công khai mới hoặc cơ chế tự cấp quyền admin.

## Nộp bài đồng thời

Trước đây mọi thao tác ghi PostgreSQL đều lấy một khóa độc quyền chung. Nay đường nhận bài tải lên và lấy từ Git dùng khóa chung ở chế độ chia sẻ, rồi khóa hàng **đội lấy từ membership của tài khoản**. Các đội khác nhau ghi đồng thời; hai thành viên của cùng đội vẫn tuần tự để bảo toàn hạn mức. Khóa được PostgreSQL quản lý giữa các Vercel instance, không dùng biến trong RAM.

Thao tác quản lý, khóa giải và cập nhật kết quả vẫn lấy khóa độc quyền chung. Chúng chờ các bài đang ghi commit/rollback trước khi thay đổi trạng thái. Cách này tương thích cả lúc triển khai cuốn chiếu với adapter cũ. Đây vẫn là giới hạn có chủ ý: control/worker chưa chạy ghi song song toàn bộ. Nếu đo được nghẽn ở đó, bước tiếp theo là khóa theo giải/job và hàng đợi dùng `SKIP LOCKED`.

Mỗi bài được lưu cùng job kiểm tra và audit trong một transaction. Gửi lại source giống nhau trả về cùng submission, không tạo job mới. Giữ giới hạn 64 KiB, một phiên bản mới mỗi 5 giây/đội, tối đa 2 bài pending và 200 phiên bản/đội. Gom kiểm tra các hạn mức vào một truy vấn thống kê để giảm lượt đi database. Mạng mất sau khi commit có thể gửi lại cùng source an toàn.

Khi quá tải hoặc hết thời gian chờ khóa, API trả lỗi có `Retry-After`; BTC/sinh viên không nên gửi lại liên tục. Nhận bài thành công chỉ có nghĩa **đã lưu và xếp hàng**, chưa có nghĩa bot đã hợp lệ hoặc thi đấu xong.

## Kiểm thử có thể chạy lại

```powershell
npm run test:accounts
node --env-file=.env.vercel.local tests/competition-postgres.test.mjs
$env:SUBMISSION_TEST_TOTAL='4000'
$env:SUBMISSION_TEST_CONCURRENCY='64'
node --env-file=.env.vercel.local tests/submission-concurrency.test.mjs
```

Phép thử tải tạo roster giả trong schema `test_submit_<random>` riêng, gọi đúng hàm nhận bài và chế độ khóa dùng bởi API, đếm đủ source/job/audit rồi xóa schema. Không tạo tài khoản sinh viên hoặc hàng nghìn trận trên giải thật. Kết quả đo được lưu trong `output/submission-load.json`.

Nó kiểm tra độc lập các đội có thể ghi chồng thời gian; gửi trùng chỉ commit một lần; burst cùng đội bị giới hạn; bài sau hạn bị từ chối. **4.000 bài tổng với 64 yêu cầu DB đồng thời không phải 4.000 người đồng thời qua HTTP**, không bao gồm chi phí đăng nhập, băng thông trình duyệt, polling bảng điểm hay tốc độ chạy Python. Cần bài test HTTP riêng và kiểm tra quota trước ngày thi.

Kết quả ngày 23/10/2026, chạy từ máy phát tải tới Neon đang dùng cho dự án, trong schema riêng:

| Phép đo | Kết quả |
|---|---:|
| Tổng bài / số yêu cầu đồng thời tối đa | 4.000 / 64 |
| Thành công / lỗi | 4.000 / 0 |
| Thời gian toàn đợt nhận bài | 50,712 giây |
| Tốc độ trung bình | 78,88 bài/giây |
| p50 / p95 / lớn nhất | 796 / 871 / 1.244 ms |

Các con số đo **nhận bài và xếp hàng**, không phải chấm xong 4.000 bot. Phép thử hồi quy PostgreSQL về lease đồng thời, commit kết quả trùng, freeze, knockout và rollback cũng đã qua; 128 fixture hợp lệ tạo 3.968 ván trong 4,355 giây (chỉ lập lịch, không chạy các ván).

`tests/vnu-cloud-smoke.test.mjs` là kiểm tra HTTP riêng, cần bật rõ `ARENA_ALLOW_CLOUD_SMOKE=1` và `ARENA_CLOUD_TEST_ORIGIN` đúng địa chỉ dự án. Nó tạo giải QA 2 đội qua API, gửi 16 POST trùng đồng thời, kiểm tra còn đúng 2 bài, rồi chạy đủ 4 ván bằng worker Docker và kiểm tra replay. Các tài khoản `arena-qa-<random>@vnu.edu.vn` trong phép thử là fixture, không gửi thư và không được coi là email đã xác minh.

Đã chạy thành công phép thử HTTP trên production ngày 23/10/2026: [giải QA VNU và nộp đồng thời](https://oan-tu-ti-ai-arena.vercel.app/competition#3d71a4cc-a1f8-49d8-a5d0-fe440f647c54), 16 POST đồng thời thành 2 bài, 2 validation và 4 ván hoàn tất, replay khớp, không retry hạ tầng. Đăng nhập admin cũ, đăng ký VNU, đăng nhập với email viết hoa, từ chối tên miền ngoài VNU/giả/subdomain, sai mật khẩu, giả trường đội và nộp sau hạn đều đã kiểm tra. Worker ban đầu đang dừng; sau khi bật lại, các bài đã nhận trong hàng đợi được chấm tiếp mà không nộp lại.

Không cần thêm dịch vụ hay biến môi trường email. Deploy source mới trên Vercel; worker Docker hiện có tương thích và không cần thay image vì engine/runtime không đổi. Nếu chạy toàn bộ bằng Docker, build lại app để cập nhật chính sách tài khoản. SQLite vẫn có một writer; thay đổi concurrency này dành cho PostgreSQL/Vercel.
