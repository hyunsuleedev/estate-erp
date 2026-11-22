(() => {
  'use strict';

  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    building: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4M10 10h4M10 14h4M2 22h20"/>',
    map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
    megaphone: '<path d="m3 11 18-5v12L3 14v-3Z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    kanban: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
    book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    todo: '<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8M13 12h8M13 18h8"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    sidebar: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  };

  const NAV_GROUPS = [
    {
      label: '시작',
      items: [{ key: '/dashboard', label: '대시보드', icon: 'dashboard' }],
    },
    {
      label: '매물·공간',
      items: [
        { key: '/properties', label: '매물관리', icon: 'building' },
        { key: '/sites', label: '관리단지', icon: 'map' },
        { key: '/properties/naver-my-ads', label: '광고관리', icon: 'megaphone' },
      ],
    },
    {
      label: '고객·상담',
      items: [
        { key: '/projects', label: '프로젝트', icon: 'kanban' },
        { key: '/contacts', label: '연락처', icon: 'book' },
        { key: '/consultations', label: '상담분석', icon: 'message' },
      ],
    },
    {
      label: '거래·계약',
      items: [
        { key: '/wanted-properties', label: '희망매물', icon: 'search' },
        { key: '/deals', label: '거래관리', icon: 'handshake' },
        { key: '/contracts', label: '계약서 관리', icon: 'file' },
        { key: '/cashflow', label: '수수료/정산', icon: 'wallet' },
      ],
    },
    {
      label: '업무·운영',
      items: [
        { key: '/tasks', label: '업무', icon: 'todo' },
        { key: '/calendar', label: '캘린더', icon: 'calendar' },
        { key: '/employees', label: '직원관리', icon: 'users' },
        { key: '/settings', label: '설정', icon: 'settings' },
      ],
    },
  ];

  const VARIANTS = [
    { id: 'hub', label: '비교', href: './desktop-hub.html' },
    { id: 'n1', label: 'N1 홈', href: './desktop-n1-home.html' },
    { id: 'n2', label: 'N2 문서', href: './desktop-n2-journal.html' },
    { id: 'n3', label: 'N3 타임블록', href: './desktop-n3-calendar.html' },
    { id: 'n4', label: 'N4 사이드픽', href: './desktop-n4-peek.html' },
    { id: 'hybrid', label: 'N2+레일', href: './desktop-hybrid.html' },
    { id: 'wide', label: '3단 풀화면', href: './desktop-wide.html' },
  ];

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function svgIcon(name, cls = 'ic') {
    return `<svg class="${cls}" viewBox="0 0 24 24">${ICONS[name] || ICONS.file}</svg>`;
  }

  window.mountNotionDesktop = function mountNotionDesktop(options = {}) {
    const Data = window.DashMockData;
    const isEmbed = new URLSearchParams(window.location.search).get('embed') === '1';
    if (isEmbed) document.body.classList.add('is-embed');

    const rootWrap = document.createElement('div');
    rootWrap.className = 'nt-app';
    rootWrap.innerHTML = `
      <header class="nt-titlebar">
        <div class="nt-brand-zone">
          <div class="nt-lights" aria-hidden="true">
            <span class="nt-light r"></span>
            <span class="nt-light y"></span>
            <span class="nt-light g"></span>
          </div>
          <span class="nt-brand">Estaitt</span>
          <span class="nt-spacer"></span>
          <button type="button" class="nt-icon-btn" id="ntSidebarToggle" aria-label="사이드바 토글" title="사이드바 토글 (⌘\\)">
            ${svgIcon('sidebar')}
          </button>
        </div>

        <div class="nt-nav-arrows">
          <button type="button" class="nt-icon-btn" id="ntBackBtn" aria-label="이전 탭" disabled>
            <svg class="ic" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <button type="button" class="nt-icon-btn" id="ntFwdBtn" aria-label="다음 탭" disabled>
            <svg class="ic" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>

        <div class="nt-tabstrip" id="ntTabStrip" role="tablist" aria-label="열린 탭"></div>
        <button type="button" class="nt-tab-add" id="ntTabAdd" aria-label="빠른 열기" title="빠른 열기 (⌘K)">
          ${svgIcon('plus', 'ic ic-sm')}
        </button>

        <div class="nt-title-right">
          <nav class="nt-variant-pills" aria-label="시안 전환">
            ${VARIANTS.map(
              (v) =>
                `<a href="${v.href}" class="nt-vpill${v.id === options.activeVariant ? ' active' : ''}">${v.label}</a>`,
            ).join('')}
          </nav>
          <button type="button" class="nt-ghost-util" id="ntCtiBtn" title="수신 전화 오버레이 미리보기">
            ${svgIcon('phone', 'ic ic-sm')}
            <span>수신 전화</span>
          </button>
          <button type="button" class="nt-ghost-util" id="ntWeatherBtn" title="날씨·시각 미리보기">
            ${svgIcon('sun', 'ic ic-sm')}
            <span>날씨·시각</span>
          </button>
        </div>
      </header>

      <div class="nt-body">
        <aside class="nt-sidebar" id="ntSidebar" aria-label="주 메뉴"></aside>
        <div class="nt-edge-sensor" id="ntEdgeSensor" aria-hidden="true"></div>
        <aside class="nt-sidebar-preview" id="ntSidebarPreview" aria-label="사이드바 미리보기"></aside>

        <main class="nt-workspace">
          <section class="nt-tab-view${options.lockedViewport ? ' is-locked' : ''}" id="ntHomeView" aria-label="대시보드 홈">
            <div class="${options.wrapClass || 'nt-home-inner'}">
              <div id="ntHeroHost"></div>
              <div id="ntContentHost"></div>
            </div>
          </section>
          <section class="nt-tab-view" id="ntDetailView" hidden aria-label="열린 상세 탭"></section>
        </main>
      </div>

      <aside class="nt-cti-overlay" id="ntCtiOverlay" role="dialog" aria-label="전화 수신 오버레이"></aside>
      <div class="nt-ctx-menu" id="ntCtxMenu" role="menu"></div>
      <div class="nt-palette-backdrop" id="ntCmdPalette" aria-hidden="true">
        <div class="nt-palette-box" role="dialog" aria-label="빠른 검색 및 실행">
          <div class="nt-palette-in">
            ${svgIcon('search', 'ic')}
            <input type="text" class="nt-palette-input" id="ntCmdInput" placeholder="거래, 할 일, 신호, 공지 검색 또는 명령 실행...">
          </div>
          <div class="nt-palette-list" id="ntCmdList"></div>
        </div>
      </div>
      <div class="nt-weather-pop" id="ntWeatherPop" role="dialog" aria-label="날씨 및 시각 미리보기"></div>
      <div class="nt-toast-wrap" id="ntToastWrap" aria-live="polite"></div>
    `;

    document.body.innerHTML = '';
    document.body.appendChild(rootWrap);

    const state = {
      sidebarOpen: typeof options.initialSidebarOpen === 'boolean' ? options.initialSidebarOpen : !isEmbed,
      sidebarPreviewOpen: false,
      tabs: [{ id: 'tab-dashboard', key: 'dashboard', title: '대시보드', kind: 'dashboard', pinned: true, dotColor: '' }],
      activeTabId: 'tab-dashboard',
      history: ['tab-dashboard'],
      historyIdx: 0,
      cti: {
        open: false,
        phase: 'ringing',
        callerName: '김도윤',
        callerRole: '고덕아르테온 305동 1203호 매수인',
        phone: '010-2847-1903',
        memo: '오늘 17:30 본계약 특약 문구 최종 확인 요청',
        elapsedSec: 18,
      },
      cmdOpen: false,
      cmdQuery: '',
      cmdIdx: 0,
      weatherOpen: false,
    };

    let ctiTimer = 0;
    let previewTimer = 0;

    const $ = (sel) => rootWrap.querySelector(sel);
    const tabStrip = $('#ntTabStrip');
    const sidebarEl = $('#ntSidebar');
    const previewEl = $('#ntSidebarPreview');
    const homeView = $('#ntHomeView');
    const detailView = $('#ntDetailView');
    const heroHost = $('#ntHeroHost');
    const contentHost = $('#ntContentHost');
    const ctiOverlay = $('#ntCtiOverlay');
    const ctxMenu = $('#ntCtxMenu');
    const cmdPalette = $('#ntCmdPalette');
    const cmdInput = $('#ntCmdInput');
    const cmdList = $('#ntCmdList');
    const weatherPop = $('#ntWeatherPop');
    const toastWrap = $('#ntToastWrap');

    const initial = Data.getScopedData();
    const hero = window.mountDashHero(heroHost, {
      officeName: Data.state.officeName,
      userName: Data.state.userName,
      scope: initial.scope,
      counts: initial.heroCounts,
      flags: initial.heroFlags,
      onScopeChange: (nextScope) => Data.setScope(nextScope),
      onPin: (pin) => {
        if (activeTab().id !== 'tab-dashboard') activateTab('tab-dashboard');
        options.onPin?.(pin);
      },
      onQuickCreate: () => {
        if (activeTab().id !== 'tab-dashboard') activateTab('tab-dashboard');
        if (options.onQuickCreate) options.onQuickCreate();
        else openCmd();
      },
    });

    function showToast(title, sub, onUndo) {
      const el = document.createElement('div');
      el.className = 'nt-toast';
      el.innerHTML = `
        <div style="min-width:0">
          <div style="font-weight:600">${esc(title)}</div>
          ${sub ? `<div style="font-size:11.5px;opacity:0.78;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(sub)}</div>` : ''}
        </div>
        ${onUndo ? '<button type="button" data-undo style="font-weight:600;color:#7ec0ff;padding:2px 6px;border-radius:4px">되돌리기</button>' : ''}
      `;
      toastWrap.appendChild(el);
      let done = false;
      const close = () => {
        if (done) return;
        done = true;
        el.remove();
      };
      const t = window.setTimeout(close, 4200);
      el.querySelector('[data-undo]')?.addEventListener('click', () => {
        window.clearTimeout(t);
        onUndo();
        close();
      });
    }

    function activeTab() {
      return state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0];
    }

    function pushHistory(tabId) {
      if (state.history[state.historyIdx] === tabId) return;
      state.history = state.history.slice(0, state.historyIdx + 1);
      state.history.push(tabId);
      state.historyIdx = state.history.length - 1;
    }

    function activateTab(tabId, { recordHistory = true } = {}) {
      if (!state.tabs.some((t) => t.id === tabId)) return;
      state.activeTabId = tabId;
      if (recordHistory) pushHistory(tabId);
      renderChrome();
      renderWorkspace();
      options.onTabChange?.(activeTab());
    }

    function openTab(spec, { background = false } = {}) {
      let tab = state.tabs.find((t) => t.key === spec.key);
      if (!tab) {
        tab = {
          id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          key: spec.key,
          title: spec.title,
          kind: spec.kind,
          payload: spec.payload || {},
          dotColor: spec.dotColor || 'var(--blue)',
          pinned: false,
        };
        state.tabs.push(tab);
      }
      if (spec.kind === 'notice' && spec.payload?.noticeId) {
        Data.markNoticeRead(spec.payload.noticeId);
      }
      if (background) {
        renderChrome();
        showToast('백그라운드 탭으로 열었습니다', tab.title);
      } else {
        activateTab(tab.id);
      }
    }

    function closeTab(tabId) {
      const idx = state.tabs.findIndex((t) => t.id === tabId);
      if (idx === -1 || state.tabs[idx].pinned) return;
      state.tabs.splice(idx, 1);
      state.history = state.history.filter((id) => id !== tabId);
      if (state.history.length === 0) state.history = ['tab-dashboard'];
      state.historyIdx = Math.min(state.historyIdx, state.history.length - 1);
      if (state.activeTabId === tabId) {
        state.activeTabId = (state.tabs[Math.max(0, idx - 1)] || state.tabs[0]).id;
      }
      renderChrome();
      renderWorkspace();
    }

    function renderSidebarMarkup(isPreview) {
      const cur = activeTab();
      const activeRoute = cur.kind === 'route' ? cur.payload?.route : cur.kind === 'dashboard' ? '/dashboard' : '';
      return `
        ${
          isPreview
            ? `<div class="nt-sb-prev-head">
                <span>메뉴</span>
                <button type="button" class="nt-icon-btn" id="ntPinSidebar" aria-label="사이드바 고정" title="사이드바 고정">
                  <svg class="ic ic-sm" viewBox="0 0 24 24"><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z"/></svg>
                </button>
              </div>`
            : `<div class="nt-sb-top">
                <div class="nt-sb-ws">
                  <span class="nt-sb-avatar">고</span>
                  <div style="min-width:0">
                    <div style="font-size:12.5px;font-weight:600;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">고덕퍼스트공인</div>
                  </div>
                </div>
                <button type="button" class="nt-sb-action" data-sb-cmd>
                  ${svgIcon('search', 'ic ic-sm')}
                  <span>검색</span>
                  <span class="nt-sb-hint">⌘K</span>
                </button>
                <button type="button" class="nt-sb-action" data-sb-newtask>
                  ${svgIcon('plus', 'ic ic-sm')}
                  <span>새 할 일</span>
                </button>
              </div>`
        }
        <div class="nt-sb-scroll">
          ${NAV_GROUPS.map(
            (g) => `
            <div class="nt-sb-group">
              <div class="nt-sb-group-lbl">${g.label}</div>
              ${g.items
                .map(
                  (it) => `
                <button type="button" class="nt-sb-item${activeRoute === it.key ? ' active' : ''}" data-sb-route="${it.key}" data-sb-label="${it.label}">
                  ${svgIcon(it.icon, 'ic ic-sm')}
                  <span>${it.label}</span>
                </button>`,
                )
                .join('')}
            </div>`,
          ).join('')}
        </div>
        <div class="nt-sb-footer">
          <span class="nt-sb-avatar" style="width:20px;height:20px;font-size:10px;border-radius:50%;background:#5f5e59">현</span>
          <div style="min-width:0;line-height:1.25">
            <div style="font-size:12px;font-weight:500;color:var(--fg)">현수</div>
            <div style="font-size:10.5px;color:var(--fg3)">대표공인중개사</div>
          </div>
        </div>
      `;
    }

    function bindSidebarContainer(el) {
      el.querySelectorAll('[data-sb-route]').forEach((btn) =>
        btn.addEventListener('click', (e) => {
          const route = btn.dataset.sbRoute;
          const label = btn.dataset.sbLabel;
          state.sidebarPreviewOpen = false;
          if (route === '/dashboard') activateTab('tab-dashboard');
          else {
            openTab(
              { key: `route:${route}`, title: label, kind: 'route', payload: { route, label }, dotColor: 'var(--fg3)' },
              { background: e.metaKey || e.ctrlKey },
            );
          }
        }),
      );
      el.querySelector('[data-sb-cmd]')?.addEventListener('click', openCmd);
      el.querySelector('[data-sb-newtask]')?.addEventListener('click', () => {
        if (activeTab().id !== 'tab-dashboard') activateTab('tab-dashboard');
        options.onQuickCreate?.();
      });
      el.querySelector('#ntPinSidebar')?.addEventListener('click', () => {
        state.sidebarOpen = true;
        state.sidebarPreviewOpen = false;
        renderChrome();
      });
    }

    function renderChrome() {
      rootWrap.classList.toggle('sidebar-collapsed', !state.sidebarOpen);
      previewEl.classList.toggle('open', !state.sidebarOpen && state.sidebarPreviewOpen);

      sidebarEl.innerHTML = renderSidebarMarkup(false);
      previewEl.innerHTML = renderSidebarMarkup(true);
      bindSidebarContainer(sidebarEl);
      bindSidebarContainer(previewEl);

      $('#ntBackBtn').disabled = state.historyIdx <= 0;
      $('#ntFwdBtn').disabled = state.historyIdx >= state.history.length - 1;

      tabStrip.innerHTML = state.tabs
        .map((t) => {
          const isActive = t.id === state.activeTabId;
          return `
          <div
            class="nt-tab${t.pinned ? ' pinned' : ''}${isActive ? ' active' : ''}"
            role="tab"
            aria-selected="${isActive}"
            data-tab-id="${t.id}"
            tabindex="0"
          >
            ${t.pinned ? svgIcon('dashboard', 'ic ic-sm') : `<span class="nt-tab-dot" style="background:${t.dotColor || 'var(--blue)'}"></span>`}
            <span class="nt-tab-title">${esc(t.title)}</span>
            ${
              t.pinned
                ? ''
                : `<button type="button" class="nt-tab-close" data-close-tab="${t.id}" aria-label="${esc(t.title)} 닫기">
                    <svg viewBox="0 0 12 12" style="width:10px;height:10px;stroke:currentColor;stroke-width:1.8;fill:none"><path d="M3 3l6 6M9 3l-6 6"/></svg>
                  </button>`
            }
          </div>`;
        })
        .join('');

      tabStrip.querySelectorAll('[data-tab-id]').forEach((el) => {
        el.addEventListener('click', (e) => {
          const closeBtn = e.target.closest('[data-close-tab]');
          if (closeBtn) {
            e.stopPropagation();
            closeTab(closeBtn.dataset.closeTab);
            return;
          }
          activateTab(el.dataset.tabId);
        });
        el.addEventListener('auxclick', (e) => {
          if (e.button === 1 && el.dataset.tabId !== 'tab-dashboard') {
            e.preventDefault();
            closeTab(el.dataset.tabId);
          }
        });
      });

      $('#ntCtiBtn').classList.toggle('is-ringing', state.cti.open);
      $('#ntWeatherBtn').classList.toggle('is-on', state.weatherOpen);
    }

    function renderDetailTab(tab) {
      const d = Data.getScopedData();

      if (tab.kind === 'deal') {
        const deal = Data.state.deals.find((x) => x.id === tab.payload.dealId);
        if (!deal) {
          detailView.innerHTML = '<div class="nt-detail-wrap"><p>거래 정보를 찾을 수 없습니다.</p></div>';
          return;
        }
        const st = Data.STAGE_META[deal.stage] || { label: deal.stage, tone: 'gray', step: 1 };
        const pillTone = st.tone === 'destructive' ? 'red' : st.tone === 'success' ? 'green' : st.tone === 'violet' ? 'violet' : st.tone === 'orange' ? 'orange' : 'blue';
        detailView.innerHTML = `
          <div class="nt-detail-wrap">
            <div class="nt-detail-top">
              <button type="button" class="nt-ghost-btn" data-back-home>← 대시보드</button>
              <div style="display:flex;gap:6px">
                <button type="button" class="nt-ghost-btn soft" data-detail-call="${esc(deal.buyerName)}" data-detail-role="${esc(deal.siteName)} ${esc(deal.dongHo)} 매수인" data-detail-phone="${esc(deal.buyerPhone)}">전화 걸기 (CTI)</button>
              </div>
            </div>
            <h1 class="nt-detail-title">${esc(deal.siteName)} ${esc(deal.dongHo)}</h1>
            <div class="nt-prop-table">
              <div class="nt-prop-row"><div class="nt-prop-key">진행 단계</div><div class="nt-prop-val"><span class="nt-pill" data-tone="${pillTone}">${esc(st.label)}</span>${deal.isJointBrokerage ? ` <span class="nt-pill" data-tone="gray">공동 · ${esc(deal.partnerName)}</span>` : ''}</div></div>
              <div class="nt-prop-row"><div class="nt-prop-key">거래 조건</div><div class="nt-prop-val num">${esc(deal.amountText)} · 예상 중개보수 ${deal.commissionExpectedManwon.toLocaleString('ko-KR')}만</div></div>
              <div class="nt-prop-row"><div class="nt-prop-key">당사자</div><div class="nt-prop-val">${esc(deal.sellerName)} (${esc(deal.sellerPhone)}) ↔ ${esc(deal.buyerName)} (${esc(deal.buyerPhone)})</div></div>
              <div class="nt-prop-row"><div class="nt-prop-key">담당</div><div class="nt-prop-val">${esc(deal.assignee)}</div></div>
            </div>
            <div class="nt-detail-card" style="margin-bottom:14px">
              <div style="font-size:13px;font-weight:600;margin-bottom:8px">대금 일정</div>
              ${deal.payments
                .map(
                  (p, idx) => `
                <div class="nt-pay-row">
                  <button type="button" class="nt-chk" data-detail-pay="${idx}" aria-checked="${p.paid}">
                    <svg viewBox="0 0 12 12"><path d="M2.5 6.4l2.4 2.4 4.6-5.3"/></svg>
                  </button>
                  <span style="flex:1;font-size:13.5px">${esc(p.kind)} <b class="num">${esc(p.amount)}</b></span>
                  <span class="nt-pill num" data-tone="${p.paid ? 'green' : 'orange'}">${p.paid ? '입금 완료' : Data.dDayLabel(p.dateOffset)}</span>
                </div>`,
                )
                .join('')}
            </div>
            <div class="nt-detail-card" style="background:var(--bg-soft);border-color:transparent">
              <div style="font-size:12px;color:var(--fg3);margin-bottom:4px">핵심 특약</div>
              <div style="font-size:13.5px;line-height:1.65">${esc(deal.specialTerms)}</div>
            </div>
          </div>
        `;
        detailView.querySelectorAll('[data-detail-pay]').forEach((btn) =>
          btn.addEventListener('click', () => Data.toggleDealPaymentPaid(deal.id, Number(btn.dataset.detailPay))),
        );
      } else if (tab.kind === 'task') {
        const t = Data.state.tasks.find((x) => x.id === tab.payload.id);
        if (!t) {
          detailView.innerHTML = '<div class="nt-detail-wrap"><p>업무 정보를 찾을 수 없습니다.</p></div>';
          return;
        }
        const done = t.status === 'completed';
        detailView.innerHTML = `
          <div class="nt-detail-wrap">
            <div class="nt-detail-top">
              <button type="button" class="nt-ghost-btn" data-back-home>← 대시보드</button>
              <div style="display:flex;gap:6px">
                <button type="button" class="nt-ghost-btn primary" data-detail-task-done>${done ? '미완료로 되돌리기' : '완료 처리'}</button>
                <button type="button" class="nt-ghost-btn soft" data-detail-task-snooze>내일로 미루기</button>
              </div>
            </div>
            <h1 class="nt-detail-title">${esc(t.title)}</h1>
            <div class="nt-prop-table">
              <div class="nt-prop-row"><div class="nt-prop-key">기한</div><div class="nt-prop-val"><span class="nt-pill" data-tone="${done ? 'green' : t.dueOffsetDays < 0 ? 'red' : 'blue'}">${done ? '완료됨' : Data.dDayLabel(t.dueOffsetDays)}</span> <span class="num" style="margin-left:6px;color:var(--fg2)">${esc(t.dueTime)}</span></div></div>
              <div class="nt-prop-row"><div class="nt-prop-key">구분</div><div class="nt-prop-val">${esc(t.categoryLabel || '업무')}</div></div>
              ${t.propertyLabel ? `<div class="nt-prop-row"><div class="nt-prop-key">관련 물건</div><div class="nt-prop-val">${esc(t.propertyLabel)}</div></div>` : ''}
              ${t.contactName ? `<div class="nt-prop-row"><div class="nt-prop-key">고객</div><div class="nt-prop-val">${esc(t.contactName)}</div></div>` : ''}
            </div>
            <div class="nt-detail-card" style="background:var(--bg-soft);border-color:transparent">
              <div style="font-size:13.5px;line-height:1.7">${esc(t.memo || '등록된 메모가 없습니다.')}</div>
            </div>
          </div>
        `;
        detailView.querySelector('[data-detail-task-done]')?.addEventListener('click', () => {
          const res = Data.completeTask(t.id);
          if (res?.task.status === 'completed') hero.cheer();
        });
        detailView.querySelector('[data-detail-task-snooze]')?.addEventListener('click', () => {
          Data.snoozeTask(t.id, 1, '내일');
          showToast('내일로 미뤘습니다', t.title);
        });
      } else if (tab.kind === 'call' || tab.kind === 'signal') {
        const isCall = tab.kind === 'call';
        const obj = isCall
          ? Data.state.callSuggestions.find((x) => x.id === tab.payload.id)
          : Data.state.signals.find((x) => x.id === tab.payload.id);
        if (!obj) {
          detailView.innerHTML = '<div class="nt-detail-wrap"><p>항목을 찾을 수 없습니다.</p></div>';
          return;
        }
        const done = isCall ? obj.status !== 'pending' : obj.resolved;
        detailView.innerHTML = `
          <div class="nt-detail-wrap">
            <div class="nt-detail-top">
              <button type="button" class="nt-ghost-btn" data-back-home>← 대시보드</button>
              ${!done ? `<button type="button" class="nt-ghost-btn primary" data-detail-sig-act>${isCall ? '제안 반영하기' : '확인 완료'}</button>` : '<span class="nt-pill" data-tone="green">처리됨</span>'}
            </div>
            <h1 class="nt-detail-title">${esc(isCall ? `${obj.contactName} — ${obj.suggestionAction}` : obj.title)}</h1>
            <div class="nt-prop-table">
              <div class="nt-prop-row"><div class="nt-prop-key">분류</div><div class="nt-prop-val"><span class="nt-pill" data-tone="${isCall ? 'violet' : 'orange'}">${esc(obj.badge)}</span></div></div>
              <div class="nt-prop-row"><div class="nt-prop-key">요약</div><div class="nt-prop-val">${esc(isCall ? obj.summary : obj.sub)}</div></div>
            </div>
            <div class="nt-detail-card" style="background:var(--bg-soft);border-color:transparent;font-size:14px;line-height:1.7">
              ${esc(isCall ? obj.quote || obj.summary : obj.detail || obj.sub)}
            </div>
          </div>
        `;
        detailView.querySelector('[data-detail-sig-act]')?.addEventListener('click', () => {
          if (isCall) Data.resolveCallSuggestion(obj.id, 'accepted');
          else Data.resolveSignal(obj.id, '확인 완료');
          hero.cheer();
        });
      } else if (tab.kind === 'notice') {
        const n = Data.state.notices.find((x) => x.id === tab.payload.noticeId);
        detailView.innerHTML = `
          <div class="nt-detail-wrap">
            <div class="nt-detail-top">
              <button type="button" class="nt-ghost-btn" data-back-home>← 대시보드</button>
              ${n?.isRequired ? '<span class="nt-pill" data-tone="red">필독</span>' : '<span class="nt-pill" data-tone="blue">공지</span>'}
            </div>
            <h1 class="nt-detail-title">${esc(n?.title || tab.title)}</h1>
            <div style="font-size:12.5px;color:var(--fg3);margin:8px 0 20px">${esc(n?.publishedAt || '')}</div>
            <div class="nt-detail-card" style="background:var(--bg-soft);border-color:transparent;font-size:14px;line-height:1.75">${esc(n?.body || '')}</div>
          </div>
        `;
      } else if (tab.kind === 'event') {
        const ev = Data.state.events.find((x) => x.id === tab.payload.eventId);
        detailView.innerHTML = `
          <div class="nt-detail-wrap">
            <div class="nt-detail-top">
              <button type="button" class="nt-ghost-btn" data-back-home>← 대시보드</button>
              <span class="nt-pill num" data-tone="orange">${ev ? Data.formatHour(ev.hour) : ''}</span>
            </div>
            <h1 class="nt-detail-title">${esc(ev?.title || tab.title)}</h1>
            <div class="nt-prop-table">
              ${ev?.propertyLabel ? `<div class="nt-prop-row"><div class="nt-prop-key">장소·매물</div><div class="nt-prop-val">${esc(ev.propertyLabel)}</div></div>` : ''}
              ${ev?.contactName ? `<div class="nt-prop-row"><div class="nt-prop-key">고객</div><div class="nt-prop-val">${esc(ev.contactName)}</div></div>` : ''}
              ${ev?.assignee ? `<div class="nt-prop-row"><div class="nt-prop-key">담당</div><div class="nt-prop-val">${esc(ev.assignee)}</div></div>` : ''}
            </div>
            <div class="nt-detail-card" style="background:var(--bg-soft);border-color:transparent;font-size:14px;line-height:1.7">${esc(ev?.memo || '')}</div>
          </div>
        `;
      } else {
        detailView.innerHTML = `
          <div class="nt-detail-wrap">
            <div class="nt-detail-top">
              <button type="button" class="nt-ghost-btn" data-back-home>← 대시보드</button>
            </div>
            <h1 class="nt-detail-title">${esc(tab.title)}</h1>
            <div style="font-size:13px;color:var(--fg3);margin:8px 0 20px">Estait Flow 작업 탭 · ${esc(tab.payload?.route || '')} (활성 거래 ${d.deals.length}건)</div>
            <div class="nt-detail-card" style="background:var(--bg-soft);border-color:transparent;font-size:13.5px;color:var(--fg2);line-height:1.65">
              노션 데스크톱 스타일로 연결된 탭 화면입니다. 상단의 <b>대시보드</b> 탭을 누르시면 홈 캔버스와 애니메이션 날씨판이 그대로 유지됩니다.
            </div>
          </div>
        `;
      }

      detailView.querySelector('[data-back-home]')?.addEventListener('click', () => activateTab('tab-dashboard'));
      detailView.querySelectorAll('[data-detail-call]').forEach((btn) =>
        btn.addEventListener('click', () => {
          triggerCti({
            callerName: btn.dataset.detailCall,
            callerRole: btn.dataset.detailRole,
            phone: btn.dataset.detailPhone,
            memo: '상세 탭에서 바로 발신',
          });
        }),
      );
    }

    function renderWorkspace() {
      const cur = activeTab();
      if (cur.kind === 'dashboard') {
        homeView.hidden = false;
        detailView.hidden = true;
      } else {
        homeView.hidden = true;
        detailView.hidden = false;
        renderDetailTab(cur);
      }
    }

    function renderCtiOverlay() {
      if (!state.cti.open) {
        ctiOverlay.classList.remove('open');
        return;
      }
      ctiOverlay.classList.add('open');
      const c = state.cti;
      const mm = String(Math.floor(c.elapsedSec / 60)).padStart(2, '0');
      const ss = String(c.elapsedSec % 60).padStart(2, '0');
      ctiOverlay.innerHTML = `
        <div class="nt-cti-head">
          <div style="display:flex;align-items:center;gap:7px">
            <span class="nt-cti-pulse"></span>
            <span style="font-size:12px;font-weight:600;color:var(--green)">${c.phase === 'ringing' ? '전화 수신 중 (CTI)' : '통화 연결됨'}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="num" data-cti-sec style="font-size:11.5px;color:var(--fg3)">${mm}:${ss}</span>
            <button type="button" class="nt-icon-btn" id="ntCtiClose" aria-label="전화 팝업 닫기">
              <svg viewBox="0 0 12 12" style="width:11px;height:11px;stroke:currentColor;stroke-width:1.8;fill:none"><path d="M2 2l8 8M10 2l-8 8"/></svg>
            </button>
          </div>
        </div>
        <div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px">
          <div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:15px;font-weight:600">${esc(c.callerName)}</span>
              <span class="nt-pill" data-tone="blue">기존 고객</span>
            </div>
            <div style="font-size:12.5px;color:var(--fg2);margin-top:2px">${esc(c.callerRole)}</div>
            <div class="num" style="font-size:12px;color:var(--fg3);margin-top:1px">${esc(c.phone)}</div>
          </div>
          <div style="background:var(--bg-soft);border-radius:8px;padding:9px 11px;font-size:12.5px;color:var(--fg2)">${esc(c.memo)}</div>
          <div style="display:flex;gap:6px">
            <button type="button" class="nt-ghost-btn primary" id="ntCtiOpenDeal" style="flex:1;justify-content:center;height:28px">연결 거래 열기</button>
            <button type="button" class="nt-ghost-btn soft" id="ntCtiEnd" style="height:28px;color:var(--red)">통화 종료</button>
          </div>
        </div>
      `;
      $('#ntCtiClose')?.addEventListener('click', () => triggerCti(null));
      $('#ntCtiEnd')?.addEventListener('click', () => {
        state.cti.open = false;
        window.clearInterval(ctiTimer);
        renderCtiOverlay();
        renderChrome();
        showToast('통화 기록이 저장되었습니다', `${c.callerName} (${mm}:${ss})`);
      });
      $('#ntCtiOpenDeal')?.addEventListener('click', () => {
        const d1 = Data.state.deals[0];
        if (d1) openTab({ key: `deal:${d1.id}`, title: `${d1.siteName} ${d1.dongHo}`, kind: 'deal', payload: { dealId: d1.id }, dotColor: 'var(--green)' });
      });
    }

    function triggerCti(override) {
      if (override) {
        state.cti = { ...state.cti, ...override, phase: 'connected', elapsedSec: 12, open: true };
      } else {
        state.cti.open = !state.cti.open;
        if (state.cti.open) state.cti.phase = 'ringing';
      }
      window.clearInterval(ctiTimer);
      if (state.cti.open) {
        ctiTimer = window.setInterval(() => {
          if (!state.cti.open) return;
          state.cti.elapsedSec += 1;
          const el = ctiOverlay.querySelector('[data-cti-sec]');
          if (el) el.textContent = `${String(Math.floor(state.cti.elapsedSec / 60)).padStart(2, '0')}:${String(state.cti.elapsedSec % 60).padStart(2, '0')}`;
        }, 1000);
      }
      renderCtiOverlay();
      renderChrome();
    }

    function openContextMenu(x, y, entries) {
      ctxMenu.innerHTML = entries
        .map((en, idx) =>
          en.sep
            ? '<div class="nt-ctx-sep"></div>'
            : `<button type="button" class="nt-ctx-item" data-ctx-idx="${idx}"><span>${esc(en.label)}</span><span class="nt-ctx-hint">${esc(en.hint || '')}</span></button>`,
        )
        .join('');
      ctxMenu.classList.add('open');
      const w = ctxMenu.offsetWidth || 200;
      const h = ctxMenu.offsetHeight || 150;
      ctxMenu.style.left = `${Math.min(x, window.innerWidth - w - 8)}px`;
      ctxMenu.style.top = `${Math.min(y, window.innerHeight - h - 8)}px`;
      ctxMenu.querySelectorAll('[data-ctx-idx]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const item = entries[Number(btn.dataset.ctxIdx)];
          ctxMenu.classList.remove('open');
          item?.action?.();
        }),
      );
    }

    function renderCmdPalette() {
      if (!state.cmdOpen) {
        cmdPalette.classList.remove('open');
        cmdPalette.setAttribute('aria-hidden', 'true');
        return;
      }
      cmdPalette.classList.add('open');
      cmdPalette.setAttribute('aria-hidden', 'false');

      const d = Data.getScopedData();
      const q = state.cmdQuery.trim().toLowerCase();
      const list = [
        ...d.deals.map((deal) => ({
          tag: '거래',
          label: `${deal.siteName} ${deal.dongHo}`,
          sub: `${deal.amountText} · ${deal.healthText}`,
          run: () => openTab({ key: `deal:${deal.id}`, title: `${deal.siteName} ${deal.dongHo}`, kind: 'deal', payload: { dealId: deal.id }, dotColor: 'var(--green)' }),
        })),
        ...d.openTasks.map((t) => ({
          tag: '할 일',
          label: t.title,
          sub: [t.propertyLabel, t.contactName].filter(Boolean).join(' · '),
          run: () => openTab({ key: `task:${t.id}`, title: t.title, kind: 'task', payload: { id: t.id }, dotColor: 'var(--blue)' }),
        })),
        ...d.notices.map((n) => ({
          tag: '공지',
          label: n.title,
          sub: n.publishedAt,
          run: () => openTab({ key: `notice:${n.id}`, title: n.title, kind: 'notice', payload: { noticeId: n.id }, dotColor: 'var(--blue)' }),
        })),
        {
          tag: '명령',
          label: `범위 전환 (${d.scope === 'mine' ? '내 담당 → 사무소 전체' : '사무소 전체 → 내 담당'})`,
          sub: '대시보드 범위',
          run: () => Data.setScope(d.scope === 'mine' ? 'all' : 'mine'),
        },
        {
          tag: '명령',
          label: '사이드바 열기/접기',
          sub: '⌘\\',
          run: () => {
            state.sidebarOpen = !state.sidebarOpen;
            renderChrome();
          },
        },
        {
          tag: '명령',
          label: '수신 전화 팝업 보기/닫기',
          sub: 'CTI 미리보기',
          run: () => triggerCti(null),
        },
      ].filter((e) => !q || `${e.tag} ${e.label} ${e.sub}`.toLowerCase().includes(q));

      if (state.cmdIdx >= list.length) state.cmdIdx = Math.max(0, list.length - 1);
      cmdList.innerHTML =
        list.length === 0
          ? '<div style="padding:20px;text-align:center;color:var(--fg3)">일치하는 항목이 없습니다.</div>'
          : list
              .slice(0, 12)
              .map(
                (e, i) => `
              <button type="button" class="nt-pal-item${i === state.cmdIdx ? ' active' : ''}" data-pal-idx="${i}">
                <div style="display:flex;align-items:center;gap:8px;min-width:0">
                  <span class="nt-pill" data-tone="gray">${esc(e.tag)}</span>
                  <span style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.label)}</span>
                </div>
                <span style="font-size:11.5px;color:var(--fg3);white-space:nowrap">${esc(e.sub)}</span>
              </button>`,
              )
              .join('');

      cmdList.querySelectorAll('[data-pal-idx]').forEach((b) =>
        b.addEventListener('click', () => {
          const chosen = list[Number(b.dataset.palIdx)];
          state.cmdOpen = false;
          renderCmdPalette();
          chosen?.run();
        }),
      );
      state._cmdEntries = list;
    }

    function openCmd() {
      state.cmdOpen = true;
      state.cmdQuery = '';
      state.cmdIdx = 0;
      cmdInput.value = '';
      renderCmdPalette();
      window.setTimeout(() => cmdInput.focus(), 10);
    }

    function renderWeatherPop() {
      if (!state.weatherOpen) {
        weatherPop.classList.remove('open');
        return;
      }
      weatherPop.classList.add('open');
      const st = hero.getState();
      const presets = window.DASH_HERO_PRESETS || [
        { id: 'clear', label: '맑음' },
        { id: 'rain', label: '비' },
        { id: 'snow', label: '눈' },
      ];
      const hours = [
        { h: 8, label: '08시 아침' },
        { h: 13, label: '13시 낮' },
        { h: 18, label: '18시 노을' },
        { h: 22, label: '22시 밤' },
      ];
      weatherPop.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:13px;font-weight:600">날씨·시각 미리보기</span>
          <span class="num" style="font-size:12px;color:var(--fg3)">${esc(st.clockLabel)}</span>
        </div>
        <div class="nt-wp-grid">
          ${presets.map((p) => `<button type="button" class="nt-wp-chip${st.preset === p.id ? ' active' : ''}" data-wp-w="${p.id}">${esc(p.label)}</button>`).join('')}
        </div>
        <div class="nt-wp-grid">
          ${hours.map((it) => `<button type="button" class="nt-wp-chip${Math.abs(st.hour - it.h) < 1.5 ? ' active' : ''}" data-wp-h="${it.h}">${esc(it.label)}</button>`).join('')}
        </div>
        <div style="display:flex;gap:6px">
          <button type="button" class="nt-ghost-btn primary" id="ntWpSweep" style="flex:1;justify-content:center;height:28px">${st.sweeping ? '정지' : '하루 흐름 보기'}</button>
          <button type="button" class="nt-ghost-btn soft" id="ntWpReplay" style="height:28px">일출</button>
        </div>
      `;
      weatherPop.querySelectorAll('[data-wp-w]').forEach((b) =>
        b.addEventListener('click', () => {
          hero.setWeather(b.dataset.wpW);
          renderWeatherPop();
        }),
      );
      weatherPop.querySelectorAll('[data-wp-h]').forEach((b) =>
        b.addEventListener('click', () => {
          hero.setHour(Number(b.dataset.wpH), false);
          renderWeatherPop();
        }),
      );
      $('#ntWpSweep')?.addEventListener('click', () => {
        hero.toggleDaySweep();
        renderWeatherPop();
      });
      $('#ntWpReplay')?.addEventListener('click', () => hero.replay());
    }

    // Bind chrome controls
    const toggleBtn = $('#ntSidebarToggle');
    toggleBtn.addEventListener('click', (e) => {
      state.sidebarOpen = !state.sidebarOpen;
      state.sidebarPreviewOpen = false;
      renderChrome();
      if (e.detail > 0) toggleBtn.blur();
    });

    const openPreview = () => {
      if (state.sidebarOpen) return;
      state.sidebarPreviewOpen = true;
      previewEl.classList.add('open');
    };
    const closePreviewSoon = () => {
      window.clearTimeout(previewTimer);
      previewTimer = window.setTimeout(() => {
        if (!previewEl.matches(':hover') && !$('#ntEdgeSensor').matches(':hover') && !toggleBtn.matches(':hover')) {
          state.sidebarPreviewOpen = false;
          previewEl.classList.remove('open');
        }
      }, 180);
    };
    $('#ntEdgeSensor').addEventListener('pointerenter', openPreview);
    toggleBtn.addEventListener('pointerenter', () => {
      if (!state.sidebarOpen) {
        window.clearTimeout(previewTimer);
        previewTimer = window.setTimeout(openPreview, 240);
      }
    });
    toggleBtn.addEventListener('pointerleave', closePreviewSoon);
    previewEl.addEventListener('pointerenter', () => window.clearTimeout(previewTimer));
    previewEl.addEventListener('pointerleave', closePreviewSoon);

    $('#ntBackBtn').addEventListener('click', () => {
      if (state.historyIdx > 0) {
        state.historyIdx -= 1;
        activateTab(state.history[state.historyIdx], { recordHistory: false });
      }
    });
    $('#ntFwdBtn').addEventListener('click', () => {
      if (state.historyIdx < state.history.length - 1) {
        state.historyIdx += 1;
        activateTab(state.history[state.historyIdx], { recordHistory: false });
      }
    });
    $('#ntTabAdd').addEventListener('click', openCmd);
    $('#ntCtiBtn').addEventListener('click', () => triggerCti(null));
    $('#ntWeatherBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      state.weatherOpen = !state.weatherOpen;
      renderWeatherPop();
      renderChrome();
    });

    cmdInput.addEventListener('input', () => {
      state.cmdQuery = cmdInput.value;
      state.cmdIdx = 0;
      renderCmdPalette();
    });
    cmdPalette.addEventListener('click', (e) => {
      if (e.target === cmdPalette) {
        state.cmdOpen = false;
        renderCmdPalette();
      }
    });

    document.addEventListener('pointerdown', (e) => {
      if (ctxMenu.classList.contains('open') && !e.target.closest('#ntCtxMenu')) ctxMenu.classList.remove('open');
      if (state.weatherOpen && !e.target.closest('#ntWeatherPop') && !e.target.closest('#ntWeatherBtn')) {
        state.weatherOpen = false;
        renderWeatherPop();
        renderChrome();
      }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        state.cmdOpen = !state.cmdOpen;
        if (state.cmdOpen) openCmd();
        else renderCmdPalette();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        state.sidebarOpen = !state.sidebarOpen;
        state.sidebarPreviewOpen = false;
        renderChrome();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') {
        if (state.activeTabId !== 'tab-dashboard') {
          e.preventDefault();
          closeTab(state.activeTabId);
        }
        return;
      }
      if (e.key === 'Escape') {
        if (state.cmdOpen) {
          state.cmdOpen = false;
          renderCmdPalette();
          return;
        }
        if (ctxMenu.classList.contains('open')) {
          ctxMenu.classList.remove('open');
          return;
        }
        if (state.weatherOpen) {
          state.weatherOpen = false;
          renderWeatherPop();
          renderChrome();
          return;
        }
        if (state.cti.open) {
          state.cti.open = false;
          window.clearInterval(ctiTimer);
          renderCtiOverlay();
          renderChrome();
        }
        return;
      }
      if (state.cmdOpen) {
        const len = (state._cmdEntries || []).length;
        if (e.key === 'ArrowDown' && len > 0) {
          e.preventDefault();
          state.cmdIdx = Math.min(len - 1, state.cmdIdx + 1);
          renderCmdPalette();
        } else if (e.key === 'ArrowUp' && len > 0) {
          e.preventDefault();
          state.cmdIdx = Math.max(0, state.cmdIdx - 1);
          renderCmdPalette();
        } else if (e.key === 'Enter' && len > 0) {
          e.preventDefault();
          const chosen = state._cmdEntries[state.cmdIdx];
          state.cmdOpen = false;
          renderCmdPalette();
          chosen?.run();
        }
      }
    });

    Data.subscribe(() => {
      renderChrome();
      if (activeTab().kind !== 'dashboard') renderDetailTab(activeTab());
    });

    renderChrome();
    renderWorkspace();

    return {
      hero,
      homeEl: homeView,
      contentHost,
      openTab,
      activateTab,
      activeTab,
      showToast,
      openContextMenu,
      triggerCti,
      openCmd,
      escapeHtml: esc,
      svgIcon,
    };
  };
})();
