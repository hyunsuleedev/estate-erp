(() => {
  'use strict';

  const RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W = 440;
  const H = 132;
  const X0 = 36;
  const XW = 372;
  const GROUND = 104;
  const DAY_START = 6;
  const DAY_END = 20;
  const SUN_TOP = 27;

  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const xAt = (h) => X0 + ((clamp(h, DAY_START, DAY_END) - DAY_START) / (DAY_END - DAY_START)) * XW;
  const hourAtX = (x) => DAY_START + clamp((x - X0) / XW, 0, 1) * (DAY_END - DAY_START);
  const sunY = (p) => Math.max(SUN_TOP + 10 * ((p - 0.5) / 0.5) ** 2, GROUND - 2000 * p * (1 - p));
  const clock = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const css = (c, alpha = 1) => `rgba(${c.map((v) => Math.round(v)).join(',')},${alpha})`;
  const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

  const NIGHT = ['#1e2450', '#3d4380', 1];
  const stops = (sr, ss) => [
    [0, ...NIGHT],
    [sr - 1.3, ...NIGHT],
    [sr - 0.1, '#b4c2ea', '#ffd9c7', 0.3],
    [sr + 1.4, '#c4e3fa', '#eff8fe', 0],
    [ss - 1.6, '#c4e3fa', '#eff8fe', 0],
    [ss - 0.3, '#b9b4e6', '#ffcdae', 0.22],
    [ss + 0.6, '#5d5f9e', '#c994aa', 0.62],
    [ss + 1.5, ...NIGHT],
    [24, ...NIGHT],
  ];

  const WX = {
    clear: { label: '맑음', k: 0, a: '#c4e3fa', b: '#eff8fe' },
    partly: { label: '구름 조금', k: 0.14, a: '#d3e3f1', b: '#f1f6fa' },
    cloudy: { label: '흐림', k: 0.62, a: '#d9e0e8', b: '#eef1f4' },
    rain: { label: '비', k: 0.78, a: '#bccada', b: '#e2e9f0' },
    snow: { label: '눈', k: 0.72, a: '#d6e0ee', b: '#f6f8fc' },
    thunder: { label: '천둥번개', k: 0.88, a: '#a3adc4', b: '#d0d6e2' },
    fog: { label: '안개', k: 0.82, a: '#e7e3da', b: '#f4f1ea' },
  };
  const PRECIP = { rain: 'rain', thunder: 'rain', snow: 'snow' };
  const CLOUDED = ['cloudy', 'rain', 'snow', 'thunder'];

  const allHours = (wx) => Array.from({ length: 24 }, () => wx);
  const PRESETS = {
    clear: { name: '맑음', temp: 14, hourly: allHours('clear') },
    partly: { name: '구름 조금', temp: 13, hourly: allHours('partly') },
    cloudy: { name: '흐림', temp: 11, hourly: allHours('cloudy') },
    rain: { name: '비', temp: 9, hourly: allHours('rain') },
    snow: { name: '눈', temp: -2, hourly: allHours('snow') },
    thunder: { name: '천둥번개', temp: 10, hourly: allHours('thunder') },
    fog: { name: '안개', temp: 7, hourly: allHours('fog') },
    mixed: {
      name: '오후부터 비',
      temp: 13,
      hourly: Array.from({ length: 24 }, (_, h) => (h < 11 ? 'clear' : h < 13 ? 'partly' : h < 15 ? 'cloudy' : 'rain')),
    },
  };

  const SEASONS = {
    spring: { name: '봄', tree: ['#ffc3d8', '#ffd5e3'], ground: '#dcefc9', leaf: '#ffb3cc', sr: 6.2, ss: 18.8 },
    summer: { name: '여름', tree: ['#9fd69b', '#b7e2a8'], ground: '#cfe8bd', leaf: '#9fd69b', sr: 5.3, ss: 19.8 },
    autumn: { name: '가을', tree: ['#f6b352', '#ef8f4c'], ground: '#f1e2c0', leaf: '#ef8f4c', sr: 7.1, ss: 17.4 },
    winter: { name: '겨울', tree: ['#dcd3c8', '#d3cabf'], ground: '#ebeef1', leaf: '#dcd3c8', sr: 7.7, ss: 17.3 },
  };

  const seasonOf = (d) =>
    ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][
      d.getMonth()
    ];

  const BLOCKS = [
    [55, 31, 38, '#ffe6c7'],
    [91, 26, 52, '#ffd2cf'],
    [124, 38, 30, '#cdeedd'],
    [217, 40, 58, '#cee1fb'],
    [262, 29, 40, '#fff0b6'],
    [329, 36, 48, '#e2d9f8'],
    [369, 26, 32, '#ffdbc0'],
  ];
  const FAR = [
    [14, 24, 28],
    [150, 26, 44],
    [192, 18, 32],
    [292, 30, 50],
    [352, 20, 36],
    [398, 28, 42],
  ];

  const CLOUD_SHAPES = {
    a: 'M-13 8a7 7 0 0 1-1-13.9a9.5 9.5 0 0 1 18-3a7.5 7.5 0 0 1 9.5 7a5.6 5.6 0 0 1-1.5 9.9z',
    b: 'M-17 7a5.5 5.5 0 0 1 .5-11a7 7 0 0 1 12.5-3.5a8.5 8.5 0 0 1 15 2.5a6 6 0 0 1 4 12z',
    c: 'M-9 5a4.5 4.5 0 0 1 0-9a6.5 6.5 0 0 1 12-1.5a5 5 0 0 1 5.5 10.5z',
  };
  const CLOUD = CLOUD_SHAPES.a;
  const CLOUDS = [
    { h: 8.9, y: 16, s: 1, shape: 'b' },
    { h: 12.4, y: 10, s: 0.7, shape: 'c', flip: 1 },
    { h: 15.9, y: 14, s: 0.84, shape: 'a', flip: 1 },
    { h: 18.4, y: 20, s: 0.6, shape: 'c' },
  ];
  const DECK_TONE = {
    cloudy: ['#ffffff', '#f0f4f8'],
    rain: ['#e6ecf4', '#ccd6e3'],
    snow: ['#ffffff', '#e8edf4'],
    thunder: ['#c3cbd9', '#a3aec3'],
  };

  function bandPath(x1, x2, yb, yt, seed) {
    const BW = [34, 26, 40, 30, 44, 28];
    const BD = [5.5, 4.5, 6, 5, 6.5, 5];
    const TW = [30, 22, 36, 26, 40, 24, 32];
    const TD = [11, 8, 13, 9, 12, 8, 10];
    const TY = [0, 3, -2, 2, -1, 4, 1];
    const L = x1 + 9;
    const R = x2 - 9;
    let d = `M${L.toFixed(1)} ${yb}`;
    let x = L;
    let i = seed;
    while (x < R - 0.1) {
      let w = BW[i % 6];
      if (R - x - w < 14) w = R - x;
      x += w;
      d += `A${(w * 0.56).toFixed(1)} ${BD[i % 6]} 0 0 0 ${x.toFixed(1)} ${yb}`;
      i++;
    }
    let y = yt + TY[seed % 7];
    const cap = (yb - y) / 2;
    d += `A${(cap * 1.15).toFixed(1)} ${cap.toFixed(1)} 0 0 0 ${R.toFixed(1)} ${y}`;
    i = seed;
    while (x > L + 0.1) {
      let w = TW[i % 7];
      if (x - L - w < 12) w = x - L;
      x -= w;
      i++;
      y = yt + TY[i % 7];
      d += `A${(w * 0.53).toFixed(1)} ${TD[i % 7]} 0 0 0 ${x.toFixed(1)} ${y}`;
    }
    const cap2 = (yb - y) / 2;
    return `${d}A${(cap2 * 1.15).toFixed(1)} ${cap2.toFixed(1)} 0 0 0 ${L.toFixed(1)} ${yb}Z`;
  }

  function massPath(x1, x2, cfg, seed) {
    let d = '';
    let x = x1;
    let i = seed;
    while (x < x2 - 30) {
      let w = cfg.w[i % cfg.w.length];
      if (x2 - (x + w) < 50) w = x2 - x;
      d += bandPath(x, x + w, cfg.yb[i % cfg.yb.length], cfg.yt[i % cfg.yt.length], i);
      x += w + cfg.gap[i % cfg.gap.length];
      i++;
    }
    return d;
  }

  const MASS = {
    looseFront: { w: [84, 58, 104, 66, 92], gap: [15, 21, 13, 19], yb: [22, 19, 24, 20, 23], yt: [12, 10, 14, 9, 13] },
    looseBack: { w: [70, 98, 56, 82], gap: [36, 27, 42], yb: [16, 18, 15, 17], yt: [5, 8, 4, 7] },
    denseFront: { w: [128, 96, 150, 110], gap: [6, 8, 5], yb: [23, 21, 24, 22], yt: [12, 10, 13, 11] },
  };

  const WALKER_SCALE = 1.1;
  const WALK_SPEED = (13 / 1.1) * WALKER_SCALE;
  const DOORS = BLOCKS.flatMap(([x, w], b) => (w >= 30 ? [[b, x + w / 2]] : []));
  const darker = (hex, t) =>
    '#' +
    mix(rgb(hex), rgb('#7a5a4a'), t)
      .map((v) => Math.round(v).toString(16).padStart(2, '0'))
      .join('');

  const ICON = {
    clear:
      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    night: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    partly:
      '<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.947 12.65a4 4 0 0 0-5.925-4.128M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
    cloudy: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    rain: '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M16 14v6M8 14v6M12 16v6"/>',
    snow: '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01"/>',
    thunder: '<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973M13 12l-3 5h4l-3 5"/>',
    fog: '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M16 17H7M17 21H9"/>',
  };

  function catMarkup(x, top) {
    return `<g class="cat late" data-role="cat" transform="translate(${x} ${top}) scale(1.32)"><g data-role="catHop" style="transform-box:fill-box;transform-origin:50% 100%">
      <g class="catumb"><path class="ln" d="M10.6 -3.4v-13"/><path class="o" fill="#ff8a65" d="M3.8 -16.2a6.8 6.8 0 0 1 13.6 0z"/></g>
      <path class="o catfur tail" d="M10.5 -0.6c3.4 0.2 4.4 -3 2.6 -5.4" style="fill:none;stroke:#c98a4a;stroke-width:1.9"/>
      <path class="o catfur" d="M0.5 0c-0.6 -4.6 1.6 -6.4 4.8 -6.4s5.4 1.8 4.8 6.4z"/>
      <path class="o catfur" d="M1.9 -8.6l-0.5 -3.2 2.7 1.5M8.7 -8.6l0.5 -3.2 -2.7 1.5"/>
      <circle class="o catfur" cx="5.3" cy="-8.4" r="3.5"/>
      <path d="M4.5 -11.5v1.1M5.3 -11.8v1.2M6.1 -11.5v1.1" fill="none" stroke="#c98a4a" stroke-width=".7" stroke-linecap="round"/>
      <g class="cateyes look"><g class="eyes"><circle cx="4.1" cy="-8.7" r=".62" fill="#4a3526"/><circle cx="6.6" cy="-8.7" r=".62" fill="#4a3526"/></g></g>
      <path class="cateyes-shut" d="M3.4 -8.7q.7 .7 1.4 0M5.9 -8.7q.7 .7 1.4 0" fill="none" stroke="#4a3526" stroke-width=".7" stroke-linecap="round"/>
      <path d="M5.35 -7.5l-.45 -.5h.9z" fill="#ff8f9c"/>
      <g class="catscarf"><path d="M2.5 -5.5q2.8 1.5 5.6 0" fill="none" stroke="#e85d5d" stroke-width="1.7" stroke-linecap="round"/><path d="M7.2 -5l1 2.6" fill="none" stroke="#e85d5d" stroke-width="1.7" stroke-linecap="round"/></g>
      <text class="heart" data-role="heart" x="9" y="-13">♥</text>
    </g></g>`;
  }

  function greetingText(h, userName) {
    let base = '오늘도 수고 많으셨어요';
    if (h < 5) base = '늦은 시간까지 수고 많으세요';
    else if (h < 12) base = '좋은 아침이에요';
    else if (h < 18) base = '좋은 오후예요';
    return userName ? `${base}, ${userName}님` : base;
  }

  function mountDashHero(containerEl, options = {}) {
    if (!containerEl) throw new Error('mountDashHero requires a container element');

    const nowDate = options.now instanceof Date ? options.now : new Date();
    const realHour = () => {
      const d = new Date();
      return d.getHours() + d.getMinutes() / 60;
    };

    const state = {
      officeName: options.officeName || '고덕퍼스트공인중개사사무소',
      userName: options.userName || '현수',
      scope: options.scope || 'mine',
      preset: options.preset || 'clear',
      hour: typeof options.hour === 'number' ? options.hour : realHour(),
      season: options.season || seasonOf(nowDate),
      counts: {
        events: options.counts?.events ?? 3,
        tasks: options.counts?.tasks ?? 5,
        overdue: options.counts?.overdue ?? 2,
      },
      flags: Array.isArray(options.flags)
        ? options.flags.slice()
        : [
            { hour: 10.5, label: '고객 미팅 · 한지우' },
            { hour: 15, label: '임장 · 고덕그라시움 104동' },
            { hour: 17.5, label: '계약서 검토 · 아르테온 1203호' },
          ],
      sweeping: false,
    };

    containerEl.innerHTML = `
      <header class="dash-hero play" data-tone="light">
        <div class="dash-sky"></div>
        <div class="dash-flash" data-role="flash"></div>
        <div class="dash-vista">
          <svg class="dash-scene" id="scene" viewBox="0 0 440 132" role="img" aria-label="오늘의 시간 축과 날씨"></svg>
          <canvas class="dash-fx" id="fx"></canvas>
        </div>

        <div class="dash-copy">
          <p class="dash-dateline dash-up" style="--d:0">
            <span data-role="dateText"></span><span class="dash-sep">·</span><span>${state.officeName}</span><span class="dash-sep">·</span>
            <span class="dash-wxchip" data-role="wxchip"></span>
          </p>
          <h1 class="dash-title" data-role="title"></h1>
          <div class="dash-pins">
            <button class="dash-pin dash-up" style="--d:5" type="button" data-pin="schedule">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>오늘 일정 <b data-count="events">${state.counts.events}</b>
            </button>
            <button class="dash-pin dash-up" style="--d:6" type="button" data-pin="today">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17M11 6h10M11 12h10M11 18h10"/></svg>남은 업무 <b data-count="tasks">${state.counts.tasks}</b>
            </button>
            <button class="dash-pin dash-up" style="--d:7" type="button" data-pin="overdue">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3L2 6M22 6l-3-3"/></svg>기한 지남 <b data-count="overdue" class="${state.counts.overdue > 0 ? 'bad' : ''}">${state.counts.overdue}</b>
            </button>
          </div>
        </div>

        <div class="dash-tools dash-up" style="--d:3">
          <div class="dash-scope" role="group" aria-label="표시 범위">
            <button type="button" data-scope="mine" aria-pressed="${state.scope === 'mine'}">내 담당</button>
            <button type="button" data-scope="all" aria-pressed="${state.scope === 'all'}">사무소 전체</button>
          </div>
          <button type="button" class="dash-quick" data-role="quickCreate">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>새로 만들기
          </button>
        </div>
      </header>
    `;

    const $ = (sel, root = containerEl) => root.querySelector(sel);
    const $$ = (sel, root = containerEl) => [...root.querySelectorAll(sel)];

    const hero = $('.dash-hero');
    const scene = $('#scene');
    const fx = $('#fx');
    const flash = $('[data-role="flash"]');
    const titleEl = $('[data-role="title"]');
    const dateTextEl = $('[data-role="dateText"]');
    const wxchipEl = $('[data-role="wxchip"]');
    const pinTasks = $('[data-pin="today"]');

    dateTextEl.textContent = nowDate.toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });

    function renderGreeting(animate = true) {
      const text = greetingText(Math.floor(state.hour), state.userName);
      const words = text.split(' ');
      if (animate) {
        titleEl.innerHTML = words
          .map((w, i) => `<span class="dash-up" style="--d:${1 + i};display:inline-block">${w}</span>`)
          .join(' ');
      } else {
        titleEl.textContent = text;
      }
    }
    renderGreeting(true);

    const offAxis = () => state.hour < DAY_START || state.hour >= DAY_END;
    const sunUp = () => {
      const { sr, ss } = SEASONS[state.season];
      return state.hour >= sr && state.hour < ss + 0.25;
    };
    const isNight = () => !sunUp();
    const wxAtHour = (h) => PRESETS[state.preset].hourly[clamp(Math.floor(h), 0, 23)];
    const wxNow = () => wxAtHour(state.hour);
    const precipAtX = (x) => {
      const wx = offAxis() ? wxNow() : wxAtHour(hourAtX(x));
      return PRECIP[wx] ? { kind: PRECIP[wx], heavy: wx === 'thunder' } : null;
    };

    function luminary(hour) {
      const { sr, ss } = SEASONS[state.season];
      const off = hour < DAY_START || hour >= DAY_END;
      const x = off ? X0 + XW * 0.74 : xAt(hour);
      if (hour >= sr && hour < ss + 0.25 && !off) return { x, y: sunY(clamp((hour - sr) / (ss - sr), 0, 1)) };
      if (off) return { x, y: 30 };
      return { x, y: Math.max(30, GROUND - (hour >= ss ? hour - ss - 0.25 : sr - hour) * 110) };
    }

    function ambient(hour, wx) {
      const { sr, ss } = SEASONS[state.season];
      const STOPS = stops(sr, ss);
      let i = 0;
      while (i < STOPS.length - 2 && hour >= STOPS[i + 1][0]) i++;
      const [h0, a0, b0, d0] = STOPS[i];
      const [h1, a1, b1, d1] = STOPS[i + 1];
      const t = clamp((hour - h0) / (h1 - h0), 0, 1);
      const dark = d0 + (d1 - d0) * t;
      const w = WX[wx];
      const A = mix(mix(rgb(a0), rgb(a1), t), mix(rgb(w.a), rgb('#2a2f4d'), dark), w.k);
      const B = mix(mix(rgb(b0), rgb(b1), t), mix(rgb(w.b), rgb('#3a3f60'), dark), w.k);
      const tone = lum(mix(A, B, 0.5)) < 0.45 ? 'dark' : 'light';
      const sunset = hour > ss - 1.6 && hour < ss + 0.6 ? 1 : 0;
      return {
        A,
        B,
        dark,
        grey: w.k,
        tone,
        glow:
          dark > 0.8
            ? css([255, 241, 196], 0.16 * (1 - w.k))
            : css(sunset ? [255, 176, 120] : [255, 226, 160], (sunset ? 0.95 : 0.8) * (1 - dark * 0.6) * (1 - w.k)),
        wash: tone === 'light' ? css([255, 255, 255], 0.66) : css([30, 36, 80], 0),
      };
    }

    const shade = (hex, amb, k = 1) =>
      css(mix(mix(rgb(hex), rgb('#262b57'), amb.dark * 0.58 * k), rgb('#aab4c4'), amb.grey * 0.2 * k));

    function renderFlagsMarkup() {
      return state.flags
        .filter((e) => e.hour >= DAY_START && e.hour <= DAY_END)
        .map((e) => {
          const x = xAt(e.hour).toFixed(1);
          return `<g><g class="late"><path class="pole" d="M${x} ${GROUND}v-15"/><g class="flagwave"><path class="flag" d="M${x} ${GROUND - 15}l9.4 3-9.4 3.2z"/></g>
            <g class="fumb" data-h="${e.hour}" transform="translate(${x} ${GROUND - 19})"><path d="M-6 0a6 6 0 0 1 12 0z" fill="#ff8a65" stroke="rgba(64,48,40,.5)" stroke-width="1"/></g></g>
            <circle class="ev" cx="${x}" cy="${GROUND}" r="3.2"><title>${clock(e.hour)} ${e.label}</title></circle></g>`;
        })
        .join('');
    }

    function buildScene() {
      let s = `<defs>
        <linearGradient id="fogG"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".3" stop-color="#fff"/><stop offset=".7" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <linearGradient id="hazeG" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f4f1ea" stop-opacity="0"/><stop offset="1" stop-color="#f4f1ea" stop-opacity=".9"/></linearGradient>
      </defs>`;

      s +=
        '<g class="par" data-depth="0.25">' +
        [
          [60, 20],
          [112, 9],
          [150, 30],
          [200, 14],
          [250, 6],
          [300, 18],
          [345, 34],
          [400, 12],
        ]
          .map(
            ([x, y], i) =>
              `<path class="star" style="--i:${i}" d="M${x} ${y - 2.2}l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7z"/>`,
          )
          .join('') +
        '</g>';

      s += `<g class="par" data-depth="0.5"><g class="drifter"><path class="wisp" transform="translate(0 12)" d="M0 8a5 5 0 0 1 5-5 8 8 0 0 1 15 1 5 5 0 0 1 3 9H4a5 5 0 0 1-4-5z"/></g>
        <g class="drifter b"><path class="wisp" transform="translate(0 30) scale(.7)" d="M0 8a5 5 0 0 1 5-5 8 8 0 0 1 15 1 5 5 0 0 1 3 9H4a5 5 0 0 1-4-5z"/></g></g>`;

      s +=
        '<g class="par far" data-depth="0.35">' +
        FAR.map(
          ([x, w, h]) =>
            `<path data-c="far" d="M${x} ${GROUND}V${GROUND - h + 3}a3 3 0 0 1 3-3h${w - 6}a3 3 0 0 1 3 3V${GROUND}z"/>`,
        ).join('') +
        '</g>';

      s += '<g class="late"><path class="nowline" data-role="nowline"/></g>';

      s += `<g class="lum" data-role="lum"><g class="par" data-depth="0.6"><g data-role="hopper" style="transform-box:fill-box;transform-origin:50% 100%"><g class="bobber">
        <g class="sun">
          <g class="rays">${Array.from({ length: 8 }, (_, i) => `<path class="ray" transform="rotate(${i * 45})" d="M0 -15v-3.6"/>`).join('')}</g>
          <circle class="sunc" r="11"/>
        </g>
        <g class="moon"><path class="moonc" d="M5 -10a11 11 0 1 0 7 18a9 9 0 0 1-7-18z"/></g>
        <g class="bigcloud"><path class="cloud" data-c="cloud" d="${CLOUD}" transform="scale(1.08)"/></g>
      </g></g></g></g>`;

      const deckSlots = (cls) =>
        [0, 1, 2]
          .map((i) => `<g class="deck ${cls}" data-i="${i}"><g class="deckdrift"><path class="cloud" data-c="cloud" d=""/></g></g>`)
          .join('');
      s += `<g class="par" data-depth="0.5">${deckSlots('back')}</g>`;
      s +=
        `<g class="par" data-depth="0.85">${deckSlots('front')}` +
        CLOUDS.map(
          (c, i) =>
            `<g class="slot" data-i="${i}" style="--i:${i}"><g transform="translate(${xAt(c.h).toFixed(1)} ${c.y})"><g class="cbob" style="--i:${i}"><g transform="scale(${c.flip ? -c.s : c.s} ${c.s})"><path class="cloud" data-c="#ffffff" d="${CLOUD_SHAPES[c.shape]}"/></g></g></g></g>`,
        ).join('') +
        '</g>';
      s += '<g class="par" data-depth="0.8"><path class="bolt" data-role="bolt" d="M3 0l-7 11h5l-3 10 9-13h-5l4-8z"/></g>';

      s += '<g class="late bird" transform="translate(0 34)"><g class="birdfly"><path class="ln" d="M0 0q3.6 -4 6 0q2.4 -4 6 0"/></g></g>';

      [181, 307].forEach((x, i) => {
        s += `<g class="sway ${i ? 'b' : ''}"><path class="ln" d="M${x} ${GROUND}v-10"/><circle class="o" data-c="tree${i}" cx="${x}" cy="${GROUND - 15}" r="7.4"/>
          <path class="cap" d="M${x - 6.6} ${GROUND - 17.4}a6.9 6.9 0 0 1 13.2 0q-3.3 2.4 -6.6 .6t-6.6 -.6z"/></g>`;
      });

      BLOCKS.forEach(([x, w, h, color], b) => {
        const top = GROUND - h;
        const cols = Math.floor((w - 7) / 8.4);
        const rows = Math.floor((h - 12) / 10.5);
        const pad = (w - cols * 8.4 + 4.2) / 2;
        let g = `<g class="bld" data-block="${b}" style="--i:${b}">`;
        if (b === 1) {
          g +=
            `<path class="o" data-c="${darker(color, 0.3)}" d="M${x + 15} ${top + 1}v-6h5v6z"/>` +
            [0, 1, 2].map((i) => `<circle class="puff" style="--i:${i}" cx="${x + 17.5}" cy="${top - 9}" r="2.8"/>`).join('');
        }
        g += `<path class="o" data-c="${color}" d="M${x} ${GROUND}V${top + 3}a3 3 0 0 1 3-3h${w - 6}a3 3 0 0 1 3 3V${GROUND}z"/>`;
        g += `<path data-c="${darker(color, 0.24)}" d="M${x + 0.6} ${top + 4.6}V${top + 3}a2.4 2.4 0 0 1 2.4-2.4h${w - 6}a2.4 2.4 0 0 1 2.4 2.4v1.6z"/>`;
        for (let i = 0; i < rows * cols; i++) {
          const row = Math.floor(i / cols);
          const col = i % cols;
          g += `<rect class="wn" data-k="${b * 5 + row * 3 + col * 7}" x="${(x + pad + col * 8.4).toFixed(1)}" y="${top + 9 + row * 10.5}" width="4.2" height="5.6" rx="0.9"/>`;
        }
        if (w >= 30) g += `<rect data-c="${darker(color, 0.5)}" x="${x + w / 2 - 3.5}" y="${GROUND - 10}" width="7" height="10" rx="1.8"/>`;
        g += `<rect class="cap" x="${x - 1.6}" y="${top - 3.4}" width="${w + 3.2}" height="6.6" rx="3.3"/>`;
        if (b === 5) g += catMarkup(x + 9, top);
        g += '</g>';
        s += g;
      });

      s += `<rect class="haze" x="-240" y="34" width="700" height="${GROUND - 34}"/>`;
      s += [
        [10, 56, 250],
        [150, 72, 290],
        [40, 86, 330],
      ]
        .map(([x, y, w], i) => `<rect class="fogband" style="--i:${i}" x="${x}" y="${y}" width="${w}" height="13" rx="6.5"/>`)
        .join('');

      s += `<rect data-c="ground" x="-240" y="${GROUND}" width="700" height="${H - GROUND + 2}"/>`;
      s += `<path class="axisline" d="M-240 ${GROUND}H460"/>`;
      s +=
        '<g class="late">' +
        [9, 12, 15, 18]
          .map(
            (t) =>
              `<path class="tick" d="M${xAt(t)} ${GROUND}v4.5"/><text class="ticktxt" data-h="${t}" x="${xAt(t)}" y="${GROUND + 16}" text-anchor="middle">${t}</text>`,
          )
          .join('') +
        `<text class="nowtxt" data-role="nowtxt" y="${GROUND + 16}" text-anchor="middle"></text></g>`;

      s += `<g class="late"><circle class="lampglow" cx="196" cy="${GROUND - 24}" r="12" fill="#ffd45c"/><g class="lamp"><path class="ln" d="M196 ${GROUND}v-22m-3.6 0h7.2"/><circle cx="196" cy="${GROUND - 24}" r="2.3" fill="#ffd45c" stroke="#e3a92c" stroke-width=".8"/></g></g>`;
      s += `<g class="late" transform="translate(414 ${GROUND})"><g class="snowman">
        <circle class="o" cx="0" cy="-5.6" r="5.6" fill="#fff"/><circle class="o" cx="0" cy="-13.4" r="3.9" fill="#fff"/>
        <circle cx="-1.3" cy="-14.2" r=".6" fill="#3d3a38"/><circle cx="1.3" cy="-14.2" r=".6" fill="#3d3a38"/><path d="M0 -13.2l3.4 .8-3.4 .7z" fill="#f08a2c"/>
        <path d="M-3.4 -10.4q3.4 1.8 6.8 0" fill="none" stroke="#e85d5d" stroke-width="1.8" stroke-linecap="round"/><path d="M2.4 -9.8l1.4 3.4" fill="none" stroke="#e85d5d" stroke-width="1.8" stroke-linecap="round"/>
      </g></g>`;

      const leg = (cls) =>
        `<g class="${cls}" transform="translate(0.55 -8.4)"><g class="thigh"><path class="w-leg" d="M0 0v4"/><g transform="translate(0 4)"><g class="shin"><path class="w-leg" d="M0 0v3.5"/><path class="w-shoe" transform="translate(0 .5)" d="M-1.15 2.5h2l1.5.55q.75.3.75.85h-4.25z"/></g></g></g></g>`;
      s += `<g class="late walker" transform="translate(0 ${GROUND}) scale(${WALKER_SCALE})"><g class="walkgo"><g class="walkdoor"><g class="body">
        <g transform="translate(0 -1)"><g class="far" transform="translate(0.6 -12.4)"><g class="armcarry">
          <path class="w-arm" d="M0 0v5"/><circle class="w-skin" cx="0" cy="5.3" r=".95"/>
          <path class="w-handle" d="M-1 5.9v-.9h2v.9"/><rect class="w-case" x="-2.7" y="5.8" width="5.4" height="3.7" rx=".9"/><path class="w-handle" d="M-2.7 7.3h5.4"/>
        </g></g></g>
        ${leg('far')}
        <g transform="translate(0 -1)">
          <g class="walkumb"><path class="ln" d="M3.7 -12.6V-22.4"/><path class="o" fill="#6fa8e8" d="M-4.5 -22.4a8.2 8.2 0 0 1 16.4 0q-2.05-1.7-4.1 0q-2.05-1.7-4.1 0q-2.05-1.7-4.1 0q-2.05-1.7-4.1 0z"/></g>
          <rect class="w-skin" x="-0.2" y="-14.4" width="1.6" height="1.6" rx=".5"/>
          <path class="w-coat" d="M-1.1 -12.4q0-1.1 1.1-1.1h1.3q1.1 0 1.15 1.1l.2 5.1q.05.9-.8.9h-2.4q-.85 0-.8-.9z"/>
          <path class="w-shirt" d="M0.7 -13.5h1.5l-.5 2.4z"/><path class="w-tie" d="M1.45 -13.3l-.12 2"/>
          <g transform="translate(0.6 -13.9) scale(.64) translate(-0.6 13.9)"><g class="whead">
            <path class="w-skin" d="M-3.6 -18.4c0-3 2-4.6 4.2-4.6s4.2 1.8 4.2 4.6c0 1.4-.3 2.6-1.2 3.5-.9.9-1.9 1.3-3 1.3s-2.3-.4-3.1-1.3c-.8-.9-1.1-2.1-1.1-3.5z"/>
            <path class="w-hair" d="M-3.7 -17.2C-4.6 -20.9-2.4 -23.7.8 -23.7 3.5 -23.7 5.1 -21.9 5.1 -19.9H-.5Q-1.9 -19.9-1.9 -18.5V-17.1z"/>
            <g class="eyes"><circle class="w-eye" cx="3.1" cy="-17.7" r=".72"/></g>
            <path class="w-brow" d="M2 -18.95q1.1 -.5 2.2 -.05"/>
          </g></g>
        </g>
        ${leg('')}
        <g transform="translate(0 -1)">
          <g class="armfree" transform="translate(0.6 -12.4)"><g class="armswing"><path class="w-arm" d="M0 0v2.9"/><g transform="translate(0 2.9)"><g class="forearm"><path class="w-arm" d="M0 0v2.5"/><circle class="w-skin" cx="0" cy="2.8" r=".95"/></g></g></g></g>
          <g class="walkumb"><path class="w-arm" d="M0.6 -12.4l2.3 1.5.8-2.3"/><circle class="w-skin" cx="3.7" cy="-13.4" r=".95"/></g>
        </g>
      </g></g></g></g>`;

      s += [
        [176, 84],
        [304, 82],
        [186, 88],
      ]
        .map(([x, y], i) => `<g transform="translate(${x} ${y})"><ellipse class="leaf" style="--i:${i}" data-c="leaf" rx="1.9" ry="1.1"/></g>`)
        .join('');

      s += `<g data-role="flags">${renderFlagsMarkup()}</g>`;
      s += `<g class="dash-brolly" data-role="brolly"><g data-role="brollyTilt"><path class="ln" d="M0 0v11a2.4 2.4 0 0 1-4.8 0"/><path class="o" fill="#ff8a65" d="M-13 0a13 13 0 0 1 26 0q-3.25-3-6.5 0q-3.25-3-6.5 0q-3.25-3-6.5 0q-3.25-3-6.5 0z"/></g></g>`;

      scene.innerHTML = s;
    }

    let sun = { x: 0, y: 0 };
    let decks = [];
    let amb = ambient(state.hour, wxNow());
    let geo = { s: 1, ox: 0, oy: 0 };

    function apply() {
      const wx = wxNow();
      const night = isNight();
      const off = offAxis();
      const hour = state.hour;
      amb = ambient(hour, wx);
      sun = luminary(hour);

      hero.dataset.tone = amb.tone;
      hero.style.setProperty('--sky-a', css(amb.A));
      hero.style.setProperty('--sky-b', css(amb.B));
      hero.style.setProperty('--glow', amb.glow);
      hero.style.setProperty('--wash', amb.wash);
      hero.style.setProperty('--gx', `${(geo.ox + sun.x * geo.s).toFixed(1)}px`);
      hero.style.setProperty('--gy', `${(geo.oy + sun.y * geo.s).toFixed(1)}px`);

      scene.dataset.wx = wx;
      scene.dataset.night = night ? '1' : '0';
      scene.dataset.off = off ? '1' : '0';
      scene.dataset.season = state.season;
      scene.style.setProperty('--glass', css(mix(rgb('#9cc3e6'), rgb('#181d42'), amb.dark * 0.72)));
      scene.style.setProperty('--axis', amb.dark > 0.5 ? 'rgba(255,255,255,.62)' : 'rgba(44,44,43,.5)');
      scene.style.setProperty('--ol', amb.dark > 0.5 ? 'rgba(18,20,48,.6)' : 'rgba(64,48,40,.5)');

      $('[data-role="lum"]', scene).style.transform = `translate(${sun.x.toFixed(1)}px, ${sun.y.toFixed(1)}px)`;
      $('[data-role="nowline"]', scene).setAttribute('d', `M${sun.x.toFixed(1)} ${(sun.y + 18).toFixed(1)}V${GROUND}`);
      const nowtxt = $('[data-role="nowtxt"]', scene);
      nowtxt.setAttribute('x', sun.x.toFixed(1));
      nowtxt.textContent = clock(hour);
      $$('.ticktxt', scene).forEach((el) => {
        el.style.opacity = !off && Math.abs(xAt(+el.dataset.h) - sun.x) < 24 ? 0 : 1;
      });

      decks = [];
      for (let h = DAY_START; h < DAY_END; h++) {
        const w = off ? wx : wxAtHour(h);
        const t = CLOUDED.includes(w) ? w : null;
        const last = decks[decks.length - 1];
        if (t && last && last.t === t && last.h2 === h) last.h2 = h + 1;
        else if (t) decks.push({ t, h1: h, h2: h + 1 });
      }
      decks.forEach((dk) => {
        dk.x1 = dk.h1 === DAY_START ? -70 : xAt(dk.h1) - 12;
        dk.x2 = dk.h2 === DAY_END ? 470 : xAt(dk.h2) + 12;
      });
      ['front', 'back'].forEach((layer) => {
        $$(`.deck.${layer}`, scene).forEach((el, i) => {
          const dk = decks[i];
          el.classList.toggle('on', !!dk);
          if (!dk) return;
          const path = $('.cloud', el);
          const loose = dk.t === 'cloudy';
          path.setAttribute(
            'd',
            layer === 'front'
              ? massPath(dk.x1, dk.x2, loose ? MASS.looseFront : MASS.denseFront, dk.h1)
              : loose
                ? massPath(dk.x1 - 34, dk.x2 + 20, MASS.looseBack, dk.h1 + 2)
                : bandPath(dk.x1 - 16, dk.x2 + 12, 18, 5, dk.h1 + 3),
          );
          path.dataset.c = DECK_TONE[dk.t][layer === 'front' ? 0 : 1];
        });
      });

      $$('.slot', scene).forEach((el) =>
        el.classList.toggle('on', (off ? wx : wxAtHour(CLOUDS[+el.dataset.i].h)) === 'partly'),
      );

      const season = SEASONS[state.season];
      const snowing = wx === 'snow';
      $$('[data-c]', scene).forEach((el) => {
        const c = el.dataset.c;
        if (c === 'far') el.style.fill = css(mix(amb.B, mix(amb.A, rgb('#7b8fb8'), 0.45), 0.6));
        else if (c === 'ground') el.style.fill = shade(snowing ? '#f7f9fc' : season.ground, amb, 1.4);
        else if (c === 'tree0' || c === 'tree1') el.style.fill = shade(season.tree[c === 'tree0' ? 0 : 1], amb);
        else if (c === 'leaf') el.style.fill = shade(season.leaf, amb, 0.5);
        else if (c === 'cloud') el.style.fill = shade('#ffffff', amb, 0.7);
        else el.style.fill = shade(c, amb, c === '#ffffff' || c === '#e2e9f2' || c === '#b9c2d3' ? 0.7 : 1);
      });

      const { sr, ss } = SEASONS[state.season];
      const dusk = hour >= ss - 0.8 || hour < sr + 0.5;
      const m = night ? 3 : dusk ? 5 : wx === 'thunder' || wx === 'rain' ? 7 : 0;
      $$('.wn', scene).forEach((el) => el.classList.toggle('lit', m > 0 && +el.dataset.k % m === 0));

      let tip = '';
      $$('.fumb', scene).forEach((el) => {
        const h = +el.dataset.h;
        const w = wxAtHour(h);
        const wet = !!PRECIP[w] && !off;
        el.classList.toggle('on', wet);
        if (wet && !tip && h > hour) tip = `${clock(h)} 일정 때 ${WX[w].label === '천둥번개' ? '비' : WX[w].label} 예보`;
      });

      const icon = wx === 'clear' && night ? ICON.night : ICON[wx];
      wxchipEl.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>${WX[wx].label} ${PRESETS[state.preset].temp}°${tip ? `<span class="dash-sep">·</span><span class="dash-wx-tip">${tip}</span>` : ''}`;
      if (!hero.classList.contains('play')) renderGreeting(false);
      scene.setAttribute('aria-label', `오늘의 시간 축과 날씨. 지금 ${clock(hour)} ${WX[wx].label}`);
      if (RM) drawStatic();
      if (typeof options.onStateChange === 'function') options.onStateChange(getState());
    }

    const ctx = fx.getContext('2d');
    const pool = Array.from({ length: 84 }, (_, i) => ({ i, kind: null, wait: Math.random() * 0.4 }));
    const CAP = { rain: 46, heavy: 84, snow: 70 };
    const splashes = [];
    const ptr = { in: false, x: 0, y: 0, vx: 0, nx: 0, ny: 0 };

    function respawn(p, prewarm) {
      const x = 14 + Math.random() * 420;
      const pr = precipAtX(x);
      if (!pr || p.i >= CAP[pr.heavy ? 'heavy' : pr.kind]) {
        p.kind = null;
        p.wait = 0.15 + Math.random() * 0.5;
        return;
      }
      p.kind = pr.kind;
      p.x = x;
      p.ix = 0;
      p.iy = 0;
      if (pr.kind === 'rain') {
        p.y = prewarm ? 24 + Math.random() * (GROUND - 24) : 20 + Math.random() * 6;
        p.vy = (pr.heavy ? 172 : 132) + Math.random() * 50;
        p.vx = pr.heavy ? -48 : -20;
        p.len = 5 + Math.random() * 3;
      } else {
        p.y = prewarm ? 20 + Math.random() * (GROUND - 20) : 17 + Math.random() * 6;
        p.vy = 13 + Math.random() * 13;
        p.r = 0.9 + Math.random() * 1.1;
        p.ph = Math.random() * 6.28;
        p.sw = 4 + Math.random() * 5;
      }
    }

    const reseed = () => pool.forEach((p) => respawn(p, true));
    const UMB_R = 13.5;
    const umbrellaOn = () => ptr.in && ptr.y > 22 && ptr.y < GROUND + 6 && precipAtX(ptr.x)?.kind === 'rain';

    function step(dt) {
      const umb = umbrellaOn();
      const ux = brolly.x;
      const uy = brolly.y;
      for (const p of pool) {
        if (!p.kind) {
          p.wait -= dt;
          if (p.wait <= 0) respawn(p);
          continue;
        }
        if (p.kind === 'rain') {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (umb) {
            const dx = p.x - ux;
            const dy = p.y - uy;
            if (dy < 1 && dx * dx + dy * dy < UMB_R * UMB_R) {
              const side = dx >= 0 ? 1 : -1;
              p.x = ux + side * (UMB_R + 0.6);
              p.y = uy + 1.5;
              p.vx = side * 22;
              p.vy *= 0.72;
              splashes.push({
                x: ux + dx,
                y: uy + Math.min(dy, -Math.sqrt(Math.max(UMB_R * UMB_R - dx * dx, 0))),
                life: 0.2,
              });
            }
          }
          if (p.y >= GROUND) {
            splashes.push({ x: p.x, y: GROUND, life: 0.24 });
            respawn(p);
          }
        } else {
          p.ph += dt * 1.6;
          if (ptr.in) {
            const dx = p.x - ptr.x;
            const dy = p.y - ptr.y;
            const d = Math.hypot(dx, dy);
            if (d < 30 && d > 0.01) {
              const f = (30 - d) / 30;
              p.ix += (dx / d) * f * 420 * dt + ptr.vx * f * 0.5 * dt;
              p.iy += (dy / d) * f * 300 * dt;
            }
          }
          p.ix *= Math.pow(0.05, dt);
          p.iy *= Math.pow(0.05, dt);
          p.x += (Math.sin(p.ph) * p.sw + p.ix) * dt;
          p.y += (p.vy + p.iy) * dt;
          if (p.y >= GROUND || p.y < 4) respawn(p);
        }
      }
      for (let i = splashes.length - 1; i >= 0; i--) {
        splashes[i].life -= dt;
        if (splashes[i].life <= 0) splashes.splice(i, 1);
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const nightish = amb.dark > 0.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = nightish ? 'rgba(200,216,255,.6)' : 'rgba(72,124,196,.62)';
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      for (const p of pool) {
        if (p.kind === 'rain') {
          const k = p.len / Math.hypot(p.vx, p.vy);
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * k, p.y - p.vy * k);
        }
      }
      for (const sp of splashes) {
        const r = (0.24 - sp.life) * 16 + 1;
        ctx.moveTo(sp.x - r, sp.y - r * 0.7);
        ctx.lineTo(sp.x - r * 0.5, sp.y - 0.4);
        ctx.moveTo(sp.x + r, sp.y - r * 0.7);
        ctx.lineTo(sp.x + r * 0.5, sp.y - 0.4);
      }
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = nightish ? 'rgba(160,180,230,.4)' : 'rgba(112,146,196,.6)';
      ctx.lineWidth = 0.55;
      for (const p of pool) {
        if (p.kind === 'snow') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, 6.2832);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    function drawStatic() {
      reseed();
      draw();
    }

    const brolly = { x: 0, y: 0, tilt: 0, el: null, tiltEl: null };
    const look = { x: 0, y: 0 };
    const par = { x: 0, y: 0 };
    const cache = { par: [], cat: null };

    hero.addEventListener('pointermove', (e) => {
      const r = scene.getBoundingClientRect();
      const hr = hero.getBoundingClientRect();
      if (!r.width) return;
      const x = (e.clientX - r.left) / geo.s;
      const y = (e.clientY - r.top) / geo.s;
      ptr.vx = (x - ptr.x) * 60;
      ptr.x = x;
      ptr.y = y;
      ptr.in = true;
      ptr.nx = clamp(((e.clientX - hr.left) / hr.width) * 2 - 1, -1, 1);
      ptr.ny = clamp(((e.clientY - hr.top) / hr.height) * 2 - 1, -1, 1);
    });

    hero.addEventListener('pointerleave', () => {
      ptr.in = false;
      ptr.nx = 0;
      ptr.ny = 0;
      ptr.vx = 0;
    });

    function follow(dt) {
      const k = 1 - Math.pow(0.0015, dt);
      par.x += (ptr.nx - par.x) * k;
      par.y += (ptr.ny - par.y) * k;
      cache.par.forEach((el) => {
        const d = +el.dataset.depth;
        el.style.transform = `translate(${(-par.x * d * 7).toFixed(2)}px, ${(-par.y * d * 3).toFixed(2)}px)`;
      });
      const tx = ptr.in ? clamp((ptr.x - 345) / 60, -1, 1) : 0;
      const ty = ptr.in ? clamp((ptr.y - 45) / 40, -1, 1) : 0;
      look.x += (tx - look.x) * k;
      look.y += (ty - look.y) * k;
      if (cache.cat) {
        cache.cat.style.transform = `translate(${(look.x * 0.55).toFixed(2)}px, ${(look.y * 0.4).toFixed(2)}px)`;
      }
      const on = umbrellaOn();
      if (brolly.el) brolly.el.classList.toggle('on', on);
      const bk = 1 - Math.pow(0.00002, dt);
      const gx = ptr.x;
      const gy = ptr.y - 5;
      const px = brolly.x;
      brolly.x += (gx - brolly.x) * bk;
      brolly.y += (gy - brolly.y) * bk;
      brolly.tilt += (clamp(((brolly.x - px) / Math.max(dt, 0.001)) * 0.09, -20, 20) - brolly.tilt) * k;
      if (brolly.el) brolly.el.style.transform = `translate(${brolly.x.toFixed(1)}px, ${brolly.y.toFixed(1)}px)`;
      if (brolly.tiltEl) brolly.tiltEl.style.transform = `rotate(${brolly.tilt.toFixed(1)}deg)`;
    }

    function hop(el, big) {
      if (RM || !el?.animate) return;
      const h = big ? 10 : 6;
      el.animate(
        [
          { transform: 'translateY(0) scale(1, 1)' },
          { transform: `translateY(-${h}px) scale(1.08, 0.94)`, offset: 0.3 },
          { transform: 'translateY(0) scale(0.93, 1.07)', offset: 0.55 },
          { transform: `translateY(-${h / 3}px) scale(1, 1)`, offset: 0.75 },
          { transform: 'translateY(0) scale(1, 1)' },
        ],
        { duration: 620, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
      );
    }

    function sprinkle(x, y) {
      if (RM) return;
      let n = 0;
      for (const p of pool) {
        if (n >= 9) break;
        if (p.kind) continue;
        p.kind = wxNow() === 'snow' ? 'snow' : 'rain';
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
          p.ph = Math.random() * 6;
          p.sw = 6;
        }
        n++;
      }
    }

    let thunderTimer = 0;
    let alive = true;

    function thunder() {
      if (!alive || RM || document.hidden) return;
      const storm = decks.filter((dk) => dk.t === 'thunder');
      if (!storm.length) return;
      const dk = storm[Math.floor(Math.random() * storm.length)];
      const x = clamp(dk.x1 + 20 + Math.random() * (dk.x2 - dk.x1 - 40), 30, 420);
      const y = 12;
      const bolt = $('[data-role="bolt"]', scene);
      if (bolt) {
        bolt.setAttribute('transform', `translate(${x.toFixed(1)} ${(y + 9).toFixed(1)})`);
        bolt.animate?.(
          [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0.2, offset: 0.3 }, { opacity: 1, offset: 0.42 }, { opacity: 0 }],
          { duration: 520 },
        );
      }
      flash.animate?.(
        [{ opacity: 0 }, { opacity: 0.3, offset: 0.12 }, { opacity: 0.05, offset: 0.3 }, { opacity: 0.2, offset: 0.42 }, { opacity: 0 }],
        { duration: 520 },
      );
      setTimeout(() => hop($('[data-role="catHop"]', scene)), 140);
    }

    (function loopThunder() {
      thunderTimer = window.setTimeout(() => {
        thunder();
        if (alive) loopThunder();
      }, 4200 + Math.random() * 5200);
    })();

    function sparkles(host) {
      if (RM || !host) return;
      for (let i = 0; i < 6; i++) {
        const sp = document.createElement('span');
        sp.className = 'dash-spark';
        sp.style.setProperty('--a', `${i * 60 + 15}deg`);
        host.appendChild(sp);
        window.setTimeout(() => sp.remove(), 600);
      }
    }

    function sunrise() {
      const el = $('[data-role="lum"]', scene);
      if (RM || !el?.animate) return;
      const night = isNight() || offAxis();
      const { sr } = SEASONS[state.season];
      const frames = night
        ? [
            { opacity: 0, transform: `translate(${sun.x}px, ${sun.y + 12}px)` },
            { opacity: 1, transform: `translate(${sun.x}px, ${sun.y}px)` },
          ]
        : Array.from({ length: 13 }, (_, i) => {
            const p = luminary(sr + ((state.hour - sr) * i) / 12);
            return { transform: `translate(${p.x}px, ${p.y}px)`, opacity: i === 0 ? 0 : 1 };
          });
      el.animate(frames, {
        duration: night ? 700 : 1500,
        delay: 350,
        easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
        fill: 'backwards',
      });
    }

    function walkerDay() {
      const go = $('.walkgo', scene);
      const door = $('.walkdoor', scene);
      if (!go) return;
      if (RM || !go.animate) {
        go.style.transform = `translateX(${176 / WALKER_SCALE}px)`;
        return;
      }
      const wait = (ms) => new Promise((ok) => window.setTimeout(ok, ms));
      const walk = (from, to) =>
        go.animate(
          [{ transform: `translateX(${from / WALKER_SCALE}px)` }, { transform: `translateX(${to / WALKER_SCALE}px)` }],
          { duration: (Math.abs(to - from) / WALK_SPEED) * 1000, easing: 'linear', fill: 'forwards' },
        ).finished;
      const pass = (entering) => {
        const shown = { opacity: 1, transform: 'scale(1)' };
        const hidden = { opacity: 0, transform: 'scale(0.82)' };
        return door.animate(entering ? [shown, hidden] : [hidden, shown], {
          duration: 380,
          easing: 'ease-out',
          fill: 'forwards',
        }).finished;
      };
      (async () => {
        while (alive) {
          let x = -18;
          for (const [block, doorX] of DOORS) {
            if (!alive) return;
            if (Math.random() > 0.4) continue;
            await walk(x, doorX);
            if (!alive) return;
            x = doorX;
            await pass(true);
            const bld = $(`.bld[data-block="${block}"]`, scene);
            if (bld) bld.classList.add('visit');
            await wait(8000 + Math.random() * 14000);
            if (bld) bld.classList.remove('visit');
            if (!alive) return;
            await pass(false);
          }
          await walk(x, 458);
          await wait(2500 + Math.random() * 5000);
        }
      })();
    }

    function layout() {
      const r = scene.getBoundingClientRect();
      const hr = hero.getBoundingClientRect();
      if (!r.width) return;
      geo = { s: r.width / W, ox: r.left - hr.left, oy: r.top - hr.top };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      fx.width = Math.round(r.width * dpr);
      fx.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr * geo.s, 0, 0, dpr * geo.s, 0, 0);
    }

    let last = 0;
    let rafId = 0;
    function frame(ts) {
      if (!alive) return;
      const dt = Math.min((ts - last) / 1000 || 0.016, 0.05);
      last = ts;
      if (!document.hidden) {
        step(dt);
        draw();
        follow(dt);
      }
      rafId = window.requestAnimationFrame(frame);
    }

    // Scene interactions
    buildScene();
    brolly.el = $('[data-role="brolly"]', scene);
    brolly.tiltEl = $('[data-role="brollyTilt"]', scene);
    cache.par = $$('.par', scene);
    cache.cat = $('[data-role="cat"] .look', scene);

    scene.addEventListener('click', (e) => {
      if (e.target.closest('.sun, .moon')) return hop($('[data-role="hopper"]', scene), true);
      if (e.target.closest('.bigcloud')) {
        hop($('[data-role="hopper"]', scene));
        return sprinkle(sun.x + 10, sun.y + 8);
      }
      if (e.target.closest('.deck')) return sprinkle(ptr.x, 15);
      const slot = e.target.closest('.slot');
      if (slot) {
        const c = CLOUDS[+slot.dataset.i];
        hop($('.cbob', slot));
        return sprinkle(xAt(c.h), c.y);
      }
      if (e.target.closest('.cat')) {
        hop($('[data-role="catHop"]', scene));
        $('[data-role="heart"]', scene)?.animate?.(
          [
            { opacity: 0, transform: 'translate(0, 2px) scale(0.6)' },
            { opacity: 1, transform: 'translate(1px, -3px) scale(1)', offset: 0.3 },
            { opacity: 0, transform: 'translate(3px, -10px) scale(1)' },
          ],
          { duration: 900, easing: 'ease-out' },
        );
      }
    });

    // Hero button callbacks
    hero.addEventListener('click', (e) => {
      const scopeBtn = e.target.closest('[data-scope]');
      if (scopeBtn) {
        const nextScope = scopeBtn.dataset.scope;
        setScope(nextScope);
        if (typeof options.onScopeChange === 'function') options.onScopeChange(nextScope);
        return;
      }
      const pinBtn = e.target.closest('[data-pin]');
      if (pinBtn) {
        if (typeof options.onPin === 'function') options.onPin(pinBtn.dataset.pin);
        return;
      }
      const quickBtn = e.target.closest('[data-role="quickCreate"]');
      if (quickBtn) {
        if (typeof options.onQuickCreate === 'function') options.onQuickCreate(quickBtn);
      }
    });

    const ro = new ResizeObserver(() => {
      layout();
      apply();
    });
    ro.observe(hero);

    layout();
    apply();
    reseed();
    sunrise();
    walkerDay();
    window.setTimeout(() => hero.classList.remove('play'), 2600);
    if (RM) drawStatic();
    else rafId = window.requestAnimationFrame(frame);

    let sweep = 0;
    function stopSweep() {
      if (sweep) window.cancelAnimationFrame(sweep);
      sweep = 0;
      state.sweeping = false;
      hero.classList.remove('scrub');
      if (typeof options.onStateChange === 'function') options.onStateChange(getState());
    }

    function setScope(nextScope) {
      state.scope = nextScope;
      $$('[data-scope]', hero).forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.scope === nextScope));
      });
    }

    function updateCounts(counts) {
      if (!counts) return;
      ['events', 'tasks', 'overdue'].forEach((k) => {
        if (typeof counts[k] !== 'number') return;
        const prev = state.counts[k];
        state.counts[k] = counts[k];
        const el = $(`[data-count="${k}"]`, hero);
        if (!el) return;
        el.textContent = String(counts[k]);
        if (k === 'overdue') el.classList.toggle('bad', counts[k] > 0);
        if (prev !== counts[k]) {
          el.classList.remove('dash-numpop');
          void el.offsetWidth;
          el.classList.add('dash-numpop');
        }
      });
    }

    function setFlags(flags) {
      if (!Array.isArray(flags)) return;
      state.flags = flags.slice();
      const wrap = $('[data-role="flags"]', scene);
      if (wrap) {
        wrap.innerHTML = renderFlagsMarkup();
        apply();
      }
    }

    function setWeather(preset) {
      if (!(preset in PRESETS)) return;
      state.preset = preset;
      apply();
      if (!RM) reseed();
    }

    function setHour(hour, scrub = false) {
      state.hour = clamp(Number(hour), 0, 24);
      hero.classList.toggle('scrub', Boolean(scrub));
      apply();
      if (!scrub && !RM) reseed();
    }

    function setSeason(season) {
      if (!(season in SEASONS)) return;
      state.season = season;
      apply();
    }

    function cheer() {
      sparkles(pinTasks);
      hop($('[data-role="hopper"]', scene), true);
    }

    function replay() {
      hero.classList.remove('play');
      void hero.offsetWidth;
      renderGreeting(true);
      hero.classList.add('play');
      sunrise();
      window.setTimeout(() => hero.classList.remove('play'), 2600);
    }

    function toggleDaySweep() {
      if (sweep) {
        stopSweep();
        return false;
      }
      state.sweeping = true;
      hero.classList.add('scrub');
      if (typeof options.onStateChange === 'function') options.onStateChange(getState());
      const t0 = performance.now();
      const from = 4.5;
      const to = 22.5;
      const dur = 16000;
      const tick = (ts) => {
        const t = (ts - t0) / dur;
        if (t >= 1) {
          setHour(to, false);
          stopSweep();
          return;
        }
        setHour(from + (to - from) * t, true);
        sweep = window.requestAnimationFrame(tick);
      };
      sweep = window.requestAnimationFrame(tick);
      return true;
    }

    function getState() {
      return {
        preset: state.preset,
        hour: state.hour,
        season: state.season,
        scope: state.scope,
        sweeping: state.sweeping,
        presets: PRESETS,
        seasons: SEASONS,
        clockLabel: clock(state.hour),
      };
    }

    function destroy() {
      alive = false;
      stopSweep();
      ro.disconnect();
      window.clearTimeout(thunderTimer);
      if (rafId) window.cancelAnimationFrame(rafId);
    }

    return {
      cheer,
      updateCounts,
      setFlags,
      setScope,
      setWeather,
      setHour,
      setSeason,
      replay,
      toggleDaySweep,
      getState,
      destroy,
    };
  }

  window.mountDashHero = mountDashHero;
  window.DASH_HERO_PRESETS = PRESETS;
  window.DASH_HERO_SEASONS = SEASONS;
})();
