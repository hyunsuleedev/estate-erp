/* 에스테잇플로우 UI 톤 개선 데모 — 창 틀(타이틀바·사이드바·작업 면)과 공용 도우미 */
(() => {
  // lucide 아이콘 경로 (24×24, 선 1.75)
  const P = {
    search: '<circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4.2-4.2"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chevDown: '<path d="m6 9 6 6 6-6"/>',
    chevLeft: '<path d="m15 18-6-6 6-6"/>',
    chevRight: '<path d="m9 18 6-6-6-6"/>',
    chevsRight: '<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    filter: '<path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/>',
    sort: '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
    sliders: '<path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    table: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M12 3v18"/>',
    board: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
    map: '<path d="M14.1 5.55a2 2 0 0 0 1.8 0l3.66-1.83A1 1 0 0 1 21 4.62v12.76a1 1 0 0 1-.55.9l-4.56 2.27a2 2 0 0 1-1.78 0l-4.22-2.1a2 2 0 0 0-1.78 0l-3.66 1.83A1 1 0 0 1 3 19.38V6.62a1 1 0 0 1 .55-.9l4.56-2.27a2 2 0 0 1 1.78 0z"/><path d="M15 5.76v15"/><path d="M9 3.24v15"/>',
    dash: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    building: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
    megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    bookUser: '<path d="M15 13a3 3 0 1 0-6 0"/><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/><circle cx="12" cy="8" r="2"/>',
    msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    userSearch: '<circle cx="10" cy="7" r="4"/><path d="M10.3 15H7a4 4 0 0 0-4 4v2"/><circle cx="17" cy="17" r="3"/><path d="m21 21-1.9-1.9"/>',
    handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    todo: '<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
    cal: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    settings: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    pin: '<path d="M20 10c0 5-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    won: '<circle cx="12" cy="12" r="9"/><path d="M8 9l1.5 6L12 10l2.5 5L16 9"/>',
    ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    tag: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    expand: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/>',
    sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/>',
    copy: '<rect width="13" height="13" x="9" y="9" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    note: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    arrowUpRight: '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/>',
  };
  const icon = (n, cls = '') =>
    `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

  const STAFF = { 이현수: '#5d6f91', 박서연: '#b0704f', 최민준: '#4b8068', 정다은: '#8b6aab' };
  const av = (name, size = '') =>
    `<span class="av ${size}" style="background:${STAFF[name] || '#9a968f'}" title="${name}">${name[0]}</span>`;
  const who = (name) => `<span class="who">${av(name)}${name}</span>`;

  // 가격(만원) → "15억 8,000"
  const won = (v) => {
    if (v == null) return '';
    const eok = Math.floor(v / 10000);
    const man = v % 10000;
    if (!eok) return man.toLocaleString('ko-KR');
    return man ? `${eok}억 ${man.toLocaleString('ko-KR')}` : `${eok}억`;
  };

  const NAV = [
    { g: '시작', items: [{ id: 'dashboard', l: '대시보드', i: 'dash', href: 'dashboard.html' }] },
    {
      g: '매물·공간',
      items: [
        { id: 'properties', l: '매물관리', i: 'building', href: 'properties.html' },
        { id: 'sites', l: '관리단지', i: 'map', href: 'sites.html' },
        { id: 'ads', l: '광고관리', i: 'megaphone', children: [
          { id: 'ad-note', l: '광고노트', href: 'ad-note.html' },
          { id: 'my-ads', l: '내광고관리', href: 'my-ads.html' },
        ] },
      ],
    },
    {
      g: '고객·상담',
      items: [
        { id: 'customers', l: '고객 원장', i: 'users', href: 'customers.html' },
        { id: 'contacts', l: '연락처', i: 'bookUser', href: 'contacts.html' },
        { id: 'consult', l: '상담분석', i: 'msg', href: 'consultations.html' },
      ],
    },
    {
      g: '거래·계약',
      items: [
        { id: 'wanted', l: '희망매물', i: 'userSearch', href: 'wanted.html' },
        { id: 'deals', l: '거래관리', i: 'handshake', href: 'deals.html' },
        { id: 'contracts', l: '계약서 관리', i: 'file', href: 'contracts.html' },
        { id: 'cash', l: '수수료/정산', i: 'wallet', children: [
          { id: 'cashflow', l: '캐시플로우', href: 'cashflow.html' },
          { id: 'cash-ledger', l: '수금 원장', href: 'cashflow-ledger.html' },
          { id: 'cash-partner', l: '공동중개 수수료', href: 'cashflow-partner.html' },
          { id: 'cash-settle', l: '직원 정산', href: 'cashflow-settlements.html' },
          { id: 'cash-my', l: '내 수수료', href: 'cashflow-my.html' },
          { id: 'cash-expenses', l: '고정비 설정', href: 'cashflow-expenses.html' },
        ] },
      ],
    },
    {
      g: '업무·운영',
      items: [
        { id: 'tasks', l: '업무', i: 'todo', href: 'tasks.html', badge: 4 },
        { id: 'calendar', l: '캘린더', i: 'cal', href: 'calendar.html' },
        { id: 'employees', l: '직원관리', i: 'users', href: 'employees.html' },
        { id: 'settings', l: '설정', i: 'settings', href: 'settings.html' },
      ],
    },
  ];

  const TABS = [
    { id: 'properties', l: '매물관리', i: 'building', href: 'properties.html' },
    { id: 'customers', l: '고객 원장', i: 'users', href: 'customers.html' },
    { id: 'ad-note', l: '광고노트', i: 'megaphone', href: 'ad-note.html' },
    { id: 'tasks', l: '업무', i: 'todo', href: 'tasks.html' },
  ];

  const DEMOS = [
    { id: 'index', l: '목록', href: 'index.html' },
    { id: 'dashboard', l: '대시보드', href: 'dashboard.html' },
    { id: 'properties', l: '매물관리', href: 'properties.html' },
    { id: 'sites', l: '관리단지', href: 'sites.html' },
    { id: 'ad-note', l: '광고노트', href: 'ad-note.html' },
    { id: 'my-ads', l: '내광고관리', href: 'my-ads.html' },
    { id: 'customers', l: '고객 원장', href: 'customers.html' },
    { id: 'contacts', l: '연락처', href: 'contacts.html' },
    { id: 'consult', l: '상담분석', href: 'consultations.html' },
    { id: 'wanted', l: '희망매물', href: 'wanted.html' },
    { id: 'deals', l: '거래관리', href: 'deals.html' },
    { id: 'contracts', l: '계약서 관리', href: 'contracts.html' },
    { id: 'cashflow', l: '수수료/정산', href: 'cashflow.html' },
    { id: 'tasks', l: '업무', href: 'tasks.html' },
    { id: 'calendar', l: '캘린더', href: 'calendar.html' },
    { id: 'employees', l: '직원관리', href: 'employees.html' },
    { id: 'settings', l: '설정', href: 'settings.html' },
    { id: 'components', l: '부품 견본', href: 'components.html' },
  ];


  // 최근 본 화면: 방문할 때마다 기록해 사이드바 맨 위에 보여 준다
  function allPages() {
    const out = [];
    NAV.forEach((g) => g.items.forEach((it) => {
      if (it.href) out.push({ id: it.id, l: it.l, i: it.i, href: it.href, g: g.g });
      (it.children || []).forEach((c) => c.href && out.push({ id: c.id, l: c.l, i: it.i, href: c.href, g: it.l }));
    }));
    return out;
  }
  function recentHtml(active) {
    let ids = [];
    try { ids = JSON.parse(localStorage.getItem('ui-refresh-recent') || '[]'); } catch (e) {}
    const pages = allPages();
    try { localStorage.setItem('ui-refresh-recent', JSON.stringify([active, ...ids.filter((x) => x !== active)].slice(0, 6))); } catch (e) {}
    const list = ids.filter((x) => x !== active).map((x) => pages.find((p) => p.id === x)).filter(Boolean).slice(0, 3);
    if (!list.length) return '';
    return `<div class="nav-group recent"><div class="nav-label">최근 본 화면</div>${list.map((p) => `<a class="nav-item" href="${p.href}">${icon('clock')}<span>${p.l}</span></a>`).join('')}</div>`;
  }
  // 오늘 챙길 것: 어느 화면에서든 위쪽 '오늘' 버튼으로 연다
  const TODAY = [
    ['놓친 연락', 'danger', '정태훈 고객 · 전세 7억~8억', '4일 지남', 'customers.html', 'phone'],
    ['놓친 연락', 'danger', '한서윤 고객 · 월세 1억 / 150', '어제', 'customers.html', 'phone'],
    ['오늘 연락', 'accent', '김지현 고객 · 주말 임장 일정', '오후 2:00', 'customers.html', 'phone'],
    ['오늘 일정', 'accent', '고덕아르테온 312동 1704호 본계약', '오후 2:00', 'calendar.html', 'cal'],
    ['오늘 업무', 'accent', '본계약 서류 준비', '오늘', 'tasks.html', 'todo'],
    ['오늘 업무', 'accent', '이실장 광고 재등록', '에이전트 진행 중', 'tasks.html', 'todo'],
    ['확인 필요', 'warn', '고덕자이 102동 1101호 · 26일째 미확인', '매물', 'properties.html', 'building'],
    ['수금', 'warn', '고덕자이 108동 1902호 · 645만 연체', '18일 경과', 'cashflow-ledger.html', 'wallet'],
  ];
  function todayDrawer() {
    const old = document.querySelector('.drawer-back');
    if (old) { old.remove(); return; }
    const back = document.createElement('div');
    back.className = 'drawer-back';
    const groups = [...new Set(TODAY.map((x) => x[0]))];
    back.innerHTML = `<aside class="drawer" role="dialog" aria-label="오늘 챙길 것"><header><b>오늘 챙길 것</b><span class="t3">11월 11일 수요일</span><button class="ib" data-dclose aria-label="닫기">${icon('x')}</button></header>
      <div class="drawer-body">${groups.map((g) => { const rows = TODAY.filter((x) => x[0] === g); return `<div class="dgroup"><div class="dhead"><span class="dot ${rows[0][1]}"></span>${g}<span class="n">${rows.length}</span></div>${rows.map((x) => `<a class="drow" href="${x[4]}">${icon(x[5])}<span class="grow">${x[2]}</span><span class="t2">${x[3]}</span></a>`).join('')}</div>`; }).join('')}</div>
      <footer>어느 화면에서든 <kbd class="k">T</kbd> 로 엽니다</footer></aside>`;
    back.addEventListener('mousedown', (e) => { if (e.target === back || e.target.closest('[data-dclose]')) back.remove(); });
    document.body.append(back);
  }
  function createMenu(anchor) {
    const go = (href, msg) => () => { if (href && location.pathname.split('/').pop() !== href) location.href = href; else toast(msg); };
    menu(anchor || document.querySelector('[data-create]'), [
      { head: '새로 만들기' },
      { label: '매물 등록', icon: 'building', hint: 'P', run: go('properties.html', '새 매물 등록 창을 엽니다') },
      { label: '고객 · 구함 의뢰', icon: 'users', hint: 'U', run: go('customers.html', '구함 의뢰 창을 엽니다') },
      { label: '상담 기록', icon: 'msg', hint: 'S', run: go('consultations.html', '새 상담 창을 엽니다') },
      { label: '업무', icon: 'todo', hint: 'K', run: go('tasks.html', '새 업무 입력창을 엽니다') },
      { label: '일정', icon: 'cal', hint: 'E', run: go('calendar.html', '새 일정 창을 엽니다') },
      '-',
      { label: '거래', icon: 'handshake', run: go('deals.html', '새 거래 창을 엽니다') },
      { label: '계약서', icon: 'file', run: go('contracts.html', '계약서 등록을 엽니다') },
    ]);
  }
  function toggleSide() {
    const w = document.querySelector('.win');
    const min = w.classList.toggle('side-min');
    try { localStorage.setItem('ui-refresh-side', min ? 'min' : 'full'); } catch (e) {}
  }
  function shortcuts() {
    const old = document.querySelector('.keys-back');
    if (old) { old.remove(); return; }
    const cal = document.body.dataset.active === 'calendar';
    const K = [['어디서나', [['⌘ K', '검색 · 명령'], ...(cal ? [] : [['C', '새로 만들기'], ['T', '오늘 챙길 것']]), ['/', '이 화면에서 찾기'], ['⌘ \\', '사이드바 접기'], ['?', '단축키 보기']]],
      ['화면 이동 (G 다음에)', [['G D', '대시보드'], ['G P', '매물관리'], ['G C', '고객 원장'], ['G W', '희망매물'], ['G L', '거래관리'], ['G T', '업무'], ['G A', '캘린더']]]];
    const back = document.createElement('div');
    back.className = 'keys-back';
    back.innerHTML = `<div class="keys"><header><b>단축키</b><button class="ib" aria-label="닫기">${icon('x')}</button></header>${K.map(([h, rows]) => `<div class="kcol"><div class="kh">${h}</div>${rows.map(([k, l]) => `<div class="krow"><span>${l}</span><span>${k.split(' ').map((x) => `<kbd class="k">${x}</kbd>`).join('')}</span></div>`).join('')}</div>`).join('')}</div>`;
    back.addEventListener('mousedown', (e) => { if (e.target === back || e.target.closest('.ib')) back.remove(); });
    document.body.append(back);
  }

  function navItem(it, active) {
    const on = it.id === active || (it.children || []).some((c) => c.id === active);
    const link = it.href || (it.children && (it.children.find((c) => c.href) || {}).href);
    const tag = link ? 'a' : 'div';
    const href = link ? ` href="${link}"` : '';
    let html = `<${tag} class="nav-item${on && !it.children ? ' on' : ''}"${href}>${icon(it.i)}<span>${it.l}</span>${
      it.badge ? `<span class="badge">${it.badge}</span>` : ''
    }</${tag}>`;
    if (it.children && on) {
      html += `<div class="nav-sub">${it.children
        .map((c) => {
          const t = c.href ? 'a' : 'div';
          return `<${t} class="nav-item${c.id === active ? ' on' : ''}"${c.href ? ` href="${c.href}"` : ''}><span>${c.l}</span></${t}>`;
        })
        .join('')}</div>`;
    }
    return html;
  }

  function mountShell() {
    const active = document.body.dataset.active;
    const page = document.getElementById('page');
    const tabs = TABS.slice();
    if (!tabs.some((t) => t.id === active)) {
      NAV.forEach((g) => g.items.forEach((it) => {
        if (it.id === active) tabs.push({ id: it.id, l: it.l, i: it.i, href: it.href });
        (it.children || []).forEach((c) => { if (c.id === active) tabs.push({ id: c.id, l: c.l, i: it.i, href: c.href }); });
      }));
    }
    const win = document.createElement('div');
    win.className = 'win';
    win.innerHTML = `
      <header class="titlebar">
        <div class="tb-left">
          <div class="lights"><span></span><span></span><span></span></div>
          <button class="ib" data-sidetoggle aria-label="사이드바 접기 ⌘\\" style="margin-right:2px">${icon('board')}</button><div class="tb-nav"><button class="ib" aria-label="뒤로">${icon('chevLeft')}</button><button class="ib" aria-label="앞으로">${icon('chevRight')}</button></div>
        </div>
        <nav class="tabs">
          ${tabs.map(
            (t) =>
              `<a class="tab${t.id === active ? ' on' : ''}" href="${t.href}">${icon(t.i)}<span>${t.l}</span><span class="x">${icon('x')}</span></a>`,
          ).join('')}
          <button class="ib tab-add" aria-label="새 탭">${icon('plus')}</button>
        </nav>
      </header>
      <aside class="side">
        <div class="ws"><span class="logo">E</span>고덕 에스테잇 공인중개${icon('chevDown')}</div>
        <div class="side-search">${icon('search')}<span>검색</span><span class="kbd">⌘K</span></div>
        <button class="side-new" data-create>${icon('plus')}<span>새로 만들기</span><span class="kbd">C</span></button>
        ${recentHtml(active)}
        ${NAV.map(
          (g) => `<div class="nav-group"><div class="nav-label">${g.g}</div>${g.items.map((it) => navItem(it, active)).join('')}</div>`,
        ).join('')}
        <div class="side-foot"><div class="me">${av('이현수', 'md')}<span>이현수</span><small>대표</small></div></div>
      </aside>
      <section class="panel"></section>`;
    let crumb = ['', ''];
    NAV.forEach((g) => g.items.forEach((it) => {
      if (it.id === active) crumb = [g.g, it.l];
      (it.children || []).forEach((c) => { if (c.id === active) crumb = [it.l, c.l]; });
    }));
    win.querySelector('.panel').innerHTML = `<div class="topbar">
      <div class="crumbs"><span>${crumb[0]}</span>${icon('chevRight')}<b>${crumb[1]}</b></div>
      <span class="sp"></span>
      <button class="btn quiet sm" data-today>${icon('cal')}오늘<span class="cnt">${TODAY.length}</span></button>
      <span class="saved">${icon('check')}모두 저장됨</span>
      <span class="avs">${av('박서연')}${av('최민준')}${av('정다은')}</span>
      <button class="btn sm" data-share>${icon('arrowUpRight')}공유</button>
      <button class="ib bell" aria-label="알림 3" data-bell>${icon('msg')}</button>
      <button class="ib" aria-label="도움말" data-help>${icon('info')}</button>
    </div>`;
    win.querySelector('.panel').appendChild(page);
    document.body.prepend(win);
    try { if (localStorage.getItem('ui-refresh-side') === 'min') win.classList.add('side-min'); } catch (e) {}
    // 화면이 바뀔 때 본문이 살짝 떠오르며 나타난다
    const panelEl = win.querySelector('.panel');
    panelEl.classList.add('enter');
    setTimeout(() => panelEl.classList.remove('enter'), 320);
  }

  function notes(list, subtitle) {
    const active = document.body.dataset.active;
    const btn = document.createElement('button');
    btn.className = 'dn-btn';
    btn.innerHTML = `${icon('info')}이 화면에서 바뀐 점 ${list.length}`;
    const card = document.createElement('div');
    card.className = 'dn';
    card.hidden = true;
    card.innerHTML = `<h3>이 화면에서 바뀐 점</h3><p class="sub">${subtitle}</p><ol>${list
      .map((x) => `<li>${x}</li>`)
      .join('')}</ol><div class="foot">${DEMOS.map(
      (d) => `<a class="${d.id === active ? 'on' : ''}" href="${d.href}">${d.l}</a>`,
    ).join('')}</div>`;
    btn.addEventListener('click', () => (card.hidden = !card.hidden));
    document.body.append(card, btn);
    if (new URLSearchParams(location.search).has('notes')) card.hidden = false;
  }

  // ── 메뉴 ──
  let openMenu = null;
  const closeMenu = () => { if (openMenu) { openMenu.remove(); openMenu = null; } };
  function menu(anchor, items, opts = {}) {
    const same = openMenu && openMenu._anchor === anchor;
    closeMenu();
    if (same) return;
    const m = document.createElement('div');
    m.className = 'menu' + (opts.wide ? ' wide' : '');
    m.innerHTML = items.map((it, i) =>
      it === '-' ? '<div class="menu-sep"></div>'
      : it.head ? `<div class="menu-head">${it.head}</div>`
      : it.note ? `<div class="note" data-i="${i}">${it.html || ''}<div>${it.note}<small>${it.sub || ''}</small></div></div>`
      : `<button class="menu-item ${it.danger ? 'danger' : ''}" data-i="${i}">${it.html || (it.icon ? icon(it.icon) : '')}<span>${it.label}</span>${it.hint ? `<small>${it.hint}</small>` : ''}${it.on ? icon('check', 'chk') : ''}</button>`,
    ).join('');
    document.body.append(m);
    const r = anchor.getBoundingClientRect();
    const x = Math.max(8, Math.min(opts.right ? r.right - m.offsetWidth : r.left, innerWidth - m.offsetWidth - 8));
    let y = r.bottom + 4;
    if (y + m.offsetHeight > innerHeight - 8) y = Math.max(8, r.top - m.offsetHeight - 4);
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    m.style.transformOrigin = opts.right ? 'top right' : 'top left';
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const it = items[+b.dataset.i];
      closeMenu();
      if (it.run) it.run();
    });
    m._anchor = anchor;
    openMenu = m;
  }
  document.addEventListener('mousedown', (e) => {
    if (openMenu && !e.target.closest('.menu') && !(openMenu._anchor && openMenu._anchor.contains(e.target))) closeMenu();
  }, true);

  // ── 알림 ──
  function toast(msg, undo) {
    let host = document.querySelector('.toasts');
    if (!host) { host = document.createElement('div'); host.className = 'toasts'; document.body.append(host); }
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `${icon('check')}<span>${msg}</span>${undo ? '<button>실행 취소</button>' : ''}`;
    host.append(t);
    while (host.children.length > 3) host.firstElementChild.remove(); // 알림은 세 개까지만 쌓는다
    const bye = () => { t.classList.add('out'); setTimeout(() => t.remove(), 200); };
    if (undo) t.querySelector('button').onclick = () => { undo(); bye(); };
    setTimeout(bye, 3600);
  }

  // ── 명령 창 ──
  function palette() {
    if (document.querySelector('.cmdk-back')) return;
    const items = [];
    NAV.forEach((g) => g.items.forEach((it) => {
      if (it.href) items.push({ l: it.l, i: it.i, hint: g.g, href: it.href });
      (it.children || []).forEach((c) => c.href && items.push({ l: c.l, i: it.i, hint: it.l, href: c.href }));
    }));
    [['새 매물 등록', 'properties.html'], ['새 고객 · 구함 의뢰', 'customers.html'], ['새 업무', 'tasks.html'], ['새 상담 기록', 'consultations.html'], ['새 일정', 'calendar.html']].forEach(([l, href]) => items.push({ l, i: 'plus', hint: '만들기', href }));
    [['김지현', '매수 · 15억~17억 · 오늘 연락'], ['박준호', '매수 · 16억~18억'], ['정태훈', '전세 · 연락 4일 지남'], ['윤재경', '전세 · 6억~6억 5,000'], ['한서윤', '월세 · 1억 / 150']].forEach(([l, d]) => items.push({ l, d, i: 'user', hint: '고객', href: 'customers.html' }));
    [['고덕그라시움 103동 3401호', '매매 16억 8,000만 · 거래 가능'], ['고덕그라시움 117동 1203호', '전세 7억 8,000만 · 매매 15억 9,000만'], ['고덕아르테온 312동 1704호', '매매 15억 2,000만 · 계약 진행'], ['고덕자이 102동 1101호', '전세 6억 1,000만 · 확인 필요']].forEach(([l, d]) => items.push({ l, d, i: 'building', hint: '매물', href: 'properties.html' }));
    [['본계약 서류 준비', '오늘 · 이현수'], ['집주인 가격 재확인', '기한 지남 · 정다은']].forEach(([l, d]) => items.push({ l, d, i: 'todo', hint: '업무', href: 'tasks.html' }));
    const back = document.createElement('div');
    back.className = 'cmdk-back';
    back.innerHTML = `<div class="cmdk"><div class="cmdk-in">${icon('search')}<input placeholder="화면, 매물, 고객 검색 또는 명령 입력"><kbd class="k">esc</kbd></div><div class="cmdk-list"></div><div class="cmdk-foot"><span>↑↓ 이동</span><span>↵ 열기</span></div></div>`;
    document.body.append(back);
    const input = back.querySelector('input');
    const list = back.querySelector('.cmdk-list');
    let cur = 0;
    let shown = items;
    const draw = () => {
      const q = input.value.trim();
      shown = items.filter((x) => (!q ? !x.d : x.l.includes(q) || x.hint.includes(q) || (x.d || '').includes(q)));
      const order = ['만들기', '고객', '매물', '업무'];
      if (q) shown.sort((a, b) => (order.indexOf(a.hint) + 1 || 9) - (order.indexOf(b.hint) + 1 || 9));
      cur = Math.min(cur, Math.max(0, shown.length - 1));
      list.innerHTML = shown.length
        ? shown.map((x, i) => `${q && (i === 0 || shown[i - 1].hint !== x.hint) ? `<div class="cmdk-h">${x.hint}</div>` : ''}<div class="cmdk-item ${i === cur ? 'on' : ''}" data-i="${i}">${icon(x.i)}<span>${x.l}</span>${x.d ? `<span class="d">${x.d}</span>` : ''}<small>${x.hint}</small></div>`).join('')
        : '<div class="cmdk-empty">찾는 항목이 없습니다</div>';
    };
    const here = (href) => location.pathname.split('/').pop() === href;
    const go = (x) => { back.remove(); if (!x) return; if (x.href && !here(x.href)) location.href = x.href; else if (x.hint === '만들기') toast(`${x.l} 창을 엽니다`); else if (!x.href) toast(`${x.l} 창을 엽니다`); };
    input.addEventListener('input', () => { cur = 0; draw(); });
    input.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return; // 조합 중에는 방향키·Esc도 입력기에 맡긴다
      if (e.key === 'ArrowDown') { cur = Math.min(cur + 1, shown.length - 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { cur = Math.max(cur - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) go(shown[cur]); // 한글 조합 중 Enter는 무시
      else if (e.key === 'Escape') { back.remove(); e.stopPropagation(); }
    });
    list.addEventListener('mousemove', (e) => { const it = e.target.closest('.cmdk-item'); if (it && +it.dataset.i !== cur) { cur = +it.dataset.i; draw(); } });
    list.addEventListener('click', (e) => { const it = e.target.closest('.cmdk-item'); if (it) go(shown[+it.dataset.i]); });
    back.addEventListener('mousedown', (e) => { if (e.target === back) back.remove(); });
    draw();
    input.focus();
  }

  function wire() {
    let gAt = 0;
    const GO = { d: 'dashboard.html', p: 'properties.html', c: 'customers.html', w: 'wanted.html', l: 'deals.html', t: 'tasks.html', a: 'calendar.html' };
    document.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); toggleSide(); return; }
      const el = e.target;
      const typing = el.matches && el.matches('input, textarea, select, [contenteditable]');
      if (e.key === 'Escape') { document.querySelectorAll('.drawer-back, .keys-back').forEach((x) => x.remove()); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      // 화면마다 창의 클래스 이름이 달라서, 보이는 대화창·메뉴·서랍이 하나라도 있으면 전역 단축키를 쉰다
      const layer = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open], .cmdk-back, .drawer-back, .keys-back, .menu, .modal, .dlg, .dlg-back, .insp-back')]
        .some((x) => !x.hidden && x.getClientRects().length > 0);
      if (layer && e.key !== '?') return;
      if (layer) { if (document.querySelector('.keys-back')) { e.preventDefault(); shortcuts(); } return; }
      const k = e.key.toLowerCase();
      if (Date.now() - gAt < 900 && GO[k]) { gAt = 0; e.preventDefault(); location.href = GO[k]; return; }
      if (k === 'g') { gAt = Date.now(); return; }
      if (e.key === '?') { e.preventDefault(); shortcuts(); return; }
      if (e.defaultPrevented) return; // 화면이 먼저 쓴 키는 건드리지 않는다
      const own = document.body.dataset.active; // 캘린더는 T(오늘 날짜)·N을 직접 쓴다
      if (k === 'c' && own !== 'calendar') { e.preventDefault(); createMenu(); }
      else if (k === 't' && own !== 'calendar') { e.preventDefault(); todayDrawer(); }
      else if (e.key === '/') { const f = document.querySelector('#page .field input'); if (f) { e.preventDefault(); f.focus(); } }
    });
    document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); } });
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('.side-search')) return palette();
      const cr = t.closest('[data-create]');
      if (cr) return createMenu(cr);
      if (t.closest('[data-today]')) return todayDrawer();
      if (t.closest('[data-sidetoggle]')) return toggleSide();
      if (t.closest('[data-share]')) return toast('이 보기의 링크를 복사했습니다');
      const bell = t.closest('[data-bell]');
      if (bell) return menu(bell, [
        { head: '알림' },
        { note: '<b>박서연</b>님이 고덕그라시움 117동 1203호 가격을 바꿨습니다', sub: '12분 전', html: av('박서연', 'md') },
        { note: '이실장 광고 재등록을 에이전트가 끝냈습니다', sub: '1시간 전', html: av('정다은', 'md') },
        { note: '<b>김지현</b> 고객 연락 시간입니다 (오후 2:00)', sub: '오늘', html: av('이현수', 'md') },
        '-', { label: '모두 읽음으로 표시', icon: 'check', run: () => toast('알림을 모두 읽음으로 표시했습니다') },
      ], { right: true, wide: true });
      const help = t.closest('[data-help]');
      if (help) return menu(help, [{ label: '단축키 보기', icon: 'sliders', hint: '?' }, { label: '사용 안내', icon: 'file' }, { label: '문의하기', icon: 'msg' }], { right: true });
      const ws = t.closest('.ws');
      if (ws) return menu(ws, [{ head: '사무소' }, { label: '고덕 에스테잇 공인중개', icon: 'building', on: true }, { label: '상일 에스테잇 2호점', icon: 'building' }, '-', { label: '사무소 설정', icon: 'settings' }, { label: '직원 초대', icon: 'users' }]);
      const me = t.closest('.me');
      if (me) return menu(me, [{ label: '내 정보', icon: 'user' }, { label: '알림 설정', icon: 'msg' }, '-', { label: '로그아웃', icon: 'arrowUpRight', danger: true }]);
    });
  }

  const THEMES = [
    ['notion', '웜그레이', '#2c2c2b'],
    ['m3', 'Google', '#0b57d0'],
    ['radix', 'Radix', '#3e63dd'],
    ['toss', '토스', '#3182f6'],
    ['monday', 'monday', '#0073ea'],
  ];
  function setTheme(id) {
    if (id === 'notion') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = id;
    try { localStorage.setItem('ui-refresh-theme', id); } catch (e) {}
    document.querySelectorAll('.theme-sw button').forEach((b) => b.classList.toggle('on', b.dataset.t === id));
  }
  function mountThemes() {
    let cur = new URLSearchParams(location.search).get('theme');
    try { cur = cur || localStorage.getItem('ui-refresh-theme'); } catch (e) {}
    if (!THEMES.some((t) => t[0] === cur)) cur = 'notion';
    const sw = document.createElement('div');
    sw.className = 'theme-sw';
    sw.innerHTML = THEMES.map((t) => `<button data-t="${t[0]}"><i style="background:${t[2]}"></i>${t[1]}</button>`).join('');
    sw.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setTheme(b.dataset.t); });
    document.body.append(sw);
    setTheme(cur);
  }

  window.UI = { icon, av, who, won, notes, setTheme, menu, toast, palette, createMenu, todayDrawer, shortcuts, toggleSide };
  mountThemes();
  if (document.getElementById('page')) { mountShell(); wire(); }
  document.querySelectorAll('[data-ic]').forEach((el) => (el.outerHTML = icon(el.dataset.ic, el.className)));
})();
