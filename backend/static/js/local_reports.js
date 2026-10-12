// Báo cáo giảng viên tính NGAY TRONG TRÌNH DUYỆT (bản tĩnh, GitHub Pages): bản dịch của backend/reports.py
// (summarize, detail, summary, export_csv) và backend/runtime.py (import_result).
// Đầu vào là tệp kết quả sinh viên tải về; nhật ký thao tác được chấm lại bằng engine.js (replayLog), không tin
// điểm ghi sẵn trong tệp. tests/test_local_reports.py so kết quả với bản máy chủ trên hàng trăm tệp ngẫu nhiên.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ROBO_REPORTS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const FORMAT = 'robo-or-sim-result/1';
const fmtG = v => String(Number(Number(v).toPrecision(6)));          // f"{v:g}"
const pyFloat = x => typeof x === 'number' && Number.isInteger(x) ? x.toFixed(1) : String(x);   // str(float) của Python
const isInt = v => typeof v === 'number' && Number.isInteger(v);

class ImportError extends Error {}

/* Kiểm tra tệp như ImportIn (runtime.py) */
function validateFile(d, SC) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new ImportError('không phải tệp kết quả');
  if (d.format !== FORMAT) throw new ImportError('không phải tệp kết quả của hệ thống');
  const sc = SC[d.scenario_id];
  if (!sc) throw new ImportError('Không có kịch bản này');
  if (typeof d.learner !== 'string' || d.learner.length < 1 || d.learner.length > 40) throw new ImportError('Mã học viên không hợp lệ');
  if (typeof d.role !== 'string' || !sc.roles.includes(d.role)) throw new ImportError(`Vai trò phải thuộc ${sc.roles.join(', ')}`);
  if (d.case_id !== undefined && d.case_id !== null && !(sc.cases || []).some(c => c.id === d.case_id)) throw new ImportError('Không có ca bệnh này');
  if (!Array.isArray(d.log) || d.log.length > 2000) throw new ImportError('Nhật ký thao tác sai định dạng hoặc quá dài');
  const qa = d.quiz_answers === undefined ? {} : d.quiz_answers;
  if (!qa || typeof qa !== 'object' || Array.isArray(qa) || Object.values(qa).some(v => !isInt(v))) throw new ImportError('Câu trả lời sai định dạng');
  return sc;
}

