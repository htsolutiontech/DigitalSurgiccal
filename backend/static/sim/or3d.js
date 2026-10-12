// Cảnh 3D phòng mổ robot (three.js r128). Trạng thái do app.js điều khiển qua window.OR3D.
(()=>{
const {ec,vc}=window.ENDO;
const selectItem=(k,key)=>window.SIM&&window.SIM.onLabel&&window.SIM.onLabel(k,key);
/* ================== CẢNH 3D ================== */
const EXTRA_OUT={};
const orCanvas=document.getElementById('or'),wrap=document.getElementById('orWrap'),labelsEl=document.getElementById('labels');
let renderer,scene,camera,THREE_OK=typeof THREE!=='undefined';
if(THREE_OK){try{renderer=new THREE.WebGLRenderer({canvas:orCanvas,antialias:true});}catch(e){THREE_OK=false;}}
if(!THREE_OK){const d=document.createElement('div');d.className='nogl';d.textContent='Trình duyệt không hiển thị được mô hình 3D (WebGL bị tắt hoặc thư viện không tải được). Phần hình ống soi và thuyết minh vẫn hoạt động.';wrap.append(d);}

const ROLE={
 stu1:{name:'Sinh viên quan sát',pos:'Đứng ngoài vùng vô khuẩn, ở vị trí được ê kíp chỉ định, nhìn được màn hình phẫu thuật. Không đi vào khoảng giữa bàn mổ và bàn dụng cụ, không đi sau lưng người đang mặc áo vô khuẩn.',
  attire:'Quần áo mổ, mũ trùm kín tóc, khẩu trang. Không mặc áo choàng vô khuẩn nếu không tham gia phụ mổ.',
  tasks:'Quan sát và hỏi vào thời điểm phù hợp; giữ khoảng cách an toàn với vùng vô khuẩn (thường khuyến cáo ít nhất khoảng 30 cm, theo quy định của từng bệnh viện); báo ngay nếu nghĩ mình đã chạm vào vùng vô khuẩn.'},
 ptv:{name:'Phẫu thuật viên chính',pos:'Đứng tại bàn mổ khi đặt tư thế, đặt trocar và đóng vết mổ. Trong thì phẫu thuật bằng robot, ngồi tại bàn điều khiển, ngoài vùng vô khuẩn nhưng trong cùng phòng mổ.',
  attire:'Tại bàn mổ: mũ, khẩu trang, kính bảo hộ, áo choàng và găng vô khuẩn. Khi sang bàn điều khiển: tháo áo choàng và găng, giữ quần áo mổ, mũ và khẩu trang.',
  tasks:'Chịu trách nhiệm chính ca mổ; đặt trocar; điều khiển robot; quyết định chuyển sang mổ nội soi thường hoặc mổ mở khi cần.'},
 asst:{name:'Phụ mổ tại bàn',pos:'Đứng cạnh bệnh nhân, phía đối diện xe robot, trong vùng vô khuẩn suốt ca mổ.',
  attire:'Trang phục vô khuẩn đầy đủ: mũ, khẩu trang, kính bảo hộ, áo choàng và găng vô khuẩn.',
  tasks:'Bọc vô khuẩn và docking robot; thay dụng cụ; hút rửa, đưa clip và túi bệnh phẩm qua trocar phụ; theo dõi va chạm của các tay robot; thực hiện tháo robot khẩn cấp khi cần.'},
 scrub:{name:'Dụng cụ viên (điều dưỡng vô khuẩn)',pos:'Đứng giữa bàn dụng cụ và bàn mổ, trong vùng vô khuẩn.',
  attire:'Trang phục vô khuẩn đầy đủ như phẫu thuật viên tại bàn.',
  tasks:'Chuẩn bị, sắp xếp và chuyển dụng cụ; quản lý dụng cụ robot, kể cả giới hạn số lần sử dụng của từng dụng cụ (tùy hệ thống); đếm dụng cụ, gạc, kim trước và sau mổ.'},
 anes:{name:'Bác sĩ gây mê hồi sức',pos:'Phía đầu bệnh nhân, sau khung che đầu, cạnh máy gây mê.',
  attire:'Quần áo mổ, mũ, khẩu trang; mang găng sạch khi làm thủ thuật. Không thuộc vùng vô khuẩn.',
  tasks:'Gây mê toàn thân, kiểm soát đường thở; điều chỉnh thông khí khi bơm hơi và dốc đầu; theo dõi huyết động; dẫn dắt phần Sign in của bảng kiểm.'},
 anesN:{name:'Điều dưỡng / kỹ thuật viên gây mê',pos:'Cạnh máy gây mê, hỗ trợ bác sĩ gây mê.',
  attire:'Quần áo mổ, mũ, khẩu trang, găng sạch khi cần.',
  tasks:'Chuẩn bị thuốc và đường truyền; hỗ trợ đặt nội khí quản; theo dõi dịch truyền; ghi phiếu gây mê.'},
 circ:{name:'Điều dưỡng chạy ngoài',pos:'Di chuyển ngoài vùng vô khuẩn; có bàn làm việc để ghi chép.',
  attire:'Quần áo mổ, mũ, khẩu trang. Không mặc áo choàng vô khuẩn và không chạm vào vùng vô khuẩn.',
  tasks:'Đọc bảng kiểm an toàn phẫu thuật; mở gói dụng cụ vô khuẩn cho dụng cụ viên; vận hành thiết bị; ghi hồ sơ; liên lạc với bên ngoài phòng mổ.'}
};
let showSterile=false;
const EQUIP={
 console:{name:'Bàn điều khiển',d:'Ống nhìn 3D phóng đại, hai tay cầm điều khiển dụng cụ có khớp cổ tay, bàn đạp chuyển camera, ly hợp và kích hoạt năng lượng. Đặt ngoài vùng vô khuẩn, trong cùng phòng mổ, sao cho phẫu thuật viên vẫn trao đổi được với ê kíp.'},
 cart:{name:'Xe robot (xe bệnh nhân)',d:'Mang các tay robot giữ ống soi và dụng cụ. Mỗi tay nối với một trocar và xoay quanh tâm chuyển động từ xa ở thành bụng. Được bọc vô khuẩn trước khi docking.'},
 vision:{name:'Xe hình ảnh',d:'Bộ xử lý hình ảnh và nguồn sáng của ống soi, thường kèm máy bơm hơi CO₂ và máy dao điện; màn hình để ê kíp tại bàn mổ cùng theo dõi.'},
 anesM:{name:'Máy gây mê và monitor',d:'Máy thở, bình bốc hơi thuốc mê, monitor theo dõi điện tim, SpO₂, huyết áp, EtCO₂. Đặt phía đầu bệnh nhân, cạnh cột treo cấp khí y tế.'},
 back:{name:'Bàn dụng cụ vô khuẩn',d:'Dụng cụ robot, dụng cụ nội soi, clip, túi bệnh phẩm và bộ dụng cụ mổ mở dự phòng. Toàn bộ mặt bàn được phủ khăn vô khuẩn và thuộc vùng vô khuẩn.'},
 table:{name:'Bàn mổ và bệnh nhân',d:'Bàn mổ điều chỉnh được tư thế (dốc đầu, nghiêng). Bệnh nhân được gây mê toàn thân, cố định chắc, phủ khăn vô khuẩn chỉ để lộ vùng mổ, có chăn ủ ấm và đường truyền tĩnh mạch.'}
};

ROLE.stu2=ROLE.stu1;
let world={};
if(THREE_OK){
  const V=(x,y,z)=>new THREE.Vector3(x,y,z),Y=V(0,1,0);
  renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color(0xd5e0df);
  camera=new THREE.PerspectiveCamera(42,16/10,0.05,40);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  {const pm=new THREE.PMREMGenerator(renderer),es=new THREE.Scene();
   es.add(new THREE.Mesh(new THREE.BoxGeometry(10,6,10),new THREE.MeshBasicMaterial({color:0xc4d0d0,side:THREE.BackSide})));
   const pn=new THREE.Mesh(new THREE.PlaneGeometry(3,3),new THREE.MeshBasicMaterial({color:new THREE.Color(6,6,6)}));pn.position.y=2.9;pn.rotation.x=Math.PI/2;es.add(pn);
   [[-2.5,1.8,0],[2.5,1.8,0]].forEach(([x,y,z])=>{const q=new THREE.Mesh(new THREE.PlaneGeometry(1.5,1),new THREE.MeshBasicMaterial({color:new THREE.Color(2,2,2),side:THREE.DoubleSide}));q.position.set(x,y,z);q.rotation.y=Math.PI/2;es.add(q);});
   scene.environment=pm.fromScene(es,0.04).texture;}
  scene.add(new THREE.HemisphereLight(0xffffff,0x8a9c9a,0.35));
  const sun=new THREE.DirectionalLight(0xffffff,0.42);sun.position.set(1.5,6,2.5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:1,far:15});sun.shadow.bias=-0.0005;scene.add(sun);
  const mat=(c,o={})=>new THREE.MeshStandardMaterial({color:c,roughness:o.r??.6,metalness:o.m??0,transparent:o.op!==undefined,opacity:o.op??1,emissive:o.e??0x000000,emissiveIntensity:o.ei??1,side:o.ds?THREE.DoubleSide:THREE.FrontSide,map:o.map||null});
  const add=(geo,m,parent,p,rot,sc)=>{const ms=new THREE.Mesh(geo,m);if(p)ms.position.set(...p);if(rot)ms.rotation.set(...rot);if(sc)ms.scale.set(...sc);ms.castShadow=true;ms.receiveShadow=true;(parent||scene).add(ms);return ms;};
  const box=(w,h,d)=>new THREE.BoxGeometry(w,h,d),cyl=(r1,r2,h,s=16,open=false,ts=0,tl=Math.PI*2)=>new THREE.CylinderGeometry(r1,r2,h,s,1,open,ts,tl),sph=(r,a=20,b=14)=>new THREE.SphereGeometry(r,a,b);
  const setLink=(ms,a,b)=>{const d=b.clone().sub(a),L=d.length();if(L<1e-4){ms.visible=false;return;}ms.visible=true;ms.position.copy(a).add(b).multiplyScalar(.5);ms.quaternion.setFromUnitVectors(Y,d.normalize());ms.scale.set(1,L,1);};
  const cvTex=(w,h,draw,rep)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;
    if(rep){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep,rep);}return t;};

  const etexEarly=new THREE.CanvasTexture(ec);etexEarly.encoding=THREE.sRGBEncoding;
  /* ---------- phòng ---------- */
  const floorTex=cvTex(512,512,(c,w,h)=>{c.fillStyle='#a8bbb8';c.fillRect(0,0,w,h);for(let i=0;i<600;i++){c.fillStyle=`rgba(${Math.random()<.5?255:60},${Math.random()<.5?255:80},${Math.random()<.5?255:80},.05)`;c.fillRect(Math.random()*w,Math.random()*h,3,3);}
    c.strokeStyle='#92a6a3';c.lineWidth=3;for(let i=0;i<=4;i++){c.beginPath();c.moveTo(i*128,0);c.lineTo(i*128,h);c.stroke();c.beginPath();c.moveTo(0,i*128);c.lineTo(w,i*128);c.stroke();}},5);
  const floor=add(new THREE.PlaneGeometry(10,10),mat(0xffffff,{r:.85,map:floorTex}),scene,[0,0,0],[-Math.PI/2,0,0]);floor.castShadow=false;
  const wallM=mat(0xd9e5e4,{r:.95}),bandM=mat(0xb4c9c7,{r:.9});
  [[0,1.6,-5,0],[-5,1.6,0,Math.PI/2],[5,1.6,0,-Math.PI/2],[0,1.6,5,Math.PI]].forEach(([x,y,z,r])=>{const w=add(new THREE.PlaneGeometry(10,3.2),wallM,scene,[x,y,z],[0,r,0]);w.castShadow=false;
    const b=add(box(10,.9,.02),bandM,scene,[x,.45,z],[0,r,0]);b.castShadow=false;});
  const ceil=add(new THREE.PlaneGeometry(10,10),mat(0xf0f3f3,{r:.95}),scene,[0,3.2,0],[Math.PI/2,0,0]);ceil.castShadow=false;
  add(box(2.6,.03,2.6),mat(0xffffff,{e:0xf4f8ff,ei:.55}),scene,[0,3.18,0]).castShadow=false;// trần thổi khí sạch
  // cửa trượt có ô kính
  add(box(.06,2.3,1.6),mat(0xc9d3d4,{m:.3,r:.4}),scene,[-4.97,1.15,1.6]);add(box(.07,.5,.6),mat(0x6f8e9a,{op:.6,r:.1}),scene,[-4.96,1.6,1.6]);
  add(box(.08,.04,.3),mat(0x8a9496,{m:.6}),scene,[-4.93,1.05,1.0]);
  // tủ vật tư kính
  for(let i=0;i<3;i++){const x=-3.6+i*.95;add(box(.9,2.0,.45),mat(0xe9eeee,{r:.5}),scene,[x,1.0,-4.75]);
    add(box(.82,1.2,.02),mat(0xa9c4cc,{op:.45,r:.1}),scene,[x,1.35,-4.52]);for(let k=0;k<3;k++)add(box(.8,.02,.4),mat(0xd0d8d9),scene,[x,.85+k*.38,-4.72]);
    for(let k=0;k<5;k++)add(box(.12,.12,.14),mat([0x7fa7c9,0xe0c27a,0xffffff,0x9bc49b][k%4]),scene,[x-.3+k*.15,.93+(k%2)*.38,-4.7]);}
  // đồng hồ treo tường
  const clockC=document.createElement('canvas');clockC.width=clockC.height=128;const clockTex=new THREE.CanvasTexture(clockC);clockTex.encoding=THREE.sRGBEncoding;
  function drawClock(){const c=clockC.getContext('2d'),d=new Date();c.fillStyle='#fff';c.beginPath();c.arc(64,64,62,0,6.283);c.fill();c.strokeStyle='#33424a';c.lineWidth=4;c.stroke();
    for(let i=0;i<12;i++){const a=i/12*6.283;c.beginPath();c.moveTo(64+Math.sin(a)*50,64-Math.cos(a)*50);c.lineTo(64+Math.sin(a)*58,64-Math.cos(a)*58);c.lineWidth=3;c.stroke();}
    const hh=(d.getHours()%12+d.getMinutes()/60)/12*6.283,mm=d.getMinutes()/60*6.283,ss=d.getSeconds()/60*6.283;
    [[hh,30,5,'#22303a'],[mm,44,3,'#22303a'],[ss,50,1.5,'#c0392b']].forEach(([a,l,w,cl])=>{c.strokeStyle=cl;c.lineWidth=w;c.beginPath();c.moveTo(64,64);c.lineTo(64+Math.sin(a)*l,64-Math.cos(a)*l);c.stroke();});clockTex.needsUpdate=true;}
  drawClock();add(cyl(.22,.22,.04,32),mat(0x33424a),scene,[-1.2,2.55,-4.96],[Math.PI/2,0,0]);
  add(new THREE.CircleGeometry(.2,32),new THREE.MeshBasicMaterial({map:clockTex}),scene,[-1.2,2.55,-4.935]).castShadow=false;
  // bảng ổ khí y tế trên tường
  add(box(1.2,.25,.06),mat(0xe2e7e8),scene,[-3.0,1.5,4.95]);
  // đèn mổ LED có cần treo, kiểu phòng mổ hiện đại
  const ceilG=new THREE.Group();scene.add(ceilG);
  const lampM=mat(0xf2f5f6,{m:.15,r:.3}),armM=mat(0xdfe5e7,{m:.2,r:.3}),ledM=mat(0xffffff,{e:0xf4f8ff,ei:2.2}),panelM=mat(0x1d2327,{r:.4,m:.3});
  add(cyl(.12,.12,.12,24),armM,ceilG,[0,3.14,0]);
  const lathe=(pts,seg=32)=>new THREE.LatheGeometry(pts.map(([r,y])=>new THREE.Vector2(r,y)),seg);
  function lightHead(x,y,z,tiltX,tiltZ){const gH=new THREE.Group();gH.position.set(x,y,z);gH.rotation.set(tiltX,0,tiltZ);ceilG.add(gH);
    add(lathe([[0,.13],[.08,.125],[.22,.09],[.33,.03],[.36,0],[.36,-.02],[0,-.02]]),lampM,gH).castShadow=false;
    add(cyl(.33,.33,.01,40),panelM,gH,[0,-.026,0]).castShadow=false;
    add(new THREE.TorusGeometry(.355,.014,8,48),mat(0x3a4045,{m:.4,r:.3}),gH,[0,-.02,0],[Math.PI/2,0,0]).castShadow=false;
    [[.07,6],[.13,12],[.19,16],[.25,22],[.3,26]].forEach(([r,n])=>{for(let i=0;i<n;i++){const a=i/n*6.283+r*7;
      add(new THREE.SphereGeometry(.014,10,6,0,Math.PI*2,Math.PI/2,Math.PI/2),ledM,gH,[Math.cos(a)*r,-.03,Math.sin(a)*r]).castShadow=false;}});
    add(cyl(.032,.026,.12,16),mat(0x9fc3e0,{r:.6}),gH,[0,-.09,0]).castShadow=false;// tay cầm vô khuẩn
    add(cyl(.03,.03,.25,12),armM,gH,[0,.24,0]).castShadow=false;
    const sl=new THREE.SpotLight(0xfff8ec,0.75,6.5,0.42,0.55);sl.position.set(x,y-.05,z);sl.target.position.set(0.05,1.0,0);scene.add(sl,sl.target);return gH;}
  const springArm=(a,b,r)=>{const m=add(cyl(r,r,1,12),armM,ceilG);m.castShadow=false;setLink(m,a,b);add(sph(r*1.4,12,10),armM,ceilG,[b.x,b.y,b.z]).castShadow=false;};
  springArm(V(0,3.1,0),V(.55,2.95,.55),.04);springArm(V(.55,2.95,.55),V(.4,2.72,.45),.035);lightHead(.4,2.55,.45,.25,-.2);
  springArm(V(0,3.06,0),V(-.6,2.95,-.45),.04);springArm(V(-.6,2.95,-.45),V(-.45,2.72,-.35),.035);lightHead(-.45,2.55,-.35,-.22,.22);
  // màn hình treo cần cho ê kíp tại bàn mổ
  springArm(V(0,3.02,0),V(-.9,2.85,.85),.035);springArm(V(-.9,2.85,.85),V(-.85,2.25,.85),.03);
  const pMon=new THREE.Group();pMon.position.set(-.85,2.05,.85);pMon.rotation.y=.95;ceilG.add(pMon);
  add(box(.62,.38,.04),mat(0x23292b),pMon);add(new THREE.PlaneGeometry(.58,.34),new THREE.MeshBasicMaterial({map:etexEarly}),pMon,[0,0,.021]).castShadow=false;
  // cột treo gây mê
  add(box(.32,1.1,.32),mat(0xdfe5e6),scene,[-2.35,2.65,-1.0]);add(box(.36,.55,.36),mat(0xe9eeee),scene,[-2.35,1.85,-1.0]);
  [[0x2e8b57,-.08],[0xf0f0f0,0],[0x1f4e9a,.08],[0xf2c400,.16]].forEach(([c,o])=>add(cyl(.025,.025,.03,12),mat(c),scene,[-2.165,1.95,-1.0+o],[0,0,Math.PI/2]));
  [0,1].forEach(i=>{add(cyl(.07,.07,.24,16),mat(0xdcecf2,{op:.55,r:.1}),scene,[-2.13,1.5,-1.12+i*.18]);});// bình hút

  /* ---------- bàn mổ + bệnh nhân ---------- */
  const steel=mat(0x8d999c,{m:.5,r:.35});
  add(box(.35,.72,.45),steel,scene,[0,.36,0]);add(box(.95,.06,.62),mat(0x6f7b7e,{m:.4}),scene,[0,.03,0]);
  const pg=new THREE.Group();pg.position.set(0,.78,0);scene.add(pg);
  add(box(2.0,.07,.56),mat(0x2d3a40,{r:.7}),pg,[0,.035,0]);add(box(2.0,.05,.56),mat(0x3b4b52,{r:.9}),pg,[0,.095,0]);
  add(box(2.02,.03,.04),steel,pg,[0,.06,.3]);add(box(2.02,.03,.04),steel,pg,[0,.06,-.3]);
  const bodyMat=mat(0x9fb4c8,{r:.9}),skin=0xd6a582,iodine=0xa8703f;
  add(cyl(.17,.15,1.27,24),bodyMat,pg,[.115,.27,0],[0,0,Math.PI/2]);
  add(sph(.11,24,18),mat(0xe0b08e),pg,[-.66,.25,0],null,[1,.95,.9]);
  add(new THREE.SphereGeometry(.115,20,10,0,Math.PI*2,0,Math.PI/2),mat(0x8fb3d0,{r:.9}),pg,[-.7,.27,0],[0,0,Math.PI/2]);// mũ bệnh nhân
  const domeMat=mat(skin,{r:.7});const dome=add(new THREE.SphereGeometry(1,32,16,0,Math.PI*2,0,Math.PI/2),domeMat,pg,[.08,.37,0]);
  const drape=add(box(1.95,.04,.86),mat(0x2c8c8a,{r:.95}),pg,[.08,.39,0]);
  const drapeHang=[.43,-.43].map(z=>add(box(1.95,.4,.02),mat(0x2c8c8a,{r:.95}),pg,[.08,.2,z]));
  const screenD=add(box(.04,.55,.98),mat(0x2c8c8a,{r:.95}),pg,[-.47,.64,0]);
  const warm=add(box(.9,.05,.6),mat(0xf3f5f6,{r:.95}),pg,[-.15,.43,0]);// chăn ủ ấm phần thân trên
  const ett=add(cyl(.012,.012,.36),mat(0xe8f0f2,{op:.85}),pg,[-.8,.37,0],[0,0,-.9]);
  const portsL={a1:V(.18,0,-.11),cam:V(.05,0,-.08),a2:V(-.08,0,-.05),a3:V(.25,0,-.03),ap:V(-.02,0,.09),
    lc:V(.1,0,.0),w1:V(.2,0,-.11),w2:V(.25,0,.02)};// lc: trocar camera cạnh rốn; w1, w2: trocar thao tác (vị trí minh họa)
  const domeY=(x,z,ry)=>.37+ry*Math.sqrt(Math.max(0,1-((x-.08)/.2)**2-(z/.17)**2));
  const portMesh={};Object.entries(portsL).forEach(([k,p])=>{p.y=domeY(p.x,p.z,.12);const g=new THREE.Group();g.position.set(p.x,p.y+.02,p.z);pg.add(g);
    add(cyl(.014,.014,.08,12),mat(0x30393d,{m:.5}),g);add(cyl(.022,.022,.025,12),mat(k==='ap'?0x2b6cb0:0x1f2a2e,{m:.3}),g,[0,.045,0]);portMesh[k]=g;});
  const TIN=V(.22,.33,.08);
  // cột truyền dịch
  add(cyl(.012,.012,1.95),steel,scene,[-1.05,.98,.62]);[0,1.57].forEach(r=>add(box(.5,.03,.04),steel,scene,[-1.05,.04,.62],[0,r,0]));
  add(box(.1,.03,.03),steel,scene,[-1.05,1.93,.62]);add(box(.09,.17,.03),mat(0xe6f2f7,{op:.75,r:.1}),scene,[-1.0,1.8,.62]);
  const ivLine=add(cyl(.004,.004,1),mat(0xe8f0f2,{op:.8}));
  // máy sưởi ấm + ống
  add(box(.32,.4,.3),mat(0xe4e9ea),scene,[-1.1,.2,-.75]);const warmHose=add(cyl(.03,.03,1),mat(0xe2873a,{r:.7}));

  /* ---------- máy gây mê ---------- */
  const an=new THREE.Group();an.position.set(-1.95,0,-.45);an.rotation.y=.35;scene.add(an);
  add(box(.65,.8,.55),mat(0xdfe5e6),an,[0,.45,0]);add(box(.7,.05,.6),mat(0xc7d0d2),an,[0,.87,0]);add(box(.6,.35,.4),mat(0xe9eeee),an,[0,1.05,-.05]);
  add(cyl(.07,.07,.2,16),mat(0xd8eef5,{op:.5,r:.1}),an,[.2,.98,.2]);[[-.15,0x7c4dff],[.0,0xf2c400]].forEach(([x,c])=>add(box(.08,.16,.08),mat(c),an,[x,1.3,.05]));
  [0,1,2,3].forEach(i=>add(cyl(.04,.04,.05,12),mat(0x111111),an,[(i%2?.25:-.25),.03,(i<2?.22:-.22)]));
  const vtex=new THREE.CanvasTexture(vc);vtex.encoding=THREE.sRGBEncoding;
  add(cyl(.02,.02,.5),steel,an,[0,1.47,-.1]);add(box(.48,.33,.04),mat(0x2a2f31),an,[0,1.75,-.05]);
  add(new THREE.PlaneGeometry(.43,.28),new THREE.MeshBasicMaterial({map:vtex}),an,[0,1.75,-.028]).castShadow=false;
  const breath=add(cyl(.018,.018,1),mat(0x8fbfdc,{r:.6}));

  /* ---------- bàn dụng cụ + bàn Mayo ---------- */
  const back=new THREE.Group();back.position.set(1.65,0,1.25);scene.add(back);
  add(box(1.2,.04,.6),steel,back,[0,.9,0]);[[-.55,-.26],[.55,-.26],[-.55,.26],[.55,.26]].forEach(([x,z])=>add(cyl(.015,.015,.9),steel,back,[x,.45,z]));
  add(box(1.22,.02,.62),mat(0x2c8c8a,{r:.95}),back,[0,.93,0]);add(box(1.22,.35,.01),mat(0x2c8c8a,{r:.95}),back,[0,.77,.31]);
  add(box(.45,.05,.3),mat(0xb7c0c3,{m:.6,r:.3}),back,[-.3,.965,0]);for(let i=0;i<7;i++)add(cyl(.005,.005,.24,6),mat(0xd5dadc,{m:.85,r:.2}),back,[.1+i*.06,.95,-.05],[0,0,Math.PI/2]);
  for(let i=0;i<3;i++)add(cyl(.006,.006,.42,8),mat(0x30393d,{m:.5}),back,[.15,.955,.12+i*.05],[0,0,Math.PI/2]);
  add(box(.18,.06,.12),mat(0x7a4bb0),back,[.45,.97,-.18]);
  const mayo=new THREE.Group();mayo.position.set(1.3,0,-.2);scene.add(mayo);
  add(cyl(.015,.015,1.05),steel,mayo,[0,.52,0]);add(box(.5,.02,.35),steel,mayo,[0,1.05,0]);add(box(.52,.015,.37),mat(0x2c8c8a,{r:.95}),mayo,[0,1.065,0]);
  add(box(.7,.04,.04),steel,mayo,[0,.03,0]);
  // xô đá + thùng rác
  add(cyl(.18,.15,.3,20),steel,scene,[.8,.17,-.55]);add(cyl(.2,.2,.04,20),mat(0x50595c),scene,[.8,.02,-.55]);
  add(box(.35,.55,.35),mat(0xe8c21a,{r:.7}),scene,[3.2,.275,-4.6]);add(box(.35,.55,.35),mat(0x2f8f4a,{r:.7}),scene,[3.65,.275,-4.6]);
  // bàn làm việc điều dưỡng
  const desk=new THREE.Group();desk.position.set(-3.3,0,2.9);desk.rotation.y=Math.PI/2;scene.add(desk);
  add(box(1.2,.04,.6),mat(0xdfe5e6),desk,[0,.78,0]);add(box(1.2,.74,.04),mat(0xcdd5d6),desk,[0,.39,-.28]);
  add(box(.5,.32,.03),mat(0x23292b),desk,[0,1.05,-.15]);add(new THREE.PlaneGeometry(.46,.28),mat(0x3a7ca5,{e:0x3a7ca5,ei:.35}),desk,[0,1.05,-.133]).castShadow=false;
  add(box(.4,.015,.14),mat(0x30393d),desk,[0,.805,.08]);

  /* ---------- xe hình ảnh + màn hình treo tường ---------- */
  const etex=etexEarly;
  const vcart=new THREE.Group();vcart.position.set(-1.25,0,-1.95);vcart.rotation.y=.55;scene.add(vcart);
  add(box(.62,1.3,.55),mat(0xe9eeef),vcart,[0,.65,0]);[0,1,2].forEach(i=>{add(box(.56,.14,.02),mat(0x30393d),vcart,[0,.45+i*.26,.28]);
    add(new THREE.PlaneGeometry(.12,.05),mat(0x6fd3ff,{e:0x6fd3ff,ei:.6}),vcart,[-.15,.45+i*.26,.292]).castShadow=false;});
  add(cyl(.09,.09,.95,16),mat(0x9aa4a7,{m:.5,r:.3}),vcart,[.42,.5,0]);add(cyl(.03,.03,.1,10),mat(0x30393d),vcart,[.42,1.02,0]);// bình CO2
  add(cyl(.03,.03,.5),mat(0x9aa4a7,{m:.4}),vcart,[0,1.5,0]);
  add(box(.84,.52,.05),mat(0x23292b),vcart,[0,1.85,0]);add(new THREE.PlaneGeometry(.78,.47),new THREE.MeshBasicMaterial({map:etex}),vcart,[0,1.85,.027]).castShadow=false;
  add(box(1.72,1.1,.06),mat(0x23292b),scene,[.9,2.05,-4.95]);add(new THREE.PlaneGeometry(1.64,1.02),new THREE.MeshBasicMaterial({map:etex}),scene,[.9,2.05,-4.915]).castShadow=false;

  /* ---------- bàn điều khiển ---------- */
  const con=new THREE.Group();con.position.set(2.5,0,1.35);const dirT=V(-2.5,0,-1.35).normalize();con.rotation.y=Math.atan2(-dirT.x,-dirT.z);scene.add(con);
  const white=mat(0xeef1f2,{r:.45}),dark=mat(0x40494d,{r:.5});
  add(box(.9,.7,.6),white,con,[0,.35,-.2]);add(box(.9,.6,.4),white,con,[0,1.0,-.32]);
  add(box(.6,.2,.38),dark,con,[0,1.36,-.05],[-.3,0,0]);add(box(.3,.05,.08),mat(0x2b3134),con,[0,1.45,.12]);// ống nhìn + tựa trán
  add(box(.85,.06,.18),dark,con,[0,.88,.16]);[-1,1].forEach(s=>{add(cyl(.02,.02,.12,10),mat(0x9aa4a7,{m:.6}),con,[s*.2,.97,.12]);add(sph(.035),dark,con,[s*.2,1.04,.13]);
    add(box(.12,.3,.5),white,con,[s*.5,.95,-.1]);});
  add(box(.6,.05,.3),dark,con,[0,.04,.38]);for(let i=0;i<4;i++)add(box(.09,.03,.14),mat(i<2?0x2f6fb0:0x30393d),con,[-.2+i*.13,.08,.38]);
  add(new THREE.PlaneGeometry(.2,.13),mat(0x3a7ca5,{e:0x3a7ca5,ei:.4}),con,[0,.92,.26],[-1.2,0,0]).castShadow=false;
  const stool=add(cyl(.22,.22,.08,20),dark,con,[0,.47,.68]);add(cyl(.03,.03,.43,10),steel,con,[0,.22,.68]);add(cyl(.25,.25,.03,5),dark,con,[0,.03,.68]);

  /* ---------- xe robot ---------- */
  const cart=new THREE.Group();scene.add(cart);
  add(box(.78,.24,1.0),white,cart,[0,.14,0]);[[-.33,-.42],[.33,-.42],[-.33,.42],[.33,.42]].forEach(([x,z])=>add(cyl(.06,.06,.05,14),mat(0x111111),cart,[x,.06,z],[0,0,Math.PI/2]));
  add(box(.34,1.78,.34),white,cart,[0,1.0,0]);add(box(.5,.05,.06),dark,cart,[0,1.05,-.22]);
  add(box(.16,.16,.88),white,cart,[0,1.98,.42]);add(box(.85,.11,.14),dark,cart,[0,2.0,.8]);
  add(new THREE.PlaneGeometry(.2,.12),mat(0x3a7ca5,{e:0x3a7ca5,ei:.4}),cart,[0,1.35,-.172],[0,Math.PI,0]).castShadow=false;
  const CART_FAR=V(2.7,0,-2.7),CART_IN=V(0,0,-1.3);
  const robo=mat(0xeef1f2,{r:.4}),jointM=mat(0x4a5358,{r:.4,m:.3}),drapeM=mat(0xd6e8ef,{op:.33,r:.2});
  const linkMesh=(r,m)=>add(cyl(r,r,1,14),m,scene);
  const ARMS=[{port:'a1',mx:.3},{port:'cam',mx:.1,cam:true},{port:'a2',mx:-.1},{port:'a3',mx:-.3}].map(a=>({...a,
    l1:linkMesh(.048,robo),l2:linkMesh(.042,robo),d1:linkMesh(.066,drapeM),d2:linkMesh(.06,drapeM),
    j1:add(sph(.065),jointM),j2:add(sph(.058),jointM),carr:add(box(.07,.2,.07),jointM),
    ins:linkMesh(a.cam?.014:.009,mat(a.cam?0x1c2124:0x384146,{m:.6,r:.3}))}));

  /* ---------- con người (dựng bằng khối tròn xoay để mềm hơn) ---------- */
  const fabric=cvTex(256,256,(c,w,h)=>{const id=c.createImageData(w,h);for(let i=0;i<w*h;i++){const x=i%w,y=(i/w)|0;
    const v=222+Math.random()*24+(((x+y)>>1)%3===0?9:0);id.data[i*4]=id.data[i*4+1]=id.data[i*4+2]=Math.min(255,v);id.data[i*4+3]=255;}c.putImageData(id,0,0);},3);
  const pleat=cvTex(128,128,(c,w,h)=>{c.fillStyle='#fff';c.fillRect(0,0,w,h);for(let i=0;i<3;i++){const g=c.createLinearGradient(0,i*42,0,i*42+42);
    g.addColorStop(0,'#cfd6dc');g.addColorStop(.5,'#ffffff');g.addColorStop(1,'#bfc8cf');c.fillStyle=g;c.fillRect(0,i*42+2,w,40);}});
  const GOWNC=0x9cc0e6,HAIR=0x241a14,STER=0x2ecc71;
  const POSES={table:[[-.17,1.1,.42],[.17,1.1,.42]],console:[[-.2,1.24,.4],[.2,1.24,.4]],tray:[[-.18,1.03,.4],[.18,1.07,.44]],
    machine:[[-.12,1.12,.36],[.22,1.33,.4]],tablet:[[-.12,1.12,.27],[.12,1.12,.27]],idle:[[-.24,.84,.06],[.24,.84,.06]],
    reach:[[-.16,1.48,.4],[.16,1.48,.4]],clasp:[[-.05,1.08,.3],[.05,1.08,.3]],cart:[[-.2,1.02,.38],[.2,1.02,.38]],
    observe:[[-.06,.98,.12],[.06,.98,.12]],point:[[-.2,1.0,.25],[.22,1.38,.48]]};
  const MOVING={table:1,tray:1,console:1,cart:.6,machine:.5,point:.4};
  const Zax=V(0,0,1);
  const sterileParts=[];
  function makePerson(o){
    const g=new THREE.Group(),up=new THREE.Group(),headG=new THREE.Group();g.add(up);scene.add(g);
    const skinM=mat(o.skin,{r:.55}),scrubM=mat(o.scrub,{r:.9,map:fabric}),gownM=mat(GOWNC,{r:.92,map:fabric}),capM=mat(o.cap,{r:.95,map:fabric}),
      maskM=mat(0x8fb8e0,{r:.95,ds:true,map:pleat}),shoeM=mat(o.shoe||0xf3f3f3,{r:.5}),gloveM=mat(o.glove||0xe8dcc0,{r:.4}),nitM=mat(0x6a9fd8,{r:.45}),
      eyeW=mat(0xf4f1ec,{r:.3}),irisM=mat(o.iris||0x3b2a1d,{r:.2}),browM=mat(HAIR,{r:.8});
    const fw=o.female?.9:1;
    // chân đứng
    const legs=new THREE.Group();g.add(legs);
    [-1,1].forEach(s=>{add(lathe([[0,.08],[.074,.08],[.077,.3],[.084,.5],[.094,.7],[.108,.86],[.06,.9],[0,.9]],18),scrubM,legs,[s*.095,0,0]);
      add(sph(1,16,10),shoeM,legs,[s*.095,.045,.035],null,[.055,.04,.13]);add(box(.1,.02,.25),mat(0x8a9497),legs,[s*.095,.01,.035]);});
    // chân ngồi
    const sLegs=new THREE.Group();g.add(sLegs);sLegs.visible=false;
    [-1,1].forEach(s=>{add(cyl(.085,.075,.44,14),scrubM,sLegs,[s*.1,.53,.2],[Math.PI/2,0,0]);add(sph(.075,12,10),scrubM,sLegs,[s*.1,.52,.42]);
      add(cyl(.07,.06,.46,14),scrubM,sLegs,[s*.1,.28,.43]);add(sph(1,16,10),shoeM,sLegs,[s*.1,.045,.48],null,[.055,.04,.13]);});
    // thân: áo mổ và áo choàng vô khuẩn
    const torso=add(lathe([[0,.84],[.155,.84],[.172,.92],[.165,1.0],[.16,1.08],[.175,1.2],[.19,1.32],[.185,1.4],[.15,1.465],[.075,1.495],[.05,1.52],[0,1.52]],26),scrubM,up,null,null,[fw,1,.62]);
    const pocket=add(box(.1,.08,.01),scrubM,up,[-.08,1.28,.12]);
    const vneck=add(new THREE.CircleGeometry(.045,3),skinM,up,[0,1.455,.112],[-.35,0,Math.PI]);vneck.castShadow=false;
    const gown=add(lathe([[0,.42],[.26,.42],[.25,.55],[.225,.75],[.208,.95],[.207,1.15],[.218,1.3],[.205,1.4],[.165,1.47],[.085,1.505],[.06,1.53],[0,1.53]],28),gownM,up,null,null,[fw,1,.7]);
    const tie=add(new THREE.TorusGeometry(.205,.009,6,32),gownM,up,[0,1.0,0],[Math.PI/2,0,0],[fw,.7,1]);
    const sterPanel=add(new THREE.PlaneGeometry(.34*fw,.48),mat(STER,{op:.38,e:STER,ei:.25}),up,[0,1.18,.152]);sterPanel.castShadow=false;sterPanel.visible=false;sterileParts.push({m:sterPanel,p:null});
    add(cyl(.048,.052,.08,14),skinM,up,[0,1.53,0]);
    // đầu
    headG.position.set(0,1.56,0);up.add(headG);
    add(lathe([[0,-.03],[.045,-.025],[.07,0],[.084,.04],[.092,.09],[.094,.14],[.088,.18],[.066,.214],[.035,.227],[0,.23]],26),skinM,headG,null,null,[.9,1,1.04]);
    add(sph(1,12,10),skinM,headG,[0,.095,.093],null,[.014,.024,.02]);
    [-1,1].forEach(s=>{add(sph(1,12,10),skinM,headG,[s*.083,.105,0],null,[.012,.026,.02]);
      add(sph(1,14,10),eyeW,headG,[s*.032,.122,.083],null,[.013,.009,.008]);add(sph(.0065,10,8),irisM,headG,[s*.032,.122,.0905]);
      add(box(.036,.007,.01),browM,headG,[s*.033,.141,.088],[0,0,s*-.12]);});
    add(cyl(.099,.097,.085,24,true,-1.25,2.5),maskM,headG,[0,.068,0]);
    [-1,1].forEach(s=>{const st=add(cyl(.0025,.0025,1,6),mat(0xf0f0f0));headG.add(st);setLink(st,V(s*.088,.1,.035),V(s*.06,.14,-.08));});
    add(lathe([[.104,.122],[.112,.16],[.112,.205],[.095,.25],[.055,.276],[0,.282]],28),capM,headG,[0,0,-.006],null,[1.02,1,1.1]);
    add(new THREE.TorusGeometry(.104,.007,6,28),capM,headG,[0,.124,-.006],[Math.PI/2,0,0],[1.02,1.1,1]);
    if(o.glasses||o.loupes){const gm=mat(0x1e1e1e,{m:.5,r:.3});[-1,1].forEach(s=>add(new THREE.TorusGeometry(.019,.003,6,16),gm,headG,[s*.032,.122,.097]));
      add(box(.022,.004,.004),gm,headG,[0,.124,.098]);[-1,1].forEach(s=>{const t=add(cyl(.002,.002,1,5),gm);headG.add(t);setLink(t,V(s*.05,.125,.093),V(s*.088,.125,.0));});
      if(o.loupes)[-1,1].forEach(s=>add(cyl(.011,.013,.04,12),mat(0x2b2f33,{m:.6,r:.25}),headG,[s*.03,.112,.118],[Math.PI/2+.35,0,0]));}
    // máy tính bảng
    const tablet=add(box(.22,.3,.012),mat(0x2a2f31),up,[0,1.15,.3],[-1.0,0,0]);tablet.visible=false;
    // tay
    const arm=[-1,1].map(s=>{const a={s};a.sh=add(sph(.062,14,10),scrubM,up);a.u=add(cyl(.052,.045,1,14),scrubM,up);a.el=add(sph(.046,12,10),scrubM,up);
      a.f=add(cyl(.043,.034,1,14),skinM,up);a.cuff=add(cyl(.041,.037,1,14),gloveM,up);
      a.hand=new THREE.Group();up.add(a.hand);a.palm=add(sph(1,14,10),skinM,a.hand,[0,0,.035],null,[.034,.017,.052]);
      a.thumb=add(cyl(.011,.009,.045,8),skinM,a.hand,[s*-.03,0,.03],[Math.PI/2,0,s*.6]);return a;});
    const P={g,up,headG,legs,sLegs,tablet,o,gowned:null,pose:null,seated:null,look:null};
    P.setAttire=gw=>{if(P.gowned===gw)return;P.gowned=gw;torso.visible=pocket.visible=vneck.visible=!gw;gown.visible=tie.visible=gw;
      arm.forEach(a=>{const top=gw?gownM:scrubM;a.sh.material=a.u.material=a.el.material=top;a.f.material=gw?gownM:skinM;a.cuff.visible=gw;
        const hm=gw?gloveM:(o.nitrile?nitM:skinM);a.palm.material=a.thumb.material=hm;});};
    P.base=null;
    P.setPose=(name,seated)=>{if(P.pose===name&&P.seated===seated)return;P.pose=name;P.seated=seated;
      legs.visible=!seated;sLegs.visible=seated;up.position.y=seated?-.36:0;tablet.visible=name==='tablet';P.base=POSES[name];P.update(0,true);};
    P.update=(t,force)=>{const amp=(MOVING[P.pose]||0)*.012;if(!amp&&!force)return;
      P.base.forEach((h,i)=>{const a=arm[i],ph=i*1.7+(o.phase||0);
        const H=V(h[0]+amp*Math.sin(t*1.3+ph),h[1]+amp*.7*Math.sin(t*1.9+ph*1.3),h[2]+amp*Math.sin(t*1.1+ph*.7));
        const S=V(a.s*.205*fw,1.43,0),E=S.clone().add(H).multiplyScalar(.5).add(V(a.s*.07,-.13,-.05));
        a.sh.position.copy(S);setLink(a.u,S,E);a.el.position.copy(E);
        const fd=H.clone().sub(E);const C=E.clone().addScaledVector(fd,.62);setLink(a.f,E,H);setLink(a.cuff,C,H);
        a.cuff.scale.x=a.cuff.scale.z=1.04;a.hand.position.copy(H);a.hand.quaternion.setFromUnitVectors(Zax,fd.normalize());});
      // thở nhẹ
      up.scale.set(1,1+.004*Math.sin(t*1.6+(o.phase||0)),1);};
    P.lookAt=(pt)=>{if(!pt){headG.rotation.set(0,0,0);return;}const wp=g.position,yaw=Math.atan2(pt.x-wp.x,pt.z-wp.z)-g.rotation.y;
      let d=yaw;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;headG.rotation.y=Math.max(-1.0,Math.min(1.0,d));
      const dy=pt.y-(wp.y+1.65+up.position.y),dh=Math.hypot(pt.x-wp.x,pt.z-wp.z);headG.rotation.x=Math.max(-.5,Math.min(.4,-Math.atan2(dy,dh)));};
    P.sterPanel=sterPanel;
    P.setAttire(!!o.gown);P.setPose('idle',false);return P;}
  const SCR=0x3a63b8,CAPB=0x7fb3d5;
  const PEOPLE={
    ptv:makePerson({skin:0xc68e63,scrub:SCR,cap:CAPB,loupes:true,glove:0x3d8a5a,phase:0}),
    asst:makePerson({skin:0xe9bc96,scrub:SCR,cap:0x6aa5cf,female:true,gown:true,loupes:true,glove:0x3d8a5a,iris:0x4a6a3a,phase:1}),
    scrub:makePerson({skin:0xd9a77e,scrub:SCR,cap:0x88bede,female:true,gown:true,phase:2}),
    anes:makePerson({skin:0x8d5a3b,scrub:0x2f6fa8,cap:0x5b8fb8,glasses:true,nitrile:true,phase:3}),
    anesN:makePerson({skin:0xf0c8a5,scrub:0x2f6fa8,cap:0x9ec9e6,female:true,nitrile:true,phase:4}),
    circ:makePerson({skin:0xe0ac85,scrub:SCR,cap:CAPB,phase:5}),
    stu1:makePerson({skin:0xe8be98,scrub:0x4a74c4,cap:0xa9d0ec,phase:6}),
    stu2:makePerson({skin:0xd4a07a,scrub:0x4a74c4,cap:0xa9d0ec,female:true,glasses:true,phase:7})};
  const sterM=mat(STER,{op:.35,e:STER,ei:.25});
  const sterOver=[add(new THREE.PlaneGeometry(1.9,.84),sterM,pg,[.08,.416,0],[-Math.PI/2,0,0]),add(new THREE.PlaneGeometry(1.2,.6),sterM,back,[0,.945,0],[-Math.PI/2,0,0]),
    add(new THREE.PlaneGeometry(.5,.35),sterM,mayo,[0,1.08,0],[-Math.PI/2,0,0])];sterOver.forEach(m=>{m.castShadow=false;m.visible=false;});
  const faceTo=(o,t)=>{o.rotation.y=Math.atan2(t.x-o.position.x,t.z-o.position.z);};

  /* ---------- nhãn (bấm được) ---------- */
  const LB=[];function mkLabel(text,cls,get,key,kind){const el=document.createElement('button');el.type='button';el.className='lb '+(cls||'');el.textContent=text;
    el.addEventListener('click',()=>selectItem(kind,key));labelsEl.append(el);LB.push({el,get,key,kind});}
  const headPos=k=>()=>PEOPLE[k].g.position.clone().add(V(0,PEOPLE[k].up.position.y+1.98,0));
  [['ptv','PTV chính'],['asst','Phụ mổ'],['scrub','Dụng cụ viên'],['anes','BS gây mê'],['anesN','ĐD gây mê'],['circ','ĐD chạy ngoài'],['stu1','Sinh viên'],['stu2','Sinh viên']].forEach(([k,t])=>mkLabel(t,'',headPos(k),k,'role'));
  mkLabel('Bàn điều khiển','eq',()=>con.localToWorld(V(0,1.65,-.25)),'console','eq');mkLabel('Xe robot','eq',()=>cart.position.clone().add(V(0,2.3,.2)),'cart','eq');
  mkLabel('Xe hình ảnh','eq',()=>vcart.localToWorld(V(0,2.2,0)),'vision','eq');mkLabel('Máy gây mê','eq',()=>an.localToWorld(V(0,2.0,0)),'anesM','eq');
  mkLabel('Bàn dụng cụ','eq',()=>back.localToWorld(V(0,1.2,.25)),'back','eq');mkLabel('Bệnh nhân','eq',()=>pg.localToWorld(V(-.3,.6,.4)),'table','eq');
  const itemPos={console:()=>con.position.clone(),cart:()=>cart.position.clone(),vision:()=>vcart.position.clone(),anesM:()=>an.position.clone(),back:()=>back.position.clone(),table:()=>V(0,0,0)};


  // khu rửa tay ngoại khoa (thực tế nằm ở phòng rửa tay sát phòng mổ; đặt trong phòng để mô phỏng)
  const sink=new THREE.Group();sink.position.set(-4.55,0,3.1);sink.rotation.y=Math.PI/2;scene.add(sink);
  add(box(1.3,.85,.5),mat(0xdfe6e7,{m:.3,r:.4}),sink,[0,.425,0]);add(box(1.25,.12,.45),mat(0xc9d2d4,{m:.6,r:.25}),sink,[0,.9,0]);
  add(box(1.3,.6,.04),mat(0xe9eeee),sink,[0,1.35,-.23]);
  [-.35,.35].forEach(x=>{add(cyl(.015,.015,.3,8),steel,sink,[x,1.1,-.15]);add(cyl(.012,.012,.15,8),steel,sink,[x,1.24,-.08],[Math.PI/2,0,0]);});
  // vạch đứng chỉ định cho sinh viên
  const marker=add(new THREE.RingGeometry(.2,.27,40),mat(0xf2c400,{e:0xf2c400,ei:.6,ds:true}),scene,[.95,.012,.95],[-Math.PI/2,0,0]);marker.castShadow=false;marker.visible=false;
  // bộ dụng cụ mổ mở trên bàn dụng cụ
  const lapTray=add(box(.5,.07,.34),mat(0xb7c0c3,{m:.7,r:.25}),back,[.2,1.0,.08]);lapTray.visible=false;
  // đèn báo động
  const alarmLight=new THREE.PointLight(0xff3b30,0,10);alarmLight.position.set(0,2.9,0);scene.add(alarmLight);
  const alarmMat=mat(0x661111,{e:0xff2a2a,ei:0});add(cyl(.09,.09,.06,16),alarmMat,scene,[-4.93,2.6,0.4],[0,0,Math.PI/2]);
  // khối chạm vô hình theo đúng toạ độ vùng vô khuẩn trong kịch bản
  const pickG=new THREE.Group();scene.add(pickG);
  function setZones(zones){while(pickG.children.length)pickG.remove(pickG.children[0]);
    (zones||[]).forEach(z=>{const sz=[0,1,2].map(i=>z.max[i]-z.min[i]),c=[0,1,2].map(i=>(z.max[i]+z.min[i])/2);
      const m=new THREE.Mesh(box(...sz),new THREE.MeshBasicMaterial({visible:false}));m.position.set(...c);m.userData.zone=z;pickG.add(m);});}
  // dụng cụ nội soi cầm tay (mổ nội soi thường): ống soi + 2 dụng cụ thao tác
  const lapRods={lc:add(cyl(.0055,.0055,1,10),mat(0x1d2225,{m:.7,r:.25})),w1:add(cyl(.0035,.0035,1,8),mat(0x2f363a,{m:.7,r:.3})),
    w2:add(cyl(.0035,.0035,1,8),mat(0x2f363a,{m:.7,r:.3}))};
  const lightCable=add(cyl(.004,.004,1,6),mat(0x9fb3c2,{r:.6}));
  Object.values(lapRods).forEach(m=>m.visible=false);lightCable.visible=false;
  // sonde tiểu + túi nước tiểu; ống dẫn lưu + túi dẫn lưu
  const urineBag=add(box(.12,.18,.02),mat(0xf3e7a6,{op:.8,r:.2}),pg,[.55,-.22,.32]);const urineLine=add(cyl(.003,.003,1,6),mat(0xe9f0f2,{op:.8}));
  const drainBag=add(box(.1,.16,.02),mat(0xd9b8a8,{op:.8,r:.2}),pg,[.35,-.2,-.32]);const drainLine=add(cyl(.004,.004,1,6),mat(0xe9f0f2,{op:.85}));
  [urineBag,urineLine,drainBag,drainLine].forEach(m=>m.visible=false);
  Object.assign(EXTRA_OUT,{floor,sink,marker,lapTray,alarmLight,alarmMat,pickG,setZones,vcart,mayo,lapRods,lightCable,urineBag,urineLine,drainBag,drainLine,POSES});

  world={sterOver,ceilG,V,pg,dome,domeMat,drape,drapeHang,screenD,warm,ett,portMesh,portsL,TIN,cart,CART_FAR,CART_IN,ARMS,setLink,PEOPLE,faceTo,con,an,back,ivLine,warmHose,breath,
    LB,etex:etexEarly,vtex,skin,iodine,drawClock,itemPos};
}


