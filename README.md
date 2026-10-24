# Ott

Repo lưu mã nguồn website Ott mới có dashboard ban tổ chức và bản mã nguồn trước đó.

## Website mới

- [Mở website Ott](https://ott-independent.vercel.app)
- [Mở giải đấu và dashboard BTC](https://ott-independent.vercel.app/competition)
- [Tải tài liệu bàn giao cho nhóm](https://ott-independent.vercel.app/Ott-web-moi-dashboard-BTC.docx)

Mã nguồn của bản đang triển khai nằm trong **[ott-independent](ott-independent)**. Bản này có project Vercel `ott-independent`, database Neon mới và khóa bộ chấm riêng. Website cũ không dùng cấu hình của bản này.

Tài khoản `24020104@vnu.edu.vn` đã được cấp quyền BTC trên website mới. Sau khi đăng nhập, mở **Giải đấu → Ban tổ chức → Tổng quan điều hành**. Người dùng thường không được xem dashboard BTC.

**Bộ chấm Docker chưa chạy.** Bài nộp trên website mới sẽ chờ trong hàng đợi cho đến khi BTC kết nối bộ chấm riêng. Chưa có kết quả kiểm thử tải thực tế để cam kết phục vụ 4.000 tài khoản.

## Các thư mục

| Thư mục | Nội dung |
| --- | --- |
| [ott-independent](ott-independent) | Website mới đang triển khai, dashboard BTC và kiểm tra chống kết nối nhầm database |
| [oan-tu-ti-ai-arena-main](oan-tu-ti-ai-arena-main) | Mã nguồn bản trước được giữ lại để đối chiếu |

Các tệp đánh giá ở thư mục gốc được giữ lại từ bản trước. Tài liệu Word ghi nhận trạng thái tại lúc bàn giao; README này phản ánh việc mã nguồn bản mới đã được đồng bộ vào repo.

## Chạy và triển khai bản mới

Đọc **[hướng dẫn bản độc lập](ott-independent/docs/INDEPENDENT_OTT.md)** và **[hướng dẫn dashboard BTC](ott-independent/docs/DASHBOARD_BTC.md)**.

```powershell
cd ott-independent
npm ci
```

Khi kết nối repo này với project Vercel mới, chọn **Root Directory là `ott-independent`**. Không triển khai từ thư mục gốc repo và không dùng project, database hoặc khóa bộ chấm của website cũ. Việc đưa mã nguồn lên GitHub không tự thay đổi kết nối Git của project Vercel.

Repo không chứa `.env`, khóa bộ chấm, dữ liệu tài khoản hoặc phiên đăng nhập Vercel. Mỗi môi trường cần tự cấu hình các giá trị riêng theo hướng dẫn.

## Kiểm tra mã nguồn

Chạy trong `ott-independent` sau khi cài các thư viện:

```powershell
npm test
npm run test:independent
npm run test:operations
npm run test:competition
npm run test:competition:api
```

Bản triển khai đã build thành công; đã kiểm tra đăng ký, đăng nhập, phân quyền và luồng giải đấu trên PostgreSQL mới. Kiểm thử PostgreSQL dùng schema thử riêng và đã dọn sau khi hoàn tất. Bộ chấm Docker và kiểm thử tải HTTP thực tế vẫn cần được thực hiện trước giải thật.
