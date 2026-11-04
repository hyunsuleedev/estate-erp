import * as THREE from 'three';

// Standalone splash renderer. The host can signal readiness through estaitSplash.finish().
// The two footprint polygons preserve the geometry of the supplied lockup.svg.
const WINGS = [
  [[19.142,32.872],[25.370,77.037],[65.571,81],[63.306,65.995],[41.224,63.164],[36.977,35.420]],
  [[35.845,19],[38.110,34.005],[60.758,37.402],[64.721,64.580],[80.858,66.562],[74.347,24.096]],
].map(polygon => polygon.map(([x,z]) => [(x-50)/16,(z-50)/16]));
// Divide each logo wing into four detached apartment footprints. Their gaps stay
// open through the plan view; only the final brand transition joins the parcels.
const interpolatePoint=(a,b,t)=>a.map((value,i)=>value+(b[i]-value)*t);
// Both Ls must start at an arm tip and follow the OUTER elbow first.
// The source SVG's second polygon has opposite winding. Splitting it with the
// first polygon's indices would produce crossing quadrilaterals and torn faces.
const APARTMENTS=WINGS.flatMap((original,wing)=>{
  const p=wing===0?original:[original[0],original[5],original[4],original[3],original[2],original[1]];
  return [
  [p[0],p[1],p[4],p[5]], [p[1],p[2],p[3],p[4]],
].flatMap((quad,arm)=>[0,1].map(part=>{
  const a=part/2,b=(part+1)/2;
  const points=[interpolatePoint(quad[0],quad[1],a),interpolatePoint(quad[0],quad[1],b),interpolatePoint(quad[3],quad[2],b),interpolatePoint(quad[3],quad[2],a)];
  const center=points.reduce((sum,point)=>sum.map((v,i)=>v+point[i]/4),[0,0]);
  return {points:points.map(point=>point.map((v,i)=>v-center[i])),center,height:[1.9,2.3,1.5,1.8,1.6,2.1,2.4,1.75][wing*4+arm*2+part]};
}));
});
const CAMPUS_SCALE=1.55, BUILDING_INSET=.76, CAMPUS_SPREAD=1.09;
const DURATION = 9;
const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['scene','fallback','experience','sceneLockup','status'].map(id=>[id,$(id)]));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const state = {time: reducedMotion.matches ? DURATION : 0, playing: !reducedMotion.matches, last:0, raf:0, completed:false, failed:false, disposed:false};
let completionTimer;
const clamp = n => Math.min(1,Math.max(0,n));
const smooth = n => { const t=clamp(n); return t*t*t*(t*(t*6-15)+10); };
const phase = (t,a,b) => smooth((t-a)/(b-a));
const mix = THREE.MathUtils.lerp;
const colorIvory = new THREE.Color('#eeeede');
const colorInk = new THREE.Color('#333b2f');
let renderer, scene, camera, resizeObserver, resources;

function fail(message) {
  state.failed=true;state.playing=false;
  cancelAnimationFrame(state.raf);state.raf=0;
  ui.experience.classList.add('static-logo');
  ui.fallback.hidden=false;
  if(renderer)renderer.domElement.style.display='none';
  ui.sceneLockup.style.opacity=1;
  ui.status.textContent=message;
}