/* ================== TRẠNG THÁI CẢNH (điều khiển từ app.js) ================== */
const ARMKEYS=['a1','cam','a2','a3'];
const blankArms=()=>Object.fromEntries(ARMKEYS.map(k=>[k,{dock:0,inst:0}]));
const TARGET={tilt:0,insuff:0,drape:false,iodine:false,ett:false,warm:false,ports:false,cart:0,arms:blankArms(),
  people:{},alarm:false,tray:false,marker:null,sterile:false,hidden:{},
  layout:'robot',patient:true,lapPorts:{},lapTools:false,monitorPos:null,backPos:null,foley:false,drain:false,ghost:null};
const CUR={tilt:0,insuff:0,cart:0,arms:blankArms()};
function setState(p){
  Object.entries(p).forEach(([k,v])=>{
    if(k==='arms')Object.entries(v).forEach(([a,o])=>{TARGET.arms[a]={...TARGET.arms[a],...o};});
    else if(k==='people')Object.entries(v).forEach(([who,o])=>{TARGET.people[who]={...(TARGET.people[who]||{}),...o};});
    else TARGET[k]=v;});}
function snap(){CUR.tilt=TARGET.tilt;CUR.insuff=TARGET.insuff;CUR.cart=TARGET.cart;
  ARMKEYS.forEach(k=>{CUR.arms[k]={...TARGET.arms[k]};});
  if(!THREE_OK)return;
  Object.entries(TARGET.people).forEach(([k,tp])=>{const o=world.PEOPLE[k];if(o&&tp.pos){o.g.position.set(tp.pos[0],0,tp.pos[1]);}});}
