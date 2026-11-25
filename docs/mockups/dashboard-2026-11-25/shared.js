/* 대시보드 개선 시안 (2026-11-25) 공용: 예시 데이터, 창 틀, 차트 부품. 숫자는 모두 예시다. */
const I = {
  home: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 21v-4h6v4M8 7h2M14 7h2M8 11h2M14 11h2"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14"/>',
  mega: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1ZM15 8a5 5 0 0 1 0 8"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  chat: '<path d="M4 5h16v11H9l-5 4Z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  hand: '<path d="M3 12 8 7l4 3 4-3 5 5-6 6-4-3-3 2Z"/>',
  doc: '<path d="M6 3h8l4 4v14H6ZM14 3v4h4M9 12h6M9 16h6"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12h2M3 10h18"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  team: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  sms: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  walk: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  check2: '<path d="M4 12.5 9 17 20 6"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4ZM10 21h4"/>',
  news: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h6M7 13h10M7 16h7"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z"/>',
  flag: '<path d="M5 21V4M5 5h12l-2 4 2 4H5"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
};
const ic = (name, extra = '') => `<svg class="ic" viewBox="0 0 24 24" ${extra}>${I[name] ?? ''}</svg>`;
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/* ── 예시 데이터 (2026-11-25 수요일 오전 10:20 기준) ── */
const NOW_HOUR = 10 + 20 / 60;
const D = {
  user: '이현수',
  date: '11월 25일 수요일 · 맑음 8°',
  events: [
    { at: 9.5, end: 10, title: '아침 회의', who: '사무소', kind: 'internal', done: true },
    { at: 11, end: 12, title: '한지우 고객 임장', who: '고덕그라시움 101동 3501호', kind: 'viewing' },
    { at: 14, end: 15, title: '계약서 작성', who: '헬리오시티 204동 1102호 · 매매', kind: 'contract' },
    { at: 16.5, end: 17, title: '잔금 · 열쇠 인계', who: '래미안강동팰리스 102동 803호', kind: 'settle' },
  ],
  tasks: [
    { id: 1, t: '김민준 매도인 확인 전화 회신', who: '고덕그라시움 101동 3403호', late: 12, kind: '전화' },
    { id: 2, t: '전세 매물 등기부 열람', who: '고덕아르테온 305동 1204호', late: 11, kind: '서류' },
    { id: 3, t: '19.8억 계약서 특약 검토', who: '고덕그라시움 101동 3501호', late: 10, kind: '계약' },
    { id: 4, t: '한지우 고객 매물 3건 추천', who: '한지우', late: 10, kind: '추천' },
    { id: 5, t: '최도윤 고객 재연락', who: '최도윤', late: 9, kind: '전화' },
    { id: 6, t: '급매 26.8억 등기부 확인', who: '고덕그라시움 103동 2201호', late: 9, kind: '서류' },
    { id: 7, t: '강수연 고객 토요일 임장 준비', who: '강수연', late: 8, kind: '임장' },
    { id: 8, t: '세입자 만기 안내 문자', who: '헬리오시티 204동 1102호', late: 3, kind: '문자' },
    { id: 9, t: '중도금 입금 확인', who: '래미안강동팰리스 102동 803호', late: 1, kind: '거래' },
    { id: 10, t: '계약 전 소유자 신분 확인', who: '헬리오시티 204동 1102호', late: 0, kind: '계약' },
    { id: 11, t: '잔금일 법무사 일정 확정', who: '래미안강동팰리스 102동 803호', late: 0, kind: '거래' },
    { id: 12, t: '광고 사진 교체', who: '고덕그라시움 101동 3401호', late: 0, kind: '광고' },
    { id: 13, t: '정유진 고객 대출 한도 회신', who: '정유진', late: -1, kind: '전화' },
    { id: 14, t: '공동중개 수수료 정산서 보내기', who: '둔촌 한빛공인', late: -2, kind: '정산' },
    { id: 15, t: '주간 매물 확인 돌리기', who: '사무소', late: -5, kind: '확인' },
  ],
  /* 이번 주(일요일부터 — 앱의 달력과 같다). 일정 수는 아래 dayEvents·events의 실제 개수에서 센다 */
  week: [
    { d: '일', n: 22 }, { d: '월', n: 23 }, { d: '화', n: 24 }, { d: '수', n: 25, today: true },
    { d: '목', n: 26 }, { d: '금', n: 27 }, { d: '토', n: 28 },
  ],
  dayEvents: {
    4: [['11:00', '임장', '고덕그라시움 103동']], 6: [['14:00', '계약서 작성', '고덕아르테온 305동'], ['16:00', '정유진 고객 상담', '방문']],
    11: [['10:30', '문지훈 매도인 통화', '가격 조정']], 13: [['13:00', '임장 2건', '헬리오시티']], 17: [['15:00', '가계약', '고덕그라시움 101동 3404호']],
    19: [['11:00', '한지우 고객 상담', '방문'], ['17:30', '사진 촬영', '고덕그라시움 101동 3401호']], 20: [['14:00', '임장', '래미안강동팰리스']],
    29: [['13:00', '수금 예정', '강수연 · 660만']], 30: [['10:00', '주간 회의', '사무소']],
    23: [['10:00', '주간 회의', '사무소'], ['14:00', '정유진 고객 상담', '대출 한도 확인'], ['17:00', '매물 사진 촬영', '고덕그라시움 101동 3401호']],
    24: [['11:30', '문지훈 매도인 방문', '고덕그라시움 101동 3403호'], ['15:00', '임장', '고덕아르테온 305동 1204호']],
    26: [['12:00', '최도윤 고객 방문 상담', '고덕그라시움 102동 3401호'], ['15:30', '가계약금 협의', '고덕아르테온 305동 1204호'], ['17:00', '임장', '헬리오시티 204동']],
    27: [['10:00', '등기 이전 확인', '고덕그라시움 101동 3503호'], ['16:00', '강수연 고객 통화', '토요일 임장 확인']],
    28: [['09:30', '강수연 고객 임장', '헬리오시티 204동 1102호'], ['11:00', '한지우 고객 임장 2건', '고덕그라시움'], ['14:00', '임장', '래미안강동팰리스'], ['16:00', '임장', '고덕아르테온']],
  },
  stages: ['계약 준비', '가계약', '본계약', '중도금/잔금', '잔금 완료'],
  stageShort: ['준비', '가계약', '본계약', '중도금', '완료'],
  deals: [
    { name: '고덕그라시움 101동 3503호', type: '매매', price: '24억 2,000', stage: 4, days: 2, next: '등기 이전 확인', due: '11.27', who: '이현수' },
    { name: '고덕그라시움 101동 3402호', type: '월세', price: '3,000 / 120', stage: 2, days: 19, next: '중도금일 미정', due: null, who: '이현수', stall: true },
    { name: '고덕그라시움 101동 3404호', type: '전세', price: '10억 8,000', stage: 2, days: 6, next: '중도금', due: '12.02', who: '박서연' },
    { name: '헬리오시티 204동 1102호', type: '매매', price: '21억 5,000', stage: 1, days: 3, next: '본계약', due: '오늘 14:00', who: '이현수' },
    { name: '래미안강동팰리스 102동 803호', type: '매매', price: '17억 9,000', stage: 3, days: 11, next: '잔금', due: '오늘 16:30', who: '김도현' },
    { name: '고덕아르테온 305동 1204호', type: '전세', price: '7억 2,000', stage: 0, days: 14, next: '가계약금 협의', due: null, who: '박서연', stall: true },
  ],
  /* 밀린 업무가 며칠째인지 */
  aging: [ { b: '1~2일', n: 1 }, { b: '3~6일', n: 1 }, { b: '7~9일', n: 3 }, { b: '10일 이상', n: 4 } ],
  /* 진행 중 의뢰의 마지막 확인 뒤 지난 날 */
  confirm: [ { b: '7일 안', n: 31 }, { b: '8~14일', n: 12 }, { b: '15~30일', n: 7 }, { b: '30일 넘음', n: 4 } ],
  /* 상담: 손님과 나눈 이야기와, 매물 확인을 누를 때마다 생기는 짧은 기록이 한 목록에 섞여 온다 */
  talks: [
    { day: '오늘', kind: 'phone', who: '정민호', role: '매도인', about: '고덕그라시움 101동 3403호', text: '매매가 15억 2천으로 다시 확인. 잔금은 2월 말을 원하고, 그 전에는 세입자와 협의가 필요하다고 함.', at: '09:12', next: '세입자 협의 결과 듣기 · 11.27' },
    { day: '오늘', kind: 'confirm', n: 3, who: '문지훈 외 2명', text: '매물 확인 3건 — 유효 2 · 부재중 1', at: '08:40~09:05' },
    { day: '어제', kind: 'visit', who: '한지우', role: '매수 손님', about: '고덕그라시움 101동 3501호', text: '남향을 가장 중요하게 봄. 30평대 2건을 더 보고 싶다고 해서 토요일 임장을 잡기로 함.', at: '16:20', next: '매물 2건 추천 보내기' },
    { day: '어제', kind: 'phone', who: '강수연', role: '매수 손님', about: '헬리오시티 204동 1102호', text: '토요일 오전 임장 가능. 대출 사전심사 진행 중이고 결과는 금요일에 나옴.', at: '11:05' },
    { day: '11.23 (월)', kind: 'sms', who: '최도윤', role: '매수 손님', about: null, text: '예산을 18억까지 올릴 수 있다고 문자로 알려 옴.', at: '19:48', next: '재연락 — 9일 지남', late: true },
    { day: '11.23 (월)', kind: 'confirm', n: 5, who: '정유진 외 4명', text: '매물 확인 5건 — 유효 4 · 가격 변경 1', at: '10:10~11:30' },
  ],
  notices: [
    { t: '12월 정기 점검 안내 (12.03 02:00~04:00)', at: '11.24', must: true },
    { t: '영어 화면을 쓸 수 있습니다 — 설정 › 계정 및 언어', at: '11.24' },
    { t: '프로젝트 화면에 업무·코멘트 바로 적기가 생겼습니다', at: '11.22' },
  ],
  news: [
    { t: '서울 아파트 전세가 12주 연속 상승… 강동·송파 강세', src: '한국부동산원', at: '2시간 전' },
    { t: '12월부터 전월세 신고 과태료 유예 종료', src: '국토교통부', at: '오늘' },
    { t: '주택담보대출 금리 3%대 후반으로 내려와', src: '은행연합회', at: '어제' },
    { t: '강동구 재건축 단지 3곳 관리처분 인가', src: '강동구청', at: '11.23' },
  ],
};
D.week.forEach((d) => { d.ev = d.today ? D.events.length : (D.dayEvents[d.n] ?? []).length; });
const lateTasks = () => D.tasks.filter((t) => t.late > 0);
const todayTasks = () => D.tasks.filter((t) => t.late === 0);
const soonTasks = () => D.tasks.filter((t) => t.late < 0);
const hm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const dueText = (t) => (t.late > 0 ? `${t.late}일 지남` : t.late === 0 ? '오늘' : `${-t.late}일 뒤`);