function material(color,extra={}) {
  return new THREE.MeshStandardMaterial({color,roughness:1,metalness:0,transparent:true,...extra});
}
function faded(group,value) {
  group.visible=value>0.001;
  group.traverse(object=>{
    if(!object.material) return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    for(const m of materials) m.opacity=(m.userData.baseOpacity??1)*value;
  });
}
function outlinedBox(w,h,d,color='#eeeee4') {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color));
  mesh.castShadow=true;mesh.receiveShadow=true;
  const edgeMaterial=new THREE.LineBasicMaterial({color:'#6a7161',transparent:true,opacity:.32});
  edgeMaterial.userData.baseOpacity=.32;
  const edge=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),edgeMaterial);
  mesh.add(edge);
  return mesh;
}
function path(points,color='#a2aa94',opacity=1) {
  const mat=new THREE.LineBasicMaterial({color,transparent:true,opacity});
  mat.userData.baseOpacity=opacity;
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),mat);
}
function footprint(points,height,color) {
  const shape=new THREE.Shape();
  points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1,curveSegments:1});
  geo.rotateX(-Math.PI/2);
  const mesh=new THREE.Mesh(geo,material(color));mesh.castShadow=true;mesh.receiveShadow=true;
  return mesh;
}
function tree(x,z,size) {
  const group=new THREE.Group();
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.02,.025,.22,5),material('#9ca38b'));
  stem.position.y=.12;
  const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(size,1),material('#abb397'));
  crown.position.y=.27+size*.5;crown.castShadow=true;
  group.add(stem,crown);group.position.set(x,0,z);return group;
}
function createScene() {
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.setClearColor('#f6f5f0',0);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
  renderer.domElement.setAttribute('aria-label','3D 건축 모형: 단지, 조망, 도면, 브랜드');
  renderer.domElement.setAttribute('role','img');
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();fail('3D 화면이 중단되었습니다. 새로고침하면 다시 볼 수 있습니다.');});
  ui.scene.prepend(renderer.domElement);
  scene=new THREE.Scene();
  camera=new THREE.OrthographicCamera(-8,8,6,-6,.1,100);
  scene.add(new THREE.HemisphereLight('#ffffff','#cbcbb8',2.5));
  const sun=new THREE.DirectionalLight('#fff9e7',3.2);
  sun.position.set(-5,12,7);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:1,far:35});
  sun.shadow.bias=-.0003;sun.shadow.normalBias=.035;sun.shadow.radius=4;
  scene.add(sun);
  const fill=new THREE.DirectionalLight('#e1e8f2',.7);fill.position.set(8,5,-7);scene.add(fill);
  const context=new THREE.Group();scene.add(context);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.ShadowMaterial({opacity:.10}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=-.15;shadow.receiveShadow=true;scene.add(shadow);
  const plate=outlinedBox(10.9,.14,8.7,'#f2f1e8');plate.position.y=-.09;context.add(plate);
  // A lightly engraved perimeter and pathways anchor the composition like a model.
  const perimeter=[[-5.05,.006,-3.95],[5.05,.006,-3.95],[5.05,.006,3.95],[-5.05,.006,3.95],[-5.05,.006,-3.95]];
  context.add(path(perimeter,'#a9b19b',.35));
  for(const x of [-2.7,2.7]) context.add(path([[x,.012,-3.8],[x,.012,3.8]],'#b1b7a5',.38));
  for(const z of [-2.55,2.55]) context.add(path([[-4.95,.012,z],[4.95,.012,z]],'#b1b7a5',.38));
  // The whole model is one residential campus: eight freestanding apartment
  // blocks, a shared garden, trees and pedestrian gaps rather than two megablocks.
  const garden=outlinedBox(1.15,.025,1.25,'#cdd3bc');garden.position.set(.05,.012,0);context.add(garden);
  const walk=path([[-.75,.035,-.85],[.85,.035,-.85],[.85,.035,.85],[-.75,.035,.85],[-.75,.035,-.85]],'#abb69b',.5);context.add(walk);
  [[-4.4,-1.4,.24],[-4.1,1.55,.27],[-2.4,3.5,.2],[.4,3.55,.21],[1.4,3.6,.19],[4.25,1.4,.25],[4.4,-1.3,.24],[-2.4,-3.5,.21],[-.25,-.25,.22],[.3,.3,.18]].forEach(p=>context.add(tree(...p)));
  const signature=new THREE.Group();scene.add(signature);
  const apartments=APARTMENTS.map(({points,center,height},index)=>{
    const group=new THREE.Group();signature.add(group);
    group.position.set(center[0]*CAMPUS_SCALE*CAMPUS_SPREAD,0,center[1]*CAMPUS_SCALE*CAMPUS_SPREAD);
    group.scale.set(CAMPUS_SCALE*BUILDING_INSET,1,CAMPUS_SCALE*BUILDING_INSET);
    const body=footprint(points,height,'#e9eadc');group.add(body);
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry),new THREE.LineBasicMaterial({color:'#626f52',transparent:true,opacity:.44}));
    edges.material.userData.baseOpacity=.44;body.add(edges);
    // Exterior floor bands read clearly in the oblique view, then disappear overhead.
    for(let y=.26;y<height-.1;y+=.27) {
      const ring=points.map(([x,z])=>[x,y,z]);ring.push(ring[0]);body.add(path(ring,'#7c896c',.33));
    }
    // Window bays on all four facades keep each detached block legible as housing.
    points.forEach((a,edge)=>{
      const b=points[(edge+1)%points.length];
      for(const fraction of [.25,.5,.75]) {
        const [x,z]=interpolatePoint(a,b,fraction);
        body.add(path([[x,.15,z],[x,height-.14,z]],'#98a18a',.33));
      }
    });
    const roof=footprint(points,.04,'#f3f3e7');roof.position.y=height+.01;group.add(roof);
    const rim=path([...points,points[0]].map(([x,z])=>[x,.045,z]),'#7a876b',.6);roof.add(rim);
    const rooftop=outlinedBox(.24,.11,.21,'#e3e6d7');rooftop.position.y=.095;roof.add(rooftop);
    return {group,body,roof,index,height};
  });
  const plan=new THREE.Group();scene.add(plan);
  // Retain eight separate footprints and their passageways in the plan view.
  const planLines=new THREE.Group();plan.add(planLines);
  const planGroups=[];
  APARTMENTS.forEach(({points,center})=>{
    const group=new THREE.Group();planLines.add(group);
    planGroups.push({group,center});
    group.position.set(center[0]*CAMPUS_SCALE*CAMPUS_SPREAD,0,center[1]*CAMPUS_SCALE*CAMPUS_SPREAD);
    group.scale.set(CAMPUS_SCALE*BUILDING_INSET,1,CAMPUS_SCALE*BUILDING_INSET);
    group.add(path([...points,points[0]].map(([x,z])=>[x,.075,z]),'#4d5f3d',.75));
    for(const fraction of [.33,.66]) {
      const a=interpolatePoint(points[0],points[1],fraction),b=interpolatePoint(points[3],points[2],fraction);
      group.add(path([a,b].map(([x,z])=>[x,.08,z]),'#718061',.65));
    }
  });
  const dimension=new THREE.Group();plan.add(dimension);
  const dims=[[-3.65,.02,-3.6,3.65,.02,-3.6],[-3.65,.02,3.55,3.65,.02,3.55]];
  dims.forEach(a=>{
    dimension.add(path([a.slice(0,3),a.slice(3)],'#a1ae91',.65));
    for(const x of [-3.4,3.4]) dimension.add(path([[x,.02,a[2]-.1],[x,.02,a[2]+.1]],'#a1ae91',.65));
  });
  const parcels=new THREE.Group();scene.add(parcels);
  const parcelMeshes=APARTMENTS.map(({points,center})=>{
    const mesh=footprint(points,.025,'#f0f0e7');mesh.position.y=.025;
    mesh.material.dispose();mesh.material=new THREE.MeshBasicMaterial({color:'#f0f0e7',transparent:true});
    parcels.add(mesh);return {mesh,center};
  });
  const logoGroup=new THREE.Group();scene.add(logoGroup);
  const logo=WINGS.map(points=>{
    const mesh=footprint(points,.025,'#f0f0e7');mesh.position.y=.025;
    // Basic material makes the final frame faithfully match the supplied SVG ink.
    mesh.material.dispose();mesh.material=new THREE.MeshBasicMaterial({color:'#f0f0e7',transparent:true});
    logoGroup.add(mesh);return mesh;
  });
  resources={context,signature,apartments,plan,planLines,planGroups,dimension,parcels,parcelMeshes,logoGroup,logo,shadow};
  ui.fallback.hidden=true;
  resizeObserver=new ResizeObserver(()=>{resize();requestRender();});resizeObserver.observe(ui.scene);
  resize();
}
function resize() {
  if(!renderer)return;
  const rect=ui.scene.getBoundingClientRect();
  renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);
}
function render() {
  if(!renderer||!resources)return;
  const t=state.time;
  const orbit=phase(t,1.75,3.7);
  const isolate=phase(t,3.5,5.0);
  // Only crossfade after the camera has fully reached its overhead position.
  // Buildings and roofs remain rigid at their original transforms throughout.
  const reveal=phase(t,4.1,5.2);
  const mark=phase(t,6.25,7.85);
  const finish=phase(t,7.7,8.8);
  const r=resources;
  faded(r.context,phase(t,0,.7)*(1-isolate));
  r.signature.visible=reveal<1;
  r.apartments.forEach(({group,index})=>{
    const intro=phase(t,.08+index*.055,.95+index*.055);
    faded(group,intro*(1-reveal));
  });
  faded(r.plan,reveal*(1-mark));
  const join=phase(t,6.25,7.65),handoff=phase(t,7.65,7.85);
  faded(r.parcels,reveal*(1-handoff));
  r.parcelMeshes.forEach(({mesh,center})=>{
    const spread=mix(CAMPUS_SCALE*CAMPUS_SPREAD,1,join);
    mesh.position.set(center[0]*spread,.025,center[1]*spread);
    const size=mix(CAMPUS_SCALE*BUILDING_INSET,1,join);
    mesh.scale.set(size,1,size);
    mesh.material.color.copy(colorIvory).lerp(colorInk,mark);
  });
  r.planGroups.forEach(({group,center})=>{
    const spread=mix(CAMPUS_SCALE*CAMPUS_SPREAD,1,join);
    const size=mix(CAMPUS_SCALE*BUILDING_INSET,1,join);
    group.position.set(center[0]*spread,0,center[1]*spread);
    group.scale.set(size,1,size);
  });
  faded(r.logoGroup,handoff);
  r.logo.forEach(mesh=>mesh.material.color.copy(colorIvory).lerp(colorInk,mark));
  r.logoGroup.scale.setScalar(mix(1,.5,finish));
  r.shadow.material.opacity=.1*(1-isolate);
  // Orbit the camera, keeping buildings upright. Near zenith, a small Z offset
  // avoids a singular lookAt orientation while preserving the plan's north.
  const radius=20,angle=mix(.87,.0001,orbit),azimuth=mix(.58,0,orbit);
  const targetY=mix(.65,0,orbit);
  camera.position.set(radius*Math.sin(angle)*Math.sin(azimuth),targetY+radius*Math.cos(angle),radius*Math.sin(angle)*Math.cos(azimuth));
  camera.lookAt(0,targetY,0);
  const aspect=Math.max(.1,ui.scene.clientWidth/Math.max(1,ui.scene.clientHeight));
  const startHeight=Math.max(8.7,13.5/aspect);
  const height=mix(startHeight,mix(8.8,6.5,join),isolate);
  camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;
  camera.updateProjectionMatrix();renderer.render(scene,camera);
  ui.sceneLockup.style.opacity=finish;
  ui.sceneLockup.style.transform=`translateY(${(1-finish)*9}px)`;
}