const approach=(c,t,k)=>c+(t-c)*Math.min(1,k);
function spot(name){if(!THREE_OK)return null;const V=world.V;
  if(name==='console'){const p=world.con.localToWorld(V(0,0,.7)),f=world.con.localToWorld(V(0,0,-.2));return {pos:[p.x,p.z],face:[f.x,f.z]};}
  if(name==='back'){const p=world.back.localToWorld(V(-.55,0,-.55)),f=world.back.position;return {pos:[p.x,p.z],face:[f.x,f.z]};}
  if(name==='machine'){const p=world.an.localToWorld(V(.1,0,.75)),f=world.an.position;return {pos:[p.x,p.z],face:[f.x,f.z]};}
  return null;}
let clockT=0;
function update(dt,tnow){
  if(!THREE_OK)return;
  const w=world,V=w.V,X=EXTRA_OUT;
  clockT+=dt;if(clockT>1){clockT=0;w.drawClock();}
  CUR.tilt=approach(CUR.tilt,TARGET.tilt,dt*1.5);CUR.insuff=approach(CUR.insuff,TARGET.insuff,dt*1.5);
  CUR.cart=approach(CUR.cart,TARGET.cart,dt*.9);
  ARMKEYS.forEach(k=>{CUR.arms[k].dock=approach(CUR.arms[k].dock,TARGET.arms[k].dock,dt*1.4);CUR.arms[k].inst=approach(CUR.arms[k].inst,TARGET.arms[k].inst,dt*2);});
  w.pg.rotation.set(-.15*CUR.tilt,0,.12*CUR.tilt);
  w.dome.scale.set(.2,.05+.07*CUR.insuff,.17);
  w.domeMat.color.setHex(TARGET.iodine?w.iodine:w.skin);
  w.drape.visible=w.screenD.visible=TARGET.drape;w.drapeHang.forEach(m=>m.visible=TARGET.drape);w.warm.visible=TARGET.warm;w.ett.visible=TARGET.ett;
  const lap=TARGET.layout==='lap';
  w.pg.visible=TARGET.patient;
  Object.entries(w.portMesh).forEach(([k,m])=>{
    m.visible=TARGET.patient&&(['lc','w1','w2'].includes(k)?(lap&&!!TARGET.lapPorts[k]):(!lap&&TARGET.ports&&(k!=='a3'||TARGET.arms.a3.dock>0||CUR.arms.a3.dock>.01)));
    const p=w.portsL[k];m.position.y=.37+(.05+.07*CUR.insuff)*Math.sqrt(Math.max(0,1-((p.x-.08)/.2)**2-(p.z/.17)**2))+.02;});
  w.cart.position.copy(w.CART_FAR).lerp(w.CART_IN,CUR.cart);
  w.pg.updateMatrixWorld(true);
  w.ivLine.visible=TARGET.patient;if(TARGET.patient)w.setLink(w.ivLine,V(-1.0,1.72,.62),w.pg.localToWorld(V(-.45,.3,.17)));
  // bố trí thiết bị theo kiểu mổ
  w.cart.visible=w.con.visible=!lap;
  const placeG=(g,pos,rot,def,defRot)=>{const tgt=pos||def;g.position.x+=(tgt[0]-g.position.x)*Math.min(1,dt*3);g.position.z+=(tgt[1]-g.position.z)*Math.min(1,dt*3);g.rotation.y=pos?rot:defRot;};
  if(lap){placeG(X.vcart,TARGET.monitorPos,0,[-2.9,-3.9],.55);placeG(w.back,TARGET.backPos,0,[2.6,-3.3],0);placeG(X.mayo,[1.0,-.5],0,[1.0,-.5],0);}
  else{placeG(X.vcart,[-1.25,-1.95],.55,[-1.25,-1.95],.55);placeG(w.back,[1.65,1.25],0,[1.65,1.25],0);placeG(X.mayo,[1.3,-.2],0,[1.3,-.2],0);}
  w.breath.visible=TARGET.ett;if(TARGET.ett)w.setLink(w.breath,w.an.localToWorld(V(.25,.95,.25)),w.pg.localToWorld(V(-.92,.45,0)));
  w.warmHose.visible=TARGET.warm;if(TARGET.warm)w.setLink(w.warmHose,V(-1.1,.4,-.75),w.pg.localToWorld(V(-.5,.42,-.25)));
  w.ARMS.forEach(a=>{const M0=w.cart.position.clone().add(V(a.mx,1.95,.8));
    const Hf=M0.clone().add(V(0,-.55,-.22)),Ef=M0.clone().add(V(0,-.12,-.32));
    const st=CUR.arms[a.port];
    const Pw=w.pg.localToWorld(w.portsL[a.port].clone().add(V(0,.02,0)));
    const Tw=w.pg.localToWorld(w.TIN.clone());const u=Tw.clone().sub(Pw).normalize();
    const Hd=Pw.clone().addScaledVector(u,-.34),Ed=M0.clone().add(Hd).multiplyScalar(.5).add(V(0,.3,-.1));
    const H=Hf.clone().lerp(Hd,st.dock),E=Ef.clone().lerp(Ed,st.dock);
    w.setLink(a.l1,M0,E);w.setLink(a.l2,E,H);a.j1.position.copy(E);a.j2.position.copy(H);
    a.carr.position.copy(H).addScaledVector(u,-.12);a.carr.quaternion.setFromUnitVectors(V(0,1,0),u);
    a.d1.visible=a.d2.visible=true;w.setLink(a.d1,M0,E);w.setLink(a.d2,E,H);
    if(st.dock>.97&&st.inst>.02)w.setLink(a.ins,H.clone().addScaledVector(u,-.06),Pw.clone().addScaledVector(u,.15*st.inst));else a.ins.visible=false;
    if(lap)[a.l1,a.l2,a.j1,a.j2,a.d1,a.d2,a.carr,a.ins].forEach(m=>m.visible=false);});
  // dụng cụ cầm tay đi từ trocar tới tay PTV / người cầm camera
  const hand=(k,i)=>{const o=w.PEOPLE[k];const P=X.POSES[o.pose]||X.POSES.table;o.g.updateMatrixWorld(true);return o.up.localToWorld(V(...P[i]));};
  const rodOn=lap&&TARGET.lapTools&&TARGET.patient;
  [['lc','asst',1],['w1','ptv',0],['w2','ptv',1]].forEach(([k,who,i])=>{const m=X.lapRods[k];
    const show=rodOn&&!!TARGET.lapPorts[k]&&w.PEOPLE[who].pose==='table';m.visible=show;
    if(show){const Pw=w.pg.localToWorld(w.portsL[k].clone().add(V(0,.03,0)));const Hw=hand(who,i);const dir=Pw.clone().sub(Hw).normalize();w.setLink(m,Hw,Pw.clone().addScaledVector(dir,.12));
      if(k==='lc'){X.lightCable.visible=true;w.setLink(X.lightCable,Hw,X.vcart.localToWorld(V(0,1.05,.28)));}}
    else if(k==='lc')X.lightCable.visible=false;});
  X.urineBag.visible=X.urineLine.visible=TARGET.patient&&TARGET.foley;
  if(X.urineLine.visible)w.setLink(X.urineLine,w.pg.localToWorld(V(.62,.25,0)),w.pg.localToWorld(V(.55,-.13,.32)));
  X.drainBag.visible=X.drainLine.visible=TARGET.patient&&TARGET.drain;
  if(X.drainLine.visible)w.setLink(X.drainLine,w.pg.localToWorld(V(.25,.45,.0)),w.pg.localToWorld(V(.35,-.12,-.32)));
  // vòng gợi ý vị trí (chế độ học)
  if(TARGET.ghost){X.marker.visible=true;X.marker.position.set(TARGET.ghost[0],.012,TARGET.ghost[1]);}
  // người: đi bộ tới vị trí đích rồi mới vào tư thế
  Object.entries(w.PEOPLE).forEach(([k,o])=>{const tp=TARGET.people[k];
    o.g.visible=!TARGET.hidden[k];
    if(tp&&tp.pos){const dx=tp.pos[0]-o.g.position.x,dz=tp.pos[1]-o.g.position.z,d=Math.hypot(dx,dz);
      if(tp.gown!==undefined)o.setAttire(tp.gown);
      if(d>.03){const step=Math.min(d,1.25*dt);o.g.position.x+=dx/d*step;o.g.position.z+=dz/d*step;
        o.g.rotation.y=Math.atan2(dx,dz);o.setPose('idle',false);o.lookAt(null);}
      else{o.g.position.set(tp.pos[0],0,tp.pos[1]);if(tp.face)w.faceTo(o.g,V(tp.face[0],0,tp.face[1]));
        o.setPose(tp.pose||'idle',!!tp.seated);o.lookAt(tp.look?V(...tp.look):null);}}
    o.update(tnow);o.sterPanel.visible=TARGET.sterile&&o.gowned;});
  const al=TARGET.alarm?(.5+.5*Math.sin(tnow*6)):0;X.alarmLight.intensity=al*1.2;X.alarmMat.emissiveIntensity=al*2.5;
  X.lapTray.visible=TARGET.tray;
  if(TARGET.marker){X.marker.visible=true;X.marker.position.set(TARGET.marker[0],.012,TARGET.marker[1]);}else if(!TARGET.ghost)X.marker.visible=false;
  w.sterOver[0].visible=TARGET.sterile&&TARGET.drape;w.sterOver[1].visible=w.sterOver[2].visible=TARGET.sterile;
  w.etex.needsUpdate=true;w.vtex.needsUpdate=true;
}

