/**
 * 대시보드 인사 영역 그림의 계산 — 화면(React)과 떨어져 있는 순수 함수만 둔다.
 *
 * 그림이 말하는 것:
 * - 땅이 오늘의 시간 축이다(06~20시).
 * - 해(밤에는 달)가 지금 시각 위에 떠 있다. 높이는 그날의 일출·일몰을 따른다.
 * - 시간 축 위의 하늘이 오늘의 시간대별 날씨다. 15시부터 비라면 15시 자리부터 비구름이 깔린다.
 *
 * 좌표는 그림(svg viewBox 0 0 440 132)의 단위다.
 */

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'rain' | 'snow' | 'thunder' | 'fog';

/** 사무소 위치의 날씨. 서버가 주기 전에는 없다(없으면 그림은 맑은 날로 그리고 날씨 글자는 내지 않는다). */
export interface SceneWeather {
  /** 지금 날씨 */
  now: WeatherKind;
  /** 오늘 0~23시의 시간대별 날씨. 없으면 지금 날씨가 하루 종일인 것으로 그린다. */
  hourly?: WeatherKind[];
  /** 기온(℃) */
  temp?: number;
  /** 그날의 일출·일몰(0~24의 소수 시각). 없으면 날짜와 위도로 계산한다. */
  sunrise?: number;
  sunset?: number;
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Rgb = [number, number, number];

export const W = 440;
export const H = 132;
export const X0 = 36;
export const XW = 372;
export const GROUND = 104;
export const DAY_START = 6;
export const DAY_END = 20;
/** 해가 가장 높이 올라가는 자리 */
export const SUN_TOP = 27;

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** 시각 → 땅 위의 가로 자리 */
export function xAt(hour: number): number {
  return X0 + ((clamp(hour, DAY_START, DAY_END) - DAY_START) / (DAY_END - DAY_START)) * XW;
}

/** 가로 자리 → 시각 */
export function hourAtX(x: number): number {
  return DAY_START + clamp((x - X0) / XW, 0, 1) * (DAY_END - DAY_START);
}

export function clock(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: '맑음',
  partly: '구름 조금',
  cloudy: '흐림',
  rain: '비',
  snow: '눈',
  thunder: '천둥번개',
  fog: '안개',
};

/** 내리는 것. 천둥번개는 비가 세게 온다. */
export const PRECIP: Partial<Record<WeatherKind, 'rain' | 'snow'>> = { rain: 'rain', thunder: 'rain', snow: 'snow' };
/** 하늘이 덮이는 날씨 */
export const CLOUDED: WeatherKind[] = ['cloudy', 'rain', 'snow', 'thunder'];

/* ------------------------------ 날짜와 해 ------------------------------ */

export function seasonOf(date: Date): Season {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

/** 서울시청. 사무소 좌표를 받기 전에 쓰는 기본 자리다. */
const DEFAULT_LAT = 37.57;
const DEFAULT_LNG = 126.98;

/**
 * 그날의 일출·일몰을 그 기기의 시계 기준 소수 시각으로 돌려준다 (NOAA 근사식, 오차 몇 분).
 * tzHours: UTC와의 차이(시간). 넘기지 않으면 기기의 시간대를 쓴다.
 */
export function sunTimes(
  date: Date,
  lat = DEFAULT_LAT,
  lng = DEFAULT_LNG,
  tzHours = -date.getTimezoneOffset() / 60,
): { sunrise: number; sunset: number } {
  const dayOfYear = Math.round(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 86_400_000,
  );
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 0.5);
  const equation =
    229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const declination =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const latitude = (lat * Math.PI) / 180;
  const cosHourAngle =
    Math.cos((90.833 * Math.PI) / 180) / (Math.cos(latitude) * Math.cos(declination)) - Math.tan(latitude) * Math.tan(declination);
  const hourAngle = (Math.acos(clamp(cosHourAngle, -1, 1)) * 180) / Math.PI;
  const noonMinutes = 720 - 4 * lng - equation;
  return {
    sunrise: (noonMinutes - 4 * hourAngle) / 60 + tzHours,
    sunset: (noonMinutes + 4 * hourAngle) / 60 + tzHours,
  };
}

/** 해의 높이. p는 일출 0 ~ 일몰 1. 지평선에서 빨리 올라와 지붕 위 하늘을 완만하게 지난다(건물 뒤로 숨지 않게). */
export function sunY(p: number): number {
  return Math.max(SUN_TOP + 10 * ((p - 0.5) / 0.5) ** 2, GROUND - 2000 * p * (1 - p));
}

export interface Luminary {
  x: number;
  y: number;
  /** 해가 떠 있는가 (일출 ~ 일몰 직후). 아니면 달이다. */
  sunUp: boolean;
  /** 시간 축(06~20시) 밖인가. 밖이면 한쪽에 떠 있고 '지금' 선은 그리지 않는다. */
  offAxis: boolean;
}

/** 해·달의 자리. 시간 축 안에서는 지금 시각 위다. */
export function luminary(hour: number, sunrise: number, sunset: number): Luminary {
  const offAxis = hour < DAY_START || hour >= DAY_END;
  const sunUp = hour >= sunrise && hour < sunset + 0.25;
  const x = offAxis ? X0 + XW * 0.74 : xAt(hour);
  if (offAxis) return { x, y: 30, sunUp, offAxis };
  if (sunUp) return { x, y: sunY(clamp((hour - sunrise) / (sunset - sunrise), 0, 1)), sunUp, offAxis };
  return { x, y: Math.max(30, GROUND - (hour >= sunset ? hour - sunset - 0.25 : sunrise - hour) * 110), sunUp, offAxis };
}

/* --------------------------------- 색 --------------------------------- */

export function rgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return a.map((value, i) => value + (b[i] - value) * t) as Rgb;
}

