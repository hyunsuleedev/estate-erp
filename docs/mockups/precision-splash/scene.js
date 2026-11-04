import * as THREE from 'three';

const $=id=>document.getElementById(id);
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const lerp=THREE.MathUtils.lerp;
const phase=(t,a,b)=>{const x=THREE.MathUtils.clamp((t-a)/(b-a),0,1);return x*x*x*(x*(x*6-15)+10);};
const state={time:reduced.matches?10:0,playing:!reduced.matches,last:0,raf:0};
const points=[[[19.142,32.872],[25.370,77.037],[65.571,81],[63.306,65.995],[41.224,63.164],[36.977,35.420]],[[35.845,19],[38.110,34.005],[60.758,37.402],[64.721,64.580],[80.858,66.562],[74.347,24.096]]];
let renderer,scene,camera,emblem,halves,observer,envTarget,key,shadow;
const scan={uScan:{value:2},uScanStrength:{value:0}};

function environment(){
 const room=new THREE.Scene();room.background=new THREE.Color('#929da6');
 const add=(w,h,x,y,z,intensity,ry=0,rx=0)=>{const p=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color().setScalar(intensity),side:THREE.DoubleSide}));p.position.set(x,y,z);p.rotation.set(rx,ry,0);room.add(p);};
 add(5,9,-5,3,4,2.8,.6);add(2,8,5,0,3,1.7,-.7);add(8,3,0,6,2,2.2,0,Math.PI/2);add(7,5,0,-5,3,.3);
 const pmrem=new THREE.PMREMGenerator(renderer);envTarget=pmrem.fromScene(room,.08);scene.environment=envTarget.texture;
 room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});pmrem.dispose();
}

function material(color,roughness,metalness){
 const mat=new THREE.MeshPhysicalMaterial({color,roughness,metalness,clearcoat:.2,clearcoatRoughness:.35});
 mat.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,scan);
  shader.vertexShader='varying float vLocalY;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLocalY = position.y;');
  shader.fragmentShader='varying float vLocalY; uniform float uScan; uniform float uScanStrength;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','float scanLine = exp(-pow((vLocalY-uScan)/0.027,2.0))*uScanStrength; outgoingLight += vec3(0.10,0.48,0.68)*scanLine;\n#include <opaque_fragment>');
 };
 return mat;
}

function model(){
 const face=material('#b8c1ca',.32,.86),edge=material('#7e8d9b',.23,.85);
 emblem=new THREE.Group();scene.add(emblem);
 halves=points.map(poly=>{const shape=new THREE.Shape();poly.forEach(([x,y],i)=>{const px=(x-50)/22,py=(50-y)/22;i?shape.lineTo(px,py):shape.moveTo(px,py);});shape.closePath();const geo=new THREE.ExtrudeGeometry(shape,{depth:.2,bevelEnabled:true,bevelSegments:5,bevelSize:.024,bevelThickness:.025,steps:1});geo.translate(0,0,-.1);const mesh=new THREE.Mesh(geo,[face,edge]);const group=new THREE.Group();group.add(mesh);emblem.add(group);return group;});
 // A diffuse, screen-facing contact shadow keeps the otherwise empty space grounded.
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');const gradient=ctx.createRadialGradient(64,64,0,64,64,64);gradient.addColorStop(0,'rgba(61,75,90,.15)');gradient.addColorStop(.4,'rgba(61,75,90,.07)');gradient.addColorStop(1,'rgba(61,75,90,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
 const map=new THREE.CanvasTexture(canvas);shadow=new THREE.Mesh(new THREE.PlaneGeometry(4.4,2.5),new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false}));shadow.position.set(0,-.65,-1);scene.add(shadow);
}

function render(t){
 const turn=phase(t,.6,6),join=phase(t,5,8.4),settle=phase(t,8.2,9.6);
 emblem.rotation.set(lerp(.14,0,turn),lerp(-.62,0,turn),0);
 emblem.position.y=lerp(.1,.52,settle);
 halves[0].position.set(lerp(-.32,0,join),0,lerp(.18,0,join));
 halves[1].position.set(lerp(.32,0,join),0,lerp(-.18,0,join));
 halves[0].rotation.y=lerp(-.1,0,join);halves[1].rotation.y=lerp(.1,0,join);
 scan.uScan.value=lerp(1.6,-1.6,phase(t,2,6.8));scan.uScanStrength.value=phase(t,1.8,2.8)*(1-phase(t,6,7.2))*.8;
 key.position.set(lerp(-2.5,1.5,phase(t,1,8)),2.6,3.5);
 shadow.material.opacity=lerp(.6,.4,settle);
 $('identity').style.opacity=phase(t,8.2,9.6);$('identity').style.transform=`translateY(${(1-phase(t,8.2,9.6))*5}px)`;
 $('progress').style.transform=`scaleX(${t/10})`;
 const label=t>=10?'준비 완료':'시작하는 중';if($('status').textContent!==label)$('status').textContent=label;
 $('timeline').value=t;$('time').textContent=`${t.toFixed(1)} / 10.0`;
 renderer.render(scene,camera);
}
function syncPlay(){$('play').textContent=state.playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',state.playing?'일시정지':'재생');}
function frame(now){state.raf=0;if(state.playing){state.time=Math.min(10,state.time+(state.last?(now-state.last)/1000:0));state.last=now;if(state.time===10){state.playing=false;syncPlay();}}render(state.time);if(state.playing)state.raf=requestAnimationFrame(frame);}
function requestFrame(){if(!state.raf&&!document.hidden)state.raf=requestAnimationFrame(frame);}
function seek(t,playing=false){state.time=t;state.playing=playing;state.last=0;syncPlay();requestFrame();}
function fail(error){console.error(error);state.playing=false;cancelAnimationFrame(state.raf);$('scene').hidden=true;$('fallback').hidden=false;$('status').textContent='미리보기';document.querySelectorAll('.controls button,.controls input').forEach(el=>el.disabled=true);}
try{
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.setClearColor('#eef0f2',0);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
 $('scene').appendChild(renderer.domElement);scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-8,8,4.7,-4.7,.1,50);camera.position.set(0,0,12);camera.lookAt(0,0,0);
 environment();model();key=new THREE.PointLight('#f2f8ff',34,20,2);scene.add(key);scene.add(new THREE.HemisphereLight('#ffffff','#8794a1',.7));
 observer=new ResizeObserver(()=>{const w=innerWidth,h=innerHeight,extent=w/h<.8?5.5:4.7;camera.left=-extent*w/h;camera.right=extent*w/h;camera.top=extent;camera.bottom=-extent;camera.updateProjectionMatrix();renderer.setSize(w,h);requestFrame();});observer.observe($('scene'));
 $('replay').addEventListener('click',()=>seek(0,true));$('play').addEventListener('click',()=>{if(state.time>=10)state.time=0;state.playing=!state.playing;state.last=0;syncPlay();requestFrame();});$('timeline').addEventListener('input',event=>seek(Number(event.target.value)));document.querySelectorAll('[data-time]').forEach(button=>button.addEventListener('click',()=>seek(Number(button.dataset.time))));
 document.addEventListener('visibilitychange',()=>{state.last=0;if(document.hidden){cancelAnimationFrame(state.raf);state.raf=0;}else requestFrame();});reduced.addEventListener('change',()=>{if(reduced.matches)seek(10);});renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();fail('WebGL context lost');});
 syncPlay();requestFrame();
}catch(error){fail(error);}
