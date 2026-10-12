const ROLE={ptv:'PTV chính',asst:'Phụ mổ',scrub:'Dụng cụ viên',anes:'BS gây mê',anesN:'ĐD gây mê',circ:'ĐD chạy ngoài',stu:'Sinh viên',res:'BS điều trị',ward:'ĐD khoa Ngoại'};
const STATUS={active:'Đang làm',idle:'Tạm dừng',submitted:'Đã nộp'};
const $=id=>document.getElementById(id);
const el=(t,c,txt)=>{const e=document.createElement(t);if(c)e.className=c;if(txt!==undefined)e.textContent=txt;return e;};
const mmss=s=>s==null?'–':String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');
const ago=s=>s==null?'–':(s<60?Math.round(s)+' giây trước':Math.round(s/60)+' phút trước');
let busy=false;

async function load(){
  if(busy)return;busy=true;
  try{
    const r=await fetch('/api/live?hours='+$('hours').value);
    if(!r.ok)throw new Error(r.status+' '+r.statusText);
    render(await r.json());
  }catch(e){$('updated').textContent='Không tải được: '+e.message;}
  finally{busy=false;}
}

function render(d){
  const known=new Set([...$('scn').options].map(o=>o.value));
  d.sessions.forEach(x=>{if(!known.has(x.scenario)){const o=el('option',null,x.scenario_title);o.value=x.scenario;$('scn').append(o);known.add(x.scenario);}});
  const f=$('scn').value;
  let rows=d.sessions.filter(x=>!f||x.scenario===f);
  const crit=x=>x.progress?x.progress.critical:0;
  const act=rows.filter(x=>x.status==='active');
  $('nActive').textContent=act.length;$('nCrit').textContent=act.filter(x=>crit(x)>0).length;
  $('critBox').classList.toggle('alert',act.some(x=>crit(x)>0));
  $('nIdle').textContent=rows.filter(x=>x.status==='idle').length;$('nDone').textContent=rows.filter(x=>x.status==='submitted').length;
  if(!$('showDone').checked)rows=rows.filter(x=>x.status!=='submitted');
  const order={active:0,idle:1,submitted:2};
  rows.sort((a,b)=>order[a.status]-order[b.status]||crit(b)-crit(a)||((b.progress||{}).issues||0)-((a.progress||{}).issues||0));
  $('updated').textContent='Cập nhật '+new Date().toLocaleTimeString('vi-VN');
  const box=$('list');box.innerHTML='';
  if(!rows.length){box.append(el('p','empty','Chưa có buổi nào trong khoảng thời gian này. Khi sinh viên bấm "Bắt đầu" ở chế độ Thực hành, buổi sẽ hiện ở đây.'));return;}
  const t=el('table'),h=el('tr');
  ['Học viên, vai','Kịch bản, ca','Thời gian','Tiến độ','Đang chờ / bước tiếp theo','Lỗi','Lỗi mới nhất','Tín hiệu',''].forEach(x=>h.append(el('th',null,x)));t.append(h);
  rows.forEach(x=>{
    const p=x.progress,tr=el('tr',x.status+(x.status==='active'&&crit(x)>0?' crit':''));
    const c1=el('td');c1.append(el('div','who',x.team||'–'),el('span','pill p-'+x.status,STATUS[x.status]));tr.append(c1);
    const mod=(x.scenario.match(/^m(\d+)_/)||[])[1];
    const c2=el('td');c2.title=x.scenario_title+(p&&p.case_title?' · '+p.case_title:'');
    c2.append(el('div',null,(mod?'Module '+mod:x.scenario_title)+(p&&p.case?' · Ca '+p.case:'')));tr.append(c2);
    tr.append(el('td','num',mmss(p?p.t:x.elapsed_s)));
    const c4=el('td');
    if(x.status==='submitted'&&x.result){c4.append(el('span','pill '+(x.result.passed?'p-active':'p-idle'),(x.result.passed?'Đạt':'Không đạt')+' · '+x.result.score+' điểm'));}
    else if(p){c4.append(el('div','small',`${p.done}/${p.required} bước`+(p.phase?' · '+p.phase:'')));const tk=el('div','track'),fl=el('div','fill');fl.style.width=(p.required?100*p.done/p.required:0)+'%';tk.append(fl);c4.append(tk);}
    else c4.append(el('span','small','vừa bắt đầu'));
    tr.append(c4);
    const c5=el('td');
    if(p&&x.status!=='submitted'){
      if(p.waiting_for_student.length)c5.append(el('div','warn','Chờ sinh viên: '+p.waiting_for_student.join('; ')));
      else if(p.current.length)c5.append(el('div','small',p.current.map(s=>s.title+' ('+s.roles.map(r=>ROLE[r]||r).join(', ')+')').join('; ')));
    }
    tr.append(c5);
    const c6=el('td','num');if(p){c6.append(el('span',p.critical?'bad':null,String(p.issues)));if(p.critical)c6.append(el('div','bad',p.critical+' nghiêm trọng'));}else c6.textContent='–';tr.append(c6);
    const c7=el('td');if(p&&p.last_issues.length){const li=p.last_issues[p.last_issues.length-1];
      c7.append(el('div',li.severity==='critical'?'bad':(li.severity==='major'?'warn':null),(ROLE[li.role]||li.role||'')+': '+li.message),el('div','small','lúc '+mmss(li.t)));}
    tr.append(c7);
    tr.append(el('td','small',x.status==='submitted'?'':ago(x.last_seen_s!=null?x.last_seen_s:x.elapsed_s)));
    const c9=el('td');if(x.status==='submitted'){const a=el('a',null,'Chi tiết, chấm');a.href='/session?reg='+encodeURIComponent(x.registration);c9.append(a);}tr.append(c9);
    t.append(tr);
  });
  box.append(t);
}
['scn','showDone'].forEach(id=>$(id).addEventListener('change',load));$('hours').addEventListener('change',load);
setInterval(load,5000);load();
