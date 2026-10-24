# UET Arena - toàn bộ chạy local bằng Docker + PostgreSQL

Website trên máy BTC: **http://localhost:3000/competition**.

Project Vercel và dữ liệu Neon được giữ nguyên. Bản local dùng database, token worker và volume riêng; không đồng bộ hai chiều. Worker cloud trên máy này đã được dừng để chuyển sang local.

## Những gì chạy trên máy

```text
Trình duyệt -> app (Next.js, đăng nhập, API) -> db (PostgreSQL 18)
                   ^
                   |
              judge (Docker + CPython WASI/Wasmtime)
```

- `app`: web/API và các tài nguyên Pyodide luyện tập, giới hạn 2 CPU/2 GiB.
- `db`: tài khoản, bài nộp, hàng đợi, kết quả và replay, giới hạn 1 CPU/1 GiB. Không mở cổng database ra host.
- `judge`: một luồng kiểm tra bài và một luồng chấm trận, giới hạn 2 CPU/2 GiB. Không có mật khẩu database, chỉ gọi API nội bộ bằng token riêng.
- Database và worker nằm trên các mạng Docker nội bộ. Chỉ cổng web được mở, mặc định bind `127.0.0.1:3000`.
- Dữ liệu PostgreSQL nằm trong volume `uet-arena-local_local-postgres`. Volume SQLite cũ được giữ độc lập, không dùng cho bản này.

Đăng nhập, tải `.py`, tạo/khóa giải, chấm, xem replay và luyện tập Python có thể hoạt động không cần Vercel, Neon hoặc CDN trong lúc chạy. Khởi tạo lần đầu/build image vẫn cần Internet để tải image, npm và runtime đã ghim checksum. Nộp từ GitHub đương nhiên cần kết nối GitHub; nếu không có Internet, tải tệp `.py` trực tiếp.

## 1. Chuẩn bị và khởi động

Cài Docker Desktop (Linux containers), Git và Node.js 22.16+; khuyến nghị máy RAM từ 8 GiB, SSD và cấp đủ RAM cho Docker. Khi đồng thời chạy ứng dụng khác, cần tính thêm tài nguyên cho các ứng dụng đó.

```powershell
npm ci
npm run local:init
docker compose -f compose.local.yaml up -d --build --wait
```

Mở **http://localhost:3000/competition**. `local:init` không ghi đè secret đã có, không sửa cấu hình Vercel. Trên Linux, nếu người chạy lệnh không phải root, cấp quyền đọc hai secret cho UID của container:

```sh
sudo chown 1000:1000 .secrets/local-postgres-url .secrets/local-judge-token
```

Không xóa `.secrets/` khi vẫn dùng volume cũ: database và worker cần đúng secret ban đầu. Secret không nằm trong Git/image. Build app tự tạo schema khi chạy trên database mới.

### Đăng nhập và cấp quyền BTC

Nếu đã nhập dữ liệu cloud: dùng lại tài khoản/mật khẩu cũ; phải đăng nhập lại vì phiên local đã được làm mới. Thông tin BTC demo local được lưu riêng trong `.secrets/local-admin.json` trên máy hiện tại, không nằm trong repository.

Nếu cài mới hoàn toàn: đăng ký tài khoản `@vnu.edu.vn` ở website local rồi cấp quyền đúng người:

```powershell
docker compose -f compose.local.yaml exec app node scripts/local-admin.mjs your@vnu.edu.vn
```

Đăng xuất/đăng nhập lại để dùng mục Ban tổ chức. Lọc tên miền VNU không xác minh chủ hộp thư; BTC vẫn phải đối chiếu danh sách và cấp mã đội riêng. Không dùng mật khẩu hộp thư trường làm mật khẩu website.

## 2. Dữ liệu đã chuyển

Snapshot ngày 23/10/2026 đã nhập **117 tài khoản, 7 giải, 316 bài nộp và 932 ván hoàn tất**. Giữ ID giải, source, hash, mật khẩu và kết quả; làm mới phiên đăng nhập, trạng thái worker và lease đang chạy ở bản local. Các giải QA tạo sau khi nhập chỉ nằm ở local.

Công cụ nhập một chiều chỉ chấp nhận PostgreSQL local **chưa có bảng** và từ chối ghi đè dữ liệu đang dùng:

```powershell
# Chỉ dùng ở máy cài mới, trước khi bật app; file nguồn cần DATABASE_URL của Neon.
docker compose -f compose.local.yaml up -d --wait db
node --env-file=.env.vercel.local scripts/local-import-cloud.mjs
docker compose -f compose.local.yaml up -d --build --wait
```

Không chạy lại import trên database đang có dữ liệu. Công cụ chỉ đọc cloud, tạo bản dump riêng và khôi phục vào database local trống. Mọi thay đổi sau snapshot ở một bên không tự xuất hiện ở bên kia.

## 3. Tổ chức giải

