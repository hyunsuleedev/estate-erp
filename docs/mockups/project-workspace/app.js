/* ==========================================================================
   EstaitFlow — Project Workspace 4-Angle Interactive Demo Shell
   ========================================================================== */
(() => {
  'use strict';

  function D() { return window.PWData; }
  function S() { return window.PWStore; }
  function M() { return window.PWModals; }

  const ANGLES = [
    { id: 'hybrid', num: '★', label: '1+2 통합안' },
    { id: 'cockpit', num: '1', label: '모던 워크스페이스 허브' },
    { id: 'desk', num: '2', label: '중개날개 진화형 데스크' },
    { id: 'pipeline', num: '3', label: '여정 파이프라인 · 딜 룸' },
    { id: 'bento', num: '4', label: '모듈형 브로커 벤토' },
  ];

  const SCENARIOS = [
    { id: 'p1', label: '갈아타기 복합' },
    { id: 'p2', label: '전세 구매' },
    { id: 'p3', label: '신규 첫 상담' },
  ];

  let prevAngle = null;
  let prevProjectId = null;

  function renderApp() {
    const app = document.getElementById('app');
    if (!app) return;

    const state = S().getState();
    const angle = state.angle;
    const projectId = state.selectedProjectId;

    // Save scroll positions when re-rendering within the same angle & project
    const scrollMap = new Map();
    if (prevAngle === angle && prevProjectId === projectId) {
      app.querySelectorAll('[data-scroll-id]').forEach((el) => {
        scrollMap.set(el.getAttribute('data-scroll-id'), el.scrollTop);
      });
    }
    prevAngle = angle;
    prevProjectId = projectId;

    app.innerHTML = `
      <header class="demo-bar">
        <div class="demo-bar-left">
          <div class="demo-brand">
            <span class="demo-brand-dot"></span>
            <span>EstaitFlow</span>
          </div>
          <nav class="angle-tabs" aria-label="UI 각도 전환">
            ${ANGLES.map((a) => `
              <button type="button" class="angle-tab ${angle === a.id ? 'active' : ''}" data-demo-angle="${a.id}">
                <span class="angle-num">${a.num}</span>
                <span>${a.label}</span>
              </button>
            `).join('')}
          </nav>
        </div>

        <div class="demo-bar-right">
          <div class="scenario-group" role="group" aria-label="시나리오 선택">
            ${SCENARIOS.map((sc) => `
              <button type="button" class="scenario-btn ${projectId === sc.id ? 'active' : ''}" data-demo-scenario="${sc.id}">
                ${sc.label}
              </button>
            `).join('')}
          </div>
          <button type="button" class="demo-btn" id="demo-new-proj">
            ${D().icon('plus', 13)} 새 프로젝트
          </button>
          <button type="button" class="demo-btn accent" id="demo-db-diag">
            ${D().icon('db', 13)} DB 구조 진단
          </button>
          <button type="button" class="demo-btn" id="demo-reset" title="시연 데이터 초기화">
            ${D().icon('rotate', 13)} 초기화
          </button>
        </div>
      </header>
      <div id="view-stage" style="min-height:0;height:100%;overflow:hidden"></div>
    `;

    const stage = app.querySelector('#view-stage');
    const viewRenderer = window.PWViews?.[angle];
    if (viewRenderer && stage) {
      viewRenderer(stage);
    }

    // Restore scroll offsets
    if (scrollMap.size > 0) {
      app.querySelectorAll('[data-scroll-id]').forEach((el) => {
        const key = el.getAttribute('data-scroll-id');
        if (scrollMap.has(key)) {
          el.scrollTop = scrollMap.get(key);
        }
      });
    }

    // Bind topbar events
    app.querySelectorAll('[data-demo-angle]').forEach((btn) => {
      btn.addEventListener('click', () => S().setAngle(btn.getAttribute('data-demo-angle')));
    });
    app.querySelectorAll('[data-demo-scenario]').forEach((btn) => {
      btn.addEventListener('click', () => S().selectProject(btn.getAttribute('data-demo-scenario')));
    });
    app.querySelector('#demo-new-proj')?.addEventListener('click', () => M().openNewProjectModal());
    app.querySelector('#demo-db-diag')?.addEventListener('click', () => M().openDbDiagnosisModal());
    app.querySelector('#demo-reset')?.addEventListener('click', () => {
      S().resetDemo();
      M().showToast('데모 데이터를 처음 상태로 되돌렸습니다.');
    });
  }

  function bindGlobalListeners() {
    S().subscribe(renderApp);

    window.addEventListener('hashchange', () => {
      const hash = (window.location.hash || '').replace('#', '');
      if (ANGLES.some((a) => a.id === hash)) {
        S().setAngle(hash);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modalRoot = document.getElementById('modal-root');
        if (modalRoot && modalRoot.innerHTML.trim() !== '') {
          M().closeOverlay();
          return;
        }
      }
      const target = e.target;
      if (
        target &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '0') {
        S().setAngle('hybrid');
        return;
      }
      const num = Number.parseInt(e.key, 10);
      if (num >= 1 && num <= 4) {
        const numbered = ['cockpit', 'desk', 'pipeline', 'bento'];
        S().setAngle(numbered[num - 1]);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindGlobalListeners();
    renderApp();
  });
})();
