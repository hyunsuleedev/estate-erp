import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  mergeGeometries,
  mergeVertices,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";

// 앱을 처음 켤 때 한 번 보여 주는 신축 단지 장면. 층이 올라가 완공되면 끝난다.
// 단위는 미터(층고 3, 필로티 5.4)이고 실제 주동 구조를 따른다.
//  - 판상형: "2세대 1코어" 모듈(폭 27 = 84㎡ 4베이 13.5 × 2, 깊이 11)을 옆으로 잇고 모듈마다 층수를 달리한다.
//    세대 전면은 침실·침실·거실·안방 4베이, 거실은 돌출 발코니, 안방 옆은 실외기실 루버.
//    뒷면 가운데로 계단·승강기 코어가 튀어나온다.
//  - 탑상형: 가운데 코어에서 날개 셋이 120°로 뻗는 Y자형. 날개 끝은 거실 2면 개방.
//  - 배치: 주동은 모두 남향(+z)에 가깝게 놓고 조금씩 틀며, 남쪽 동을 낮춘다.
//    가운데에 연못과 잔디 마당, 정문 쪽에 커뮤니티와 상가.
// 시안과 측정 기록: docs/mockups/splash-v2/09-complex-3d.html

export interface SplashScene {
  pause(): void;
  resume(): void;
  /** 앱이 먼저 준비됐을 때 남은 공정을 빠르게 넘긴다. */
  hurry(): void;
  dispose(): void;
}
export interface SplashSceneEvents {
  /** WebGL을 쓸 수 없거나 컨텍스트를 잃었다. */
  onError(): void;
  /** 셰이더 준비가 끝나 첫 프레임을 그릴 수 있다. */
  onReady(): void;
  /** 단지가 완공됐다. */
  onComplete(): void;
}

type Bay = { t: string; w: number };
type Paint = { color: THREE.Color; mat?: THREE.Material };
type Surface = THREE.Material | Paint;
type Pad = { x: number; z: number; rot: number; hw: number; hd: number };
type Crane = { group: THREE.Group; mast: THREE.Mesh; top: THREE.Group };
type Unit = {
  start: number;
  n: number;
  H: number;
  plane: THREE.Plane;
  cap: THREE.Mesh;
  roof: THREE.Group;
  crane: Crane | null;
  done: number | null;
};
type WingSpec = {
  x: number;
  z: number;
  rot: number;
  w: number;
  d: number;
  n: number;
  start: number;
  front: Bay[];
  back: Bay[];
  endP: Bay[];
  endN: Bay[];
  bays: number[];
  backBays?: number[];
  fins: number[];
  cores?: number[];
  canopy?: boolean;
  crown?: boolean;
  crane?: boolean;
};

const FH = 3;
const PIL = 5.4;
/** 외벽 그림의 미터당 픽셀 */
const PX = 12;
/** 외벽 그림 한 장에 그려 두는 최대 층수 */
const NMAX = 36;
const SW = 220;
const SD = 170;
/** 평소 속도로 완공까지 걸리는 시간(ms) */
const GROW_MS = 3400;
const BACKGROUND = "#f6f5f0";

const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const P = (...list: [string, number][]): Bay[] =>
  list.map(([t, w]) => ({ t, w }));
const UNIT = P(
  ["S", 0.4],
  ["B", 2.5],
  ["S", 0.4],
  ["B", 2.5],
  ["S", 0.3],
  ["L", 4.4],
  ["S", 0.3],
  ["M", 2.0],
  ["V", 0.7],
);
// 칸 종류: B 침실창 · L 거실창(유리 난간) · M 안방창 · E 모서리 통창 · K 주방 작은 창
//          V 실외기실 루버 · G 계단실 유리띠 · A 짙은 포인트 · W 목재색 줄 · S 벽
const PAT = {
  slabFront: [...UNIT, ...UNIT.slice().reverse()],
  slabBack: P(
    ["S", 1],
    ["K", 1.8],
    ["S", 2],
    ["K", 1.2],
    ["S", 15],
    ["K", 1.2],
    ["S", 2],
    ["K", 1.8],
    ["S", 1],
  ),
  gable: P(
    ["S", 1.4],
    ["K", 1.6],
    ["S", 2.6],
    ["A", 3.2],
    ["W", 0.5],
    ["S", 1.7],
  ),
  lobeSide: P(
    ["S", 2.4],
    ["B", 2.4],
    ["S", 0.4],
    ["M", 2.2],
    ["V", 0.7],
    ["S", 0.3],
    ["L", 4.4],
    ["S", 0.4],
    ["B", 2.4],
    ["S", 0.4],
  ),
  lobeEnd: P(["S", 0.6], ["E", 5.2], ["S", 0.9], ["E", 5.2], ["S", 0.6]),
  bay: P(["L", 4.4]),
  core: P(["A", 1.3], ["G", 3], ["W", 0.4], ["A", 0.9]),
  blank: P(["S", 12.5]),
};
const isMaterial = (q: Surface): q is THREE.Material =>
  (q as THREE.Material).isMaterial === true;
