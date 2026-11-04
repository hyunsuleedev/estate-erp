import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth = x => { x=clamp(x,0,1); return x*x*x*(x*(x*6-15)+10); };
const phase = (t,a,b) => smooth((t-a)/(b-a));
const state = { time:reduced.matches?10:0, playing:!reduced.matches, last:0, raf:0 };
const points = [
 [[19.142,32.872],[25.370,77.037],[65.571,81],[63.306,65.995],[41.224,63.164],[36.977,35.420]],
 [[35.845,19],[38.110,34.005],[60.758,37.402],[64.721,64.580],[80.858,66.562],[74.347,24.096]],
];
let renderer, scene, camera, composer, bloom, emblem, halves, gold, edgeGold, key, rim, halo, dust, dustMaterial, rings, ringMaterials, floor, environmentTarget, observer;
const ownedTextures=[];

function texture(draw,size=256) {
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 draw(canvas.getContext('2d'),size);
 const tex=new THREE.CanvasTexture(canvas);ownedTextures.push(tex);return tex;
}

function environment() {
 const room=new THREE.Scene();room.background=new THREE.Color('#171d17');
 const panel=(w,h,x,y,z,color,intensity,ry=0,rx=0)=>{
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(intensity),side:THREE.DoubleSide}));
  mesh.position.set(x,y,z);mesh.rotation.set(rx,ry,0);room.add(mesh);
 };
 panel(3,9,-4,3,5,'#fff0d3',6,.6);
 panel(1.3,10,5,0,2,'#c3d9d2',4,-1);
 panel(8,1.5,0,6,1,'#ffe4a9',5,0,Math.PI/2);
 panel(7,4,0,-4,5,'#8c967e',1.5,0,-.6);
 const pmrem=new THREE.PMREMGenerator(renderer);
 environmentTarget=pmrem.fromScene(room,.025);scene.environment=environmentTarget.texture;scene.environmentIntensity=1;
 room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});pmrem.dispose();
}

function makeEmblem() {
 const brushed=texture((ctx,s)=>{
  let seed=82;const rnd=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  ctx.fillStyle='#aaa';ctx.fillRect(0,0,s,s);
  for(let i=0;i<1400;i++){const v=135+rnd()*60;ctx.strokeStyle=`rgb(${v},${v},${v})`;ctx.lineWidth=.3;ctx.beginPath();const y=rnd()*s;ctx.moveTo(0,y);ctx.lineTo(s,y+(rnd()-.5)*3);ctx.stroke();}
 },512);
 gold=new THREE.MeshPhysicalMaterial({color:'#d2b889',metalness:1,roughness:.23,clearcoat:.45,clearcoatRoughness:.17,anisotropy:.55,bumpMap:brushed,bumpScale:.002,envMapIntensity:1.1});
 edgeGold=new THREE.MeshPhysicalMaterial({color:'#b79b63',metalness:1,roughness:.16,clearcoat:.6,envMapIntensity:1.25});
 emblem=new THREE.Group();scene.add(emblem);
 halves=points.map(poly=>{
  const shape=new THREE.Shape();
  poly.forEach(([x,y],i)=>{const px=(x-50)/22,py=(50-y)/22;i?shape.lineTo(px,py):shape.moveTo(px,py);});shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth:.26,bevelEnabled:true,bevelSegments:5,steps:1,bevelSize:.035,bevelThickness:.045,curveSegments:1});geo.translate(0,0,-.13);
  const mesh=new THREE.Mesh(geo,[gold,edgeGold]);mesh.castShadow=true;mesh.receiveShadow=true;
  const group=new THREE.Group();group.add(mesh);emblem.add(group);return group;
 });
}

