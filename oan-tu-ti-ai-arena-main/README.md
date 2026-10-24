# Oẳn Tù Tì 2.0 — AI Coding Arena

Nền tảng giải đấu bot Python tiếng Việt, dùng luật bàn cờ 9×9 của dự án ban đầu. Giải chính thức hỗ trợ Vercel + Neon PostgreSQL cho website và bộ chấm Docker tại máy BTC; vẫn giữ tùy chọn chạy toàn bộ bằng Docker/SQLite.

## Toàn bộ chạy local: Docker + PostgreSQL

```sh
npm ci
npm run local:init
docker compose -f compose.local.yaml up -d --build --wait
```

Mở **http://localhost:3000/competition**. Web, API, tài khoản, hàng đợi, database, bộ chấm và runtime Python luyện tập đều chạy tại máy. Xem [hướng dẫn setup, chuyển dữ liệu, LAN và backup](deploy/LOCAL_POSTGRES.md). Project Vercel/Neon và volume SQLite cũ được giữ nguyên; các bản có dữ liệu độc lập. Lần build đầu và nộp bài qua GitHub vẫn cần Internet; tải `.py` và chấm giải không cần cloud khi chạy.

## Website Vercel + bộ chấm tại máy BTC

Mở **https://oan-tu-ti-ai-arena.vercel.app/competition**. Không cần mua tên miền hoặc mở cổng máy chấm. Xem [hướng dẫn triển khai Vercel + Docker](deploy/VERCEL_JUDGE.md) và [PDF hướng dẫn mô hình mới](docs/huong-dan-vercel-docker-uet.pdf).

Sinh viên đăng ký/đăng nhập bằng email **đúng tên miền `@vnu.edu.vn`**, dùng mật khẩu riêng của website. Không gửi mã xác nhận theo yêu cầu BTC: đây là lọc tên miền, **không xác minh chủ hộp thư**. Tài khoản admin hiện có được giữ lối đăng nhập; phiên cũ của tài khoản thường ngoài VNU không còn được chấp nhận. Dữ liệu và kết quả cũ vẫn được giữ. Xem [nộp đồng thời và chính sách tài khoản](docs/NOP_DONG_THOI_VNU.md).

## Chạy toàn bộ trên máy local

```sh
npm run competition:init
docker compose up -d --build --wait
```

Mở **http://localhost:3000/competition**. Đăng ký tài khoản VNU, rồi chủ máy cấp quyền BTC bằng `docker compose exec app node docker/admin.mjs your@vnu.edu.vn`.

- [Hướng dẫn sử dụng và vận hành tiếng Việt](docs/HUONG_DAN_SU_DUNG.md)
- [PDF hướng dẫn](docs/huong-dan-su-dung-ai-arena.pdf)
- [Thiết kế, bất biến bảo mật và giới hạn triển khai](competition/README.md)

Admin panel hỗ trợ cấu hình JSON, danh sách đội/mã mời riêng, nhận bài Python hoặc commit GitHub đã duyệt, khóa phiên bản, chia bảng, hai ván đổi bên, loại trực tiếp, replay, công bố và xuất dữ liệu. Hàng đợi SQLite có lease/heartbeat, retry hữu hạn và ghi kết quả một lần. Mỗi bot chạy trong CPython WASI/Wasmtime, không được cấp mạng, secret hay dữ liệu máy chủ. Ba bot mẫu nằm ở `public/bots/`.

Đã chạy E2E đủ 16 đội, 62 ván bằng worker thật và kiểm thử các mẫu Python độc hại. Đây là bằng chứng chức năng; chưa phải chứng nhận chịu tải 4.000 sinh viên hoặc kiểm định an toàn độc lập. Các giải DEMO là dữ liệu thử.

## Live sites

- **Vercel (public):** https://oan-tu-ti-ai-arena.vercel.app — email/password accounts stored in Neon Postgres.
- **ChatGPT Sites (owner-private):** https://oan-tu-ti-arena.wittylarch64.chatgpt.site — sign in with the owning ChatGPT account.

Vercel hỗ trợ cả luyện tập và giải chính thức qua PostgreSQL. ChatGPT Sites là bản luyện tập riêng. Dữ liệu Docker cũ độc lập và không tự động nhập lên cloud. Source Python của bài thi chỉ chạy trong bộ chấm Docker, không chạy trong Vercel Function.

## Included

- Sign in with ChatGPT; editable name and team.
- Python bot editor and `.py` uploads, immutable version history, SHA-256 hashes, downloads.
- Real Python practice execution using Pyodide in a Web Worker inside an opaque-origin sandbox iframe.
- Original FRONTLINE board placement, legal moves and capture rules; P1 targets I1, P2 targets A9.
- Two deterministic reference strategies; reproducible seed 42; a 200-ply draw limit.
- Interactive replay with play/pause, stepping, scrubbing and JSON export.
- Database-backed submissions, practice matches, profiles, tournament registration, organizer controls and audit trail.
- Personal practice rankings; server-run reference exhibitions with swapped sides.
- Tournament creation, registration deadlines, version-pinned entries and submission locks.
- Responsive interface, keyboard navigation, reduced-motion support and Vietnamese API documentation.
- **Chơi trực tiếp**: no-bot hotseat/free play, human vs Greedy/Random AI, human vs your own saved/draft Python bot, and invite-based online 1v1 rooms.
- Clickable board with legal-move highlights, keyboard controls, undo in local play, perspective switching, and downloadable game records.
- Friend games validate moves, turn ownership, room membership, and revision conflicts on the server; casual games never affect tournament rankings.

