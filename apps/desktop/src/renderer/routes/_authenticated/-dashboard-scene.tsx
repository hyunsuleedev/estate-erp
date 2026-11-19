/**
 * 대시보드 인사 영역의 그림 — 색이 있는 작은 동네. 사무소 위치의 날씨를 입는다.
 *
 * 장식이 아니라 오늘을 보여 준다 (계산은 -dashboard-sky.ts):
 * - 땅이 오늘의 시간 축이다(06~20시). 9·12·15·18시에 눈금이 있다.
 * - 해가 지금 시각 위에 떠 있다. 해가 지면 달로 바뀌고 저녁부터 창에 불이 켜진다.
 * - 오늘 일정이 그 시각 자리에 깃발로 꽂힌다. 그 시각에 비·눈 예보가 있으면 깃발에 우산이 씌워진다.
 * - 시간 축 위의 하늘이 오늘의 시간대별 날씨다. 15시부터 비라면 15시 자리부터 비구름이 깔린다.
 *
 * 이 파일이 그리는 것은 세 겹이다: 판 전체의 하늘(.dash-sky), 번개의 섬광(.dash-flash), 오른쪽의 그림(.dash-vista = svg + 비·눈 canvas).
 * 모양과 움직임의 정의는 -dashboard.css. 여기서 직접 움직이는 것은
 *   처음에 해가 떠오르는 것, 누르거나 업무를 완료했을 때 뛰는 것, 번개, 걷는 사람이 건물에 들르는 것,
 *   그리고 마우스를 따르는 것(하늘이 살짝 밀림 · 고양이 눈 · 비 올 때의 우산 · 눈이 피해 흩날림)이다.
 * 해·달·구름에는 얼굴을 넣지 않는다. 얼굴이 있는 것은 고양이와 사람뿐이다.
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent, type RefObject } from 'react';
import {
  BLOCKS,
  CAT_BLOCK,
  CHIMNEY_BLOCK,
  CLOUD_SHAPES,
  DAY_END,
  DAY_START,
  DECK_TONE,
  FAR_BLOCKS,
  GROUND,
  H,
  LOOSE_CLOUDS,
  PRECIP,
  SEASON_COLORS,
  W,
  WEATHER_LABEL,
  clamp,
  clock,
  css,
  darker,
  hasPrecip,
  luminary,
  mix,
  precipAtX,
  rgb,
  sceneState,
  shade,
  xAt,
  type SceneState,
  type SceneWeather,
} from './-dashboard-sky';

export interface SceneFlag {
  /** 0~24의 소수 시각 */
  hour: number;
  label: string;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const order = (i: number) => ({ '--i': i }) as CSSProperties;
const HOP_ORIGIN: CSSProperties = { transformBox: 'fill-box', transformOrigin: '50% 100%' };
/** 고양이 얼굴의 자리 (눈이 마우스를 볼 때의 기준) */
const CAT_X = BLOCKS[CAT_BLOCK][0] + 16;
const CAT_Y = GROUND - BLOCKS[CAT_BLOCK][2] - 11;
const UMBRELLA_RADIUS = 13.5;
/** 걷는 사람의 배율. 크기를 바꾸면 걷는 속도도 같이 바뀐다(WALK_SPEED). */
const WALKER_SCALE = 1.1;
/** 걷는 속도(그림 단위/초): 걸음 한 바퀴 1.1초에 발이 닿는 거리 13 × 배율. 이 속도로 옮겨야 디딘 발이 미끄러지지 않는다. */
const WALK_SPEED = (13 / 1.1) * WALKER_SCALE;
/** 문이 있는 건물: [BLOCKS의 순번, 문의 가로 자리] */
const DOORS = BLOCKS.flatMap(([x, width], block) => (width >= 30 ? [[block, x + width / 2] as const] : []));
const WALK_FROM = -18;
const WALK_TO = 458;

interface Particle {
  i: number;
  kind: 'rain' | 'snow' | null;
  wait: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  r: number;
  phase: number;
  sway: number;
  ix: number;
  iy: number;
}

interface Engine {
  /** 날씨가 바뀌었을 때 비·눈을 다시 뿌린다 */
  reseed: () => void;
  /** 구름을 눌렀을 때 그 자리에서 몇 방울 떨어뜨린다 */
  sprinkle: (x: number, y: number) => void;
  /** 그릴 것이 생겼을 때 그리기를 다시 돌린다 */
  kick: () => void;
  pointerX: () => number;
}

/** 걷는 사람의 다리. 엉덩이에서 허벅지가 돌고 그 끝(무릎)에서 정강이가 따로 돈다. */
function Leg({ far }: { far?: boolean }) {
  return (
    <g className={far ? 'far' : undefined} transform="translate(0.55 -8.4)">
      <g className="thigh">
        <path className="w-leg" d="M0 0v4" />
        <g transform="translate(0 4)">
          <g className="shin">
            <path className="w-leg" d="M0 0v3.5" />
            <path className="w-shoe" transform="translate(0 .5)" d="M-1.15 2.5h2l1.5.55q.75.3.75.85h-4.25z" />
          </g>
        </g>
      </g>
    </g>
  );
}

/*
 * 걷는 사람 — 정장 입은 중개사. 막대 인형이 아니라 몸과 머리가 있다. 얼굴은 점 눈 하나와 눈썹, 머리카락은 한 덩이로만 그린다.
 * 3.5등신쯤이다. 머리를 더 키우면 얼굴은 잘 보이지만 아이 인형처럼 보여 어른으로 읽히지 않는다.
 * 몸통은 머리보다 좁다(옆모습이라 넓으면 등이 다리 뒤로 튀어나온다).
 * 관절 자리를 묶음의 원점에 두어(translate로 옮긴 뒤 그 안에서 회전) 회전 중심이 흔들리지 않게 한다.
 * 그리는 순서: 먼 쪽 팔과 가방 → 먼 쪽 다리 → 몸·머리 → 가까운 다리 → 가까운 팔. 가방을 먼 쪽 손에 둔 것은 다리를 가리지 않기 위해서다.
 * 비가 오면 흔들던 팔 대신 우산 든 팔이 나온다.
 * 가로로 옮기는 것(.walkgo)과 건물에 드나들 때 사라지고 나타나는 것(.walkdoor)은 DashboardScene이 움직인다.
 */