// The 9-second study finishes on its logo without pretending an app has loaded.
// Calling finish() lets a host end early without accelerating the camera orbit.
function finish(onComplete) {
  if(state.completed||state.disposed)return;
  state.completed=true;state.playing=false;
  cancelAnimationFrame(state.raf);state.raf=0;
  ui.experience.classList.add('ready');
  ui.status.textContent='준비되었습니다.';
  ui.experience.setAttribute('aria-busy','false');
  if(state.time<DURATION||state.failed){
    ui.fallback.hidden=false;
    ui.experience.classList.add('static-logo');
    ui.sceneLockup.style.opacity=1;
    ui.sceneLockup.style.transform='none';
  }
  completionTimer=setTimeout(()=>{
    window.dispatchEvent(new CustomEvent('estait:splash-complete'));
    if(typeof onComplete==='function'){
      ui.experience.classList.add('leaving');
      completionTimer=setTimeout(()=>{if(!state.disposed)onComplete();},reducedMotion.matches?0:180);
    }
  },reducedMotion.matches?0:280);
}

function tick(now) {
  state.raf=0;
  if(state.playing&&!document.hidden) {
    state.time+=Math.max(0,Math.min((now-state.last)/1000,.1));
    if(state.time>=DURATION) {
      state.time=DURATION;
      state.playing=false;
    }
  }
  state.last=now;
  render();
  if(state.playing&&!document.hidden)state.raf=requestAnimationFrame(tick);
}
function requestRender() {
  if(!state.raf&&!state.disposed&&!state.failed&&!state.completed&&!document.hidden){state.last=performance.now();state.raf=requestAnimationFrame(tick);}
}
function visibilityChanged(){
  if(document.hidden){cancelAnimationFrame(state.raf);state.raf=0;}else requestRender();
}
function motionChanged(event){if(event.matches){state.time=DURATION;state.playing=false;requestRender();}}
function readyEvent(){finish();}
function dispose(){
  state.disposed=true;state.playing=false;
  clearTimeout(completionTimer);cancelAnimationFrame(state.raf);state.raf=0;
  resizeObserver?.disconnect();
  document.removeEventListener('visibilitychange',visibilityChanged);
  reducedMotion.removeEventListener('change',motionChanged);
  window.removeEventListener('estait:ready',readyEvent);
  const geometries=new Set(),materials=new Set();
  scene?.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)(Array.isArray(object.material)?object.material:[object.material]).forEach(m=>materials.add(m));});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer?.dispose();
}
document.addEventListener('visibilitychange',visibilityChanged);
reducedMotion.addEventListener('change',motionChanged);
window.addEventListener('estait:ready',readyEvent);
window.addEventListener('pagehide',event=>{if(event.persisted){cancelAnimationFrame(state.raf);state.raf=0;}else dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted)requestRender();});
window.estaitSplash={finish,dispose};
// A query flag makes the static fallback reviewable without disabling browser GPU settings.
try {
  if(new URLSearchParams(location.search).has('fallback'))throw new Error('Fallback preview');
  createScene();requestRender();
} catch(error) {
  console.error('Architectural splash could not start:',error);
  fail('3D를 사용할 수 없어 정적인 브랜드 화면을 표시합니다.');
}