/* ================== CAMERA ================== */
const clamp01=(v,a,b)=>Math.max(a,Math.min(b,v)),easeIO=u=>u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2;
const toSph=(p,t)=>{const o={x:p[0]-t[0],y:p[1]-t[1],z:p[2]-t[2]},r=Math.hypot(o.x,o.y,o.z);return {t:{x:t[0],y:t[1],z:t[2]},r,yaw:Math.atan2(o.x,o.z),pitch:Math.asin(o.y/r)};};
let cam=toSph([3.6,2.7,3.1],[.3,1.0,0]),camFrom=null,camTo=null,camK=1,follow=null;
const PRESETS={overview:[[3.6,2.7,3.1],[.2,1.0,0]],table:[[1.3,1.9,1.6],[.05,1.1,0]],top:null,door:[[-1.6,2.2,3.6],[-3.6,1.0,2.2]]};
function flySph(to){camFrom={...cam,t:{...cam.t}};camTo=to;let d=camTo.yaw-camFrom.yaw;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;camTo.yaw=camFrom.yaw+d;camK=0;}
function view(name){follow=null;if(THREE_OK)world.ceilG.visible=name!=='top';
  if(name==='top')flySph({t:{x:-.6,y:0,z:.4},r:9.5,yaw:0,pitch:1.55});
  else if(name==='console'&&THREE_OK){const V=world.V,a=world.con.localToWorld(V(0,1.8,1.55)),b=world.con.localToWorld(V(0,.9,-1.6));flySph(toSph([a.x,a.y,a.z],[b.x,b.y,b.z]));}
  else if(name.startsWith('follow:')){follow=name.slice(7);const o=THREE_OK&&world.PEOPLE[follow];if(o){const p=o.g.position;flySph({t:{x:p.x,y:1.2,z:p.z},r:3.2,yaw:cam.yaw,pitch:.45});}}
  else if(PRESETS[name])flySph(toSph(...PRESETS[name]));}