export function css(color: Rgb, alpha = 1): string {
  return `rgba(${color.map((value) => Math.round(value)).join(',')},${alpha})`;
}

function luminance(color: Rgb): number {
  return (0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]) / 255;
}

/** 날씨 → 하늘이 물드는 정도(k)와 색 */
const SKY_TINT: Record<WeatherKind, { k: number; a: string; b: string }> = {
  clear: { k: 0, a: '#c4e3fa', b: '#eff8fe' },
  partly: { k: 0.14, a: '#d3e3f1', b: '#f1f6fa' },
  cloudy: { k: 0.62, a: '#d9e0e8', b: '#eef1f4' },
  rain: { k: 0.78, a: '#bccada', b: '#e2e9f0' },
  snow: { k: 0.72, a: '#d6e0ee', b: '#f6f8fc' },
  thunder: { k: 0.88, a: '#a3adc4', b: '#d0d6e2' },
  fog: { k: 0.82, a: '#e7e3da', b: '#f4f1ea' },
};

const NIGHT_SKY: [string, string, number] = ['#1e2450', '#3d4380', 1];

export interface Ambient {
  /** 하늘의 위·아래 색 */
  skyA: Rgb;
  skyB: Rgb;
  /** 어두움: 0 낮 ~ 1 밤 */
  dark: number;
  /** 흐림: 0 맑음 ~ 1 잔뜩 흐림 */
  grey: number;
  /** 판 위 글자의 톤. 판이 어두우면 글자가 밝아진다. */
  tone: 'light' | 'dark';
  /** 해·달 둘레의 빛 */
  glow: string;
  /** 왼쪽 글자 자리를 밝히는 물빛 */
  wash: string;
}

/** 시각과 날씨 → 하늘. 그날의 일출·일몰에 맞춰 새벽·낮·노을·밤이 바뀐다. */
export function ambient(hour: number, wx: WeatherKind, sunrise: number, sunset: number): Ambient {
  const stops: Array<[number, string, string, number]> = [
    [0, ...NIGHT_SKY],
    [sunrise - 1.3, ...NIGHT_SKY],
    [sunrise - 0.1, '#b4c2ea', '#ffd9c7', 0.3],
    [sunrise + 1.4, '#c4e3fa', '#eff8fe', 0],
    [sunset - 1.6, '#c4e3fa', '#eff8fe', 0],
    [sunset - 0.3, '#b9b4e6', '#ffcdae', 0.22],
    [sunset + 0.6, '#5d5f9e', '#c994aa', 0.62],
    [sunset + 1.5, ...NIGHT_SKY],
    [24, ...NIGHT_SKY],
  ];
  let i = 0;
  while (i < stops.length - 2 && hour >= stops[i + 1][0]) i += 1;
  const [h0, a0, b0, d0] = stops[i];
  const [h1, a1, b1, d1] = stops[i + 1];
  const t = clamp((hour - h0) / (h1 - h0), 0, 1);
  const dark = d0 + (d1 - d0) * t;
  const tint = SKY_TINT[wx];
  const skyA = mix(mix(rgb(a0), rgb(a1), t), mix(rgb(tint.a), rgb('#2a2f4d'), dark), tint.k);
  const skyB = mix(mix(rgb(b0), rgb(b1), t), mix(rgb(tint.b), rgb('#3a3f60'), dark), tint.k);
  const tone = luminance(mix(skyA, skyB, 0.5)) < 0.45 ? 'dark' : 'light';
  const sunsetGlow = hour > sunset - 1.6 && hour < sunset + 0.6;
  return {
    skyA,
    skyB,
    dark,
    grey: tint.k,
    tone,
    glow:
      dark > 0.8
        ? css([255, 241, 196], 0.16 * (1 - tint.k))
        : css(sunsetGlow ? [255, 176, 120] : [255, 226, 160], (sunsetGlow ? 0.95 : 0.8) * (1 - dark * 0.6) * (1 - tint.k)),
    wash: tone === 'light' ? css([255, 255, 255], 0.66) : css([30, 36, 80], 0),
  };
}

