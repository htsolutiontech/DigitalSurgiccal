// Bộ chấm mô phỏng chạy trong trình duyệt: bản dịch 1-1 của simcore/scenario.py, engine.py, sterile.py,
// session.py. Máy chủ (nếu có) chạy lại nhật ký thao tác bằng bản Python để ra điểm chính thức;
// tests/test_parity.py kiểm tra hai bản cho cùng kết quả. Sửa logic chấm thì sửa CẢ HAI bản.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SIMENGINE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const CRITICAL = 'critical', MAJOR = 'major', MINOR = 'minor';
const FREE_ACTIONS = ['position', 'contact'];
const SCORING_DEFAULT = {critical_miss: 25, critical_error: 20, out_of_order: 5, wrong_role: 3, wrong_decision: 8,
  wrong_position: 4, not_indicated: 4, over_time_per_10s: 0, pass_threshold: 70, fail_on_any_critical_error: true};

/* ---------- làm tròn giống hệt round() của Python (nửa về số chẵn, trên giá trị nhị phân chính xác) ---------- */
function pyRound(x, nd) {
  if (!isFinite(x) || x === 0) return x;
  const neg = x < 0, s = Math.abs(x).toFixed(100);
  const [ip, fp] = s.split('.');
  const keep = fp.slice(0, nd), rest = fp.slice(nd);
  const digits = (ip + keep).split('').map(Number);
  const first = rest.charCodeAt(0) - 48, tail = /[1-9]/.test(rest.slice(1));
  let up = first > 5 || (first === 5 && (tail || digits[digits.length - 1] % 2 === 1));
  if (up) { let i = digits.length - 1; while (i >= 0) { if (digits[i] === 9) { digits[i] = 0; i--; } else { digits[i]++; break; } } if (i < 0) digits.unshift(1); }
  const str = digits.join(''), cut = str.length - nd;
  const v = Number(nd ? str.slice(0, cut) + '.' + str.slice(cut) : str);
  return neg ? -v : v;
}
const fmtG = v => String(Number(v));          // f"{v:g}" cho các số thời lượng thông thường
const sortStr = a => a.slice().sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));

/* ---------- kịch bản (scenario.py) ---------- */
const OPS = {'==': (a, b) => a === b, '!=': (a, b) => a !== b, '>=': (a, b) => a >= b, '>': (a, b) => a > b,
  '<=': (a, b) => a <= b, '<': (a, b) => a < b};
function evalCond(cond, facts) {
  if (!cond) return true;
  if (!(cond.fact in facts)) return false;
  return OPS[cond.op](facts[cond.fact], cond.value);
}
function loadScenario(raw) {
  const sf = raw.sterile_field || {};
  const steps = raw.steps.map(s => ({id: s.id, title: s.title, roles: s.roles.slice(), action: s.action,
    after: (s.after || []).slice(), critical: !!s.critical, target: s.target ?? null, targets: (s.targets || []).slice(),
    min_duration_s: s.min_duration_s ?? null, phase: s.phase ?? null, note: s.note ?? null, src: s.src ?? null,
    required_if: s.required_if || null, indicated_if: s.indicated_if || null, decision: s.decision || null,
    area: s.area ? s.area.slice() : null, area_label: s.area_label ?? null}));
  return {id: raw.id, version: raw.version, module: Number(raw.module), title: raw.title, roles: raw.roles.slice(), steps,
    rules: (raw.rules || []).map(r => ({id: r.id, action: r.action, if_state: r.if_state, severity: r.severity, message: r.message})),
    time_limit_s: raw.time_limit_s ?? null, initial_state: raw.initial_state || {},
    zones: (sf.zones || []).map(z => ({id: z.id, label: z.label, min: z.min.slice(), max: z.max.slice()})),
    min_observer_distance_m: sf.min_observer_distance_m ?? null, scoring: Object.assign({}, SCORING_DEFAULT, raw.scoring || {}),
    approval_status: (raw.approval || {}).status || 'draft', phases: raw.phases || [], cases: raw.cases || [],
    quiz: raw.quiz || [], rubric: raw.rubric || [], source: raw.source || null};
}
function scCase(sc, caseId) {
  if (!sc.cases.length) return null;
  const c = sc.cases.find(c => c.id === caseId);
  if (c) return c;
  if (caseId === null || caseId === undefined) return sc.cases[0];
  throw new Error('Không có ca bệnh này');
}
const scStep = (sc, id) => { const s = sc.steps.find(s => s.id === id); if (!s) throw new Error(id); return s; };

