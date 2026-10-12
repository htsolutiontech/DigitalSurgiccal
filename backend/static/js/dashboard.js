const ROLE={ptv:'PTV chính',asst:'Phụ mổ',scrub:'Dụng cụ viên',anes:'BS gây mê',anesN:'ĐD gây mê',circ:'ĐD chạy ngoài',stu:'Sinh viên',res:'BS điều trị',ward:'ĐD khoa Ngoại'};
const OVERALL={dat:'Đạt',chua_dat:'Chưa đạt',can_lam_lai:'Cần làm lại'};
const el=(t,c,txt)=>{const e=document.createElement(t);if(c)e.className=c;if(txt!==undefined)e.textContent=txt;return e;};
function bars(box,pairs,label){box.innerHTML='';if(!pairs.length){box.append(el('p','empty','Chưa có lỗi.'));return;}
  const max=Math.max(...pairs.map(p=>p[1]));pairs.forEach(([k,v])=>{const d=el('div');d.append(el('div','lbl',(label?label(k):k)+' ('+v+')'));
    const tr=el('div','track'),f=el('div','fill');f.style.width=(v/max*100)+'%';tr.append(f);d.append(tr);box.append(d);});}
async function load(){
  const s=document.getElementById('scn').value,q=s?'?scenario='+s:'';
  const [sum,ses]=await Promise.all([fetch('/api/summary'+q).then(r=>r.json()),fetch('/api/sessions').then(r=>r.json())]);
  document.getElementById('sN').textContent=sum.sessions;document.getElementById('sF').textContent=sum.finished;
  document.getElementById('sP').textContent=sum.pass_rate==null?'–':Math.round(sum.pass_rate*100)+'%';
  document.getElementById('sM').textContent=sum.mean_score??'–';
  document.getElementById('sQ').textContent=sum.quiz_mean==null?'–':sum.quiz_mean+'%';document.getElementById('sA').textContent=sum.assessed;
  bars(document.getElementById('phases'),sum.errors_by_phase);
  bars(document.getElementById('top'),sum.top_errors);bars(document.getElementById('roles'),sum.errors_by_role,k=>ROLE[k]||k);
  const box=document.getElementById('sessions');box.innerHTML='';
  const rows=ses.filter(x=>!s||x.scenario.startsWith(s));
  if(!rows.length){box.append(el('p','empty',window.ROBO_STATIC?'Chưa có buổi nào trên máy này. Bấm "Nhập tệp kết quả của sinh viên" và chọn các tệp .json sinh viên nộp.':'Chưa có buổi nào.'));return;}
  const t=el('table'),h=el('tr');['Ê kíp / học viên','Kịch bản, ca','Điểm','Kết quả','Câu hỏi','Giảng viên',''].forEach(x=>h.append(el('th',null,x)));t.append(h);
  rows.forEach(x=>{const tr=el('tr');tr.append(el('td',null,x.team||'–'),el('td',null,x.scenario.split('/')[0]+(x.case?' · ca '+x.case:'')));
    tr.append(el('td','num',x.score??'–'));const r=el('td');r.append(el('span','pill '+(x.passed?'pass':'fail'),x.passed?'Đạt':(x.finished?'Không đạt':'Đang làm')));tr.append(r);
    tr.append(el('td','num',x.quiz?x.quiz.correct+'/'+x.quiz.total:'–'));
    tr.append(el('td',null,x.assessment?OVERALL[x.assessment.overall]+' ('+x.assessment.assessor+')':'Chưa chấm'));
    const c=el('td'),b=el('button','row-btn',x.errors.length+' lỗi'),a=el('a','row-btn','Chi tiết, chấm');a.href=(window.ROBO_STATIC?'session.html':'/session')+'?reg='+encodeURIComponent(x.registration);a.style.marginLeft='10px';c.append(b,a);tr.append(c);t.append(tr);
    const tr2=el('tr');tr2.hidden=true;const td=el('td');td.colSpan=7;const ul=el('ul','err');
    if(x.missed_critical.length)ul.append(el('li','critical','Bỏ sót bước then chốt: '+x.missed_critical.join(', ')));
    x.errors.forEach(e=>ul.append(el('li',e.severity,(ROLE[e.role]||e.role||'')+': '+e.message)));
    td.append(ul);tr2.append(td);t.append(tr2);b.addEventListener('click',()=>{tr2.hidden=!tr2.hidden;});});
  box.append(t);}
setInterval(()=>{if(document.getElementById('auto').checked)load();},5000);
document.getElementById('scn').addEventListener('change',load);document.getElementById('reload').addEventListener('click',load);load();

// Nhập tệp kết quả từ bản tự luyện: máy chủ chạy lại nhật ký bằng bộ chấm Python rồi lưu như buổi bình thường.
const impFile=document.getElementById('impFile');
document.getElementById('impBtn').addEventListener('click',()=>impFile.click());
document.getElementById('impBtn').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')impFile.click();});
impFile.addEventListener('change',async()=>{const msg=document.getElementById('impMsg');let ok=0,dup=0;const errs=[];
  for(const f of impFile.files){try{const d=JSON.parse(await f.text());
      if(d.format!=='robo-or-sim-result/1')throw new Error('không phải tệp kết quả của hệ thống');
      const r=await fetch('/api/results/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
      if(!r.ok){let m=r.statusText;try{m=(await r.json()).detail||m;}catch(e){}throw new Error(typeof m==='string'?m:JSON.stringify(m));}
      if((await r.json()).duplicate)dup++;else ok++;}catch(e){errs.push(f.name+': '+e.message);}}
  msg.textContent=`Đã nhập ${ok} tệp.`+(dup?` ${dup} tệp đã có từ trước.`:'')+(errs.length?' Lỗi: '+errs.join('; '):'');impFile.value='';load();});
