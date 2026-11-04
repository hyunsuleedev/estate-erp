import * as THREE from "three";

// Apartment geometry and motion selected from the architectural splash study.
const WINGS = [
  [
    [19.142, 32.872],
    [25.37, 77.037],
    [65.571, 81],
    [63.306, 65.995],
    [41.224, 63.164],
    [36.977, 35.42],
  ],
  [
    [35.845, 19],
    [38.11, 34.005],
    [60.758, 37.402],
    [64.721, 64.58],
    [80.858, 66.562],
    [74.347, 24.096],
  ],
].map((polygon) => polygon.map(([x, z]) => [(x - 50) / 16, (z - 50) / 16]));
// Divide each logo wing into four detached apartment footprints. Their gaps stay
// open through the plan view; only the final brand transition joins the parcels.
type Point = number[];
const interpolatePoint = (a: Point, b: Point, t: number) =>
  a.map((value, i) => value + (b[i] - value) * t);
// Both Ls must start at an arm tip and follow the OUTER elbow first.
// The source SVG's second polygon has opposite winding. Splitting it with the
// first polygon's indices would produce crossing quadrilaterals and torn faces.
const APARTMENTS = WINGS.flatMap((original, wing) => {
  const p =
    wing === 0
      ? original
      : [
          original[0],
          original[5],
          original[4],
          original[3],
          original[2],
          original[1],
        ];
  return [
    [p[0], p[1], p[4], p[5]],
    [p[1], p[2], p[3], p[4]],
  ].flatMap((quad, arm) =>
    [0, 1].map((part) => {
      const a = part / 2,
        b = (part + 1) / 2;
      const points = [
        interpolatePoint(quad[0], quad[1], a),
        interpolatePoint(quad[0], quad[1], b),
        interpolatePoint(quad[3], quad[2], b),
        interpolatePoint(quad[3], quad[2], a),
      ];
      const center = points.reduce(
        (sum, point) => sum.map((v, i) => v + point[i] / 4),
        [0, 0],
      );
      return {
        points: points.map((point) => point.map((v, i) => v - center[i])),
        center,
        height: [1.9, 2.3, 1.5, 1.8, 1.6, 2.1, 2.4, 1.75][
          wing * 4 + arm * 2 + part
        ],
      };
    }),
  );
});
const CAMPUS_SCALE = 1.55,
  BUILDING_INSET = 0.76,
  CAMPUS_SPREAD = 1.09;

const DURATION = 9;
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const smooth = (n: number) => {
  const t = clamp(n);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const phase = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
const mix = THREE.MathUtils.lerp;
const colorIvory = new THREE.Color("#eeeede");
const colorInk = new THREE.Color("#333b2f");
function material(
  color: THREE.ColorRepresentation,
  extra: THREE.MeshStandardMaterialParameters = {},
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
    transparent: true,
    ...extra,
  });
}
function faded(group: THREE.Object3D, value: number) {
  group.visible = value > 0.001;
  group.traverse((object) => {
    const material = (object as THREE.Mesh).material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const m of materials)
      m.opacity = (m.userData.baseOpacity ?? 1) * value;
  });
}
function outlinedBox(w: number, h: number, d: number, color = "#eeeee4") {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: "#6a7161",
    transparent: true,
    opacity: 0.32,
  });
  edgeMaterial.userData.baseOpacity = 0.32;
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    edgeMaterial,
  );
  mesh.add(edge);
  return mesh;
}
function path(points: number[][], color = "#a2aa94", opacity = 1) {
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
  });
  mat.userData.baseOpacity = opacity;
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(...p)),
    ),
    mat,
  );
}
function footprint(
  points: Point[],
  height: number,
  color: THREE.ColorRepresentation,
) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) =>
    i ? shape.lineTo(x, -z) : shape.moveTo(x, -z),
  );
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
function tree(x: number, z: number, size: number) {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.025, 0.22, 5),
    material("#9ca38b"),
  );
  stem.position.y = 0.12;
  const crown = new THREE.Mesh(
    new THREE.IcosahedronGeometry(size, 1),
    material("#abb397"),
  );
  crown.position.y = 0.27 + size * 0.5;
  crown.castShadow = true;
  group.add(stem, crown);
  group.position.set(x, 0, z);
  return group;
}

export interface ApartmentScene {
  pause(): void;
  resume(): void;
  dispose(): void;
}

