// Sinh các buổi mô phỏng ngẫu nhiên bằng engine.js (bản chạy trong trình duyệt) và in ra JSON để
// tests/test_parity.py cho bộ chấm Python chạy lại và so kết quả.  node tests/parity_runner.js [số buổi/kịch bản]
'use strict';
const fs = require('fs'), path = require('path');
const E = require(path.join(__dirname, '..', 'backend', 'static', 'sim', 'engine.js'));
const N = Number(process.argv[2] || 60);
const dir = path.join(__dirname, '..', 'scenarios');

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

const out = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const sc = E.loadScenario(raw);
  const used = [...new Set(sc.steps.flatMap(s => s.roles))];
  const actions = [...new Set(sc.steps.map(s => s.action).concat(sc.rules.map(r => r.action)))];
  for (let k = 0; k < N; k++) {
    const R = rng(1000003 * (k + 1) + f.length * 7919);
    const pick = a => a[Math.floor(R() * a.length)];
    const demo = k % 10 === 0;
    const role = demo ? null : pick(used);
    const caseId = sc.cases.length ? pick(sc.cases).id : null;
    const s = new E.Session(sc, caseId, role, demo ? 'GV' : `SV${k}`);
    const skill = R();                       // 0 = làm bừa, 1 = làm gần đúng
    let t = 0;
    for (let n = 0; n < 400 && s.result === null; n++) {
      t += R() < 0.1 ? R() * 40 : R() * 4;
      const tt = Math.round(t * 1000) / 1000;
      const avail = s.studentAvailable();
      if (demo || R() < 0.45) { const r = s.bot(tt); if (r.idle && !avail.length && !demo && R() < 0.3) break; if (demo && r.idle) break; continue; }
      const z = R();
      if (z < 0.12) {                        // đi lại / chạm vùng vô khuẩn
        let p = [(R() - 0.5) * 6, R() * 2, (R() - 0.5) * 6];
        if (sc.zones.length && R() < 0.6) {      // điểm trong hoặc sát một vùng vô khuẩn
          const zn = pick(sc.zones), m = R() < 0.5 ? 0 : 0.6;
          p = [0, 1, 2].map(i => zn.min[i] - m + R() * (zn.max[i] - zn.min[i] + 2 * m));
        }
        s.do(role, R() < 0.5 ? 'position' : 'contact', null, R() < 0.5 ? {point: p, is_gowned: R() < 0.5} : {point: p, is_sterile: R() < 0.5}, tt);
      } else if (z < 0.12 + 0.75 * skill && avail.length) {   // làm đúng bước của mình (có thể sai lựa chọn / vị trí)
        const sid = pick(avail), st = sc.steps.find(x => x.id === sid);
        let target = st.target, data = {};
        if (st.targets.length) target = pick(st.targets);
        if (st.decision) target = R() < 0.7 ? s.engine.correctAnswer(st) : pick(Object.keys(st.decision.options));
        if (st.min_duration_s) data.duration_s = R() < 0.7 ? st.min_duration_s + R() * 50 : R() * st.min_duration_s;
        if (st.area) { const a = st.area; data.point = R() < 0.7 ? [(a[0] + a[2]) / 2, 1, (a[1] + a[3]) / 2] : [(R() - 0.5) * 8, 1, (R() - 0.5) * 8]; }
        s.do(role, st.action, target, data, tt);
      } else {                               // thao tác bất kỳ, có thể sai thứ tự hoặc nguy hiểm
        const st = pick(sc.steps);
        const a = R() < 0.8 ? st.action : pick(actions);
        const target = st.targets.length ? pick(st.targets) : (st.decision ? pick(Object.keys(st.decision.options).concat([null])) : st.target);
        const data = R() < 0.3 ? {duration_s: R() * 300, point: [(R() - 0.5) * 8, 1, (R() - 0.5) * 8]} : {};
        s.do(role, a, target, data, tt);
      }
    }
    const tEnd = Math.round((s.last_t + R() * 30) * 1000) / 1000;
    const fin = s.finish(tEnd);
    const answers = {}; sc.quiz.forEach(q => { if (R() < 0.85) answers[q.id] = Math.floor(R() * q.options.length); });
    out.push({file: f, scenario_id: sc.id, case_id: caseId, role, learner: s.learner, log: s.log, t_end: tEnd,
      result: fin.result, state: fin, quiz_answers: answers, quiz: sc.quiz.length ? s.gradeQuiz(answers) : null,
      public: E.publicScenario(sc, caseId, demo)});
  }
}
process.stdout.write(JSON.stringify(out));