function atmosphere() {
 const glow=texture((ctx,s)=>{const g=ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);g.addColorStop(0,'rgba(155,169,125,.2)');g.addColorStop(.35,'rgba(90,114,84,.12)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,s,s);});
 halo=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));halo.position.set(0,.3,-2);halo.scale.set(14,11,1);scene.add(halo);
 const dot=texture((ctx,s)=>{const g=ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);g.addColorStop(0,'rgba(255,241,205,1)');g.addColorStop(.12,'rgba(255,221,167,.7)');g.addColorStop(1,'rgba(255,218,165,0)');ctx.fillStyle=g;ctx.fillRect(0,0,s,s);},32);
 let seed=101;const rnd=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 const positions=new Float32Array(220*3);
 for(let i=0;i<220;i++){positions[i*3]=(rnd()-.5)*13;positions[i*3+1]=(rnd()-.5)*8;positions[i*3+2]=(rnd()-.5)*9;}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
 dustMaterial=new THREE.PointsMaterial({map:dot,color:'#edd6a2',size:.045,transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false});dust=new THREE.Points(geo,dustMaterial);scene.add(dust);
 rings=new THREE.Group();rings.position.y=.15;rings.rotation.set(.9,.25,-.25);scene.add(rings);ringMaterials=[];
 for(let i=0;i<3;i++){
  const pts=[];for(let j=0;j<=150;j++){const a=j/150*Math.PI*(1.2+i*.12);pts.push(new THREE.Vector3(Math.cos(a)*(2.45+i*.26),Math.sin(a)*(2.45+i*.26),0));}
  const mat=new THREE.MeshBasicMaterial({color:new THREE.Color('#e0c18c').multiplyScalar(i===0?2:1),transparent:true,opacity:0,depthWrite:false});ringMaterials.push(mat);
  const ring=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),150,i===0?.006:.0025,5,false),mat);ring.rotation.z=i*1.7;rings.add(ring);
 }
 const floorMat=new THREE.ShadowMaterial({color:'#000000',opacity:.16,depthWrite:false});
 floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),floorMat);floor.rotation.x=-Math.PI/2;floor.position.y=-2.05;floor.receiveShadow=true;scene.add(floor);
}

function render(t) {
 const reveal=phase(t,0,2.5), turn=phase(t,1.7,6.5), join=phase(t,5.8,8.0), finish=phase(t,8.0,9.5);
 // Independent rigid pieces: the source polygon never changes shape.
 halves[0].position.set(lerp(-.65,0,join),lerp(-.12,0,join),lerp(.38,0,join));
 halves[1].position.set(lerp(.65,0,join),lerp(.3,0,join),lerp(-.38,0,join));
 halves[0].rotation.set(lerp(.09,0,join),lerp(-.24,0,join),lerp(-.08,0,join));
 halves[1].rotation.set(lerp(-.15,0,join),lerp(.3,0,join),lerp(.08,0,join));
 emblem.rotation.set(lerp(.13,0,turn),lerp(-.85,0,turn),lerp(-.12,0,turn));
 emblem.position.y=lerp(.1,.65,finish);
 emblem.scale.setScalar(lerp(1,.86,finish));
 camera.position.set(lerp(1.8,0,turn),lerp(1.25,.45,turn),lerp(7.8,10.8,phase(t,0,7.5)));
 camera.lookAt(0,.15,0);camera.updateMatrixWorld();
 const sweep=Math.sin(phase(t,7.8,9.5)*Math.PI);
 key.position.set(lerp(-5,5,phase(t,0,9.5)),4,4);key.intensity=lerp(4,22,reveal)+sweep*12;
 rim.position.set(4,1.3,lerp(-3,4,phase(t,2,7)));rim.intensity=lerp(12,22,reveal);
 scene.environmentIntensity=lerp(.22,.85,reveal);
 gold.emissive.set('#8b6330');gold.emissiveIntensity=sweep*.08;
 halo.material.opacity=lerp(.25,.8,reveal);
 dust.rotation.y=t*.023;dust.position.y=Math.sin(t*.13)*.15;dustMaterial.opacity=phase(t,.5,2)*lerp(.7,.23,finish);
 rings.rotation.z=-.25+t*.15;rings.rotation.y=.25+Math.sin(t*.25)*.12;
 const ringOpacity=phase(t,1.6,3.3)*(1-phase(t,6.6,8.6));ringMaterials.forEach((m,i)=>m.opacity=ringOpacity*(i===0?.55:.18));
 bloom.strength=.35+sweep*.22;
 $('identity').style.opacity=phase(t,8.4,9.5);$('identity').style.transform=`translateY(${(1-phase(t,8.4,9.5))*8}px)`;
 $('progress').style.transform=`scaleX(${t/10})`;
 const statusText=t>=10?'준비 완료':'시작하는 중';if($('status').textContent!==statusText)$('status').textContent=statusText;
 $('timeline').value=t;$('time').textContent=`${t.toFixed(1)} / 10.0`;
 composer.render();
}

