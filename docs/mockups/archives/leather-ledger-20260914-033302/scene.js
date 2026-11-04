import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const $=id=>document.getElementById(id);
const ui=Object.fromEntries(['scene','fallback','experience','viewMode','materialLabel','designNumber','designTitle','designDetail','replay','play','timeline','timecode','speed','loop','formNote'].map(id=>[id,$(id)]));
const choices=[...document.querySelectorAll('[data-design]')];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const clamp=n=>Math.min(1,Math.max(0,n));
const ease=n=>{const t=clamp(n);return t*t*t*(t*(t*6-15)+10);};
const phase=(t,a,b)=>ease((t-a)/(b-a));
const mix=THREE.MathUtils.lerp;
const state={design:'ledger',time:reduced.matches?6:0,playing:!reduced.matches,speed:1,loop:false,raf:0,last:0};
const meta={ledger:['가죽 매물 장부','금박 표지와 크림색 매물대장','가죽 · 종이 · 황동','01'],cards:['황동 레일의 매물 카드','매물·고객·계약을 정리하는 인덱스','아이보리 카드 · 무광 황동','02'],plaque:['월넛과 황동 문패','음각 로고 위를 지나가는 조명','월넛 · 브러시드 황동','03']};
const logo=[[[19.142,32.872],[25.370,77.037],[65.571,81],[63.306,65.995],[41.224,63.164],[36.977,35.420]],[[35.845,19],[38.110,34.005],[60.758,37.402],[64.721,64.580],[80.858,66.562],[74.347,24.096]]];
let renderer,scene,camera,observer,envTarget,keyLight,fillLight,models;
const ownedTextures=new Set();

function canvasTexture(w,h,paint,{color=true}={}){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  paint(canvas.getContext('2d'),w,h);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;
  texture.anisotropy=renderer.capabilities.getMaxAnisotropy();ownedTextures.add(texture);return texture;
}
function drawLogo(ctx,x,y,size,color){ctx.save();ctx.translate(x,y);ctx.scale(size/100,size/100);ctx.fillStyle=color;logo.forEach(p=>{ctx.beginPath();p.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();});ctx.restore();}
function grain(kind){
  let seed=7345;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  return canvasTexture(512,512,(ctx,w,h)=>{
    const image=ctx.createImageData(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4;
      const v=kind==='wood'?95+25*Math.sin(y*.15+Math.sin(x*.014)*1.5)+12*Math.sin(y*.65+x*.03)+(random()-.5)*15:145+(random()-.5)*80+15*Math.sin(x*.5)*Math.cos(y*.55);
      image.data[i]=v;image.data[i+1]=v;image.data[i+2]=v;image.data[i+3]=255;
    }ctx.putImageData(image,0,0);
  },{color:false});
}
function standard(color,options={}){return new THREE.MeshStandardMaterial({color,roughness:.65,metalness:0,...options});}
function box(w,h,d,mat,radius=.025){
  const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,3,Math.min(radius,w/4,h/4,d/4)),mat);
  mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