/* ---------- vùng vô khuẩn (sterile.py) ---------- */
const inside = (p, z) => [0, 1, 2].every(i => z.min[i] <= p[i] && p[i] <= z.max[i]);
function distance(p, z) {
  let d2 = 0;
  for (let i = 0; i < 3; i++) {
    if (p[i] < z.min[i]) { const d = z.min[i] - p[i]; d2 += d * d; }
    else if (p[i] > z.max[i]) { const d = p[i] - z.max[i]; d2 += d * d; }
  }
  return Math.sqrt(d2);
}

/* ---------- bộ chấm (engine.py) ---------- */
class Engine {
  constructor(sc, caseId) {
    this.sc = sc; this.case = scCase(sc, caseId); this.facts = (this.case || {}).facts || {};
    this.required = new Set(sc.steps.filter(s => evalCond(s.required_if, this.facts)).map(s => s.id));
    this.done = new Map(); this.partial = new Map(); this.issues = []; this.finished = false; this.last_t = 0;
    const st = sc.initial_state;
    this.docked = new Set(st.docked_arms || []); this.instruments_in = new Set(st.instruments_in || []);
    this.camera_in = !!st.camera_in; this.cart_at_table = !!st.cart_at_table; this.lastClose = new Map();
  }
  correctAnswer(step) { const d = step.decision || {}; return 'answer' in d ? d.answer : (this.facts[d.answer_fact] ?? null); }
  stateTrue(name, target) {
    if (name === 'any_arm_docked') return this.docked.size > 0;
    if (name === 'target_has_instrument') return target === 'camera' ? this.camera_in : this.instruments_in.has(target);
    return false;
  }
  applyEffect(ev) {
    if (ev.action === 'remove_instrument' && ev.target) this.instruments_in.delete(ev.target);
    else if (ev.action === 'remove_camera') this.camera_in = false;
    else if (ev.action === 'undock_arm' && ev.target) this.docked.delete(ev.target);
    else if (ev.action === 'move_cart_away') this.cart_at_table = false;
  }
  issue(ev, kind, severity, message, ref = null) {
    const i = {t: ev.t, kind, severity, message, actor: ev.actor, role: ev.role, ref}; this.issues.push(i); return i;
  }
  matchStep(ev) {
    for (const s of this.sc.steps) {
      if (this.done.has(s.id) || s.action !== ev.action) continue;
      if (s.target !== null && s.target !== ev.target && !s.decision) continue;
      if (s.targets.length && !s.targets.includes(ev.target)) continue;
      if (s.targets.length && (this.partial.get(s.id) || new Set()).has(ev.target)) continue;
      return s;
    }
    return null;
  }
  handle(ev) {
    const FB = (ok, message, step_completed = null, issue = null) => ({ok, message, step_completed, issue});
    if (this.finished) return FB(false, 'Buổi đã kết thúc');
    this.last_t = Math.max(this.last_t, ev.t);
    const data = ev.data || {};
    if (ev.action === 'contact') {
      if (!data.is_sterile) {
        const p = data.point || [0, 0, 0];
        const z = this.sc.zones.find(z => inside(p, z));
        if (z) { const i = this.issue(ev, 'sterile_breach', CRITICAL, `Bộ phận không vô khuẩn chạm vào ${z.label}`, z.id); return FB(false, i.message, null, i); }
      }
      return FB(true, '');
    }
    if (ev.action === 'position') {
      const r = this.tooClose(data.point || [0, 0, 0], !!data.is_gowned);
      const lc = this.lastClose.has(ev.actor) ? this.lastClose.get(ev.actor) : -1e9;
      if (r && ev.t - lc >= 5.0) {
        this.lastClose.set(ev.actor, ev.t);
        const i = this.issue(ev, 'too_close', MINOR, `Đứng cách ${r[0].label} ${r[1].toFixed(2)} m, dưới mức tối thiểu`, r[0].id);
        return FB(false, i.message, null, i);
      }
      return FB(true, '');
    }
    for (const rule of this.sc.rules) {
      if (rule.action === ev.action && this.stateTrue(rule.if_state, ev.target)) {
        const i = this.issue(ev, 'rule', rule.severity, rule.message, rule.id); return FB(false, i.message, null, i);
      }
    }
    const step = this.matchStep(ev);
    if (!step) {
      const i = this.issue(ev, 'unexpected', MINOR, `Hành động '${ev.action}' không có trong kịch bản ở thời điểm này`);
      this.applyEffect(ev); return FB(false, i.message, null, i);
    }
    if (!step.roles.includes(ev.role)) {
      const i = this.issue(ev, 'wrong_role', MINOR, `'${step.title}' không thuộc vai trò ${ev.role}`, step.id); return FB(false, i.message, null, i);
    }
    if (step.min_duration_s !== null && Number(data.duration_s || 0) < step.min_duration_s) {
      const i = this.issue(ev, 'insufficient_duration', CRITICAL, `'${step.title}' chưa đủ ${fmtG(step.min_duration_s)} giây`, step.id);
      return FB(false, i.message, null, i);
    }
    if (step.indicated_if && !evalCond(step.indicated_if, this.facts)) {
      const i = this.issue(ev, 'not_indicated', MINOR, `'${step.title}': không có chỉ định ở ca này`, step.id); return FB(false, i.message, null, i);
    }
    if (step.decision) {
      const ans = this.correctAnswer(step);
      if (ev.target !== ans) {
        const lbl = step.decision.options[ev.target] ?? (ev.target === null ? 'None' : ev.target);   // giống f-string của Python
        const i = this.issue(ev, 'wrong_decision', MAJOR, `${step.title}: chọn '${lbl}' chưa đúng`, step.id); return FB(false, i.message, null, i);
      }
    }
    if (step.area) {
      const p = data.point, a = step.area;
      const x = p ? p[0] : null, z = p ? p[p.length - 1] : null;
      if (x === null || !(a[0] <= x && x <= a[2] && a[1] <= z && z <= a[3])) {
        const i = this.issue(ev, 'wrong_position', MAJOR, `${step.title}: vị trí chưa đúng` + (step.area_label ? ` (cần ở ${step.area_label})` : ''), step.id);
        return FB(false, i.message, null, i);
      }
    }
    const missing = step.after.filter(a => !this.done.has(a) && this.required.has(a));
    let issue = null;
    if (missing.length) {
      const titles = missing.map(a => scStep(this.sc, a).title).join(', ');
      issue = this.issue(ev, 'out_of_order', MAJOR, `Làm '${step.title}' trước khi xong: ${titles}`, step.id);
    }
    this.applyEffect(ev);
    if (step.targets.length) {
      if (!this.partial.has(step.id)) this.partial.set(step.id, new Set());
      const got = this.partial.get(step.id); got.add(ev.target);
      if (!(got.size === step.targets.length && step.targets.every(t => got.has(t))))
        return FB(issue === null, `${step.title}: ${got.size}/${step.targets.length}`, null, issue);
    }
    this.done.set(step.id, [ev.t, ev.actor, ev.role]);
    if ([...this.required].every(id => this.done.has(id))) this.finished = true;
    return FB(issue === null, `Hoàn thành: ${step.title}`, step.id, issue);
  }
  tooClose(point, isGowned) {
    if (isGowned || this.sc.min_observer_distance_m === null) return null;
    let best = null;
    for (const z of this.sc.zones) { const d = distance(point, z); if (d < this.sc.min_observer_distance_m && (best === null || d < best[1])) best = [z, d]; }
    return best;
  }
  terminate(t) {
    this.finished = true;
    if (t !== undefined && t !== null) this.last_t = Math.max(this.last_t, t);
    const sc = this.sc.scoring;
    const missed = this.sc.steps.filter(s => s.critical && this.required.has(s.id) && !this.done.has(s.id)).map(s => s.id);
    const n = kind => this.issues.filter(i => i.kind === kind).length;
    const nCrit = this.issues.filter(i => i.severity === CRITICAL).length;
    let score = 100.0;
    score -= sc.critical_miss * missed.length;
    score -= sc.critical_error * nCrit;
    score -= sc.out_of_order * n('out_of_order');
    score -= sc.wrong_role * n('wrong_role');
    score -= sc.wrong_decision * n('wrong_decision');
    score -= sc.wrong_position * n('wrong_position');
    score -= sc.not_indicated * n('not_indicated');
    if (this.sc.time_limit_s && this.last_t > this.sc.time_limit_s && sc.over_time_per_10s)
      score -= sc.over_time_per_10s * Math.ceil((this.last_t - this.sc.time_limit_s) / 10);
    score = Math.max(0.0, pyRound(score, 1));
    const passed = score >= sc.pass_threshold && !missed.length && !(sc.fail_on_any_critical_error && nCrit);
    return {scenario_id: this.sc.id, duration_s: pyRound(this.last_t, 1), completed_steps: [...this.done.keys()],
      missed_critical: missed, issues: this.issues.slice(), score, passed, case_id: (this.case || {}).id ?? null,
      critical_errors: nCrit};
  }
  gradeQuiz(answers) {
    const items = this.sc.quiz.map(q => { const a = answers[q.id] ?? null;
      return {id: q.id, q: q.q, chosen: a, answer: q.answer, correct: a === q.answer, explain: q.explain ?? null}; });
    const n = items.length, right = items.filter(i => i.correct).length;
    return {items, correct: right, total: n, score: n ? pyRound(100 * right / n, 1) : null};
  }
}

