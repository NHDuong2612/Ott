# Kiểm chứng bản bàn giao - 23/10/2026

## Đã chạy tại máy phát triển

| Kiểm tra | Kết quả |
|---|---|
| Engine và chơi trực tiếp | Qua `npm test`: nước hợp lệ, luật ăn quân, đích, lượt, replay, giới hạn ván |
| Giải đấu/control store | Qua `npm run test:competition`: mã mời, chống giả đội, hạn nộp, config/snapshot, quota, lease cũ, heartbeat, retry, replay giả, result lặp, chia bảng và loại trực tiếp hữu hạn |
| TypeScript và production build | Qua TypeScript và Docker Next.js 16.4.2 production build |
| Tài khoản/phòng bạn bè | Qua `tests/docker.test.mjs`: CSRF, cookie, session, đăng xuất, header giả, phân quyền và lượt phòng đấu |
| Sandbox thật | Qua `tests/judge.test.mjs` trong Docker read-only: 3 bot mẫu, trận thật, timeout; chặn tệp host, ghi stdlib, subprocess, mạng, secret, tràn bộ nhớ/output và vòng lặp vô hạn |
| Giải E2E | 16 đội đã đổi mã, 16 bài Python, 48 ván bảng + 14 ván loại trực tiếp, duyệt/công bố, replay công khai, export chỉ BTC; đã chạy nhiều lần trên worker thật |
| Dữ liệu sau nâng cấp | Giữ tài khoản/giải; sao chép D1 luyện tập cũ sang casual.sqlite, giữ nguyên bản gốc |
| Backup/restore | SQLite backup API + integrity_check cho 3 database; phục hồi vào volume rỗng riêng, kiểm tra lại 3 giải published và 186 replay; volume gốc giữ nguyên |
| HTTPS packaging | Compose override có domain mẫu vượt qua kiểm tra cú pháp; chưa triển khai lên domain/VPS thật trong lượt này |
| Thư viện production | `npm audit --omit=dev` trả 0 cảnh báo sau nâng bản vá; công cụ phát triển legacy còn các cảnh báo ngoài gói runtime production |
| PDF | 10 trang A4, font Việt nhúng, trích xuất text và xem ảnh render từng trang |

E2E demo dùng tối đa 40 lượt/ván, các bot Sprinter/Guardian/Tactician và không có hiệp phụ. Các lần chạy quan sát khoảng 44-60 giây cho toàn bộ flow 16 đội; không suy rộng thời gian này cho bot sinh viên, cấu hình 200 lượt hoặc hàng nghìn người.

## Review giao diện

Đã chụp desktop 1440, mobile 390 và khung người dùng 714. Detector chạy một lần và trả `[]`. Reviewer độc lập dùng **quy trình dự phòng Impeccable** vì role đóng gói không được nạp trong harness; ba sửa lỗi về font JSON, menu admin di động và nút tạo giải trực tiếp đã được chấm resolved. Disposition `ship` chỉ bao phủ danh sách sửa và bằng chứng ảnh đã cung cấp, không phải đánh giá toàn bộ backend hoặc an toàn hệ thống. Không có comp bên ngoài hay FORM roll mới vì đây là phần mở rộng của thiết kế đã có.

## Giới hạn của bằng chứng

- Chưa chạy tải 4.000 sinh viên đồng thời, kiểm định bảo mật độc lập hay benchmark bot thi thật.
- Runtime chặn capability và có giới hạn tài nguyên; không có cam kết phần mềm không thể có lỗ hổng. Cần cập nhật và theo dõi advisory của Wasmtime/CPython/Next.js trước mỗi mùa giải.
- Công bố kết quả chỉ từ worker có secret và lease; tính đúng của việc xử thua bot vẫn tin supervisor/host vận hành, không chứng minh bằng replay đơn thuần.
- GitHub workflow được cung cấp để chạy lại kiểm tra trên môi trường sạch; trạng thái của từng run cần xem trên GitHub Actions, không suy ra chỉ từ file workflow.
- Bản Vercel/Sites cũ vẫn là luyện tập; giải chính thức mới chạy Docker. Gói HTTPS cần domain và máy chủ thật do BTC quản lý.

## UET–VNU UI refinement — 2026-10-23

TypeScript passed. The detector flagged the blue top border on the square page header as a rounded-card accent; this is a narrow false positive (the header has no rounded card). Layout and tournament behavior are unchanged. Visual checks cover desktop, compact and mobile competition views and practice. A separate unauthenticated HTTP check verifies login branding. White on the primary blue exceeds WCAG AA text contrast.

## Vercel + local Docker judge — 23/10/2026

- Production website/API deployed to https://oan-tu-ti-ai-arena.vercel.app; accounts and tournament records use Neon PostgreSQL in a separate arena_competition schema. Local SQLite data is retained independently.
- Real production smoke: 4 labeled demo teams, 4 valid bots and 1 invalid submission, all 5 validations completed by the local Docker worker; 6 games across groups/knockout, public replay, restricted export and publication passed. Final production demo event: b5cc42fd-dc64-4a95-8922-bf296f99ba0e.
- PostgreSQL integration uses a disposable random schema: concurrent lease requests grant one worker, duplicate result submission commits once, wrong-worker heartbeat fails, numeric fields decode correctly, full tournament reaches publication. Batched writes roll back on a constraint failure.
- Synthetic scheduling benchmark: 128 entrants, 3,968 group games scheduled in 4,497 ms. This measures scheduling only, not bot execution or simultaneous student traffic.
- SQLite lifecycle regression, engine/human play, Vercel API auth/origin/body limits, TypeScript and production Docker build passed. Real Wasmtime image tests passed hostile-code checks, sample bots, full game and timeout forfeits.
- New Vietnamese operating guide: deploy/VERCEL_JUDGE.md and docs/huong-dan-vercel-docker-uet.pdf (4 pages, all rendered and visually checked).
- Submission updates: independent teams now use shared control fencing plus a row lock on their own team, instead of serializing every submission. Control/worker mutations still serialize. A disposable-schema test accepted 4,000 total submissions with concurrency 64, zero errors, 78.88/s and p95 871 ms; this excludes HTTP/authentication and judging. Free service quotas and 4,000 simultaneous participants are not certified. See `NOP_DONG_THOI_VNU.md`. Stop idle workers outside contest periods; polling can prevent database suspension.
- GitHub CI passed for the deployed runtime/Compose revision e4e35b7: https://github.com/nguyenlean17/oan-tu-ti-ai-arena/actions/runs/39898390014. Cloud smoke-test deadlines use the server Date header with a short future cutoff, so fresh submissions remain eligible despite clock skew.
