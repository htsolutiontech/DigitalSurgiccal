// Hình ống soi và monitor sinh hiệu (vẽ bằng canvas 2D). Tách từ bản web phòng mổ.

(()=>{
/* ================== NỘI DUNG CÁC GIAI ĐOẠN ================== */
const PH=[
 {t:'Chuẩn bị phòng mổ và hệ thống robot',short:'Chuẩn bị',dur:10,
  d:'Hệ thống robot được khởi động và tự kiểm tra. Từng tay robot được bọc bằng bao nhựa vô khuẩn chuyên dụng trong khi xe robot còn đỗ xa bàn mổ, các tay thu gọn. Bàn điều khiển đặt sao cho phẫu thuật viên vẫn nhìn thấy và trao đổi được với ê kíp; xe hình ảnh và màn hình treo tường đặt ở nơi mọi người cùng quan sát được.',
  roles:[['Phụ mổ, dụng cụ viên','Bọc vô khuẩn các tay robot, chuẩn bị dụng cụ robot và bộ dụng cụ mổ mở dự phòng.'],['ĐD chạy ngoài','Khởi động hệ thống, kiểm tra nguồn khí CO₂, dao điện, máy hút.'],['PTV chính','Kiểm tra bàn điều khiển, chỉnh tư thế ngồi và công thái học.']],
  on:['ptv','asst','scrub','circ'],
  safe:'Luôn có sẵn bộ dụng cụ mổ mở và quy trình tháo robot khẩn cấp đã được ê kíp diễn tập.'},
 {t:'Sign in và gây mê toàn thân',short:'Sign in, gây mê',dur:11,
  d:'Trước khởi mê, ê kíp thực hiện phần Sign in của Bảng kiểm an toàn phẫu thuật WHO: xác nhận danh tính, vị trí mổ, phương pháp mổ và cam kết đồng ý; kiểm tra máy gây mê và thuốc, đã gắn máy đo SpO₂, tiền sử dị ứng, nguy cơ đường thở khó và mất máu. Bệnh nhân được gây mê toàn thân, đặt ống nội khí quản và dùng thuốc giãn cơ, vì bơm hơi ổ bụng và tư thế dốc đầu cần kiểm soát hô hấp.',
  roles:[['BS gây mê','Dẫn dắt Sign in, khởi mê, đặt nội khí quản, cài đặt thông khí.'],['ĐD chạy ngoài','Đọc và đánh dấu bảng kiểm.'],['PTV chính','Xác nhận vị trí mổ và phương pháp với bệnh nhân trước khi mê.']],
  on:['anes','circ','ptv'],
  safe:'Khi các tay robot đã gắn vào trocar, bệnh nhân tuyệt đối không được cử động. Giãn cơ phải được duy trì đầy đủ suốt ca mổ.'},
 {t:'Tư thế, sát khuẩn và trải khăn',short:'Tư thế',dur:10,
  d:'Bệnh nhân nằm ngửa, cố định chắc vào bàn bằng đai và đệm chống tì đè, hai tay khép sát thân. Với cắt ruột thừa, bàn được chỉnh dốc đầu thấp và nghiêng sang trái để ruột non trôi khỏi hố chậu phải, bộc lộ vùng mổ. Sau đó sát khuẩn da và trải khăn vô khuẩn, dựng khung che phía đầu cho gây mê.',
  roles:[['PTV, phụ mổ','Đặt tư thế, kiểm tra cố định, sát khuẩn và trải khăn.'],['BS gây mê','Kiểm tra lại ống nội khí quản, đường truyền và huyết động sau khi đổi tư thế.']],
  on:['ptv','asst','anes'],
  safe:'Phải hoàn tất tư thế trước khi docking. Khi robot đã gắn, không được thay đổi tư thế bàn, trừ hệ thống có bàn mổ tích hợp chuyển động đồng bộ.'},
 {t:'Time out trước khi rạch da',short:'Time out',dur:12,
  d:'Ngay trước khi rạch da, toàn bộ ê kíp dừng lại. Mọi người giới thiệu tên và vai trò; xác nhận lại bệnh nhân, phương pháp và vị trí mổ. Phẫu thuật viên nêu các bước nguy cơ, thời gian dự kiến và lượng máu mất dự kiến; gây mê nêu lưu ý riêng của bệnh nhân; điều dưỡng xác nhận dụng cụ vô khuẩn và thiết bị hoạt động tốt. Xác nhận kháng sinh dự phòng đã dùng trong vòng 60 phút trước rạch da.',
  roles:[['Toàn ê kíp','Dừng mọi thao tác, cùng xác nhận theo bảng kiểm.'],['ĐD chạy ngoài','Điều phối và ghi nhận.']],
  on:['ptv','asst','scrub','anes','circ'],
  safe:'Time out phải có đủ mặt và sự chú ý của tất cả thành viên. Không bỏ qua dù ca mổ đơn giản.'},
 {t:'Bơm hơi ổ bụng và đặt trocar',short:'Đặt trocar',dur:11,
  d:'Tạo khoang hơi bằng khí CO₂, áp lực thường 12–15 mmHg ở người lớn. Trocar camera được đặt trước để quan sát toàn bộ ổ bụng, sau đó các trocar robot 8 mm được đặt dưới quan sát trực tiếp. Các trocar robot thường xếp theo một hàng, cách nhau vài cm (khoảng 6–8 cm, tùy hệ thống), hướng về vùng mổ. Thêm một trocar cho phụ mổ để hút rửa, đưa clip và túi bệnh phẩm.',
  roles:[['PTV chính','Đặt trocar khi còn đứng vô khuẩn tại bàn mổ.'],['BS gây mê','Theo dõi EtCO₂, áp lực đường thở và huyết động khi bơm hơi.'],['Phụ mổ','Hỗ trợ đặt trocar, giữ ống soi.']],
  on:['ptv','anes','asst'],
  safe:'Trocar đặt quá gần nhau làm các tay robot va nhau bên ngoài cơ thể và hạn chế tầm hoạt động của dụng cụ.'},
 {t:'Docking robot',short:'Docking',dur:11,
  d:'Xe robot được đẩy vào và định hướng về vùng mổ. Từng tay robot được nối vào trocar; vị trí nối chính là tâm chuyển động từ xa (RCM) nằm ở thành bụng, quanh đó dụng cụ xoay mà không kéo rách lỗ trocar. Ống soi 3D được lắp trước, sau đó các dụng cụ được đưa vào dưới quan sát camera.',
  roles:[['Phụ mổ, dụng cụ viên','Hướng dẫn đẩy xe, nối tay robot vào trocar, lắp dụng cụ.'],['PTV chính','Chỉ đạo docking, kiểm tra tầm hoạt động của các tay.']],
  on:['asst','scrub','ptv'],
  safe:'Mọi dụng cụ đưa vào ổ bụng phải dưới quan sát của camera để tránh tổn thương tạng.'},
 {t:'Phẫu thuật tại bàn điều khiển',short:'Phẫu thuật',dur:44,
  d:'Phẫu thuật viên chính rời bàn mổ, tháo áo vô khuẩn và ngồi vào bàn điều khiển cách bệnh nhân vài mét. Bàn điều khiển cho hình ảnh 3D phóng đại; tay cầm điều khiển dụng cụ có khớp cổ tay, bàn đạp chuyển camera và kích hoạt năng lượng. Phụ mổ vô khuẩn ở cạnh bệnh nhân thay dụng cụ, hút rửa, đưa túi bệnh phẩm. Ê kíp trao đổi qua loa và micro của hệ thống.',
  roles:[['PTV chính','Điều khiển robot từ bàn điều khiển.'],['Phụ mổ','Thay dụng cụ, hút rửa, quan sát các tay robot bên ngoài.'],['Dụng cụ viên','Chuẩn bị dụng cụ thay thế, clip, túi bệnh phẩm.'],['BS gây mê','Theo dõi liên tục, báo ngay thay đổi bất thường.']],
  on:['ptv','asst','scrub','anes'],
  safe:'Phụ mổ là mắt và tay của PTV tại bàn mổ: phát hiện va chạm tay robot bên ngoài, tì đè lên bệnh nhân và báo ngay cho PTV.'},
 {t:'Tháo robot, xả khí, đóng vết mổ',short:'Tháo robot',dur:11,
  d:'Dụng cụ được rút ra dưới quan sát camera, các tay robot tháo khỏi trocar và xe robot được đẩy ra. Phẫu thuật viên quay lại bàn mổ, kiểm tra cầm máu, xả hết khí CO₂, rút trocar dưới quan sát, khâu cân các lỗ trocar lớn (thường từ 10 mm trở lên) và đóng da.',
  roles:[['Phụ mổ, dụng cụ viên','Rút dụng cụ, tháo tay robot, đẩy xe ra.'],['PTV chính','Quay lại bàn mổ, kiểm tra và đóng vết mổ.'],['BS gây mê','Chuẩn bị thoát mê.']],
  on:['asst','scrub','ptv','anes'],
  safe:'Tháo robot khẩn cấp (ví dụ chảy máu lớn cần chuyển mổ mở) phải làm được nhanh và đúng thứ tự. Ê kíp cần diễn tập định kỳ.'},
 {t:'Sign out',short:'Sign out',dur:10,
  d:'Trước khi bệnh nhân rời phòng mổ: xác nhận tên phẫu thuật đã thực hiện; đếm đủ dụng cụ, gạc và kim; dán nhãn bệnh phẩm (ruột thừa gửi giải phẫu bệnh); ghi nhận sự cố thiết bị nếu có; thống nhất các lưu ý chính cho giai đoạn hồi tỉnh và điều trị sau mổ.',
  roles:[['ĐD chạy ngoài','Đọc bảng kiểm Sign out, ghi nhận.'],['Dụng cụ viên','Đếm dụng cụ, gạc, kim.'],['PTV, BS gây mê','Thống nhất y lệnh và theo dõi sau mổ.']],
  on:['circ','scrub','ptv','anes'],
  safe:'Không kết thúc ca mổ khi số đếm dụng cụ, gạc, kim chưa khớp.'}
];
const SUBS=[[0,'Bộc lộ: tay 1 kẹp đầu ruột thừa, kéo lên để căng mạc treo'],[7,'Hàn và cắt mạc treo ruột thừa, gồm động mạch ruột thừa'],
 [17,'Phụ mổ thay dụng cụ: rút dao hàn mạch, lắp kìm bấm clip'],[20,'Kẹp gốc ruột thừa bằng hai clip'],[25,'Phụ mổ thay dụng cụ: lắp kéo'],
 [27,'Cắt ruột thừa giữa hai clip'],[31,'Đưa bệnh phẩm vào túi; phụ mổ rút túi ra qua lỗ trocar'],[39,'Kiểm tra cầm máu và gốc ruột thừa']];
const subAt=u=>{let s=SUBS[0][1];SUBS.forEach(([t,x])=>{if(u>=t)s=x;});return s;};

/* ================== TIẾN TRÌNH PHÁT ================== */
let phase=0,pt=0,playing=true,speed=1;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=u=>u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2;
const G=()=>phase+clamp(pt/PH[phase].dur);
const sm=(g,a,b)=>ease(clamp((g-a)/(b-a)));

/* ================== HÌNH ỐNG SOI (2D) ================== */
const ec=document.getElementById('endo'),ex=ec.getContext('2d');ec.width=1200;ec.height=800;
const W=900,H=600,FONT='"Be Vietnam Pro","Segoe UI",system-ui,sans-serif';
const B={x:505,y:345},M={x:390,y:438},T0={x:392,y:325},R={x:330,y:150},BAG={x:175,y:330,r:62};
const CEC={x:650,y:440,rx:175,ry:125},ILEUM=[{x:40,y:560},{x:230,y:525},{x:410,y:478},{x:540,y:452}];
const PORT1={x:-60,y:60},PORT2={x:960,y:40},A1R={x:220,y:210},A2R={x:790,y:120},OFF2={x:950,y:46};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
function appCtrl(P){const mx=(B.x+P.x)/2,my=(B.y+P.y)/2,dx=P.x-B.x,dy=P.y-B.y,L=Math.hypot(dx,dy)||1,nx=dy/L,ny=-dx/L,
  side=((M.x-B.x)*nx+(M.y-B.y)*ny)>0?-1:1;return {x:mx+nx*side*22,y:my+ny*side*22};}
function bez(P,t){const C=appCtrl(P),u=1-t;return {x:u*u*B.x+2*u*t*C.x+t*t*P.x,y:u*u*B.y+2*u*t*C.y+t*t*P.y};}
function tang(P,t){const C=appCtrl(P);return {x:2*(1-t)*(C.x-B.x)+2*t*(P.x-C.x),y:2*(1-t)*(C.y-B.y)+2*t*(P.y-C.y)};}
const mesoPt=t=>lerp(B,M,t);
const SEALS=[{t:.35,f:.42,label:'ĐM ruột thừa'},{t:.6,f:.3},{t:.85,f:.3}];
const sealPos=(P,s)=>lerp(bez(P,s.t),mesoPt(s.t),s.f);
const CLIPT=[.07,.2],CUTT=.135;
const STUMP=[],SPEC=[];for(let i=0;i<=14;i++)STUMP.push(bez(R,CUTT*i/14));for(let i=0;i<=32;i++)SPEC.push(bez(R,CUTT+(1-CUTT)*i/32));
const SPECMID=SPEC[16];
function path(u,pts){if(u<=pts[0][0])return {...pts[0][1]};for(let i=0;i<pts.length-1;i++){const [ta,a]=pts[i],[tb,b]=pts[i+1];
  if(u<=tb)return lerp(a,b,ease(clamp((u-ta)/(tb-ta))));}return {...pts[pts.length-1][1]};}
function script(u){
  const st={mode:'live',inst:1,app:{...T0},seal:[0,0,0],clips:[false,false],cut:false,specOff:{x:0,y:0},bag:0,specFade:1,
    a1:{...A1R},c1:false,a2:{...A2R},tool2:'sealer',act2:false,energy:false,cap:subAt(u)};
  // bộc lộ
  if(u<2)st.a1=lerp(A1R,T0,ease(u/2));
  else{st.c1=u>=2.4;const k=ease(clamp((u-2.6)/3.4));st.app=lerp(T0,R,k);st.a1={...st.app};}
  // hàn mạc treo
  const sp=SEALS.map(s=>sealPos(R,s));
  st.a2=path(u,[[7,A2R],[9,sp[0]],[10.4,sp[0]],[11.6,sp[1]],[13,sp[1]],[14.2,sp[2]],[15.6,sp[2]],[16.6,A2R],[17.6,OFF2],[18.8,OFF2],[20,A2R],
    [22,bez(R,CLIPT[0])],[22.6,bez(R,CLIPT[0])],[23.5,bez(R,CLIPT[1])],[24.2,bez(R,CLIPT[1])],[24.8,A2R],[25.4,OFF2],[26.3,OFF2],[27,A2R],
    [29,bez(R,CUTT)],[29.7,bez(R,CUTT)],[31,A2R]]);
  [[9,10.4],[11.6,13],[14.2,15.6]].forEach(([a,b],i)=>{st.seal[i]=clamp((u-a)/(b-a));if(u>a&&u<b){st.energy=true;st.act2=true;}});
  if(u>=18.2)st.tool2='clip';if(u>=25.8)st.tool2='scissors';
  st.clips=[u>=22.3,u>=23.9];if((u>22.1&&u<22.5)||(u>23.7&&u<24.1))st.act2=true;
  if(u>29.1&&u<29.5)st.act2=true;
  if(u>=29.3)st.cut=true;
  // lấy bệnh phẩm
  st.bag=clamp(u-31);
  if(u>=31.8){const k=ease(clamp((u-32)/4));st.specOff={x:(BAG.x-SPECMID.x)*k,y:(BAG.y-SPECMID.y)*k};
    st.a1={x:R.x+st.specOff.x,y:R.y+st.specOff.y};st.c1=u<36.3;
    if(u>36.5)st.a1=lerp(st.a1,A1R,ease(clamp((u-36.5)/1.2)));}
  if(u>37.6){st.specFade=1-clamp((u-37.6)/1.4);st.bag=Math.min(st.bag,st.specFade);}
  return st;}
function finalState(){const st=script(44);st.cap='Rút dụng cụ dưới quan sát camera';return st;}
function endoState(g){
  if(g<4.45)return {mode:'off',msg:'Chưa có tín hiệu ống soi'};
  if(phase===4)return {...script(0),inst:0,cap:'Quan sát toàn bộ ổ bụng, đặt các trocar còn lại dưới quan sát'};
  if(phase===5)return {...script(0),inst:sm(g,5.8,5.97),cap:'Lắp dụng cụ dưới quan sát camera'};
  if(phase===6)return script(pt);
  if(phase===7){if(g>=7.15)return {mode:'off',msg:'Đã rút ống soi'};const st=finalState();st.inst=1-sm(g,7.0,7.12);return st;}
  return {mode:'off',msg:'Ca mổ đã kết thúc'};}

let rng=7;const rnd=()=>{rng=(rng*16807)%2147483647;return rng/2147483647;};
const VES=[];for(let i=0;i<16;i++){const p=[{x:rnd()*W,y:rnd()*H}];let a=rnd()*6.28;for(let j=0;j<6;j++){a+=(rnd()-.5)*.9;const l=p[p.length-1];p.push({x:l.x+Math.cos(a)*40,y:l.y+Math.sin(a)*40});}VES.push(p);}
function pp(c,p){c.beginPath();c.moveTo(p[0].x,p[0].y);for(let i=1;i<p.length;i++)c.lineTo(p[i].x,p[i].y);}
function tube(c,p,w,d,m,h){c.lineCap='round';c.lineJoin='round';pp(c,p);c.strokeStyle=d;c.lineWidth=w;c.stroke();pp(c,p);c.strokeStyle=m;c.lineWidth=w*.78;c.stroke();
  c.save();c.translate(-w*.12,-w*.16);pp(c,p);c.strokeStyle=h;c.lineWidth=w*.22;c.stroke();c.restore();}
function clipG(c,x,y,a){c.save();c.translate(x,y);c.rotate(a+Math.PI/2);c.fillStyle='#6E3A9C';c.fillRect(-3.5,-15,7,30);c.fillStyle='rgba(255,255,255,.35)';c.fillRect(-3.5,-15,2,30);c.restore();}
function lbl(c,t,x,y,s){c.font='600 '+(s||13)+'px '+FONT;c.lineWidth=3.5;c.strokeStyle='rgba(30,10,8,.8)';c.strokeText(t,x,y);c.fillStyle='#fff';c.fillText(t,x,y);}
function instr(c,port,tip,tool,closed,act,name){
  const dx=tip.x-port.x,dy=tip.y-port.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,wr={x:tip.x-ux*26,y:tip.y-uy*26};
  c.lineCap='round';c.beginPath();c.moveTo(port.x,port.y);c.lineTo(wr.x,wr.y);c.strokeStyle='#2b3236';c.lineWidth=17;c.stroke();
  c.beginPath();c.moveTo(port.x,port.y);c.lineTo(wr.x,wr.y);c.strokeStyle='#5b666b';c.lineWidth=12;c.stroke();
  c.beginPath();c.moveTo(port.x-uy*3,port.y+ux*3);c.lineTo(wr.x-uy*3,wr.y+ux*3);c.strokeStyle='rgba(220,230,235,.45)';c.lineWidth=3;c.stroke();
  c.beginPath();c.arc(wr.x,wr.y,8.5,0,6.283);c.fillStyle='#22282b';c.fill();
  let o=.35;if(tool==='grasper')o=closed?.05:.38;else o=act?.03:.32;
  const b=Math.atan2(uy,ux),jw=tool==='sealer'?7:tool==='scissors'?3:5,jc=tool==='scissors'?'#c9d2d6':'#3b4347';
  [-1,1].forEach(s=>{const a=b+s*o;c.beginPath();c.moveTo(wr.x,wr.y);c.lineTo(wr.x+Math.cos(a)*26,wr.y+Math.sin(a)*26);c.strokeStyle=jc;c.lineWidth=jw;c.stroke();});
  if(tool==='sealer'&&act){c.beginPath();c.arc(tip.x,tip.y,13,0,6.283);c.fillStyle='rgba(255,190,60,.35)';c.fill();}
  if(tool==='clip'&&!act)clipG(c,tip.x-ux*6,tip.y-uy*6,b+Math.PI/2);
  lbl(c,name,wr.x+(port.x<0?-58:14),wr.y-16,12);}
const TN={grasper:'kẹp Cadiere',sealer:'dao hàn mạch',clip:'kìm bấm clip',scissors:'kéo cong'};
const smoke=[];
function drawEndo(st,dt){
  ex.setTransform(1200/W,0,0,1200/W,0,0);
  if(st.mode==='off'){ex.fillStyle='#0b0f10';ex.fillRect(0,0,W,H);ex.font='600 24px '+FONT;ex.fillStyle='rgba(255,255,255,.75)';
    ex.fillText(st.msg,W/2-ex.measureText(st.msg).width/2,H/2);ex.font='500 14px '+FONT;ex.fillStyle='rgba(255,255,255,.4)';ex.fillText('Kênh camera 3D',20,30);return;}
  const g=ex.createRadialGradient(450,290,40,450,300,560);g.addColorStop(0,'#c0786a');g.addColorStop(.55,'#9a4f45');g.addColorStop(1,'#4a1d19');ex.fillStyle=g;ex.fillRect(0,0,W,H);
  ex.globalAlpha=.22;ex.strokeStyle='#7a2a26';ex.lineWidth=1.6;VES.forEach(v=>{pp(ex,v);ex.stroke();});ex.globalAlpha=1;
  tube(ex,ILEUM,66,'#a4594d','#d9998a','rgba(255,225,215,.45)');
  ex.beginPath();ex.ellipse(CEC.x,CEC.y,CEC.rx,CEC.ry,0,0,6.283);ex.fillStyle='#d49482';ex.fill();ex.strokeStyle='#9c5245';ex.lineWidth=3;ex.stroke();
  ex.strokeStyle='rgba(150,75,65,.6)';ex.lineWidth=2.5;[[0,-20],[60,10],[-40,40],[90,-50]].forEach(([a,b])=>{ex.beginPath();ex.arc(CEC.x+a,CEC.y+b,38,3.6,5.6);ex.stroke();});
  lbl(ex,'Manh tràng',CEC.x+10,CEC.y+70,12);lbl(ex,'Hồi tràng',90,520,12);
  const P=st.app;
  const e=clamp((dist(B,P)-140)/100);
  if(e>0&&!st.cut){ex.beginPath();for(let i=0;i<=20;i++){const q=bez(P,i/20);i?ex.lineTo(q.x,q.y):ex.moveTo(q.x,q.y);}for(let i=20;i>=0;i--){const q=mesoPt(i/20);ex.lineTo(q.x,q.y);}
    ex.closePath();ex.fillStyle=`rgba(236,198,120,${.55*e})`;ex.fill();
    const art=[];for(let i=0;i<=18;i++){const t=.06+.92*i/18;art.push(lerp(bez(P,t),mesoPt(t),.42));}pp(ex,art);ex.strokeStyle=`rgba(140,25,32,${.85*e})`;ex.lineWidth=3.2;ex.stroke();}
  if(e>0)SEALS.forEach((s,i)=>{const p=sealPos(R,s);if(st.seal[i]>=1){ex.save();ex.translate(p.x,p.y);const tg=tang(R,s.t);ex.rotate(Math.atan2(tg.y,tg.x));
      ex.fillStyle='#5b3a1f';ex.beginPath();ex.ellipse(0,0,7,11,0,0,6.283);ex.fill();ex.strokeStyle='rgba(255,240,220,.9)';ex.lineWidth=1.5;ex.beginPath();ex.moveTo(0,-10);ex.lineTo(0,10);ex.stroke();ex.restore();}
    else if(st.seal[i]>0){ex.strokeStyle='#ffc23d';ex.lineWidth=5;ex.beginPath();ex.arc(p.x,p.y,16,-Math.PI/2,-Math.PI/2+6.283*st.seal[i]);ex.stroke();}
    if(s.label&&st.seal[i]<1&&e>.5&&!st.cut)lbl(ex,s.label,p.x+20,p.y+5,12);});
  if(!st.cut){const pts=[{x:524,y:357}];for(let i=0;i<=26;i++)pts.push(bez(P,i/26));tube(ex,pts,22,'#a65a4c','#e3a693','rgba(255,232,222,.55)');
    CLIPT.forEach((t,i)=>{if(st.clips[i]){const q=bez(P,t),tg=tang(P,t);clipG(ex,q.x,q.y,Math.atan2(tg.y,tg.x));}});}
  else{tube(ex,[{x:524,y:357},...STUMP],22,'#a65a4c','#e3a693','rgba(255,232,222,.55)');
    const q0=bez(R,CLIPT[0]),t0=tang(R,CLIPT[0]);clipG(ex,q0.x,q0.y,Math.atan2(t0.y,t0.x));
    if(st.bag>0){ex.globalAlpha=st.bag;ex.beginPath();ex.ellipse(BAG.x,BAG.y,BAG.r,BAG.r*.8,0,0,6.283);ex.fillStyle='rgba(225,240,245,.3)';ex.fill();
      ex.strokeStyle='rgba(255,255,255,.9)';ex.lineWidth=2.5;ex.stroke();ex.beginPath();ex.ellipse(BAG.x,BAG.y-BAG.r*.62,BAG.r*.75,10,0,0,6.283);ex.stroke();
      lbl(ex,'Túi bệnh phẩm',BAG.x-50,BAG.y+BAG.r+18,12);ex.globalAlpha=1;}
    if(st.specFade>0){ex.globalAlpha=st.specFade;const sp=SPEC.map(p=>({x:p.x+st.specOff.x,y:p.y+st.specOff.y}));tube(ex,sp,22,'#a65a4c','#e3a693','rgba(255,232,222,.55)');
      const q1=bez(R,CLIPT[1]),t1=tang(R,CLIPT[1]);clipG(ex,q1.x+st.specOff.x,q1.y+st.specOff.y,Math.atan2(t1.y,t1.x));ex.globalAlpha=1;}}
  if(st.inst>0){const k=st.inst;
    instr(ex,PORT2,lerp(PORT2,st.a2,k),st.tool2,false,st.act2,'Tay 2: '+TN[st.tool2]);
    instr(ex,PORT1,lerp(PORT1,st.a1,k),'grasper',st.c1,false,'Tay 1: '+TN.grasper);}
  if(st.energy&&Math.random()<.7)smoke.push({x:st.a2.x,y:st.a2.y,vx:(Math.random()-.5)*20,vy:-25-Math.random()*25,l:1});
  for(let i=smoke.length-1;i>=0;i--){const q=smoke[i];q.x+=q.vx*dt;q.y+=q.vy*dt;q.l-=dt*1.1;if(q.l<=0){smoke.splice(i,1);continue;}
    ex.beginPath();ex.arc(q.x,q.y,6+(1-q.l)*10,0,6.283);ex.fillStyle=`rgba(245,245,240,${.28*q.l})`;ex.fill();}
  const v=ex.createRadialGradient(450,300,280,450,300,580);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.55)');ex.fillStyle=v;ex.fillRect(0,0,W,H);
  if(st.energy){ex.font='600 14px '+FONT;const t='Đang phát năng lượng',w=ex.measureText(t).width+24;ex.fillStyle='rgba(255,180,40,.92)';ex.fillRect(W/2-w/2,58,w,26);ex.fillStyle='#2a1a00';ex.fillText(t,W/2-w/2+12,76);}
  if(st.cap){ex.font='600 17px '+FONT;const w=Math.min(W-24,ex.measureText(st.cap).width+32);ex.fillStyle='rgba(8,20,22,.78)';ex.fillRect(W/2-w/2,12,w,36);ex.fillStyle='#fff';ex.fillText(st.cap,W/2-w/2+16,36);}
}

/* ================== MÀN HÌNH MONITOR GÂY MÊ ================== */
const vc=document.createElement('canvas');vc.width=256;vc.height=160;const vx=vc.getContext('2d');
function drawVitals(g,t){vx.fillStyle='#05090a';vx.fillRect(0,0,256,160);
  const ins=sm(g,4,4.35)*(g<7.75?1:1-sm(g,7.75,7.95));const on=g>=0.9;
  vx.strokeStyle='#39e07a';vx.lineWidth=2;vx.beginPath();for(let x=0;x<150;x++){const ph=((x+t*80)%60)/60;const y=40-(ph>.45&&ph<.5?28:ph>.5&&ph<.55?-10:0)*(on?1:0);x?vx.lineTo(x+6,y):vx.moveTo(x+6,y);}vx.stroke();
  vx.strokeStyle='#4fc3ff';vx.beginPath();for(let x=0;x<150;x++){const y=100-(on?14*Math.max(0,Math.sin((x+t*60)/9)):0);x?vx.lineTo(x+6,y):vx.moveTo(x+6,y);}vx.stroke();
  vx.font='700 26px sans-serif';vx.fillStyle='#39e07a';vx.fillText(on?String(Math.round(76+3*Math.sin(t/3))):'--',170,44);
  vx.fillStyle='#4fc3ff';vx.fillText(on?'99':'--',170,104);
  vx.font='600 13px sans-serif';vx.fillStyle='#39e07a';vx.fillText('HR',230,24);vx.fillStyle='#4fc3ff';vx.fillText('SpO₂',214,84);
  vx.fillStyle='#ffd34f';vx.fillText('EtCO₂ '+(g>=1.6?Math.round(34+5*ins):'--')+'   HA '+(on?'118/72':'--/--'),8,148);}


window.ENDO={ec,vc,ex,script,drawEndo,drawVitals,finalState,sm,ease,clamp,W,H,FONT,
  lib:{B,M,T0,R,BAG,CEC,ILEUM,PORT1,PORT2,A1R,A2R,dist,lerp,bez,tang,mesoPt,SEALS,sealPos,CLIPT,CUTT,STUMP,SPEC,SPECMID,VES,pp,tube,clipG,lbl,instr}};
})();
