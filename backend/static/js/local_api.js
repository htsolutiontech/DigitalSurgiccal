// Bảng điều khiển giảng viên BẢN TĨNH (GitHub Pages, không có máy chủ).
// Thay các lời gọi /api/... của dashboard.js, session.js, video_markers.js bằng bản chạy trong trình duyệt:
// tệp kết quả sinh viên nộp được chấm lại bằng engine.js (local_reports.js), phiếu đánh giá và mốc video lưu
// trong trình duyệt này (localStorage). Không có máy chủ nên KHÔNG có dữ liệu chung giữa các máy: dùng
// "Xuất sao lưu" / "Nhập sao lưu" để chuyển hoặc gộp dữ liệu giữa giảng viên.
(function () {
'use strict';
const E = window.SIMENGINE, R = window.ROBO_REPORTS;
const KEY = 'robo.giangvien.v1';
const BASE = new URL('../', location.href);              // gốc site (trang giảng viên nằm trong /giang-vien/)
const realFetch = window.fetch.bind(window);

/* ---------- lưu trữ ---------- */
const empty = () => ({v: 1, files: {}, assessments: [], markers: {}});
function load() {
  try { const x = JSON.parse(localStorage.getItem(KEY) || 'null'); if (x && x.v === 1) return Object.assign(empty(), x); } catch (e) { /* hỏng hoặc bị chặn */ }
  return empty();
}
let DB = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(DB)); }
  catch (e) { throw new Error('Trình duyệt không cho lưu thêm (hết dung lượng, chế độ ẩn danh hoặc bị chặn lưu trữ). Hãy Xuất sao lưu rồi dọn bớt.'); }
}
window.addEventListener('storage', e => { if (e.key === KEY) { DB = load(); CACHE.clear(); } });   // tab khác vừa ghi

/* ---------- kịch bản (đủ đáp án, từ bản dựng tĩnh) ---------- */
let SC = null, RAW = null;
async function scenarios() {
  if (SC) return SC;
  const r = await realFetch(new URL('data/scenarios.json', BASE));
  if (!r.ok) throw new Error('Không tải được kịch bản (data/scenarios.json)');
  RAW = await r.json(); SC = {};
  RAW.forEach(raw => { const sc = E.loadScenario(raw); SC[sc.id] = sc; });
  return SC;
}

/* ---------- buổi: chấm lại từ tệp, giữ kết quả trong bộ nhớ ---------- */
const CACHE = new Map();
function record(reg) {
  if (CACHE.has(reg)) return CACHE.get(reg);
  const f = DB.files[reg]; if (!f) return null;
  let rec;
  try { const sc = R.validateFile(f.file, SC); rec = R.build(E, sc, f.file, reg); }
  catch (e) { rec = {error: e.message}; }                  // ví dụ kịch bản đã đổi sau khi nhập
  CACHE.set(reg, rec); return rec;
}
function latestAssessment(reg) {
  const a = DB.assessments.filter(x => x.registration === reg);
  return a.length ? a[a.length - 1] : null;
}
function sessions() {
  const out = [];
  for (const reg of Object.keys(DB.files)) {
    const rec = record(reg); if (!rec || rec.error) continue;
    const a = latestAssessment(reg);
    out.push({...rec.summary, assessment: a ? {assessor: a.assessor, overall: a.overall, mean_rating: a.mean_rating} : null});
  }
  return R.byStartedDesc(out);
}
function importFile(d) {
  const sc = R.validateFile(d, SC);
  const reg = R.fileKey(d);
  if (DB.files[reg]) return {registration: reg, duplicate: true, ...pick(record(reg))};
  const rec = R.build(E, sc, d, reg);                      // chấm lại; tệp không hợp lệ dừng ở đây
  const file = {format: d.format, scenario_id: d.scenario_id, case_id: d.case_id ?? null, role: d.role, learner: d.learner,
    started_at: d.started_at ?? null, log: d.log, t_end: d.t_end ?? null, quiz_answers: d.quiz_answers || {}};
  DB.files[reg] = {file, imported_at: new Date().toISOString()};
  try { save(); } catch (e) { delete DB.files[reg]; throw e; }
  CACHE.set(reg, rec);
  return {registration: reg, ...pick(rec)};
}
const pick = rec => ({result: rec.result ? {score: rec.result.score, passed: rec.result.passed} : null, quiz: rec.quiz || null});

