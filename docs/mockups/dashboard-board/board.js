/* 대시보드 보드 시안 공용 — 예시 데이터, 틀, 항목 줄, 완료·되돌리기 */
(() => {
  const TODAY = new Date(2026, 10, 16); // 2026-11-16 (월)
  const ME = '김서연';
  const WD = ['일', '월', '화', '수', '목', '금', '토'];

  const kinds = {
    deal: { label: '거래', to: '거래관리' },
    listing: { label: '매물', to: '매물관리' },
    buyer: { label: '손님', to: '고객 원장' },
    money: { label: '돈', to: '수금 원장' },
    expiry: { label: '만기', to: '관리단지' },
  };

  // off: 오늘 기준 며칠 뒤인지(음수는 지남). why: 지금 올라온 이유. act: 바로 할 일.
  const items = [
    { id: 'd3', kind: 'deal', off: -2, who: '김서연', t: '래미안힐스테이트 고덕 304동 702호', s: '매매 13억 2,000만 · 가계약 뒤 9일째', why: '본계약 예정일 2일 지남', act: '계약일 잡기', tone: 'danger' },
    { id: 'd2', kind: 'deal', off: 0, who: '박준호', t: '고덕아르테온 215동 1102호', s: '전세 7억 5,000만 · 중도금 1억', why: '중도금 입금일', act: '입금 확인' },
    { id: 'd0', kind: 'deal', off: 0, time: '10:30', who: '김서연', t: '고덕그라시움 103동 3401호', s: '잔금 서류 점검 · 등기부등본 발급', why: '잔금 준비', act: '서류 열기' },
    { id: 'd1', kind: 'deal', off: 3, who: '김서연', t: '고덕그라시움 103동 3401호', s: '매매 15억 8,000만 · 잔금 9억 4,800만 · 매수 한지우', why: '잔금일', act: '잔금 준비 확인' },
    { id: 'd4', kind: 'deal', off: 4, who: '이도윤', t: '고덕센트럴아이파크 107동 1503호', s: '월세 1억 / 250만 · 계약서 서명', why: '본계약일', act: '계약서 열기' },
    { id: 'd5', kind: 'deal', off: 8, who: '최하린', t: '고덕자이 201동 904호', s: '전세 6억 8,000만 · 잔금 6억 1,200만', why: '잔금일', act: '잔금 준비 확인' },

    { id: 'l1', kind: 'listing', off: -9, who: '김서연', t: '고덕그라시움 121동 803호', s: '전세 7억 2,000만 · 마지막 확인 10.24', why: '확인 23일 경과', act: '확인 기록', tone: 'danger' },
    { id: 'l2', kind: 'listing', off: -2, who: '박준호', t: '고덕아르테온 209동 2301호', s: '매매 16억 5,000만 · 마지막 확인 10.31', why: '확인 16일 경과', act: '확인 기록', tone: 'warn' },
    { id: 'l4', kind: 'listing', off: 0, who: '이도윤', t: '래미안힐스테이트 고덕 311동 1204호', s: '매매 14억 9,000만 · 집주인 부재중 2회', why: '다시 전화할 날', act: '전화' },
    { id: 'l3', kind: 'listing', off: 1, who: '김서연', t: '고덕센트럴아이파크 103동 502호', s: '월세 5,000 / 180만 · 네이버 광고', why: '광고 만료', act: '광고 연장' },
    { id: 'l5', kind: 'listing', off: 3, who: '최하린', t: '고덕자이 105동 1801호', s: '전세 6억 5,000만 · 네이버 광고', why: '광고 만료', act: '광고 연장' },

    { id: 'b1', kind: 'buyer', off: -5, who: '김서연', t: '한지우 손님', s: '전세 6~7억 · 84㎡ · 고덕동', why: '연락 12일 없음', act: '전화', tone: 'warn' },
    { id: 'b5', kind: 'buyer', off: -1, who: '정민재', t: '문가은 손님', s: '전세 5~6억 · 59㎡ · 상일동', why: '연락 8일 없음', act: '전화', tone: 'warn' },
    { id: 'b2', kind: 'buyer', off: 0, who: '김서연', t: '윤태경 손님', s: '매매 14~16억 · 84㎡ 이상 · 남향', why: '조건 맞는 새 매물 2건', act: '매물 보내기' },
    { id: 'b3', kind: 'buyer', off: 0, time: '15:00', who: '박준호', t: '서민아 손님', s: '월세 상담 · 사무소 방문', why: '방문 상담', act: '상담 기록' },
    { id: 'b6', kind: 'buyer', off: 0, time: '17:30', who: '김서연', t: '윤태경 손님', s: '고덕아르테온 215동 · 집 보여주기', why: '집 보여주기', act: '길 안내 보내기' },
    { id: 'b4', kind: 'buyer', off: 1, time: '11:00', who: '김서연', t: '강도현 손님', s: '매매 12~13억 · 그라시움 2곳 임장', why: '임장', act: '매물 묶음 보기' },

    { id: 'm1', kind: 'money', off: -12, who: '김서연', t: '고덕그라시움 118동 1502호 수수료', s: '매매 · 매도인 660만 미수', why: '연체 12일', act: '청구 연락', tone: 'danger' },
    { id: 'm2', kind: 'money', off: 2, who: '박준호', t: '고덕아르테온 203동 704호 수수료', s: '전세 · 임차인 280만', why: '수금 만기', act: '입금 확인' },
    { id: 'm3', kind: 'money', off: 5, who: '최하린', t: '한빛공인 공동중개 분배', s: '고덕자이 107동 · 줄 돈 195만', why: '지급 예정일', act: '지급 기록' },

    { id: 'e2', kind: 'expiry', off: 27, who: '이도윤', t: '고덕자이 112동 603호', s: '전세 5억 9,000만 · 세입자 조은별', why: '계약 만기', act: '연장 의사 묻기' },
    { id: 'e1', kind: 'expiry', off: 41, who: '김서연', t: '고덕그라시움 109동 2203호', s: '전세 6억 8,000만 · 세입자 임수빈', why: '계약 만기', act: '연장 의사 묻기' },
    { id: 'e3', kind: 'expiry', off: 58, who: '정민재', t: '고덕센트럴아이파크 101동 1101호', s: '월세 3,000 / 210만 · 세입자 노하준', why: '계약 만기', act: '연장 의사 묻기' },
  ];

  const kpi = [
    { l: '이번달 수금', v: '2,340<small>만원</small>', f: '<span class="d">연체 660만원</span>' },
    { l: '이번달 만기 미수', v: '1,120<small>만원</small>', f: '이번달이 만기인 미수금' },
    { l: '진행 거래', v: '7<small>건</small>', f: '이번달 계약 3건 · 매칭 12건' },
    { l: '거래 가능 매물', v: '48<small>건</small>', f: '<span class="w">미확인 5건</span> · 신규 접수 9건' },
  ];
  const pipeline = [
    { label: '계약 준비', n: 2, c: '#94a0b2' },
    { label: '가계약', n: 1, c: '#5b8def' },
    { label: '본계약', n: 2, c: '#2457d6' },
    { label: '중도금·잔금', n: 2, c: '#0b7a53' },
  ];
  const staff = ['김서연', '박준호', '이도윤', '최하린', '정민재'];
  const nav = [
    ['시작', [['대시보드', '']]],
    ['매물·공간', [['매물관리', '48'], ['관리단지', ''], ['광고관리', '']]],
    ['고객·상담', [['고객 원장', ''], ['연락처', ''], ['상담분석', '']]],
    ['거래·계약', [['희망매물', '12'], ['거래관리', '7'], ['계약서 관리', ''], ['수수료/정산', '']]],
    ['업무·운영', [['업무', ''], ['캘린더', ''], ['직원관리', '']]],
  ];
  const demos = [['a-columns.html', 'A 일의 판'], ['b-dates.html', 'B 날짜 판'], ['c-inbox.html', 'C 한 줄 목록'], ['d-office.html', 'D 사무소 판']];

  // 범위와 처리한 항목은 시안을 오가도 이어진다(탭을 닫으면 처음으로).
  let stored = null;
  try { stored = JSON.parse(sessionStorage.getItem('dashboard-board')); } catch { /* 저장소를 못 쓰면 기억하지 않는다 */ }
  const state = { scope: stored?.scope === 'all' ? 'all' : 'mine', done: new Set(stored?.done ?? []) };
  // 범위는 사람이 직접 고른 경우에만 적는다. 시안의 기본값이 처리 기록에 섞여 다른 시안으로 넘어가지 않게.
  let scopePicked = stored?.scope === 'all' || stored?.scope === 'mine';
  const save = () => { try { sessionStorage.setItem('dashboard-board', JSON.stringify({ scope: scopePicked ? state.scope : undefined, done: [...state.done] })); } catch { /* 위와 같음 */ } };
  const pending = new Map(); // 사라지는 중인 항목 id → 타이머
  const listeners = [];
  const emit = () => listeners.forEach((fn) => fn());

  const date = (off) => { const d = new Date(TODAY); d.setDate(d.getDate() + off); return d; };
  const dateLabel = (off) => { const d = date(off); return `${d.getMonth() + 1}.${d.getDate()} (${WD[d.getDay()]})`; };
  const dueLabel = (it) => (it.off < 0 ? `${-it.off}일 지남` : it.off === 0 ? (it.time ?? '오늘') : it.off === 1 ? '내일' : `D-${it.off}`);
  const tone = (it) => it.tone ?? (it.off < 0 ? 'warn' : it.off === 0 ? 'today' : '');
  const visible = (all) => items.filter((it) => !state.done.has(it.id) && (all || state.scope === 'all' || it.who === ME));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const whoChip = (name) => `<span class="who${name === ME ? ' me' : ''}" title="${esc(name)}">${esc(name[0])}</span>`;
  const check = '<svg viewBox="0 0 12 12" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.5l2.5 2.5 4.5-5.5"/></svg>';

  /** 항목 한 줄. opts.kind: 종류 점 표시, opts.date: 날짜 대신 이유만 */
  function row(it, opts = {}) {
    const why = opts.date === false || it.off < 0 ? it.why : `${it.why} · ${dueLabel(it)}`;
    return `<div class="row" data-id="${it.id}">
      <button class="chk" data-done="${it.id}" aria-label="처리함으로 표시">${check}</button>
      <div style="min-width:0">
        <div class="t">${esc(it.t)}</div>
        <div class="s">${esc(it.s)}</div>
        <div class="meta">${opts.kind ? `<span class="dot k-${it.kind}" title="${kinds[it.kind].label}"></span>` : ''}<span class="tag ${tone(it)}">${esc(why)}</span>${state.scope === 'all' || opts.who ? whoChip(it.who) : ''}</div>
      </div>
      <button class="btn sm act" data-act="${it.id}">${esc(it.act)}</button>
    </div>`;
  }

  let toastTimer;
  function toast(msg, undo) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.append(el); }
    el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button>되돌리기</button>' : ''}`;
    if (undo) el.querySelector('button').onclick = () => { undo(); el.classList.remove('on'); };
    requestAnimationFrame(() => el.classList.add('on'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 4200);
  }

  function done(id) {
    const it = items.find((x) => x.id === id);
    const el = document.querySelector(`[data-id="${id}"]`);
    if (!it || state.done.has(id) || pending.has(id)) return;
    const commit = () => { pending.delete(id); state.done.add(id); save(); emit(); };
    if (el) { el.classList.add('leaving'); pending.set(id, setTimeout(commit, 220)); } else commit();
    // 사라지는 도중에 되돌려도 타이머가 뒤늦게 처리해 버리지 않게 먼저 끊는다.
    toast(`처리함 · ${it.t}`, () => { clearTimeout(pending.get(id)); pending.delete(id); state.done.delete(id); save(); emit(); });
  }

  document.addEventListener('click', (e) => {
    const d = e.target.closest('[data-done]');
    if (d) { e.stopPropagation(); return done(d.dataset.done); }
    const a = e.target.closest('[data-act]');
    if (a) { const it = items.find((x) => x.id === a.dataset.act); toast(`${it.act} → ${kinds[it.kind].to} 화면에서 엽니다`); }
    const s = e.target.closest('[data-scope]');
    if (s) setScope(s.dataset.scope);
  });

  function setScope(scope, persist = true) {
    state.scope = scope;
    document.querySelectorAll('[data-scope]').forEach((b) => b.classList.toggle('on', b.dataset.scope === scope));
    if (persist) { scopePicked = true; save(); } // 시안의 기본값은 기억하지 않는다.
    emit();
  }

  /** 사이드바와 위쪽 줄을 그리고, 본문을 넣을 요소를 돌려준다. */
  function shell(extraTop = '') {
    const here = location.pathname.split('/').pop();
    document.body.innerHTML = `<div class="app">
      <nav class="side">
        <div class="office"><span class="mark">E</span>고덕 에스테잇 부동산</div>
        ${nav.map(([g, links]) => `<div class="grp">${g}</div>${links.map(([l, c]) => `<a href="#" class="${l === '대시보드' ? 'on' : ''}">${l}${c ? `<span class="cnt num">${c}</span>` : ''}</a>`).join('')}`).join('')}
      </nav>
      <div class="main">
        <header class="top">
          <h1>대시보드</h1><span class="date num">11월 16일 월요일</span>
          <span class="sp"></span>${extraTop}
          <div class="seg" role="tablist" aria-label="범위"><button data-scope="mine" class="${state.scope === 'mine' ? 'on' : ''}">내 것</button><button data-scope="all" class="${state.scope === 'all' ? 'on' : ''}">사무소 전체</button></div>
          <div class="seg" aria-label="시안">${demos.map(([f, l]) => `<a href="${f}" class="${f === here ? 'on' : ''}">${l}</a>`).join('')}</div>
        </header>
        <div class="body" id="body"></div>
      </div></div>`;
    return document.getElementById('body');
  }

  const kpiStrip = () => `<div class="kpis">${kpi.map((k) => `<a class="kpi" href="#"><div class="l">${k.l}</div><div class="v num">${k.v}</div><div class="f num">${k.f}</div></a>`).join('')}</div>`;

  function brief() {
    const v = visible();
    const late = v.filter((it) => it.off < 0).length;
    const today = v.filter((it) => it.off === 0).length;
    const whose = state.scope === 'all' ? '사무소에' : '서연 님,';
    return `<p class="brief">${whose} 오늘 챙길 일 <b class="num">${today}건</b>${late ? `<span> · </span><b class="d num">놓친 일 ${late}건</b>` : ''}<span>이 있어요.</span></p>`;
  }

  window.B = { hadStored: scopePicked, setScope, ME, items, kinds, kpi, pipeline, staff, state, visible, row, shell, kpiStrip, brief, toast, done, dueLabel, dateLabel, tone, whoChip, esc, onChange: (fn) => listeners.push(fn) };
})();
