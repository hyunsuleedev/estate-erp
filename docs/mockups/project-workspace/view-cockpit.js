/* ==========================================================================
   ANGLE 1 · 모던 워크스페이스 허브 (Linear + Attio + 중개날개 하이브리드)
   3-Pane Web App: 좌측 프로젝트 탐색 + 중앙 실행 캔버스 + 우측 상담/코멘트/업무 도크
   ========================================================================== */
(() => {
  'use strict';

  function D() { return window.PWData; }
  function S() { return window.PWStore; }
  function M() { return window.PWModals; }

  let composerMode = 'consult'; // consult | comment
  let consultType = 'phone';
  let composerDraft = '';

  function renderCockpit(container) {
    const state = S().getState();
    const project = S().getCurrentProject();
    const ui = state.ui;
    const progress = S().computeProjectProgress(project);
    const openTasks = project.tasks.filter((t) => !t.done);
    const pendingSuggestions = project.callRecordings.flatMap((r) =>
      r.suggestions.filter((s) => s.status === 'pending')
    );

    const activeMatches = project.matches.filter((m) => m.stage !== 'closed');
    const selectedBriefCount = project.matches.filter((m) => m.briefSelected).length;

    container.innerHTML = `
      <div class="v1-shell">
        <!-- Left Project Rail -->
        <aside class="v1-rail" aria-label="프로젝트 목록">
          <div class="v1-rail-head">
            <div class="v1-rail-title">
              <span>프로젝트 (${state.projects.length})</span>
              <button type="button" class="pw-btn pw-btn-blue pw-btn-sm" id="v1-new-proj">
                ${D().icon('plus', 13)} 열기
              </button>
            </div>
            <div style="font-size:11.5px;color:#64748b">고객 한 건의 마스터 작업 공간</div>
          </div>
          <div class="v1-rail-list" data-scroll-id="v1-rail">
            ${state.projects.map((p) => {
              const prog = S().computeProjectProgress(p);
              const light = D().STATUS_LIGHT_MAP[p.statusLight] || D().STATUS_LIGHTS[0];
              const pOpenTasks = p.tasks.filter((t) => !t.done).length;
              return `
                <button type="button" class="v1-proj-item ${p.id === project.id ? 'active' : ''}" data-v1-select="${p.id}">
                  <div class="v1-proj-top">
                    <span class="v1-proj-name trunc">${D().esc(p.primaryContact?.name || '고객')} · ${D().esc(p.title)}</span>
                    <span class="v2-light-dot" style="background:${light.color};width:8px;height:8px" title="${D().esc(light.label)}"></span>
                  </div>
                  <div class="v1-proj-sub">
                    <span>${D().esc(prog.label)}</span>
                    ${p.listingIntakes.length ? '<span class="pw-badge" data-tone="amber" style="height:18px;font-size:10.5px">매물</span>' : ''}
                    ${p.buyerIntakes.length ? '<span class="pw-badge" data-tone="blue" style="height:18px;font-size:10.5px">구매</span>' : ''}
                    ${pOpenTasks > 0 ? `<span class="num" style="margin-left:auto;color:#2563eb;font-weight:600">업무 ${pOpenTasks}</span>` : ''}
                  </div>
                </button>
              `;
            }).join('')}
          </div>
        </aside>

        <!-- Center Action Canvas -->
        <main class="v1-center">
          <header class="v1-header">
            <div class="v1-hero-row">
              <div class="v1-title-wrap">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
                  <span class="pw-badge" data-tone="${progress.key === 'active' ? 'green' : 'gray'}">
                    <span class="pw-dot"></span>${D().esc(progress.label)}
                  </span>
                  <span style="font-size:12px;color:#64748b">시작 ${D().esc(project.createdAt)} · 담당 <strong>${D().esc(project.assignedTo)}</strong></span>
                </div>
                <input class="v1-title-input" id="v1-title-input" value="${D().esc(project.title)}" aria-label="프로젝트 이름" />
                <div class="v1-meta-chips">
                  ${project.people.map((person, idx) => `
                    <span class="v1-person-pill">
                      <b>${D().esc(person.name)}</b>
                      <span style="color:#64748b">${D().esc(person.role)}</span>
                      ${idx === 0 && person.phone ? `
                        <button type="button" data-call-phone="${D().esc(person.phone)}" data-call-name="${D().esc(person.name)}"
                          style="color:#2563eb;display:inline-flex;align-items:center;gap:3px;font-weight:600" title="전화 걸기">
                          ${D().icon('phone', 11)} ${D().esc(person.phone)}
                        </button>
                      ` : ''}
                    </span>
                  `).join('')}
                  ${(project.primaryContact?.tags || []).map((tag) => `
                    <span class="pw-badge" data-tone="violet">${D().esc(tag)}</span>
                  `).join('')}
                </div>
              </div>

              <div class="v1-actions">
                <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v1-act-listing">
                  ${D().icon('building', 13)} + 매물 의뢰
                </button>
                <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v1-act-req">
                  ${D().icon('target', 13)} + 희망 조건
                </button>
                <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v1-act-file">
                  ${D().icon('upload', 13)} 자료 올리기
                </button>
                <button type="button" class="pw-btn pw-btn-blue pw-btn-sm" id="v1-act-brief">
                  ${D().icon('share', 13)} 브리핑 공유${selectedBriefCount > 0 ? ` (${selectedBriefCount})` : ''}
                </button>
              </div>
            </div>

            <!-- Compact ProjectStep Roadmap -->
            <div class="v1-roadmap" aria-label="진행 로드맵">
              <span style="font-size:11.5px;font-weight:700;color:#475569;flex:none">진행 계획</span>
              ${project.steps.length === 0 ? `
                <span style="font-size:12px;color:#94a3b8">아직 정한 단계가 없습니다. 오른쪽에서 매물 의뢰나 희망 조건을 바로 추가해 보세요.</span>
              ` : project.steps.map((st, idx) => `
                <button type="button" class="v1-step-chip ${st.done ? 'done' : ''}"
                  data-v1-step="${st.id}"
                  title="${st.kind === 'manual' ? '클릭해 완료 여부 전환' : '의뢰 진행 상태에 연동됨'}">
                  <span class="v1-step-num">${st.done ? D().icon('check', 10) : idx + 1}</span>
                  <span>${D().esc(st.title)}</span>
                  <span style="color:#64748b;font-size:11px" class="num">${D().esc(st.targetDate)}</span>
                </button>
              `).join('')}
            </div>

            <!-- Workspace Tabs -->
            <nav class="v1-tabs" aria-label="워크스페이스 영역">
              <button type="button" class="v1-tab ${ui.cockpitTab === 'overview' ? 'active' : ''}" data-v1-tab="overview">개요</button>
              <button type="button" class="v1-tab ${ui.cockpitTab === 'matches' ? 'active' : ''}" data-v1-tab="matches">
                매물·매칭 <span class="v1-tab-count num">${activeMatches.length}</span>
              </button>
              <button type="button" class="v1-tab ${ui.cockpitTab === 'files' ? 'active' : ''}" data-v1-tab="files">
                자료실 <span class="v1-tab-count num">${project.files.length}</span>
              </button>
              <button type="button" class="v1-tab ${ui.cockpitTab === 'deal' ? 'active' : ''}" data-v1-tab="deal">
                거래·보수 <span class="v1-tab-count num">${project.listingIntakes.filter((l) => l.deal).length}</span>
              </button>
            </nav>
          </header>

          <div class="v1-body" data-scroll-id="v1-center-body">
            ${ui.cockpitTab === 'overview' ? renderOverviewTab(project, pendingSuggestions, activeMatches) : ''}
            ${ui.cockpitTab === 'matches' ? renderMatchesTab(project, activeMatches, selectedBriefCount) : ''}
            ${ui.cockpitTab === 'files' ? renderFilesTab(project, ui) : ''}
            ${ui.cockpitTab === 'deal' ? renderDealTab(project) : ''}
          </div>
        </main>

        <!-- Right Persistent Live Activity Dock -->
        <aside class="v1-dock" aria-label="상담 코멘트 업무 도크">
          <div class="v1-dock-head">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <strong style="font-size:13.5px;color:#0f172a">상담 · 팀 코멘트 · 업무</strong>
              <span style="font-size:11px;color:#64748b">실시간 동기화</span>
            </div>
            <div class="v1-seg-bar" role="tablist">
              <button type="button" class="v1-seg-btn ${ui.cockpitStreamTab === 'all' ? 'active' : ''}" data-v1-stream="all">전체</button>
              <button type="button" class="v1-seg-btn ${ui.cockpitStreamTab === 'consult' ? 'active' : ''}" data-v1-stream="consult">상담 ${project.consultations.length}</button>
              <button type="button" class="v1-seg-btn ${ui.cockpitStreamTab === 'comment' ? 'active' : ''}" data-v1-stream="comment">코멘트 ${project.comments.length}</button>
              <button type="button" class="v1-seg-btn ${ui.cockpitStreamTab === 'tasks' ? 'active' : ''}" data-v1-stream="tasks">업무 ${openTasks.length}</button>
            </div>
          </div>

          <div class="v1-dock-scroll" data-scroll-id="v1-dock-scroll">
            ${renderDockBody(project, ui.cockpitStreamTab, openTasks)}
          </div>

          <div class="v1-composer">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
              <div style="display:flex;gap:4px">
                <button type="button" class="pw-btn pw-btn-sm ${composerMode === 'consult' ? 'pw-btn-blue' : 'pw-btn-line'}" data-v1-cmode="consult">
                  고객 상담 적기
                </button>
                <button type="button" class="pw-btn pw-btn-sm ${composerMode === 'comment' ? 'pw-btn-blue' : 'pw-btn-line'}" data-v1-cmode="comment">
                  팀 코멘트
                </button>
              </div>
              ${composerMode === 'consult' ? `
                <select class="stage-select" id="v1-consult-type" aria-label="상담 방식">
                  ${D().CONSULT_TYPES.map((t) => `<option value="${t.key}" ${t.key === consultType ? 'selected' : ''}>${t.label}</option>`).join('')}
                </select>
              ` : '<span style="font-size:11px;color:#64748b">프로젝트에 남는 팀 메모</span>'}
            </div>
            <textarea id="v1-composer-input" class="field-textarea" style="min-height:60px;font-size:12.5px"
              placeholder="${composerMode === 'consult' ? `${D().esc(project.primaryContact?.name || '고객')}님과 나눈 상담을 적으세요 (Contact에도 자동 쌓임)` : '팀원에게 공유할 진행 메모나 주의사항을 적으세요'}">${D().esc(composerDraft)}</textarea>
            <div style="display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:11px;color:#94a3b8">${composerMode === 'consult' ? '저장 귀속: Contact 상담' : '저장 귀속: Project 코멘트'}</span>
              <button type="button" class="pw-btn pw-btn-primary pw-btn-sm" id="v1-composer-submit">저장</button>
            </div>
          </div>
        </aside>
      </div>
    `;

    bindCockpitEvents(container, project);
  }

  function renderOverviewTab(project, pendingSuggestions, activeMatches) {
    return `
      ${pendingSuggestions.length > 0 ? `
        <div class="ai-banner">
          <div style="min-width:0;flex:1">
            <div style="display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:#312e81">
              ${D().icon('sparkles', 14)} 통화 녹음 AI 제안 ${pendingSuggestions.length}건 대기 중
            </div>
            <div style="font-size:12px;color:#4338ca;margin-top:2px" class="keep">
              ${D().esc(pendingSuggestions[0].title)} — ${D().esc(pendingSuggestions[0].evidence)}
            </div>
          </div>
          <div style="display:flex;gap:6px;flex:none">
            <button type="button" class="pw-btn pw-btn-line pw-btn-sm" data-v1-dismiss-sug="${pendingSuggestions[0].id}">무시</button>
            <button type="button" class="pw-btn pw-btn-blue pw-btn-sm" data-v1-accept-sug="${pendingSuggestions[0].id}">바로 반영</button>
          </div>
        </div>
      ` : ''}

      <div class="v1-card">
        <div class="v1-card-head">
          <div class="v1-card-title">${D().icon('sticky', 15)} 프로젝트 핵심 브리프</div>
          <span style="font-size:11.5px;color:#64748b">클릭해 바로 수정 · 자동 저장</span>
        </div>
        <textarea id="v1-memo-input" class="field-textarea" style="min-height:54px;border-color:#eef1f4;background:#fafbfc"
          placeholder="이 프로젝트가 어떤 일인지 한두 줄 적어 두세요...">${D().esc(project.memo)}</textarea>
      </div>

      <!-- Dual Intake Cards -->
      <div class="v1-dual-grid">
        <section class="v1-card">
          <div class="v1-card-head">
            <div class="v1-card-title">${D().icon('building', 15)} 매물 의뢰 (내놓는 집)</div>
            <button type="button" class="pw-btn pw-btn-ghost pw-btn-sm" id="v1-card-add-listing">+ 등록</button>
          </div>
          ${project.listingIntakes.length === 0 ? `
            <div style="padding:18px 10px;text-align:center;color:#64748b;font-size:12.5px;background:#f8fafc;border-radius:8px;border:1px dashed #cbd5e1">
              담긴 매물 의뢰가 없습니다.<br/>
              <button type="button" class="pw-btn pw-btn-line pw-btn-sm" style="margin-top:8px" id="v1-empty-listing">+ 이 자리에서 매물 등록</button>
            </div>
          ` : project.listingIntakes.map((li) => `
            <div style="display:grid;gap:6px">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                <strong style="font-size:14px;color:#0f172a">${D().esc(li.place)}</strong>
                <span class="pw-badge" data-tone="green">${D().esc(li.lastCheckResult)}</span>
              </div>
              <div class="v1-kv-line"><span class="v1-kv-k">면적 · 확인</span><span class="v1-kv-v num">${D().esc(li.areaDetail)} · ${D().esc(li.lastVerifiedLabel)}</span></div>
              ${li.listings.map((l) => `
                <div class="v1-kv-line">
                  <span class="v1-kv-k">${D().esc(l.transactionType)} 호가</span>
                  <span class="v1-kv-v num" style="font-weight:700;font-size:13.5px;color:#0f172a">${D().esc(l.priceLabel)}</span>
                </div>
                ${l.ad ? `
                  <div class="v1-kv-line">
                    <span class="v1-kv-k">광고 현황</span>
                    <span class="v1-kv-v">${D().esc(l.ad.channel)} · <strong style="color:#2563eb">${l.ad.rank}위/${l.ad.totalCount}</strong> (${D().esc(l.ad.cheapestLabel)})</span>
                  </div>
                ` : ''}
              `).join('')}
              ${li.deal ? `
                <div style="margin-top:4px;padding:8px 10px;border-radius:8px;background:#ecfdf5;border:1px solid #a7f3d0;font-size:12px;display:flex;justify-content:space-between;align-items:center">
                  <span><strong>${D().esc(li.deal.stageLabel)}</strong> · 합의가 ${D().esc(li.deal.agreedPriceLabel)}</span>
                  <span class="num" style="color:#047857">잔금 ${D().esc(li.deal.balanceDate)}</span>
                </div>
              ` : ''}
            </div>
          `).join('')}
        </section>

        <section class="v1-card">
          <div class="v1-card-head">
            <div class="v1-card-title">${D().icon('target', 15)} 구매 의뢰 (찾는 집)</div>
            <button type="button" class="pw-btn pw-btn-ghost pw-btn-sm" id="v1-card-add-req">+ 조건 추가</button>
          </div>
          ${project.buyerIntakes.length === 0 ? `
            <div style="padding:18px 10px;text-align:center;color:#64748b;font-size:12.5px;background:#f8fafc;border-radius:8px;border:1px dashed #cbd5e1">
              담긴 구매 의뢰가 없습니다.<br/>
              <button type="button" class="pw-btn pw-btn-line pw-btn-sm" style="margin-top:8px" id="v1-empty-req">+ 이 자리에서 희망 조건 추가</button>
            </div>
          ` : project.buyerIntakes.flatMap((bi) => bi.requirements).map((req) => `
            <div style="display:grid;gap:4px">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                <span class="pw-badge" data-tone="blue">${D().esc(req.transactionType)} · ${D().esc(req.areaLabel)}</span>
                <span class="pw-badge" data-tone="amber">긴급도 ${D().esc(req.urgency)}</span>
              </div>
              <div class="v1-kv-line"><span class="v1-kv-k">예산</span><span class="v1-kv-v num" style="font-weight:700;color:#2563eb">${D().esc(req.budgetLabel)}</span></div>
              <div class="v1-kv-line"><span class="v1-kv-k">희망 단지</span><span class="v1-kv-v">${D().esc(req.preferredSites.join(' · '))}</span></div>
              <div class="v1-kv-line"><span class="v1-kv-k">입주 희망</span><span class="v1-kv-v num">${D().esc(req.moveInDate)}</span></div>
              ${req.memo ? `<div style="margin-top:4px;padding:7px 9px;border-radius:7px;background:#f8fafc;font-size:12px;color:#475569">${D().esc(req.memo)}</div>` : ''}
            </div>
          `).join('')}
        </section>
      </div>

      <!-- Active Matches Snapshot -->
      <section class="v1-card">
        <div class="v1-card-head">
          <div class="v1-card-title">${D().icon('handshake', 15)} 매칭 후보 바로 다루기 (${activeMatches.length}건)</div>
          <div style="display:flex;gap:6px">
            <button type="button" class="pw-btn pw-btn-line pw-btn-sm" data-v1-tab-jump="matches">전체 비교 &amp; 브리핑 →</button>
          </div>
        </div>
        ${activeMatches.length === 0 ? `
          <div style="padding:14px;text-align:center;color:#64748b;font-size:12.5px">아직 연결된 후보 매물이 없습니다.</div>
        ` : `
          <table class="pw-table">
            <thead>
              <tr>
                <th>매물</th>
                <th>면적</th>
                <th>가격</th>
                <th>단계 (즉시 변경)</th>
                <th>브리핑 메모</th>
              </tr>
            </thead>
            <tbody>
              ${activeMatches.slice(0, 4).map((m) => `
                <tr>
                  <td><strong>${D().esc(m.place)}</strong></td>
                  <td class="num" style="color:#64748b">${D().esc(m.areaShort)}</td>
                  <td class="num"><strong>${D().esc(m.agreedPriceLabel || m.priceLabel)}</strong></td>
                  <td>
                    <select class="stage-select" data-v1-match-stage="${m.id}" aria-label="${D().esc(m.place)} 매칭 단계">
                      ${D().MATCH_STAGES.map((s) => `<option value="${s.key}" ${s.key === m.stage ? 'selected' : ''}>${s.label}</option>`).join('')}
                    </select>
                  </td>
                  <td style="color:#475569;max-width:240px" class="trunc">${D().esc(m.briefNote)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </section>

      <!-- Recent Files Strip -->
      <section class="v1-card">
        <div class="v1-card-head">
          <div class="v1-card-title">${D().icon('folder', 15)} 최근 자료 (${project.files.length}건)</div>
          <button type="button" class="pw-btn pw-btn-ghost pw-btn-sm" data-v1-tab-jump="files">자료실 모두 보기 →</button>
        </div>
        ${project.files.length === 0 ? `
          <div style="padding:14px;text-align:center;color:#64748b;font-size:12.5px">올린 자료가 없습니다. 상단 "자료 올리기"로 사진이나 등기부를 붙여 보세요.</div>
        ` : `
          <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">
            ${project.files.slice(0, 4).map((f) => `
              <button type="button" class="file-card" data-open-file="${f.id}">
                <div class="file-thumb" style="height:80px">${D().svgPreview(f.previewKind, f.category)}</div>
                <div class="file-info">
                  <div class="file-name trunc">${D().esc(f.name)}</div>
                  <div class="file-caption">${D().esc(f.category)} · ${D().esc(f.createdAt)}</div>
                </div>
              </button>
            `).join('')}
          </div>
        `}
      </section>
    `;
  }

  function renderMatchesTab(project, activeMatches, selectedBriefCount) {
    return `
      <div class="v1-card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;background:#f8fbff;border-color:#bfdbfe">
        <div>
          <strong style="font-size:13.5px;color:#1e3a8a">손님 브리핑 비교 &amp; 공유 링크</strong>
          <div style="font-size:12px;color:#475569">체크한 ${selectedBriefCount}건을 모바일 비교 페이지나 카카오톡 문구로 즉시 전송할 수 있습니다.</div>
        </div>
        <button type="button" class="pw-btn pw-btn-blue pw-btn-sm" id="v1-open-brief-inner">
          ${D().icon('share', 13)} 브리핑 페이지 만들기 (${selectedBriefCount}건)
        </button>
      </div>

      <section class="v1-card">
        <div class="v1-card-head">
          <div class="v1-card-title">${D().icon('target', 15)} 구매 의뢰 후보 매물 (${activeMatches.length})</div>
        </div>
        ${activeMatches.length === 0 ? `
          <div style="padding:24px;text-align:center;color:#64748b">연결된 매물이 없습니다.</div>
        ` : `
          <table class="pw-table">
            <thead>
              <tr>
                <th style="width:36px">선택</th>
                <th>매물 · 입주</th>
                <th>면적 · 가격</th>
                <th>단계</th>
                <th>손님 설명 한 줄</th>
              </tr>
            </thead>
            <tbody>
              ${activeMatches.map((m) => `
                <tr>
                  <td><input type="checkbox" data-v1-brief-toggle="${m.id}" ${m.briefSelected ? 'checked' : ''} aria-label="브리핑에 포함" /></td>
                  <td>
                    <strong>${D().esc(m.place)}</strong>
                    <div style="font-size:11.5px;color:#64748b">입주 ${D().esc(m.moveInLabel)} · ${D().esc(m.updatedAt)}</div>
                  </td>
                  <td class="num">
                    <strong>${D().esc(m.priceLabel)}</strong>
                    ${m.agreedPriceLabel ? `<div style="font-size:11px;color:#2563eb">합의 ${D().esc(m.agreedPriceLabel)}</div>` : ''}
                    <div style="font-size:11px;color:#64748b">${D().esc(m.areaDetail)}</div>
                  </td>
                  <td>
                    <select class="stage-select" data-v1-match-stage="${m.id}">
                      ${D().MATCH_STAGES.map((s) => `<option value="${s.key}" ${s.key === m.stage ? 'selected' : ''}>${s.label}</option>`).join('')}
                    </select>
                  </td>
                  <td style="min-width:200px">
                    <input class="field-input" style="padding:5px 8px;font-size:12px" data-v1-brief-note="${m.id}" value="${D().esc(m.briefNote)}" />
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </section>
    `;
  }

  function renderFilesTab(project, ui) {
    const q = (ui.cockpitFileSearch || '').trim().toLowerCase();
    const filtered = project.files.filter((f) => {
      if (ui.cockpitFileCat !== 'all' && f.category !== ui.cockpitFileCat) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        (f.caption || '').toLowerCase().includes(q) ||
        (f.ocrText || '').toLowerCase().includes(q)
      );
    });
    return `
      <div class="v1-card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div style="display:flex;flex-wrap:wrap;gap:5px">
          ${D().FILE_CATEGORIES.map((c) => `
            <button type="button" class="pw-btn pw-btn-sm ${ui.cockpitFileCat === c.key ? 'pw-btn-blue' : 'pw-btn-line'}" data-v1-fcat="${c.key}">
              ${c.label}
            </button>
          `).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <div class="v2-search-input" style="background:#f8fafc;border-color:#dbe1e8;width:210px">
            ${D().icon('search', 13)}
            <input id="v1-file-search" value="${D().esc(ui.cockpitFileSearch)}" placeholder="파일명 · OCR 글자 검색..." />
          </div>
          <button type="button" class="pw-btn pw-btn-primary pw-btn-sm" id="v1-files-upload">+ 올리기</button>
        </div>
      </div>

      ${filtered.length === 0 ? `
        <div class="v1-card" style="padding:36px;text-align:center;color:#64748b">조건에 맞는 자료가 없습니다.</div>
      ` : `
        <div class="file-grid">
          ${filtered.map((f) => `
            <button type="button" class="file-card" data-open-file="${f.id}">
              <div class="file-thumb">${D().svgPreview(f.previewKind, f.name)}</div>
              <div class="file-info">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
                  <span class="pw-badge" data-tone="gray" style="height:18px;font-size:10.5px">${D().esc(f.category)}</span>
                  <span style="font-size:10.5px;color:#94a3b8">${D().esc(f.size)}</span>
                </div>
                <div class="file-name trunc">${D().esc(f.name)}</div>
                <div class="file-caption">${D().esc(f.caption)}</div>
              </div>
            </button>
          `).join('')}
        </div>
      `}
    `;
  }

  function renderDealTab(project) {
    const deals = project.listingIntakes.filter((li) => li.deal).map((li) => ({ place: li.place, deal: li.deal }));
    if (deals.length === 0) {
      return `
        <div class="v1-card" style="padding:36px;text-align:center;color:#64748b">
          아직 거래 전환된 계약이 없습니다.<br/>매칭 단계에서 협상이 마무리되면 거래(Deal)와 대금 일정이 여기에 추적됩니다.
        </div>
      `;
    }
    return deals.map(({ place, deal }) => `
      <section class="v1-card">
        <div class="v1-card-head">
          <div class="v1-card-title">${D().icon('handshake', 15)} ${D().esc(place)} · ${D().esc(deal.transactionType)} ${D().esc(deal.agreedPriceLabel)}</div>
          <span class="pw-badge" data-tone="blue">${D().esc(deal.stageLabel)}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin-bottom:14px">
          ${D().DEAL_STAGES.map((st) => `
            <div style="padding:6px 8px;border-radius:7px;font-size:11.5px;text-align:center;font-weight:600;
              ${st.key === deal.stage ? 'background:#2563eb;color:#ffffff' : 'background:#f1f5f9;color:#64748b'}">${st.label}</div>
          `).join('')}
        </div>
        <div class="v1-dual-grid">
          <div>
            <div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:6px">대금 지급 일정 (DealPayment)</div>
            <table class="pw-table">
              <tbody>
                ${deal.payments.map((p) => `
                  <tr>
                    <td><strong>${D().esc(p.kind)}</strong></td>
                    <td class="num" style="color:#64748b">${D().esc(p.dateLabel)}</td>
                    <td class="num"><strong>${D().esc(p.amountLabel)}</strong></td>
                    <td><span class="pw-badge" data-tone="${p.status === 'paid' ? 'green' : 'gray'}">${D().esc(p.statusLabel)}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div>
            <div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:6px">중개보수 (CommissionPayment)</div>
            <div style="padding:12px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;display:grid;gap:6px">
              <div class="v1-kv-line"><span class="v1-kv-k">청구 대상</span><span class="v1-kv-v">${D().esc(deal.commission.clientSide)}</span></div>
              <div class="v1-kv-line"><span class="v1-kv-k">적용 요율</span><span class="v1-kv-v num">${D().esc(deal.commission.rate)}</span></div>
              <div class="v1-kv-line"><span class="v1-kv-k">예상 수수료</span><span class="v1-kv-v num" style="color:#2563eb;font-weight:700">${D().esc(deal.commission.expectedWonLabel)}</span></div>
              <div class="v1-kv-line"><span class="v1-kv-k">수금 상태</span><span class="v1-kv-v">${D().esc(deal.commission.statusLabel)}</span></div>
            </div>
          </div>
        </div>
      </section>
    `).join('');
  }

  function renderDockBody(project, tab, openTasks) {
    if (tab === 'tasks') {
      return `
        <div class="task-input-row">
          ${D().icon('plus', 14)}
          <input id="v1-task-input" placeholder="업무 적고 Enter (한글 조합 안전)" aria-label="새 업무 추가" />
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${project.tasks.length === 0 ? '<div style="padding:20px;text-align:center;color:#94a3b8;font-size:12px">등록된 업무가 없습니다.</div>' : ''}
          ${project.tasks.map((t) => renderTaskItem(t)).join('')}
        </div>
      `;
    }

    const items = [];
    if (tab === 'all' || tab === 'consult') {
      project.consultations.forEach((c) => items.push({ kind: 'consult', data: c }));
    }
    if (tab === 'all' || tab === 'comment') {
      project.comments.forEach((cm) => items.push({ kind: 'comment', data: cm }));
    }

    return `
      ${tab === 'all' ? `
        <div style="padding:9px 10px;border-radius:9px;background:#f8fafc;border:1px solid #e2e8f0;display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;font-weight:700;color:#334155">
            <span>진행 중 업무 (${openTasks.length})</span>
            <button type="button" style="color:#2563eb;font-size:11.5px" data-v1-stream="tasks">모두 보기 →</button>
          </div>
          <div class="task-input-row" style="padding:5px 8px">
            <input id="v1-task-input" placeholder="+ 할 일 빠르게 추가 후 Enter..." />
          </div>
          ${openTasks.slice(0, 3).map((t) => renderTaskItem(t)).join('')}
        </div>
      ` : ''}

      ${items.length === 0 ? `
        <div style="padding:26px;text-align:center;color:#94a3b8;font-size:12px">아직 기록이 없습니다. 아래에서 바로 작성해 보세요.</div>
      ` : items.map((item) => {
        if (item.kind === 'consult') {
          const c = item.data;
          const typeLabel = D().CONSULT_TYPES.find((x) => x.key === c.type)?.label || c.type;
          return `
            <article class="stream-card consult">
              <div class="stream-meta">
                <span><strong style="color:#1d4ed8">고객 상담 · ${D().esc(typeLabel)}</strong> · ${D().esc(c.contactName)}</span>
                <span class="num">${D().esc(c.createdAt)}</span>
              </div>
              <div class="stream-body">${D().esc(c.content)}</div>
              ${c.contextLabel ? `<div style="margin-top:5px;font-size:11px;color:#64748b">맥락: ${D().esc(c.contextLabel)} · ${D().esc(c.author)}</div>` : ''}
            </article>
          `;
        }
        const cm = item.data;
        return `
          <article class="stream-card comment">
            <div class="stream-meta">
              <span><strong style="color:#b45309">팀 코멘트</strong> · ${D().esc(cm.author)}</span>
              <span class="num">${D().esc(cm.createdAt)}</span>
            </div>
            <div class="stream-body">${D().esc(cm.body)}</div>
          </article>
        `;
      }).join('')}
    `;
  }

  function renderTaskItem(t) {
    return `
      <div class="task-row ${t.done ? 'done' : ''}">
        <button type="button" class="task-check" data-v1-task-toggle="${t.id}" aria-label="${D().esc(t.title)} 완료 전환">
          ${t.done ? D().icon('check', 11) : ''}
        </button>
        <div style="min-width:0;flex:1">
          <div class="task-title" style="font-size:12.5px;font-weight:500;color:#0f172a">${D().esc(t.title)}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;display:flex;gap:6px">
            <span class="num">${D().esc(t.dueLabel)}</span>
            ${t.remindLabel ? `<span style="color:#2563eb">${D().esc(t.remindLabel)}</span>` : ''}
            <span>${D().esc(t.assignee)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function bindCockpitEvents(container, project) {
    container.querySelectorAll('[data-v1-select]').forEach((btn) => {
      btn.addEventListener('click', () => S().selectProject(btn.getAttribute('data-v1-select')));
    });

    container.querySelector('#v1-new-proj')?.addEventListener('click', () => M().openNewProjectModal());
    container.querySelector('#v1-act-listing')?.addEventListener('click', () => M().openNewListingSheet(project.id));
    container.querySelector('#v1-card-add-listing')?.addEventListener('click', () => M().openNewListingSheet(project.id));
    container.querySelector('#v1-empty-listing')?.addEventListener('click', () => M().openNewListingSheet(project.id));
    container.querySelector('#v1-act-req')?.addEventListener('click', () => M().openNewRequirementSheet(project.id));
    container.querySelector('#v1-card-add-req')?.addEventListener('click', () => M().openNewRequirementSheet(project.id));
    container.querySelector('#v1-empty-req')?.addEventListener('click', () => M().openNewRequirementSheet(project.id));
    container.querySelector('#v1-act-file')?.addEventListener('click', () => M().openUploadFileModal(project.id));
    container.querySelector('#v1-files-upload')?.addEventListener('click', () => M().openUploadFileModal(project.id));
    container.querySelector('#v1-act-brief')?.addEventListener('click', () => M().openBriefingModal(project.id));
    container.querySelector('#v1-open-brief-inner')?.addEventListener('click', () => M().openBriefingModal(project.id));

    container.querySelector('#v1-title-input')?.addEventListener('change', (e) => {
      const next = e.target.value.trim();
      if (next && next !== project.title) {
        S().updateProject(project.id, { title: next });
        M().showToast('프로젝트 이름을 바꿨습니다.');
      }
    });

    container.querySelector('#v1-memo-input')?.addEventListener('change', (e) => {
      S().updateProject(project.id, { memo: e.target.value.trim() });
      M().showToast('메모를 저장했습니다.');
    });

    container.querySelectorAll('[data-v1-step]').forEach((btn) => {
      btn.addEventListener('click', () => S().toggleStepDone(project.id, btn.getAttribute('data-v1-step')));
    });

    container.querySelectorAll('[data-v1-tab], [data-v1-tab-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextTab = btn.getAttribute('data-v1-tab') || btn.getAttribute('data-v1-tab-jump');
        S().setUi({ cockpitTab: nextTab });
      });
    });

    container.querySelectorAll('[data-v1-stream]').forEach((btn) => {
      btn.addEventListener('click', () => S().setUi({ cockpitStreamTab: btn.getAttribute('data-v1-stream') }));
    });

    container.querySelectorAll('[data-v1-match-stage]').forEach((sel) => {
      sel.addEventListener('change', () => {
        S().updateMatchStage(project.id, sel.getAttribute('data-v1-match-stage'), sel.value);
        M().showToast(`매칭 단계를 "${D().MATCH_STAGE_MAP[sel.value]?.label}"(으)로 변경했습니다.`);
      });
    });

    container.querySelectorAll('[data-v1-brief-toggle]').forEach((cb) => {
      cb.addEventListener('change', () => S().toggleBriefSelect(project.id, cb.getAttribute('data-v1-brief-toggle')));
    });

    container.querySelectorAll('[data-v1-brief-note]').forEach((inp) => {
      inp.addEventListener('change', () => {
        S().updateBriefNote(project.id, inp.getAttribute('data-v1-brief-note'), inp.value);
        M().showToast('브리핑 설명을 저장했습니다.');
      });
    });

    container.querySelectorAll('[data-v1-fcat]').forEach((btn) => {
      btn.addEventListener('click', () => S().setUi({ cockpitFileCat: btn.getAttribute('data-v1-fcat') }));
    });

    const fSearch = container.querySelector('#v1-file-search');
    if (fSearch) {
      let composing = false;
      const applySearch = (val, pos) => {
        S().setUi({ cockpitFileSearch: val });
        const reInput = document.querySelector('#v1-file-search');
        if (reInput) { reInput.focus(); if (pos != null) reInput.setSelectionRange(pos, pos); }
      };
      fSearch.addEventListener('compositionstart', () => { composing = true; });
      fSearch.addEventListener('compositionend', (e) => {
        composing = false;
        applySearch(e.target.value, e.target.selectionStart);
      });
      fSearch.addEventListener('input', (e) => {
        if (composing || e.isComposing) return;
        applySearch(e.target.value, e.target.selectionStart);
      });
    }

    container.querySelectorAll('[data-open-file]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const f = project.files.find((x) => x.id === btn.getAttribute('data-open-file'));
        M().openFilePreviewModal(f);
      });
    });

    container.querySelectorAll('[data-v1-accept-sug]').forEach((btn) => {
      btn.addEventListener('click', () => {
        S().acceptSuggestion(project.id, btn.getAttribute('data-v1-accept-sug'));
        M().showToast('통화 AI 제안을 업무/조건에 반영했습니다.');
      });
    });
    container.querySelectorAll('[data-v1-dismiss-sug]').forEach((btn) => {
      btn.addEventListener('click', () => {
        S().dismissSuggestion(project.id, btn.getAttribute('data-v1-dismiss-sug'));
        M().showToast('제안을 숨겼습니다.');
      });
    });

    container.querySelectorAll('[data-v1-task-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => S().toggleTask(project.id, btn.getAttribute('data-v1-task-toggle')));
    });

    const taskInput = container.querySelector('#v1-task-input');
    taskInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        if (S().addTask(project.id, { title: taskInput.value })) {
          M().showToast('업무를 추가했습니다.');
        }
      }
    });

    container.querySelectorAll('[data-v1-cmode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        composerMode = btn.getAttribute('data-v1-cmode');
        renderCockpit(container);
      });
    });
    container.querySelector('#v1-consult-type')?.addEventListener('change', (e) => {
      consultType = e.target.value;
    });
    const compInput = container.querySelector('#v1-composer-input');
    compInput?.addEventListener('input', (e) => { composerDraft = e.target.value; });
    const submitComposer = () => {
      const text = compInput?.value || '';
      if (!text.trim()) return;
      if (composerMode === 'consult') {
        S().addConsultation(project.id, { type: consultType, content: text });
        M().showToast('고객 상담(Consultation)을 기록했습니다.');
      } else {
        S().addComment(project.id, { body: text, color: 'yellow' });
        M().showToast('팀 코멘트(ProjectComment)를 기록했습니다.');
      }
      composerDraft = '';
    };
    container.querySelector('#v1-composer-submit')?.addEventListener('click', submitComposer);
    compInput?.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        submitComposer();
      }
    });

    container.querySelectorAll('[data-call-phone]').forEach((btn) => {
      btn.addEventListener('click', () => {
        M().showToast(`${btn.getAttribute('data-call-name')} (${btn.getAttribute('data-call-phone')}) 전화 발신 준비`);
      });
    });
  }

  window.PWViews = window.PWViews || {};
  window.PWViews.cockpit = renderCockpit;
})();