/* ---------- mốc video ---------- */
async function media(sid) {
  if (!SC[sid]) throw httpErr(404, 'Không có kịch bản này');
  let list = [];
  try { const r = await realFetch(new URL(`data/media/${sid}.json`, BASE)); if (r.ok) list = await r.json(); } catch (e) { /* không có video */ }
  return list.map(v => { const m = DB.markers[`${sid}__${v.key}`] || v.markers || {};
    return {...v, markers: m, marked_steps: Object.keys(m).length, total_steps: SC[sid].steps.length}; });
}
function checkMarker(b) {
  const num = x => typeof x === 'number' && isFinite(x);
  if (!b || !num(b.start) || !num(b.end) || b.start < 0 || b.end <= 0) throw httpErr(422, 'Đầu đoạn, cuối đoạn phải là số không âm');
  if (b.end <= b.start) throw httpErr(422, 'Cuối đoạn phải sau đầu đoạn');
  return {start: b.start, end: b.end, note: String(b.note || '').slice(0, 1000), differs: !!b.differs, author: String(b.author || '').slice(0, 60)};
}

/* ---------- định tuyến /api/... ---------- */
const httpErr = (status, detail) => Object.assign(new Error(detail), {status});
const json = (x, status = 200) => new Response(JSON.stringify(x), {status, headers: {'Content-Type': 'application/json'}});
async function route(method, path, query, body) {
  await scenarios();
  let m;
  if (method === 'GET' && path === '/api/sessions') return sessions();
  if (method === 'GET' && path === '/api/summary') return R.summarize(E, SC, sessions(), query.get('scenario'));
  if (method === 'GET' && (m = path.match(/^\/api\/session\/([^/]+)$/))) {
    const reg = decodeURIComponent(m[1]), rec = record(reg);
    if (!rec) throw httpErr(404, 'Không có buổi này');
    if (rec.error) throw httpErr(409, rec.error);
    return {...rec.detail, assessments: DB.assessments.filter(a => a.registration === reg)};
  }
  if (method === 'POST' && path === '/api/assessments') {
    if (!body || !DB.files[body.registration]) throw httpErr(404, 'Không có buổi này');
    const assessor = String(body.assessor || '').trim();
    if (!assessor || assessor.length > 60) throw httpErr(422, 'Nhập tên giảng viên (tối đa 60 ký tự)');
    if (!['dat', 'chua_dat', 'can_lam_lai'].includes(body.overall)) throw httpErr(422, 'Kết luận không hợp lệ');
    const ratings = body.ratings || {};
    if (Object.values(ratings).some(v => !Number.isInteger(v) || v < 1 || v > 5)) throw httpErr(400, 'Điểm mỗi tiêu chí từ 1 đến 5');
    const vals = Object.values(ratings);
    const rec = {id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()), registration: body.registration,
      assessor, ratings, overall: body.overall, comment: String(body.comment || '').slice(0, 2000), account: null,
      created: new Date().toISOString(), mean_rating: vals.length ? E.pyRound(vals.reduce((a, b) => a + b, 0) / vals.length, 2) : null};
    DB.assessments.push(rec);
    try { save(); } catch (e) { DB.assessments.pop(); throw e; }
    return rec;
  }
  if (method === 'POST' && path === '/api/results/import') {
    try { return importFile(body); } catch (e) { throw httpErr(422, e.message); }
  }
  if (method === 'GET' && path === '/api/scenarios') return RAW.map(raw => E.publicScenario(SC[raw.id], null, false));
  if ((m = path.match(/^\/api\/media\/([^/]+)$/)) && method === 'GET') return media(decodeURIComponent(m[1]));
  if ((m = path.match(/^\/api\/media\/([^/]+)\/([^/]+)\/(markers\/([^/]+)|import|export)$/))) {
    const sid = decodeURIComponent(m[1]), key = decodeURIComponent(m[2]), k = `${sid}__${key}`;
    const v = (await media(sid)).find(x => x.key === key);
    if (!v) throw httpErr(404, 'Không có video này cho kịch bản');
    const cur = {...v.markers};
    if (m[3] === 'export' && method === 'GET') return {scenario: sid, video: key, source_url: v.source_url, markers: cur};
    if (m[3] === 'import' && method === 'POST') {
      const ms = (body && body.markers) || {}, valid = new Set(SC[sid].steps.map(s => s.id));
      const bad = Object.keys(ms).filter(s => !valid.has(s));
      if (bad.length) throw httpErr(400, `Bước không tồn tại: ${bad.join(', ')}`);
      const next = body.replace ? {} : cur, now = new Date().toISOString();
      for (const [st, mk] of Object.entries(ms)) next[st] = {...checkMarker(mk), updated: now};
      DB.markers[k] = next; save();
      return {imported: Object.keys(ms).length};
    }
    const step = m[4] && decodeURIComponent(m[4]);
    if (step && !SC[sid].steps.some(s => s.id === step)) throw httpErr(404, 'Không có bước này');
    if (step && method === 'PUT') { const rec = {...checkMarker(body), updated: new Date().toISOString()}; cur[step] = rec; DB.markers[k] = cur; save(); return rec; }
    if (step && method === 'DELETE') { delete cur[step]; DB.markers[k] = cur; save(); return {ok: true}; }
  }
  throw httpErr(404, 'Bản tĩnh không có chức năng này');
}

