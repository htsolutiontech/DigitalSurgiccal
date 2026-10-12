// Ứng dụng mô phỏng chạy thực. Bộ chấm và ê kíp ảo chạy ngay trong trình duyệt (engine.js), nên trang
// chạy được cả khi không có máy chủ (GitHub Pages). Có máy chủ (Vercel/VPS) thì khi kết thúc, nhật ký
// thao tác được gửi lên để máy chủ chấm lại bằng bộ chấm Python (điểm chính thức) và lưu cho giảng viên.
(() => {
const $ = id => document.getElementById(id);
const ROLE_VI = {ptv:'PTV chính',asst:'Phụ mổ',scrub:'Dụng cụ viên',anes:'BS gây mê',anesN:'ĐD gây mê',circ:'ĐD chạy ngoài',
  stu:'Sinh viên',res:'BS điều trị',ward:'ĐD khoa Ngoại'};
const ACTION_VI = {
  announce_emergency:'Tuyên bố khẩn cấp, yêu cầu chuyển mổ mở', acknowledge:'Xác nhận, chuẩn bị hồi sức và máu',
  call_help:'Gọi hỗ trợ, báo ngân hàng máu', open_laparotomy_tray:'Mở bộ dụng cụ mổ mở', remove_instrument:'Rút dụng cụ',
  remove_camera:'Rút ống soi', undock_arm:'Tháo tay robot khỏi trocar', scrub_in:'Rời bàn điều khiển, mặc áo và găng vô khuẩn',
  move_cart_away:'Đẩy xe robot ra khỏi bàn mổ', start_laparotomy:'Bắt đầu mở bụng', move_table:'Đổi tư thế bàn mổ',
  induce_anesthesia:'Khởi mê', incise:'Rạch da', transfer_out:'Chuyển người bệnh ra hồi tỉnh', hand_scrub:'Rửa tay ngoại khoa',
  don_gown:'Mặc áo choàng vô khuẩn', don_gloves:'Mang găng vô khuẩn', take_position:'Đứng vào vị trí được chỉ định'};
const TARGET_VI = {arm1:'tay 1',arm2:'tay 2',arm3:'tay 3',camera:'tay camera',port_a:'(trocar thứ nhất)',port_b:'(trocar thứ hai)'};
const ARM3D = {arm1:'a1',arm2:'a2',arm3:'a3',camera:'cam'};
const P = {tablePtv:[-.15,.82],tableAsst:[.42,.82],cartSide:[.7,-.75],anes:[-1.35,.42],anesHead:[-1.15,.05],anesN:[-1.0,-.5],
  circDesk:[-2.75,2.9],circTablet:[-.45,1.55],circCart:[1.9,-2.0],stu1:[1.0,1.95],stu2:[.3,2.08],door:[-4.0,1.6],sink:[-3.95,3.1],mark:[.75,.85],
  waitPtv:[-3.6,2.2],waitAsst:[-3.3,2.6],waitScrub:[2.2,-2.6]};
const MODE_HINT = {demo:'Ê kíp ảo làm đúng toàn bộ quy trình để sinh viên quan sát. Không ghi điểm.',
  practice:'Bạn đóng một vai; ê kíp ảo làm các vai còn lại và chờ bạn ở những bước thuộc vai đó. Mọi thao tác được chấm và ghi cho giảng viên.'};
const LAP = 'm5_lap_appendectomy_ntp';

let SCN = [], RAW = {}, sc = null, run = null, reg = null, mode = 'demo', speed = 1, studentRole = null;
let SERVER = false, S = null, startToken = null, startedAt = null, runMeta = null;   // S: buổi mô phỏng cục bộ
let state = null, done = new Set(), botAt = 0, t0 = 0, liveT = 0, waitingShown = false;
let studentPos = P.door.slice(), scrubbing = null, pickStep = null, placed = {}, pendingResult = null;

/* ---------- tiện ích ---------- */
const fmt = s => String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');
function toast(msg, cls=''){ const d=document.createElement('div'); d.className=cls; d.textContent=msg; $('toast').append(d);
  setTimeout(()=>d.remove(), 4500); const kids=[...$('toast').children]; kids.slice(0,Math.max(0,kids.length-4)).forEach(k=>k.remove()); }
function logLine(msg, cls=''){ const li=document.createElement('li'); li.className=cls; const tm=document.createElement('time');
  tm.textContent=fmt(state?state.t:0); const sp=document.createElement('span'); sp.textContent=msg; li.append(tm,sp); $('log').prepend(li); }
function banner(msg, cls=''){ const b=$('banner'); if(!msg){b.hidden=true;return;} b.hidden=false; b.textContent=msg; b.className='banner '+cls; }
async function api(path, body){
  const r = await fetch(path.replace(/^\//,''), body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok){ let m=r.statusText; try{ m=(await r.json()).detail||m; }catch(e){} throw new Error(typeof m==='string'?m:JSON.stringify(m)); }
  return r.json();
}
const el = (tag, cls, txt) => { const e=document.createElement(tag); if(cls) e.className=cls; if(txt!==undefined) e.textContent=txt; return e; };
const stepById = id => sc && sc.steps.find(s=>s.id===id);
const actionLabel = (a,t,step) => step && sc.phases.length ? step.title + (t&&TARGET_VI[t]?' '+TARGET_VI[t]:'')
  : (a==='confirm' && step ? step.title : (ACTION_VI[a]||a) + (t&&TARGET_VI[t]?' '+TARGET_VI[t]:''));
const isLap = () => sc && sc.id===LAP;
const hintsOn = () => mode==='demo' || $('showHints').checked;

/* ---------- thiết lập ---------- */
function setSeg(id, v){ document.querySelectorAll('#'+id+' button').forEach(b=>b.setAttribute('aria-pressed', b.dataset.v===v?'true':'false')); }
function onScenario(){ const s=SCN.find(x=>x.id===$('scenario').value); if(!s) return;
  const sel=$('role'); sel.innerHTML='';
  const used=new Set(s.steps.flatMap(st=>st.roles));
  s.roles.filter(r=>used.has(r)).forEach(r=>{ const o=el('option',null,ROLE_VI[r]||r); o.value=r; sel.append(o); });
  if(s.id===LAP) sel.value='asst';
  const cs=$('caseSel'); cs.innerHTML=''; $('caseField').hidden=!s.cases.length;
  s.cases.forEach(c=>{ const o=el('option',null,c.title); o.value=c.id; cs.append(o); });
  $('caseSummary').textContent = s.cases.length ? s.cases[0].summary : '';
  $('draftNote').textContent = s.approval_status!=='approved' ? 'Kịch bản bản nháp: chưa được hội đồng chuyên môn duyệt.' : '';
  const src=$('srcNote'); src.innerHTML='';
  if(s.source){ src.append('Nguồn quy trình: '); const a=el('a',null,s.source.label); a.href=s.source.url; a.target='_blank'; a.rel='noopener'; src.append(a); }
}
$('caseSel').onchange=()=>{ const s=SCN.find(x=>x.id===$('scenario').value); const c=s.cases.find(c=>c.id===$('caseSel').value); $('caseSummary').textContent=c?c.summary:''; };
function setMode(m){ mode=m; document.body.dataset.mode=m; setSeg('modeSeg',m); $('modeHint').textContent=MODE_HINT[m]; }
document.querySelectorAll('#modeSeg button').forEach(b=>b.onclick=()=>setMode(b.dataset.v));
document.querySelectorAll('#speedSeg button').forEach(b=>b.onclick=()=>{ speed=+b.dataset.v; setSeg('speedSeg',b.dataset.v); });
document.querySelectorAll('#viewSeg button').forEach(b=>b.onclick=()=>{ setSeg('viewSeg',b.dataset.v); OR3D.view(b.dataset.v); });
$('scenario').onchange=onScenario;
$('showLabels').onchange=e=>$('orWrap').classList.toggle('hide-labels',!e.target.checked);
$('showSterile').onchange=()=>OR3D.setState({sterile:$('showSterile').checked});
$('showHints').onchange=()=>{ renderSteps(); buildPalette(); };
$('resClose').onclick=()=>$('result').close();
$('infoClose').onclick=()=>$('info').close();

async function init(){
  setMode('demo');
  { const q=new URLSearchParams(location.search).get('class'); let saved='';
    try{ saved=localStorage.getItem('robo.classCode')||''; }catch(e){}
    $('classCode').value = q || saved; }
  let raws = null;
  try{ raws = await api('api/scenarios/full'); SERVER = true; }
  catch(e){ try{ raws = await api('data/scenarios.json'); }catch(e2){ $('serverNote').textContent='Không tải được kịch bản: '+e2.message; return; } }
  window.SIMMODE = SERVER ? 'server' : 'static';
  document.body.dataset.server = SERVER ? '1' : '0';
  raws.forEach(r=>{ RAW[r.id]=SIMENGINE.loadScenario(r); });
  SCN = raws.map(r=>SIMENGINE.publicScenario(RAW[r.id], null, false));
  if(!SERVER) $('serverNote').textContent='Bản tự luyện (không có máy chủ): điểm chỉ hiện trên máy này. Cuối buổi có thể tải tệp kết quả để nộp cho giảng viên.';
  SCN.forEach(s=>{ const o=el('option',null,`Module ${s.module}: ${s.title}`); o.value=s.id; $('scenario').append(o); });
  $('scenario').value = SCN.some(s=>s.id===LAP) ? LAP : SCN[0].id; onScenario();
  if(!OR3D.ok) $('serverNote').textContent='Trình duyệt không hiển thị được 3D (WebGL). Phần chấm điểm vẫn hoạt động.';
  idleScene();
}

/* ---------- bắt đầu / kết thúc ---------- */
$('startBtn').onclick = async () => {
  const sid=$('scenario').value, s=SCN.find(x=>x.id===sid);
  studentRole = mode==='practice' ? $('role').value : null;
  const learner = mode==='practice' ? $('learner').value.trim() : 'GV';
  if(mode==='practice' && !learner){ toast('Nhập mã học viên (không ghi họ tên)','warn'); $('learner').focus(); return; }
  const case_id = s.cases.length ? $('caseSel').value : null;
  try{
    const class_code = $('classCode').value.trim();
    try{ localStorage.setItem('robo.classCode', class_code); }catch(e){}
    startToken=null; reg=null; startedAt=new Date().toISOString();
    if(SERVER && mode==='practice'){
      const r = await api('api/run/start',{scenario_id:sid, learner, role:studentRole, case_id, class_code});
      startToken=r.token; reg=r.registration; }
    S = new SIMENGINE.Session(RAW[sid], case_id, studentRole, learner);
    runMeta = {scenario_id:sid, scenario_version:RAW[sid].version, case_id:S.case_id, learner, role:studentRole, class_code};
    sc = SIMENGINE.publicScenario(RAW[sid], case_id, mode==='demo'); run='local'; applyState(S.state(0));
    progressStart();
  }catch(e){ toast('Không bắt đầu được: '+e.message,'bad'); if(/mã lớp/i.test(e.message)) $('classCode').focus(); return; }
  if(window.SIMVIDEO) SIMVIDEO.load(sc);
  pendingResult=null; lastFile=null; paletteKey=""; t0=performance.now(); botAt=t0+1200; liveT=0; studentPos=P.door.slice(); scrubbing=null; pickStep=null; placed={}; waitingShown=false;
  if(window.ENDOLAP) ENDOLAP.reset();
  $('setup').hidden=true; $('runPanel').hidden=false; $('log').innerHTML=''; $('noteBox').hidden=true; $('decision').hidden=true;
  $('runMode').textContent = mode==='demo' ? 'Xem thị phạm' : `Thực hành: vai ${ROLE_VI[studentRole]}`;
  $('runTitle').textContent = sc.title;
  $('runCase').hidden = !sc.case; if(sc.case){ $('runCaseTitle').textContent=sc.case.title; $('runCaseSum').textContent=sc.case.summary; }
  $('m2tools').hidden = !(sc.id==='m2_sterile_basics' && mode==='practice');
  OR3D.setZones(sc.zones);
  buildPalette(); renderSteps(); viz(true);
  OR3D.highlight(studentRole?[roleKey(studentRole)]:[]);
  banner(mode==='demo' ? 'Thị phạm: '+sc.title : 'Thực hành: làm đúng phần việc của vai '+ROLE_VI[studentRole]);
  const v = sc.id==='m2_sterile_basics' ? 'follow:stu1' : (isLap() ? 'top' : 'overview');
  setSeg('viewSeg',v); OR3D.view(v);
};
const simT = () => Math.round((performance.now()-t0))/1000;   // giây kể từ lúc bắt đầu buổi
$('finishBtn').onclick = () => { if(!run) return; const r=S.finish(simT()); applyState(r); onResult(r.result); };
function endRun(){ progressStop(); run=null; S=null; pickStep=null; $('setup').hidden=false; $('runPanel').hidden=true; banner(null); idleScene(); }

function onResult(res){
  if(pendingResult) return;            // đã xử lý
  pendingResult = res;
  progressStop();
  if(mode==='practice' && sc.quiz && sc.quiz.length){ showQuiz(); return; }
  if(mode==='practice') submit(null); else showResult(res, null);
}
// Gửi nhật ký lên máy chủ để chấm lại (điểm chính thức); không có máy chủ thì chấm câu hỏi tại chỗ.
async function submit(answers){
  const local = pendingResult;
  lastFile = {format:'robo-or-sim-result/1', ...runMeta, started_at:startedAt, log:S.log, t_end:S.last_t,
    quiz_answers:answers||{}, client_result:local};
  if(!SERVER){ const quiz = answers && sc.quiz.length ? S.gradeQuiz(answers) : null; lastFile.client_quiz=quiz; showResult(local, quiz); return; }
  try{
    const r = await api('api/results', {token:startToken, log:S.log, t_end:S.last_t, quiz_answers:answers||{}});
    reg = r.registration; lastFile.registration = reg;
    if(r.result.score!==local.score || r.result.passed!==local.passed) toast('Điểm chính thức do máy chủ chấm lại: '+r.result.score,'warn');
    showResult(r.result, r.quiz, true);
  }catch(e){
    toast('Chưa gửi được kết quả lên máy chủ: '+e.message+'. Hãy tải tệp kết quả để nộp cho giảng viên.','bad');
    showResult(local, null, false);
  }
}
let lastFile = null;

/* ---------- gửi tiến độ cho trang Theo dõi trực tiếp của giảng viên (chỉ bản có máy chủ, chế độ thực hành) ---------- */
let progTimer = null, progSentLen = -1, progLast = 0, progBusy = false;
function progressStart(){
  progressStop();
  if(!SERVER || mode!=='practice' || !startToken) return;
  progSentLen = -1; progLast = 0;
  progTimer = setInterval(()=>sendProgress(false), 10000);
  setTimeout(()=>sendProgress(true), 1500);
}
function progressStop(){ if(progTimer){ clearInterval(progTimer); progTimer=null; } }
async function sendProgress(force){
  if(!S || !startToken || progBusy || pendingResult || !progTimer) return;
  const n = S.log.length, now = performance.now();
  if(!force && n===progSentLen && now-progLast < 30000) return;     // không có thao tác mới: 30 giây gửi một lần để báo còn đang làm
  progBusy = true; const tok = startToken;
  try{
    const r = await api('api/run/progress', {token:tok, log:S.log});
    if(tok===startToken){ progSentLen=n; progLast=now; if(r && r.submitted) progressStop(); }
  }catch(e){ /* mất mạng hoặc máy chủ bận: không làm phiền sinh viên, lần sau gửi lại */ }
  finally{ progBusy = false; }
}
$('resDownload').onclick = () => { if(!lastFile) return;
  const b = new Blob([JSON.stringify(lastFile)], {type:'application/json'}), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = `ket-qua_${lastFile.learner}_${lastFile.scenario_id}_${(lastFile.started_at||'').slice(0,16).replace(/[:T]/g,'-')}.json`;
  document.body.append(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500); };
function showQuiz(){
  const box=$('quizBody'); box.innerHTML='';
  sc.quiz.forEach((q,i)=>{ const f=el('fieldset','q'); f.append(el('legend',null,`${i+1}. ${q.q}`));
    q.options.forEach((o,j)=>{ const lab=el('label'); const inp=document.createElement('input'); inp.type='radio'; inp.name=q.id; inp.value=j; lab.append(inp,' '+o); f.append(lab); });
    box.append(f); });
  $('quiz').showModal();
}
$('quizSubmit').onclick = async () => {
  const answers={}; sc.quiz.forEach(q=>{ const c=document.querySelector(`input[name="${q.id}"]:checked`); if(c) answers[q.id]=+c.value; });
  $('quiz').close(); submit(answers);
};
$('quizSkip').onclick = () => { $('quiz').close(); submit(null); };

function showResult(res, quiz, official){
  $('resTitle').textContent = mode==='demo' ? 'Kết thúc thị phạm' : (res.passed?'Đạt':'Không đạt');
  $('resScore').className='score '+(res.passed?'pass':'fail'); $('resScore').innerHTML = `${res.score} <small>/ 100 điểm quy trình, ${Math.round(res.duration_s)} giây</small>`;
  const ul=$('resList'); ul.innerHTML='';
  const line=(cls,txt)=>{ const li=el('li',cls); li.append(el('span',null,txt)); ul.append(li); };
  if(sc.phases.length){
    sc.phases.forEach(ph=>{ const ids=new Set(sc.steps.filter(s=>s.phase===ph.id).map(s=>s.id));
      const errs=res.issues.filter(i=>ids.has(i.ref)).length, miss=res.missed_critical.filter(m=>ids.has(m)).length;
      line(errs||miss?'warn':'ok', `${ph.title}: ${errs} lỗi, ${miss} bước then chốt bị bỏ sót`); });
  }
  if(res.missed_critical.length) line('bad','Bỏ sót bước then chốt: '+res.missed_critical.map(id=>stepById(id)?.title||id).join('; '));
  res.issues.forEach(i=>line(i.severity==='critical'?'bad':'warn', `${ROLE_VI[i.role]||i.role}: ${i.message}`));
  if(!res.issues.length && !res.missed_critical.length) line('ok','Không có lỗi quy trình.');
  const qb=$('resQuiz'); qb.innerHTML='';
  if(quiz){ qb.append(el('h3',null,`Câu hỏi kiến thức: đúng ${quiz.correct}/${quiz.total}`));
    const ql=el('ul','log'); quiz.items.forEach((it,i)=>{ const li=el('li',it.correct?'ok':'bad');
      li.append(el('span',null,`${i+1}. ${it.correct?'Đúng':'Sai'}. Đáp án: ${it.answer_text}. ${it.explain||''}`)); ql.append(li); }); qb.append(ql); }
  const a=$('resReport'); a.hidden = !(mode==='practice' && official && reg); a.href='session?reg='+encodeURIComponent(reg||'');
  $('resDownload').hidden = mode!=='practice' || !lastFile;
  $('resOfficial').textContent = mode!=='practice' ? '' : (official ? 'Điểm chính thức: máy chủ đã chấm lại và lưu cho giảng viên.'
    : (SERVER ? 'Điểm tạm tính trên máy này (chưa lưu lên máy chủ).' : 'Bản tự luyện: điểm tính trên máy này. Tải tệp kết quả để nộp cho giảng viên nếu được yêu cầu.'));
  $('result').showModal(); endRun();
}

/* ---------- gửi thao tác ---------- */
let chain=Promise.resolve(), pending=0;
function queue(fn){ pending++; const p=chain.then(fn).finally(()=>{ pending--; }); chain=p.catch(()=>{}); return p; }
function send(role, action, target=null, data={}){ return queue(()=>doSend(role, action, target, data)); }
async function doSend(role, action, target, data){
  if(!run) return null;
  if(S.result!==null) return null;
  const r=S.do(role, action, target, data, simT()); handle(r, false); return r;
}
async function botTick(now){
  if(!run || pending>0 || now<botAt) return;
  if(mode==='demo' && window.SIMVIDEO && SIMVIDEO.busy()) return;
  botAt = now + (mode==='demo' ? 2400/speed : 1600);
  await queue(async()=>{ if(!run) return; handle(S.bot(simT()), true); });
}
function handle(r, fromBot){
  applyState(r);
  if(r.idle){
    if(r.result && run){ onResult(r.result); return; }
    viz(false); renderSteps(); buildPalette();
    if(r.waiting && mode==='practice' && !waitingShown){ waitingShown=true;
      banner(hintsOn() ? 'Đến lượt bạn: '+r.waiting_for_student.map(id=>stepById(id).title).join('; ') : 'Ê kíp đang chờ bạn thực hiện phần việc của vai '+ROLE_VI[studentRole],'turn'); }
    return;
  }
  waitingShown=false;
  const fb=r.feedback, a=r.action, step=fb.step_completed?stepById(fb.step_completed):null, who=ROLE_VI[a.role]||a.role;
  if(r.bot && r.bot.point && r.bot.step) placed[r.bot.step]=r.bot.point;
  if(a.action!=='position' || fb.issue){
    if(fb.issue && fb.issue.severity==='critical') setTimeout(()=>sendProgress(true), 300);   // báo giảng viên ngay
    if(fb.issue){ const cls=fb.issue.severity==='critical'?'bad':'warn'; toast(`${who}: ${fb.issue.message}`,cls); logLine(`${who}: ${fb.issue.message}`,cls); }
    else if(step){ const extra = r.bot && r.bot.option ? `: ${r.bot.option}` : '';
      toast(`${who}: ${step.title}${extra}`); logLine(`${who}: ${step.title}${extra}`,'ok');
      if(mode==='demo'||fromBot) banner(`${who}: ${step.title}${extra}`, sc.id==='m6_emergency_undock'?'alarm':'');
      if(window.SIMVIDEO) SIMVIDEO.onStep(step.id);
      if(step.note){ $('noteBox').hidden=false; $('noteTitle').textContent=step.title; $('noteText').textContent=step.note; $('noteSrc').textContent='Nguồn: '+(step.src||'').replace(/^BVNTP/,'Quy trình BV Nguyễn Tri Phương'); } }
    else if(fb.message && a.action!=='contact'){ logLine(`${who}: ${fb.message}`); }
  }
  if(r.bot && sc.id==='m2_sterile_basics'){ if(r.bot.step==='hand_scrub') studentPos=P.sink.slice(); if(r.bot.step==='position') studentPos=P.mark.slice(); }
  if(sc.id==='m2_sterile_basics' && fromBot && r.bot && r.bot.step==='glove') studentPos=P.mark.slice();
  viz(false); renderSteps(); buildPalette();
  if(r.result) setTimeout(()=>onResult(r.result), 1000);
}
function applyState(r){ state=r; done=new Set(r.steps.filter(s=>s.done).map(s=>s.id)); }

/* ---------- bảng thao tác cho học viên ---------- */
function currentPhase(){
  if(!sc.phases.length) return null;
  const nxt = sc.steps.find(s=>s.required && !done.has(s.id));
  return nxt ? nxt.phase : sc.phases[sc.phases.length-1].id;
}
let paletteKey='';
function buildPalette(){
  const box=$('palette');
  if(mode!=='practice' || !sc){ box.innerHTML=''; paletteKey=''; return; }
  const g=el('div','grp');
  let items=[];
  if(sc.phases.length){
    const ph=currentPhase(), phT=(sc.phases.find(p=>p.id===ph)||{}).title;
    g.append(el('span','gtitle',`Giai đoạn: ${phT}. Chọn đúng việc của vai ${ROLE_VI[studentRole]}, đúng lúc.`));
    sc.steps.filter(s=>s.phase===ph && !done.has(s.id)).forEach(s=>{
      (s.targets.length ? s.targets.filter(t=>!(state.steps.find(x=>x.id===s.id)||{done_targets:[]}).done_targets.includes(t)).slice(0,1) : [s.target]).forEach(t=>items.push({s,t})); });
  } else {
    const seen=new Set();
    sc.steps.forEach(st=>{ if(st.action==='hand_scrub') return; (st.targets.length?st.targets:[st.target]).forEach(t=>{ const k=st.action+'|'+(t||''); if(seen.has(k)) return;
      if(!st.roles.includes(studentRole) && st.action==='confirm') return; seen.add(k); items.push({s:st,t}); }); });
    const stepActions=new Set(sc.steps.map(st=>st.action));
    sc.rules.filter(r=>!stepActions.has(r.action)).forEach(r=>items.push({s:null,t:null,a:r.action}));
    g.append(el('span','gtitle',`Thao tác của bạn (vai ${ROLE_VI[studentRole]}). Chọn đúng việc, đúng lúc.`));
    items = items.map((x,i)=>[Math.sin(i*12.9898)*43758.5453%1,x]).sort((p,q)=>p[0]-q[0]).map(p=>p[1]);
  }
  // chỉ dựng lại khi nội dung đổi, để cú bấm của học viên không rơi vào lúc nút đang được thay
  const key=JSON.stringify([g.textContent, hintsOn(), studentRole, items.map(({s,t,a})=>[s&&s.id,t,a])]);
  if(key===paletteKey && box.firstChild) return;
  paletteKey=key; box.innerHTML='';
  items.forEach(({s,t,a})=>{
    const act=a||s.action, lbl=actionLabel(act,t,s);
    const b=el('button','act'+(sc.rules.some(r=>r.action===act)?' danger':'')+(hintsOn()&&s&&s.roles.includes(studentRole)?' mine':''),
      lbl + (s&&s.options?' …':'') + (s&&s.has_area?' (chọn vị trí)':''));
    b.type='button'; b.onclick=()=>studentAct(s,act,t); g.append(b); });
  if(!items.length) g.append(el('span','hint','Không còn việc ở giai đoạn này. Ê kíp đang làm tiếp.'));
  box.append(g);
}
function studentAct(s, a, t){
  $('decision').hidden=true;
  if(s && s.options){ return askDecision(s); }
  if(s && s.has_area){ pickStep=s; banner('Bấm lên sàn phòng mổ để chọn vị trí: '+s.title+(hintsOn()&&s.area_label?` (${s.area_label})`:''),'turn');
    setSeg('viewSeg','top'); OR3D.view('top'); return; }
  if(sc.id==='m2_sterile_basics' && a==='take_position'){
    if(Math.hypot(studentPos[0]-P.mark[0],studentPos[1]-P.mark[1])>.35){ toast('Hãy bấm vào vòng vàng trên sàn để đứng đúng vị trí trước','warn'); return; } }
  send(studentRole, a, t);
}
function askDecision(s){
  const box=$('decision'); box.innerHTML=''; box.hidden=false;
  box.append(el('p','dq',s.title));
  Object.entries(s.options).forEach(([k,lbl])=>{ const b=el('button','act',lbl); b.type='button';
    b.onclick=()=>{ box.hidden=true; send(studentRole, s.action, k); }; box.append(b); });
  const c=el('button','btn',"Huỷ"); c.type='button'; c.onclick=()=>{ box.hidden=true; }; box.append(c);
}
// rửa tay (module 2)
$('scrubBtn').onclick=()=>{
  if(!run) return;
  if(!scrubbing){
    if(Math.hypot(studentPos[0]-P.sink[0],studentPos[1]-P.sink[1])>1.0){ toast('Hãy đi tới bồn rửa tay cạnh cửa (bấm lên sàn gần bồn)','warn'); return; }
    scrubbing={acc:0}; $('scrubBtn').classList.add('on'); $('scrubBtn').textContent='Dừng rửa tay (0 giây)';
  } else {
    const dur=Math.round(scrubbing.acc); scrubbing=null; $('scrubBtn').classList.remove('on'); $('scrubBtn').textContent='Bắt đầu rửa tay';
    send('stu','hand_scrub',null,{duration_s:dur});
  }
};

/* ---------- tương tác trên cảnh 3D ---------- */
window.SIM = {
  onPick(p){
    if(!run || !sc || mode!=='practice') return;
    if(pickStep){ if(p.kind!=='floor'){ toast('Hãy bấm lên sàn phòng mổ','warn'); return; }
      const s=pickStep; pickStep=null; banner(null); placed[s.id]=p.point;
      send(studentRole, s.action, s.target, {point:p.point}); return; }
    if(sc.id!=='m2_sterile_basics' || scrubbing) return;
    const gowned = done.has('gown') && done.has('glove');
    if(p.kind==='zone'){
      if(!$('touchMode').checked){ toast('Bật "Chạm tay" nếu muốn chạm vào '+p.zone.label,'warn'); return; }
      if(Math.hypot(studentPos[0]-p.point[0],studentPos[1]-p.point[2])>.95){ toast('Quá xa để chạm, hãy lại gần hơn','warn'); return; }
      send('stu','contact',null,{point:p.point,is_sterile:gowned}).then(r=>{ if(r && !r.feedback.issue) toast('Chạm bằng găng vô khuẩn: đúng quy tắc'); });
      return;
    }
    const x=Math.max(-4.5,Math.min(4.5,p.point[0])), z=Math.max(-4.5,Math.min(4.5,p.point[2]));
    studentPos=[x,z]; viz(false);
    send('stu','position',null,{point:[x,1.0,z],is_gowned:gowned});
  },
  onLabel(kind,key){ const R=OR3D.ROLE, E=OR3D.EQUIP; const body=$('infoBody'); body.innerHTML='';
    const add=(a,b)=>{ body.append(el('dt',null,a), el('dd',null,b)); };
    if(kind==='role'&&R[key]){ $('infoTitle').textContent=R[key].name; add('Vị trí',R[key].pos); add('Trang phục',R[key].attire); add('Nhiệm vụ',R[key].tasks);
      if(isLap()){ const st=sc.steps.filter(s=>s.roles.includes(key)); if(st.length) add('Việc trong ca này', st.map(s=>s.title).join('; ')); } }
    else if(E[key]){ $('infoTitle').textContent=E[key].name; add('Chức năng',E[key].d); }
    else return; $('info').showModal(); }
};
const roleKey = r => r==='stu' ? 'stu1' : r;

/* ---------- tiến trình ---------- */
function renderSteps(){
  const ol=$('steps'); ol.innerHTML=''; if(!sc || !state) return;
  const hints = hintsOn();
  let lastPh=null;
  state.steps.forEach(s=>{ const st=stepById(s.id);
    if(st.phase && st.phase!==lastPh){ lastPh=st.phase; ol.append(el('li','ph',(sc.phases.find(p=>p.id===st.phase)||{}).title||st.phase)); }
    const li=el('li'); const mine = studentRole && st.roles.includes(studentRole);
    li.className=(s.done?'done ':'')+(mine?'mine ':'')+(st.required===false?'na':'');
    li.append(el('span','st', s.done?'✓':(st.required===false?'–':(s.total>1?`${s.progress}/${s.total}`:'·'))));
    let txt = (s.done||hints) ? `${st.title} (${st.roles.map(r=>ROLE_VI[r]||r).join(', ')})` : (mine?'Việc của bạn: chưa làm':'Ê kíp: chưa làm');
    if(st.required===false) txt += s.done ? '' : ' – không áp dụng ở ca này';
    li.append(el('span',null,txt)); ol.append(li); });
}

/* ---------- ánh xạ trạng thái kịch bản sang cảnh 3D ---------- */
function surgeryBase(){ return {layout:'robot',patient:true,lapPorts:{},lapTools:false,monitorPos:null,backPos:null,foley:false,drain:false,
  tilt:1,insuff:1,drape:true,iodine:true,ett:true,warm:true,ports:true,cart:1,
  arms:{a1:{dock:1,inst:1},cam:{dock:1,inst:1},a2:{dock:1,inst:1},a3:{dock:1,inst:1}}}; }
function person(pos,face,pose,gown,extra={}){ return {pos,face,pose,gown,seated:false,look:null,...extra}; }
function consoleP(){ const s=OR3D.spot('console'); return s?person(s.pos,s.face,'console',false,{seated:true}):person([2.2,1.4],[0,0],'idle',false); }
function backP(pose='tray'){ const s=OR3D.spot('back'); return s?person(s.pos,s.face,pose,true):person([1.1,.7],[1.6,1.2],pose,true); }
function machineP(){ const s=OR3D.spot('machine'); return s?person(s.pos,s.face,'machine',false):person([-1.6,.2],[-2,-.5],'machine',false); }
let endoMode='off', alarm=false, gVit=1;
function idleScene(){ OR3D.setState({...surgeryBase(),alarm:false,tray:false,marker:null,hidden:{},ghost:null,people:{
  ptv:consoleP(),asst:person(P.tableAsst,[.42,0],'table',true),scrub:backP(),anes:person(P.anes,[-.7,0],'machine',false),
  anesN:machineP(),circ:person(P.circDesk,[-3.3,2.9],'tray',false),stu1:person(P.stu1,[.1,0],'observe',false),stu2:person(P.stu2,[0,0],'observe',false)}});
  OR3D.snap(); endoMode='live'; alarm=false; gVit=6.5; }
const at = (id, def) => { const p=placed[id]; return p ? [p[0], p[p.length-1]] : def; };
function vizLap(){
  const D=done, req=id=>{ const s=stepById(id); return s && s.required; };
  const preopDone = sc.steps.filter(s=>s.phase==='preop' && s.required).every(s=>D.has(s.id));
  const inOR = preopDone || ['or_docs','or_patient'].some(x=>D.has(x));
  const anes=D.has('anesthesia'), posd=['pos_ptv','pos_cam','pos_scrub'].every(x=>D.has(x)), closed=D.has('s6_close');
  const wp=(state.steps.find(s=>s.id==='s1_work_ports')||{progress:0}).progress;
  const lp={lc:D.has('s1_cam_port')&&!closed, w1:wp>=1&&!closed, w2:wp>=2&&!closed};
  const tech=D.has('s1_cam_port')&&!closed;
  const s={layout:'lap',patient:inOR,lapPorts:lp,lapTools:tech,monitorPos:D.has('pos_monitor')?at('pos_monitor',[-.45,-1.3]):null,
    backPos:D.has('pos_backtable')?at('pos_backtable',[.8,-1.6]):null,foley:D.has('pre_bladder')&&inOR,drain:D.has('s6_drain'),
    tilt:0,insuff:tech?1:0,drape:(D.has('time_out')||D.has('s1_cam_port'))&&!closed,iodine:D.has('time_out')||D.has('s1_cam_port'),
    ett:anes&&!closed,warm:inOR,ports:false,cart:0,arms:{a1:{dock:0,inst:0},cam:{dock:0,inst:0},a2:{dock:0,inst:0},a3:{dock:0,inst:0}},
    alarm:false,tray:false,marker:null,ghost:null};
  const mon=[-.45,2.0,-1.3], ptvAt=at('pos_ptv',[-.1,.85]), camAt=at('pos_cam',[.7,.9]), scrAt=at('pos_scrub',[.7,-.9]);
  s.people={
    ptv: D.has('pos_ptv') ? person(ptvAt,[ptvAt[0],0],tech?'table':'clasp',true,{look:tech?mon:null}) : person(P.waitPtv,[0,0],'idle',false),
    asst: D.has('pos_cam') ? person(camAt,[camAt[0],0],tech?'table':'clasp',true,{look:tech?mon:null}) : (D.has('supine')?person([.4,.75],[.4,0],'table',false):person(P.waitAsst,[0,0],'idle',false)),
    scrub: D.has('pos_scrub') ? person(scrAt,[scrAt[0],0],tech?'tray':'clasp',true) : person(P.waitScrub,[0,0],'idle',true),
    anes: inOR&&!anes ? person(P.anesHead,[-.7,0],'table',false) : person(P.anes,[-.7,0],'machine',false),
    anesN: machineP(),
    circ: (D.has('or_docs')&&!D.has('or_patient')) || (posd&&!D.has('time_out')) || (D.has('s6_extract')&&!D.has('s6_count')) ? person(P.circTablet,[0,0],'tablet',false) : person(P.circDesk,[-3.3,2.9],'tray',false),
    stu1: person([1.6,1.6],[.1,0],'observe',false,{look:tech?mon:null}), stu2: person([-.6,1.9],[0,0],'observe',false,{look:tech?mon:null})};
  gVit = anes ? (tech?6.5:2) : (inOR?1:0.5);
  const nxt=sc.steps.find(x=>x.required && !D.has(x.id));
  const stage = !inOR ? 'Tiền phẫu tại khoa Ngoại' : (closed ? 'Hậu phẫu' : '');
  const capText = mode==='demo' || hintsOn() ? [stage, nxt?nxt.title:''].filter(Boolean).join(': ') : stage;
  if(window.ENDOLAP) ENDOLAP.set(D, sc.case?caseFacts():{}, wp, capText);
  return s;
}
function caseFacts(){ return (sc.case && sc.case.visual) || {}; } // dữ kiện camera thấy được, không phải đáp án
function viz(snap){
  if(!sc) return; const D=done, W=state.world, mon=[-.85,2.05,.85];
  let s, people={stu2:person(P.stu2,[0,0],'observe',false,{look:mon})};
  if(isLap()){ s=vizLap(); endoMode='lap'; }
  else if(sc.id==='m6_emergency_undock'){
    s=surgeryBase();
    Object.entries(ARM3D).forEach(([n,k])=>{ s.arms[k]={dock:W.docked.includes(n)?1:0, inst:(n==='camera'?W.camera_in:W.instruments_in.includes(n))?1:0}; });
    s.cart=W.cart_at_table?1:0; s.tray=D.has('open_tray'); alarm=D.has('announce')&&!D.has('laparotomy'); s.alarm=alarm;
    Object.assign(people,{
      ptv: D.has('ptv_scrub') ? person(P.tablePtv,[-.15,0],D.has('laparotomy')?'table':'clasp',true) : consoleP(),
      asst: (D.has('announce')&&!D.has('move_cart')) ? person(P.cartSide,[.2,-1.2],'cart',true) : person(P.tableAsst,[.42,0],'table',true),
      scrub: backP(D.has('open_tray')?'tray':'clasp'), anes: person(P.anes,[-.7,0],'machine',false), anesN: machineP(),
      circ: D.has('move_cart') ? person(P.circCart,[0,-1.3],'cart',false) : (D.has('call_help') ? person(P.circTablet,[0,0],'tablet',false) : person(P.circDesk,[-3.3,2.9],'tray',false)),
      stu1: person(P.stu1,[.1,0],'observe',false,{look:alarm?null:mon})});
    s.people=people; endoMode=W.camera_in?'live':'off'; gVit=6.5;
  } else if(sc.id==='m3_safety_checklist'){
    const ind=D.has('induction'), inc=D.has('incision'), so=sc.steps.some(x=>x.id.startsWith('so_')&&D.has(x.id)), out=D.has('leave_room');
    const timeout=ind&&!inc, live=inc&&!so;
    s={...surgeryBase(),tilt:ind?1:0,insuff:live?1:0,drape:ind&&!out,iodine:ind,ett:ind&&!out,ports:live,cart:live?1:0,
       arms:{a1:{dock:live?1:0,inst:live?1:0},cam:{dock:live?1:0,inst:live?1:0},a2:{dock:live?1:0,inst:live?1:0},a3:{dock:0,inst:0}},alarm:false,tray:false};
    Object.assign(people,{ ptv: live ? consoleP() : person(P.tablePtv,[-.15,0],'clasp',ind), asst: person(P.tableAsst,[.42,0],live?'table':'clasp',ind),
      scrub: backP(timeout||so?'clasp':'tray'), anes: ind ? person(P.anes,[-.7,0],'machine',false) : person(P.anesHead,[-.7,0],'table',false),
      anesN: ind ? machineP() : person(P.anesN,[-.75,0],'tray',false),
      circ: (!ind||timeout||so) ? person(P.circTablet,[0,0],'tablet',false) : person(P.circDesk,[-3.3,2.9],'tray',false),
      stu1: person(P.stu1,[.1,0],'observe',false,{look:live?mon:null})});
    s.people=people; endoMode=live?'live':'off'; gVit=live?6.5:(ind?2:1);
    if(out) banner('Người bệnh đã được chuyển ra phòng hồi tỉnh');
  } else {
    s=surgeryBase(); s.alarm=false; s.tray=false; s.marker=P.mark;
    Object.assign(people,{ptv:consoleP(),asst:person(P.tableAsst,[.42,0],'table',true),scrub:backP(),
      anes:person(P.anes,[-.7,0],'machine',false),anesN:machineP(),circ:person(P.circDesk,[-3.3,2.9],'tray',false),
      stu1:person(studentPos.slice(),[0,0],scrubbing?'tray':(D.has('position')?'clasp':'idle'),D.has('gown'))});
    s.people=people; endoMode='live'; gVit=6.5;
  }
  s.sterile=$('showSterile').checked; s.hidden={};
  OR3D.setState(s); if(snap) OR3D.snap();
}

/* ---------- vòng lặp ---------- */
let last=performance.now();
function loop(now){
  const rawDt=Math.max(0,(now-last)/1000), dt=Math.min(.05,rawDt); last=now;
  if(run) $('timer').textContent=fmt((now-t0)/1000);
  if(scrubbing){ scrubbing.acc += rawDt*($('fastScrub').checked?10:1); $('scrubBtn').textContent=`Dừng rửa tay (${Math.floor(scrubbing.acc)} giây)`; }
  liveT += dt;
  if(endoMode==='lap' && window.ENDOLAP) ENDOLAP.draw(dt);
  else if(endoMode==='live') ENDO.drawEndo(ENDO.script(liveT%44), dt);
  else ENDO.drawEndo({mode:'off',msg:'Không có tín hiệu ống soi'}, dt);
  if(alarm){ const x=ENDO.ex; x.setTransform(1200/900,0,0,1200/900,0,0); x.strokeStyle=`rgba(230,40,40,${.5+.5*Math.sin(now/160)})`; x.lineWidth=14; x.strokeRect(0,0,900,600);
    x.fillStyle='rgba(160,20,20,.85)'; x.fillRect(250,520,400,44); x.fillStyle='#fff'; x.font='600 20px system-ui,sans-serif'; x.fillText('Cảnh báo: chảy máu lớn',340,549); }
  ENDO.drawVitals(gVit, now/1000);
  OR3D.frame(dt, now/1000);
  botTick(now);
  requestAnimationFrame(loop);
}
init(); requestAnimationFrame(loop);
})();
