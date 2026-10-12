// Hình ống soi cho mổ nội soi cắt ruột thừa thường (kịch bản m5), vẽ theo các bước đã hoàn thành.
// Sơ đồ minh họa, không phải hình nội soi thật.
(() => {
const E = window.ENDO, L = E.lib, ex = E.ex, W = E.W, H = E.H, FONT = E.FONT;
const {B, R, T0, CEC, ILEUM, PORT1, PORT2, A1R, A2R, dist, lerp, bez, tang, mesoPt, SEALS, sealPos, CLIPT, CUTT, STUMP, SPEC, SPECMID, VES, pp, tube, lbl, instr} = L;
const POOL = {x: 300, y: 520};
const S = {done: new Set(), facts: {}, ports: 0, caption: '', last: null, lastT: 0};
const A = {expose: 0, pan: 0, pus: 0, water: 0, seal: 0, specOut: 0, drain: 0, tipR: {...A2R}, tipL: {...A1R}};
let pusInit = null;
const smoke = [];
const ap = (c, t, k) => c + (t - c) * Math.min(1, k);
const apP = (c, t, k) => ({x: ap(c.x, t.x, k), y: ap(c.y, t.y, k)});

function set(done, facts, ports, caption) {
  const newly = [...done].filter(x => !S.done.has(x));
  if (newly.length) { S.last = newly[newly.length - 1]; S.lastT = performance.now() / 1000; }
  S.done = new Set(done); S.facts = facts || {}; S.ports = ports || 0; S.caption = caption || '';
  if (pusInit === null || !done.size) pusInit = S.facts.peritonitis ? 1 : 0.25;
}
function reset() { S.done = new Set(); S.last = null; Object.assign(A, {expose: 0, pan: 0, pus: 0, water: 0, seal: 0, specOut: 0, drain: 0, tipR: {...A2R}, tipL: {...A1R}}); pusInit = null; }

function off(msg) {
  ex.setTransform(1200 / W, 0, 0, 1200 / W, 0, 0); ex.fillStyle = '#0b0f10'; ex.fillRect(0, 0, W, H);
  ex.font = '600 24px ' + FONT; ex.fillStyle = 'rgba(255,255,255,.75)'; ex.fillText(msg, W / 2 - ex.measureText(msg).width / 2, H / 2);
  ex.font = '500 14px ' + FONT; ex.fillStyle = 'rgba(255,255,255,.4)'; ex.fillText('Kênh camera nội soi', 20, 30);
  if (S.caption) cap(S.caption);
}
function cap(t) { ex.font = '600 17px ' + FONT; const w = Math.min(W - 24, ex.measureText(t).width + 32); ex.fillStyle = 'rgba(8,20,22,.8)'; ex.fillRect(W / 2 - w / 2, 12, w, 36); ex.fillStyle = '#fff'; ex.fillText(t, W / 2 - w / 2 + 16, 36, W - 56); }

function draw(dt) {
  const D = S.done, now = performance.now() / 1000, since = now - S.lastT, act = since < 2.6 ? S.last : null;
  if (!D.has('s1_cam_port')) return off('Chưa có tín hiệu camera');
  if (D.has('s6_close')) return off('Đã rút dụng cụ và ống soi, đóng các lỗ trocar');
  const k = dt * 1.6;
  A.pan = ap(A.pan, D.has('s2_explore') ? 0 : 1, dt * .8);
  A.expose = ap(A.expose, D.has('s2_assess') ? 1 : 0, k);
  A.seal = ap(A.seal, D.has('s3_hemostasis') ? 1 : (D.has('s3_dissect') ? .45 : 0), k);
  const pusT = D.has('s5_suction') ? (S.facts.peritonitis ? .35 : 0) : pusInit;
  A.pus = ap(A.pus, D.has('s5_irrigate') ? 0 : pusT, dt * .7);
  A.water = ap(A.water, D.has('s5_irrigate') && !D.has('s6_close') ? (act === 's5_irrigate' ? .9 : .25) : 0, dt * .7);
  A.specOut = ap(A.specOut, D.has('s6_extract') ? 1 : 0, dt * .6);
  A.drain = ap(A.drain, D.has('s6_drain') ? 1 : 0, k);
  const cut = D.has('s4_cut');
  const P = lerp(T0, R, A.expose);

  ex.setTransform(1200 / W, 0, 0, 1200 / W, 0, 0);
  ex.save();
  // khi thám sát: camera lùi xa, lia toàn ổ bụng
  const z = 1 - .28 * A.pan, sway = A.pan * Math.sin(now * .6) * 60;
  ex.translate(W / 2 + sway, H / 2 - 30 * A.pan); ex.scale(z, z); ex.translate(-W / 2, -H / 2);
  const g = ex.createRadialGradient(450, 290, 40, 450, 300, 620); g.addColorStop(0, '#c0786a'); g.addColorStop(.55, '#9a4f45'); g.addColorStop(1, '#4a1d19');
  ex.fillStyle = g; ex.fillRect(-200, -200, W + 400, H + 400);
  ex.globalAlpha = .22; ex.strokeStyle = '#7a2a26'; ex.lineWidth = 1.6; VES.forEach(v => { pp(ex, v); ex.stroke(); }); ex.globalAlpha = 1;
  if (A.pan > .05) { ex.globalAlpha = A.pan; ex.fillStyle = '#7a3a2e'; ex.beginPath(); ex.ellipse(120, -60, 260, 120, .2, 0, 6.283); ex.fill(); lbl(ex, 'Gan', 110, 30, 14); ex.globalAlpha = 1; }
  tube(ex, ILEUM, 66, '#a4594d', '#d9998a', 'rgba(255,225,215,.45)');
  ex.beginPath(); ex.ellipse(CEC.x, CEC.y, CEC.rx, CEC.ry, 0, 0, 6.283); ex.fillStyle = '#d49482'; ex.fill(); ex.strokeStyle = '#9c5245'; ex.lineWidth = 3; ex.stroke();
  lbl(ex, 'Manh tràng', CEC.x + 10, CEC.y + 70, 12); lbl(ex, 'Hồi tràng', 90, 520, 12);
  // dịch bẩn / nước rửa ở túi cùng
  if (A.pus > .02) {
    ex.beginPath(); ex.ellipse(POOL.x, POOL.y, 170 * Math.sqrt(A.pus), 70 * Math.sqrt(A.pus), -.1, 0, 6.283);
    ex.fillStyle = `rgba(196,180,70,${.55 + .2 * A.pus})`; ex.fill();
    if (S.facts.peritonitis) for (let i = 0; i < 9; i++) { ex.fillStyle = `rgba(240,230,170,${.7 * A.pus})`; ex.beginPath(); ex.ellipse(200 + i * 55, 470 - (i % 3) * 22, 16, 7, i, 0, 6.283); ex.fill(); }
    lbl(ex, S.facts.peritonitis ? 'Dịch mủ, giả mạc' : 'Dịch đục', POOL.x - 50, POOL.y - 40, 12);
  }
  if (A.water > .02) { ex.beginPath(); ex.ellipse(POOL.x, POOL.y, 190 * A.water, 80 * A.water, -.1, 0, 6.283); ex.fillStyle = `rgba(200,230,240,${.45})`; ex.fill(); lbl(ex, 'Nước muối súc rửa', POOL.x - 60, POOL.y + 5, 12); }
  // mạc treo
  const e = Math.max(0, Math.min(1, (dist(B, P) - 140) / 100));
  if (e > 0 && !cut) {
    ex.beginPath(); for (let i = 0; i <= 20; i++) { const q = bez(P, i / 20); i ? ex.lineTo(q.x, q.y) : ex.moveTo(q.x, q.y); }
    for (let i = 20; i >= 0; i--) { const q = mesoPt(i / 20); ex.lineTo(q.x, q.y); } ex.closePath(); ex.fillStyle = `rgba(236,198,120,${.55 * e})`; ex.fill();
    const art = []; for (let i = 0; i <= 18; i++) { const t = .06 + .92 * i / 18; art.push(lerp(bez(P, t), mesoPt(t), .42)); }
    pp(ex, art); ex.strokeStyle = `rgba(140,25,32,${.85 * e})`; ex.lineWidth = 3.2; ex.stroke();
    if (A.seal < .05 && e > .6) lbl(ex, 'Mạc treo ruột thừa', sealPos(R, SEALS[1]).x + 20, sealPos(R, SEALS[1]).y + 20, 12);
  }
  if (e > 0) SEALS.forEach((s, i) => { const prog = Math.max(0, Math.min(1, A.seal * 3 - i)); if (prog <= 0) return; const p = sealPos(R, s);
    ex.save(); ex.translate(p.x, p.y); const tg = tang(R, s.t); ex.rotate(Math.atan2(tg.y, tg.x)); ex.globalAlpha = prog;
    ex.fillStyle = '#5b3a1f'; ex.beginPath(); ex.ellipse(0, 0, 7, 11, 0, 0, 6.283); ex.fill(); ex.restore(); });
  // ruột thừa (viêm: đỏ, phù)
  const inflD = '#9b3b30', inflM = '#d0705f';
  const loop = (q, a) => { ex.save(); ex.translate(q.x, q.y); ex.rotate(a + Math.PI / 2); ex.strokeStyle = '#f4f1e8'; ex.lineWidth = 3.2; ex.beginPath(); ex.ellipse(0, 0, 14, 5, 0, 0, 6.283); ex.stroke(); ex.restore(); };
  if (!cut) {
    const pts = [{x: 524, y: 357}]; for (let i = 0; i <= 26; i++) pts.push(bez(P, i / 26));
    tube(ex, pts, 26, inflD, inflM, 'rgba(255,220,210,.4)');
    if (S.facts.peritonitis) { const q = bez(P, .62); ex.fillStyle = '#3a1712'; ex.beginPath(); ex.arc(q.x, q.y, 6, 0, 6.283); ex.fill(); ex.fillStyle = 'rgba(220,210,90,.85)'; ex.beginPath(); ex.ellipse(q.x + 8, q.y + 10, 12, 6, .4, 0, 6.283); ex.fill(); if (A.expose > .8) lbl(ex, 'Chỗ vỡ', q.x + 14, q.y - 8, 12); }
    if (D.has('s4_ligate')) CLIPT.forEach(t => { const q = bez(P, t), tg = tang(P, t); loop(q, Math.atan2(tg.y, tg.x)); });
    if (A.expose > .8 && !D.has('s3_dissect')) lbl(ex, 'Ruột thừa viêm', P.x - 40, P.y - 22, 13);
  } else {
    tube(ex, [{x: 524, y: 357}, ...STUMP], 26, inflD, inflM, 'rgba(255,220,210,.4)');
    const q0 = bez(R, CLIPT[0]), t0 = tang(R, CLIPT[0]); loop(q0, Math.atan2(t0.y, t0.x)); lbl(ex, 'Gốc ruột thừa đã buộc', q0.x + 18, q0.y + 28, 12);
    if (A.specOut < .98) { const off = {x: 520 * A.specOut, y: -420 * A.specOut}; ex.globalAlpha = 1 - A.specOut * .6;
      tube(ex, SPEC.map(p => ({x: p.x + off.x, y: p.y + off.y})), 26, inflD, inflM, 'rgba(255,220,210,.4)');
      const q1 = bez(R, CLIPT[1]), t1 = tang(R, CLIPT[1]); loop({x: q1.x + off.x, y: q1.y + off.y}, Math.atan2(t1.y, t1.x)); ex.globalAlpha = 1; }
  }
  if (A.drain > .02) { const d = [{x: 980, y: -40}, {x: 700, y: 140}, {x: 470, y: 330}, {x: lerp({x: 470, y: 330}, POOL, A.drain).x, y: lerp({x: 470, y: 330}, POOL, A.drain).y}];
    tube(ex, d, 16, '#c9c9c3', '#f2f2ee', 'rgba(255,255,255,.6)'); lbl(ex, 'Ống dẫn lưu', 520, 300, 12); }
  // dụng cụ
  let tool = 'grasper', tgtR = A2R, tgtL = A.expose > .1 ? P : A1R, energy = false, suction = false;
  if (S.ports >= 1) {
    if (act === 's3_dissect' || act === 's3_hemostasis') { tool = 'sealer'; const i = Math.floor(since / .8) % 3; tgtR = sealPos(R, SEALS[i]); energy = act === 's3_hemostasis' || since % .8 > .3; }
    else if (act === 's4_ligate') { tool = 'grasper'; tgtR = bez(R, CLIPT[since < 1.3 ? 0 : 1]); }
    else if (act === 's4_cut') { tool = 'scissors'; tgtR = bez(R, CUTT); }
    else if (act === 's5_suction' || act === 's5_irrigate') { suction = true; tgtR = {x: POOL.x + 30 * Math.sin(since * 3), y: POOL.y - 10}; }
    else if (act === 's6_extract') { tool = 'grasper'; tgtR = {x: SPECMID.x + 520 * A.specOut, y: SPECMID.y - 420 * A.specOut}; tgtL = A1R; }
    else if (act === 's6_drain') { tool = 'grasper'; tgtR = lerp({x: 470, y: 330}, POOL, A.drain); }
    else if (act === 's2_explore') { tgtR = {x: 300 + 200 * Math.sin(since), y: 380}; }
    if (cut && !act) tgtL = A1R;
  }
  A.tipR = apP(A.tipR, tgtR, dt * 3); A.tipL = apP(A.tipL, tgtL, dt * 3);
  if (S.ports >= 1) {
    if (suction) { ex.lineCap = 'round'; ex.strokeStyle = '#2b3236'; ex.lineWidth = 15; ex.beginPath(); ex.moveTo(PORT2.x, PORT2.y); ex.lineTo(A.tipR.x, A.tipR.y); ex.stroke();
      ex.strokeStyle = '#7d8a90'; ex.lineWidth = 10; ex.stroke(); lbl(ex, act === 's5_irrigate' ? 'Ống hút rửa: bơm nước muối' : 'Ống hút', A.tipR.x + 14, A.tipR.y - 16, 12); }
    else instr(ex, PORT2, A.tipR, tool, false, energy, 'Dụng cụ phải');
  }
  if (S.ports >= 2) instr(ex, PORT1, A.tipL, 'grasper', A.expose > .5 && !cut, false, 'Kẹp trái');
  if (energy && Math.random() < .7) smoke.push({x: A.tipR.x, y: A.tipR.y, vx: (Math.random() - .5) * 20, vy: -25 - Math.random() * 25, l: 1});
  for (let i = smoke.length - 1; i >= 0; i--) { const q = smoke[i]; q.x += q.vx * dt; q.y += q.vy * dt; q.l -= dt * 1.1; if (q.l <= 0) { smoke.splice(i, 1); continue; }
    ex.beginPath(); ex.arc(q.x, q.y, 6 + (1 - q.l) * 10, 0, 6.283); ex.fillStyle = `rgba(245,245,240,${.28 * q.l})`; ex.fill(); }
  ex.restore();
  const v = ex.createRadialGradient(450, 300, 280, 450, 300, 580); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); ex.fillStyle = v; ex.fillRect(0, 0, W, H);
  if (energy) { ex.font = '600 14px ' + FONT; const t = 'Đang dùng dao điện', w = ex.measureText(t).width + 24; ex.fillStyle = 'rgba(255,180,40,.92)'; ex.fillRect(W / 2 - w / 2, 58, w, 26); ex.fillStyle = '#2a1a00'; ex.fillText(t, W / 2 - w / 2 + 12, 76); }
  if (S.caption) cap(S.caption);
  ex.font = '500 12px ' + FONT; ex.fillStyle = 'rgba(255,255,255,.55)'; ex.fillText('Sơ đồ minh họa, không phải hình nội soi thật', 16, H - 14);
}
window.ENDOLAP = {set, draw, reset};
})();
