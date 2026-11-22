(() => {
  'use strict';

  const VERSIONS = [
    { id: 'index', label: '비교', href: './index.html' },
    { id: 'v1', label: 'V1 벤토 데스크', href: './v1-bento-desk.html' },
    { id: 'v2', label: 'V2 커맨드 워크벤치', href: './v2-command-split.html' },
    { id: 'v3', label: 'V3 에디토리얼 레일', href: './v3-brokerage-rail.html' },
    { id: 'v4', label: 'V4 중개 관제 보드', href: './v4-studio-board.html' },
  ];

  const NAV_ICONS = {
    dashboard:
      '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    building:
      '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/>',
    map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
    megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    users:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><circle cx="12" cy="10" r="2"/><path d="M15 15a3 3 0 0 0-6 0"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    search: '<circle cx="10" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h2"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="m21 21-1.7-1.7"/>',
    handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8M16 13H8M16 17H8"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    todo: '<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8M13 12h8M13 18h8"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  };

  const NAV_GROUPS = [
    {
      label: '시작',
      items: [{ label: '대시보드', icon: 'dashboard', active: true }],
    },
    {
      label: '매물·공간',
      items: [
        { label: '매물관리', icon: 'building' },
        { label: '관리단지', icon: 'map' },
        { label: '광고관리', icon: 'megaphone' },
      ],
    },
    {
      label: '고객·상담',
      items: [
        { label: '고객 원장', icon: 'users' },
        { label: '연락처', icon: 'book' },
        { label: '상담분석', icon: 'message' },
      ],
    },
    {
      label: '거래·계약',
      items: [
        { label: '희망매물', icon: 'search' },
        { label: '거래관리', icon: 'handshake' },
        { label: '계약서 관리', icon: 'file' },
        { label: '수수료/정산', icon: 'wallet' },
      ],
    },
    {
      label: '업무·운영',
      items: [
        { label: '업무', icon: 'todo' },
        { label: '캘린더', icon: 'calendar' },
        { label: '직원관리', icon: 'users' },
        { label: '설정', icon: 'settings' },
      ],
    },
  ];

  function ic(name) {
    return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${NAV_ICONS[name] || ''}</svg>`;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mountShell(options = {}) {
    const activeId = options.activeId || 'v1';
    const isEmbed = new URLSearchParams(window.location.search).get('embed') === '1';
    const startCollapsed = window.innerWidth < 1120 || isEmbed;

    const shell = document.createElement('div');
    shell.className = `app-shell${startCollapsed ? ' sidebar-collapsed' : ''}`;
    if (isEmbed) shell.dataset.embed = '1';

    const navHtml = NAV_GROUPS.map(
      (g) => `
      <div class="sb-group">
        <div class="sb-group-label">${g.label}</div>
        ${g.items
          .map(
            (item) => `
          <button type="button" class="sb-item${item.active ? ' active' : ''}" data-sb-item="${item.label}">
            ${ic(item.icon)}
            <span>${item.label}</span>
          </button>`,
          )
          .join('')}
      </div>`,
    ).join('');

    const switcherHtml = VERSIONS.map(
      (v) =>
        `<a class="tb-nav-pill${v.id === activeId ? ' active' : ''}" href="${v.href}">${v.label}</a>`,
    ).join('');

    shell.innerHTML = `
      <header class="app-titlebar">
        <div class="tb-left">
          <div class="tb-dots" aria-hidden="true"><span></span><span></span><span></span></div>
          <button type="button" class="tb-icon-btn" data-role="toggleSidebar" title="사이드바 접기/펼치기" aria-label="사이드바 토글">
            <svg class="ic" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
          </button>
          <span class="tb-brand">Estait Flow</span>
          <span class="tb-crumb"><span>시작</span><span>›</span><b>대시보드</b></span>
        </div>
        <nav class="tb-center" aria-label="대시보드 시안 전환">
          ${switcherHtml}
        </nav>
        <div class="tb-right">
          <button type="button" class="tb-tool-btn" data-role="wxToggle" aria-expanded="false">
            <svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2"/></svg>
            <span>날씨·시각 미리보기</span>
          </button>
        </div>
      </header>
      <div class="app-body">
        <aside class="app-sidebar" aria-label="주 메뉴">
          <div class="sb-office">
            <div class="sb-avatar">고</div>
            <div style="min-width:0">
              <div class="sb-office-name">고덕퍼스트공인</div>
              <div class="sb-office-sub">직원 3명 · Pro</div>
            </div>
          </div>
          ${navHtml}
          <div class="sb-footer">
            <span class="sb-user-dot">현</span>
            <span>현수 · 대표공인중개사</span>
          </div>
        </aside>
        <main class="app-main">
          <div class="page-wrap">
            <div data-role="heroHost"></div>
            <div data-role="contentHost" style="display:flex;flex-direction:column;gap:14px;flex:1;min-height:0"></div>
          </div>
        </main>
      </div>

      <section class="pop-card wx-pop" data-role="wxPop" hidden aria-label="날씨와 시각 미리보기">
        <div class="wx-row"><span class="wx-lab">날씨</span><div class="wx-seg" data-role="wxSeg"></div></div>
        <div class="wx-row">
          <span class="wx-lab">시각</span>
          <input type="range" class="wx-range" data-role="wxHr" min="0" max="24" step="0.25" aria-label="시각 조절">
          <output class="wx-out" data-role="wxHrOut">14:00</output>
          <button type="button" class="wx-btn" data-role="wxNow">지금</button>
          <button type="button" class="wx-btn" data-role="wxSweep">하루 돌리기</button>
        </div>
        <div class="wx-row">
          <span class="wx-lab">계절</span><div class="wx-seg" data-role="wxSeSeg"></div>
          <button type="button" class="wx-btn" data-role="wxReplay">처음 재생</button>
        </div>
      </section>

      <div class="pop-card quick-pop" data-role="quickPop" hidden role="menu" aria-label="빠른 등록">
        <button type="button" class="quick-pop-item" data-quick="task">${ic('todo')}<span>오늘 할 일 추가</span><span class="sub">T</span></button>
        <button type="button" class="quick-pop-item" data-quick="event">${ic('calendar')}<span>일정 잡기</span><span class="sub">C</span></button>
        <button type="button" class="quick-pop-item" data-quick="property">${ic('building')}<span>새 매물 접수</span><span class="sub">P</span></button>
        <button type="button" class="quick-pop-item" data-quick="buyer">${ic('search')}<span>구매 의뢰 등록</span><span class="sub">B</span></button>
      </div>

      <div class="modal-backdrop" data-role="noticeModal" hidden>
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="noticeModalTitle">
          <div class="modal-head">
            <div>
              <h2 class="modal-title" id="noticeModalTitle"></h2>
              <div class="modal-sub" data-role="noticeModalSub"></div>
            </div>
            <button type="button" class="tb-icon-btn" data-role="closeNoticeModal" aria-label="닫기">
              <svg class="ic" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="modal-body" data-role="noticeModalBody"></div>
        </div>
      </div>

      <div class="peek-backdrop" data-role="peekBackdrop" hidden>
        <aside class="peek-drawer" role="dialog" aria-modal="true" aria-label="상세 보기">
          <div class="peek-head">
            <div style="min-width:0">
              <div data-role="peekBadges" style="display:flex;gap:6px;margin-bottom:4px"></div>
              <h2 data-role="peekTitle" style="font-size:16px;font-weight:600;line-height:22px"></h2>
              <div data-role="peekSub" style="font-size:12px;color:var(--fg3);margin-top:2px"></div>
            </div>
            <button type="button" class="tb-icon-btn" data-role="closePeek" aria-label="닫기">
              <svg class="ic" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="peek-body" data-role="peekBody"></div>
        </aside>
      </div>

      <div class="toast-stack" data-role="toastStack" aria-live="polite"></div>
    `;

    document.body.innerHTML = '';
    document.body.appendChild(shell);

    const $ = (sel) => shell.querySelector(sel);
    const heroHostEl = $('[data-role="heroHost"]');
    const contentHostEl = $('[data-role="contentHost"]');
    const wxPop = $('[data-role="wxPop"]');
    const wxToggle = $('[data-role="wxToggle"]');
    const quickPop = $('[data-role="quickPop"]');
    const noticeModal = $('[data-role="noticeModal"]');
    const peekBackdrop = $('[data-role="peekBackdrop"]');
    const toastStack = $('[data-role="toastStack"]');

    let heroApi = null;

    // Sidebar toggle
    $('[data-role="toggleSidebar"]').addEventListener('click', () => {
      shell.classList.toggle('sidebar-collapsed');
    });

    shell.querySelectorAll('[data-sb-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const label = btn.dataset.sbItem;
        if (label === '대시보드') return;
        showToast(`${label} 메뉴`, '시안 데모에서는 대시보드 화면을 중심으로 동작합니다.');
      });
    });

    // Toast helper
    function showToast(title, desc = '', undoFn = null) {
      const el = document.createElement('div');
      el.className = 'toast';
      el.innerHTML = `
        <div class="toast-text">
          <div class="toast-title">${escapeHtml(title)}</div>
          ${desc ? `<div class="toast-desc">${escapeHtml(desc)}</div>` : ''}
        </div>
        ${undoFn ? '<button type="button" class="btn btn-outline btn-xs" data-role="undo">되돌리기</button>' : ''}
      `;
      if (undoFn) {
        el.querySelector('[data-role="undo"]').addEventListener('click', () => {
          undoFn();
          el.remove();
        });
      }
      toastStack.appendChild(el);
      window.setTimeout(() => el.remove(), 4200);
    }

    // Notice modal
    function openNoticeModal(notice) {
      if (!notice) return;
      if (window.DashMockData) window.DashMockData.markNoticeRead(notice.id);
      const titleEl = $('#noticeModalTitle');
      titleEl.innerHTML = `${notice.isRequired ? '<span class="badge sm" data-tone="destructive" style="margin-right:6px;vertical-align:1px">필독</span>' : ''}${escapeHtml(notice.title)}`;
      $('[data-role="noticeModalSub"]').textContent = `에스테잇플로우 공지 · ${notice.publishedAt}`;
      $('[data-role="noticeModalBody"]').textContent = notice.body;
      noticeModal.hidden = false;
    }

    function closeNoticeModal() {
      noticeModal.hidden = true;
    }
    $('[data-role="closeNoticeModal"]').addEventListener('click', closeNoticeModal);
    noticeModal.addEventListener('click', (e) => {
      if (e.target === noticeModal) closeNoticeModal();
    });

    // Peek drawer
    function openPeekDrawer({ title, subtitle = '', badgeHtml = '', bodyHtml = '', onMount = null }) {
      $('[data-role="peekTitle"]').textContent = title || '';
      $('[data-role="peekSub"]').textContent = subtitle || '';
      $('[data-role="peekBadges"]').innerHTML = badgeHtml || '';
      const body = $('[data-role="peekBody"]');
      body.innerHTML = bodyHtml || '';
      peekBackdrop.hidden = false;
      if (typeof onMount === 'function') onMount(body);
    }

    function closePeekDrawer() {
      peekBackdrop.hidden = true;
    }
    $('[data-role="closePeek"]').addEventListener('click', closePeekDrawer);
    peekBackdrop.addEventListener('click', (e) => {
      if (e.target === peekBackdrop) closePeekDrawer();
    });

    // Quick create popover
    function openQuickCreate(anchorEl) {
      if (!quickPop.hidden) {
        quickPop.hidden = true;
        return;
      }
      wxPop.hidden = true;
      wxToggle.setAttribute('aria-expanded', 'false');
      const rect = anchorEl.getBoundingClientRect();
      quickPop.style.top = `${rect.bottom + 6}px`;
      quickPop.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
      quickPop.hidden = false;
    }

    quickPop.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-quick]');
      if (!btn) return;
      quickPop.hidden = true;
      const kind = btn.dataset.quick;
      if (kind === 'task' && window.DashMockData) {
        const title = window.prompt('오늘 할 일을 입력하세요:', '고덕아르테온 305동 소유자 연락 확인');
        if (title && title.trim()) {
          window.DashMockData.addTask(title.trim());
          showToast('오늘 할 일에 추가했습니다', title.trim());
        }
        return;
      }
      const labels = {
        event: '새 일정 등록',
        property: '새 매물 접수',
        buyer: '구매 의뢰 등록',
      };
      showToast(labels[kind] || '빠른 등록', '시안 데모에서는 해당 화면으로 이동하는 진입점입니다.');
    });

    // Weather preview popover
    function syncWxPop() {
      if (!heroApi) return;
      const st = heroApi.getState();
      $('[data-role="wxHr"]').value = st.hour;
      $('[data-role="wxHrOut"]').textContent = st.clockLabel;
      $('[data-role="wxSweep"]').textContent = st.sweeping ? '멈추기' : '하루 돌리기';
      $('[data-role="wxSeg"]').querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.v === st.preset));
      });
      $('[data-role="wxSeSeg"]').querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.v === st.season));
      });
    }

    function bindHero(api) {
      heroApi = api;
      const st = api.getState();
      $('[data-role="wxSeg"]').innerHTML = Object.entries(st.presets)
        .map(([k, v]) => `<button type="button" data-v="${k}">${v.name}</button>`)
        .join('');
      $('[data-role="wxSeSeg"]').innerHTML = Object.entries(st.seasons)
        .map(([k, v]) => `<button type="button" data-v="${k}">${v.name}</button>`)
        .join('');
      syncWxPop();
    }

    wxToggle.addEventListener('click', () => {
      const nextHidden = !wxPop.hidden;
      wxPop.hidden = nextHidden;
      wxToggle.setAttribute('aria-expanded', String(!nextHidden));
      if (!nextHidden) {
        quickPop.hidden = true;
        syncWxPop();
      }
    });

    $('[data-role="wxSeg"]').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && heroApi) {
        heroApi.setWeather(b.dataset.v);
        syncWxPop();
      }
    });
    $('[data-role="wxSeSeg"]').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && heroApi) {
        heroApi.setSeason(b.dataset.v);
        syncWxPop();
      }
    });
    $('[data-role="wxHr"]').addEventListener('input', (e) => {
      if (heroApi) {
        heroApi.setHour(+e.target.value, true);
        syncWxPop();
      }
    });
    $('[data-role="wxHr"]').addEventListener('change', (e) => {
      if (heroApi) heroApi.setHour(+e.target.value, false);
    });
    $('[data-role="wxNow"]').addEventListener('click', () => {
      if (!heroApi) return;
      const d = new Date();
      heroApi.setHour(d.getHours() + d.getMinutes() / 60, false);
      syncWxPop();
    });
    $('[data-role="wxSweep"]').addEventListener('click', () => {
      if (heroApi) {
        heroApi.toggleDaySweep();
        syncWxPop();
      }
    });
    $('[data-role="wxReplay"]').addEventListener('click', () => {
      if (heroApi) heroApi.replay();
    });

    document.addEventListener('click', (e) => {
      if (!wxPop.hidden && !e.target.closest('[data-role="wxPop"]') && !e.target.closest('[data-role="wxToggle"]')) {
        wxPop.hidden = true;
        wxToggle.setAttribute('aria-expanded', 'false');
      }
      if (!quickPop.hidden && !e.target.closest('[data-role="quickPop"]') && !e.target.closest('[data-role="quickCreate"]')) {
        quickPop.hidden = true;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!noticeModal.hidden) closeNoticeModal();
        if (!peekBackdrop.hidden) closePeekDrawer();
        if (!wxPop.hidden) {
          wxPop.hidden = true;
          wxToggle.setAttribute('aria-expanded', 'false');
        }
        if (!quickPop.hidden) quickPop.hidden = true;
      }
    });

    return {
      shell,
      heroHostEl,
      contentHostEl,
      bindHero,
      syncWxPop,
      showToast,
      openNoticeModal,
      closeNoticeModal,
      openQuickCreate,
      openPeekDrawer,
      closePeekDrawer,
      escapeHtml,
    };
  }

  window.mountDashShell = mountShell;
})();