const WHITE = new THREE.Color(1, 1, 1);
const C = (hex: string, mat?: THREE.Material): Paint => ({
  color: new THREE.Color(hex),
  mat,
});
const mat = (color: string, roughness = 0.85, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const canvasOf = (width: number, height: number) =>
  Object.assign(document.createElement("canvas"), { width, height });
const context2d = (canvas: HTMLCanvasElement) => {
  const c = canvas.getContext("2d");
  if (!c) throw new Error("2D canvas is unavailable");
  return c;
};

export function createComplexScene(
  host: HTMLElement,
  wordmark: HTMLElement,
  events: SplashSceneEvents,
): SplashScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(BACKGROUND, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // 그림자는 장면이 바뀌는 동안에만 다시 그린다(tick 참고).
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.localClippingEnabled = true;
  renderer.domElement.setAttribute("aria-hidden", "true");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 20, 2600);

  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const units: Unit[] = [];
  const extras: { o: THREE.Object3D; at: number }[] = [];
  const pads: Pad[] = [];
  const cache = new Map<
    string,
    { map: THREE.CanvasTexture; orm: THREE.CanvasTexture }
  >();
  const paintM = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
  });
  let pending = new Map<
    THREE.Object3D,
    Map<THREE.Material, THREE.BufferGeometry[]>
  >();
  let sun: THREE.DirectionalLight | null = null;

  // 외벽 한 면: 색 지도와, 유리만 매끈하고 반사되게 하는 거칠기·금속성 지도(절반 해상도).
  // 무늬마다 최대 층수로 한 장만 그려 두고, 동마다 아래에서부터 필요한 층수만큼만 잘라 쓴다.
  function facade(pattern: Bay[]) {
    const key = pattern.map((q) => q.t + q.w).join();
    const cached = cache.get(key);
    if (cached) return cached;
    const W = pattern.reduce((sum, q) => sum + q.w, 0);
    const w = Math.round(W * PX);
    const h = Math.round(NMAX * FH * PX);
    const col = canvasOf(w, h);
    const orm = canvasOf(Math.ceil(w / 2), Math.ceil(h / 2));
    const c = context2d(col);
    const o = context2d(orm);
    o.scale(0.5, 0.5);
    c.fillStyle = "#eceae4";
    c.fillRect(0, 0, w, h);
    o.fillStyle = "rgb(0,225,0)";
    o.fillRect(0, 0, w, h);
    const m = (v: number) => v * PX;
    const wall = (u0: number, u1: number, color: string) => {
      c.fillStyle = color;
      c.fillRect(m(u0), 0, m(u1 - u0), h);
    };
    const glass = (
      u0: number,
      u1: number,
      k: number,
      z0: number,
      z1: number,
      rail: boolean,
      mull = rail ? 3 : 1,
    ) => {
      const x = m(u0),
        y = h - m(k * FH + z1),
        ww = m(u1 - u0),
        hh = m(z1 - z0);
      const tone = 26 + rnd() * 16;
      const g = c.createLinearGradient(0, y, 0, y + hh);
      g.addColorStop(0, `hsl(207 22% ${tone + 12}%)`);
      g.addColorStop(1, `hsl(207 20% ${tone}%)`);
      c.fillStyle = g;
      c.fillRect(x, y, ww, hh);
      if (rnd() < 0.28) {
        // 커튼
        c.fillStyle = "rgba(226,221,210,0.85)";
        const cw = ww * (0.3 + rnd() * 0.3);
        c.fillRect(rnd() < 0.5 ? x : x + ww - cw, y, cw, hh);
      }
      if (rail) {
        c.fillStyle = "rgba(205,222,232,0.35)";
        c.fillRect(x, y + hh - m(1.05), ww, m(1.05));
        c.fillStyle = "#f4f3ef";
        c.fillRect(x, y + hh - m(1.1), ww, 1.5);
      }
      c.strokeStyle = "#f7f6f2";
      c.lineWidth = 1.5;
      c.strokeRect(x, y, ww, hh);
      c.beginPath();
      for (let i = 1; i <= mull; i++) {
        c.moveTo(x + (ww * i) / (mull + 1), y);
        c.lineTo(x + (ww * i) / (mull + 1), y + hh);
      }
      c.stroke();
      o.fillStyle = "rgb(0,30,165)";
      o.fillRect(x, y, ww, hh);
    };
    let u = 0;
    for (const { t, w: bw } of pattern) {
      if (t === "A" || t === "G") wall(u, u + bw, "#54585b");
      if (t === "W") wall(u, u + bw, "#a88c66");
      for (let k = 0; k < NMAX; k++) {
        if (t === "B") glass(u + 0.25, u + bw - 0.25, k, 0.95, 2.4, false);
        if (t === "M") glass(u + 0.1, u + bw - 0.1, k, 0.7, 2.5, false, 2);
        if (t === "L" || t === "E")
          glass(u + 0.12, u + bw - 0.12, k, 0.25, 2.65, true);
        if (t === "K") glass(u + 0.15, u + bw - 0.15, k, 1.25, 2.25, false, 0);
        if (t === "G") glass(u + 0.5, u + bw - 0.5, k, 0.12, 2.88, false);
        if (t === "V") {
          const x = m(u + 0.04),
            y = h - m(k * FH + 2.55),
            ww = m(bw - 0.08),
            hh = m(2.2);
          c.fillStyle = "#8f8c85";
          c.fillRect(x, y, ww, hh);
          c.fillStyle = "#c2bfb7";
          for (let i = 0; i < hh; i += 4) c.fillRect(x, y + i, ww, 2);
        }
      }
      u += bw;
    }
    // 층 슬래브 그림자
    c.fillStyle = "rgba(60,60,55,0.13)";
    for (let k = 1; k < NMAX; k++) c.fillRect(0, h - m(k * FH) - 1, w, 2);
    const map = new THREE.CanvasTexture(col);
    map.anisotropy = 4;
    map.colorSpace = THREE.SRGBColorSpace;
    const ormMap = new THREE.CanvasTexture(orm);
    ormMap.anisotropy = 4;
    const out = { map, orm: ormMap };
    cache.set(key, out);
    return out;
  }

  // 배치도: 곡선 산책로, 중앙 연못과 잔디 마당, 놀이터, 운동 코트, 중앙 광장 포장
  function siteTexture() {
    const S = 6;
    const cv = canvasOf(SW * S, SD * S);
    const c = context2d(cv);
    const X = (x: number) => (x + SW / 2) * S;
    const Z = (z: number) => (z + SD / 2) * S;
    c.fillStyle = "#e6e3db";
    c.fillRect(0, 0, cv.width, cv.height);
    c.strokeStyle = "rgba(120,115,105,0.1)";
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < cv.width; i += S * 2.5) {
      c.moveTo(i, 0);
      c.lineTo(i, cv.height);
    }
    for (let i = 0; i < cv.height; i += S * 2.5) {
      c.moveTo(0, i);
      c.lineTo(cv.width, i);
    }
    c.stroke();
    const blob = (parts: number[][], fill: string) => {
      c.beginPath();
      for (const [x, z, rx, rz, r = 0] of parts) {
        c.moveTo(X(x) + rx * S, Z(z));
        c.ellipse(X(x), Z(z), rx * S, rz * S, r, 0, 7);
      }
      c.fillStyle = fill;
      c.fill();
    };
    // 잔디
    [
      [
        [0, 14, 34, 17],
        [22, 6, 20, 13, 0.4],
        [-24, 22, 18, 12, -0.3],
      ],
      [[-70, 12, 18, 9, 0.2]],
      [[70, 22, 16, 9, -0.2]],
      [[-40, -38, 26, 7]],
      [[30, -34, 22, 8, 0.15]],
      [[-30, 60, 16, 8]],
      [[86, -50, 12, 16]],
      [[-92, -40, 9, 22]],
      [[40, 68, 14, 7]],
    ].forEach((g) => blob(g, "#a9b98f"));
    // 연못과 데크
    blob(
      [
        [4, 12, 15, 7.5, 0.25],
        [15, 16, 9, 6, -0.4],
      ],
      "#f3f0ea",
    );
    blob(
      [
        [4, 12, 13.6, 6.3, 0.25],
        [15, 16, 7.8, 4.9, -0.4],
      ],
      "#93bccd",
    );
    c.fillStyle = "#b99a72";
    c.save();
    c.translate(X(-8), Z(17));
    c.rotate(-0.5);
    c.fillRect(-S * 5, -S * 1.6, S * 10, S * 3.2);
    c.restore();
    // 곡선 산책로
    c.strokeStyle = "#f5f2ec";
    c.lineWidth = S * 2.6;
    c.lineCap = "round";
    c.lineJoin = "round";
    const path = (pts: number[][]) => {
      c.beginPath();
      c.moveTo(X(pts[0][0]), Z(pts[0][1]));
      for (let i = 1; i < pts.length; i += 3)
        c.bezierCurveTo(
          X(pts[i][0]),
          Z(pts[i][1]),
          X(pts[i + 1][0]),
          Z(pts[i + 1][1]),
          X(pts[i + 2][0]),
          Z(pts[i + 2][1]),
        );
      c.stroke();
    };
    path([
      [40, 85],
      [38, 60],
      [52, 44],
      [34, 30],
      [20, 20],
      [30, 2],
      [8, -6],
      [-12, -12],
      [-40, -2],
      [-44, 20],
      [-48, 40],
      [-20, 44],
      [-4, 34],
    ]);
    path([
      [-110, 30],
      [-80, 34],
      [-66, 26],
      [-44, 20],
    ]);
    path([
      [8, -6],
      [10, -24],
      [30, -22],
      [36, -46],
    ]);
    path([
      [34, 30],
      [60, 34],
      [84, 20],
      [110, 22],
    ]);
    path([
      [-100, -70],
      [-60, -52],
      [20, -56],
      [100, -72],
    ]);
    path([
      [-4, 34],
      [-6, 48],
      [-22, 52],
      [-24, 66],
    ]);
    c.lineWidth = S * 1.4;
    path([
      [-96, -66],
      [-104, -20],
      [-100, 40],
      [-96, 74],
    ]);
    path([
      [98, -70],
      [104, -30],
      [102, 30],
      [96, 72],
    ]);
    // 중앙 광장: 동심원 포장
    for (let r = 9; r > 0; r -= 1.5) {
      c.beginPath();
      c.arc(X(34), Z(30), r * S, 0, 7);
      c.fillStyle = (r / 1.5) % 2 < 1 ? "#d9d3c7" : "#efebe3";
      c.fill();
    }
    // 놀이터(탄성 포장)와 운동 코트
    blob([[-44, 36, 9, 7]], "#d39b7b");
    blob([[-41, 34, 4.2, 3.4]], "#e3bf6a");
    blob([[-78, 14, 5, 4]], "#d39b7b");
    c.save();
    c.translate(X(74), Z(22));
    c.rotate(0.17);
    c.fillStyle = "#6f9a78";
    c.fillRect(-S * 15, -S * 8, S * 30, S * 16);
    c.fillStyle = "#5d86a8";
    c.fillRect(-S * 12, -S * 5.5, S * 24, S * 11);
    c.strokeStyle = "#f4f3ef";
    c.lineWidth = 1.6;
    c.strokeRect(-S * 12, -S * 5.5, S * 24, S * 11);
    c.beginPath();
    c.moveTo(0, -S * 5.5);
    c.lineTo(0, S * 5.5);
    c.moveTo(-S * 6.4, -S * 4);
    c.lineTo(-S * 6.4, S * 4);
    c.moveTo(S * 6.4, -S * 4);
    c.lineTo(S * 6.4, S * 4);
    c.moveTo(-S * 6.4, 0);
    c.lineTo(S * 6.4, 0);
    c.stroke();
    c.restore();
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  function roadTexture(len: number) {
    const S = 6;
    const cv = canvasOf(len * S, 16 * S);
    const c = context2d(cv);
    c.fillStyle = "#6f7173";
    c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = "#e9e7e0";
    for (let x = 0; x < cv.width; x += S * 9)
      c.fillRect(x, 8 * S - 1.5, S * 4.5, 3);
    c.fillRect(0, 2, cv.width, 2.5);
    c.fillRect(0, cv.height - 4.5, cv.width, 2.5);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  // 따로 움직이거나 나중에 손대야 하는 부품만 메시 하나로 둔다.
  const solo = (
    geo: THREE.BufferGeometry,
    m: THREE.Material | THREE.Material[],
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D,
  ) => {
    const me = new THREE.Mesh(geo, m);
    me.position.set(x, y, z);
    me.castShadow = me.receiveShadow = true;
    parent.add(me);
    return me;
  };
  // 나머지는 add()로 (부모, 재질)별로 모아 두었다가 flush()에서 한 덩어리로 합친다.
  // 색만 다른 부품은 C(색)로 넘기면 꼭짓점 색으로 칠해 재질 하나(paintM)를 함께 쓴다.
  const part = (geo: THREE.BufferGeometry, start: number, count: number) => {
    const out = new THREE.BufferGeometry();
    const index = geo.index;
    if (!index) throw new Error("indexed geometry expected");
    for (const name of ["position", "normal", "uv"]) {
      const src = geo.getAttribute(name);
      const size = src.itemSize;
      const arr = new Float32Array(count * size);
      for (let i = 0; i < count; i++)
        for (let k = 0; k < size; k++)
          arr[i * size + k] = src.array[index.array[start + i] * size + k];
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    return out;
  };
  const add = (
    geo: THREE.BufferGeometry,
    m: Surface | Surface[],
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D,
  ) => {
    const put = (g: THREE.BufferGeometry, q: Surface) => {
      const material = isMaterial(q) ? q : q.mat || paintM;
      g.translate(x, y, z);
      if (material.vertexColors) {
        const c = isMaterial(q) ? WHITE : q.color;
        const count = g.getAttribute("position").count;
        const arr = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          arr[i * 3] = c.r;
          arr[i * 3 + 1] = c.g;
          arr[i * 3 + 2] = c.b;
        }
        g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
      }
      let byMat = pending.get(parent);
      if (!byMat) pending.set(parent, (byMat = new Map()));
      let list = byMat.get(material);
      if (!list) byMat.set(material, (list = []));
      list.push(g);
    };
    const count = geo.index?.count ?? 0;
    if (!Array.isArray(m)) return put(part(geo, 0, count), m);
    // 면마다 재질이 다른 상자는 면별로 나눠 담는다. 바닥면은 보이지 않으므로 뺀다.
    for (const gr of geo.groups)
      if (gr.materialIndex !== undefined && gr.materialIndex !== 3)
        put(part(geo, gr.start, gr.count), m[gr.materialIndex]);
  };
  function flush() {
    const world = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const make = (
      parent: THREE.Object3D,
      material: THREE.Material,
      list: THREE.BufferGeometry[],
    ) => {
      const merged = mergeGeometries(list);
      list.forEach((g) => g.dispose());
      if (!merged) return;
      const me = new THREE.Mesh(merged, material);
      me.castShadow = me.receiveShadow = true;
      parent.add(me);
    };
    pending.forEach((byMat, parent) =>
      byMat.forEach((list, material) => {
        // 움직이지 않는 부모에 달린, 잘리지 않는 부품은 장면 좌표로 옮겨 단지 전체를 하나로 합친다.
        const bake =
          parent !== scene &&
          !parent.userData.live &&
          parent.parent === scene &&
          !material.clippingPlanes?.length;
        if (!bake && parent !== scene) return make(parent, material, list);
        if (bake) {
          parent.updateMatrix();
          list.forEach((g) => g.applyMatrix4(parent.matrix));
        }
        world.set(material, (world.get(material) || []).concat(list));
      }),
    );
    world.forEach((list, material) => make(scene, material, list));
    pending = new Map();
  }
  const liveGroup = () => {
    const g = new THREE.Group();
    g.userData.live = true;
    return g;
  };
  // 어떤 점이 건물 자리(여유 pad 포함) 안인지: 돌려 놓은 건물도 제 좌표로 바꿔서 본다.
  const inPad = (x: number, z: number, pad: number) =>
    pads.some((q) => {
      const dx = x - q.x,
        dz = z - q.z,
        cs = Math.cos(q.rot),
        sn = Math.sin(q.rot);
      return (
        Math.abs(dx * cs - dz * sn) < q.hw + pad &&
        Math.abs(dx * sn + dz * cs) < q.hd + pad
      );
    });

  // 울퉁불퉁한 덩어리: 꼭짓점을 법선 방향으로 흔들고, 아래쪽을 어둡게 칠해 잎 덩어리처럼 보이게 한다.
  function lumpy(source: THREE.BufferGeometry, amp: number) {
    source.deleteAttribute("uv");
    source.deleteAttribute("normal");
    const geo = mergeVertices(source);
    const pos = geo.getAttribute("position");
    const colors: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i);
      const nz =
        Math.sin(x * 5.1 + z * 3.7) * Math.cos(y * 4.3 + x * 2.9) +
        Math.sin(z * 7.3 + y * 6.1) * 0.5;
      const k = 1 + nz * amp;
      pos.setXYZ(i, x * k, y * k, z * k);
      const shade = 0.66 + 0.4 * clamp((y * k + 1) / 2);
      colors.push(shade, shade, shade);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }

  function plant(group: THREE.Group) {
    type Item = [THREE.Matrix4, THREE.Color];
    const blobs: Item[] = [],
      cones: Item[] = [],
      trunks: Item[] = [];
    const d = new THREE.Object3D(),
      tint = new THREE.Color();
    const push = (
      list: Item[],
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      color: THREE.Color,
      ry = rnd() * 6,
      rz = 0,
    ) => {
      d.position.set(x, y, z);
      d.scale.set(sx, sy, sz);
      d.rotation.set(0, ry, rz);
      d.updateMatrix();
      list.push([d.matrix.clone(), color.clone()]);
    };
    const bark = new THREE.Color("#6f5f4e"),
      pineBark = new THREE.Color("#8a5f47");
    const free = (x: number, z: number) =>
      !inPad(x, z, 2.5) && Math.abs(x) < SW / 2 - 1 && Math.abs(z) < SD / 2 - 1;
    // 활엽수: 굵은 줄기 위에 잎 덩어리 여러 개가 겹친다.
    const broadleaf = (
      x: number,
      z: number,
      s: number,
      hue = 0.25 + rnd() * 0.06,
      sat = 0.24 + rnd() * 0.12,
      lum = 0.36 + rnd() * 0.1,
    ) => {
      if (!free(x, z)) return;
      const th = 3 + rnd() * 1.6;
      push(
        trunks,
        x,
        th * s * 0.5,
        z,
        0.3 * s,
        th * s,
        0.3 * s,
        bark,
        0,
        (rnd() - 0.5) * 0.12,
      );
      for (let i = 0; i < 6; i++) {
        const a = rnd() * 6.283,
          r = i ? (1 + rnd() * 0.9) * s : 0,
          y = th * s + (i ? 0.6 + rnd() * 2.2 : 2.2) * s;
        const size = (i ? 1.3 + rnd() * 0.8 : 2.1) * s;
        push(
          blobs,
          x + Math.cos(a) * r,
          y,
          z + Math.sin(a) * r,
          size,
          size * (0.8 + rnd() * 0.25),
          size,
          tint.setHSL(
            hue + (rnd() - 0.5) * 0.02,
            sat,
            lum + (rnd() - 0.5) * 0.07,
          ),
        );
      }
    };
    // 침엽수(메타세쿼이아): 층층이 좁아지는 원뿔
    const conifer = (x: number, z: number, s: number) => {
      if (!free(x, z)) return;
      const hue = 0.3 + rnd() * 0.04,
        lum = 0.27 + rnd() * 0.07;
      push(trunks, x, 1.5 * s, z, 0.24 * s, 3 * s, 0.24 * s, bark, 0, 0);
      for (let i = 0; i < 5; i++)
        push(
          cones,
          x,
          (2 + i * 1.9 + 1.6) * s,
          z,
          (2.3 - i * 0.4) * s,
          3.4 * s,
          (2.3 - i * 0.4) * s,
          tint.setHSL(hue, 0.3, lum + i * 0.015),
        );
    };
    // 소나무: 휘어 올라간 붉은 줄기 끝에 납작한 잎 뭉치
    const pine = (x: number, z: number, s: number) => {
      if (!free(x, z)) return;
      const lean = (rnd() - 0.5) * 0.36,
        th = 7.5 * s;
      push(
        trunks,
        x + Math.sin(lean) * th * 0.5,
        th * 0.5,
        z,
        0.26 * s,
        th,
        0.26 * s,
        pineBark,
        0,
        -lean,
      );
      const tx = x + Math.sin(lean) * th;
      for (let i = 0; i < 4; i++) {
        const a = rnd() * 6.283,
          r = i ? 1.5 * s : 0;
        push(
          blobs,
          tx + Math.cos(a) * r,
          th + (i ? rnd() * 1.2 - 0.3 : 0.9) * s,
          z + Math.sin(a) * r,
          2 * s,
          0.85 * s,
          2 * s,
          tint.setHSL(0.31, 0.32, 0.22 + rnd() * 0.05),
        );
      }
    };
    const shrub = (x: number, z: number, s: number) =>
      push(
        blobs,
        x,
        0.55 * s,
        z,
        1.1 * s,
        0.75 * s,
        1.1 * s,
        tint.setHSL(0.24 + rnd() * 0.07, 0.3, 0.3 + rnd() * 0.1),
      );

    // 둘레 산책로: 북쪽과 서쪽은 메타세쿼이아 길, 도로 쪽은 활엽 가로수
    for (let x = -106; x <= 106; x += 6) {
      conifer(x + rnd(), -81 + rnd() * 2, 0.95 + rnd() * 0.35);
      if (Math.abs(x - 40) > 16)
        broadleaf(x + rnd(), 81 + rnd(), 0.85 + rnd() * 0.3);
    }
    for (let z = -76; z <= 76; z += 6) {
      conifer(-106 + rnd() * 2, z + rnd(), 0.9 + rnd() * 0.35);
      broadleaf(106 + rnd(), z + rnd(), 0.85 + rnd() * 0.3);
    }
    // 연못과 잔디 마당 둘레, 산책로 따라 심은 정원수(가끔 단풍)
    for (let i = 0; i < 150; i++) {
      const x = -100 + rnd() * 200,
        z = -74 + rnd() * 150;
      // 연못과 그 앞 잔디, 광장, 운동 코트, 놀이터는 비워 둔다.
      if (Math.hypot((x - 6) / 22, (z - 13) / 11) < 1) continue;
      if (
        Math.hypot(x - 34, z - 30) < 11 ||
        (Math.abs(x - 74) < 17 && Math.abs(z - 22) < 10) ||
        Math.hypot(x + 44, z - 36) < 9
      )
        continue;
      const k = rnd();
      if (k < 0.12) broadleaf(x, z, 0.8, 0.04 + rnd() * 0.05, 0.5, 0.45);
      else if (k < 0.3) conifer(x, z, 0.75 + rnd() * 0.3);
      else broadleaf(x, z, 0.75 + rnd() * 0.4);
    }
    // 정문과 광장, 연못가의 소나무
    for (const [x, z] of [
      [22, 80],
      [25, 74],
      [58, 80],
      [55, 74],
      [24, 34],
      [44, 36],
      [38, 20],
      [-10, 22],
      [-6, 4],
      [24, 12],
      [-58, -30],
      [48, -28],
    ])
      pine(x, z, 0.95 + rnd() * 0.35);
    // 관목: 건물 기단부와 연못가
    for (let i = 0; i < 900; i++) {
      const x = -106 + rnd() * 212,
        z = -82 + rnd() * 164;
      if (inPad(x, z, 2.5) && !inPad(x, z, 0.4)) shrub(x, z, 0.8 + rnd() * 0.6);
    }
    for (let i = 0; i < 46; i++) {
      const a = rnd() * 6.283;
      shrub(6 + Math.cos(a) * 20, 13 + Math.sin(a) * 10.5, 0.8 + rnd() * 0.5);
    }

    const inst = (
      geo: THREE.BufferGeometry,
      material: THREE.Material,
      list: Item[],
      shadow = true,
    ) => {
      const mesh = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach(([mx, color], i) => {
        mesh.setMatrixAt(i, mx);
        mesh.setColorAt(i, color);
      });
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    };
    const leaf = new THREE.MeshLambertMaterial({ vertexColors: true });
    inst(lumpy(new THREE.IcosahedronGeometry(1, 1), 0.16), leaf, blobs);
    inst(lumpy(new THREE.ConeGeometry(1, 1, 8, 2), 0.1), leaf, cones);
    inst(
      new THREE.CylinderGeometry(0.55, 1, 1, 5),
      new THREE.MeshLambertMaterial(),
      trunks,
      false,
    );
  }

  function build() {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environmentIntensity = 0.55;
    scene.add(new THREE.HemisphereLight("#ffffff", "#d9d5cc", 1.1));
    sun = new THREE.DirectionalLight("#fff3e2", 3.1);
    sun.position.set(-190, 420, 180);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -250,
      right: 250,
      top: 250,
      bottom: -250,
      near: 10,
      far: 1100,
    });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.8;
    sun.shadow.radius = 2.5;
    scene.add(sun);

    // 바탕에는 그림자만 받는 바닥을 깔아 모형 받침처럼 보이게 한다.
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(800, 64),
      new THREE.ShadowMaterial({ opacity: 0.15 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.3;
    floor.receiveShadow = true;
    scene.add(floor);
    const edge = C("#d9d5cc"),
      edgeM = mat("#d9d5cc"),
      capM = mat("#e9e6df");
    add(
      box(SW, 1.2, SD),
      [
        edge,
        edge,
        new THREE.MeshStandardMaterial({ map: siteTexture(), roughness: 0.95 }),
        edge,
        edge,
        edge,
      ],
      0,
      -0.6,
      0,
      scene,
    );

    const concrete = C("#e9e6df"),
      dark = C("#4d5154"),
      wood = C("#a88c66"),
      stone = C("#8f8a80");
    const white = C("#f4f3ef"),
      mech = C("#c9c6be"),
      rail = C("#5d7483");
    const glassM = new THREE.MeshStandardMaterial({
      color: "#5d7483",
      roughness: 0.08,
      metalness: 0.75,
    });

    // 날개 하나: 본체 + 돌출 발코니 베이 + 층 슬래브 + 세로 핀 + 코어 + 필로티 + 옥상
    function wing(v: WingSpec) {
      const { w, d, n } = v,
        H = n * FH,
        bd = 1.5;
      const g = new THREE.Group();
      g.position.set(v.x, 0, v.z);
      g.rotation.y = v.rot;
      scene.add(g);
      pads.push({ x: v.x, z: v.z, rot: v.rot, hw: w / 2, hd: d / 2 + bd + 1 });
      const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), PIL);
      const clip = <M extends THREE.Material>(m: M) => {
        const c = m.clone();
        c.clippingPlanes = [plane];
        c.clipShadows = true;
        return c;
      };
      // 같은 그림을 함께 쓰되, 이 날개의 층수만큼만 아래에서부터 잘라 쓴다.
      const crop = (tex: THREE.Texture, floors: number) => {
        const t = tex.clone();
        t.repeat.set(1, floors / NMAX);
        t.needsUpdate = true;
        return t;
      };
      const skin = (pattern: Bay[], floors = n) => {
        const f = facade(pattern),
          orm = crop(f.orm, floors);
        return clip(
          new THREE.MeshStandardMaterial({
            map: crop(f.map, floors),
            roughnessMap: orm,
            metalnessMap: orm,
            roughness: 1,
            metalness: 1,
          }),
        );
      };
      // 색만 다른 면(지붕·옆벽·핀)은 이 날개의 잘리는 재질 하나로 그린다.
      const paint = clip(paintM);
      const lid = C("#e9e6df", paint),
        plain = C("#e2dfd8", paint),
        fin = C("#4d5154", paint);
      const slabM = clip(mat("#f4f3ef"));
      add(
        box(w, H, d),
        [
          skin(v.endP),
          v.endN === PAT.blank ? plain : skin(v.endN),
          lid,
          lid,
          skin(v.front),
          skin(v.back),
        ],
        0,
        PIL + H / 2,
        0,
        g,
      );
      // 거실: 한 층 낮게 끝나는 돌출 발코니와 층마다 내민 슬래브.
      // 베이는 본체보다 한 층 낮으므로 그림도 n-1층으로 잘라야 창과 슬래브가 층마다 맞는다.
      const bay = skin(PAT.bay, n - 1);
      const spots: [number, number][] = [
        ...v.bays.map((x): [number, number] => [x, 1]),
        ...(v.backBays || []).map((x): [number, number] => [x, -1]),
      ];
      const slabs = new THREE.InstancedMesh(
        box(4.9, 0.26, bd + 0.55),
        slabM,
        spots.length * n,
      );
      const o = new THREE.Object3D();
      spots.forEach(([x, sgn], i) => {
        add(
          box(4.4, H - FH, bd),
          sgn > 0
            ? [plain, plain, lid, lid, bay, plain]
            : [plain, plain, lid, lid, plain, bay],
          x,
          PIL + (H - FH) / 2,
          sgn * (d / 2 + bd / 2),
          g,
        );
        for (let k = 0; k < n; k++) {
          o.position.set(x, PIL + k * FH + 0.05, sgn * (d / 2 + bd / 2 + 0.1));
          o.updateMatrix();
          slabs.setMatrixAt(i * n + k, o.matrix);
        }
      });
      slabs.receiveShadow = true;
      g.add(slabs);
      for (const x of v.fins)
        add(box(0.45, H, 1.1), fin, x, PIL + H / 2, d / 2 + 0.5, g);
      // 뒷면으로 튀어나온 계단·승강기 코어
      const cores = v.cores || [];
      if (cores.length) {
        const coreSkin = skin(PAT.core);
        for (const cx of cores)
          add(
            box(5.6, H, 2.8),
            [fin, fin, lid, lid, plain, coreSkin],
            cx,
            PIL + H / 2,
            -d / 2 - 1.4,
            g,
          );
      }
      // 필로티: 기둥, 유리 로비, 캐노피
      const nc = Math.round(w / 5.4);
      for (let i = 0; i <= nc; i++)
        for (const z of [-d / 2 + 0.6, d / 2 - 0.6])
          add(
            box(0.9, PIL, 0.9),
            stone,
            -w / 2 + 0.6 + (i * (w - 1.2)) / nc,
            PIL / 2,
            z,
            g,
          );
      add(
        box(Math.min(w * 0.3, 9), PIL - 0.5, d * 0.6),
        glassM,
        0,
        (PIL - 0.5) / 2,
        0,
        g,
      );
      add(box(w + 0.6, 0.5, d + 0.8), dark, 0, PIL - 0.25, 0, g);
      if (v.canopy !== false)
        add(box(7, 0.35, 4.5), wood, 0, 3.6, d / 2 + 2, g);
      // 공사 중 꼭대기 슬래브(완공되면 지붕이 된다)
      const cap = solo(box(w + 0.5, 0.5, d + 0.5), capM, 0, PIL, 0, g);
      // 완공 때 붙는 옥상: 파라펫, 승강기 기계실, 설비, 테라스 난간, 프레임 구조물
      const roof = liveGroup();
      roof.position.y = PIL + H;
      roof.scale.setScalar(0.001);
      g.add(roof);
      for (const [w2, d2, x, z] of [
        [w + 0.5, 0.5, 0, d / 2],
        [w + 0.5, 0.5, 0, -d / 2],
        [0.5, d + 0.5, w / 2, 0],
        [0.5, d + 0.5, -w / 2, 0],
      ])
        add(box(w2, 1.3, d2), dark, x, 0.9, z, roof);
      for (const cx of cores) {
        add(box(6, 4.6, 6), concrete, cx, 2.5, -d / 2 + 1.4, roof);
        add(box(6.4, 0.4, 6.4), dark, cx, 5, -d / 2 + 1.4, roof);
      }
      for (let x = -w / 2 + 3; x < w / 2 - 2; x += 5.5)
        add(box(1.6, 1.1, 1.6), mech, x, 0.9, 1.5, roof);
      for (const [x, sgn] of spots)
        add(
          box(4.4, 1.1, 0.12),
          rail,
          x,
          -FH + 0.6,
          sgn * (d / 2 + bd - 0.1),
          roof,
        );
      if (v.crown) {
        for (const x of [-w / 2 + 0.6, w / 2 - 0.6])
          for (const z of [-d / 2 + 0.6, d / 2 - 0.6])
            add(box(0.7, 9, 0.7), dark, x, 4.8, z, roof);
        for (const z of [-d / 2 + 0.6, 0, d / 2 - 0.6])
          add(box(w + 1.8, 0.8, 0.8), dark, 0, 9.4, z, roof);
        for (const x of [-w / 2 + 0.6, w / 2 - 0.6])
          add(box(0.8, 0.8, d + 1.8), dark, x, 9.4, 0, roof);
        for (let i = 1; i < 9; i++)
          add(box(0.3, 0.5, d), wood, -w / 2 + (w * i) / 9, 9.6, 0, roof);
      }
      const unit: Unit = {
        start: v.start,
        n,
        H,
        plane,
        cap,
        roof,
        crane: null,
        done: null,
      };
      if (v.crane) {
        const group = liveGroup();
        const cs = Math.cos(v.rot),
          sn = Math.sin(v.rot),
          lx = -w / 2 - 3,
          lz = d / 2 + 4;
        group.position.set(v.x + lx * cs + lz * sn, 0, v.z - lx * sn + lz * cs);
        scene.add(group);
        const yellow = mat("#e3b23c", 0.55, 0.3);
        const mast = solo(box(1.7, 1, 1.7), yellow, 0, 0.5, 0, group);
        const top = liveGroup();
        group.add(top);
        add(box(44, 1, 1), yellow, 14, 0, 0, top);
        add(box(6, 2.4, 2.2), stone, -10, -0.4, 0, top);
        add(box(2, 2.2, 2), white, 0.2, -1.7, 0, top);
        add(box(0.45, 6, 0.45), yellow, 0, 3, 0, top);
        add(box(0.14, 11, 0.14), dark, 22, -5.5, 0, top);
        unit.crane = { group, mast, top };
      }
      units.push(unit);
    }
    // 판상형: 2세대 1코어 모듈을 옆으로 잇는다.
    const slab = (
      x: number,
      z: number,
      rot: number,
      floors: number[],
      start: number,
      crown = -1,
    ) =>
      floors.forEach((n, i) => {
        const ox = (i - (floors.length - 1) / 2) * 27;
        wing({
          x: x + ox * Math.cos(rot),
          z: z - ox * Math.sin(rot),
          rot,
          w: 27,
          d: 11,
          n,
          start: start + i * 0.015,
          front: PAT.slabFront,
          back: PAT.slabBack,
          endP: PAT.gable,
          endN: PAT.gable,
          bays: [-5.2, 5.2],
          fins: [-13.28, 0, 13.28],
          cores: [0],
          crown: crown === i,
        });
      });
    // 탑상형: 코어에서 날개 셋이 뻗는 Y자형
    const towerY = (
      x: number,
      z: number,
      rot: number,
      n: number,
      start: number,
      crane = false,
    ) => {
      [30, 150, 270].forEach((deg, i) => {
        const a = (deg * Math.PI) / 180 + rot;
        wing({
          x: x + Math.cos(a) * 12.5,
          z: z + Math.sin(a) * 12.5,
          rot: -a,
          w: 16,
          d: 12.5,
          n: n - i * 2,
          start: start + i * 0.015,
          front: PAT.lobeSide,
          back: PAT.lobeSide.slice().reverse(),
          endP: PAT.lobeEnd,
          endN: PAT.blank,
          bays: [2.6],
          backBays: [2.6],
          fins: [7.78],
          canopy: false,
          crown: i === 0,
          crane: crane && i === 0,
        });
      });
      const H = (n + 1) * FH;
      const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), PIL);
      const m = mat("#4d5154", 0.6, 0.2);
      m.clippingPlanes = [plane];
      m.clipShadows = true;
      solo(
        new THREE.CylinderGeometry(7.6, 7.6, H, 6),
        m,
        x,
        PIL + H / 2,
        z,
        scene,
      ).rotation.y = rot;
      solo(
        new THREE.CylinderGeometry(7.2, 7.2, PIL, 6),
        glassM,
        x,
        PIL / 2,
        z,
        scene,
      ).rotation.y = rot;
      const roof = liveGroup();
      roof.position.set(x, PIL + H, z);
      roof.scale.setScalar(0.001);
      scene.add(roof);
      add(new THREE.CylinderGeometry(5, 5, 3.6, 6), concrete, 0, 1.8, 0, roof);
      add(new THREE.CylinderGeometry(5.6, 5.6, 0.4, 6), dark, 0, 3.8, 0, roof);
      const cap = solo(
        new THREE.CylinderGeometry(7.8, 7.8, 0.5, 6),
        capM,
        x,
        PIL,
        z,
        scene,
      );
      units.push({
        start,
        n: n + 1,
        H,
        plane,
        cap,
        roof,
        crane: null,
        done: null,
      });
      pads.push({ x, z, rot: 0, hw: 8, hd: 8 });
    };
    slab(-48, -62, 0.1, [29, 29, 25], 0.02, 0);
    towerY(58, -52, 0.15, 35, 0, true);
    slab(-66, -12, -0.14, [24, 21], 0.06);
    slab(68, -6, 0.17, [27, 23], 0.05, 0);
    towerY(-74, 46, -0.2, 28, 0.08);
    slab(72, 50, -0.08, [20, 17], 0.1);
    towerY(-8, -22, 0.5, 31, 0.03);

    // 정문 쪽 커뮤니티(유리 2층 + 목재 처마 + 옥상 정원)와 1층 상가, 문주, 지하주차장 진입로
    const comm = liveGroup();
    comm.position.set(-6, 0, 64);
    comm.rotation.y = 0.04;
    scene.add(comm);
    pads.push({ x: -6, z: 64, rot: 0.04, hw: 25, hd: 12 });
    add(box(40, 8.4, 17), glassM, 0, 4.2, 0, comm);
    for (let i = 0; i <= 10; i++)
      add(box(0.35, 8.4, 17.3), white, -20 + i * 4, 4.2, 0, comm);
    add(box(40.4, 0.4, 17.4), white, 0, 4.3, 0, comm);
    add(box(44, 0.7, 21), wood, 0, 8.75, 0, comm);
    add(box(43.6, 0.5, 20.6), concrete, 0, 9.3, 0, comm);
    add(box(16, 3.4, 9), white, -8, 11.2, -2, comm);
    add(box(17, 0.4, 10), dark, -8, 13.1, -2, comm);
    add(box(12, 0.3, 8), C("#a9b98f"), 10, 9.7, 0, comm);
    add(box(46, 4.6, 7), white, 0, 2.3, 12, comm);
    add(box(46.6, 0.5, 8), dark, 0, 4.85, 12, comm);
    for (let i = 0; i < 9; i++)
      add(box(4.2, 3.2, 0.2), glassM, -20.4 + i * 5.1, 1.9, 15.5, comm);
    extras.push({ o: comm, at: 0.2 });
    const gate = liveGroup();
    gate.position.set(40, 0, 83);
    scene.add(gate);
    add(box(2.6, 11, 3.2), stone, -12, 5.5, 0, gate);
    add(box(2.6, 11, 3.2), stone, 12, 5.5, 0, gate);
    add(box(30, 1.7, 3.8), dark, 0, 11.6, 0, gate);
    add(box(30, 0.4, 4), wood, 0, 10.55, 0, gate);
    add(box(4, 3, 4), white, -17, 1.5, -2, gate);
    add(box(4.8, 0.3, 4.8), dark, -17, 3.15, -2, gate);
    extras.push({ o: gate, at: 0.3 });
    for (const [x, z, r] of [
      [-88, 78, 0],
      [103, -22, Math.PI / 2],
    ]) {
      const ramp = liveGroup();
      ramp.position.set(x, 0, z);
      ramp.rotation.y = r;
      scene.add(ramp);
      pads.push({ x, z, rot: r, hw: 10, hd: 5 });
      add(box(18, 0.1, 7), C("#4a4c4e"), 0, 0.06, 0, ramp);
      solo(box(18.6, 0.25, 8), glassM, 0, 3.4, 0, ramp).rotation.z = -0.13;
      for (const sx of [-8.5, -3, 3, 8.5])
        for (const sz of [-3.7, 3.7])
          add(
            box(0.3, 3.4 + sx * -0.13, 0.3),
            dark,
            sx,
            (3.4 + sx * -0.13) / 2,
            sz,
            ramp,
          );
      extras.push({ o: ramp, at: 0.3 });
    }
    for (const e of extras) e.o.scale.set(1, 0.001, 1);

    // 단지 밖 도로와 차량
    const road = (len: number, x: number, z: number, r: number) => {
      const me = solo(
        box(len, 0.2, 16),
        [
          edgeM,
          edgeM,
          new THREE.MeshStandardMaterial({
            map: roadTexture(len),
            roughness: 0.9,
          }),
          edgeM,
          edgeM,
          edgeM,
        ],
        x,
        -1.1,
        z,
        scene,
      );
      me.rotation.y = r;
      me.castShadow = false;
    };
    road(SW + 44, 8, SD / 2 + 9, 0);
    road(SD + 20, SW / 2 + 9, -1, Math.PI / 2);
    const cars = new THREE.InstancedMesh(
      box(4.4, 1.2, 1.9),
      mat("#ffffff", 0.35, 0.5),
      22,
    );
    const cabins = new THREE.InstancedMesh(
      box(2.3, 0.9, 1.7),
      mat("#20262b", 0.2, 0.6),
      22,
    );
    const o = new THREE.Object3D(),
      tint = new THREE.Color();
    const paints = [
      "#f2f2f0",
      "#f2f2f0",
      "#2a2c2f",
      "#b9bcc0",
      "#8e9499",
      "#3d5a80",
      "#9b3b34",
    ];
    for (let i = 0; i < 22; i++) {
      const along = i < 13;
      const s = along
        ? -110 + i * 18 + rnd() * 8
        : -80 + (i - 13) * 19 + rnd() * 8;
      const lane = rnd() < 0.5 ? -3.6 : 3.6;
      o.position.set(
        along ? s : SW / 2 + 9 + lane,
        -0.4,
        along ? SD / 2 + 9 + lane : s,
      );
      o.rotation.y = along ? 0 : Math.PI / 2;
      o.updateMatrix();
      cars.setMatrixAt(i, o.matrix);
      cars.setColorAt(i, tint.set(paints[Math.floor(rnd() * paints.length)]));
      o.position.y = 0.6;
      o.updateMatrix();
      cabins.setMatrixAt(i, o.matrix);
    }
    scene.add(cars, cabins);

    const garden = liveGroup();
    garden.scale.set(1, 0.001, 1);
    scene.add(garden);
    plant(garden);
    extras.push({ o: garden, at: 0.02 });
    flush();
  }

  // clock은 장면 안의 시간(ms)이다. 창이 숨겨지거나 멈추면 흐르지 않고, hurry()를 부르면 빨리 흐른다.
  const state = {
    clock: 0,
    speed: 1,
    playing: false,
    last: 0,
    raf: 0,
    frame: 0,
    settle: 2,
  };
  let disposed = false;
  let completed = false;

  function render() {
    const t = state.clock;
    const p = clamp(t / GROW_MS);
    let building = p < 1;
    for (const u of units) {
      const g = clamp((p - u.start) / (0.5 + 0.38 * (u.n / 35) - u.start));
      const h = PIL + u.H * g;
      u.plane.constant = h + 0.01;
      u.cap.position.y = h + 0.25;
      if (g >= 1 && u.done === null) u.done = t;
      const fin = u.done === null ? 0 : easeOut(clamp((t - u.done) / 520));
      if (fin < 1) building = true;
      u.roof.scale.setScalar(Math.max(fin, 0.001));
      if (u.crane) {
        const ch = h + 13;
        u.crane.mast.scale.y = ch;
        u.crane.mast.position.y = ch / 2;
        u.crane.top.position.y = ch;
        u.crane.top.rotation.y = t * 0.00035 + 0.8;
        u.crane.group.scale.setScalar(Math.max(1 - fin, 0.001));
      }
    }
    for (const e of extras)
      e.o.scale.y = Math.max(easeOut(clamp((p - e.at) / 0.22)), 0.001);
    // 그림자는 장면이 바뀌는 동안에만, 그것도 세 프레임에 한 번만 다시 그린다. 완공 뒤에는 멈춘다.
    if (building) state.settle = 2;
    renderer.shadowMap.needsUpdate = building
      ? state.frame++ % 3 === 0
      : state.settle-- > 0;
    // 카메라는 단지 주위를 천천히 돈다.
    const az = 0.2 + 0.2 * (1 - Math.exp(-t / 2600)) + t * 0.00002;
    const dist = 590 - 40 * (1 - Math.exp(-t / 3000));
    camera.position.set(Math.sin(az) * dist, 250, Math.cos(az) * dist);
    camera.lookAt(0, 34, 0);
    renderer.render(scene, camera);
    return !building;
  }
  function resize() {
    const width = host.clientWidth,
      height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // 좁은 창에서도 단지가 잘리지 않게 시야를 넓힌다.
    camera.fov = camera.aspect < 1.25 ? 32 * (1.25 / camera.aspect) : 32;
    camera.updateProjectionMatrix();
  }
  function tick(now: number) {
    state.raf = 0;
    if (disposed) return;
    if (state.playing && !document.hidden)
      state.clock += Math.max(0, Math.min(now - state.last, 100)) * state.speed;
    state.last = now;
    const built = render();
    if (built && !completed) {
      // 완공되면 더 그릴 것이 없다. 로고로 넘어가는 일은 호출한 쪽이 맡는다.
      completed = true;
      state.playing = false;
      wordmark.style.opacity = "1";
      events.onComplete();
    }
    if (state.playing && !document.hidden)
      state.raf = requestAnimationFrame(tick);
  }
  function requestRender() {
    if (!state.raf && !disposed && !document.hidden) {
      state.last = performance.now();
      state.raf = requestAnimationFrame(tick);
    }
  }
  function visibilityChanged() {
    if (document.hidden) {
      cancelAnimationFrame(state.raf);
      state.raf = 0;
    } else requestRender();
  }
  function pause() {
    state.playing = false;
    cancelAnimationFrame(state.raf);
    state.raf = 0;
  }
  function contextLost(event: Event) {
    event.preventDefault();
    pause();
    events.onError();
  }

  try {
    build();
  } catch (error) {
    renderer.dispose();
    throw error;
  }
  host.prepend(renderer.domElement);
  const observer = new ResizeObserver(() => {
    resize();
    requestRender();
  });
  observer.observe(host);
  document.addEventListener("visibilitychange", visibilityChanged);
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  resize();
  render();
  // 셰이더를 백그라운드에서 준비시켜 첫 프레임에서 화면이 멈추지 않게 한다.
  // 그동안은 호출한 쪽이 정적인 로고를 보여 준다.
  let wantsPlay = true;
  let ready = false;
  void renderer
    .compileAsync(scene, camera)
    .then(() => {
      if (disposed) return;
      ready = true;
      events.onReady();
      if (wantsPlay && !completed) {
        state.playing = true;
        requestRender();
      }
    })
    .catch(() => {
      if (!disposed) events.onError();
    });

  return {
    pause() {
      wantsPlay = false;
      pause();
    },
    resume() {
      wantsPlay = true;
      if (disposed || completed || !ready) return;
      state.playing = true;
      requestRender();
    },
    hurry() {
      state.speed = 3.5;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pause();
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibilityChanged);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        if (mesh.material)
          (Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]
          ).forEach((m) => materials.add(m));
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => {
        const standard = m as THREE.MeshStandardMaterial;
        standard.map?.dispose();
        standard.roughnessMap?.dispose();
        m.dispose();
      });
      cache.forEach((f) => {
        f.map.dispose();
        f.orm.dispose();
      });
      paintM.dispose();
      scene.environment?.dispose();
      sun?.shadow.map?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