Vào Ban tổ chức, tạo giải nháp, chốt luật/hạn nộp/số bảng/suất đi tiếp, nhập đội và cấp mã mời. Mở nhận bài; sinh viên đăng nhập, nhận đội và tải Python lên. Đợi kiểm tra hết bài pending sau hạn rồi khóa. Hệ thống cố định phiên bản, chia bảng, chạy các cặp đổi bên và vòng loại trực tiếp. BTC kiểm tra replay rồi công bố và xuất giải.

Hạn mức giữ nguyên: source 64 KiB, một phiên bản mới mỗi 5 giây/đội, tối đa 2 bài pending và 200 phiên bản/đội. Các đội ghi bài song song; cùng đội tuần tự. Gửi lại cùng source không tạo bài/job trùng. Máy chấm tắt thì bài đã lưu vẫn chờ trong PostgreSQL; bật lại sẽ tiếp tục.

## 4. Dừng, bật lại và theo dõi

```powershell
docker compose -f compose.local.yaml ps
docker compose -f compose.local.yaml logs --tail 50 app judge
docker compose -f compose.local.yaml stop
docker compose -f compose.local.yaml up -d --wait
```

Khi thi, giữ Docker và máy chủ bật, tắt chế độ ngủ. `stop` hoặc `down` không kèm `-v` giữ dữ liệu. **Không dùng `down -v` để dừng hệ thống**: thao tác đó xóa volume database.

Vercel vẫn ở địa chỉ cũ. Nếu cần chạy lại worker cloud, dùng `compose.judge.yaml` và secret cloud riêng; worker local vẫn chỉ chấm database local. Không đổi `CONTROL_URL` của worker local thành địa chỉ Vercel.

## 5. Sao lưu và khôi phục

```powershell
npm run local:backup
node tests/local-backup.test.mjs
```

Lệnh đầu tạo archive PostgreSQL nhị phân trong `backups/local/`, gồm tài khoản, bài và kết quả. Lệnh sau tạo backup rồi khôi phục vào một database thử có tên ngẫu nhiên, đối chiếu số bản ghi và xóa **chỉ database thử đó**; không ghi đè database `arena`.

Giữ bản sao archive và `.secrets/` ở nơi riêng do BTC quản lý; backup chứa dữ liệu tài khoản và hash mật khẩu, không đưa lên Git hoặc gửi cho sinh viên. Export giải từ admin panel không thay thế backup database. Khi cần phục hồi thực tế, dừng app/worker, khôi phục vào database/volume mới, kiểm tra rồi mới chuyển sang dùng; giữ bản cũ để quay lại khi cần.

## 6. Truy cập qua mạng LAN

Mặc định chỉ máy BTC truy cập được. Để các máy trong lớp truy cập, tạo `.env.local-stack` (không commit):

```dotenv
ARENA_BIND_ADDRESS=0.0.0.0
ARENA_PORT=3000
PUBLIC_ORIGIN=http://192.168.1.20:3000
```

Thay IP bằng IP LAN cố định/được giữ ổn định của máy chủ, cho phép cổng TCP 3000 trên firewall **mạng tin cậy**, rồi:

```powershell
docker compose -f compose.local.yaml --env-file .env.local-stack up -d --wait
```

Sinh viên mở `http://IP-MAY-CHU:3000/competition`, không dùng `localhost` trên máy của họ. PUBLIC_ORIGIN phải khớp địa chỉ đang dùng, nếu không đăng nhập/nộp bài sẽ bị CSRF từ chối. Khi cấu hình LAN, luôn dùng cùng `--env-file` cho các lệnh quản lý. HTTP phù hợp kiểm thử trong mạng tin cậy; triển khai ra Internet cần HTTPS qua reverse proxy và cấu hình mạng của trường.

## 7. Kết quả kiểm thử và giới hạn

- HTTP: đăng nhập admin đã nhập, đăng ký VNU, 16 POST đồng thời thành đúng 2 bài; giải QA đủ 4 ván, replay khớp và đã công bố.
- PostgreSQL local: 4.000 bài tổng, concurrency 64, **0 lỗi**, 11,981 giây, 333,86 bài/giây, p95 260 ms. Đây là đường nhận bài vào database, không phải 4.000 người qua HTTP và không phải chấm xong 4.000 bot; không so trực tiếp với phép đo cloud khác môi trường.
- Khi ngắt mạng Internet của riêng app, đăng nhập/đăng ký, chạy Pyodide local, kiểm tra bài bằng worker, thi đấu đủ 4 ván và công bố vẫn thành công. Mạng nội bộ database/judge được giữ; Internet được nối lại sau bài thử.
- Lease, kết quả trùng, chia bảng/loại trực tiếp, rollback được kiểm thử trên PostgreSQL local. Control/worker vẫn còn khóa ghi chung; cần đo contention khi tăng số máy chấm. Cấu hình máy, điện, ổ đĩa và mạng LAN trở thành giới hạn thay cho quota cloud.

Các phép thử local phải chạy sau khi stack healthy. `tests/local-offline.test.mjs` cần `ARENA_ALLOW_OFFLINE_TEST=1`, sẽ tạm ngắt kết nối mạng ngoài của app local và tự nối lại; không tác động project Vercel.
