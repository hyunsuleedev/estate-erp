
(() => {
  /* ── 예시 데이터: 캡처한 화면의 내용 ── */
  const ME = 'Hyunsu Lee', OFFICE = '고덕그라시움';
  const DAYS = ['월', '화', '수', '목', '금', '토', '일'], DATES = [16, 17, 18, 19, 20, 21, 22], TODAY = 2; // 2026-11-18 (수)
  const S = '고덕그라시움 101동 ';
  const tasks = [
    { id: 't1', off: -5, who: '나', t: '김민준 매도인 확인 전화', m: S + '3501호 · 김민준' },
    { id: 't2', off: -4, who: '나', t: '전세 매물 등기부 열람', m: S + '3503호' },
    { id: 't3', off: -3, who: '나', t: '19.8억 계약서 특약 검토', m: S + '3401호' },
    { id: 't4', off: -3, who: '나', t: '한지우 고객 매물 3건 제안', m: '한지우' },
    { id: 't5', off: -2, who: '박준호', t: '최도윤 고객 VIP 재상담', m: '최도윤' },
    { id: 't6', off: -2, who: '나', t: '급매 26.8억 등기부 확인', m: S + '3501호' },
    { id: 't7', off: -1, who: '박준호', t: '관리비 정산 내역 요청', m: S + '3402호' },
    { id: 't8', off: 0, who: '나', t: '잔금일 안내 문자 보내기', m: S + '3403호' },
    { id: 't9', off: 1, who: '나', t: '임장 동선 정리', m: '한지우' },
    { id: 't10', off: 2, who: '나', t: '중도금 입금 확인', m: S + '3401호' },
    { id: 't11', off: 3, who: '나', t: '확인설명서 준비', m: S + '3403호' },
    { id: 't12', off: 6, who: '박준호', t: '전세 만기 연장 의사 확인', m: S + '3502호' },
    { id: 't13', off: null, who: '나', t: '거실 사진 다시 찍기', m: S + '3503호' },
  ];
  const events = [
    { day: 0, time: '10:00', who: '나', t: '주간 회의', m: '사무소' }, { day: 0, time: '15:30', who: '박준호', t: '집 보여주기', m: '고덕그라시움 · 한지우' },
    { day: 1, time: '14:00', who: '나', t: '등기부 열람', m: '고덕그라시움' },
    { day: 2, time: '11:00', who: '나', t: '19.8억 계약서 작성', m: '고덕그라시움 · 배현우', c: '#e03e3e' },
    { day: 3, time: '16:00', who: '나', t: '임장', m: '한지우' }, { day: 4, time: '13:00', who: '박준호', t: '중도금', m: '고덕그라시움' },
    { day: 5, time: '11:00', who: '나', t: '본계약', m: '고덕그라시움 · 최도윤' }, { day: 6, time: '10:30', who: '나', t: '집 보여주기', m: '고덕그라시움' },
  ];
  const deals = [
    { t: S + '3501호', a: '8억 8,000만', st: 4, stl: '중도금/잔금', nx: '단계 정체', cls: 'warn' },
    { t: S + '3402호', a: '3,000만 / 120', st: 5, stl: '잔금완료', nx: '단계 정체', cls: 'warn' },
    { t: S + '3403호', a: '13억 2,000만', st: 3, stl: '본계약', nx: '일정 미정', cls: 'mute' },
    { t: S + '3401호', a: '19억 8,000만', st: 3, stl: '본계약', nx: '중도금 12/15', d: 'D-27' },
    { t: S + '3502호', a: '6억 5,000만', st: 2, stl: '가계약', nx: '본계약 11/21', d: 'D-3' },
  ];
  const ui = { scope: 'all', tab: null, day: TODAY, hour: 14.33, done: new Set(), undo: null };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const I = {
    cal: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path class="a-flip" d="M8 2v4M16 2v4"/>',
    todo: '<rect x="3" y="5" width="6" height="6" rx="1"/><path class="a-check" pathLength="1" d="m3 17 2 2 4-4"/><path d="M13 6h8M13 12h8M13 18h8"/>',
    alarm: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M22 6l-3-3"/>',
    deal: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3M3 4h8"/>',
    mega: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    site: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4"/>',
    news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z"/>',
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>', plus: '<path d="M12 5v14M5 12h14"/>', aa: '<path d="m3 18 5-12 5 12M5 14h6M16 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12v6"/>', tagi: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  };
  const ic = (k, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`;

  const inScope = (x) => ui.scope === 'all' || x.who === '나';
  const open = () => tasks.filter((t) => inScope(t) && !ui.done.has(t.id));
  const bucket = (t) => (t.off == null ? 'soon' : t.off < 0 ? 'late' : t.off === 0 ? 'today' : 'soon');
  const dueText = (t) => (t.off == null ? '기한 없음' : t.off < 0 ? `${-t.off}일 지남` : t.off === 0 ? '오늘' : t.off === 1 ? '내일' : `11.${DATES[TODAY] + t.off > 30 ? DATES[TODAY] + t.off - 30 : DATES[TODAY] + t.off} (${DAYS[(TODAY + t.off) % 7]})`);
  const hhmm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  const greeting = (h) => (h < 5 ? '늦은 시간까지 수고 많으세요' : h < 12 ? '좋은 아침이에요' : h < 18 ? '좋은 오후예요' : '오늘도 수고 많으셨어요');

  /* ── 인사 줄의 그림: 땅이 오늘의 시간 축(06~20시)이고, 해가 지금 시각 위에 있다 ── */
  const X0 = 24, XW = 312, GY = 96;
  const xAt = (h) => X0 + ((Math.min(Math.max(h, 6), 20) - 6) / 14) * XW;
  const arc = (t) => [X0 + XW * t, (1 - t) * (1 - t) * GY + 2 * (1 - t) * t * -46 + t * t * GY]; // 2차 곡선: 지평선 → 꼭대기 → 지평선
  function scene(hour) {
    const night = hour < 6 || hour >= 20, dusk = hour >= 17 || hour < 7;
    const B = [[40, 26, 36], [70, 22, 54], [98, 32, 28], [176, 34, 60], [214, 24, 38], [270, 30, 46], [304, 22, 30]];
    let d = 0, w = 0;
    const blocks = B.map(([x, bw, bh], bi) => {
      const y = GY - bh, cols = Math.floor((bw - 6) / 7), rows = Math.floor((bh - 8) / 9), pad = (bw - cols * 7 + 3.5) / 2;
      let wins = '';
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const lit = dusk && (bi * 5 + r * 3 + c * 7) % (night ? 3 : 5) === 0; wins += `<rect class="wn${lit ? ' lit' : ''}" style="--d:${w++}" x="${(x + pad + c * 7).toFixed(1)}" y="${y + 7 + r * 9}" width="3.5" height="4.5" rx="0.6"/>`; }
      return `<path class="ink draw" pathLength="1" style="--d:${d++}" d="M${x} ${GY}V${y + 2}a2 2 0 0 1 2-2h${bw - 4}a2 2 0 0 1 2 2V${GY}"/>${wins}`;
    }).join('');
    const tree = (x, cls = '') => `<g class="sway ${cls}"><path class="ink draw" pathLength="1" style="--d:${d++}" d="M${x} ${GY}v-9m0 0a6 6 0 1 1 0.1 0"/></g>`;
    // 지붕 위 고양이 (넷째 동). 밤에는 눈을 감는다.
    const cat = `<g class="cast" transform="translate(183 36)"><path class="skin tail" d="M10.5 -0.6c3.4 0.2 4.4 -3 2.6 -5.4"/><path class="skin" d="M0.5 0c-0.6 -4.6 1.6 -6.4 4.8 -6.4s5.4 1.8 4.8 6.4z"/><path class="skin" d="M1.9 -8.6l-0.5 -3.2 2.7 1.5M8.7 -8.6l0.5 -3.2 -2.7 1.5"/><circle class="skin" cx="5.3" cy="-8.4" r="3.5"/>${night ? '<path class="smile" style="stroke:var(--fg);opacity:.7" d="M3.4 -8.6q0.8 0.8 1.5 0M5.9 -8.6q0.8 0.8 1.5 0"/>' : '<g class="eyes"><circle class="dot" cx="4.1" cy="-8.7" r="0.6"/><circle class="dot" cx="6.6" cy="-8.7" r="0.6"/></g>'}</g>`;
    // 둘째 동 굴뚝의 연기
    const smoke = `<g class="cast"><path class="ink" d="M84 42v-5h4v5"/>${[0, 1, 2].map((i) => `<circle class="puff" style="--d:${i}" cx="86" cy="33" r="2.4"/>`).join('')}</g>`;
    // (자리를 잡는 transform 속성과 CSS 움직임을 한 요소에 같이 두면 움직임이 자리를 덮어쓴다. 그래서 묶음을 둘로 나눈다.)
    // 낮에는 새가 지나가고 서류 가방을 든 사람이 걸어간다. 밤에는 가로등이 켜진다.
    const bird = `<g class="cast" transform="translate(0 34)"><g class="bird"><path class="ink" style="opacity:.6" d="M0 0q3 -3.4 5 0q2 -3.4 5 0"/></g></g>`;
    const walker = `<g class="cast" transform="translate(0 ${GY})"><g class="walker"><g class="body"><circle class="skin" cx="0" cy="-14.5" r="2.3"/><path class="ink" style="opacity:.75" d="M0 -12v6.5M0 -10.5l3 3"/><rect class="skin" x="2.2" y="-7.6" width="4" height="3.2" rx="0.6"/><path class="ink leg" style="opacity:.75;--r:24deg" d="M0 -5.5v5.5"/><path class="ink leg b" style="opacity:.75;--r:-24deg" d="M0 -5.5v5.5"/></g></g></g>`;
    const lamp = `<g class="cast"><circle class="lampglow" cx="161" cy="76" r="9"/><path class="ink" d="M161 ${GY}V78m-3 0h6"/><circle class="face" cx="161" cy="76" r="1.8"/></g>`;
    const todays = events.filter((e) => e.day === TODAY && inScope(e));
    const pins = todays.map((e, i) => { const [h, m] = e.time.split(':').map(Number), x = xAt(h + m / 60).toFixed(1);
      // 일정 자리에는 깃발이 꽂힌다
      return `<g class="cast"><path class="pole" d="M${x} ${GY}v-13"/><g class="flagwave"><path class="flag" d="M${x} ${GY - 13}l8 2.6 -8 2.8z"/></g></g><circle class="ev" style="--d:${30 + i * 6}" cx="${x}" cy="${GY}" r="3"><title>${esc(e.time)} ${esc(e.t)}</title></circle>`; }).join('');
    // 눈금 숫자가 지금 시각 글자와 겹치면(가로 22px 안) 숫자는 빼고 눈금만 남긴다.
    const nowX = hour >= 6 && hour < 20 ? xAt(hour) : -99;
    const ticks = [9, 12, 15, 18].map((h) => `<path class="tick" d="M${xAt(h)} ${GY}v4"/>${Math.abs(xAt(h) - nowX) < 22 ? '' : `<text x="${xAt(h)}" y="${GY + 14}" text-anchor="middle">${h}</text>`}`).join('');
    const [sx, sy0] = arc(night ? 0.74 : (Math.min(Math.max(hour, 6), 20) - 6) / 14);
    const sy = Math.max(sy0, 22); // 햇살이 그림 위로 잘리지 않게
    const sky = night
      ? `<g id="sun" data-x="${sx}" data-y="${sy}"><g class="hopper"><g class="bobber"><path class="moonc" d="M4 -7a8 8 0 1 0 5 13a6.5 6.5 0 0 1 -5 -13z"/><path class="smile" style="stroke:var(--fg);opacity:.6" d="M-3 -1q1.3 1.3 2.6 0M-2.2 3q1.2 1 2.4 0"/></g></g>${[0, 1, 2].map((i) => `<text class="zz" style="--d:${i}" x="${9 + i * 3}" y="${-6 - i * 2}">z</text>`).join('')}</g>${[[60, 20], [118, 8], [150, 30], [300, 16], [330, 38]].map(([x, y], i) => `<circle class="star" style="--d:${i}" cx="${x}" cy="${y}" r="1.1"/>`).join('')}`
      : `<path class="nowline" d="M${sx.toFixed(1)} ${(sy + 17).toFixed(1)}V${GY}"/><text class="nowtxt" x="${sx.toFixed(1)}" y="${GY + 14}" text-anchor="middle">${hhmm(hour)}</text><g id="sun" data-x="${sx}" data-y="${sy}"><title>안녕하세요!</title><g class="hopper"><g class="bobber"><g class="rays">${Array.from({ length: 8 }, (_, i) => `<path class="ray" transform="rotate(${i * 45})" d="M0 -11.5v-3"/>`).join('')}</g><circle class="sunc" r="8.2"/><g class="eyes"><circle class="face" cx="-2.8" cy="-1.2" r="1"/><circle class="face" cx="2.8" cy="-1.2" r="1"/></g><circle class="cheek" cx="-4.6" cy="1.6" r="1.2"/><circle class="cheek" cx="4.6" cy="1.6" r="1.2"/><path class="smile" d="M-2.4 2q2.4 2.4 4.8 0"/></g></g></g>`;
    const cloud = (y, cls) => `<g class="drifter ${cls}"><path class="cloud" transform="translate(0 ${y})" d="M0 9a5 5 0 0 1 5-5 7 7 0 0 1 13 1 4.5 4.5 0 0 1 2 8.6H3A4.6 4.6 0 0 1 0 9z"/></g>`;
    return `<svg class="scene" viewBox="0 0 360 118" role="img" aria-label="오늘의 시간 축. 지금 ${hhmm(hour)}, 오늘 일정 ${todays.length}건${todays.map((e) => ` ${e.time} ${e.t}`).join(',')}">
      ${cloud(14, '')}${cloud(34, 'b')}
      ${sky}
      ${blocks}${tree(146)}${tree(252, 'b')}${smoke}${cat}${night ? lamp : bird + walker}
      <path class="ink draw" pathLength="1" style="--d:0;opacity:.7" d="M${X0 - 12} ${GY}H${X0 + XW + 12}"/>
      ${ticks}${pins}</svg>`;
  }
  // 해는 지평선에서 떠올라 지금 자리까지 간다 (처음 한 번). 밤에는 달이 제자리에서 나타난다.
  function launchSun(animate) {
    const sun = document.getElementById('sun'); if (!sun) return;
    const x = +sun.dataset.x, y = +sun.dataset.y, t1 = (x - X0) / XW;
    sun.setAttribute('transform', `translate(${x} ${y})`);
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const night = ui.hour < 6 || ui.hour >= 20;
    const frames = night ? [{ opacity: 0, transform: `translate(${x}px, ${y + 10}px)` }, { opacity: 1, transform: `translate(${x}px, ${y}px)` }]
      : Array.from({ length: 13 }, (_, i) => { const [ax, ay] = arc((t1 * i) / 12); return { transform: `translate(${ax}px, ${i === 12 ? y : Math.max(ay, Math.min(y, 22))}px)`, opacity: i === 0 ? 0 : 1 }; });
    sun.removeAttribute('transform');
    sun.animate(frames, { duration: night ? 700 : 1500, delay: 350, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'both' });
  }

  function renderHero(animate) {
    const o = open(), late = o.filter((t) => bucket(t) === 'late').length, ev = events.filter((e) => e.day === TODAY && inScope(e)).length;
    const words = `${greeting(ui.hour)}, ${ME}님`.split(' ');
    document.getElementById('hero').innerHTML = `
      <div>
        <p class="date" style="--d:0">11월 18일 수요일 · ${OFFICE}</p>
        <h1>${words.map((w, i) => `<span class="w" style="--d:${1 + i}">${esc(w)}</span>`).join(' ')}</h1>
        <div class="pins">
          <button class="pin" style="--d:5" data-a="jump" data-to="sched">${ic('cal')}오늘 일정 <b class="num" data-count="${ev}">${ev}</b></button>
          <button class="pin" style="--d:6" data-a="tab" data-key="today">${ic('todo')}남은 업무 <b class="num" data-count="${o.length}" id="pin-open">${o.length}</b></button>
          <button class="pin${late ? ' bad' : ''}" style="--d:7" data-a="tab" data-key="late"><svg class="ic a-wiggle" viewBox="0 0 24 24" aria-hidden="true">${I.alarm}</svg>기한 지남 <b class="num" data-count="${late}" id="pin-late">${late}</b></button>
        </div>
      </div>
      ${scene(ui.hour)}
      <div class="tools" style="--d:3">
        <div class="seg" role="group" aria-label="표시 범위"><button data-a="scope" data-key="mine" aria-pressed="${ui.scope === 'mine'}">내 담당</button><button data-a="scope" data-key="all" aria-pressed="${ui.scope === 'all'}">사무소 전체</button></div>
        <button class="btn" data-a="say" data-msg="빠른 등록 메뉴를 엽니다">${ic('plus')}빠른 등록</button>
      </div>`;
    launchSun(animate);
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelectorAll('#hero [data-count]').forEach(countUp);
  }
  // 숫자는 0에서 세어 올라간다 (처음 한 번, 0.7초)
  function countUp(el) {
    const to = +el.dataset.count, t0 = performance.now() + 500;
    el.textContent = '0';
    const step = (now) => { const p = Math.min(Math.max((now - t0) / 700, 0), 1); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  // 할 일을 처리했을 때는 그림을 다시 재생하지 않고 숫자만 바꾼다.
  function syncPins() {
    const o = open(), late = o.filter((t) => bucket(t) === 'late').length;
    document.getElementById('pin-open').textContent = o.length; const l = document.getElementById('pin-late'); l.textContent = late; l.closest('.pin').classList.toggle('bad', late > 0);
  }

  /* ── 반응 ── */
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function hop() { const h = document.querySelector('.scene .hopper'); if (!h || calm()) return; h.classList.remove('hop'); void h.getBoundingClientRect(); h.classList.add('hop'); }
  function sparkle(host, n = 7) {
    if (!host || calm()) return;
    const made = Array.from({ length: n }, (_, i) => { const s = document.createElement('i'); s.className = 'spark'; s.style.setProperty('--a', `${(360 / n) * i}deg`); host.append(s); return s; });
    setTimeout(() => made.forEach((s) => s.remove()), 620);
  }
  function cheer(taskId) {
    hop();
    const num = document.getElementById('pin-open'); num.classList.remove('pop'); void num.offsetWidth; num.classList.add('pop'); sparkle(num.closest('.pin'));
    sparkle(document.querySelector(`[data-a="check"][data-key="${taskId}"]`), 6);
  }
  document.addEventListener('click', (e) => { if (e.target.closest?.('#sun')) hop(); });

  /* ── 알림: 되돌릴 수 있는 것은 직전 하나 ── */
  let timer;
  function toast(title, sub, undoable) {
    const el = document.getElementById('toast');
    el.innerHTML = `<span><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${undoable ? '<button data-a="undo">되돌리기</button>' : ''}`;
    el.classList.add('on'); clearTimeout(timer);
    timer = setTimeout(() => { el.classList.remove('on'); if (ui.undo) { ui.undo = null; DX.render(); } }, 5000);
  }
  function settle() { // 앞서 체크한 줄을 목록에서 내보낸다 (되돌리기 대상이 바뀌거나 끝날 때)
    if (ui.undo) { ui.undo = null; }
  }

  /* ── 방향 시안 공용: 상태 바꾸기와 다시 그리기 ── */
  const painters = [];
  // 다시 그려도 포커스를 잃지 않는다: 같은 동작·같은 대상의 단추를 찾아 되돌린다.
  function keepFocus(root, paint) {
    const el = document.activeElement;
    const key = el && root.contains(el) && el.dataset?.a ? `[data-a="${el.dataset.a}"]${el.dataset.key != null ? `[data-key="${CSS.escape(el.dataset.key)}"]` : ''}` : null;
    paint();
    if (key) (root.querySelector(key) ?? root.querySelector('[data-a]'))?.focus({ preventScroll: true });
  }
  const DX = (window.DX = {
    ME, OFFICE, DAYS, DATES, TODAY, tasks, events, deals, ui, I, ic, esc, inScope, open, bucket, dueText, hhmm, toast, hop, sparkle, keepFocus,
    /** 할 일 줄에 보일 것: 방금 체크한 줄은 되돌릴 수 있는 동안 흐리게 남는다 */
    shown: () => tasks.filter((t) => inScope(t) && (!ui.done.has(t.id) || ui.undo?.id === t.id)),
    isDone: (t) => ui.done.has(t.id),
    onRender: (fn) => painters.push(fn),
    render: () => painters.forEach((fn) => fn()),
    /** 완료하거나 완료를 취소한다 */
    toggle(id) {
      const t = tasks.find((x) => x.id === id); if (!t) return;
      if (ui.done.has(id)) { ui.done.delete(id); if (ui.undo?.id === id) ui.undo = null; DX.render(); syncPins(); return toast('완료를 취소했습니다', t.t); }
      ui.undo = null; ui.done.add(id); ui.undo = { id }; DX.render(); syncPins(); cheer(id); toast('업무를 완료했습니다', t.t, true);
    },
  });
  // 공지사항·부동산 뉴스 (예시 내용. 서버에는 아직 없다)
  const notices = [
    { id: 'n1', t: '12월 워크숍 일정 안내', who: '대표', d: '오늘', must: true },
    { id: 'n2', t: '11월 정산 마감은 25일입니다', who: '관리', d: '어제' },
    { id: 'n3', t: '확인설명서 새 양식, 다음 주부터 적용', who: '대표', d: '11.14', must: true, read: true },
    { id: 'n4', t: '사무소 주차 등록 갱신 안내', who: '관리', d: '11.12', read: true },
  ];
  const news = [
    { tag: '우리 지역', t: '강동구 재건축 단지 이주 일정 확정', m: '2시간 전' },
    { tag: '시장', t: '수도권 아파트 전세가격 12주 연속 상승', m: '4시간 전' },
    { tag: '금융', t: '주택담보대출 금리 소폭 인하', m: '어제' },
    { tag: '정책', t: '공인중개사법 시행령 개정안 입법예고', m: '어제' },
  ];
  Object.assign(DX, {
    notices, news, syncPins,
    unread: () => notices.filter((n) => !n.read).length,
    noticeRows: (n = 3) => notices.slice(0, n).map((x) => `<button class="nrow${x.read ? '' : ' unread'}" data-a="notice" data-key="${x.id}" aria-label="${esc(x.t)}${x.read ? '' : ' (안 읽음)'}"><span class="dot"></span><span class="tt">${x.must ? '<span class="must">필독</span>' : ''}${esc(x.t)}</span><span class="mm">${x.who} · ${x.d}</span></button>`).join(''),
    newsRows: (n = 3) => news.slice(0, n).map((x) => `<button class="nrow nw" data-a="say" data-key="${esc(x.t)}" data-msg="${esc(x.t)} 기사를 엽니다"><span class="ntag">${x.tag}</span><span class="tt">${esc(x.t)}</span><span class="mm">${x.m}</span></button>`).join(''),
  });
  document.addEventListener('dx:act', (e) => {
    if (e.detail.a !== 'notice') return;
    const n = notices.find((x) => x.id === e.detail.key); if (!n) return;
    n.read = true; DX.render(); toast('공지를 엽니다', n.t);
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return; const d = b.dataset;
    switch (d.a) {
      case 'scope': if (ui.scope === d.key) return; ui.undo = null; ui.scope = d.key; renderHero(false); DX.render(); return document.querySelector(`[data-a="scope"][data-key="${d.key}"]`)?.focus();
      case 'check': return DX.toggle(d.key);
      case 'undo': if (ui.undo) { ui.done.delete(ui.undo.id); ui.undo = null; DX.render(); syncPins(); } return document.getElementById('toast').classList.remove('on');
      case 'say': return toast(d.msg);
      case 'hour': ui.hour = +d.key; document.querySelectorAll('[data-a="hour"]').forEach((x) => x.setAttribute('aria-pressed', x === b)); return replay();
      case 'replay': return replay();
      // 그 밖의 동작(알약의 jump·tab, 페이지마다 다른 단추)은 페이지가 받는다.
      default: document.dispatchEvent(new CustomEvent('dx:act', { detail: { a: d.a, key: d.key, el: b } }));
    }
  });
  function replay() {
    const page = document.getElementById('page');
    page.classList.remove('play'); void page.offsetWidth;
    renderHero(true); DX.render(); page.classList.add('play');
    clearTimeout(replay.t); replay.t = setTimeout(() => page.classList.remove('play'), 2600);
  }
  // 창 틀과 조작 띠를 넣고 시작한다. 페이지 스크립트가 DX.onRender로 그리는 함수를 등록한 뒤 DX.start()를 부른다.
  const HERE = location.pathname.split('/').pop() + location.search;
  const DIRS = [['d1-week.html', '① 격자'], ['d2-pinboard.html', '② 핀보드'], ['d3-page.html', '③ 문서'], ['d5-page2.html', '③-2'], ['d4-next.html', '④ 다음'], ['d6-doc.html?v=a', 'A 스카이라인'], ['d6-doc.html?v=b', 'B 벤토'], ['d6-doc.html?v=c', 'C 지면'], ['../v11.html', '적용된 것']];
  DX.start = () => {
    document.body.insertAdjacentHTML('afterbegin', `<div class="win"><div class="titlebar" inert><b>Estaitt</b><span class="t-ic">${ic('arrow')}</span><span class="tab">${ic('todo')}대시보드</span></div>
      <main class="scroll"><div class="page" id="page"><header class="hero" id="hero"></header><div id="area"></div></div></main></div>
      <nav class="dirs" aria-label="시안 방향">${DIRS.map(([f, l]) => `<a href="${f}" ${f === HERE ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
      <div class="toast" id="toast" role="status"></div>`);
    replay();
  };
})();
