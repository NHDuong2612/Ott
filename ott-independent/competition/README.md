# Hệ thống giải đấu chính thức

Mở `/competition` trên Vercel hoặc bản Docker. [Triển khai Vercel + bộ chấm local](../deploy/VERCEL_JUDGE.md). Tài liệu thao tác đầy đủ: [`docs/HUONG_DAN_SU_DUNG.md`](../docs/HUONG_DAN_SU_DUNG.md).

## Ranh giới trách nhiệm

| Thành phần | Chạy ở đâu | Trách nhiệm |
|---|---|---|
| Next.js production | Container `app`, loopback 8787 | Giao diện và các tính năng luyện tập/chơi bạn bè |
| Gateway Node | Container `app`, cổng 3000 | Session, CSRF, phân quyền, API giải đấu, hàng đợi, kiểm tra replay |
| SQLite WAL | Volume `arena-data` của `app` | Tài khoản, bài nộp, cấu hình cố định, công việc, kết quả, nhật ký |
| Worker Node | Container `judge`, không mở cổng | Nhận lease qua HTTP, điều khiển game engine, gọi hai sandbox riêng |
| Wasmtime + CPython WASI | Tiến trình riêng cho từng bot | Thực thi Python; chỉ đọc thư viện, không được cấp mạng hay thư mục dữ liệu |

Không chạy source sinh viên bằng `eval`, Python máy chủ, Node WASI hay một bộ lọc AST. `exec` trong `judge/sandbox.py` nằm **trong chuỗi chương trình chạy ở CPython WebAssembly**, không phải interpreter Python máy chủ.

## Tệp cần đọc

- `competition/store.mjs`: schema, transaction, nhận bài, snapshot, chia bảng, lịch đấu, điểm, lease và idempotency.
- `competition/http.mjs`: điểm vào xác thực, giới hạn request, nhập bot từ GitHub đã duyệt.
- `judge/worker.mjs`: hai slot riêng cho validation và trận đấu, heartbeat, retry.
- `judge/runner.mjs`: giao thức stdin/stdout, giới hạn thời gian/dữ liệu, luật cờ đáng tin cậy.
- `judge/sandbox.py`: host Wasmtime, quyền filesystem chỉ đọc, bộ nhớ và fuel.
- `app/competition/page.tsx`: bảng điều hành và trang sinh viên.
- `docker/migrate-casual.mjs`: giữ lại dữ liệu Docker cũ khi chuyển sang Next.js production.

## Bất biến dữ liệu

1. Quyền nộp lấy từ session → membership đã đổi mã mời. Trường `team` do trình duyệt gửi không được dùng để xác định người nộp.
2. Mã mời có entropy 192 bit, lưu hash, dùng một lần, ràng buộc email và MSSV do BTC cấp riêng. Email đăng ký tự khai không được coi là đã xác minh.
3. Source và SHA-256 không bị sửa; mỗi job giữ chính source/hash đã nhận. Git chỉ là đường lấy `bot.py` từ commit đầy đủ trong repo công khai đã gắn cho đội.
4. Khóa danh sách chỉ khi hết hạn và không còn validation pending. Bài hợp lệ mới nhất trước hạn được chọn.
5. Khi mở nhận bài chỉ được sửa hạn; các luật/giới hạn khác phải được chốt từ bản nháp. Sau freeze không sửa config, entries hay seed.
6. Ghi replay, hoàn tất job, chốt điểm và tạo vòng sau trong một `BEGIN IMMEDIATE`. Kết quả giống hệt gửi lại không được tính thêm.
7. Worker phải có secret riêng, đúng phiên bản runtime, lease token hiện hành và còn hạn. Mất heartbeat 90 giây: job được cấp lease mới; kết quả cũ bị từ chối.
8. Lỗi hạ tầng thử tối đa 3 lần rồi chờ BTC xử lý. Lỗi/timeout của bot xử thua ở đúng phía; không làm mất công việc.
9. Replay được phát lại bằng engine máy chủ. Lý do xử thua do supervisor đáng tin cậy báo, không phải trình duyệt.
10. Nếu nâng cấp làm engine/runtime khác phiên bản job đã khóa, giải tự tạm dừng và ghi audit. Cần khôi phục bản image tương thích; không âm thầm áp luật mới lên bài cũ.

## Thể thức

Chia bảng bằng shuffle có seed rồi phân phối zíc zắc để chênh lệch số đội không quá một. Mỗi cặp trong bảng chơi hai ván đổi bên; thắng ván 1 điểm, hòa 0,5. Cặp thắng/hòa/thua nhận 3/1/0. Xếp bằng điểm theo mini-league đối đầu của toàn nhóm bằng điểm, hiệu số ván rồi hạt giống ban đầu.

Vòng loại trực tiếp lấy `qualifiers` đội mỗi bảng. Tổng số đội đi tiếp phải là lũy thừa của hai. Lịch hạt giống tiêu chuẩn giúp hai đội cùng bảng không tái đấu ngay khi có từ hai bảng và hai suất/bảng. Nếu hòa cặp, chạy tối đa `extraSets` cặp đổi bên nữa; vẫn hòa thì hạt giống nhỏ hơn đi tiếp. Công khai quy tắc này trước giải. Không có chức năng sửa điểm thủ công hoặc sửa kết quả đã công bố.

## Giới hạn hiện tại

- Một app ghi vào một SQLite volume trên đĩa local; **không scale ngang app hoặc đặt SQLite trên NFS**. Có thể nhân bản worker. Chuyển store/queue sang PostgreSQL khi đo được nút thắt, không cần Redis/Kafka/Kubernetes cho bản này.
- Không có SSO trường, xác minh email tự động, GitHub OAuth/App hay webhook. BTC xác nhận danh sách và phát mã riêng. Repo riêng tư dùng tải `.py` lên.
- Python WASI là một tập con của Python tiêu chuẩn; không `pip`, extension native, socket hay subprocess. Browser practice dùng Python runtime khác; validation chính thức mới là chuẩn tương thích.
- Seed không bảo đảm source bất kỳ hoàn toàn deterministic: đồng hồ/entropy trong WASI có thể làm bot tự ngẫu nhiên. Replay lưu diễn biến thật; không lấy kết quả chạy lại để ghi đè trận cũ.
- `maxPlies` 20–200, thời gian mỗi nước 100–5.000 ms, bộ nhớ linear Wasm 64–256 MiB, fuel tổng mỗi bot 5 tỷ lệnh Wasm. Wall time, fuel và giới hạn container cùng có hiệu lực. Không có quyền ghi tệp hoặc tạo tiến trình cho bot.
- Export toàn giải là JSON trong RAM, dành cho pilot/vừa. Với giải nhiều chục nghìn ván, dùng backup SQLite thay vì xuất tất cả replay qua HTTP; cần streaming export và cache bảng điểm trước khi nhận 4.000 bot đồng thời.
- Vercel dùng schema PostgreSQL riêng và API server-side, worker Docker chủ động lấy việc qua HTTPS. Bản Docker/SQLite vẫn dùng được độc lập; Sites là bản luyện tập. Không chạy bộ chấm trong Vercel Function.