/** 그림의 색을 지금의 빛으로 물들인다: 밤이면 남색으로, 흐리면 회색으로. k는 물드는 세기. */
export function shade(hex: string, amb: Ambient, k = 1): string {
  return css(mix(mix(rgb(hex), rgb('#262b57'), Math.min(amb.dark * 0.58 * k, 1)), rgb('#aab4c4'), Math.min(amb.grey * 0.2 * k, 1)));
}

export function darker(hex: string, t: number): string {
  return `#${mix(rgb(hex), rgb('#7a5a4a'), t)
    .map((value) => Math.round(value).toString(16).padStart(2, '0'))
    .join('')}`;
}

export const SEASON_COLORS: Record<Season, { tree: [string, string]; ground: string; leaf: string }> = {
  spring: { tree: ['#ffc3d8', '#ffd5e3'], ground: '#dcefc9', leaf: '#ffb3cc' },
  summer: { tree: ['#9fd69b', '#b7e2a8'], ground: '#cfe8bd', leaf: '#9fd69b' },
  autumn: { tree: ['#f6b352', '#ef8f4c'], ground: '#f1e2c0', leaf: '#ef8f4c' },
  winter: { tree: ['#dcd3c8', '#d3cabf'], ground: '#ebeef1', leaf: '#dcd3c8' },
};

/* -------------------------------- 건물 -------------------------------- */

/**
 * [왼쪽, 너비, 높이, 색]. 건물과 구름 사이에 하늘이 보여야 한다. 도구 단추 아래부터 지붕까지가 하늘의 전부라서(세로 약 60),
 * 구름은 그 위쪽 3분의 1에 두고(바닥 y ≈ 22) 가장 높은 지붕은 y 46 아래로 둔다.
 */
export const BLOCKS: Array<[number, number, number, string]> = [
  [55, 31, 38, '#ffe6c7'],
  [91, 26, 52, '#ffd2cf'],
  [124, 38, 30, '#cdeedd'],
  [217, 40, 58, '#cee1fb'],
  [262, 29, 40, '#fff0b6'],
  [329, 36, 48, '#e2d9f8'],
  [369, 26, 32, '#ffdbc0'],
];
/** 먼 건물: [왼쪽, 너비, 높이] */
export const FAR_BLOCKS: Array<[number, number, number]> = [
  [14, 24, 28],
  [150, 26, 44],
  [192, 18, 32],
  [292, 30, 50],
  [352, 20, 36],
  [398, 28, 42],
];
/** 굴뚝이 있는 동, 고양이가 앉는 동 (BLOCKS의 순번) */
export const CHIMNEY_BLOCK = 1;
export const CAT_BLOCK = 5;

/* -------------------------------- 구름 -------------------------------- */

/*
 * 낱개 구름을 같은 간격으로 늘어놓으면 줄에 꿴 구슬처럼 보이고, 한 줄로 이어 붙이면 한 덩어리로 뭉쳐 보인다. 그래서
 *   - 흐림: 길이가 제각각인 구름 덩이 여럿이 틈을 두고 떠 있다. 덩이마다 높이가 조금씩 다르고, 뒤 겹의 덩이가 틈 사이로 보인다.
 *   - 비·눈·천둥번개: 뒤에는 이어진 구름층이 깔리고, 앞에는 긴 덩이들이 좁은 틈을 두고 놓인다.
 *   - 구름 조금: 크기가 뚜렷이 다른 구름 몇 점을 높이를 달리해 띄운다.
 * 덩이의 바닥은 거의 평평하고 위는 몽글몽글하다. 구름은 그 날씨가 예보된 시간대의 가로 범위에만 깔린다.
 */
