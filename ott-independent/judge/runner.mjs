import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createInitialBoard, legalMoves, applyMove, referenceMove, ENGINE_VERSION } from '../lib/engine.mjs';
import { RUNTIME_VERSION, sha } from '../competition/store.mjs';

export class InfrastructureError extends Error {}
class BotFailure extends Error {
  constructor(reason, message) { super(message); this.reason = reason; }
}
export function startBot(source, config, seed = 1) {
  const environment = { PATH: process.env.PATH || '', SYSTEMROOT: process.env.SYSTEMROOT || process.env.SystemRoot || '', WASI_PYTHON_DIR: process.env.WASI_PYTHON_DIR || '/opt/cpython', BOT_MEMORY_MB: String(config.memoryMB), PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' };
  if (process.platform === 'win32') environment.PROCESSOR_ARCHITECTURE = process.env.PROCESSOR_ARCHITECTURE || 'AMD64';
  // Optional local development package directory, never passed to the WASI guest.
  if (process.env.WASMTIME_PYTHONPATH) environment.PYTHONPATH = process.env.WASMTIME_PYTHONPATH;
  const child = spawn(process.env.JUDGE_PYTHON || 'python3', ['-u', fileURLToPath(new URL('./sandbox.py', import.meta.url))], { env: environment, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let buffer = '', stderr = '', size = 0, closed = false, failure = null, pending = null, booted = false;
  const lines = [];
  const reject = error => { failure = error; if (pending) { pending.reject(error); clearTimeout(pending.timer); pending = null; } };
  const next = (ms, host = false) => new Promise((resolve, rejectPromise) => {
    if (failure) return rejectPromise(failure);
    if (lines.length) return resolve(lines.shift());
    if (closed) return rejectPromise(new BotFailure('bot_error', stderr || 'Bot đã dừng.'));
    pending = { resolve, reject: rejectPromise, timer: setTimeout(() => { pending = null; const error = host ? new InfrastructureError('Không khởi động được runtime.') : new BotFailure('timeout', 'Bot vượt thời gian cho phép.'); rejectPromise(error); child.kill(); }, ms) };
  });
  child.on('error', () => reject(new InfrastructureError('Không tìm thấy runtime Python/Wasmtime.')));
  child.stdin.on('error', () => { if (!closed) reject(booted ? new BotFailure('bot_error', 'Bot đóng đầu vào.') : new InfrastructureError('Runtime đóng đầu vào.')); });
  child.on('close', code => { closed = true; reject(code === 73 ? new BotFailure('output_limit', 'Bot xuất quá nhiều dữ liệu.') : booted ? new BotFailure('bot_error', stderr || 'Bot gặp lỗi Python.') : new InfrastructureError('Không thể nạp CPython WASI. ' + stderr.slice(-1200))); });
  child.stderr.on('data', chunk => {
    size += chunk.length; stderr = (stderr + chunk.toString('utf8')).slice(-1800);
    if (size > 65536) { reject(new BotFailure('output_limit', 'Bot xuất quá nhiều dữ liệu.')); child.kill(); }
  });
  child.stdout.on('data', chunk => {
    size += chunk.length; buffer += chunk.toString('utf8');
    if (size > 65536 || buffer.length > 8192) { reject(new BotFailure('output_limit', 'Bot xuất quá nhiều dữ liệu.')); child.kill(); return; }
    for (;;) {
      const end = buffer.indexOf('\n'); if (end < 0) break;
      const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
      if (pending) { const p = pending; pending = null; clearTimeout(p.timer); p.resolve(line); } else lines.push(line);
      if (lines.length > 4) { reject(new BotFailure('output_limit', 'Bot gửi dữ liệu ngoài giao thức.')); child.kill(); return; }
    }
  });
  const ready = (async () => {
    if (await next(60000, true) !== 'HOST_READY') throw new InfrastructureError('Sai giao thức runtime.');
    booted = true;
    child.stdin.write(JSON.stringify({ source, seed }) + '\n');
    if (await next(config.startupMs) !== 'READY') throw new BotFailure('bot_error', 'Không in dữ liệu ra stdout; dùng stderr khi cần debug.');
  })();
  // Attach immediately: the second bot can fail while the first is starting.
  ready.catch(() => {});
  return {
    ready,
    async move(state) {
      await ready;
      child.stdin.write(JSON.stringify(state) + '\n');
      const line = await next(config.moveMs);
      try { return JSON.parse(line); } catch { throw new BotFailure('bot_error', 'Bot không trả về JSON hợp lệ.'); }
    },
    close() { child.kill(); },
  };
}
const stateFor = (board, player, moves) => ({ board, player, legal_moves: legalMoves(board, player), turn: moves.length, history: moves });

export async function validateBot(payload) {
  if (payload.engine !== ENGINE_VERSION || payload.runtime !== RUNTIME_VERSION) throw new InfrastructureError('Pinned job version mismatch');
  if (sha(payload.source) !== payload.sha) throw new InfrastructureError('Source hash mismatch');
  let bot;
  try {
    // Both seats and a changed board; static syntax checking is not a security boundary.
    for (const player of ['P1', 'P2']) {
      bot = startBot(payload.source, payload.config, 1);
      await bot.ready;
      const board = createInitialBoard(), moves = [];
      for (let step = 0; step < 3; step++) {
        const move = await bot.move(stateFor(board, player, moves));
        try { moves.push(applyMove(board, move, player)); } catch { throw new BotFailure('invalid_move', 'choose_move trả về nước đi không hợp lệ.'); }
        const other = player === 'P1' ? 'P2' : 'P1', reply = referenceMove(board, other);
        if (reply) moves.push(applyMove(board, reply, other));
      }
      bot.close();
    }
    return { valid: true, message: 'Đạt kiểm tra cơ bản ở hai phía. Mỗi trận vẫn áp dụng giới hạn tài nguyên.', sha: payload.sha, engine: ENGINE_VERSION, runtime: RUNTIME_VERSION };
  } catch (error) {
    if (error instanceof InfrastructureError) throw error;
    return { valid: false, message: String(error.message).slice(0, 1000), sha: payload.sha, engine: ENGINE_VERSION, runtime: RUNTIME_VERSION };
  } finally { bot?.close(); }
}
export async function runGame(payload) {
  if (payload.engine !== ENGINE_VERSION || payload.runtime !== RUNTIME_VERSION) throw new InfrastructureError('Pinned job version mismatch');
  for (const seat of ['p1', 'p2']) if (sha(payload[seat].source) !== payload[seat].sha) throw new InfrastructureError('Source hash mismatch');
  const board = createInitialBoard(), moves = [];
  const result = { moves, winner: null, reason: 'max_plies', seed: payload.seed, engine: ENGINE_VERSION, runtime: RUNTIME_VERSION, p1sha: payload.p1.sha, p2sha: payload.p2.sha };
  const bots = [startBot(payload.p1.source, payload.config, payload.seed), startBot(payload.p2.source, payload.config, payload.seed)];
  let player = 'P1', phase = 'startup';
  try {
    for (let i = 0; i < 2; i++) { player = i ? 'P2' : 'P1'; await bots[i].ready; }
    phase = 'move';
    for (let i = 0; i < payload.config.maxPlies; i++) {
      player = i % 2 ? 'P2' : 'P1';
      const state = stateFor(board, player, moves);
      if (!state.legal_moves.length) { result.winner = player === 'P1' ? 'P2' : 'P1'; result.reason = 'no_moves'; break; }
      const move = await bots[i % 2].move(state);
      let step;
      try { step = applyMove(board, move, player); } catch { throw new BotFailure('invalid_move', 'Bot trả về nước đi không hợp lệ.'); }
      moves.push(step);
      if (step.winner) { result.winner = step.winner; result.reason = 'goal'; break; }
    }
  } catch (error) {
    if (error instanceof InfrastructureError) throw error;
    result.winner = player === 'P1' ? 'P2' : 'P1'; result.reason = error.reason || 'bot_error'; result.faultPlayer = player; result.phase = phase; result.message = String(error.message).slice(0, 1000);
  } finally { bots.forEach(bot => bot.close()); }
  return result;
}