/* ---------- buổi mô phỏng (session.py) ---------- */
const areaCenter = a => [(a[0] + a[2]) / 2, 1.0, (a[1] + a[3]) / 2];
const issueJson = i => ({t: i.t, kind: i.kind, severity: i.severity, message: i.message, role: i.role, ref: i.ref});
const resultJson = r => ({score: r.score, passed: r.passed, duration_s: r.duration_s, missed_critical: r.missed_critical,
  critical_errors: r.critical_errors, case_id: r.case_id, issues: r.issues.map(issueJson)});
const isNum = v => typeof v === 'number' && isFinite(v);
function cleanData(data) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  const p = data.point;
  if (Array.isArray(p) && p.length === 3 && p.every(isNum)) out.point = p.map(Number);
  if (isNum(data.duration_s)) out.duration_s = data.duration_s;
  for (const k of ['is_sterile', 'is_gowned']) if (typeof data[k] === 'boolean') out[k] = data[k];
  return out;
}

function publicScenario(sc, caseId, reveal) {
  const eng = new Engine(sc, caseId);
  const steps = sc.steps.map(s => {
    const d = {id: s.id, title: s.title, roles: s.roles.slice(), action: s.action, after: s.after.slice(), critical: s.critical,
      target: s.target, targets: s.targets.slice(), min_duration_s: s.min_duration_s, phase: s.phase, note: s.note, src: s.src,
      required: eng.required.has(s.id), conditional: !!(s.required_if || s.indicated_if), area_label: s.area_label, has_area: !!s.area};
    if (s.decision) { d.options = s.decision.options; if (reveal) d.answer = eng.correctAnswer(s); }
    if (reveal && s.area) d.area = s.area.slice();
    return d;
  });
  const c = eng.case;
  return {id: sc.id, version: sc.version, module: sc.module, title: sc.title, roles: sc.roles.slice(), time_limit_s: sc.time_limit_s,
    approval_status: sc.approval_status, initial_state: sc.initial_state, min_observer_distance_m: sc.min_observer_distance_m,
    source: sc.source, zones: sc.zones, rules: sc.rules.map(r => ({id: r.id, action: r.action, message: r.message})),
    phases: sc.phases, rubric: sc.rubric, cases: sc.cases.map(c => ({id: c.id, title: c.title, summary: c.summary ?? null})),
    case: c ? {id: c.id, title: c.title, summary: c.summary ?? null, visual: c.visual || {}} : null,
    quiz: sc.quiz.map(q => ({id: q.id, q: q.q, options: q.options})), steps};
}

