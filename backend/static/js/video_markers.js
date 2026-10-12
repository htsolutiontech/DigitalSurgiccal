const $=id=>document.getElementById(id);
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e;};
const ROLE={ptv:'PTV chính',asst:'Phụ mổ',scrub:'Dụng cụ viên',anes:'BS gây mê',anesN:'ĐD gây mê',circ:'ĐD chạy ngoài',stu:'Sinh viên',res:'BS điều trị',ward:'ĐD khoa Ngoại'};
const fmt=s=>{if(s==null||isNaN(s))return '–';const m=Math.floor(s/60),x=(s%60).toFixed(1).padStart(4,'0');return String(m).padStart(2,'0')+':'+x;};
let SCN=[],scn=null,videos=[],video=null,markers={},sel=null,player=null,ready=false,duration=0,stopAt=null;
async function api(u,o){const r=await fetch(u,o);if(!r.ok){let t=await r.text();try{t=JSON.parse(t).detail;t=typeof t==='string'?t:JSON.stringify(t)}catch(e){}throw new Error(t)}return r.json();}
const hdr=()=>({'Content-Type':'application/json'});
const now=()=>ready&&player.getCurrentTime?player.getCurrentTime():0;

async function init(){
  SCN=await api('/api/scenarios');
  const withVid=[];for(const s of SCN){const v=await api('/api/media/'+s.id);if(v.length)withVid.push(s);}
  if(!withVid.length){$('stTitle').textContent='Chưa có kịch bản nào có video';return;}
  withVid.forEach(s=>{const o=el('option',null,`Module ${s.module}: ${s.title}`);o.value=s.id;$('scn').append(o);});
  const q=new URLSearchParams(location.search).get('scenario');$('scn').value=(q&&withVid.some(s=>s.id===q))?q:withVid[0].id;
  await loadScenario();
}
async function loadScenario(){
  scn=SCN.find(s=>s.id===$('scn').value);videos=await api('/api/media/'+scn.id);
  $('vid').innerHTML='';videos.forEach(v=>{const o=el('option',null,`${v.title} (${v.channel})`);o.value=v.key;$('vid').append(o);});
  await loadVideo();
}
async function loadVideo(){
  video=videos.find(v=>v.key===$('vid').value)||videos[0];markers=video.markers||{};
  $('vnote').hidden=!video.note;$('vnote').textContent=video.note||'';$('srcLink').href=video.source_url;
  if(player&&ready)player.cueVideoById(video.video_id);else makePlayer();
  renderSteps();select(sel&&scn.steps.some(s=>s.id===sel)?sel:scn.steps[0].id);
}
function makePlayer(){
  if(!window.YT||!YT.Player){return;}
  player=new YT.Player('player',{videoId:video.video_id,host:'https://www.youtube-nocookie.com',
    playerVars:{rel:0,modestbranding:1,playsinline:1,origin:location.origin},events:{onReady:()=>{ready=true;duration=player.getDuration()||0;renderTimeline();}}});
}
window.onYouTubeIframeAPIReady=()=>{if(video)makePlayer();};
(function loadYT(){const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';
  s.onerror=()=>{const d=el('div','offline','Không tải được trình phát YouTube (máy không có Internet hoặc bị chặn). Vẫn xem và sửa mốc bằng số được; mở video trên YouTube để lấy thời điểm.');$('pwrap').append(d);};
  document.head.append(s);})();

function renderSteps(){
  const ol=$('steps');ol.innerHTML='';let lp=null;const phT=Object.fromEntries((scn.phases||[]).map(p=>[p.id,p.title]));
  scn.steps.forEach(s=>{if(s.phase&&s.phase!==lp){lp=s.phase;ol.append(el('li','ph',phT[s.phase]||s.phase));}
    const m=markers[s.id];const li=el('li','st'+(m?' has':''));li.setAttribute('aria-selected',s.id===sel?'true':'false');li.tabIndex=0;
    li.append(el('span','m',m?`${fmt(m.start)}–${fmt(m.end)}`:'chưa gắn'));const t=el('span',null,s.title);
    if(m&&m.differs)t.append(el('div','d','Khác quy trình chuẩn'));li.append(t);
    li.onclick=()=>select(s.id);li.onkeydown=e=>{if(e.key==='Enter')select(s.id);};ol.append(li);});
  const n=Object.keys(markers).length;$('progTxt').textContent=`Đã gắn ${n}/${scn.steps.length} bước. Không phải bước nào cũng có trong video (ví dụ tiền phẫu, hậu phẫu); để trống các bước đó.`;
  $('prog').style.width=(100*n/scn.steps.length)+'%';renderTimeline();
}
function renderTimeline(){
  const tl=$('tline');tl.innerHTML='';const D=duration||Math.max(60,...Object.values(markers).map(m=>m.end));
  Object.entries(markers).forEach(([k,m])=>{const sp=el('span',k===sel?'sel':'');sp.style.left=(100*m.start/D)+'%';sp.style.width=Math.max(.4,100*(m.end-m.start)/D)+'%';
    sp.title=(scn.steps.find(s=>s.id===k)||{}).title||k;tl.append(sp);});
  const i=el('i');i.id='cursor';tl.append(i);
}
$('tline').onclick=e=>{const r=$('tline').getBoundingClientRect();const D=duration||60;if(ready)player.seekTo((e.clientX-r.left)/r.width*D,true);};
function select(id){sel=id;const s=scn.steps.find(x=>x.id===id);const m=markers[id]||{};
  $('stTitle').textContent=s.title;$('stMeta').textContent=`Vai trò: ${s.roles.map(r=>ROLE[r]||r).join(', ')}`+(s.src?` · Nguồn: ${s.src.replace(/^BVNTP/,'Quy trình BV Nguyễn Tri Phương')}`:'');
  $('start').value=m.start??'';$('end').value=m.end??'';$('note').value=m.note||'';$('differs').checked=!!m.differs;$('msg').textContent='';
  document.querySelectorAll('#steps li.st').forEach(li=>li.setAttribute('aria-selected','false'));renderSteps();
  if(m.start!=null&&ready){player.seekTo(m.start,true);player.pauseVideo();}}