/* Một buổi: chạy lại nhật ký, dựng danh sách "câu lệnh" theo đúng thứ tự và nội dung máy chủ ghi xAPI */
function build(E, sc, d, reg) {
  validateFile(d, {[sc.id]: sc});
  let s;
  try { s = E.replayLog(sc, d.case_id ?? null, d.role, d.learner, d.log, d.t_end); }
  catch (e) { throw new ImportError(`Tệp kết quả không hợp lệ: ${e.message}`); }
  const res = s.result, title = id => { const st = sc.steps.find(x => x.id === id); return st ? st.title : id; };
  const started = Date.parse(d.started_at || '');
  const t0 = isNaN(started) ? Date.now() : started;
  const ts = t => new Date(t0 + Math.round(t * 1000)).toISOString();
  const st = sc.roles.map(r => ({t: 0, verb: 'initialized', role: r, actor: s.who(r), title: sc.title, step_id: null}));
  for (const [ev, fb] of s.events) {
    if (fb.step_completed) st.push({t: ev.t, verb: 'completed', step_id: fb.step_completed, title: title(fb.step_completed),
      role: ev.role, actor: s.who(ev.role)});
    if (fb.issue) { const i = fb.issue;
      st.push({t: ev.t, verb: 'erred', step_id: i.ref || null, title: i.ref ? title(i.ref) : sc.title, role: ev.role,
        actor: s.who(ev.role), message: i.message, severity: i.severity, kind: i.kind}); }
  }
  st.push({t: res.duration_s, verb: res.passed ? 'passed' : 'failed', step_id: null, title: sc.title, role: null, actor: s.team});
  st.push({t: res.duration_s, verb: 'terminated', step_id: null, title: sc.title, role: null, actor: s.team});
  const qa = d.quiz_answers || {};
  let graded = null;
  if (sc.quiz.length && Object.keys(qa).length) {
    graded = s.gradeQuiz(qa);
    st.push({t: res.duration_s, verb: 'answered', step_id: null, title: 'Câu hỏi kiến thức', role: null, actor: s.who(s.role)});
  }
  st.sort((a, b) => a.t - b.t);                       // ổn định: cùng thời điểm giữ thứ tự ghi
  const caseObj = sc.cases.length && s.case_id ? sc.cases.find(c => c.id === s.case_id) : null;
  const errors = st.filter(x => x.verb === 'erred').map(x => ({step: x.title, step_id: x.step_id, message: x.message,
    severity: x.severity, kind: x.kind, role: x.role, at: ts(x.t)}));
  const summary = {registration: reg, scenario: `${sc.id}/${sc.version}`, scenario_title: sc.title, team: s.team, module: sc.module,
    case: s.case_id, case_title: caseObj ? caseObj.title : null, started: ts(0), finished: true, passed: res.passed,
    score: res.score, duration: `PT${fmtG(res.duration_s)}S`, missed_critical: res.missed_critical.slice(),
    critical_errors: res.critical_errors, quiz: graded ? {correct: graded.correct, total: graded.total} : null, errors};
  const timeline = st.filter(x => x.verb !== 'initialized').map(x => ({t: E.pyRound(x.t, 1), verb: x.verb, step_id: x.step_id,
    title: x.title, role: x.role, actor: x.actor, message: x.message ?? null, severity: x.severity ?? null, kind: x.kind ?? null}));
  const eng = new E.Engine(sc, summary.case);
  const doneAt = {}; timeline.forEach(e => { if (e.verb === 'completed') doneAt[e.step_id] = e; });
  const errs = {}; errors.forEach(e => { if (e.step_id) (errs[e.step_id] = errs[e.step_id] || []).push(e); });
  const steps = sc.steps.map(x => { const dn = doneAt[x.id];
    return {id: x.id, title: x.title, phase: x.phase, roles: x.roles.slice(), critical: x.critical, required: eng.required.has(x.id),
      done: !!dn, t: dn ? dn.t : null, by_role: dn ? dn.role : null, errors: (errs[x.id] || []).map(e => e.message), src: x.src}; });
  const phases = (sc.phases.length ? sc.phases : [{id: null, title: 'Toàn bộ'}]).map(ph => {
    const ps = steps.filter(x => x.required && (!sc.phases.length || x.phase === ph.id));
    return {id: ph.id, title: ph.title, required: ps.length, done: ps.filter(x => x.done).length,
      missed_critical: ps.filter(x => x.critical && !x.done).map(x => x.id), errors: ps.reduce((n, x) => n + x.errors.length, 0)}; });
  const qmap = Object.fromEntries(sc.quiz.map(q => [q.id, q]));
  const quiz_items = graded ? graded.items.map(it => { const q = qmap[it.id];
    return {id: it.id, q: q.q, correct: it.correct, chosen: isInt(it.chosen) && it.chosen >= 0 && it.chosen < q.options.length ? q.options[it.chosen] : null,
      answer: q.options[q.answer]}; }) : [];
  const detail = {...summary, case_summary: caseObj ? (caseObj.summary ?? null) : null, timeline, steps, phases, quiz_items,
    rubric: sc.rubric.slice(), source: sc.source};
  return {summary, detail, result: res, quiz: graded};
}

function mostCommon(counts, n) {
  const arr = [...counts.entries()];
  arr.sort((a, b) => b[1] - a[1]);                    // ổn định như Counter.most_common
  return (n ? arr.slice(0, n) : arr).map(([k, v]) => [k, v]);
}
const r1 = (x, nd, E) => E.pyRound(x, nd);