class Session {
  constructor(sc, caseId = null, role = null, learner = 'GV') {
    if (role !== null && !sc.roles.includes(role)) throw new Error('Vai trò không hợp lệ');
    this.sc = sc; this.engine = new Engine(sc, caseId); this.case_id = (this.engine.case || {}).id ?? null;
    this.role = role; this.learner = learner; this.team = role ? `${learner} (${role})` : `Thị phạm ${learner}`;
    this.log = []; this.events = []; this.result = null; this.last_t = 0;
  }
  who(role) { return role === this.role ? this.learner : `${this.team}-ekip-ao-${role}`; }
  ready(s) { const e = this.engine;
    return !e.done.has(s.id) && e.required.has(s.id) && s.after.every(a => e.done.has(a) || !e.required.has(a)); }
  studentAvailable() { return this.role ? this.sc.steps.filter(s => this.ready(s) && s.roles.includes(this.role)).map(s => s.id) : []; }
  state(t) {
    const e = this.engine;
    const steps = e.sc.steps.map(s => { const got = e.partial.get(s.id) || new Set(), d = e.done.get(s.id);
      return {id: s.id, done: !!d, progress: s.targets.length ? got.size : (d ? 1 : 0), total: s.targets.length || 1,
        done_targets: sortStr([...got]), done_by: d ? d[2] : null, t: d ? d[0] : null}; });
    return {t, finished: e.finished || this.result !== null, steps,
      world: {docked: sortStr([...e.docked]), instruments_in: sortStr([...e.instruments_in]), camera_in: e.camera_in, cart_at_table: e.cart_at_table},
      issues: e.issues.map(issueJson), waiting_for_student: this.studentAvailable()};
  }
  botNext() {
    const e = this.engine;
    for (const s of this.sc.steps) {
      if (!this.ready(s) || (this.role && s.roles.includes(this.role))) continue;
      const role = s.roles[0];
      let target = s.target;
      if (s.targets.length) { const got = e.partial.get(s.id) || new Set(); target = s.targets.find(t => !got.has(t)); }
      if (s.decision) target = e.correctAnswer(s);
      const data = {};
      if (s.min_duration_s) data.duration_s = s.min_duration_s + 30;
      if (s.area) data.point = areaCenter(s.area);
      return [s, role, target, data];
    }
    return null;
  }
  tick(t) { t = pyRound(Number(t), 2); this.last_t = Math.max(this.last_t, t); return this.last_t; }
  do(role, action, target, data, t, bot = false) {
    t = this.tick(t); data = cleanData(data); target = target ?? null;
    const ev = {t, actor: this.who(role), role, action, target, data};
    const fb = this.engine.handle(ev);
    this.log.push({t, role, action, target, data, bot});
    this.events.push([ev, fb]);
    let res = null;
    if (this.engine.finished && this.result === null) res = this.result = this.engine.terminate(t);
    const step = fb.step_completed ? scStep(this.sc, fb.step_completed) : null;
    const out = {feedback: {ok: fb.ok, message: fb.message, step_completed: fb.step_completed, note: step ? step.note : null,
        src: step ? step.src : null, issue: fb.issue ? {kind: fb.issue.kind, severity: fb.issue.severity, message: fb.issue.message, ref: fb.issue.ref} : null},
      action: {role, action, target}, ...this.state(t)};
    if (res) out.result = resultJson(res);
    return out;
  }
  bot(t) {
    if (this.result !== null) return {idle: true, ...this.state(this.tick(t)), result: resultJson(this.result)};
    const n = this.botNext();
    if (!n) return {idle: true, waiting: this.studentAvailable().length > 0, ...this.state(this.tick(t))};
    const [s, role, target, data] = n;
    const out = this.do(role, s.action, target, data, t, true);
    out.bot = {step: s.id, title: s.title, role, target, point: data.point ?? null, option: ((s.decision || {}).options || {})[target] ?? null};
    return out;
  }
  finish(t) { t = this.tick(t); if (this.result === null) this.result = this.engine.terminate(t); return {result: resultJson(this.result), ...this.state(t)}; }
  gradeQuiz(answers) {
    const clean = {}; for (const [k, v] of Object.entries(answers || {})) if (Number.isInteger(v)) clean[k] = v;
    const g = this.engine.gradeQuiz(clean);
    const qmap = Object.fromEntries(this.sc.quiz.map(q => [q.id, q]));
    g.items.forEach(it => { it.answer_text = it.answer === undefined || it.answer === null ? null : qmap[it.id].options[it.answer]; });
    return g;
  }
}

