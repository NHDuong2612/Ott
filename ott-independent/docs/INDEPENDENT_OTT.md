# Ott độc lập có dashboard ban tổ chức

Mã nguồn tại `D:\VNU\year3\Ott\ott-independent`. Bản này giữ website Ott đầy đủ: luyện tập, thư viện bot, tài khoản, phòng chơi, giải đấu, bài nộp và replay; có thêm dashboard BTC trong `/competition`.

## Trạng thái triển khai ngày 25/10/2026

- Project mới: [ott-independent trên Vercel](https://vercel.com/nhduong2612/ott-independent), thuộc tài khoản `nhduong2612`.
- Website đầy đủ đã triển khai: **https://ott-independent.vercel.app**, trang giải đấu **https://ott-independent.vercel.app/competition**.
- Thư mục này đã liên kết đúng project mới. Khóa bộ chấm mới được lưu dưới dạng Secret cho Production.
- Database **Neon Free**, tên `ott-independent-db`, vùng Singapore, đã tạo mới và chỉ kết nối môi trường Production của project mới. Migration đã chạy thành công và xác nhận mã cài đặt riêng.
- Tài khoản **24020104@vnu.edu.vn** đã tự đăng ký và được cấp quyền BTC trên database mới. Tải lại `/competition` hoặc đăng nhập lại để nhận giao diện BTC.

Link demo tĩnh đã chia sẻ trước đây chỉ dùng để xem giao diện, không phải địa chỉ của website đầy đủ này. Website cũ không được dùng để triển khai bản mới.

## Tách biệt với web cũ

- Tạo **project Vercel mới** tên `ott-independent`. Không link thư mục này vào project cũ.
- Tạo **database Neon mới và trống**. Không dùng DATABASE_URL của website cũ, kể cả cho Preview.
- Tài khoản, đội, bài nộp, hàng đợi và kết quả của bản mới được tạo riêng.
- Khóa bộ chấm được sinh mới trong thư mục này. Không dùng khóa hoặc cấu hình của bộ chấm cũ.
- Docker dùng tên project/image riêng; địa chỉ mặc định trên máy là `http://localhost:3001`.
- Chưa sao chép tài khoản hoặc dữ liệu giải thật từ website cũ.

Trước khi tạo bảng, bản mới kiểm tra database trống hoặc có đúng mã cài đặt `ott-independent-20261024-6c0827ab`. Nó từ chối database đã có bảng nhưng chưa được gắn mã của bản này, hoặc có mã của bản khác. API cũng kiểm tra mã này trước khi đọc/ghi PostgreSQL.

## Triển khai website mới

1. Đăng nhập Vercel và tạo project mới từ đúng thư mục mã nguồn này. Dùng `vercel.json` hiện có, Next.js và `npm run build:vercel`.
2. Tạo Neon database mới, kết nối riêng vào project mới, đặt biến server `DATABASE_URL`. Giữ `DATABASE_URL` ngoài Git và ngoài biến `NEXT_PUBLIC_*`.
3. Deploy project mới. Build tự khởi tạo các bảng trong một giao dịch và dừng nếu nhận nhầm database cũ.
4. Lấy địa chỉ mới do Vercel cấp. Không gắn tên miền hoặc alias của website cũ vào project mới.
5. Khởi tạo bộ chấm với đúng địa chỉ mới:

```powershell
npm run judge:cloud:init -- https://DIA-CHI-MOI.vercel.app
```

6. Đặt nội dung `.secrets/vercel-judge-token` thành biến server `JUDGE_TOKEN` của project mới, rồi deploy lại. Không gửi khóa vào nhóm hoặc chụp ảnh khóa.
7. Trên máy BTC có Docker Desktop, chạy bộ chấm riêng:

```powershell
docker compose -f compose.judge.yaml --env-file .env.judge.local up -d --build
```

Nếu chưa bật bộ chấm, website nhận bài vào hàng đợi; dashboard sẽ hiển thị chưa có máy chấm hoạt động.

## Mở dashboard BTC

1. Đăng ký tài khoản trên **website mới** bằng email `@vnu.edu.vn`.
2. Chủ hệ thống cấp quyền cho đúng email trong database mới:

```powershell
node --env-file=.env.vercel.local scripts/vercel-admin.mjs 24020104@vnu.edu.vn
```

3. Đăng nhập lại, vào `/competition` → **Ban tổ chức** → **Tổng quan điều hành**. Dashboard có tiến độ bài nộp, hàng đợi, máy chấm, lỗi hạ tầng, nhật ký và kiểm tra trước khi khóa giải. Mục **Cấu hình & danh sách** quản lý giải và đội.

## Chạy riêng trên máy

Cần Node 22.16–24 và Docker Desktop để chạy toàn bộ, gồm PostgreSQL và bộ chấm.

```powershell
npm ci
npm run local:init
docker compose -f compose.local.yaml up -d --build --wait
```

Mở `http://localhost:3001/competition`. Cấp quyền BTC cho tài khoản đã đăng ký bằng:

```powershell
docker compose -f compose.local.yaml exec app node scripts/local-admin.mjs EMAIL-DA-DANG-KY@vnu.edu.vn
```

Không dùng hướng dẫn nhập dữ liệu cloud cũ cho bản mới này. Nếu chỉ chạy Next.js khi phát triển, đặt DATABASE_URL của database mới trong `.env.vercel.local`, chạy migration rồi `npm run dev`.

## Kiểm tra

```powershell
npm run test:independent
npm run test:operations
npm run test:competition
npm run test:competition:api
```

Đã kiểm tra PostgreSQL thực trên database mới bằng schema thử riêng, rồi dọn schema thử: quyền người dùng, cấp việc đồng thời không trùng, gửi kết quả lặp, dashboard, chia bảng, loại trực tiếp, công bố và rollback. Thử tạo lịch cho 128 đội giả lập sinh 3.968 ván trong khoảng 6,4 giây; đây là kiểm tra lập lịch, không phải đo tải 4.000 tài khoản.

Trên URL đã deploy, đã kiểm tra trang chính, giải đấu, health, đăng ký, đăng nhập lại từ phiên mới và chặn người thường xem dashboard BTC. Tài khoản QA đã được xóa sau kiểm tra. Chưa chạy bộ chấm Docker, luồng chấm Python đầy đủ hoặc kiểm thử tải thực tế. Khi chưa có worker, bài nộp vẫn chờ trong hàng đợi.