function Walker({ goRef, doorRef }: { goRef: RefObject<SVGGElement | null>; doorRef: RefObject<SVGGElement | null> }) {
  return (
    <g className="late walker" transform={`translate(0 ${GROUND}) scale(${WALKER_SCALE})`}>
      <g ref={goRef} className="walkgo">
        <g ref={doorRef} className="walkdoor">
          <g className="body">
            <g transform="translate(0 -1)">
              <g className="far" transform="translate(0.6 -12.4)">
                <g className="armcarry">
                  <path className="w-arm" d="M0 0v5" />
                  <circle className="w-skin" cx="0" cy="5.3" r=".95" />
                  <path className="w-handle" d="M-1 5.9v-.9h2v.9" />
                  <rect className="w-case" x="-2.7" y="5.8" width="5.4" height="3.7" rx=".9" />
                  <path className="w-handle" d="M-2.7 7.3h5.4" />
                </g>
              </g>
            </g>
            <Leg far />
            <g transform="translate(0 -1)">
              <g className="walkumb">
                <path className="ln" d="M3.7 -12.6V-22.4" />
                <path
                  className="o"
                  fill="#6fa8e8"
                  d="M-4.5 -22.4a8.2 8.2 0 0 1 16.4 0q-2.05-1.7-4.1 0q-2.05-1.7-4.1 0q-2.05-1.7-4.1 0q-2.05-1.7-4.1 0z"
                />
              </g>
              <rect className="w-skin" x="-0.2" y="-14.4" width="1.6" height="1.6" rx=".5" />
              <path className="w-coat" d="M-1.1 -12.4q0-1.1 1.1-1.1h1.3q1.1 0 1.15 1.1l.2 5.1q.05.9-.8.9h-2.4q-.85 0-.8-.9z" />
              <path className="w-shirt" d="M0.7 -13.5h1.5l-.5 2.4z" />
              <path className="w-tie" d="M1.45 -13.3l-.12 2" />
              <g transform="translate(0.6 -13.9) scale(.64) translate(-0.6 13.9)">
                <g className="whead">
                  <path
                    className="w-skin"
                    d="M-3.6 -18.4c0-3 2-4.6 4.2-4.6s4.2 1.8 4.2 4.6c0 1.4-.3 2.6-1.2 3.5-.9.9-1.9 1.3-3 1.3s-2.3-.4-3.1-1.3c-.8-.9-1.1-2.1-1.1-3.5z"
                  />
                  {/* 머리카락은 정수리와 뒤통수를 덮는 모자 모양 한 덩이다. 앞머리의 굴곡은 넣지 않는다. */}
                  <path
                    className="w-hair"
                    d="M-3.7 -17.2C-4.6 -20.9-2.4 -23.7.8 -23.7 3.5 -23.7 5.1 -21.9 5.1 -19.9H-.5Q-1.9 -19.9-1.9 -18.5V-17.1z"
                  />
                  {/* 얼굴은 점 눈 하나와 그 위의 눈썹 한 줄뿐이다(옆모습). 이 크기에서 볼·입까지 그리면 사람만 주변(건물, 고양이)보다 촘촘해 튄다. */}
                  <g className="eyes">
                    <circle className="w-eye" cx="3.1" cy="-17.7" r=".72" />
                  </g>
                  <path className="w-brow" d="M2 -18.95q1.1 -.5 2.2 -.05" />
                </g>
              </g>
            </g>
            <Leg />
            <g transform="translate(0 -1)">
              <g className="armfree" transform="translate(0.6 -12.4)">
                <g className="armswing">
                  <path className="w-arm" d="M0 0v2.9" />
                  <g transform="translate(0 2.9)">
                    <g className="forearm">
                      <path className="w-arm" d="M0 0v2.5" />
                      <circle className="w-skin" cx="0" cy="2.8" r=".95" />
                    </g>
                  </g>
                </g>
              </g>
              <g className="walkumb">
                <path className="w-arm" d="M0.6 -12.4l2.3 1.5.8-2.3" />
                <circle className="w-skin" cx="3.7" cy="-13.4" r=".95" />
              </g>
            </g>
          </g>
        </g>
      </g>
    </g>
  );
}