## Vercel hosting

A native Next.js deployment uses Neon Postgres for persistent accounts and game records. See [Vercel setup and deployment](deploy/VERCEL.md). The same interface and Python bots work across Vercel, Docker, and Sites; their accounts/data are separate.

## Docker with email/password login

Run `npm run competition:init`, then `docker compose up --build -d` and open **http://localhost:3000**. Register your own account; accounts and game data persist in a named volume. See [Docker setup, security, organizer access and tests](docker/README.md). The existing Sites deployment retains ChatGPT sign-in.

Three standalone Python examples are included in `public/bots/`: **Sprinter**, **Guardian** and **Tactician**. Load/download them in the bot editor, or select one directly for human-vs-Python play.

## Run locally

Node 22.16+ (the following commands start the legacy Sites development preview, not the official judge):

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_dry_shocker.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_first_mercury.sql
npm run dev
```

Visit the printed loopback URL. Local sign-in uses the starter's `Seedy` development identity; production identity is injected by Sites. The local and hosted databases are independent.

```sh
npm test
npm run check:python
npx tsc --noEmit
```

`check:python` requires Python 3 on PATH (or `OTT_PYTHON`). It checks that the browser Python engine produces a replay accepted by the original JavaScript rules.

To check friend-room concurrency and authorization with separate simulated identities, start the **built** Worker with `npm start -- --port 5174`, then run `npm run test:rooms`. The test only accepts loopback URLs. The production dispatcher supplies real identities; these test headers are never a browser authentication mechanism. The development preview intentionally uses only its fixed Seedy identity.

## Play the game yourself

Open **Chơi trực tiếp** or `/?play=1`:

- **Chơi tự do**: both sides on one device, no bots, with undo and a new-game button.
- **Đấu với máy**: choose Greedy/Random and P1/P2; the computer moves automatically on its turns.
- **Đấu bot của tôi**: select a submitted version or the current editor draft. Python stays loaded for the game, receives fresh state each turn, and has a 2-second move deadline. Code initialization has a 5-second deadline after the runtime loads. Invalid moves or bot errors forfeit the casual game.
- **1v1 với bạn**: create a room, copy its invitation URL, and have a friend join with a different account. The app polls for authoritative state, rejects stale/duplicate moves, and supports resignation. Rooms expire after 24 hours; each host can keep five unfinished rooms. A friend invitation does not grant access to the private Site: the owner must grant the friend Site access separately. Both users can return through the same room link while it remains valid.

Human games currently have a downloadable JSON record rather than being added to tournament/practice rankings. Reloading resets unsaved local/computer/Python games; online rooms persist in D1.

## Organizer setup

Open **Ban tổ chức → Thiết lập quản trị** while the Site is still owner-private. The first signed-in owner to claim setup becomes the single application administrator. This bootstrap must be completed before changing the Site audience. Other accounts cannot use organizer API operations.

## Python API

```python
def choose_move(state):
    return state["legal_moves"][0]
```

`state` contains `board` (9×9, empty cells are `None`, pieces have `player` and `type`), `player` (`P1` or `P2`), `legal_moves`, `turn`, and `history`. A move is `{"from": "B8", "to": "B7"}`. Use only standard-library Python. Upload limit: 64 KB. Browser practice has a 90-second runtime load deadline and a 15-second match deadline; the parent destroys the iframe on cancellation or timeout.

## Practice trust boundary and current scope

Student Python is never evaluated by the website backend. The practice iframe has an opaque origin, no app credentials, and a restrictive CSP permitting the pinned Pyodide CDN; the worker is destroyed after each match. It is a learning sandbox, not an official tournament judge, and browser memory is subject to browser limits rather than a dedicated VM quota. The server validates the move sequence before saving, but does not attest that a submitted bot generated it. Practice results cannot become official standings.

The official Docker tournament at `/competition` now supplies a separate authenticated worker, Wasmtime sandboxes, group scheduling, knockout brackets, immutable entries, replay verification and result publication. The original practice organizer screen remains separate and cannot publish browser practice as official results. ZIP/dependency installation, automatic school SSO, email verification/recovery, private GitHub App integration, appeals management and prizes are outside this release. See `competition/README.md` for operational ceilings.

Scoring is 3/1/0; ties in the personal practice table use number of wins. This table is not a final tournament ranking. No entrants, prize funds, official dates or public participation numbers are fabricated.

## Deployment

Docker uses Next.js production plus a session/control gateway, SQLite WAL and a separate Wasmtime worker. `deploy/compose.public.yaml` adds HTTPS via Caddy when a real domain/server is available. Vercel and Sites retain their independent practice deployment paths. Keep `.secrets`, backups, `.env*`, `.wrangler`, `.sites-runtime`, `node_modules` and build artifacts out of Git. Browser practice loads Pyodide from jsDelivr; the official worker uses its bundled Python runtime.
