import * as THREE from 'three';
import {createCampus} from './campus.js';

const $=id=>document.getElementById(id);
const ui=Object.fromEntries(['scene','modelLayer','connections','callouts','logoAssembly','leftHalf','rightHalf','guides','finalName','sampleNote','stageNumber','stageTitle','stageDescription','countValue','itemCount','experience','replay','play','timeline','timecode','speed','loop','loginView','splashView','formNote'].map(id=>[id,$(id)]));
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const state={time:reduced.matches?10:0,playing:!reduced.matches,speed:1,loop:false,last:0,raf:0};
const clamp=n=>Math.min(1,Math.max(0,n));
const smooth=n=>{const t=clamp(n);return t*t*t*(t*(t*6-15)+10);};
const phase=(t,a,b)=>smooth((t-a)/(b-a));
const mix=THREE.MathUtils.lerp;
const NS='http://www.w3.org/2000/svg';
// Fictional preview records. Coordinates specify label centers, not building positions.
const records=[
  {type:'매물',title:'101동 · 84㎡',value:'전세 4.5억',detail:'중층 · 남향',status:'확인 완료',x:.15,y:.23,at:1.05,building:0},
  {type:'매물',title:'105동 · 59㎡',value:'매매 7.2억',detail:'고층 · 남동향',status:'광고 중',x:.82,y:.24,at:1.55,building:4},
  {type:'매물',title:'103동 · 112㎡',value:'매매 12.8억',detail:'저층 · 남향',status:'확인 필요',x:.17,y:.70,at:2.05,building:2,color:'#ae8c5c'},
  {type:'매물',title:'108동 · 84㎡',value:'월세 3천 / 150',detail:'고층 · 동향',status:'상담 중',x:.82,y:.72,at:2.55,building:7},
  {type:'고객',title:'84㎡ 전세 의뢰',value:'예산 5억',detail:'입주 협의',status:'검토',x:.36,y:.11,at:3.0,building:0,level:'secondary',color:'#7c8f9f'},
  {type:'계약',title:'106동 전세 계약',value:'잔금 일정',detail:'9월 25일',status:'예정',x:.65,y:.11,at:3.15,building:5,level:'secondary',color:'#a39675'},
  {type:'상담',title:'107동 방문 예약',value:'오후 2시',detail:'담당자 확인',status:'예약',x:.48,y:.84,at:3.3,building:6,level:'secondary',color:'#7c8f9f'},
  {type:'확인',title:'102동 매물 확인',value:'연락 필요',detail:'최종 확인 7일',status:'대기',x:.08,y:.46,at:3.45,building:1,level:'secondary',color:'#ae8c5c'},
  {type:'광고',title:'104동 광고 관리',value:'전세 3.8억',detail:'내용 확인',status:'광고 중',x:.91,y:.46,at:3.6,building:3,level:'secondary'},
  {type:'매물',title:'102동 · 59㎡',value:'전세 3.2억',detail:'고층',x:.36,y:.37,at:3.85,building:1,level:'tertiary'},
  {type:'고객',title:'매수 고객 조건',value:'74–84㎡',detail:'예산 확인',x:.65,y:.37,at:4.0,building:4,level:'tertiary',color:'#7c8f9f'},
  {type:'확인',title:'가격 변경 이력',value:'8.5억 → 8.3억',detail:'변경 접수',x:.32,y:.58,at:4.1,building:2,level:'tertiary',color:'#ae8c5c'},
  {type:'매칭',title:'조건에 맞는 매물',value:'후보 3건',detail:'고객 검토',x:.67,y:.59,at:4.2,building:6,level:'tertiary'},
  {type:'상담',title:'입주 가능일 문의',value:'10월 협의',detail:'답변 대기',x:.47,y:.23,at:4.3,building:0,level:'tertiary',color:'#7c8f9f'},
  {type:'계약',title:'계약 서류 확인',value:'확인 항목 4',detail:'검토 중',x:.52,y:.65,at:4.4,building:5,level:'tertiary',color:'#a39675'},
  {type:'업무',title:'소유자 연락',value:'오늘 오후',detail:'담당자 배정',x:.49,y:.46,at:4.5,building:3,level:'tertiary',color:'#ae8c5c'},
];
let renderer,scene,camera,campus,observer;
let labels=[];
const point=new THREE.Vector3();
function createLabels(){
  labels=records.map((record,index)=>{
    const card=document.createElement('div');card.className=`property-callout ${record.level??''}`;
    card.style.setProperty('--type-color',record.color??'#778969');
    const top=document.createElement('div');top.className='callout-top';
    const type=document.createElement('span');type.className='callout-type';type.textContent=record.type;
    const status=document.createElement('span');status.className='callout-state';status.textContent=record.status??'기록';top.append(type,status);
    const title=document.createElement('strong');title.textContent=record.title;
    const bottom=document.createElement('div');bottom.className='callout-bottom';
    const value=document.createElement('b');value.textContent=record.value;
    const detail=document.createElement('span');detail.textContent=record.detail;bottom.append(value,detail);card.append(top,title,bottom);ui.callouts.append(card);
    const line=document.createElementNS(NS,'path');const dot=document.createElementNS(NS,'circle');dot.setAttribute('r','3');ui.connections.append(line,dot);
    return {record,index,card,line,dot};
  });
}
function init(){
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor('#f6f5ef',0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('role','img');renderer.domElement.setAttribute('aria-label','8개 아파트 동과 연결된 매물 정보');
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();fail();});ui.modelLayer.append(renderer.domElement);
  scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-10,10,6,-6,.1,100);
  scene.add(new THREE.HemisphereLight('#ffffff','#d6d8c9',2.1));
  const light=new THREE.DirectionalLight('#fff7e5',2.5);light.position.set(-5,12,7);light.castShadow=true;light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:1,far:35});light.shadow.bias=-.0003;light.shadow.normalBias=.035;scene.add(light);
  const fill=new THREE.DirectionalLight('#e1e8f2',.7);fill.position.set(8,5,-7);scene.add(fill);
  campus=createCampus(scene);createLabels();observer=new ResizeObserver(()=>{resize();requestRender();});observer.observe(ui.scene);resize();requestRender();
}
function resize(){if(!renderer)return;renderer.setSize(Math.max(1,ui.scene.clientWidth),Math.max(1,ui.scene.clientHeight),false);ui.connections.setAttribute('viewBox',`0 0 ${ui.scene.clientWidth} ${ui.scene.clientHeight}`);}
function render(){
  if(!campus)return;
  const t=state.time,w=ui.scene.clientWidth,h=ui.scene.clientHeight;
  const centerX=w/2,centerY=h*.48;
  const collect=phase(t,6.1,8.45),closed=phase(t,6.4,8.7),finish=phase(t,8.55,9.6);
  // The only 3D animation is a small camera movement. Every building transform is fixed.
  const drift=phase(t,.6,5.4),azimuth=mix(.62,.46,drift),angle=.9;
  camera.position.set(22*Math.sin(angle)*Math.sin(azimuth),.55+22*Math.cos(angle),22*Math.sin(angle)*Math.cos(azimuth));camera.lookAt(0,.55,0);
  const aspect=w/Math.max(1,h),viewHeight=Math.max(10.9,18.8/aspect);
  camera.left=-viewHeight*aspect/2;camera.right=viewHeight*aspect/2;camera.top=viewHeight/2;camera.bottom=-viewHeight/2;camera.updateProjectionMatrix();renderer.render(scene,camera);
  ui.modelLayer.style.opacity=phase(t,0,.85)*(1-phase(t,5.8,7.45));
  let visibleCount=0;
  labels.forEach(({record,index,card,line,dot})=>{
    const enter=phase(t,record.at,record.at+.52);
    if(enter>.5)visibleCount++;
    // Each rectangular card keeps its proportions as it moves into an ordered stack.
    const arrival=phase(t,6.15+(index%4)*.055,8.1+(index%3)*.08);
    const disappear=phase(t,8.1+(index%3)*.06,8.55);
    const opacity=enter*(1-disappear)*(record.level==='tertiary'?.74:record.level==='secondary'?.91:1);
    const width=card.offsetWidth,height=card.offsetHeight;
    const startX=Math.min(w-width/2-8,Math.max(width/2+8,record.x*w));
    const startY=Math.min(h-height/2-20,Math.max(height/2+9,record.y*h));
    const stackY=centerY+(index-(records.length-1)/2)*1.9;
    const x=mix(startX,centerX,arrival),y=mix(startY+(1-enter)*8,stackY,arrival);
    const scale=mix(1,.12,arrival);
    card.style.transform=`translate(${x-width/2}px,${y-height/2}px) scale(${scale})`;
    card.style.opacity=opacity;card.style.visibility=opacity>.002?'visible':'hidden';card.style.zIndex=String(record.level==='tertiary'?1:record.level==='secondary'?2:3);
    const apartment=campus.apartments[record.building];point.set(0,apartment.height+.10,0);apartment.group.localToWorld(point);point.project(camera);
    const ax=(point.x*.5+.5)*w,ay=(-point.y*.5+.5)*h;
    const lineFade=enter*(1-phase(t,6.05,7.7))*(record.level==='tertiary'?.42:.75);
    const endX=x+(ax<x?-1:1)*width*scale/2,endY=y;
    const startLineX=mix(ax,centerX,collect),startLineY=mix(ay,centerY,collect);
    const elbowX=mix(startLineX,endX,.56);
    line.setAttribute('d',`M${startLineX},${startLineY} L${elbowX},${endY} L${endX},${endY}`);line.style.opacity=lineFade;
    dot.setAttribute('cx',startLineX);dot.setAttribute('cy',startLineY);dot.style.opacity=lineFade;
  });
  const openSpread=Math.min(w*.34,360),spread=openSpread*(1-closed);
  const logoScale=mix(1.17,.84,finish);
  ui.logoAssembly.style.opacity=phase(t,5.65,6.3);ui.logoAssembly.style.transform=`scale(${logoScale})`;
  ui.leftHalf.style.transform=`translateX(${-spread}px)`;ui.rightHalf.style.transform=`translateX(${spread}px)`;
  ui.guides.style.opacity=phase(t,5.95,6.45)*(1-phase(t,8.1,8.65));
  ui.guides.children[0].style.transform=`translateX(${-spread*.8}px)`;ui.guides.children[1].style.transform=`translateX(${spread*.8}px)`;
  ui.finalName.style.opacity=finish;ui.finalName.style.transform=`translateY(${(1-finish)*8}px)`;
  ui.sampleNote.style.opacity=1-phase(t,5.8,6.6);
  ui.countValue.textContent=String(visibleCount);ui.itemCount.style.opacity=1-finish;
  updateUI();
}
const captions=[['매물 정보','건물과 연결된 매물 설명'],['정보 증가','매물·고객·상담·계약 정보가 쌓입니다.'],['정보 모으기','로고의 두 조각이 정보를 한곳으로 모읍니다.'],['에스테잇플로우','부동산 관리 프로그램']];
function updateUI(){const step=state.time<3?0:state.time<6?1:state.time<8.65?2:3;ui.stageNumber.textContent=`0${step+1} — 04`;ui.stageTitle.textContent=captions[step][0];ui.stageDescription.textContent=captions[step][1];ui.timeline.value=state.time;ui.timeline.style.setProperty('--progress',`${state.time*10}%`);ui.timeline.setAttribute('aria-valuetext',`${state.time.toFixed(1)}초, ${captions[step][0]}`);ui.timecode.textContent=`${state.time.toFixed(1).padStart(4,'0')} / 10.0`;ui.play.textContent=state.playing?'Ⅱ':'▶';ui.play.setAttribute('aria-label',state.playing?'일시정지':'재생');document.querySelectorAll('[data-time]').forEach((button,i)=>button.setAttribute('aria-current',String(i===step)));}
function tick(now){state.raf=0;if(state.playing&&!document.hidden){state.time+=Math.max(0,Math.min(.1,(now-state.last)/1000))*state.speed;if(state.time>=10){state.time=state.loop?0:10;if(!state.loop)state.playing=false;}}state.last=now;render();if(state.playing&&!document.hidden)state.raf=requestAnimationFrame(tick);}
function requestRender(){if(!state.raf){state.last=performance.now();state.raf=requestAnimationFrame(tick);}}
function play(){if(ui.play.disabled)return;if(state.time>=10)state.time=0;state.playing=!state.playing;requestRender();}
function replay(){if(ui.play.disabled)return;state.time=0;state.playing=true;requestRender();}
function view(splash){ui.experience.classList.toggle('splash-mode',splash);ui.splashView.setAttribute('aria-pressed',String(splash));ui.loginView.setAttribute('aria-pressed',String(!splash));resize();requestRender();}
function fail(){state.playing=false;cancelAnimationFrame(state.raf);state.raf=0;ui.modelLayer.style.display='none';ui.callouts.style.display='none';ui.connections.style.display='none';ui.logoAssembly.style.opacity=1;ui.leftHalf.style.transform=ui.rightHalf.style.transform='none';ui.finalName.style.opacity=1;ui.sampleNote.style.display='none';ui.stageTitle.textContent='에스테잇플로우';ui.stageDescription.textContent='정적 로고 미리보기';ui.play.disabled=ui.replay.disabled=ui.timeline.disabled=true;}
ui.play.addEventListener('click',play);ui.replay.addEventListener('click',replay);ui.timeline.addEventListener('input',()=>{state.time=Number(ui.timeline.value);state.playing=false;requestRender();});document.querySelectorAll('[data-time]').forEach(button=>button.addEventListener('click',()=>{state.time=Number(button.dataset.time);state.playing=false;requestRender();}));ui.speed.addEventListener('change',()=>state.speed=Number(ui.speed.value));ui.loop.addEventListener('change',()=>{state.loop=ui.loop.checked;if(state.loop&&state.time>=10)replay();});ui.splashView.addEventListener('click',()=>view(true));ui.loginView.addEventListener('click',()=>view(false));
document.addEventListener('keydown',event=>{if(event.target.closest('input,button,select,textarea'))return;if(event.code==='Space'){event.preventDefault();play();}if(event.key.toLowerCase()==='r')replay();});document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(state.raf);state.raf=0;}else requestRender();});reduced.addEventListener('change',event=>{if(event.matches){state.time=10;state.playing=false;requestRender();}});
$('loginForm').addEventListener('submit',event=>{event.preventDefault();ui.formNote.textContent='디자인 미리보기입니다. 실제 로그인은 연결하지 않았습니다.';});$('forgot').addEventListener('click',()=>ui.formNote.textContent='비밀번호 찾기는 실제 앱에서 사용할 수 있습니다.');
window.addEventListener('pagehide',event=>{cancelAnimationFrame(state.raf);state.raf=0;if(event.persisted)return;observer?.disconnect();const geo=new Set(),mat=new Set();scene?.traverse(o=>{if(o.geometry)geo.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>mat.add(m));});geo.forEach(g=>g.dispose());mat.forEach(m=>m.dispose());renderer?.dispose();});window.addEventListener('pageshow',event=>{if(event.persisted)requestRender();});
try{if(new URLSearchParams(location.search).has('fallback'))throw new Error('Static preview');init();}catch(error){console.error(error);fail();}