export function DashboardScene({
  hour,
  date,
  flags,
  cheer,
  weather,
}: {
  /** 지금 시각 (0~24의 소수) */
  hour: number;
  /** 오늘 (계절과 일출·일몰을 정한다) */
  date: Date;
  /** 오늘 일정 */
  flags: SceneFlag[];
  /** 업무를 완료할 때마다 1씩 늘어나는 수. 바뀌면 해가 한 번 뛴다. */
  cheer: number;
  /** 사무소 위치의 날씨. 없으면 맑은 날로 그린다. */
  weather?: SceneWeather;
}) {
  const gradientId = useId().replace(/:/g, '');
  const vistaRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const lumRef = useRef<SVGGElement>(null);
  const hopperRef = useRef<SVGGElement>(null);
  const catHopRef = useRef<SVGGElement>(null);
  const catLookRef = useRef<SVGGElement>(null);
  const heartRef = useRef<SVGTextElement>(null);
  const boltRef = useRef<SVGPathElement>(null);
  const brollyRef = useRef<SVGGElement>(null);
  const brollyTiltRef = useRef<SVGGElement>(null);
  const walkGoRef = useRef<SVGGElement>(null);
  const walkDoorRef = useRef<SVGGElement>(null);
  const engineRef = useRef<Engine | null>(null);
  /** 그림 한 단위의 화면 크기(s)와, 판 안에서 그림이 놓인 자리 — 해 둘레의 빛을 해 자리에 맞춘다 */
  const [geo, setGeo] = useState({ s: 1, ox: 0, oy: 0 });

  const state = sceneState(hour, date, weather);
  const { amb, lum, wx, season, decks, sunrise, sunset } = state;
  const night = !lum.sunUp;
  const stateRef = useRef<SceneState>(state);
  stateRef.current = state;

  /* ---- 크기: 그림이 놓인 자리를 재고 canvas를 그 크기에 맞춘다 ---- */
  useEffect(() => {
    const vista = vistaRef.current;
    const svg = svgRef.current;
    const canvas = canvasRef.current;
    const hero = vista?.parentElement;
    if (!vista || !svg || !canvas || !hero || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const box = svg.getBoundingClientRect();
      const heroBox = hero.getBoundingClientRect();
      if (!box.width) return;
      const next = { s: box.width / W, ox: box.left - heroBox.left, oy: box.top - heroBox.top };
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(box.width * ratio);
      canvas.height = Math.round(box.height * ratio);
      canvas.getContext('2d')?.setTransform(ratio * next.s, 0, 0, ratio * next.s, 0, 0);
      setGeo((prev) =>
        Math.abs(prev.s - next.s) < 0.001 && Math.abs(prev.ox - next.ox) < 0.5 && Math.abs(prev.oy - next.oy) < 0.5 ? prev : next,
      );
      engineRef.current?.kick();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  /* ---- 처음 한 번: 해는 일출 자리에서 지금 자리까지 지나온 길을 따라 올라온다. 달은 제자리에서 나타난다. ---- */
  useEffect(() => {
    const el = lumRef.current;
    if (!el || prefersReducedMotion() || typeof el.animate !== 'function') return;
    const still = night || lum.offAxis;
    const frames = still
      ? [
          { opacity: 0, transform: `translate(${lum.x}px, ${lum.y + 12}px)` },
          { opacity: 1, transform: `translate(${lum.x}px, ${lum.y}px)` },
        ]
      : Array.from({ length: 13 }, (_, i) => {
          const at = luminary(sunrise + ((hour - sunrise) * i) / 12, sunrise, sunset);
          return { transform: `translate(${at.x}px, ${at.y}px)`, opacity: i === 0 ? 0 : 1 };
        });
    const animation = el.animate(frames, {
      duration: still ? 700 : 1500,
      delay: 350,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      fill: 'backwards',
    });
    return () => animation.cancel();
    // 화면을 열 때 한 번만 재생한다. 시각이 바뀔 때마다 다시 떠오르면 안 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hopElement = (el: Element | null, height: number) => {
    if (!el || prefersReducedMotion() || typeof el.animate !== 'function') return;
    el.animate(
      [
        { transform: 'translateY(0) scale(1, 1)' },
        { transform: `translateY(-${height}px) scale(1.08, 0.94)`, offset: 0.3 },
        { transform: 'translateY(0) scale(0.93, 1.07)', offset: 0.55 },
        { transform: `translateY(-${height / 3}px) scale(1, 1)`, offset: 0.75 },
        { transform: 'translateY(0) scale(1, 1)' },
      ],
      { duration: 620, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    );
  };
  /** 해(또는 달)가 한 번 뛴다 */
  const hop = () => hopElement(hopperRef.current, 10);
  useEffect(() => {
    if (cheer > 0) hop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cheer]);

  /* ---- 비·눈과 마우스: canvas와 몇몇 묶음을 직접 움직인다 (React 상태를 거치면 프레임마다 다시 그리게 된다) ---- */
  useEffect(() => {
    const vista = vistaRef.current;
    const svg = svgRef.current;
    const canvas = canvasRef.current;
    const hero = vista?.parentElement;
    const context = canvas?.getContext('2d');
    if (!vista || !svg || !canvas || !hero || !context) return;
    const still = prefersReducedMotion();
    const layers = Array.from(svg.querySelectorAll<SVGGElement>('.par'));
    const pool: Particle[] = Array.from({ length: 84 }, (_, i) => ({
      i,
      kind: null,
      wait: Math.random() * 0.4,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      len: 0,
      r: 0,
      phase: 0,
      sway: 0,
      ix: 0,
      iy: 0,
    }));
    const cap = { rain: 46, heavy: 84, snow: 70 };
    const splashes: Array<{ x: number; y: number; life: number }> = [];
    const pointer = { inside: false, x: 0, y: 0, vx: 0, nx: 0, ny: 0 };
    const drift = { x: 0, y: 0 };
    const look = { x: 0, y: 0 };
    const brolly = { x: 0, y: 0, tilt: 0 };
    let frame = 0;
    let last = 0;
    let settle = 0;
    let onScreen = true;
    let thunderTimer = 0;

    const respawn = (p: Particle, prewarm: boolean) => {
      const x = 14 + Math.random() * 420;
      const falling = precipAtX(stateRef.current, x);
      if (!falling || p.i >= cap[falling.heavy ? 'heavy' : falling.kind]) {
        p.kind = null;
        p.wait = 0.15 + Math.random() * 0.5;
        return;
      }
      p.kind = falling.kind;
      p.x = x;
      p.ix = 0;
      p.iy = 0;
      if (falling.kind === 'rain') {
        p.y = prewarm ? 24 + Math.random() * (GROUND - 24) : 20 + Math.random() * 6;
        p.vy = (falling.heavy ? 172 : 132) + Math.random() * 50;
        p.vx = falling.heavy ? -48 : -20;
        p.len = 5 + Math.random() * 3;
      } else {
        p.y = prewarm ? 20 + Math.random() * (GROUND - 20) : 17 + Math.random() * 6;
        p.vy = 13 + Math.random() * 13;
        p.r = 0.9 + Math.random() * 1.1;
        p.phase = Math.random() * 6.28;
        p.sway = 4 + Math.random() * 5;
      }
    };
    /** 비가 오는 자리에 마우스가 있으면 마우스가 우산이 된다 */
    const umbrellaOn = () =>
      pointer.inside && pointer.y > 14 && pointer.y < GROUND + 6 && precipAtX(stateRef.current, pointer.x)?.kind === 'rain';

    const step = (dt: number) => {
      const umbrella = umbrellaOn();
      for (const p of pool) {
        if (!p.kind) {
          p.wait -= dt;
          if (p.wait <= 0) respawn(p, false);
          continue;
        }
        if (p.kind === 'rain') {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (umbrella) {
            const dx = p.x - brolly.x;
            const dy = p.y - brolly.y;
            if (dy < 1 && dx * dx + dy * dy < UMBRELLA_RADIUS * UMBRELLA_RADIUS) {
              // 우산에 맞은 빗방울은 가장자리로 흘러내린다
              const side = dx >= 0 ? 1 : -1;
              splashes.push({ x: p.x, y: p.y, life: 0.2 });
              p.x = brolly.x + side * (UMBRELLA_RADIUS + 0.6);
              p.y = brolly.y + 1.5;
              p.vx = side * 22;
              p.vy *= 0.72;
            }
          }
          if (p.y >= GROUND) {
            splashes.push({ x: p.x, y: GROUND, life: 0.24 });
            respawn(p, false);
          }
        } else {
          p.phase += dt * 1.6;
          if (pointer.inside) {
            // 눈은 마우스를 피해 흩날린다
            const dx = p.x - pointer.x;
            const dy = p.y - pointer.y;
            const distance = Math.hypot(dx, dy);
            if (distance < 30 && distance > 0.01) {
              const force = (30 - distance) / 30;
              p.ix += (dx / distance) * force * 420 * dt + pointer.vx * force * 0.5 * dt;
              p.iy += (dy / distance) * force * 300 * dt;
            }
          }
          p.ix *= Math.pow(0.05, dt);
          p.iy *= Math.pow(0.05, dt);
          p.x += (Math.sin(p.phase) * p.sway + p.ix) * dt;
          p.y += (p.vy + p.iy) * dt;
          if (p.y >= GROUND || p.y < 4) respawn(p, false);
        }
      }
      for (let i = splashes.length - 1; i >= 0; i -= 1) {
        splashes[i].life -= dt;
        if (splashes[i].life <= 0) splashes.splice(i, 1);
      }
    };

    const draw = () => {
      context.clearRect(0, 0, W, H);
      const dark = stateRef.current.amb.dark > 0.5;
      context.lineCap = 'round';
      context.strokeStyle = dark ? 'rgba(200,216,255,.6)' : 'rgba(72,124,196,.62)';
      context.lineWidth = 1.15;
      context.beginPath();
      for (const p of pool) {
        if (p.kind !== 'rain') continue;
        const k = p.len / Math.hypot(p.vx, p.vy);
        context.moveTo(p.x, p.y);
        context.lineTo(p.x - p.vx * k, p.y - p.vy * k);
      }
      for (const splash of splashes) {
        const r = (0.24 - splash.life) * 16 + 1;
        context.moveTo(splash.x - r, splash.y - r * 0.7);
        context.lineTo(splash.x - r * 0.5, splash.y - 0.4);
        context.moveTo(splash.x + r, splash.y - r * 0.7);
        context.lineTo(splash.x + r * 0.5, splash.y - 0.4);
      }
      context.stroke();
      context.fillStyle = '#fff';
      context.strokeStyle = dark ? 'rgba(160,180,230,.4)' : 'rgba(112,146,196,.6)';
      context.lineWidth = 0.55;
      for (const p of pool) {
        if (p.kind !== 'snow') continue;
        context.beginPath();
        context.arc(p.x, p.y, p.r, 0, 6.2832);
        context.fill();
        context.stroke();
      }
    };

    /** 마우스를 따르는 것들. 값을 바로 대지 않고 조금씩 따라가게 해서 뚝뚝 끊기지 않는다. */
    const follow = (dt: number) => {
      const k = 1 - Math.pow(0.0015, dt);
      drift.x += (pointer.nx - drift.x) * k;
      drift.y += (pointer.ny - drift.y) * k;
      for (const layer of layers) {
        const depth = Number(layer.dataset.depth);
        layer.style.transform = `translate(${(-drift.x * depth * 7).toFixed(2)}px, ${(-drift.y * depth * 3).toFixed(2)}px)`;
      }
      const tx = pointer.inside ? clamp((pointer.x - CAT_X) / 60, -1, 1) : 0;
      const ty = pointer.inside ? clamp((pointer.y - CAT_Y) / 40, -1, 1) : 0;
      look.x += (tx - look.x) * k;
      look.y += (ty - look.y) * k;
      if (catLookRef.current) {
        catLookRef.current.style.transform = `translate(${(look.x * 0.55).toFixed(2)}px, ${(look.y * 0.4).toFixed(2)}px)`;
      }
      const brollyEl = brollyRef.current;
      if (brollyEl) {
        brollyEl.classList.toggle('on', umbrellaOn());
        const bk = 1 - Math.pow(0.00002, dt);
        const before = brolly.x;
        brolly.x += (pointer.x - brolly.x) * bk;
        brolly.y += (pointer.y - 5 - brolly.y) * bk;
        brolly.tilt += (clamp(((brolly.x - before) / Math.max(dt, 0.001)) * 0.09, -20, 20) - brolly.tilt) * k;
        brollyEl.style.transform = `translate(${brolly.x.toFixed(1)}px, ${brolly.y.toFixed(1)}px)`;
        if (brollyTiltRef.current) brollyTiltRef.current.style.transform = `rotate(${brolly.tilt.toFixed(1)}deg)`;
      }
    };

    /** 그릴 것이 없으면(비·눈이 없고 마우스도 떠났으면) 멈춘다. 대시보드는 하루 종일 열려 있는 화면이다. */
    const loop = (time: number) => {
      const dt = last ? Math.min((time - last) / 1000, 0.05) : 0.016;
      last = time;
      const raining = hasPrecip(stateRef.current) || pool.some((p) => p.kind) || splashes.length > 0;
      if (raining) step(dt);
      draw();
      follow(dt);
      if (pointer.inside) settle = 90;
      else settle -= 1;
      if (document.hidden || !onScreen || (!raining && settle <= 0)) {
        frame = 0;
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (still) {
        // 움직임 줄이기: 비·눈은 멈춘 한 장으로만 그린다
        pool.forEach((p) => respawn(p, true));
        draw();
        return;
      }
      if (frame || document.hidden || !onScreen) return;
      last = 0;
      frame = requestAnimationFrame(loop);
    };

    const onMove = (event: PointerEvent) => {
      const box = svg.getBoundingClientRect();
      const heroBox = hero.getBoundingClientRect();
      const scale = box.width / W || 1;
      const x = (event.clientX - box.left) / scale;
      const y = (event.clientY - box.top) / scale;
      pointer.vx = (x - pointer.x) * 60;
      pointer.x = x;
      pointer.y = y;
      pointer.inside = true;
      pointer.nx = clamp(((event.clientX - heroBox.left) / heroBox.width) * 2 - 1, -1, 1);
      pointer.ny = clamp(((event.clientY - heroBox.top) / heroBox.height) * 2 - 1, -1, 1);
      kick();
    };
    const onLeave = () => {
      pointer.inside = false;
      pointer.nx = 0;
      pointer.ny = 0;
      pointer.vx = 0;
    };
    if (!still) {
      hero.addEventListener('pointermove', onMove);
      hero.addEventListener('pointerleave', onLeave);
    }
    const onVisibility = () => kick();
    document.addEventListener('visibilitychange', onVisibility);
    const watcher =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            onScreen = entry.isIntersecting;
            kick();
          });
    watcher?.observe(hero);

    /** 번개: 천둥번개가 예보된 구름 아래 어딘가에서 친다. 섬광은 옅게, 드물게. */
    const thunder = () => {
      const storms = stateRef.current.decks.filter((deck) => deck.kind === 'thunder');
      const bolt = boltRef.current;
      if (still || document.hidden || !onScreen || !storms.length || !bolt) return;
      const storm = storms[Math.floor(Math.random() * storms.length)];
      const x = clamp(storm.x1 + 20 + Math.random() * (storm.x2 - storm.x1 - 40), 30, 420);
      bolt.setAttribute('transform', `translate(${x.toFixed(1)} 21)`);
      bolt.animate?.(
        [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0.2, offset: 0.3 }, { opacity: 1, offset: 0.42 }, { opacity: 0 }],
        { duration: 520 },
      );
      flashRef.current?.animate?.(
        [{ opacity: 0 }, { opacity: 0.3, offset: 0.12 }, { opacity: 0.05, offset: 0.3 }, { opacity: 0.2, offset: 0.42 }, { opacity: 0 }],
        { duration: 520 },
      );
      window.setTimeout(() => hopElement(catHopRef.current, 6), 140);
    };
    const scheduleThunder = () => {
      thunderTimer = window.setTimeout(
        () => {
          thunder();
          scheduleThunder();
        },
        4200 + Math.random() * 5200,
      );
    };
    scheduleThunder();

    engineRef.current = {
      reseed: () => {
        pool.forEach((p) => respawn(p, true));
        kick();
      },
      sprinkle: (x, y) => {
        if (still) return;
        let count = 0;
        for (const p of pool) {
          if (count >= 9) break;
          if (p.kind) continue;
          p.kind = PRECIP[stateRef.current.wx] === 'snow' ? 'snow' : 'rain';
          p.x = x - 9 + Math.random() * 18;
          p.y = y + 6;
          p.ix = 0;
          p.iy = 0;
          if (p.kind === 'rain') {
            p.vy = 110 + Math.random() * 60;
            p.vx = -8;
            p.len = 5;
          } else {
            p.vy = 16 + Math.random() * 10;
            p.r = 1.2;
            p.phase = Math.random() * 6;
            p.sway = 6;
          }
          count += 1;
        }
        settle = 120;
        kick();
      },
      kick,
      pointerX: () => pointer.x,
    };
    engineRef.current.reseed();

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(thunderTimer);
      hero.removeEventListener('pointermove', onMove);
      hero.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      watcher?.disconnect();
      engineRef.current = null;
    };
    // 한 번만 건다. 바뀌는 값(시각·날씨)은 stateRef로 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * ---- 걷는 사람의 하루 ----
   * 끝없이 같은 속도로 지나가면 배경 무늬처럼 보인다. 그래서 왼쪽에서 나와 오른쪽으로 걷다가 가끔 건물에 들어가고,
   * 한동안 있다가 나와서 다시 걷는다. 안에 있는 동안은 그 건물 창에 불이 켜진다. 어느 건물에 들를지, 얼마나 있을지는 그때그때 다르다.
   */
  useEffect(() => {
    const go = walkGoRef.current;
    const door = walkDoorRef.current;
    const svg = svgRef.current;
    if (!go || !door || !svg) return;
    if (prefersReducedMotion() || typeof go.animate !== 'function') {
      // 움직임 줄이기: 걷지 않고 한자리에 서 있는다
      go.style.transform = `translateX(${176 / WALKER_SCALE}px)`;
      return;
    }
    let alive = true;
    let timer = 0;
    let running: Animation | null = null;
    let visiting: Element | null = null;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = window.setTimeout(resolve, ms);
      });
    const walk = async (from: number, to: number) => {
      running = go.animate(
        [{ transform: `translateX(${from / WALKER_SCALE}px)` }, { transform: `translateX(${to / WALKER_SCALE}px)` }],
        { duration: (Math.abs(to - from) / WALK_SPEED) * 1000, easing: 'linear', fill: 'forwards' },
      );
      await running.finished;
    };
    /** 문으로 들어가며 사라지거나, 나오며 나타난다 */
    const pass = async (entering: boolean) => {
      const shown = { opacity: 1, transform: 'scale(1)' };
      const hidden = { opacity: 0, transform: 'scale(0.82)' };
      running = door.animate(entering ? [shown, hidden] : [hidden, shown], { duration: 380, easing: 'ease-out', fill: 'forwards' });
      await running.finished;
    };
    const day = async () => {
      while (alive) {
        let x = WALK_FROM;
        for (const [block, doorX] of DOORS) {
          if (Math.random() > 0.4) continue;
          await walk(x, doorX);
          x = doorX;
          await pass(true);
          if (!alive) return;
          visiting = svg.querySelector(`.bld[data-block="${block}"]`);
          visiting?.classList.add('visit');
          await wait(8000 + Math.random() * 14000);
          visiting?.classList.remove('visit');
          visiting = null;
          await pass(false);
        }
        await walk(x, WALK_TO);
        // 화면 밖에서 잠깐 쉬었다가 다시 나온다
        await wait(2500 + Math.random() * 5000);
      }
    };
    // 화면을 떠나며 움직임을 취소하면 finished가 거절된다 — 그때는 그냥 끝낸다
    day().catch(() => undefined);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      running?.cancel();
      visiting?.classList.remove('visit');
    };
  }, []);

  // 내리는 것이 바뀌면(날씨가 바뀌거나 시간 축을 벗어나면) 비·눈을 다시 뿌린다
  const precipKey = `${lum.offAxis ? wx : ''}|${decks.map((deck) => `${deck.kind}${deck.h1}-${deck.h2}`).join(',')}`;
  useEffect(() => {
    engineRef.current?.reseed();
  }, [precipKey]);

  /* ---- 누르면 반응한다 (마우스로만 닿는 덤) ---- */
  const onClick = (event: MouseEvent<SVGSVGElement>) => {
    const target = event.target as Element;
    const engine = engineRef.current;
    if (target.closest('.sun, .moon')) {
      hop();
      return;
    }
    if (target.closest('.bigcloud')) {
      hopElement(hopperRef.current, 6);
      engine?.sprinkle(lum.x + 10, lum.y + 8);
      return;
    }
    if (target.closest('.deck')) {
      engine?.sprinkle(engine.pointerX(), 15);
      return;
    }
    const loose = target.closest<SVGGElement>('.slot');
    if (loose) {
      const cloud = LOOSE_CLOUDS[Number(loose.dataset.i)];
      hopElement(loose.querySelector('.cbob'), 6);
      engine?.sprinkle(xAt(cloud.h), cloud.y);
      return;
    }
    if (target.closest('.cat')) {
      hopElement(catHopRef.current, 6);
      if (!prefersReducedMotion()) {
        heartRef.current?.animate?.(
          [
            { opacity: 0, transform: 'translate(0, 2px) scale(0.6)' },
            { opacity: 1, transform: 'translate(1px, -3px) scale(1)', offset: 0.3 },
            { opacity: 0, transform: 'translate(3px, -10px) scale(1)' },
          ],
          { duration: 900, easing: 'ease-out' },
        );
      }
    }
  };

  /* ---- 그리기 ---- */
  const colors = SEASON_COLORS[season];
  const snowing = wx === 'snow';
  const paint = (hex: string, k = 1): CSSProperties => ({ fill: shade(hex, amb, k) });
  // 창문: 저녁부터, 그리고 궂은 날에는 낮에도 몇 집이 불을 켠다
  const dusk = hour >= sunset - 0.8 || hour < sunrise + 0.5;
  const litEvery = night ? 3 : dusk ? 5 : wx === 'thunder' || wx === 'rain' ? 7 : 0;
  const nowCloudTone = wx === 'thunder' ? '#b9c2d3' : wx === 'rain' ? '#e2e9f2' : '#ffffff';
  const sceneStyle = {
    '--glass': css(mix(rgb('#9cc3e6'), rgb('#181d42'), amb.dark * 0.72)),
    '--axis': amb.dark > 0.5 ? 'rgba(255,255,255,.62)' : 'rgba(44,44,43,.5)',
    '--ol': amb.dark > 0.5 ? 'rgba(18,20,48,.6)' : 'rgba(64,48,40,.5)',
  } as CSSProperties;
  const skyStyle = {
    '--sky-a': css(amb.skyA),
    '--sky-b': css(amb.skyB),
    '--glow': amb.glow,
    '--wash': amb.wash,
    '--gx': `${(geo.ox + lum.x * geo.s).toFixed(1)}px`,
    '--gy': `${(geo.oy + lum.y * geo.s).toFixed(1)}px`,
  } as CSSProperties;
  const shownFlags = flags.filter((flag) => flag.hour >= DAY_START && flag.hour <= DAY_END);

  return (
    <>
      <div className="dash-sky" style={skyStyle} aria-hidden="true" />
      <div ref={flashRef} className="dash-flash" aria-hidden="true" />
      <div ref={vistaRef} className="dash-vista">
        <svg
          ref={svgRef}
          className="dash-scene"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          data-wx={wx}
          data-night={night ? '1' : '0'}
          data-off={lum.offAxis ? '1' : '0'}
          data-season={season}
          style={sceneStyle}
          onClick={onClick}
          // 알약의 '오늘 일정' 수에는 종일·이어지는 일정도 들어간다. 여기서는 시각이 잡힌 것만 센다고 밝힌다.
          aria-label={`오늘의 시간 축. 지금 ${clock(hour)}${weather ? `, ${WEATHER_LABEL[wx]}` : ''}, 시각이 잡힌 오늘 일정 ${flags.length}건${flags
            .map((flag) => ` ${clock(flag.hour)} ${flag.label}`)
            .join(',')}`}
        >
          <defs>
            <linearGradient id={`${gradientId}fog`}>
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset=".3" stopColor="#fff" />
              <stop offset=".7" stopColor="#fff" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${gradientId}haze`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#f4f1ea" stopOpacity="0" />
              <stop offset="1" stopColor="#f4f1ea" stopOpacity=".9" />
            </linearGradient>
          </defs>

          {/* 별 */}
          <g className="par" data-depth="0.25">
            {[
              [60, 20],
              [112, 9],
              [150, 30],
              [200, 14],
              [250, 6],
              [300, 18],
              [345, 34],
              [400, 12],
            ].map(([x, y], i) => (
              <path key={i} className="star" style={order(i)} d={`M${x} ${y - 2.2}l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7z`} />
            ))}
          </g>
          {/* 맑은 날 멀리 지나가는 구름 두 점 */}
          <g className="par" data-depth="0.5">
            <g className="drifter">
              <path className="wisp" transform="translate(0 12)" d="M0 8a5 5 0 0 1 5-5 8 8 0 0 1 15 1 5 5 0 0 1 3 9H4a5 5 0 0 1-4-5z" />
            </g>
            <g className="drifter b">
              <path className="wisp" transform="translate(0 30) scale(.7)" d="M0 8a5 5 0 0 1 5-5 8 8 0 0 1 15 1 5 5 0 0 1 3 9H4a5 5 0 0 1-4-5z" />
            </g>
          </g>
          {/* 먼 건물 */}
          <g className="par far-blocks" data-depth="0.35">
            {FAR_BLOCKS.map(([x, width, height]) => (
              <path
                key={x}
                className="tint"
                style={{ fill: css(mix(amb.skyB, mix(amb.skyA, rgb('#7b8fb8'), 0.45), 0.6)) }}
                d={`M${x} ${GROUND}V${GROUND - height + 3}a3 3 0 0 1 3-3h${width - 6}a3 3 0 0 1 3 3V${GROUND}z`}
              />
            ))}
          </g>

          <g className="late">
            <path className="nowline" d={`M${lum.x.toFixed(1)} ${(lum.y + 18).toFixed(1)}V${GROUND}`} />
          </g>
          {/*
            해 · 달 · 지금 자리의 구름. 건물보다 먼저 그린다: 지붕과 겹치면 뒤로 지나가는 것처럼 보인다.
            자리를 잡는 transform과 CSS 움직임을 한 요소에 같이 두면 움직임이 자리를 덮어쓴다 — 그래서 묶음을 겹겹이 나눈다.
          */}
          <g ref={lumRef} className="lum" style={{ transform: `translate(${lum.x.toFixed(1)}px, ${lum.y.toFixed(1)}px)` }}>
            <g className="par" data-depth="0.6">
              <g ref={hopperRef} style={HOP_ORIGIN}>
                <g className="bobber">
                  <g className="sun">
                    <g className="rays">
                      {Array.from({ length: 8 }, (_, i) => (
                        <path key={i} className="ray" transform={`rotate(${i * 45})`} d="M0 -15v-3.6" />
                      ))}
                    </g>
                    <circle className="sunc" r="11" />
                  </g>
                  <g className="moon">
                    <path className="moonc" d="M5 -10a11 11 0 1 0 7 18a9 9 0 0 1-7-18z" />
                  </g>
                  <g className="bigcloud">
                    <path className="cloud tint" style={paint(nowCloudTone, 0.7)} d={CLOUD_SHAPES.a} transform="scale(1.08)" />
                  </g>
                </g>
              </g>
            </g>
          </g>

          {/* 구름: 흐림·비·눈은 이어진 덩이, 구름 조금은 낱개 */}
          <g className="par" data-depth="0.5">
            {[0, 1, 2].map((i) => (
              <g key={i} className={decks[i] ? 'deck back on' : 'deck back'}>
                <g className="deckdrift">
                  <path className="cloud tint" style={paint(decks[i] ? DECK_TONE[decks[i].kind][1] : '#ffffff', 1)} d={decks[i]?.back ?? ''} />
                </g>
              </g>
            ))}
          </g>
          <g className="par" data-depth="0.85">
            {[0, 1, 2].map((i) => (
              <g key={i} className={decks[i] ? 'deck on' : 'deck'}>
                <g className="deckdrift">
                  <path className="cloud tint" style={paint(decks[i] ? DECK_TONE[decks[i].kind][0] : '#ffffff', 0.7)} d={decks[i]?.front ?? ''} />
                </g>
              </g>
            ))}
            {LOOSE_CLOUDS.map((cloud, i) => (
              <g key={i} className={state.wxAtHour(cloud.h) === 'partly' ? 'slot on' : 'slot'} data-i={i} style={order(i)}>
                <g transform={`translate(${xAt(cloud.h).toFixed(1)} ${cloud.y})`}>
                  <g className="cbob" style={order(i)}>
                    <g transform={`scale(${cloud.flip ? -cloud.s : cloud.s} ${cloud.s})`}>
                      <path className="cloud tint" style={paint('#ffffff', 0.7)} d={CLOUD_SHAPES[cloud.shape]} />
                    </g>
                  </g>
                </g>
              </g>
            ))}
          </g>
          <g className="par" data-depth="0.8">
            <path ref={boltRef} className="bolt" d="M3 0l-7 11h5l-3 10 9-13h-5l4-8z" />
          </g>

          <g className="late bird" transform="translate(0 34)">
            <g className="birdfly">
              <path className="ln" d="M0 0q3.6 -4 6 0q2.4 -4 6 0" />
            </g>
          </g>

          {/* 나무: 계절의 색을 입고, 눈이 오면 눈을 얹는다 */}
          {[181, 307].map((x, i) => (
            <g key={x} className={i ? 'sway b' : 'sway'}>
              <path className="ln" d={`M${x} ${GROUND}v-10`} />
              <circle className="o tint" style={paint(colors.tree[i])} cx={x} cy={GROUND - 15} r="7.4" />
              <path className="cap" d={`M${x - 6.6} ${GROUND - 17.4}a6.9 6.9 0 0 1 13.2 0q-3.3 2.4 -6.6 .6t-6.6 -.6z`} />
            </g>
          ))}

          {/* 건물. 마우스를 올리면 살짝 늘어나고 불이 켜진다. */}
          {BLOCKS.map(([x, width, height, color], block) => {
            const top = GROUND - height;
            const cols = Math.floor((width - 7) / 8.4);
            const rows = Math.floor((height - 12) / 10.5);
            const pad = (width - cols * 8.4 + 4.2) / 2;
            return (
              <g key={x} className="bld" data-block={block} style={order(block)}>
                {block === CHIMNEY_BLOCK && (
                  <>
                    <path className="o tint" style={paint(darker(color, 0.3))} d={`M${x + 15} ${top + 1}v-6h5v6z`} />
                    {[0, 1, 2].map((i) => (
                      <circle key={i} className="puff" style={order(i)} cx={x + 17.5} cy={top - 9} r="2.8" />
                    ))}
                  </>
                )}
                <path
                  className="o tint"
                  style={paint(color)}
                  d={`M${x} ${GROUND}V${top + 3}a3 3 0 0 1 3-3h${width - 6}a3 3 0 0 1 3 3V${GROUND}z`}
                />
                <path
                  className="tint"
                  style={paint(darker(color, 0.24))}
                  d={`M${x + 0.6} ${top + 4.6}V${top + 3}a2.4 2.4 0 0 1 2.4-2.4h${width - 6}a2.4 2.4 0 0 1 2.4 2.4v1.6z`}
                />
                {Array.from({ length: rows * cols }, (_, i) => {
                  const row = Math.floor(i / cols);
                  const col = i % cols;
                  const lit = litEvery > 0 && (block * 5 + row * 3 + col * 7) % litEvery === 0;
                  return (
                    <rect
                      key={i}
                      className={lit ? 'wn lit' : 'wn'}
                      x={(x + pad + col * 8.4).toFixed(1)}
                      y={top + 9 + row * 10.5}
                      width="4.2"
                      height="5.6"
                      rx="0.9"
                    />
                  );
                })}
                {width >= 30 && (
                  <rect className="tint" style={paint(darker(color, 0.5))} x={x + width / 2 - 3.5} y={GROUND - 10} width="7" height="10" rx="1.8" />
                )}
                <rect className="cap" x={x - 1.6} y={top - 3.4} width={width + 3.2} height="6.6" rx="3.3" />
                {/* 지붕 위의 고양이. 비가 오면 우산을 쓰고, 눈이 오면 목도리를 두르고, 밤에는 눈을 감는다. */}
                {block === CAT_BLOCK && (
                  <g className="cat late" transform={`translate(${x + 9} ${top}) scale(1.32)`}>
                    <g ref={catHopRef} style={HOP_ORIGIN}>
                      <g className="catumb">
                        <path className="ln" d="M10.6 -3.4v-13" />
                        <path className="o" fill="#ff8a65" d="M3.8 -16.2a6.8 6.8 0 0 1 13.6 0z" />
                      </g>
                      <path className="cattail tail" d="M10.5 -0.6c3.4 0.2 4.4 -3 2.6 -5.4" />
                      <path className="o catfur" d="M0.5 0c-0.6 -4.6 1.6 -6.4 4.8 -6.4s5.4 1.8 4.8 6.4z" />
                      <path className="o catfur" d="M1.9 -8.6l-0.5 -3.2 2.7 1.5M8.7 -8.6l0.5 -3.2 -2.7 1.5" />
                      <circle className="o catfur" cx="5.3" cy="-8.4" r="3.5" />
                      <path className="catstripe" d="M4.5 -11.5v1.1M5.3 -11.8v1.2M6.1 -11.5v1.1" />
                      <g ref={catLookRef} className="cateyes">
                        <g className="eyes">
                          <circle cx="4.1" cy="-8.7" r=".62" fill="#4a3526" />
                          <circle cx="6.6" cy="-8.7" r=".62" fill="#4a3526" />
                        </g>
                      </g>
                      <path className="cateyes-shut" d="M3.4 -8.7q.7 .7 1.4 0M5.9 -8.7q.7 .7 1.4 0" />
                      <path d="M5.35 -7.5l-.45 -.5h.9z" fill="#ff8f9c" />
                      <g className="catscarf">
                        <path d="M2.5 -5.5q2.8 1.5 5.6 0" />
                        <path d="M7.2 -5l1 2.6" />
                      </g>
                      <text ref={heartRef} className="heart" x="9" y="-13">
                        ♥
                      </text>
                    </g>
                  </g>
                )}
              </g>
            );
          })}

          {/* 안개: 아래로 짙어지는 김과 끝이 풀리는 띠 */}
          <rect className="haze" fill={`url(#${gradientId}haze)`} x="-240" y="34" width="700" height={GROUND - 34} />
          {[
            [10, 56, 250],
            [150, 72, 290],
            [40, 86, 330],
          ].map(([x, y, width], i) => (
            <rect key={i} className="fogband" fill={`url(#${gradientId}fog)`} style={order(i)} x={x} y={y} width={width} height="13" rx="6.5" />
          ))}

          {/* 땅과 시간 축 */}
          <rect className="tint" style={paint(snowing ? '#f7f9fc' : colors.ground, 1.4)} x="-240" y={GROUND} width="700" height={H - GROUND + 2} />
          <path className="axisline" d={`M-240 ${GROUND}H460`} />
          <g className="late">
            {[9, 12, 15, 18].map((tick) => (
              <g key={tick}>
                <path className="tick" d={`M${xAt(tick)} ${GROUND}v4.5`} />
                {/* 눈금 숫자가 지금 시각 글자와 겹치면(가로 24 안) 숫자는 빼고 눈금만 남긴다. */}
                {(lum.offAxis || Math.abs(xAt(tick) - lum.x) >= 24) && (
                  <text x={xAt(tick)} y={GROUND + 16} textAnchor="middle">
                    {tick}
                  </text>
                )}
              </g>
            ))}
            <text className="nowtxt" x={lum.x.toFixed(1)} y={GROUND + 16} textAnchor="middle">
              {clock(hour)}
            </text>
          </g>

          {/* 밤의 가로등, 눈 오는 날의 눈사람 */}
          <g className="late">
            <circle className="lampglow" cx="196" cy={GROUND - 24} r="12" fill="#ffd45c" />
            <g className="lamp">
              <path className="ln" d={`M196 ${GROUND}v-22m-3.6 0h7.2`} />
              <circle cx="196" cy={GROUND - 24} r="2.3" fill="#ffd45c" stroke="#e3a92c" strokeWidth=".8" />
            </g>
          </g>
          <g className="late" transform={`translate(414 ${GROUND})`}>
            <g className="snowman">
              <circle className="o" cx="0" cy="-5.6" r="5.6" fill="#fff" />
              <circle className="o" cx="0" cy="-13.4" r="3.9" fill="#fff" />
              <circle cx="-1.3" cy="-14.2" r=".6" fill="#3d3a38" />
              <circle cx="1.3" cy="-14.2" r=".6" fill="#3d3a38" />
              <path d="M0 -13.2l3.4 .8-3.4 .7z" fill="#f08a2c" />
              <path className="scarf" d="M-3.4 -10.4q3.4 1.8 6.8 0M2.4 -9.8l1.4 3.4" />
            </g>
          </g>

          <Walker goRef={walkGoRef} doorRef={walkDoorRef} />

          {/* 봄의 꽃잎, 가을의 낙엽 */}
          {[
            [176, 84],
            [304, 82],
            [186, 88],
          ].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <ellipse className="leaf tint" style={{ ...order(i), ...paint(colors.leaf, 0.5) }} rx="1.9" ry="1.1" />
            </g>
          ))}

          {/* 일정 자리에는 깃발이 꽂힌다. 시간 축(06~20시) 밖의 일정은 끝에 몰아 그리면 시각이 틀려 보이므로 그리지 않는다. */}
          {shownFlags.map((flag, i) => {
            const x = xAt(flag.hour).toFixed(1);
            const wet = !lum.offAxis && Boolean(PRECIP[state.wxAtHour(flag.hour)]);
            return (
              <g key={`${flag.hour}-${i}`}>
                <g className="late">
                  <path className="pole" d={`M${x} ${GROUND}v-15`} />
                  <g className="flagwave">
                    <path className="flag" d={`M${x} ${GROUND - 15}l9.4 3-9.4 3.2z`} />
                  </g>
                  <g className={wet ? 'fumb on' : 'fumb'} transform={`translate(${x} ${GROUND - 19})`}>
                    <path d="M-6 0a6 6 0 0 1 12 0z" />
                  </g>
                </g>
                <circle className="ev" cx={x} cy={GROUND} r="3.2">
                  <title>{`${clock(flag.hour)} ${flag.label}`}</title>
                </circle>
              </g>
            );
          })}

          {/* 비 올 때 마우스를 따라다니는 우산 */}
          <g ref={brollyRef} className="brolly">
            <g ref={brollyTiltRef}>
              <path className="ln" d="M0 0v11a2.4 2.4 0 0 1-4.8 0" />
              <path className="o" fill="#ff8a65" d="M-13 0a13 13 0 0 1 26 0q-3.25-3-6.5 0q-3.25-3-6.5 0q-3.25-3-6.5 0q-3.25-3-6.5 0z" />
            </g>
          </g>
        </svg>
        <canvas ref={canvasRef} className="dash-fx" aria-hidden="true" />
      </div>
    </>
  );
}
