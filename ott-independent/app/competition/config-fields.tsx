'use client';
type Config = { groupCount: number; qualifiers: number; deadline: string; seed: number; maxPlies: number; moveMs: number; startupMs: number; memoryMB: number; extraSets: number };
const fields = [
  ['groupCount', 'Số bảng', 1, 128, 'Mỗi bảng cần 2–32 đội.'],
  ['qualifiers', 'Đội đi tiếp mỗi bảng', 1, 4, 'Tổng số đội đi tiếp phải là lũy thừa của 2.'],
  ['maxPlies', 'Số nước tối đa mỗi ván', 20, 200, 'Hòa khi đạt giới hạn mà chưa phân thắng bại.'],
  ['moveMs', 'Thời gian mỗi nước (ms)', 100, 5000, '2.000 ms tương đương 2 giây.'],
  ['startupMs', 'Thời gian khởi động bot (ms)', 1000, 15000, 'Giới hạn thời gian nạp bot.'],
  ['memoryMB', 'Bộ nhớ mỗi bot (MiB)', 64, 256, 'Giới hạn bộ nhớ WebAssembly.'],
  ['extraSets', 'Cặp phụ tối đa khi hòa', 0, 2, 'Áp dụng ở vòng loại trực tiếp.'],
  ['seed', 'Hạt giống chia bảng', 1, 2147483647, 'Giữ cố định khi khóa danh sách.'],
] as const;
export default function ConfigFields({ text, onChange, status }: { text: string; onChange: (value: string) => void; status?: string }) {
  let config: Config;
  try { config = JSON.parse(text); if (!config || typeof config !== 'object') throw new Error(); }
  catch { return <p className="ops-inline-warning">Cấu hình JSON chưa hợp lệ. Mở phần nâng cao để sửa hoặc nạp lại cấu hình.</p>; }
  const update = (key: keyof Config, value: number | string) => onChange(JSON.stringify({ ...config, [key]: value }, null, 2));
  const frozen = !!status && !['draft', 'open'].includes(status), rulesLocked = !!status && status !== 'draft';
  const date = new Date(config.deadline);
  const local = Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  return <div className="ops-config-fields"><label>Hạn nộp bài (giờ trên thiết bị)<input type="datetime-local" value={local} disabled={frozen} onChange={e => { const d = new Date(e.target.value); if (Number.isFinite(d.getTime())) update('deadline', d.toISOString()); }} /><small>Thời điểm lưu: {Number.isFinite(date.getTime()) ? date.toLocaleString('vi-VN') : 'Chưa hợp lệ'}</small></label><div><label>Thể thức<input value="Chia bảng → loại trực tiếp" disabled /></label><small>Vòng sơ loại đấu bot chuẩn BTC sẽ được bổ sung riêng; chưa có cấu hình bot chuẩn hoặc top N trong thể thức này.</small></div>{fields.map(([key, label, min, max, hint]) => <label key={key}>{label}<input type="number" min={min} max={max} step={1} disabled={rulesLocked} value={Number.isFinite(config[key]) ? config[key] : ''} onChange={e => update(key, e.target.value === '' ? 0 : Number(e.target.value))} /><small>{hint}</small></label>)}<p className="ops-note">{rulesLocked ? 'Đã mở nhận bài: chỉ được sửa hạn nộp trước khi khóa.' : `Dự kiến chọn ${(config.groupCount || 0) * (config.qualifiers || 0)} đội vào vòng loại trực tiếp.`}</p></div>;
}
