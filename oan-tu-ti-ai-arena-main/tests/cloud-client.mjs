import assert from 'node:assert/strict';
export class CloudClient {
  jar = new Map();
  constructor(base) { this.base = base; }
  cookies() { return [...this.jar].map(([k,v]) => `${k}=${v}`).join('; '); }
  remember(response) {
    this.serverTime = Date.parse(response.headers.get('date')) || Date.now();
    for (const c of response.headers.getSetCookie()) { const [k,v] = c.split(';')[0].split('='); this.jar.set(k,v); }
  }
  async call(url, body, status = 200) {
    const r = await fetch(this.base + url, { redirect: 'manual', headers: { Cookie: this.cookies(), ...(body ? { Origin: this.base, 'Content-Type': 'application/json' } : {}) }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
    this.remember(r);
    const text = await r.text(); assert.equal(r.status, status, text.slice(0,300));
    return r.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text;
  }
  post(body, status) { return this.call('/api/competition', body, status); }
  async auth(mode, email, name, password) {
    const html = await this.call('/' + mode), csrf = /name="csrf" value="([a-f0-9]+)"/.exec(html)[1];
    const r = await fetch(this.base + '/' + mode, { redirect: 'manual', method: 'POST', headers: { Cookie: this.cookies(), Origin: this.base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email, name, password, confirm: password, csrf, return_to: '/competition' }) });
    assert.equal(r.status, 303, (await r.text()).slice(0,300)); this.remember(r);
  }
  register(email, name, password) { return this.auth('register', email, name, password); }
  login(email, password) { return this.auth('login', email, '', password); }
}