window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);
  const method = (init.method || 'GET').toUpperCase();
  let body = null;
  try { body = init.body ? JSON.parse(init.body) : null; } catch (e) { return json({detail: 'Dữ liệu gửi lên không phải JSON'}, 400); }
  try { return json(await route(method, url.pathname, url.searchParams, body)); }
  catch (e) { return json({detail: e.message}, e.status || 500); }
};

/* ---------- sao lưu, xuất CSV, khung thông báo trên trang ---------- */
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
function exportBackup() { download(`robo-or-sim_giang-vien_${stamp()}.json`, JSON.stringify({format: 'robo-or-sim-backup/1', ...DB}), 'application/json'); }
async function importBackup(file) {
  const d = JSON.parse(await file.text());
  if (!d || d.format !== 'robo-or-sim-backup/1' || typeof d.files !== 'object') throw new Error('Không phải tệp sao lưu của bảng điều khiển');
  await scenarios();
  let nf = 0, na = 0, bad = 0;
  for (const [reg, f] of Object.entries(d.files || {})) {          // chấm lại từng tệp, không tin dữ liệu sao lưu
    if (DB.files[reg]) continue;
    try { const sc = R.validateFile(f.file, SC); R.build(E, sc, f.file, reg); if (R.fileKey(f.file) !== reg) throw new Error('mã buổi không khớp');
      DB.files[reg] = {file: f.file, imported_at: f.imported_at || new Date().toISOString()}; nf++; } catch (e) { bad++; }
  }
  const have = new Set(DB.assessments.map(a => a.id));
  for (const a of d.assessments || []) if (a && a.id && !have.has(a.id) && DB.files[a.registration]) { DB.assessments.push(a); na++; }
  for (const [k, v] of Object.entries(d.markers || {})) if (!DB.markers[k]) DB.markers[k] = v;
  save(); CACHE.clear();
  return `Đã gộp ${nf} buổi, ${na} phiếu đánh giá` + (bad ? `; bỏ qua ${bad} buổi không hợp lệ` : '') + '.';
}

function banner() {
  const wrap = document.querySelector('.wrap'); if (!wrap) return;
  const box = document.createElement('div');
  box.className = 'static-note';
  box.style.cssText = 'border:1px solid var(--line);border-left:4px solid var(--warn,#9A5B00);border-radius:8px;padding:10px 14px;margin:10px 0 14px;background:var(--surface);font-size:14px';
  const p = document.createElement('p'); p.style.margin = '0 0 6px';
  p.textContent = 'Bản tĩnh (không có máy chủ): dữ liệu chỉ nằm trong trình duyệt này, trên máy này. Giảng viên khác không thấy, xoá dữ liệu trình duyệt là mất. Sau mỗi buổi chấm, bấm Xuất sao lưu và cất tệp ở nơi an toàn.';
  box.append(p);
  const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;align-items:center';
  const mk = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', fn); row.append(b); return b; };
  const msg = document.createElement('span'); msg.style.color = 'var(--muted)';
  mk('Xuất sao lưu', () => { exportBackup(); msg.textContent = `Đã xuất ${Object.keys(DB.files).length} buổi.`; });
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.hidden = true;
  inp.addEventListener('change', async () => { try { msg.textContent = await importBackup(inp.files[0]); document.getElementById('reload')?.click(); } catch (e) { msg.textContent = 'Không nhập được: ' + e.message; } inp.value = ''; });
  mk('Nhập sao lưu (gộp)', () => inp.click());
  mk('Xoá dữ liệu trên máy này', () => {
    if (!confirm('Xoá toàn bộ buổi, phiếu đánh giá và mốc video lưu trong trình duyệt này? Nên Xuất sao lưu trước.')) return;
    DB = empty(); save(); CACHE.clear(); msg.textContent = 'Đã xoá.'; document.getElementById('reload')?.click(); });
  row.append(inp, msg); box.append(row);
  const h1 = wrap.querySelector('h1'); (h1 ? h1.nextElementSibling || h1 : wrap.firstChild).after(box);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.server-only').forEach(e => e.remove());   // theo dõi trực tiếp cần máy chủ
  // xuất CSV: tạo tệp ngay trên máy thay cho đường dẫn /api/export.csv
  document.querySelectorAll('a[href$="api/export.csv"]').forEach(a => a.addEventListener('click', async ev => {
    ev.preventDefault(); await scenarios(); download('ket_qua_mo_phong.csv', R.csv(sessions()), 'text/csv;charset=utf-8'); }));
  if (document.getElementById('sessions')) banner();
  const form = document.getElementById('form');
  if (form) { const p = document.createElement('p'); p.className = 'hint';
    p.textContent = 'Bản tĩnh: phiếu đánh giá lưu trong trình duyệt này. Nhớ bấm Xuất sao lưu ở bảng điều khiển.'; form.append(p); }
});

window.ROBO_LOCAL = {exportBackup, importBackup, get count() { return Object.keys(DB.files).length; }};
})();
