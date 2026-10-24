# Kiểm thử giải 100 đội trên hệ thống thật

Ngày chạy: 23/10/2026. Website production: https://oan-tu-ti-ai-arena.vercel.app/competition.

## Kịch bản

- Một đội đại diện người dùng trong bản demo, gắn với tài khoản BTC demo; 99 đội TEST với 99 tài khoản độc lập. Người dùng đã chọn tài khoản riêng sau khi giải khóa; các kết quả dưới đây chưa phải thành tích của tài khoản riêng đó.
- 99 bot gồm 11 nhóm chiến thuật, mỗi nhóm 9 biến thể tham số: Sprinter, Guardian, Tactician, Raider, Sentinel, Flanker, Explorer, Hunter, Runner, Counter, Balanced. Không phải 99 thuật toán được viết độc lập.
- Tất cả tài khoản bot đăng ký, đổi mã đội và nộp Python qua HTTP API của website. Không chèn bài hợp lệ hoặc kết quả trực tiếp vào database.
- 32 bảng, mỗi bảng 3–4 đội, lấy đội đầu bảng vào vòng 32 đội. Vòng bảng có 216 ván; loại trực tiếp thêm ít nhất 62 ván, chưa kể cặp phụ.
- Luật gốc 9×9: 200 lượt/ván, 2 giây/nước, 8 giây khởi động, 128 MiB linear memory, giới hạn fuel của sandbox, hai ván đổi bên; điểm cặp 3/1/0. Loại trực tiếp hòa thì thêm một cặp đổi bên, vẫn hòa thì dùng seed theo luật đã công bố.
- Seed người dùng và seed chia bảng được bốc ngẫu nhiên trước khi khóa. Sau khóa không sửa source, seed hoặc kết quả.

## Các lần thử được giữ nguyên

1. **Vanguard ban đầu:** [giải đầu](https://oan-tu-ti-ai-arena.vercel.app/competition#09c55524-f262-4974-85aa-6db8a780e833). Đủ 100 bot hợp lệ, 300 ván. Đội người dùng đứng 2/4 bảng 32, 3 điểm, dừng vòng bảng. Một ván bị xử thua `bot_error` cho Counter 08; không có retry hạ tầng.
2. **Vanguard cải tiến:** [giải thứ hai](https://oan-tu-ti-ai-arena.vercel.app/competition#4bec36e1-b766-451d-bec7-134905164832). Đủ 100 bot hợp lệ, 312 ván. Người dùng đứng 2/3 bảng 26, 3 điểm, dừng vòng bảng. Raider 01 vô địch. Vanguard cải tiến thắng 5/6 ván chuẩn với Sprinter/Guardian/Tactician, nhưng thành tích chuẩn đó không bảo đảm thắng quần thể đối thủ này.
3. **Champion:** [giải kiểm chứng](https://oan-tu-ti-ai-arena.vercel.app/competition#f43f9687-d034-46e8-ae5d-1dbf0cb13db0). Dùng chính chiến thuật Raider 01 do bộ sinh bot tạo ra, đã vô địch lần hai. Giữ cùng 99 source đối thủ và bốc thăm mới; không ghi đè hai lần thử trước. Đủ 100 bot hợp lệ, hoàn tất 304 ván và đã công bố. Champion đứng đầu bảng 29 (4 đội), thắng cả 3 cặp, 9 điểm, vào chung kết và đạt **hạng 2**. Có 2 ván `bot_error`, được xử theo luật; không có retry hạ tầng. Đây là kết quả trên bộ đối thủ thử nghiệm, không bảo đảm thành tích ở giải khác.

Đối chiếu lần cuối: 100 bài dự thi, 304 replay hợp lệ, 404 lần ghi kết quả job duy nhất (100 kiểm tra bài + 304 ván), không ghi kết quả job trùng. Không có job hạ tầng thất bại ở thời điểm hoàn tất.

## Kiểm tra dữ liệu

`scripts/verify-tournament-export.mjs` đối chiếu SHA-256 của source đã khóa, seed từng cặp, phiên bản luật/runtime và phát lại toàn bộ replay bằng engine tin cậy. Audit mỗi job chỉ được có một lần ghi kết quả. Script không sửa điểm hay kết quả.

Ví dụ kiểm tra bản export đã tải về:

```powershell
node scripts/verify-tournament-export.mjs tournament-export.json
```

## Bot và công cụ tái lập

- `public/bots/vanguard.py`: bot tìm kiếm chiến thuật, có phòng thủ ô đích và giới hạn bề rộng/độ sâu.
- `public/bots/champion.py`: chiến thuật vô địch lần hai, dùng làm bot người dùng ở lần kiểm chứng cuối.
- `scripts/century-bots.mjs` và `scripts/bot-opponent-template.py`: tái tạo đúng 99 source đối thủ.
- `scripts/century-tournament.mjs`: chuẩn bị đội, nộp bài, kiểm tra đủ 100 bot hợp lệ, khóa giải, theo dõi, công bố và xuất kết quả. Trạng thái tiếp tục chạy và thông tin tài khoản được lưu riêng trong `.secrets/`; không commit hay chia sẻ thư mục đó.
- `tests/century-bots.test.mjs`: kiểm tra 99 source duy nhất, tái lập được, 11 nhóm × 9 biến thể và kích thước hợp lệ.
- `tests/vanguard-wasi.test.mjs`: kiểm tra trong sandbox Wasmtime thật, hai phía, nước thắng ngay và sáu ván chuẩn.

Các script vận hành này dùng website của dự án và cần quyền BTC đã cấu hình riêng. Không chạy bài thử mới trên một giải đang có sinh viên thật. File trạng thái mới tạo giải mới; khi giải đã khóa, `prepare` từ chối thay đổi nó.

## Kết luận có thể rút ra

Đây là kiểm thử chức năng của giải 100 đội bằng worker Docker thật: nhận bài, xác thực đội, sandbox, chia bảng, hàng đợi, vòng loại trực tiếp, công bố và xuất kết quả. Nó **không phải kiểm thử 100 hoặc 4.000 người thao tác đồng thời**, không đo p95 của website và không phải kiểm định an toàn độc lập.

Theo thể thức chia bảng rồi loại trực tiếp, các đội bị loại cùng vòng có thể đồng hạng. Báo cáo không tự tạo thứ tự tuyệt đối 1–100 nếu luật giải không quy định. Giao diện hiện chỉ liệt kê 50 ván gần nhất; bản export giữ đầy đủ các ván để kiểm tra.
