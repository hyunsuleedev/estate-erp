import * as THREE from 'three';
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

export function createCampus(scene){
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

return {context,signature,apartments,shadow};
}