function surface(w,h,map,{unlit=false,...matOptions}={}){
  const base={map,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1};
  const mat=unlit?new THREE.MeshBasicMaterial({...base,toneMapped:false}):standard('#ffffff',{...base,...matOptions});
  return new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);
}
function paper(kind){
  return canvasTexture(1024,1360,(ctx,w,h)=>{
    ctx.fillStyle='#eee6d4';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#c3b79b';ctx.lineWidth=1;ctx.strokeRect(46,46,w-92,h-92);
    ctx.fillStyle='#8b806a';ctx.font='22px Georgia';ctx.fillText('ESTAIT FLOW',90,106);
    ctx.textAlign='right';ctx.font='20px Georgia';ctx.fillText('OFFICE RECORD',w-90,106);ctx.textAlign='left';
    ctx.fillStyle='#393e31';ctx.font='52px AppleMyungjo, serif';ctx.fillText(kind==='ledger'?'매물대장':kind==='property'?'매물 기록':kind==='customer'?'고객 원장':'계약 기록',90,238);
    ctx.font='21px -apple-system, sans-serif';ctx.fillStyle='#8a806b';ctx.fillText('에스테잇플로우 · 부동산 관리',90,291);
    ctx.fillStyle='#b4a381';ctx.fillRect(90,338,w-180,2);
    if(kind==='ledger'){
      const xs=[90,445,610,760,934];const ys=409;
      ctx.font='24px -apple-system,sans-serif';ctx.fillStyle='#807660';['매물명','유형','면적','금액'].forEach((v,i)=>ctx.fillText(v,xs[i]+14,ys));
      const rows=[['한빛아파트','매매','84㎡','8.5억'],['푸른마을','전세','59㎡','3.2억'],['중앙오피스텔','월세','32㎡','80만']];
      for(let row=0;row<8;row++){
        const y=ys+35+row*82;ctx.strokeStyle='#d0c7b3';ctx.beginPath();ctx.moveTo(90,y);ctx.lineTo(w-90,y);ctx.stroke();
        if(rows[row]){ctx.fillStyle='#65654f';ctx.font='23px -apple-system,sans-serif';rows[row].forEach((v,i)=>ctx.fillText(v,xs[i]+14,y+49));}
      }
      for(const x of xs.slice(1,-1)){ctx.beginPath();ctx.moveTo(x,375);ctx.lineTo(x,1053);ctx.stroke();}
    }else{
      const rows=kind==='property'?[['매물명','한빛아파트'],['거래 유형','전세'],['전용 면적','84㎡'],['보증금','4억 5,000만'],['진행 상태','상담 중']]:kind==='customer'?[['고객 구분','매수 의뢰'],['희망 유형','아파트'],['희망 면적','84㎡'],['관심 지역','송파구'],['진행 상태','매물 검토']]:[['계약 구분','아파트 전세'],['계약 상태','검토 중'],['계약금','4,500만'],['담당자','사무소'],['잔금 일정','일정 확인']];
      rows.forEach(([label,value],i)=>{const y=405+i*126;ctx.fillStyle='#96896f';ctx.font='23px -apple-system,sans-serif';ctx.fillText(label,90,y);ctx.fillStyle='#424b38';ctx.font='31px -apple-system,sans-serif';ctx.fillText(value,90,y+48);ctx.strokeStyle='#d1c6ae';ctx.beginPath();ctx.moveTo(90,y+80);ctx.lineTo(w-90,y+80);ctx.stroke();});
    }
    ctx.fillStyle='#a89b7d';ctx.font='18px -apple-system,sans-serif';ctx.fillText('시안용 예시',90,h-85);ctx.textAlign='right';ctx.font='20px Georgia';ctx.fillText('01',w-90,h-85);
  });
}
function coverFoil(){return canvasTexture(1024,1400,(ctx,w,h)=>{
  const gold='#c3a469';ctx.strokeStyle=gold;ctx.lineWidth=2;ctx.strokeRect(65,65,w-130,h-130);ctx.lineWidth=.7;ctx.strokeRect(78,78,w-156,h-156);
  drawLogo(ctx,w/2-115,265,230,gold);ctx.textAlign='center';ctx.fillStyle=gold;
  ctx.font='51px AppleMyungjo,serif';ctx.fillText('에스테잇플로우',w/2,645);
  ctx.font='25px AppleMyungjo,serif';ctx.fillText('부동산 관리',w/2,716);
  ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(w/2-50,787);ctx.lineTo(w/2+50,787);ctx.stroke();
  ctx.font='19px Georgia';ctx.fillText('PROPERTY  ·  CLIENT  ·  CONTRACT',w/2,1160);
});}
function makeLedger(){
  const root=new THREE.Group();scene.add(root);
  const leather=standard('#211319',{bumpMap:grain('leather'),bumpScale:.035,roughness:.8});
  const brass=standard('#c3a470',{metalness:.75,roughness:.31});
  const back=box(3.2,4.4,.085,leather);back.position.z=-.21;root.add(back);
  const pages=box(3.04,4.24,.31,standard('#d6c8a8'),.012);root.add(pages);
  // Individual paper edges are lines on the right edge and bottom edge.
  for(let i=0;i<17;i++){
    const z=-.145+i*.017;
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(1.524,-2.1,z),new THREE.Vector3(1.524,2.1,z)]),new THREE.LineBasicMaterial({color:'#a99e83',transparent:true,opacity:.4}));root.add(line);
  }
  const page=surface(3.0,4.20,paper('ledger'),{unlit:true});page.position.z=.163;root.add(page);
  const hinge=new THREE.Group();hinge.position.set(-1.6,0,.205);root.add(hinge);
  const cover=box(3.2,4.4,.08,leather);cover.position.x=1.6;hinge.add(cover);
  const foil=surface(3.17,4.37,coverFoil(),{color:'#d4b47d',metalness:.82,roughness:.3});foil.position.set(1.6,0,.043);hinge.add(foil);
  const lining=surface(3.08,4.27,canvasTexture(512,700,(ctx,w,h)=>{ctx.fillStyle='#332c26';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#87734c';ctx.lineWidth=2;ctx.strokeRect(25,25,w-50,h-50);}));lining.position.set(1.6,0,-.043);lining.rotation.y=Math.PI;hinge.add(lining);
  const spine=box(.16,4.37,.44,leather,.07);spine.position.x=-1.62;root.add(spine);
  for(const y of [-1.65,1.65]){const band=box(.18,.07,.46,brass,.015);band.position.set(-1.62,y,0);root.add(band);}
  root.rotation.set(-.1,-.3,.035);
  return {root,update(t){const open=phase(t,1.65,5.2);hinge.rotation.y=-2.0*open;root.rotation.y=mix(-.3,.03,open);root.rotation.x=mix(-.1,-.04,open);root.rotation.z=mix(.035,0,open);root.position.x=mix(.15,.7,open);root.scale.setScalar(mix(1,.94,open));}};
}
function environment(){
  const room=new THREE.Scene();room.background=new THREE.Color('#625e55');
  const add=(w,h,x,y,z,rx,ry,intensity)=>{const panel=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color().setScalar(intensity),side:THREE.DoubleSide}));panel.position.set(x,y,z);panel.rotation.set(rx,ry,0);room.add(panel);};
  add(8,10,-5,3,4,0,.8,3);add(3,12,6,1,0,0,-1.3,2);add(12,5,0,8,0,Math.PI/2,0,2.5);
  const pmrem=new THREE.PMREMGenerator(renderer);envTarget=pmrem.fromScene(room,.06);scene.environment=envTarget.texture;scene.environmentIntensity=.65;
  room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});pmrem.dispose();
}
function init(){
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;
  renderer.domElement.setAttribute('role','img');renderer.domElement.setAttribute('aria-label','3D 가죽 매물 장부');
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();fail('3D 화면이 중단되었습니다. 새로고침해 주세요.');});
  ui.scene.prepend(renderer.domElement);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(32,1,.1,80);camera.position.set(0,.1,11.5);camera.lookAt(0,0,0);
  environment();scene.add(new THREE.AmbientLight('#fff3df',.9));
  keyLight=new THREE.DirectionalLight('#ffecd0',3.3);keyLight.position.set(-3,4,6);scene.add(keyLight);
  fillLight=new THREE.DirectionalLight('#d5dfeb',1.3);fillLight.position.set(4,1,4);scene.add(fillLight);
  models={ledger:makeLedger()};
  ui.fallback.style.display='none';observer=new ResizeObserver(()=>{resize();requestRender();});observer.observe(ui.scene);resize();select(state.design,false);
}
function resize(){if(!renderer)return;const {width,height}=ui.scene.getBoundingClientRect();renderer.setSize(Math.max(1,width),Math.max(1,height),false);camera.aspect=width/Math.max(1,height);camera.position.z=Math.max(10.4,9.2/Math.max(.5,camera.aspect));camera.updateProjectionMatrix();}
function select(design,restart=true){state.design=design;document.body.dataset.theme=design;choices.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.design===design)));const m=meta[design];[ui.designTitle.textContent,ui.designDetail.textContent,ui.materialLabel.textContent]=m;ui.designNumber.textContent='STUDY '+m[3];if(models)Object.entries(models).forEach(([key,model])=>model.root.visible=key===design);if(restart){state.time=reduced.matches?6:0;state.playing=!reduced.matches;}requestRender();}
function updateUI(){ui.timeline.value=state.time;ui.timeline.setAttribute('aria-valuetext',`${state.time.toFixed(1)}초`);ui.timecode.textContent=`${state.time.toFixed(1)} / 6.0`;ui.play.textContent=state.playing?'Ⅱ':'▶';ui.play.setAttribute('aria-label',state.playing?'일시정지':'재생');}
function render(){if(!models)return;models[state.design].update(state.time);const sweep=phase(state.time,.1,5.5);keyLight.position.set(mix(-4,4,sweep),mix(4,2,sweep),6);keyLight.intensity=state.design==='cards'?2.2:3.3;renderer.toneMappingExposure=state.design==='cards'?1.1:1.22;renderer.render(scene,camera);updateUI();}
function tick(now){state.raf=0;if(state.playing&&!document.hidden){state.time+=Math.max(0,Math.min(.1,(now-state.last)/1000))*state.speed;if(state.time>=6){state.time=state.loop?0:6;if(!state.loop)state.playing=false;}}state.last=now;render();if(state.playing&&!document.hidden)state.raf=requestAnimationFrame(tick);}
function requestRender(){if(!state.raf){state.last=performance.now();state.raf=requestAnimationFrame(tick);}}
function replay(){if(ui.play.disabled)return;state.time=0;state.playing=true;requestRender();}
function play(){if(ui.play.disabled)return;if(state.time>=6)state.time=0;state.playing=!state.playing;requestRender();}
function fail(message){state.playing=false;cancelAnimationFrame(state.raf);state.raf=0;ui.fallback.style.display='flex';if(renderer)renderer.domElement.style.display='none';ui.designDetail.textContent=message;ui.play.disabled=ui.replay.disabled=ui.timeline.disabled=true;}
choices.forEach(button=>button.addEventListener('click',()=>select(button.dataset.design)));
ui.viewMode.addEventListener('click',()=>{const splash=ui.experience.classList.toggle('splash');ui.viewMode.setAttribute('aria-pressed',String(splash));ui.viewMode.textContent=splash?'로그인으로 보기 ↙':'스플래시로 보기 ↗';resize();requestRender();});
ui.play.addEventListener('click',play);ui.replay.addEventListener('click',replay);ui.timeline.addEventListener('input',()=>{state.time=Number(ui.timeline.value);state.playing=false;requestRender();});
document.querySelectorAll('[data-time]').forEach(button=>button.addEventListener('click',()=>{state.time=Number(button.dataset.time);state.playing=false;requestRender();}));
ui.speed.addEventListener('change',()=>state.speed=Number(ui.speed.value));ui.loop.addEventListener('change',()=>{state.loop=ui.loop.checked;if(state.loop&&state.time>=6)replay();});
document.addEventListener('keydown',e=>{if(e.target.closest('input,button,select,textarea'))return;if(e.code==='Space'){e.preventDefault();play();}if(e.key.toLowerCase()==='r')replay();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(state.raf);state.raf=0;}else requestRender();});
reduced.addEventListener('change',e=>{if(e.matches){state.time=6;state.playing=false;requestRender();}});
$('loginForm').addEventListener('submit',e=>{e.preventDefault();ui.formNote.textContent='디자인 미리보기입니다. 실제 계정 인증은 연결하지 않았습니다.';});$('forgot').addEventListener('click',()=>ui.formNote.textContent='비밀번호 찾기는 실제 앱에서 사용할 수 있습니다.');$('signup').addEventListener('click',()=>ui.formNote.textContent='사무소 등록 화면은 이 데모에 포함되지 않았습니다.');
window.addEventListener('pagehide',e=>{cancelAnimationFrame(state.raf);state.raf=0;if(e.persisted)return;observer?.disconnect();const geometries=new Set(),materials=new Set();scene?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());ownedTextures.forEach(t=>t.dispose());envTarget?.dispose();renderer?.dispose();});window.addEventListener('pageshow',e=>{if(e.persisted)requestRender();});
try{if(new URLSearchParams(location.search).has('fallback'))throw new Error('Static preview');init();}catch(error){console.error(error);fail('3D를 사용할 수 없어 정적인 브랜드 화면을 표시합니다.');}