const setStart=()=>{$('start').value=now().toFixed(1);};const setEnd=()=>{$('end').value=now().toFixed(1);};
$('setStart').onclick=setStart;$('setEnd').onclick=setEnd;
async function save(){
  if(!sel)return;const body={start:+$('start').value,end:+$('end').value,note:$('note').value,differs:$('differs').checked,author:$('author').value.trim()};
  try{const r=await api(`/api/media/${scn.id}/${video.key}/markers/${sel}`,{method:'PUT',headers:hdr(),body:JSON.stringify(body)});
    markers[sel]=r;$('msg').textContent='Đã lưu.';renderSteps();
    const i=scn.steps.findIndex(s=>s.id===sel);const saved=scn.steps[i].title;if(i<scn.steps.length-1)setTimeout(()=>{select(scn.steps[i+1].id);$('msg').textContent='Đã lưu: '+saved+'. Chuyển sang bước tiếp theo.';},400);}
  catch(e){$('msg').textContent='Không lưu được: '+e.message;}}
$('save').onclick=save;
$('del').onclick=async()=>{if(!sel||!markers[sel])return;try{await api(`/api/media/${scn.id}/${video.key}/markers/${sel}`,{method:'DELETE',headers:hdr()});delete markers[sel];renderSteps();select(sel);}catch(e){$('msg').textContent='Không xoá được: '+e.message;}};
$('preview').onclick=()=>{const a=+$('start').value,b=+$('end').value;if(!ready||!(b>a))return;stopAt=b;player.seekTo(a,true);player.playVideo();};
$('play').onclick=()=>{if(!ready)return;stopAt=null;player.getPlayerState()===1?player.pauseVideo():player.playVideo();};
[['back5',-5],['back1',-1],['fwd1',1],['fwd5',5]].forEach(([id,d])=>$(id).onclick=()=>{if(ready)player.seekTo(Math.max(0,now()+d),true);});
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
  if(e.key==='[')setStart();else if(e.key===']')setEnd();else if(e.key==='s'||e.key==='S'){e.preventDefault();save();}});
$('scn').onchange=loadScenario;$('vid').onchange=loadVideo;
$('exp').onclick=async()=>{const d=await api(`/api/media/${scn.id}/${video.key}/export`);const a=el('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));
  a.download=`moc_video_${scn.id}_${video.key}.json`;a.click();};
$('impBtn').onclick=()=>$('imp').click();
$('imp').onchange=async()=>{const f=$('imp').files[0];if(!f)return;try{const d=JSON.parse(await f.text());const ms=d.markers||d;
  const r=await api(`/api/media/${scn.id}/${video.key}/import`,{method:'POST',headers:hdr(),body:JSON.stringify({markers:ms,replace:confirm('Thay toàn bộ mốc hiện có? (Huỷ = gộp thêm)')})});
  $('msg').textContent=`Đã nhập ${r.imported} mốc.`;videos=await api('/api/media/'+scn.id);video=videos.find(v=>v.key===video.key);markers=video.markers;renderSteps();}
  catch(e){$('msg').textContent='Không nhập được: '+e.message;}};
setInterval(()=>{if(!ready)return;const t=now();$('now').textContent=fmt(t);const c=$('cursor');if(c&&duration)c.style.left=(100*t/duration)+'%';
  if(stopAt!=null&&t>=stopAt){player.pauseVideo();stopAt=null;}},200);
init();