function stepCam(dt){
  if(follow&&THREE_OK&&camK>=1){const p=world.PEOPLE[follow].g.position;cam.t.x+=(p.x-cam.t.x)*Math.min(1,dt*3);cam.t.z+=(p.z-cam.t.z)*Math.min(1,dt*3);}
  if(camK<1&&camTo){camK=Math.min(1,camK+dt/1.4);const k=easeIO(camK),L=(a,b)=>a+(b-a)*k;
    cam={t:{x:L(camFrom.t.x,camTo.t.x),y:L(camFrom.t.y,camTo.t.y),z:L(camFrom.t.z,camTo.t.z)},r:L(camFrom.r,camTo.r),yaw:L(camFrom.yaw,camTo.yaw),pitch:L(camFrom.pitch,camTo.pitch)};}
  if(!camera)return;const cp=Math.cos(cam.pitch);
  camera.position.set(cam.t.x+cam.r*cp*Math.sin(cam.yaw),cam.t.y+cam.r*Math.sin(cam.pitch),cam.t.z+cam.r*cp*Math.cos(cam.yaw));camera.lookAt(cam.t.x,cam.t.y,cam.t.z);}
let drag=null;const ray=THREE_OK?new THREE.Raycaster():null;
function pick(cx,cy){if(!THREE_OK)return null;const r=orCanvas.getBoundingClientRect();
  ray.setFromCamera({x:((cx-r.left)/r.width)*2-1,y:-((cy-r.top)/r.height)*2+1},camera);
  const hits=ray.intersectObjects([...EXTRA_OUT.pickG.children,EXTRA_OUT.floor],false);
  if(!hits.length)return null;const h=hits[0];
  return h.object.userData.zone?{kind:'zone',zone:h.object.userData.zone,point:[h.point.x,h.point.y,h.point.z]}:{kind:'floor',point:[h.point.x,h.point.y,h.point.z]};}
orCanvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY};orCanvas.setPointerCapture(e.pointerId);});
orCanvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
  if(Math.hypot(e.clientX-drag.x0,e.clientY-drag.y0)>6){camK=1;cam.yaw-=dx*.006;cam.pitch=clamp01(cam.pitch+dy*.005,.08,1.56);}});
orCanvas.addEventListener('pointerup',e=>{if(drag&&Math.hypot(e.clientX-drag.x0,e.clientY-drag.y0)<=6&&window.SIM&&window.SIM.onPick){const p=pick(e.clientX,e.clientY);if(p)window.SIM.onPick(p);}drag=null;});
orCanvas.addEventListener('wheel',e=>{e.preventDefault();camK=1;cam.r=clamp01(cam.r*(1+Math.sign(e.deltaY)*.08),.6,11);},{passive:false});
function resize(){if(!THREE_OK)return;const r=wrap.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);
function placeLabels(){if(!THREE_OK)return;const r=wrap.getBoundingClientRect();world.LB.forEach(l=>{const v=l.get().project(camera);
  if(v.z>1||v.x<-1.1||v.x>1.1||v.y<-1.1||v.y>1.1||(l.key&&TARGET.hidden[l.key])||(l.key==='table'&&!TARGET.patient)||(TARGET.layout==='lap'&&(l.key==='cart'||l.key==='console'))){l.el.style.display='none';return;}l.el.style.display='';
  l.el.style.left=((v.x*.5+.5)*r.width)+'px';l.el.style.top=((-v.y*.5+.5)*r.height)+'px';});}
function frame(dt,tnow){if(!THREE_OK)return;update(dt,tnow);stepCam(dt);renderer.render(scene,camera);placeLabels();}
function highlight(keys){if(!THREE_OK)return;world.LB.forEach(l=>{if(l.kind==='role')l.el.classList.toggle('on',keys.includes(l.key));});}
resize();
window.OR3D={ok:THREE_OK,setState,snap,frame,view,spot,pick,resize,highlight,setZones:(z)=>THREE_OK&&EXTRA_OUT.setZones(z),
  peoplePos:k=>THREE_OK?[world.PEOPLE[k].g.position.x,world.PEOPLE[k].g.position.z]:null,ROLE,EQUIP};

})();