export const CLOUD_SHAPES = {
  a: 'M-13 8a7 7 0 0 1-1-13.9a9.5 9.5 0 0 1 18-3a7.5 7.5 0 0 1 9.5 7a5.6 5.6 0 0 1-1.5 9.9z',
  b: 'M-17 7a5.5 5.5 0 0 1 .5-11a7 7 0 0 1 12.5-3.5a8.5 8.5 0 0 1 15 2.5a6 6 0 0 1 4 12z',
  c: 'M-9 5a4.5 4.5 0 0 1 0-9a6.5 6.5 0 0 1 12-1.5a5 5 0 0 1 5.5 10.5z',
};

/** '구름 조금'에 뜨는 낱개 구름. h: 그 구름의 시각 */
export const LOOSE_CLOUDS: Array<{ h: number; y: number; s: number; shape: keyof typeof CLOUD_SHAPES; flip?: boolean }> = [
  { h: 8.9, y: 16, s: 1, shape: 'b' },
  { h: 12.4, y: 10, s: 0.7, shape: 'c', flip: true },
  { h: 15.9, y: 14, s: 0.84, shape: 'a', flip: true },
  { h: 18.4, y: 20, s: 0.6, shape: 'c' },
];

/** [앞 겹, 뒤 겹]의 색 */
export const DECK_TONE: Record<'cloudy' | 'rain' | 'snow' | 'thunder', [string, string]> = {
  cloudy: ['#ffffff', '#f0f4f8'],
  rain: ['#e6ecf4', '#ccd6e3'],
  snow: ['#ffffff', '#e8edf4'],
  thunder: ['#c3cbd9', '#a3aec3'],
};

/** 구름 덩이 하나의 외곽선. 아래는 완만한 물결, 위는 크기가 제각각인 봉우리. (x1~x2: 가로 범위, yb: 바닥, yt: 봉우리 밑선) */
export function bandPath(x1: number, x2: number, yb: number, yt: number, seed: number): string {
  const bottomWidths = [34, 26, 40, 30, 44, 28];
  const bottomDepths = [5.5, 4.5, 6, 5, 6.5, 5];
  const topWidths = [30, 22, 36, 26, 40, 24, 32];
  const topHeights = [11, 8, 13, 9, 12, 8, 10];
  const topOffsets = [0, 3, -2, 2, -1, 4, 1];
  const left = x1 + 9;
  const right = x2 - 9;
  let d = `M${left.toFixed(1)} ${yb}`;
  let x = left;
  let i = seed;
  // 바닥: 왼쪽 → 오른쪽
  while (x < right - 0.1) {
    let width = bottomWidths[i % 6];
    if (right - x - width < 14) width = right - x;
    x += width;
    d += `A${(width * 0.56).toFixed(1)} ${bottomDepths[i % 6]} 0 0 0 ${x.toFixed(1)} ${yb}`;
    i += 1;
  }
  let y = yt + topOffsets[seed % 7];
  const rightCap = (yb - y) / 2;
  d += `A${(rightCap * 1.15).toFixed(1)} ${rightCap.toFixed(1)} 0 0 0 ${right.toFixed(1)} ${y}`;
  i = seed;
  // 위: 오른쪽 → 왼쪽
  while (x > left + 0.1) {
    let width = topWidths[i % 7];
    if (x - left - width < 12) width = x - left;
    x -= width;
    i += 1;
    y = yt + topOffsets[i % 7];
    d += `A${(width * 0.53).toFixed(1)} ${topHeights[i % 7]} 0 0 0 ${x.toFixed(1)} ${y}`;
  }
  const leftCap = (yb - y) / 2;
  return `${d}A${(leftCap * 1.15).toFixed(1)} ${leftCap.toFixed(1)} 0 0 0 ${left.toFixed(1)} ${yb}Z`;
}

interface MassConfig {
  w: number[];
  gap: number[];
  yb: number[];
  yt: number[];
}

const MASS: Record<'looseFront' | 'looseBack' | 'denseFront', MassConfig> = {
  // 흐림: 덩이 사이로 하늘이 보인다
  looseFront: { w: [84, 58, 104, 66, 92], gap: [15, 21, 13, 19], yb: [22, 19, 24, 20, 23], yt: [12, 10, 14, 9, 13] },
  looseBack: { w: [70, 98, 56, 82], gap: [36, 27, 42], yb: [16, 18, 15, 17], yt: [5, 8, 4, 7] },
  // 비·눈: 긴 덩이가 좁은 틈으로 놓이고 그 뒤를 이어진 층이 메운다
  denseFront: { w: [128, 96, 150, 110], gap: [6, 8, 5], yb: [23, 21, 24, 22], yt: [12, 10, 13, 11] },
};