function syncPlay(){ $('play').textContent=state.playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',state.playing?'일시정지':'재생'); }
function frame(now){state.raf=0;if(state.playing){state.time=Math.min(10,state.time+(state.last?(now-state.last)/1000:0));state.last=now;if(state.time===10){state.playing=false;syncPlay();}}render(state.time);if(state.playing)state.raf=requestAnimationFrame(frame);}
function requestFrame(){if(!state.raf)state.raf=requestAnimationFrame(frame);}
function seek(t,play=false){state.time=t;state.playing=play;state.last=0;syncPlay();requestFrame();}
function fail(){state.playing=false;cancelAnimationFrame(state.raf);$('scene').hidden=true;$('fallback').hidden=false;$('status').textContent='미리보기';document.querySelectorAll('.controls button,.controls input').forEach(el=>el.disabled=true);}

try {
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(innerWidth,innerHeight);
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 $('scene').appendChild(renderer.domElement);
 scene=new THREE.Scene();scene.background=new THREE.Color('#090e0c');scene.fog=new THREE.FogExp2('#090e0c',.035);
 camera=new THREE.PerspectiveCamera(34,innerWidth/innerHeight,.1,80);
 environment();makeEmblem();atmosphere();
 key=new THREE.SpotLight('#ffe6ba',20,30,.65,.85,1.2);key.position.set(-5,4,4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.bias=-.0003;scene.add(key);
 rim=new THREE.PointLight('#d1e3da',20,25,1.3);scene.add(rim);
 scene.add(new THREE.HemisphereLight('#9ba791','#060906',.45));
 composer=new EffectComposer(renderer);composer.renderTarget1.samples=4;composer.renderTarget2.samples=4;composer.addPass(new RenderPass(scene,camera));
 bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.4,.65,1.05);composer.addPass(bloom);composer.addPass(new OutputPass());
 observer=new ResizeObserver(()=>{const w=innerWidth,h=innerHeight;camera.aspect=w/h;camera.fov=w/h<.8?48:34;camera.updateProjectionMatrix();renderer.setSize(w,h);composer.setSize(w,h);requestFrame();});observer.observe($('scene'));
 renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();fail();});
 $('replay').addEventListener('click',()=>seek(0,true));
 $('play').addEventListener('click',()=>{if(state.time>=10)state.time=0;state.playing=!state.playing;state.last=0;syncPlay();requestFrame();});
 $('timeline').addEventListener('input',event=>seek(Number(event.target.value)));
 document.querySelectorAll('[data-time]').forEach(button=>button.addEventListener('click',()=>seek(Number(button.dataset.time))));
 document.addEventListener('visibilitychange',()=>{state.last=0;if(document.hidden){cancelAnimationFrame(state.raf);state.raf=0;}else requestFrame();});
 reduced.addEventListener('change',()=>{if(reduced.matches)seek(10);});
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(state.raf);observer.disconnect();scene.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});ownedTextures.forEach(t=>t.dispose());environmentTarget.dispose();composer.passes.forEach(p=>p.dispose?.());composer.dispose();renderer.dispose();});
 syncPlay();requestFrame();
} catch(error){console.error('Splash initialization failed',error);fail();}