/* ── 창 틀 ── */
const NAV = [
  ['시작', [['home', '대시보드', true]]],
  ['매물·공간', [['building', '매물관리'], ['map', '관리단지'], ['mega', '광고관리']]],
  ['고객·상담', [['folder', '프로젝트'], ['user', '연락처'], ['chat', '상담분석']]],
  ['거래·계약', [['search', '희망매물'], ['hand', '거래관리'], ['doc', '계약서 관리'], ['wallet', '수수료/정산']]],
  ['업무·운영', [['list', '업무'], ['cal', '캘린더'], ['team', '직원관리'], ['gear', '설정']]],
];
const DEMOS = [['a-refine.html', 'A 지금 구조 다듬기'], ['c-flow.html', 'C 거래 흐름판'], ['index.html', '설명']];

function mountShell(body) {
  const here = location.pathname.split('/').pop() || 'index.html';
  document.body.innerHTML = `
  <div class="win">
    <div class="titlebar"><b>Estaitt</b><span class="t-ic">${ic('panel')}</span><div class="tab">${ic('home')}대시보드</div></div>
    <nav class="side" aria-label="메뉴 (모양만)">
      <div class="search">${ic('search')}검색<kbd>⌘K</kbd></div>
      ${NAV.map(([g, items]) => `<h4>${g}</h4>${items.map(([i, l, on]) => `<a class="${on ? 'on' : ''}">${ic(i)}${l}</a>`).join('')}`).join('')}
    </nav>
    <main class="main"><div class="page">${heroHtml()}${body}</div></main>
  </div>
  <div class="switch" role="navigation" aria-label="시안 바꾸기">${DEMOS.map(([f, l]) => `<a href="${f}" class="${f === here ? 'on' : ''}">${l}</a>`).join('')}</div>
  <div id="tip" role="tooltip"></div>`;
  bindTips();
  bindChecks();
}

