'use client';
import { useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, FileCheck2, Settings2, ShieldCheck, Users, RefreshCw } from 'lucide-react';
import './operations.css';

type Check = { id: string; label: string; state: string; detail: string };
type Queue = { kind: string; total: number; queued: number; running: number; done: number; failed: number; expired: number; oldestCreated: number | null; completedRecent: number; ratePerMinute: number; meanSeconds: number | null; etaSeconds: number | null };
export type Operations = {
  sampledAt: number;
  summary: Record<string, number>;
  queues: Queue[];
  workerSummary: { known: number; online: number; compatible: number };
  workers: { id: string; seen: number; runtime: string; online: boolean; compatible: boolean; activeJobs: number }[];
  preflight: { canFreeze: boolean; eligibleTeams: number; expectedGroupGames: number | null; checks: Check[] };
  issues: { infrastructure: { id: string; kind: string; status: string; label: string; attempts: number; created: number }[]; invalid: { id: string; label: string; verdict: string; created: number }[]; botGames: { id: string; p1: string; p2: string; reason: string }[]; botGameCount: number };
  audit: { id: number; actor: string; action: string; created: number }[];
};
type Tournament = { id: string; name: string; status: string; paused: number; config: { groupCount: number; qualifiers: number; deadline: string; maxPlies: number; moveMs: number; memoryMB: number } };
const n = (value: number) => value.toLocaleString('vi-VN');
const stamp = (value: number | string) => new Date(value).toLocaleString('vi-VN');
function duration(seconds: number) {
  if (seconds < 60) return `${Math.max(0, Math.ceil(seconds))} giây`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} phút`;
  return `${Math.floor(seconds / 3600)} giờ ${Math.ceil(seconds % 3600 / 60)} phút`;
}
const faultLabels: Record<string, string> = { bot_error: 'Bot gặp lỗi', timeout: 'Bot quá thời gian', invalid_move: 'Nước đi không hợp lệ', output_limit: 'Bot xuất quá nhiều dữ liệu' };
const actions: Record<string, string> = { create: 'Tạo giải', config: 'Cập nhật cấu hình', team: 'Thêm đội', invite: 'Cấp mã tham gia', join: 'Gắn thành viên với đội', submit: 'Nhận bài nộp', freeze: 'Khóa bài và chia bảng', open: 'Mở nhận bài', pause: 'Tạm dừng', resume: 'Tiếp tục', result: 'Ghi kết quả chấm', retry: 'Yêu cầu thử lại', publish: 'Công bố kết quả', revoke: 'Thu hồi thành viên', 'infrastructure-failure': 'Lỗi hạ tầng chấm', 'runtime-mismatch-paused': 'Dừng do lệch phiên bản', qualify: 'Chọn đội đi tiếp', 'ready-to-publish': 'Chờ duyệt kết quả' };

export default function OperationsDashboard({ event, data, busy, stale, onRefresh, onConfigure, onAction, onReplay }: {
  event: Tournament; data: Operations; busy: boolean; stale: boolean;
  onRefresh: () => void; onConfigure: () => void;
  onAction: (body: Record<string, unknown>) => Promise<unknown>;
  onReplay: (id: string) => void;
}) {
  const [issueTab, setIssueTab] = useState('infra'), [confirmFreeze, setConfirmFreeze] = useState(false);
  const s = data.summary, infrastructureCount = data.queues.reduce((v, q) => v + q.failed + q.expired, 0);
  const queued = data.queues.reduce((v, q) => v + q.queued + q.running, 0);
  const phaseCanFreeze = ['open', 'locking'].includes(event.status);
  const locked = ['groups', 'knockout', 'review', 'published'].includes(event.status);
  const metrics = [
    { title: 'Đội trong danh sách', value: s.rosterTeams, note: `${n(s.activatedTeams)} đội đã kích hoạt · ${n(s.members)} thành viên`, icon: Users },
    { title: 'Đội đã nộp bài', value: s.submittedTeams, note: `${n(s.noSubmissionTeams)} đội chưa nộp · ${n(s.submissions)} phiên bản`, icon: FileCheck2 },
    { title: 'Đội đủ điều kiện', value: s.eligibleTeams, note: 'Có ít nhất một bài hợp lệ trước hạn', icon: ShieldCheck },
    { title: 'Bài chờ kiểm tra', value: s.pendingSubmissions, note: `${n(s.pendingTeams)} đội có bài mới nhất đang chờ`, icon: Clock3 },
  ];
  return <div className="ops-dashboard">
    <div className="ops-heading"><div><span className="ops-eyebrow">TRUNG TÂM ĐIỀU HÀNH</span><h2>Nắm tiến độ. Xử lý đúng việc.</h2><p>Dữ liệu lúc {stamp(data.sampledAt)} · {event.status === 'published' ? 'giải đã công bố, cập nhật thủ công.' : 'tự cập nhật mỗi 15 giây khi mở màn hình.'}</p></div><button onClick={onRefresh} disabled={busy}><RefreshCw size={16} />Cập nhật</button></div>
    {stale && <div className="ops-alert" role="alert">Chưa lấy được dữ liệu mới. Số liệu bên dưới có thể đã cũ; cập nhật thành công trước khi điều hành.</div>}
    <div className="ops-metrics">{metrics.map(({ title, value, note, icon: Icon }) => <article key={title}><div><span>{title}</span><Icon size={19} /></div><strong>{n(value)}</strong><p>{note}</p></article>)}</div>
    <section className="ops-section"><div className="ops-section-head"><div><h3>Tình hình bài nộp</h3><p>Mỗi đội được tính một lần theo phiên bản mới nhất. Điều kiện dự thi vẫn xét bài hợp lệ gần nhất trước hạn.</p></div><span className="ops-pill">{n(s.latestInvalidTeams)} đội cần sửa bài</span></div>
      <div className="ops-submission-strip">{[['Hợp lệ', s.latestValidTeams, 'good'], ['Đang chờ', s.pendingTeams, 'waiting'], ['Chưa hợp lệ', s.latestInvalidTeams, 'bad'], ['Chưa nộp', s.noSubmissionTeams, 'neutral']].map(([label, value, style]) => <div key={label} className={`ops-strip-${style}`}><strong>{n(Number(value))}</strong><span>{label}</span></div>)}</div>
    </section>
    <div className="ops-columns">
      <section className="ops-section"><div className="ops-section-head"><h3><Activity size={18} /> Bộ chấm & hàng đợi</h3><span className={`ops-pill ${data.workerSummary.compatible ? 'good' : 'bad'}`}>{data.workerSummary.compatible} worker sẵn sàng</span></div>
        {data.workerSummary.compatible === 0 && <p className="ops-inline-warning">Chưa thấy worker đúng phiên bản có tín hiệu trong 90 giây qua. Kiểm tra máy chấm và kết nối trước khi tiếp tục.</p>}
        {event.paused > 0 && <p className="ops-inline-warning">Đã tạm dừng nhận job mới. Công việc đang chạy vẫn có thể hoàn tất.</p>}
        <div className="ops-queues">{data.queues.map(q => <article key={q.kind}><h4>{q.kind === 'validate' ? 'Kiểm tra bài' : 'Chấm ván đấu'}</h4><div className="ops-queue-counts"><span><b>{n(q.queued)}</b> chờ</span><span><b>{n(q.running)}</b> đang xử lý</span><span><b>{n(q.done)}</b> hoàn tất</span><span><b>{n(q.failed + q.expired)}</b> cần xử lý</span></div><progress max={Math.max(1, q.total)} value={q.done} aria-label={`Tiến độ ${q.kind === 'validate' ? 'kiểm tra bài' : 'chấm ván'}`} /><dl><div><dt>Hoàn tất trong 15 phút</dt><dd>{n(q.completedRecent)} · {q.ratePerMinute.toLocaleString('vi-VN')} job/phút</dd></div><div><dt>Đã chờ lâu nhất</dt><dd>{q.oldestCreated === null ? 'Không có job chờ' : duration((data.sampledAt - q.oldestCreated) / 1000)}</dd></div><div><dt>Thời gian xử lý trung bình¹</dt><dd>{q.meanSeconds === null ? 'Chưa có số liệu' : duration(q.meanSeconds)}</dd></div><div><dt>Ước tính phần còn lại</dt><dd>{q.etaSeconds === null ? q.queued + q.running === 0 ? 'Không có job đang chờ/chạy' : 'Chưa đủ điều kiện ước tính' : `Khoảng ${duration(q.etaSeconds)}`}</dd></div></dl></article>)}</div>
        <p className="ops-note">¹ Thời gian từ lúc nhận đến ghi kết quả thành công của lần chạy cuối. Tốc độ tính trong 15 phút; chỉ ước tính khi có ít nhất 5 kết quả, trải dài tối thiểu 1 phút, worker hoạt động và không có job lỗi. Ước tính chỉ dành cho hàng đợi hiện tại, chưa gồm các vòng sau.</p>
        <details><summary>Worker dùng chung giữa các giải ({n(data.workerSummary.known)})</summary>{data.workers.length ? <ul className="ops-workers">{data.workers.map(w => <li key={w.id}><span><code>{w.id}</code><small>Tín hiệu: {stamp(w.seen)} · {w.activeJobs} job đang chạy của giải này</small></span><span className={`ops-pill ${w.online && w.compatible ? 'good' : 'bad'}`}>{!w.online ? 'Mất tín hiệu' : !w.compatible ? 'Lệch phiên bản' : 'Đang kết nối'}</span></li>)}</ul> : <p>Chưa có worker kết nối.</p>}<p className="ops-note">Hiển thị tối đa 20 worker gần đây. Không suy ra tải CPU/RAM từ tín hiệu kết nối.</p></details>
      </section>
      <section className="ops-section"><div className="ops-section-head"><h3><ShieldCheck size={18} /> {locked ? 'Vòng thi đã khóa' : 'Kiểm tra trước khi khóa'}</h3></div>
        <div className="ops-format"><strong>Chia bảng → loại trực tiếp</strong><p>{event.config.groupCount} bảng · {event.config.qualifiers} đội/bảng đi tiếp · hai ván đổi bên.</p><button onClick={onConfigure}><Settings2 size={15} />{locked ? 'Xem cấu hình' : 'Cấu hình vòng thi'}</button></div>
        {locked ? <p className="ops-note">Danh sách bài và luật đã cố định. Vòng sơ loại đấu bot chuẩn BTC chưa được triển khai; màn hình này điều hành thể thức hiện có.</p> : <><ul className="ops-checks">{data.preflight.checks.map(check => <li key={check.id} className={`ops-check-${check.state}`}>{check.state === 'pass' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}<div><strong>{check.label}</strong><span>{check.id === 'deadline' ? stamp(check.detail) : check.detail}</span></div></li>)}</ul><p className="ops-note">Dự kiến {n(data.preflight.expectedGroupGames || 0)} ván vòng bảng từ {n(data.preflight.eligibleTeams)} đội đủ điều kiện; chưa gồm loại trực tiếp. Các mục màu vàng cần BTC rà soát.</p></>}
        <div className="ops-lifecycle">{event.status === 'draft' && <button className="primary" disabled={busy || stale || Date.parse(event.config.deadline) <= data.sampledAt} onClick={() => onAction({ action: 'open' })}>Mở nhận bài</button>}{phaseCanFreeze && <button className="primary" disabled={busy || stale || !data.preflight.canFreeze} onClick={() => setConfirmFreeze(true)}>Rà soát & khóa bài</button>}{!['review', 'published'].includes(event.status) && <button disabled={busy || stale} onClick={() => onAction({ action: 'pause' })}>{event.paused ? 'Tiếp tục chấm' : 'Tạm dừng chấm mới'}</button>}{event.status === 'review' && <button className="primary" disabled={busy || stale} onClick={() => onAction({ action: 'publish' })}>Công bố kết quả</button>}<a href={`/api/competition?event=${event.id}&export=1`} download>Xuất dữ liệu giải</a></div>
        {confirmFreeze && <div className="ops-confirm" role="region" aria-label="Xác nhận khóa bài"><h4>Chốt {n(data.preflight.eligibleTeams)} đội dự thi?</h4><p>Hệ thống giữ cố định phiên bản và tạo khoảng {n(data.preflight.expectedGroupGames || 0)} ván vòng bảng. {n(s.rosterTeams - data.preflight.eligibleTeams)} đội chưa đủ điều kiện sẽ không có trong lịch.</p><div className="tc-actions"><button className="primary" disabled={busy || stale || !data.preflight.canFreeze} onClick={async () => { const result = await onAction({ action: 'freeze' }); if (result) setConfirmFreeze(false); }}>Xác nhận khóa & chia bảng</button><button disabled={busy} onClick={() => setConfirmFreeze(false)}>Quay lại rà soát</button></div></div>}
      </section>
    </div>
    <section className="ops-section"><div className="ops-section-head"><div><h3><AlertTriangle size={18} /> Việc cần xử lý</h3><p>Lỗi hạ tầng có thể thử lại; bot lỗi là kết quả theo thể lệ, không tự chấm lại.</p></div>{!infrastructureCount && !s.latestInvalidTeams && !data.issues.botGameCount && <span className="ops-pill good">Chưa có sự cố được ghi nhận</span>}</div>
      <div className="ops-tabs" role="group" aria-label="Loại sự cố">{[['infra', `Hạ tầng (${n(infrastructureCount)})`], ['invalid', `Bài chưa hợp lệ (${n(s.latestInvalidTeams)})`], ['bot', `Ván bot lỗi (${n(data.issues.botGameCount)})`]].map(([id, label]) => <button key={id} aria-pressed={issueTab === id} onClick={() => setIssueTab(id)}>{label}</button>)}</div>
      {issueTab === 'infra' && <div className="ops-issue-list">{data.issues.infrastructure.length ? data.issues.infrastructure.map(j => <article key={j.id}><div><strong>{j.label}</strong><p>{j.kind === 'validate' ? 'Kiểm tra bài' : 'Chấm ván'} · {j.attempts} lần nhận việc · {j.status === 'running' ? 'Hết hạn giữ job; worker sẽ thu hồi khi lấy việc tiếp.' : 'Đã dừng sau lỗi hạ tầng hoặc không khớp phiên bản. Kiểm tra bộ chấm trước khi thử lại.'}</p><code>{j.id}</code></div>{j.status === 'failed' && <button disabled={busy || stale || ['review', 'published'].includes(event.status)} onClick={() => onAction({ action: 'retry', job: j.id })}>Thử lại job</button>}</article>) : <p>Không có job hạ tầng thất bại hoặc hết hạn giữ việc.</p>}</div>}
      {issueTab === 'invalid' && <div className="ops-issue-list">{data.issues.invalid.length ? data.issues.invalid.map(s => <article key={s.id}><div><strong>{s.label}</strong><p>{s.verdict || 'Chưa vượt qua kiểm tra bot.'}</p><small>Phiên bản mới nhất · {stamp(s.created)}</small></div><span className="ops-pill bad">Cần sinh viên sửa</span></article>) : <p>Không có đội có phiên bản mới nhất bị từ chối.</p>}</div>}
      {issueTab === 'bot' && <div className="ops-issue-list">{data.issues.botGames.length ? data.issues.botGames.map(g => <article key={g.id}><div><strong>{g.p1} — {g.p2}</strong><p>{faultLabels[g.reason] || g.reason}. Kết quả đã được ghi theo luật.</p></div><button onClick={() => onReplay(g.id)}>Xem replay</button></article>) : <p>Chưa ghi nhận ván kết thúc do lỗi bot.</p>}</div>}
      <p className="ops-note">Mỗi nhóm hiển thị tối đa 25 mục; số ở nhãn là tổng của giải.</p>
    </section>
    <section className="ops-section"><h3>Nhật ký điều hành gần đây</h3>{data.audit.length ? <ol className="ops-audit">{data.audit.map(a => <li key={a.id}><time>{stamp(a.created)}</time><strong>{actions[a.action] || a.action}</strong><code>{a.actor}</code></li>)}</ol> : <p>Chưa có thao tác được ghi nhận.</p>}<p className="ops-note">20 thao tác gần nhất · {n(queued)} công việc đang chờ hoặc đang chạy.</p></section>
  </div>;
}
