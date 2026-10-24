const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
export function authPage({ mode, csrf, returnTo, error = '', email = '', name = '' }) {
  const signup = mode === 'register', logout = mode === 'logout';
  const title = logout ? 'Hẹn gặp lại trên bàn cờ.' : signup ? 'Chiến thuật của bạn bắt đầu ở đây.' : 'Trở lại đấu trường.';
  const action = logout ? 'Đăng xuất' : signup ? 'Tạo tài khoản' : 'Đăng nhập';
  const fields = logout ? '<p class="logout-copy">Bạn muốn đăng xuất tài khoản trên thiết bị này?</p>' : `${signup ? `<label>Tên hiển thị<input name="name" autocomplete="nickname" minlength="2" maxlength="60" value="${escape(name)}" required></label>` : ''}
    <label>Email VNU<input name="email" type="email" autocomplete="username" maxlength="254" placeholder="tenban@vnu.edu.vn" value="${escape(email)}" required></label>
    <label>Mật khẩu<input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" ${signup ? 'minlength="12"' : ''} maxlength="128" required aria-describedby="password-help"></label>
    <p id="password-help" class="field-help">${signup ? 'Dùng 12–128 ký tự. Chọn mật khẩu riêng cho tài khoản này.' : 'Nhập mật khẩu bạn đã tạo tại đấu trường này.'}</p>
    ${signup ? '<label>Nhập lại mật khẩu<input name="confirm" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>' : ''}`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${action} — UET Arena</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/auth.css"></head><body>
    <header><a class="brand" href="/">UET Arena <span>VNU · UET</span></a><a class="back" href="/">Về đấu trường <span aria-hidden="true">↗</span></a></header>
    <main><section class="intro"><h1>Một bàn cờ.<br>Chiến thuật của riêng bạn.</h1><p>Đấu trường lập trình bot dành cho sinh viên Trường Đại học Công nghệ, ĐHQGHN. Viết Python, luyện tập và sẵn sàng cho giải đấu.</p>
      <div class="board-emblem" aria-hidden="true"><span class="rock"></span><span class="paper"></span><span class="scissors"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="13" cy="33" r="6"/><circle cx="34" cy="33" r="6"/><path d="m17 28 19-20M30 28 11 8"/></svg></span></div>
      <div class="goals"><span>P1 → I1</span><span>Đấm · Lá · Kéo</span><span>P2 → A9</span></div></section>
    <section class="form-side"><div class="form-wrap"><h2>${title}</h2><p class="lead">${logout ? 'Bot và dữ liệu của bạn vẫn được lưu.' : signup ? 'Một tài khoản để lưu bot, replay và những trận đấu của bạn.' : 'Đăng nhập để tiếp tục với bot và các phòng đấu của bạn.'}</p>
    ${error ? `<div class="error" role="alert">${escape(error)}</div>` : ''}
    <form method="post" action="/${mode}"><input type="hidden" name="csrf" value="${escape(csrf)}"><input type="hidden" name="return_to" value="${escape(returnTo)}">${fields}<button type="submit">${action} <span aria-hidden="true">→</span></button></form>
    <p class="switch">${logout ? '<a href="/">Tiếp tục chơi</a>' : signup ? `Đã có tài khoản? <a href="/login?return_to=${encodeURIComponent(returnTo)}">Đăng nhập</a>` : `Lần đầu đến đây? <a href="/register?return_to=${encodeURIComponent(returnTo)}">Tạo tài khoản</a>`}</p>
    <p class="account-note">Sinh viên dùng email @vnu.edu.vn và mật khẩu riêng của website, không dùng mật khẩu hộp thư trường. Không gửi mã xác nhận email. Mã tham gia đội được BTC cấp riêng. Tài khoản quản trị hiện có vẫn đăng nhập được.</p></div></section></main></body></html>`;
}