function heroHtml() {
  return `<header class="hero">
    <div class="tools"><div class="seg"><button class="on">내 담당</button><button>사무소 전체</button></div><button class="btn dark">${ic('plus')}빠른 등록</button></div>
    <p class="date">${D.date}</p>
    <h1>좋은 아침이에요, ${D.user}님</h1>
    <span class="keep">인사 영역의 그림(하늘·단지)은 지금 것을 그대로 둡니다</span>
  </header>`;
}

/* ── 풍선 글: data-tip="<b>제목</b> 값" ── */
function bindTips() {
  const tip = document.getElementById('tip');
  document.addEventListener('mousemove', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t) { tip.classList.remove('on'); return; }
    tip.innerHTML = t.dataset.tip;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(window.innerWidth - r.width - 8, Math.max(8, e.clientX + 12))}px`;
    tip.style.top = `${Math.max(8, e.clientY - r.height - 10)}px`;
    tip.classList.add('on');
  });
  document.addEventListener('focusin', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t) return;
    const b = t.getBoundingClientRect();
    tip.innerHTML = t.dataset.tip;
    tip.style.left = `${b.left}px`; tip.style.top = `${Math.max(8, b.top - 34)}px`;
    tip.classList.add('on');
  });
  document.addEventListener('focusout', () => tip.classList.remove('on'));
}
function bindChecks() {
  document.addEventListener('click', (e) => {
    const c = e.target.closest?.('.check');
    if (c) c.closest('.row, .item')?.classList.toggle('done');
    const tab = e.target.closest?.('.tabs button, .seg button');
    if (tab) { [...tab.parentElement.children].forEach((b) => b.classList.toggle('on', b === tab)); tab.dispatchEvent(new CustomEvent('pick', { bubbles: true })); }
  });
}

/* ── 일정: 한 달 달력 + 고른 날의 일정 (2026년 11월 — 1일이 일요일) ── */
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const TODAY = 25, MONTH_DAYS = 30;
const evCount = (n) => (n === TODAY ? D.events.length : (D.dayEvents[n] ?? []).length);
/** 일정 종류는 제목에서 읽는다(임장 · 계약 · 잔금 · 상담). 꼬리표로만 쓴다 */
const kindOf = (t) => (/임장/.test(t) ? '임장' : /잔금|수금/.test(t) ? '잔금' : /계약/.test(t) ? '계약' : /상담|통화/.test(t) ? '상담' : '');
function monthHtml() {
  const weekStart = TODAY - ((TODAY - 1) % 7);
  let cells = '';
  for (let n = 1; n <= 35; n += 1) {
    const col = (n - 1) % 7, wk = n >= weekStart && n < weekStart + 7 ? `cw ${col === 0 ? 'cw0' : col === 6 ? 'cw6' : ''}` : '';
    if (n > MONTH_DAYS) { cells += `<span class="out num ${wk}">${n - MONTH_DAYS}</span>`; continue; }
    const ev = evCount(n);
    cells += `<button data-n="${n}" class="${n === TODAY ? 'today' : n < TODAY ? 'past' : ''} ${col === 0 ? 'sun' : col === 6 ? 'sat' : ''} ${wk}" aria-label="11월 ${n}일 ${WD[col]}요일, 일정 ${ev}건"><b class="num">${n}</b><span class="dots">${'<i></i>'.repeat(Math.min(ev, 3))}</span></button>`;
  }
  return `<div class="mo-wd">${WD.map((d, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${d}</span>`).join('')}</div><div class="mo">${cells}</div>`;
}
const slotHtml = (at, end, title, who, cls = '', badge = '') => {
  const k = kindOf(title);
  return `<div class="slot ${cls}"><time class="num">${at}${end ? `<em>${end}</em>` : ''}</time><div><div class="t">${esc(title)}${badge}</div><div class="sub">${k ? `<span class="kind">${k}</span>` : ''}${esc(who)}</div></div></div>`;
};
function dayListHtml(n) {
  if (n === TODAY) {
    let out = '', put = false;
    D.events.forEach((e) => {
      const next = !put && e.at > NOW_HOUR;
      if (next) { out += `<div class="now"><time class="num">${hm(NOW_HOUR)}</time><i></i></div>`; put = true; }
      const mins = Math.round((e.at - NOW_HOUR) * 60);
      out += slotHtml(hm(e.at), hm(e.end), e.title, e.who, e.end <= NOW_HOUR ? 'past' : next ? 'next' : '', next ? `<span class="soonb num">${mins >= 60 ? `${Math.floor(mins / 60)}시간 ${mins % 60 ? `${mins % 60}분 ` : ''}뒤` : `${mins}분 뒤`}</span>` : '');
    });
    if (!put) out += `<div class="now"><time class="num">${hm(NOW_HOUR)}</time><i></i></div>`;
    return out;
  }
  const list = D.dayEvents[n] ?? [];
  return list.length ? list.map(([at, t, who]) => slotHtml(at, '', t, who, n < TODAY ? 'past' : '')).join('') : `<p class="empty">일정이 없습니다.</p>`;
}
/** 다가오는 일정: 고른 날 뒤로(지난 날을 골랐으면 오늘부터) 일정이 있는 가장 가까운 날 둘. 오늘은 아직 안 끝난 일정만 센다 */
const dayItems = (d) => (d === TODAY ? D.events.filter((e) => e.end > NOW_HOUR).map((e) => [hm(e.at), e.title]) : (D.dayEvents[d] ?? []).map(([at, t]) => [at, t]));
function upcomingHtml(n) {
  const days = [];
  for (let d = Math.max(n + 1, TODAY); d <= MONTH_DAYS && days.length < 2; d += 1) if (dayItems(d).length) days.push(d);
  if (!days.length) return '';
  return `<div class="uphead">다가오는 일정</div>${days.map((d) => { const l = dayItems(d); const diff = d - TODAY; return `<button class="up" data-go="${d}"><span class="when num">${diff === 0 ? '오늘' : diff === 1 ? '내일' : `${d}일 (${WD[(d - 1) % 7]})`}</span><span class="t">${esc(l[0][1])}${l.length > 1 ? ` 외 ${l.length - 1}건` : ''}</span><span class="sub num">${l[0][0]}</span></button>`; }).join('')}`;
}
function scheduleCardHtml() {
  return `<section class="panel sched" id="sched">
    <div class="ph calh"><h2><span class="num">11</span>월 <span class="yr num">2026</span></h2><span class="sp"></span><button class="btn ghost nav" aria-label="지난달">${ic('chev', 'style="transform:rotate(180deg)"')}</button><button class="btn ghost" data-today>오늘</button><button class="btn ghost nav" aria-label="다음 달">${ic('chev')}</button></div>
    ${monthHtml()}
    <div class="dayhead"><b id="daytitle"></b><span class="sub num" id="daycount"></span><span class="sp"></span><button class="btn ghost">캘린더 ${ic('arrow')}</button></div>
    <div class="day"><div id="daylist"></div><div id="upcoming"></div></div>
  </section>`;
}
function bindSchedule() {
  const card = document.getElementById('sched');
  const draw = (n) => {
    card.querySelectorAll('.mo button').forEach((b) => { const on = Number(b.dataset.n) === n; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    const rel = n === TODAY ? '오늘' : n === TODAY + 1 ? '내일' : n === TODAY - 1 ? '어제' : '';
    document.getElementById('daytitle').textContent = `${n}일 ${WD[(n - 1) % 7]}요일${rel ? ` · ${rel}` : ''}`;
    document.getElementById('daycount').textContent = evCount(n) ? `일정 ${evCount(n)}` : '';
    document.getElementById('daylist').innerHTML = dayListHtml(n);
    document.getElementById('upcoming').innerHTML = upcomingHtml(n);
  };
  card.addEventListener('click', (e) => {
    const b = e.target.closest('.mo button'); if (b) draw(Number(b.dataset.n));
    const go = e.target.closest('[data-go]'); if (go) draw(Number(go.dataset.go));
    if (e.target.closest('[data-today]')) draw(TODAY);
  });
  draw(TODAY);
}