export function createApartmentScene(
  host: HTMLElement,
  wordmark: HTMLElement,
  onError: () => void,
  onComplete: () => void,
): ApartmentScene {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor("#f6f5f0", 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.domElement.setAttribute("aria-hidden", "true");
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 100);
  const state = { time: 0, playing: true, last: 0, raf: 0 };
  let disposed = false;
  let completed = false;
  function buildCampus() {
    scene.add(new THREE.HemisphereLight("#ffffff", "#cbcbb8", 2.5));
    const sun = new THREE.DirectionalLight("#fff9e7", 3.2);
    sun.position.set(-5, 12, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -9,
      right: 9,
      top: 9,
      bottom: -9,
      near: 1,
      far: 35,
    });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 4;
    scene.add(sun);
    const fill = new THREE.DirectionalLight("#e1e8f2", 0.7);
    fill.position.set(8, 5, -7);
    scene.add(fill);
    const context = new THREE.Group();
    scene.add(context);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.ShadowMaterial({ opacity: 0.1 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.15;
    shadow.receiveShadow = true;
    scene.add(shadow);
    const plate = outlinedBox(10.9, 0.14, 8.7, "#f2f1e8");
    plate.position.y = -0.09;
    context.add(plate);
    // A lightly engraved perimeter and pathways anchor the composition like a model.
    const perimeter = [
      [-5.05, 0.006, -3.95],
      [5.05, 0.006, -3.95],
      [5.05, 0.006, 3.95],
      [-5.05, 0.006, 3.95],
      [-5.05, 0.006, -3.95],
    ];
    context.add(path(perimeter, "#a9b19b", 0.35));
    for (const x of [-2.7, 2.7])
      context.add(
        path(
          [
            [x, 0.012, -3.8],
            [x, 0.012, 3.8],
          ],
          "#b1b7a5",
          0.38,
        ),
      );
    for (const z of [-2.55, 2.55])
      context.add(
        path(
          [
            [-4.95, 0.012, z],
            [4.95, 0.012, z],
          ],
          "#b1b7a5",
          0.38,
        ),
      );
    // The whole model is one residential campus: eight freestanding apartment
    // blocks, a shared garden, trees and pedestrian gaps rather than two megablocks.
    const garden = outlinedBox(1.15, 0.025, 1.25, "#cdd3bc");
    garden.position.set(0.05, 0.012, 0);
    context.add(garden);
    const walk = path(
      [
        [-0.75, 0.035, -0.85],
        [0.85, 0.035, -0.85],
        [0.85, 0.035, 0.85],
        [-0.75, 0.035, 0.85],
        [-0.75, 0.035, -0.85],
      ],
      "#abb69b",
      0.5,
    );
    context.add(walk);
    [
      [-4.4, -1.4, 0.24],
      [-4.1, 1.55, 0.27],
      [-2.4, 3.5, 0.2],
      [0.4, 3.55, 0.21],
      [1.4, 3.6, 0.19],
      [4.25, 1.4, 0.25],
      [4.4, -1.3, 0.24],
      [-2.4, -3.5, 0.21],
      [-0.25, -0.25, 0.22],
      [0.3, 0.3, 0.18],
    ].forEach((p) => context.add(tree(p[0], p[1], p[2])));
    const signature = new THREE.Group();
    scene.add(signature);
    const apartments = APARTMENTS.map(({ points, center, height }, index) => {
      const group = new THREE.Group();
      signature.add(group);
      group.position.set(
        center[0] * CAMPUS_SCALE * CAMPUS_SPREAD,
        0,
        center[1] * CAMPUS_SCALE * CAMPUS_SPREAD,
      );
      group.scale.set(
        CAMPUS_SCALE * BUILDING_INSET,
        1,
        CAMPUS_SCALE * BUILDING_INSET,
      );
      const body = footprint(points, height, "#e9eadc");
      group.add(body);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(body.geometry),
        new THREE.LineBasicMaterial({
          color: "#626f52",
          transparent: true,
          opacity: 0.44,
        }),
      );
      edges.material.userData.baseOpacity = 0.44;
      body.add(edges);
      // Exterior floor bands read clearly in the oblique view, then disappear overhead.
      for (let y = 0.26; y < height - 0.1; y += 0.27) {
        const ring = points.map(([x, z]) => [x, y, z]);
        ring.push(ring[0]);
        body.add(path(ring, "#7c896c", 0.33));
      }
      // Window bays on all four facades keep each detached block legible as housing.
      points.forEach((a, edge) => {
        const b = points[(edge + 1) % points.length];
        for (const fraction of [0.25, 0.5, 0.75]) {
          const [x, z] = interpolatePoint(a, b, fraction);
          body.add(
            path(
              [
                [x, 0.15, z],
                [x, height - 0.14, z],
              ],
              "#98a18a",
              0.33,
            ),
          );
        }
      });
      const roof = footprint(points, 0.04, "#f3f3e7");
      roof.position.y = height + 0.01;
      group.add(roof);
      const rim = path(
        [...points, points[0]].map(([x, z]) => [x, 0.045, z]),
        "#7a876b",
        0.6,
      );
      roof.add(rim);
      const rooftop = outlinedBox(0.24, 0.11, 0.21, "#e3e6d7");
      rooftop.position.y = 0.095;
      roof.add(rooftop);
      return { group, body, roof, index, height };
    });
    const plan = new THREE.Group();
    scene.add(plan);
    // Retain eight separate footprints and their passageways in the plan view.
    const planLines = new THREE.Group();
    plan.add(planLines);
    const planGroups: { group: THREE.Group; center: Point }[] = [];
    APARTMENTS.forEach(({ points, center }) => {
      const group = new THREE.Group();
      planLines.add(group);
      planGroups.push({ group, center });
      group.position.set(
        center[0] * CAMPUS_SCALE * CAMPUS_SPREAD,
        0,
        center[1] * CAMPUS_SCALE * CAMPUS_SPREAD,
      );
      group.scale.set(
        CAMPUS_SCALE * BUILDING_INSET,
        1,
        CAMPUS_SCALE * BUILDING_INSET,
      );
      group.add(
        path(
          [...points, points[0]].map(([x, z]) => [x, 0.075, z]),
          "#4d5f3d",
          0.75,
        ),
      );
      for (const fraction of [0.33, 0.66]) {
        const a = interpolatePoint(points[0], points[1], fraction),
          b = interpolatePoint(points[3], points[2], fraction);
        group.add(
          path(
            [a, b].map(([x, z]) => [x, 0.08, z]),
            "#718061",
            0.65,
          ),
        );
      }
    });
    const dimension = new THREE.Group();
    plan.add(dimension);
    const dims = [
      [-3.65, 0.02, -3.6, 3.65, 0.02, -3.6],
      [-3.65, 0.02, 3.55, 3.65, 0.02, 3.55],
    ];
    dims.forEach((a) => {
      dimension.add(path([a.slice(0, 3), a.slice(3)], "#a1ae91", 0.65));
      for (const x of [-3.4, 3.4])
        dimension.add(
          path(
            [
              [x, 0.02, a[2] - 0.1],
              [x, 0.02, a[2] + 0.1],
            ],
            "#a1ae91",
            0.65,
          ),
        );
    });
    const parcels = new THREE.Group();
    scene.add(parcels);
    const parcelMeshes = APARTMENTS.map(({ points, center }) => {
      const template = footprint(points, 0.025, "#f0f0e7");
      template.material.dispose();
      const mesh = new THREE.Mesh(
        template.geometry,
        new THREE.MeshBasicMaterial({ color: "#f0f0e7", transparent: true }),
      );
      mesh.position.y = 0.025;
      parcels.add(mesh);
      return { mesh, center };
    });
    const logoGroup = new THREE.Group();
    scene.add(logoGroup);
    const logo = WINGS.map((points) => {
      const template = footprint(points, 0.025, "#f0f0e7");
      template.material.dispose();
      const mesh = new THREE.Mesh(
        template.geometry,
        new THREE.MeshBasicMaterial({ color: "#f0f0e7", transparent: true }),
      );
      mesh.position.y = 0.025;
      logoGroup.add(mesh);
      return mesh;
    });
    return {
      context,
      signature,
      apartments,
      plan,
      planLines,
      planGroups,
      dimension,
      parcels,
      parcelMeshes,
      logoGroup,
      logo,
      shadow,
      sun,
    };
  }

  const resources = buildCampus();
  host.prepend(renderer.domElement);
  function resize() {
    const rect = host.getBoundingClientRect();
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
  }
  function render() {
    if (disposed) return;
    const t = state.time;
    const orbit = phase(t, 1.75, 3.7);
    const isolate = phase(t, 3.5, 5.0);
    // Only crossfade after the camera has fully reached its overhead position.
    // Buildings and roofs remain rigid at their original transforms throughout.
    const reveal = phase(t, 4.1, 5.2);
    const mark = phase(t, 6.25, 7.85);
    const finish = phase(t, 7.7, 8.8);
    const r = resources;
    faded(r.context, phase(t, 0, 0.7) * (1 - isolate));
    r.signature.visible = reveal < 1;
    r.apartments.forEach(({ group, index }) => {
      const intro = phase(t, 0.08 + index * 0.055, 0.95 + index * 0.055);
      faded(group, intro * (1 - reveal));
    });
    faded(r.plan, reveal * (1 - mark));
    const join = phase(t, 6.25, 7.65),
      handoff = phase(t, 7.65, 7.85);
    faded(r.parcels, reveal * (1 - handoff));
    r.parcelMeshes.forEach(({ mesh, center }) => {
      const spread = mix(CAMPUS_SCALE * CAMPUS_SPREAD, 1, join);
      mesh.position.set(center[0] * spread, 0.025, center[1] * spread);
      const size = mix(CAMPUS_SCALE * BUILDING_INSET, 1, join);
      mesh.scale.set(size, 1, size);
      mesh.material.color.copy(colorIvory).lerp(colorInk, mark);
    });
    r.planGroups.forEach(({ group, center }) => {
      const spread = mix(CAMPUS_SCALE * CAMPUS_SPREAD, 1, join);
      const size = mix(CAMPUS_SCALE * BUILDING_INSET, 1, join);
      group.position.set(center[0] * spread, 0, center[1] * spread);
      group.scale.set(size, 1, size);
    });
    faded(r.logoGroup, handoff);
    r.logo.forEach((mesh) =>
      mesh.material.color.copy(colorIvory).lerp(colorInk, mark),
    );
    r.logoGroup.scale.setScalar(mix(1, 0.5, finish));
    r.shadow.material.opacity = 0.1 * (1 - isolate);
    // Orbit the camera, keeping buildings upright. Near zenith, a small Z offset
    // avoids a singular lookAt orientation while preserving the plan's north.
    const radius = 20,
      angle = mix(0.87, 0.0001, orbit),
      azimuth = mix(0.58, 0, orbit);
    const targetY = mix(0.65, 0, orbit);
    camera.position.set(
      radius * Math.sin(angle) * Math.sin(azimuth),
      targetY + radius * Math.cos(angle),
      radius * Math.sin(angle) * Math.cos(azimuth),
    );
    camera.lookAt(0, targetY, 0);
    const viewportWidth = Math.max(1, host.clientWidth);
    const viewportHeight = Math.max(1, host.clientHeight);
    const aspect = viewportWidth / viewportHeight;
    // Keep the selected composition's apparent scale, but render beyond its
    // old 860 × 600 frame so the campus and shadows cannot hit that rectangle.
    const compact = viewportWidth <= 600;
    const frameWidth = compact
      ? viewportWidth * 0.94
      : Math.min(viewportWidth * 0.84, 860);
    const frameHeight = compact
      ? viewportHeight * 0.65
      : Math.min(viewportHeight * 0.76, 600);
    const frameAspect = frameWidth / frameHeight;
    const startHeight = Math.max(8.7, 13.5 / frameAspect);
    const planHeight = Math.max(8.8, 9.5 / frameAspect);
    const logoHeight = Math.max(6.5, 5 / frameAspect);
    const height =
      (mix(startHeight, mix(planHeight, logoHeight, join), isolate) * viewportHeight) /
      frameHeight;
    const centerOffset = (-(compact ? 12.5 : 15) * height) / viewportHeight;
    camera.left = (-height * aspect) / 2;
    camera.right = (height * aspect) / 2;
    camera.top = height / 2 + centerOffset;
    camera.bottom = -height / 2 + centerOffset;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    wordmark.style.opacity = String(finish);
    wordmark.style.transform = `translateY(${(1 - finish) * 9}px)`;
  }

  function tick(now: number) {
    state.raf = 0;
    if (disposed) return;
    if (state.playing && !document.hidden) {
      state.time = Math.min(
        DURATION,
        state.time + Math.max(0, Math.min((now - state.last) / 1000, 0.1)),
      );
      if (state.time >= DURATION) state.playing = false;
    }
    state.last = now;
    render();
    if (state.time >= DURATION && !completed) {
      completed = true;
      onComplete();
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
  function contextLost(event: Event) {
    event.preventDefault();
    pause();
    onError();
  }
  function pause() {
    state.playing = false;
    cancelAnimationFrame(state.raf);
    state.raf = 0;
  }
  const observer = new ResizeObserver(() => {
    resize();
    requestRender();
  });
  observer.observe(host);
  document.addEventListener("visibilitychange", visibilityChanged);
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  resize();
  requestRender();
  return {
    pause,
    resume() {
      if (!disposed) {
        state.playing = state.time < DURATION;
        requestRender();
      }
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
      materials.forEach((m) => m.dispose());
      resources.sun.shadow.map?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
