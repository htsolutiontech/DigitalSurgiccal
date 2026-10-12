const ROLE={ptv:'PTV chính',asst:'Phụ mổ',scrub:'Dụng cụ viên',anes:'BS gây mê',anesN:'ĐD gây mê',circ:'ĐD chạy ngoài',stu:'Sinh viên',res:'BS điều trị',ward:'ĐD khoa Ngoại'};
const OVERALL={dat:'Đạt',chua_dat:'Chưa đạt',can_lam_lai:'Cần làm lại'};
const DEFAULT_RUBRIC=[{id:'prep',label:'Chuẩn bị'},{id:'safety',label:'An toàn, vô khuẩn, bảng kiểm'},{id:'sequence',label:'Trình tự quy trình'},{id:'team',label:'Phối hợp ê kíp'}];
const $=id=>document.getElementById(id);
const el=(t,c,txt)=>{const e=document.createElement(t);if(c)e.className=c;if(txt!==undefined)e.textContent=txt;return e;};
const reg=new URLSearchParams(location.search).get('reg');
const fmt=s=>s==null?'–':String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');
async function load(){
  if(!reg){$('title').textContent='Thiếu mã buổi (reg)';return;}
  const r=await fetch('/api/session/'+encodeURIComponent(reg));
  if(!r.ok){$('title').textContent='Không tìm thấy buổi này';return;}
  const d=await r.json();
  $('title').textContent=d.scenario_title;
  $('sub').textContent=[d.team, d.case_title, d.case_summary, 'Bắt đầu '+(d.started||'').replace('T',' ').slice(0,19)].filter(Boolean).join(' · ');
  const st=$('stats');st.innerHTML='';
  const stat=(v,l,c)=>{const x=el('div','stat');const b=el('b',c,v);x.append(b,el('span',null,l));st.append(x);};
  stat(d.score??'–','Điểm quy trình',d.passed?'pass':'fail');stat(d.finished?(d.passed?'Đạt':'Không đạt'):'Đang làm','Kết quả hệ thống',d.passed?'pass':'fail');
  stat(d.errors.length,'Lỗi ghi nhận');stat(d.missed_critical.length,'Bước then chốt bỏ sót');stat(d.quiz?d.quiz.correct+'/'+d.quiz.total:'–','Câu hỏi kiến thức');
  // giai đoạn
  const ph=$('phases');ph.innerHTML='';
  d.phases.forEach(p=>{const x=el('div','phbar');const l=el('div','lbl');l.append(el('span',null,p.title),el('span',null,`${p.done}/${p.required} bước · ${p.errors} lỗi`+(p.missed_critical.length?` · bỏ sót ${p.missed_critical.length}`:'')));
    const t=el('div','track'),f=el('div','fill');f.style.width=(p.required?100*p.done/p.required:0)+'%';if(p.errors||p.missed_critical.length)f.style.background='var(--warn)';t.append(f);x.append(l,t);ph.append(x);});
  // bước
  const tb=el('table'),h=el('tr');['Bước','Vai trò','Thời điểm','Người làm','Lỗi'].forEach(x=>h.append(el('th',null,x)));tb.append(h);
  const titles=Object.fromEntries(d.phases.map(p=>[p.id,p.title]));let lp=null;
  d.steps.forEach(s=>{ if(s.phase&&s.phase!==lp){lp=s.phase;const tr=el('tr','ph');const td=el('td',null,titles[s.phase]||s.phase);td.colSpan=5;tr.append(td);tb.append(tr);}
    const tr=el('tr',s.required?'':'na');const t1=el('td',null,(s.done?'✓ ':(s.required?'✗ ':'– '))+s.title);
    if(s.critical)t1.append(el('span','tag','then chốt'));if(!s.required)t1.append(el('span','tag','không áp dụng ở ca này'));
    if(s.src&&!s.src.startsWith('BVNTP'))t1.append(el('span','tag',s.src));
    tr.append(t1,el('td',null,s.roles.map(r=>ROLE[r]||r).join(', ')),el('td','num',fmt(s.t)),el('td',null,ROLE[s.by_role]||s.by_role||''));
    const te=el('td','err',s.errors.join('; '));tr.append(te);tb.append(tr);});
  $('steps').innerHTML='';$('steps').append(tb);
  // câu hỏi
  if(d.quiz_items.length){$('quizPanel').hidden=false;const ul=el('ul','tl');d.quiz_items.forEach((q,i)=>{const li=el('li',q.correct?'':'erred');
    li.append(el('time',null,q.correct?'Đúng':'Sai'),el('span',null,`${i+1}. ${q.q} Chọn: ${q.chosen??'(bỏ trống)'}. Đáp án: ${q.answer}`));ul.append(li);});$('quiz').innerHTML='';$('quiz').append(ul);}
  // dòng thời gian
  const tl=$('timeline');tl.innerHTML='';
  d.timeline.forEach(e=>{const li=el('li',e.verb);const vt={completed:'',erred:'Lỗi: ',passed:'Kết thúc: Đạt',failed:'Kết thúc: Không đạt',terminated:'Đóng phiên',answered:'Nộp câu hỏi kiến thức'}[e.verb]??e.verb;
    li.append(el('time',null,fmt(e.t)),el('span',null,(e.role?(ROLE[e.role]||e.role)+': ':'')+vt+(e.verb==='erred'?e.message:(e.verb==='completed'?e.title:''))));tl.append(li);});
  // phiếu
  const rb=$('rubric');rb.innerHTML='';
  (d.rubric.length?d.rubric:DEFAULT_RUBRIC).forEach(c=>{rb.append(el('label',null,c.label));const g=el('div','rate');
    for(let v=1;v<=5;v++){const id=`r_${c.id}_${v}`;const i=document.createElement('input');i.type='radio';i.name=c.id;i.value=v;i.id=id;const l=el('label',null,String(v));l.htmlFor=id;g.append(i,l);}rb.append(g);});
  const pv=$('prev');pv.innerHTML='';
  d.assessments.slice().reverse().forEach(a=>{const x=el('div','prev');x.append(el('strong',null,`${OVERALL[a.overall]} · ${a.assessor}${a.account&&a.account!==a.assessor?' (tài khoản '+a.account+')':''} · ${a.created.slice(0,16).replace('T',' ')}`));
    x.append(el('div',null,'Điểm tiêu chí: '+Object.entries(a.ratings).map(([k,v])=>`${((d.rubric.find(c=>c.id===k)||{}).label)||k}: ${v}`).join('; ')+(a.mean_rating!=null?` (TB ${a.mean_rating})`:'')));
    if(a.comment)x.append(el('div',null,'Nhận xét: '+a.comment));pv.append(x);});
  if(d.source){$('src').innerHTML='';$('src').append('Nguồn quy trình: ');const a=el('a',null,d.source.label);a.href=d.source.url;a.target='_blank';a.rel='noopener';$('src').append(a);}
  window._rubric=(d.rubric.length?d.rubric:DEFAULT_RUBRIC);
}
$('form').addEventListener('submit',async ev=>{ev.preventDefault();
  const ratings={};window._rubric.forEach(c=>{const x=document.querySelector(`input[name="${c.id}"]:checked`);if(x)ratings[c.id]=+x.value;});
  const r=await fetch('/api/assessments',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({registration:reg,assessor:$('assessor').value.trim(),ratings,overall:$('overall').value,comment:$('comment').value})});
  $('saved').textContent=r.ok?'Đã lưu.':'Không lưu được: '+(await r.text()).slice(0,200);if(r.ok)load();});
load();

document.getElementById('printLink').addEventListener('click',e=>{e.preventDefault();window.print();});