/** 덩이 여럿을 한 경로로. 가로 범위를 길이와 틈으로 나누고 덩이마다 바닥·봉우리 높이를 달리한다. */
function massPath(x1: number, x2: number, config: MassConfig, seed: number): string {
  let d = '';
  let x = x1;
  let i = seed;
  while (x < x2 - 30) {
    let width = config.w[i % config.w.length];
    if (x2 - (x + width) < 50) width = x2 - x; // 끝에 자투리 덩이가 남지 않게
    d += bandPath(x, x + width, config.yb[i % config.yb.length], config.yt[i % config.yt.length], i);
    x += width + config.gap[i % config.gap.length];
    i += 1;
  }
  return d;
}

export interface CloudDeck {
  kind: 'cloudy' | 'rain' | 'snow' | 'thunder';
  h1: number;
  h2: number;
  x1: number;
  x2: number;
  front: string;
  back: string;
}

/** 같은 날씨가 이어지는 시간대를 한 묶음으로 묶어, 그 가로 범위에 깔 구름을 만든다. */
export function cloudDecks(wxAtHour: (hour: number) => WeatherKind): CloudDeck[] {
  const spans: Array<{ kind: CloudDeck['kind']; h1: number; h2: number }> = [];
  for (let hour = DAY_START; hour < DAY_END; hour += 1) {
    const wx = wxAtHour(hour);
    if (!CLOUDED.includes(wx)) continue;
    const kind = wx as CloudDeck['kind'];
    const last = spans[spans.length - 1];
    if (last && last.kind === kind && last.h2 === hour) last.h2 = hour + 1;
    else spans.push({ kind, h1: hour, h2: hour + 1 });
  }
  return spans.map(({ kind, h1, h2 }) => {
    const x1 = h1 === DAY_START ? -70 : xAt(h1) - 12;
    const x2 = h2 === DAY_END ? 470 : xAt(h2) + 12;
    const loose = kind === 'cloudy';
    return {
      kind,
      h1,
      h2,
      x1,
      x2,
      front: massPath(x1, x2, loose ? MASS.looseFront : MASS.denseFront, h1),
      back: loose ? massPath(x1 - 34, x2 + 20, MASS.looseBack, h1 + 2) : bandPath(x1 - 16, x2 + 12, 18, 5, h1 + 3),
    };
  });
}

/* ------------------------------ 한 장면 ------------------------------ */

export interface SceneState {
  hour: number;
  season: Season;
  sunrise: number;
  sunset: number;
  /** 지금 날씨 (날씨를 모르면 맑음으로 그린다) */
  wx: WeatherKind;
  /** 그 시각의 날씨. 시간 축 밖의 시각에는 지금 날씨가 전체에 깔린다. */
  wxAtHour: (hour: number) => WeatherKind;
  lum: Luminary;
  amb: Ambient;
  decks: CloudDeck[];
}

/** 시각·날짜·날씨에서 그림에 필요한 값을 한 번에 구한다. */
export function sceneState(hour: number, date: Date, weather?: SceneWeather): SceneState {
  const computed = sunTimes(date);
  const sunrise = weather?.sunrise ?? computed.sunrise;
  const sunset = weather?.sunset ?? computed.sunset;
  const lum = luminary(hour, sunrise, sunset);
  const now = weather?.now ?? 'clear';
  const hourly = weather?.hourly;
  const wxAtHour = (h: number): WeatherKind =>
    lum.offAxis ? now : (hourly?.[clamp(Math.floor(h), 0, 23)] ?? now);
  // 시간대별 값이 있으면 지금 시각의 값이 '지금 날씨'다.
  const wx = lum.offAxis ? now : (hourly?.[clamp(Math.floor(hour), 0, 23)] ?? now);
  return {
    hour,
    season: seasonOf(date),
    sunrise,
    sunset,
    wx,
    wxAtHour,
    lum,
    amb: ambient(hour, wx, sunrise, sunset),
    decks: cloudDecks(wxAtHour),
  };
}

/** 그림의 가로 자리에 내리는 것 */
export function precipAtX(state: SceneState, x: number): { kind: 'rain' | 'snow'; heavy: boolean } | null {
  const wx = state.wxAtHour(hourAtX(x));
  const kind = PRECIP[wx];
  return kind ? { kind, heavy: wx === 'thunder' } : null;
}

/** 지금 내리고 있거나 오늘 시간 축 어딘가에 내리는가 (비·눈을 그릴 필요가 있는가) */
export function hasPrecip(state: SceneState): boolean {
  if (PRECIP[state.wx]) return true;
  return state.decks.some((deck) => deck.kind !== 'cloudy');
}