/* summary() của reports.py */
// all_sessions() của máy chủ: mới nhất trước (thứ tự này quyết định cả thứ tự các lỗi bằng số lần trong tổng hợp)
const byStartedDesc = sessions => sessions.slice().sort((a, b) => (Date.parse(b.started) || 0) - (Date.parse(a.started) || 0));

function summarize(E, SC, sessions, scenario) {
  const ss = byStartedDesc(sessions).filter(s => !scenario || s.scenario.startsWith(scenario));
  const done = ss.filter(s => s.finished);
  const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  const kinds = new Map(), msgs = new Map(), roles = new Map(), phaseErr = new Map();
  ss.forEach(s => s.errors.forEach(e => { inc(kinds, e.kind); inc(msgs, e.message); if (e.role) inc(roles, e.role); }));
  ss.forEach(s => {
    const sc = SC[s.scenario.split('/')[0]];
    if (!sc || !sc.phases.length) return;
    const titles = Object.fromEntries(sc.phases.map(p => [p.id, p.title]));
    const ph = id => { const st = sc.steps.find(x => x.id === id); return st ? (titles[st.phase] ?? 'Khác') : null; };
    s.errors.forEach(e => { if (e.step_id) { const p = ph(e.step_id); if (p !== null) inc(phaseErr, p); } });
    s.missed_critical.forEach(m => { const p = ph(m); if (p !== null) inc(phaseErr, p); });
  });
  const quizzes = ss.map(s => s.quiz).filter(Boolean);
  const qTot = quizzes.reduce((n, q) => n + q.total, 0);
  return {sessions: ss.length, finished: done.length,
    pass_rate: done.length ? r1(done.filter(s => s.passed).length / done.length, 3, E) : null,
    mean_score: done.length ? r1(done.reduce((n, s) => n + s.score, 0) / done.length, 1, E) : null,
    quiz_mean: quizzes.length && qTot ? r1(100 * quizzes.reduce((n, q) => n + q.correct, 0) / qTot, 1, E) : null,
    assessed: ss.filter(s => s.assessment).length,
    errors_by_kind: mostCommon(kinds), top_errors: mostCommon(msgs, 10), errors_by_role: mostCommon(roles),
    errors_by_phase: mostCommon(phaseErr)};
}

/* export_csv() của reports.py */
function csv(sessions) {
  const q = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [['registration', 'bat_dau', 'nhom_hoc_vien', 'kich_ban', 'ca_benh', 'diem_quy_trinh', 'ket_qua', 'thoi_gian', 'so_loi',
    'loi_nghiem_trong', 'bo_sot_buoc_then_chot', 'cau_hoi_dung', 'cau_hoi_tong', 'giang_vien', 'danh_gia_gv', 'diem_tb_tieu_chi']];
  byStartedDesc(sessions).forEach(s => { const a = s.assessment || {}, z = s.quiz || {};
    rows.push([s.registration, s.started, s.team, s.scenario, s.case || '', pyFloat(s.score),
      s.passed === null || s.passed === undefined ? '' : (s.passed ? 'Đạt' : 'Không đạt'), s.duration || '', s.errors.length,
      s.critical_errors || 0, s.missed_critical.join('; '), z.correct ?? '', z.total ?? '', a.assessor ?? '', a.overall ?? '',
      a.mean_rating === null || a.mean_rating === undefined ? '' : pyFloat(a.mean_rating)]); });
  return '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
}

/* mã buổi ổn định theo nội dung tệp: nhập lại cùng một tệp không tạo buổi trùng */
function fileKey(d) {
  const s = JSON.stringify([d.scenario_id, d.case_id ?? null, d.role, d.learner, d.started_at ?? null, d.log, d.t_end ?? null, d.quiz_answers || {}]);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'local-' + (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

return {FORMAT, ImportError, validateFile, build, summarize, csv, fileKey, byStartedDesc};
});