/* ---------- chạy lại nhật ký (replay_log trong session.py) ---------- */
// Dùng cho bảng điều khiển giảng viên bản tĩnh: chấm lại tệp kết quả của sinh viên ngay trong trình duyệt.
class LogError extends Error {}
const MAX_LOG = 2000;
// Giá trị "đúng" theo kiểu Python (None, False, 0, "", [], {} là sai)
const pyTruthy = v => !(v === null || v === undefined || v === false || v === 0 || v === '' ||
  (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length));
function replayLog(sc, caseId, role, learner, log, tEnd, maxT = null) {
  if (!Array.isArray(log) || log.length > MAX_LOG) throw new LogError('Nhật ký thao tác sai định dạng hoặc quá dài');
  const s = new Session(sc, caseId, role, learner);
  let last = 0.0;
  log.forEach((e, i) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) throw new LogError(`Thao tác ${i}: sai định dạng`);
    const t = e.t, r = e.role, a = e.action, tg = e.target === undefined ? null : e.target;
    if (!isNum(t) || t < last - 1e-9 || t < 0) throw new LogError(`Thao tác ${i}: thời gian không hợp lệ`);
    if (maxT !== null && t > maxT) throw new LogError(`Thao tác ${i}: thời gian vượt quá thời lượng buổi`);
    if (!sc.roles.includes(r) || typeof a !== 'string' || !(tg === null || typeof tg === 'string'))
      throw new LogError(`Thao tác ${i}: vai hoặc hành động không hợp lệ`);
    if (s.result !== null) throw new LogError(`Thao tác ${i}: buổi đã kết thúc trước thao tác này`);
    last = t;
    if (pyTruthy(e.bot)) {
      const n = s.botNext();
      if (!n) throw new LogError(`Thao tác ${i}: ê kíp ảo không có bước nào để làm`);
      const [step, br, btg, bdata] = n;
      if (br !== r || step.action !== a || (btg ?? null) !== tg) throw new LogError(`Thao tác ${i}: ê kíp ảo làm khác quy trình`);
      s.do(br, step.action, btg, bdata, t, true);
    } else {
      if (role === null) throw new LogError('Buổi thị phạm không có thao tác của học viên');
      if (r !== role && !FREE_ACTIONS.includes(a)) throw new LogError(`Thao tác ${i}: học viên làm việc của vai khác`);
      s.do(r, a, tg, pyTruthy(e.data) ? e.data : {}, t);
    }
  });
  let end = Math.max(last, isNum(tEnd) ? tEnd : last);
  if (maxT !== null) end = Math.min(end, maxT);
  s.finish(end);
  return s;
}

return {CRITICAL, MAJOR, MINOR, FREE_ACTIONS, MAX_LOG, pyRound, evalCond, loadScenario, scCase, Engine, Session, publicScenario,
  cleanData, replayLog, LogError};
});
