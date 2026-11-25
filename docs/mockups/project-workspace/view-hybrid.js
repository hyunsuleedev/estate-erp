/* ==========================================================================
   ★ 1+2 통합안 · 모던 허브 + 상시 할 일 & 통화=상담 통합 워크스페이스
   좌측 프로젝트·OCR 레일 + 중앙 실행 캔버스 + 우측 상시 분할 도크(상: 할 일 / 하: 상담·통화·코멘트)
   ========================================================================== */
(() => {
  'use strict';

  function D() { return window.PWData; }
  function S() { return window.PWStore; }
  function M() { return window.PWModals; }

  let duePreset = '오늘';
  let composerMode = 'consult'; // consult | comment
  let consultType = 'phone';
  let composerDraft = '';
  let addStepOpen = false;
  let addStepParallel = false;
  const playingRecordingIds = new Set();
  const expandedTranscriptIds = new Set();

  function renderHybrid(container) {
    const state = S().getState();
    const project = S().getCurrentProject();
    const ui = state.ui;
    const progress = S().computeProjectProgress(project);
    const openTasks = project.tasks.filter((t) => !t.done);
    const doneTasks = project.tasks.filter((t) => t.done);
    const activeMatches = project.matches.filter((m) => m.stage !== 'closed');
    const selectedBriefCount = project.matches.filter((m) => m.briefSelected).length;
    const pendingSuggestionsCount = project.callRecordings.reduce(
      (sum, r) => sum + r.suggestions.filter((s) => s.status === 'pending').length,
      0
    );

    container.innerHTML = `
      <div class="vh-shell">
        <!-- Main Project Detail Workspace -->
        <main class="v1-center">
          <div class="vh-breadcrumb">
            <button type="button" class="vh-back-btn" id="vh-back-list">
              ${D().icon('arrowLeft', 13)} 프로젝트 목록
            </button>
            <span style="color:#cbd5e1">/</span>
            <span class="trunc" style="color:#475569;font-weight:500">${D().esc(project.primaryContact?.name || '고객')} · ${D().esc(project.title)}</span>
          </div>
          <header class="v1-header">
            <div class="v1-hero-row">
              <div class="v1-title-wrap">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px">
                  <span class="pw-badge" data-tone="${progress.key === 'active' ? 'green' : 'gray'}">
                    <span class="pw-dot"></span>${D().esc(progress.label)}
                  </span>
                  <span style="font-size:12px;color:#64748b">시작 ${D().esc(project.createdAt)} · 담당 <strong>${D().esc(project.assignedTo)}</strong></span>
                  <!-- Restrained Status Light Switcher from Angle 2 -->
                  <div style="display:inline-flex;align-items:center;gap:2px;padding:2px 4px;border-radius:999px;background:#f1f5f9;border:1px solid #e2e8f0" title="손님 불빛 변경">
                    ${D().STATUS_LIGHTS.map((l) => `
                      <button type="button" data-vh-light="${l.key}"
                        style="display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 7px;border-radius:999px;font-size:11px;
                        ${project.statusLight === l.key ? `background:#ffffff;font-weight:700;color:${l.text};box-shadow:0 1px 2px rgba(0,0,0,0.08)` : 'color:#64748b'}">
                        <span style="width:6px;height:6px;border-radius:50%;background:${l.color}"></span>${l.label}
                      </button>
                    `).join('')}
                  </div>
                </div>
                <input class="v1-title-input" id="vh-title-input" value="${D().esc(project.title)}" aria-label="프로젝트 이름" />
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
                <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="vh-act-listing">${D().icon('building', 13)} + 매물 의뢰</button>
                <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="vh-act-req">${D().icon('target', 13)} + 희망 조건</button>
                <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="vh-act-file">${D().icon('upload', 13)} 자료 올리기</button>
                <button type="button" class="pw-btn pw-btn-blue pw-btn-sm" id="vh-act-brief">
                  ${D().icon('share', 13)} 브리핑 공유${selectedBriefCount > 0 ? ` (${selectedBriefCount})` : ''}
                </button>
              </div>
            </div>

            <!-- Workspace Tabs -->
            <nav class="v1-tabs" aria-label="워크스페이스 영역">
              <button type="button" class="v1-tab ${ui.hybridTab === 'overview' ? 'active' : ''}" data-vh-tab="overview">개요</button>
              <button type="button" class="v1-tab ${ui.hybridTab === 'matches' ? 'active' : ''}" data-vh-tab="matches">
                매물·매칭 <span class="v1-tab-count num">${activeMatches.length}</span>
              </button>
              <button type="button" class="v1-tab ${ui.hybridTab === 'files' ? 'active' : ''}" data-vh-tab="files">
                자료실 <span class="v1-tab-count num">${project.files.length}</span>
              </button>
              <button type="button" class="v1-tab ${ui.hybridTab === 'deal' ? 'active' : ''}" data-vh-tab="deal">
                거래·보수 <span class="v1-tab-count num">${project.listingIntakes.filter((l) => l.deal).length}</span>
              </button>
            </nav>
          </header>

          <div class="v1-body" data-scroll-id="vh-center-body">
            ${ui.hybridTab === 'overview' ? renderOverviewTab(project, activeMatches, selectedBriefCount) : ''}
            ${ui.hybridTab === 'matches' ? renderMatchesTab(project, activeMatches, selectedBriefCount) : ''}
            ${ui.hybridTab === 'files' ? renderFilesTab(project, ui) : ''}
            ${ui.hybridTab === 'deal' ? renderDealTab(project) : ''}
          </div>
        </main>

        <!-- Right Split Dock: Top = Always-visible 할 일(업무) / Bottom = 상담(통화 통합)·팀 코멘트 -->
        <aside class="vh-dock" aria-label="할 일 및 상담 코멘트">
          <!-- TOP ZONE: Always-visible Tasks -->
          <section class="vh-dock-tasks" aria-label="할 일 업무">
            <div class="vh-zone-head">
              <div style="display:flex;align-items:center;gap:6px">
                ${D().icon('listTodo', 14)}
                <strong style="font-size:13px;color:#0f172a">할 일 (업무)</strong>
                <span class="pw-badge" data-tone="blue">${openTasks.length}</span>
              </div>
              <div style="display:flex;gap:3px">
                ${['오늘', '내일', '이번 주'].map((d) => `
                  <button type="button" class="pw-btn pw-btn-sm ${duePreset === d ? 'pw-btn-primary' : 'pw-btn-ghost'}"
                    style="height:21px;font-size:11px;padding:0 7px" data-vh-due="${d}">${d}</button>
                `).join('')}
              </div>
            </div>
            <div style="padding:0 12px 8px">
              <div class="task-input-row" style="padding:5px 9px">
                ${D().icon('plus', 13)}
                <input id="vh-task-input" placeholder="통화 중 할 일 적고 Enter (${duePreset})..." aria-label="새 할 일 추가" />
              </div>
            </div>
            <div class="vh-tasks-scroll" data-scroll-id="vh-tasks">
              ${openTasks.length === 0 ? `
                <div style="padding:10px;text-align:center;color:#94a3b8;font-size:12px">남은 할 일이 없습니다.</div>
              ` : openTasks.map((t) => renderTaskRow(t)).join('')}
              ${doneTasks.length > 0 ? `
                <button type="button" id="vh-toggle-done" style="font-size:11.5px;color:#64748b;padding:3px 2px;text-align:left">
                  ${ui.hybridShowDoneTasks ? '▾' : '▸'} 완료됨 ${doneTasks.length}건
                </button>
                ${ui.hybridShowDoneTasks ? doneTasks.map((t) => renderTaskRow(t)).join('') : ''}
              ` : ''}
            </div>
          </section>

          <!-- BOTTOM ZONE: Consultations (with Call Recordings & AI inline) + Team Comments -->
          <section class="vh-dock-feed" aria-label="상담 및 팀 코멘트">
            <div class="vh-zone-head" style="border-bottom:1px solid #eef1f4;padding-bottom:8px">
              <div style="display:flex;align-items:center;gap:5px;min-width:0;white-space:nowrap">
                <strong style="font-size:13px;color:#0f172a">상담 · 팀 코멘트</strong>
                ${pendingSuggestionsCount > 0 ? `
                  <span class="pw-badge" data-tone="violet" style="height:18px;font-size:10.5px;padding:0 6px">AI ${pendingSuggestionsCount}</span>
                ` : ''}
              </div>
              <div class="v1-seg-bar" style="padding:2px;flex:none">
                <button type="button" class="v1-seg-btn ${ui.hybridFeedFilter === 'all' ? 'active' : ''}" style="flex:none;height:22px;padding:0 7px;font-size:11.5px" data-vh-ff="all">전체</button>
                <button type="button" class="v1-seg-btn ${ui.hybridFeedFilter === 'consult' ? 'active' : ''}" style="flex:none;height:22px;padding:0 7px;font-size:11.5px" data-vh-ff="consult">상담 ${project.consultations.length}</button>
                <button type="button" class="v1-seg-btn ${ui.hybridFeedFilter === 'comment' ? 'active' : ''}" style="flex:none;height:22px;padding:0 7px;font-size:11.5px" data-vh-ff="comment">코멘트 ${project.comments.length}</button>
              </div>
            </div>

            <div class="vh-feed-scroll" data-scroll-id="vh-feed">
              ${renderUnifiedFeed(project, ui.hybridFeedFilter)}
            </div>

            <div class="v1-composer">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
                <div style="display:flex;gap:4px">
                  <button type="button" class="pw-btn pw-btn-sm ${composerMode === 'consult' ? 'pw-btn-blue' : 'pw-btn-line'}" data-vh-cmode="consult">
                    고객 상담 적기
                  </button>
                  <button type="button" class="pw-btn pw-btn-sm ${composerMode === 'comment' ? 'pw-btn-blue' : 'pw-btn-line'}" data-vh-cmode="comment">
                    팀 코멘트
                  </button>
                </div>
                ${composerMode === 'consult' ? `
                  <select class="stage-select" id="vh-consult-type" aria-label="상담 방식">
                    ${D().CONSULT_TYPES.map((t) => `<option value="${t.key}" ${t.key === consultType ? 'selected' : ''}>${t.label}</option>`).join('')}
                  </select>
                ` : '<span style="font-size:11px;color:#64748b">프로젝트 팀 메모</span>'}
              </div>
              <textarea id="vh-composer-input" class="field-textarea" style="min-height:52px;font-size:12.5px"
                placeholder="${composerMode === 'consult' ? `${D().esc(project.primaryContact?.name || '고객')}님과 나눈 상담을 적으세요...` : '팀원에게 공유할 진행 메모나 주의사항을 적으세요...'}">${D().esc(composerDraft)}</textarea>
              <div style="display:flex;align-items:center;justify-content:space-between">
                <span style="font-size:11px;color:#94a3b8">${composerMode === 'consult' ? 'Contact 상담 · 통화 녹음 연동' : 'Project 코멘트 귀속'}</span>
                <button type="button" class="pw-btn pw-btn-primary pw-btn-sm" id="vh-composer-submit">저장</button>
              </div>
            </div>
          </section>
        </aside>
      </div>
    `;

    bindHybridEvents(container, project);
  }

  function renderTaskRow(t) {
    return `
      <div class="task-row ${t.done ? 'done' : ''}" style="padding:6px 8px">
        <button type="button" class="task-check" data-vh-task-toggle="${t.id}" aria-label="${D().esc(t.title)} 완료 전환">
          ${t.done ? D().icon('check', 11) : ''}
        </button>
        <div style="min-width:0;flex:1">
          <div class="task-title" style="font-size:12px;font-weight:500;color:#0f172a;line-height:1.35">${D().esc(t.title)}</div>
          <div style="font-size:10.5px;color:#64748b;margin-top:2px;display:flex;gap:6px">
            <span class="num">${D().esc(t.dueLabel)}</span>
            ${t.remindLabel ? `<span style="color:#2563eb">${D().esc(t.remindLabel)}</span>` : ''}
            <span>${D().esc(t.assignee)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderUnifiedFeed(project, filter) {
    const items = [];
    if (filter === 'all' || filter === 'consult') {
      project.consultations.forEach((c) => items.push({ kind: 'consult', data: c }));
    }
    if (filter === 'all' || filter === 'comment') {
      project.comments.forEach((cm) => items.push({ kind: 'comment', data: cm }));
    }

    if (items.length === 0) {
      return '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:12px">아직 기록이 없습니다. 아래에서 바로 작성해 보세요.</div>';
    }

    return items.map((item) => {
      if (item.kind === 'comment') {
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
      }

      const c = item.data;
      const typeLabel = D().CONSULT_TYPES.find((x) => x.key === c.type)?.label || c.type;
      const rec = c.callRecordingId
        ? project.callRecordings.find((r) => r.id === c.callRecordingId)
        : null;
      const isPlaying = rec ? playingRecordingIds.has(rec.id) : false;
      const isExpanded = rec ? expandedTranscriptIds.has(rec.id) : false;

      return `
        <article class="stream-card consult">
          <div class="stream-meta">
            <span style="display:inline-flex;align-items:center;gap:5px">
              <strong style="color:#1d4ed8">상담 · ${D().esc(typeLabel)}</strong>
              ${rec ? `<span class="pw-badge" data-tone="indigo" style="height:18px;font-size:10px;background:#eef2ff;color:#4338ca">${D().icon('mic', 10)} 녹음 ${D().esc(rec.duration)}</span>` : ''}
              <span>· ${D().esc(c.contactName)}</span>
            </span>
            <span class="num">${D().esc(c.createdAt)}</span>
          </div>
          <div class="stream-body">${D().esc(c.content)}</div>

          ${rec ? `
            <div class="vh-call-bar">
              <button type="button" class="vh-play-btn ${isPlaying ? 'playing' : ''}" data-vh-play="${rec.id}" aria-label="${isPlaying ? '통화 녹음 일시정지' : '통화 녹음 재생'}">
                ${D().icon(isPlaying ? 'pause' : 'play', 11)}
              </button>
              <div class="vh-wave-track" aria-hidden="true">
                <div class="vh-wave-fill ${isPlaying ? 'playing' : ''}"></div>
              </div>
              <span class="num" style="font-size:10.5px;color:#475569">${isPlaying ? '01:24 / ' : ''}${D().esc(rec.duration)}</span>
              <button type="button" class="vh-transcript-toggle" data-vh-transcript="${rec.id}">
                ${isExpanded ? '원문 접기' : '발화 원문 보기'} ${D().icon(isExpanded ? 'chevronUp' : 'chevronDown', 11)}
              </button>
            </div>

            ${isExpanded && rec.messages ? `
              <div class="vh-transcript">
                ${rec.messages.map((m) => `
                  <div class="vh-utterance ${m.speaker === '나' ? 'agent' : 'client'}">
                    <span class="vh-speaker">${D().esc(m.speaker)}</span>
                    <span class="vh-utext">${D().esc(m.text)}</span>
                    <span class="vh-utime num">${D().esc(m.time)}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            ${rec.suggestions.length > 0 ? `
              <div style="margin-top:8px;display:flex;flex-direction:column;gap:5px">
                ${rec.suggestions.map((sug) => `
                  <div class="vh-sug-row ${sug.status}">
                    <div style="min-width:0;flex:1">
                      <div style="display:flex;align-items:center;gap:5px">
                        <span class="pw-badge" data-tone="${sug.status === 'accepted' ? 'green' : sug.status === 'dismissed' ? 'gray' : 'violet'}" style="height:17px;font-size:10px">
                          ${D().icon('sparkles', 9)} ${D().esc(sug.type)}
                        </span>
                        <span style="font-size:11.5px;font-weight:600;color:#1e293b">${D().esc(sug.title)}</span>
                      </div>
                      <div style="font-size:11px;color:#64748b;margin-top:2px">${D().esc(sug.evidence)}</div>
                    </div>
                    ${sug.status === 'pending' ? `
                      <div style="display:flex;gap:4px;flex:none">
                        <button type="button" class="pw-btn pw-btn-line pw-btn-sm" style="height:22px;padding:0 7px;font-size:11px" data-vh-dsug="${sug.id}">무시</button>
                        <button type="button" class="pw-btn pw-btn-blue pw-btn-sm" style="height:22px;padding:0 7px;font-size:11px" data-vh-asug="${sug.id}">
                          ${sug.applyKind === 'task' ? '업무에 반영' : '메모에 반영'}
                        </button>
                      </div>
                    ` : `<span style="font-size:11px;font-weight:600;color:${sug.status === 'accepted' ? '#059669' : '#94a3b8'};flex:none">${sug.status === 'accepted' ? '반영됨' : '무시됨'}</span>`}
                  </div>
                `).join('')}
              </div>
            ` : ''}
          ` : ''}

          ${c.contextLabel ? `<div style="margin-top:5px;font-size:11px;color:#64748b">맥락: ${D().esc(c.contextLabel)} · ${D().esc(c.author)}</div>` : ''}
        </article>
      `;
    }).join('');
  }

  function groupStepsByOrder(steps) {
    const groupsMap = new Map();
    steps.forEach((st) => {
      const ord = Number(st.order) || 1;
      if (!groupsMap.has(ord)) groupsMap.set(ord, []);
      groupsMap.get(ord).push(st);
    });
    return Array.from(groupsMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([order, items]) => ({ order, items }));
  }

  function computeStepLiveBadge(project, step, activeMatches) {
    if (step.kind === 'listing_intake') {
      const li =
        project.listingIntakes.find((item) => step.title.includes(item.place.split(' ')[0])) ||
        project.listingIntakes[0];
      if (!li) return { text: '매물 상세 보기 →', toneClass: '', tab: 'matches' };
      if (li.deal) {
        return {
          text: `${li.deal.stageLabel} · 잔금 ${li.deal.balanceDate} →`,
          toneClass: 'is-deal',
          tab: 'deal',
        };
      }
      const l = li.listings?.[0];
      return {
        text: l?.ad
          ? `${l.ad.channel} ${l.ad.rank}위 · 매물 보기 →`
          : `${l?.matchSummary || '매칭 대기'} · 매물 보기 →`,
        toneClass: '',
        tab: 'matches',
      };
    }
    if (step.kind === 'buyer_intake') {
      if (activeMatches.length === 0) {
        return { text: '매칭 후보 연결 →', toneClass: 'is-match', tab: 'matches' };
      }
      const counts = {};
      activeMatches.forEach((m) => {
        counts[m.stage] = (counts[m.stage] || 0) + 1;
      });
      const priority = ['dealCreated', 'negotiating', 'viewing', 'viewingConfirmed', 'buyerReviewing', 'buyerInterested', 'suggested'];
      const topParts = priority
        .filter((k) => counts[k] > 0)
        .slice(0, 2)
        .map((k) => `${D().MATCH_STAGE_MAP[k]?.label || k} ${counts[k]}`);
      return {
        text: `${topParts.join(' · ')} (후보 ${activeMatches.length}건) →`,
        toneClass: 'is-match',
        tab: 'matches',
      };
    }
    return null;
  }

  function resolveStepIntake(project, step, usedListingIds, usedBuyerIds) {
    if (step.kind === 'listing_intake') {
      let li = step.intakeId ? project.listingIntakes.find((item) => item.id === step.intakeId) : null;
      if (!li) {
        li = project.listingIntakes.find((item) => !usedListingIds.has(item.id) && step.title.includes(item.place.split(' ')[0]));
      }
      if (!li) {
        li = project.listingIntakes.find((item) => !usedListingIds.has(item.id));
      }
      if (li) usedListingIds.add(li.id);
      return li || null;
    }
    if (step.kind === 'buyer_intake') {
      let bi = step.intakeId ? project.buyerIntakes.find((item) => item.id === step.intakeId) : null;
      if (!bi) {
        bi = project.buyerIntakes.find((item) => !usedBuyerIds.has(item.id));
      }
      if (bi) usedBuyerIds.add(bi.id);
      return bi || null;
    }
    return null;
  }

  function renderListingStepItem(step, li) {
    const l = li?.listings?.[0];
    return `
      <div class="vh-vflow-item is-listing ${step.done ? 'is-done' : ''}">
        <div class="vh-vflow-item-head">
          <div class="vh-vflow-item-left">
            ${step.synthetic ? '' : `
              <button type="button" class="vh-vflow-check-btn" data-vh-step="${step.id}" aria-pressed="${step.done}" title="완료 여부 전환">
                ${step.done ? D().icon('check', 12) : ''}
              </button>
            `}
            <span class="pw-badge" data-tone="amber">매물 의뢰</span>
            <strong class="vh-vflow-title">${D().esc(li ? li.place : step.title)}</strong>
            ${li ? `<span class="num" style="font-size:12px;color:#64748b">${D().esc(li.areaDetail)} · ${D().esc(li.lastVerifiedLabel)}</span>` : ''}
          </div>
          <div class="vh-vflow-item-right">
            ${step.targetDate ? `<span class="num" style="font-size:11.5px;color:#64748b">${D().esc(step.targetDate)}</span>` : ''}
            ${step.done ? '<span class="pw-badge" data-tone="green">완료</span>' : ''}
            ${li ? `<span class="pw-badge" data-tone="green">${D().esc(li.lastCheckResult)}</span>` : ''}
          </div>
        </div>
        ${li ? `
          <div class="vh-meta-strip">
            <div class="vh-meta-cell">
              <span class="vh-meta-label">${D().esc(l?.transactionType || '거래')} 호가</span>
              <span class="vh-meta-val num">${D().esc(l?.priceLabel || '가격 미정')}</span>
            </div>
            <div class="vh-meta-cell">
              <span class="vh-meta-label">광고 현황</span>
              <span class="vh-meta-val" style="font-weight:600">
                ${l?.ad ? `${D().esc(l.ad.channel)} · <span style="color:#2563eb">${l.ad.rank}위/${l.ad.totalCount}</span> <span style="font-size:11.5px;color:#64748b;font-weight:500">(${D().esc(l.ad.cheapestLabel)})</span>` : '<span style="color:#94a3b8;font-weight:500">미게재</span>'}
              </span>
            </div>
            ${li.deal ? `
              <button type="button" class="vh-meta-cell vh-vflow-deal-btn" data-vh-tab-jump="deal" style="background:#ecfdf5;border-color:#a7f3d0">
                <span class="vh-meta-label" style="color:#047857">거래 · 잔금</span>
                <span class="vh-meta-val num" style="color:#065f46">${D().esc(li.deal.stageLabel)} · ${D().esc(li.deal.agreedPriceLabel)} (잔금 ${D().esc(li.deal.balanceDate)}) →</span>
              </button>
            ` : `
              <div class="vh-meta-cell">
                <span class="vh-meta-label">거래 · 잔금</span>
                <span class="vh-meta-val" style="color:#94a3b8;font-weight:500">진행 전</span>
              </div>
            `}
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderBuyerStepItem(project, step, bi, activeMatches) {
    const live = computeStepLiveBadge(project, step, activeMatches);
    const reqs = bi?.requirements || [];
    return `
      <div class="vh-vflow-item is-buyer ${step.done ? 'is-done' : ''}">
        <div class="vh-vflow-item-head">
          <div class="vh-vflow-item-left">
            ${step.synthetic ? '' : `
              <button type="button" class="vh-vflow-check-btn" data-vh-step="${step.id}" aria-pressed="${step.done}" title="완료 여부 전환">
                ${step.done ? D().icon('check', 12) : ''}
              </button>
            `}
            <span class="pw-badge" data-tone="blue">구매 의뢰</span>
            <strong class="vh-vflow-title">${D().esc(step.title)}</strong>
          </div>
          <div class="vh-vflow-item-right">
            ${step.targetDate ? `<span class="num" style="font-size:11.5px;color:#64748b">${D().esc(step.targetDate)}</span>` : ''}
            ${live ? `
              <button type="button" class="vh-vflow-live-link ${live.toneClass} num" data-vh-tab-jump="${live.tab}">
                ${D().esc(live.text)}
              </button>
            ` : ''}
            <button type="button" class="pw-btn pw-btn-ghost pw-btn-sm" data-vh-add-req>+ 조건 추가</button>
          </div>
        </div>
        ${reqs.map((req) => `
          <div class="vh-vflow-req-block">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
              <div style="display:flex;align-items:center;gap:6px">
                <span class="pw-badge" data-tone="blue">${D().esc(req.transactionType)} · ${D().esc(req.areaLabel)}</span>
                <span style="font-size:12px;color:#64748b">${D().esc(req.siteTypes)}</span>
              </div>
              <span class="pw-badge" data-tone="amber">긴급도 ${D().esc(req.urgency)}</span>
            </div>
            <div class="vh-meta-strip">
              <div class="vh-meta-cell">
                <span class="vh-meta-label">희망 예산</span>
                <span class="vh-meta-val num" style="color:#2563eb">${D().esc(req.budgetLabel)}</span>
              </div>
              <div class="vh-meta-cell">
                <span class="vh-meta-label">희망 단지</span>
                <span class="vh-meta-val">${D().esc(req.preferredSites.join(' · '))}</span>
              </div>
              <div class="vh-meta-cell">
                <span class="vh-meta-label">입주 희망</span>
                <span class="vh-meta-val num">${D().esc(req.moveInDate)}</span>
              </div>
            </div>
            ${req.memo ? `<div style="padding:7px 10px;border-radius:8px;background:#f8fafc;border:1px solid #eef1f4;font-size:12px;color:#475569">${D().esc(req.memo)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderManualStepItem(step) {
    return `
      <div class="vh-vflow-item is-manual ${step.done ? 'is-done' : ''}">
        <div class="vh-vflow-item-head">
          <div class="vh-vflow-item-left">
            <button type="button" class="vh-vflow-check-btn" data-vh-step="${step.id}" aria-pressed="${step.done}" title="완료 여부 전환">
              ${step.done ? D().icon('check', 12) : ''}
            </button>
            <span class="pw-badge" data-tone="gray">중개 단계</span>
            <span class="vh-vflow-title">${D().esc(step.title)}</span>
          </div>
          <div class="vh-vflow-item-right">
            <span class="num" style="font-size:12px;color:#64748b">${D().esc(step.targetDate)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderVerticalRow({ dotContent, rowCls, stageLabel, parallelCount, statusLabel, itemsHtml, showConnector }) {
    return `
      <div class="vh-vflow-row ${rowCls}">
        <div class="vh-vflow-spine" aria-hidden="true">
          <div class="vh-vflow-dot num">${dotContent}</div>
          ${showConnector ? `
            <div class="vh-vflow-connector">
              <div class="vh-vflow-line"></div>
              <div class="vh-vflow-arrow">
                <svg viewBox="0 0 16 14" width="14" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8 2v9"/><path d="m4 7 4 4 4-4"/>
                </svg>
              </div>
            </div>
          ` : ''}
        </div>
        <div class="vh-vflow-stage">
          <div class="vh-vflow-stage-head">
            <div class="vh-vflow-stage-left">
              <span class="vh-vflow-stage-label">${D().esc(stageLabel)}</span>
              ${parallelCount > 1 ? `<span class="vh-vflow-parallel-tag">${D().icon('layers', 11)} 동시 진행 ${parallelCount}건</span>` : ''}
            </div>
            <span class="vh-vflow-stage-status">${D().esc(statusLabel)}</span>
          </div>
          <div class="vh-vflow-items">
            ${itemsHtml}
          </div>
        </div>
      </div>
    `;
  }

  function renderFlowDiagramCard(project, activeMatches) {
    const groups = groupStepsByOrder(project.steps).map((g) => ({
      ...g,
      items: g.items.slice(),
    }));
    const usedListingIds = new Set();
    const usedBuyerIds = new Set();

    // First pass: resolve step-linked intakes in order so unlinked intakes can be appended defensively if any exist.
    const resolvedByStepId = new Map();
    groups.forEach((g) => {
      g.items.forEach((st) => {
        resolvedByStepId.set(st.id, resolveStepIntake(project, st, usedListingIds, usedBuyerIds));
      });
    });

    const extraItems = [];
    project.listingIntakes.forEach((li) => {
      if (!usedListingIds.has(li.id)) {
        extraItems.push({ id: `extra_${li.id}`, synthetic: true, kind: 'listing_intake', title: `${li.place} 매물 의뢰`, targetDate: '', done: false, intake: li });
      }
    });
    project.buyerIntakes.forEach((bi) => {
      if (!usedBuyerIds.has(bi.id)) {
        const firstSite = bi.requirements?.[0]?.preferredSites?.[0] || bi.requirements?.[0]?.transactionType || '구매';
        extraItems.push({ id: `extra_${bi.id}`, synthetic: true, kind: 'buyer_intake', title: `${firstSite} 구매 의뢰`, targetDate: bi.receivedAt || '', done: false, intake: bi });
      }
    });
    if (extraItems.length > 0) {
      groups.push({ order: (groups[groups.length - 1]?.order || 0) + 1, items: extraItems });
    }

    const doneStages = groups.filter((g) => g.items.every((st) => st.done)).length;
    const firstActiveIdx = groups.findIndex((g) => g.items.some((st) => !st.done));
    const reqCount = project.buyerIntakes.reduce((acc, bi) => acc + (bi.requirements?.length || 0), 0);

    return `
      <section class="v1-card vh-flow-card" aria-label="프로젝트 진행 흐름">
        <div class="v1-card-head">
          <div class="v1-card-title">
            ${D().icon('layers', 15)} 진행 흐름 · 의뢰
            <span class="vh-flow-summary num">
              ${groups.length ? `${doneStages}/${groups.length}단계 완료 · 매물 ${project.listingIntakes.length} · 구매 ${reqCount}` : '시작 전 가이드'}
            </span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <button type="button" class="pw-btn pw-btn-ghost pw-btn-sm" data-vh-add-listing>+ 매물 의뢰</button>
            <button type="button" class="pw-btn pw-btn-ghost pw-btn-sm" data-vh-add-req>+ 희망 조건</button>
            <button type="button" class="pw-btn ${addStepOpen ? 'pw-btn-blue' : 'pw-btn-line'} pw-btn-sm" id="vh-toggle-add-step">
              ${D().icon('plus', 12)} 단계 추가
            </button>
          </div>
        </div>

        ${addStepOpen ? `
          <div class="vh-flow-addbar">
            <input type="text" id="vh-add-step-title" class="pw-input" style="flex:2 1 200px;min-width:160px;height:30px"
              placeholder="새 단계 이름 (예: 이사 업체 견적 확인)" />
            <input type="text" id="vh-add-step-date" class="pw-input num" style="flex:0 1 130px;height:30px"
              placeholder="목표일 (예: 2027.01.15)" />
            <select id="vh-add-step-mode" class="pw-select" style="flex:0 1 150px;height:30px" aria-label="단계 배치 방식">
              <option value="next" ${!addStepParallel ? 'selected' : ''}>다음 단계로 추가</option>
              <option value="parallel" ${addStepParallel ? 'selected' : ''} ${groups.length === 0 ? 'disabled' : ''}>현재 단계와 동시 진행</option>
            </select>
            <button type="button" class="pw-btn pw-btn-blue pw-btn-sm" id="vh-add-step-submit">추가</button>
            <button type="button" class="pw-btn pw-btn-ghost pw-btn-sm" id="vh-add-step-cancel">취소</button>
          </div>
        ` : ''}

        ${groups.length === 0 ? `
          <div class="vh-vflow-list">
            ${renderVerticalRow({
              dotContent: '1',
              rowCls: 'is-current is-ghost',
              stageLabel: '1단계 · 의뢰 담기 (매물 · 구매)',
              parallelCount: 0,
              statusLabel: '지금 시작',
              showConnector: true,
              itemsHtml: `
                <div style="font-size:12.5px;color:#475569;line-height:1.45">
                  초기 상담 내용을 바탕으로 내놓을 매물이나 찾는 집 희망 조건을 이 흐름에 바로 담아 보세요.
                </div>
                <div class="vh-flow-ghost-actions">
                  <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="vh-empty-add-listing">+ 매물 의뢰 등록</button>
                  <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="vh-empty-add-req">+ 희망 조건 추가</button>
                  <button type="button" class="pw-btn pw-btn-ghost pw-btn-sm" id="vh-empty-add-step">+ 직접 단계 추가</button>
                </div>
              `,
            })}
            ${renderVerticalRow({
              dotContent: '2',
              rowCls: 'is-upcoming is-ghost',
              stageLabel: '2단계 · 후보 비교 · 현장 임장',
              parallelCount: 0,
              statusLabel: '예정',
              showConnector: true,
              itemsHtml: `
                <div style="font-size:12px;color:#64748b;line-height:1.45">
                  조건에 맞는 후보 매물을 연결하고 임장 일정을 조율해 카톡 브리핑을 보냅니다.
                </div>
              `,
            })}
            ${renderVerticalRow({
              dotContent: '3',
              rowCls: 'is-upcoming is-ghost',
              stageLabel: '3단계 · 계약 · 잔금',
              parallelCount: 0,
              statusLabel: '예정',
              showConnector: false,
              itemsHtml: `
                <div style="font-size:12px;color:#64748b;line-height:1.45">
                  가격·일정 조건을 합의해 거래 전환 후 계약금·중도금·잔금과 보수를 관리합니다.
                </div>
              `,
            })}
          </div>
        ` : `
          <div class="vh-vflow-list">
            ${groups.map((g, idx) => {
              const allDone = g.items.every((st) => st.done);
              const isCurrent = !allDone && idx === firstActiveIdx;
              const isNext = !allDone && firstActiveIdx >= 0 && idx === firstActiveIdx + 1;
              const rowCls = allDone ? 'is-done' : isCurrent ? 'is-current' : isNext ? 'is-upcoming is-next' : 'is-upcoming';
              const statusLabel = allDone ? '완료' : isCurrent ? '진행 중' : isNext ? '다음 차례' : '예정';
              const itemsHtml = g.items.map((st) => {
                const linkedIntake = st.synthetic ? st.intake : resolvedByStepId.get(st.id);
                if (st.kind === 'listing_intake') return renderListingStepItem(st, linkedIntake);
                if (st.kind === 'buyer_intake') return renderBuyerStepItem(project, st, linkedIntake, activeMatches);
                return renderManualStepItem(st);
              }).join('');
              return renderVerticalRow({
                dotContent: allDone ? D().icon('check', 13) : String(idx + 1),
                rowCls,
                stageLabel: `${idx + 1}단계`,
                parallelCount: g.items.length,
                statusLabel,
                itemsHtml,
                showConnector: idx < groups.length - 1,
              });
            }).join('')}
          </div>
        `}
      </section>
    `;
  }

  function renderOverviewTab(project, activeMatches, selectedBriefCount) {
    return `
      <div class="v1-card vh-brief-compact">
        <div class="v1-card-head" style="margin-bottom:6px">
          <div class="v1-card-title">${D().icon('sticky', 15)} 프로젝트 핵심 브리프</div>
          <span style="font-size:11.5px;color:#64748b">클릭해 바로 수정 · 자동 저장</span>
        </div>
        <textarea id="vh-memo-input" class="field-textarea" style="min-height:44px;border-color:#eef1f4;background:#fafbfc"
          placeholder="이 프로젝트가 어떤 일인지 한두 줄 적어 두세요...">${D().esc(project.memo)}</textarea>
      </div>

      ${renderFlowDiagramCard(project, activeMatches)}

      <!-- Active Matches Snapshot with Briefing Quick Copy -->
      <section class="v1-card">
        <div class="v1-card-head">
          <div class="v1-card-title">${D().icon('handshake', 15)} 매칭 후보 · 브리핑 (${activeMatches.length}건)</div>
          <div style="display:flex;gap:6px">
            ${activeMatches.length > 0 ? `
              <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="vh-copy-brief">${D().icon('copy', 12)} 카톡 복사 (${selectedBriefCount})</button>
            ` : ''}
            <button type="button" class="pw-btn pw-btn-line pw-btn-sm" data-vh-tab-jump="matches">전체 비교 →</button>
          </div>
        </div>
        ${activeMatches.length === 0 ? `
          <div style="padding:14px;text-align:center;color:#64748b;font-size:12.5px">아직 연결된 후보 매물이 없습니다.</div>
        ` : `
          <table class="pw-table">
            <thead>
              <tr>
                <th style="width:32px">공유</th>
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
                  <td><input type="checkbox" data-vh-brief-toggle="${m.id}" ${m.briefSelected ? 'checked' : ''} aria-label="브리핑에 포함" /></td>
                  <td><strong>${D().esc(m.place)}</strong></td>
                  <td class="num" style="color:#64748b">${D().esc(m.areaShort)}</td>
                  <td class="num"><strong>${D().esc(m.agreedPriceLabel || m.priceLabel)}</strong></td>
                  <td>
                    <select class="stage-select" data-vh-match-stage="${m.id}" aria-label="${D().esc(m.place)} 매칭 단계">
                      ${D().MATCH_STAGES.map((s) => `<option value="${s.key}" ${s.key === m.stage ? 'selected' : ''}>${s.label}</option>`).join('')}
                    </select>
                  </td>
                  <td style="color:#475569;max-width:210px" class="trunc">${D().esc(m.briefNote)}</td>
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
          <button type="button" class="pw-btn pw-btn-ghost pw-btn-sm" data-vh-tab-jump="files">자료실 모두 보기 →</button>
        </div>
        ${project.files.length === 0 ? `
          <div style="padding:14px;text-align:center;color:#64748b;font-size:12.5px">올린 자료가 없습니다.</div>
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
        <div style="display:flex;gap:6px">
          <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="vh-copy-brief-tab">${D().icon('copy', 12)} 카톡 복사</button>
          <button type="button" class="pw-btn pw-btn-blue pw-btn-sm" id="vh-open-brief-inner">
            ${D().icon('share', 13)} 브리핑 페이지 만들기 (${selectedBriefCount}건)
          </button>
        </div>
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
                  <td><input type="checkbox" data-vh-brief-toggle="${m.id}" ${m.briefSelected ? 'checked' : ''} aria-label="브리핑에 포함" /></td>
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
                    <select class="stage-select" data-vh-match-stage="${m.id}">
                      ${D().MATCH_STAGES.map((s) => `<option value="${s.key}" ${s.key === m.stage ? 'selected' : ''}>${s.label}</option>`).join('')}
                    </select>
                  </td>
                  <td style="min-width:200px">
                    <input class="field-input" style="padding:5px 8px;font-size:12px" data-vh-brief-note="${m.id}" value="${D().esc(m.briefNote)}" />
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
    const q = (ui.hybridFileSearch || '').trim().toLowerCase();
    const filtered = project.files.filter((f) => {
      if (ui.hybridFileCat !== 'all' && f.category !== ui.hybridFileCat) return false;
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
            <button type="button" class="pw-btn pw-btn-sm ${ui.hybridFileCat === c.key ? 'pw-btn-blue' : 'pw-btn-line'}" data-vh-fcat="${c.key}">
              ${c.label}
            </button>
          `).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <div class="v2-search-input" style="background:#f8fafc;border-color:#dbe1e8;width:210px">
            ${D().icon('search', 13)}
            <input id="vh-file-search" value="${D().esc(ui.hybridFileSearch)}" placeholder="파일명 · OCR 글자 검색..." />
          </div>
          <button type="button" class="pw-btn pw-btn-primary pw-btn-sm" id="vh-files-upload">+ 올리기</button>
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

  function wireImeSearch(inputEl, onApply) {
    if (!inputEl) return;
    let composing = false;
    inputEl.addEventListener('compositionstart', () => { composing = true; });
    inputEl.addEventListener('compositionend', (e) => {
      composing = false;
      onApply(e.target.value, e.target.selectionStart);
    });
    inputEl.addEventListener('input', (e) => {
      if (composing || e.isComposing) return;
      onApply(e.target.value, e.target.selectionStart);
    });
  }

  function bindHybridEvents(container, project) {
    container.querySelector('#vh-back-list')?.addEventListener('click', () => {
      M().showToast('실제 앱에서는 프로젝트 목록(/projects)으로 돌아갑니다.');
    });
    container.querySelectorAll('#vh-act-listing, [data-vh-add-listing]').forEach((btn) => {
      btn.addEventListener('click', () => M().openNewListingSheet(project.id));
    });
    container.querySelectorAll('#vh-act-req, [data-vh-add-req]').forEach((btn) => {
      btn.addEventListener('click', () => M().openNewRequirementSheet(project.id));
    });
    container.querySelector('#vh-act-file')?.addEventListener('click', () => M().openUploadFileModal(project.id));
    container.querySelector('#vh-files-upload')?.addEventListener('click', () => M().openUploadFileModal(project.id));
    container.querySelector('#vh-act-brief')?.addEventListener('click', () => M().openBriefingModal(project.id));
    container.querySelector('#vh-open-brief-inner')?.addEventListener('click', () => M().openBriefingModal(project.id));

    const copyBrief = () => {
      const txt = S().computeBriefingCopyText(project, { hideUnit: true, excludePrivateMemo: true });
      navigator.clipboard?.writeText(txt).catch(() => {});
      M().showToast('선택한 후보 매물의 카톡 브리핑 문구를 복사했습니다.');
    };
    container.querySelector('#vh-copy-brief')?.addEventListener('click', copyBrief);
    container.querySelector('#vh-copy-brief-tab')?.addEventListener('click', copyBrief);

    container.querySelectorAll('[data-vh-light]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-vh-light');
        S().updateProject(project.id, { statusLight: key });
        M().showToast(`손님 불빛을 "${D().STATUS_LIGHT_MAP[key]?.label}"(으)로 변경했습니다.`);
      });
    });

    container.querySelector('#vh-title-input')?.addEventListener('change', (e) => {
      const next = e.target.value.trim();
      if (next && next !== project.title) {
        S().updateProject(project.id, { title: next });
        M().showToast('프로젝트 이름을 저장했습니다.');
      }
    });
    container.querySelector('#vh-memo-input')?.addEventListener('change', (e) => {
      S().updateProject(project.id, { memo: e.target.value.trim() });
      M().showToast('메모를 저장했습니다.');
    });

    container.querySelectorAll('[data-vh-step]').forEach((btn) => {
      btn.addEventListener('click', () => S().toggleStepDone(project.id, btn.getAttribute('data-vh-step')));
    });
    container.querySelector('#vh-toggle-add-step')?.addEventListener('click', () => {
      addStepOpen = !addStepOpen;
      renderHybrid(container);
      if (addStepOpen) container.querySelector('#vh-add-step-title')?.focus();
    });
    container.querySelector('#vh-empty-add-step')?.addEventListener('click', () => {
      addStepOpen = true;
      renderHybrid(container);
      container.querySelector('#vh-add-step-title')?.focus();
    });
    container.querySelector('#vh-empty-add-listing')?.addEventListener('click', () => M().openNewListingSheet(project.id));
    container.querySelector('#vh-empty-add-req')?.addEventListener('click', () => M().openNewRequirementSheet(project.id));
    container.querySelector('#vh-add-step-cancel')?.addEventListener('click', () => {
      addStepOpen = false;
      addStepParallel = false;
      renderHybrid(container);
    });
    container.querySelector('#vh-add-step-mode')?.addEventListener('change', (e) => {
      addStepParallel = e.target.value === 'parallel';
    });
    const submitAddStep = () => {
      const titleInput = container.querySelector('#vh-add-step-title');
      const dateInput = container.querySelector('#vh-add-step-date');
      const title = (titleInput?.value || '').trim();
      if (!title) {
        titleInput?.focus();
        return;
      }
      const parallel = addStepParallel;
      const targetDate = (dateInput?.value || '').trim();
      addStepOpen = false;
      addStepParallel = false;
      if (S().addStep(project.id, { title, targetDate, parallelWithCurrent: parallel })) {
        M().showToast('진행 흐름에 새 단계를 추가했습니다.');
      }
    };
    container.querySelector('#vh-add-step-submit')?.addEventListener('click', submitAddStep);
    [container.querySelector('#vh-add-step-title'), container.querySelector('#vh-add-step-date')].forEach((el) => {
      el?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
          e.preventDefault();
          submitAddStep();
        }
      });
    });
    container.querySelectorAll('[data-vh-tab], [data-vh-tab-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        S().setUi({ hybridTab: btn.getAttribute('data-vh-tab') || btn.getAttribute('data-vh-tab-jump') });
      });
    });

    container.querySelectorAll('[data-vh-match-stage]').forEach((sel) => {
      sel.addEventListener('change', () => {
        S().updateMatchStage(project.id, sel.getAttribute('data-vh-match-stage'), sel.value);
        M().showToast(`매칭 단계를 "${D().MATCH_STAGE_MAP[sel.value]?.label}"(으)로 변경했습니다.`);
      });
    });
    container.querySelectorAll('[data-vh-brief-toggle]').forEach((cb) => {
      cb.addEventListener('change', () => S().toggleBriefSelect(project.id, cb.getAttribute('data-vh-brief-toggle')));
    });
    container.querySelectorAll('[data-vh-brief-note]').forEach((inp) => {
      inp.addEventListener('change', () => {
        S().updateBriefNote(project.id, inp.getAttribute('data-vh-brief-note'), inp.value);
        M().showToast('브리핑 설명을 저장했습니다.');
      });
    });

    container.querySelectorAll('[data-vh-fcat]').forEach((btn) => {
      btn.addEventListener('click', () => S().setUi({ hybridFileCat: btn.getAttribute('data-vh-fcat') }));
    });
    wireImeSearch(container.querySelector('#vh-file-search'), (val, pos) => {
      S().setUi({ hybridFileSearch: val });
      const reInput = document.querySelector('#vh-file-search');
      if (reInput) { reInput.focus(); if (pos != null) reInput.setSelectionRange(pos, pos); }
    });
    container.querySelectorAll('[data-open-file]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const f = project.files.find((x) => x.id === btn.getAttribute('data-open-file'));
        M().openFilePreviewModal(f);
      });
    });

    // Right Top Dock: Tasks
    container.querySelectorAll('[data-vh-due]').forEach((btn) => {
      btn.addEventListener('click', () => {
        duePreset = btn.getAttribute('data-vh-due');
        renderHybrid(container);
      });
    });
    const taskInput = container.querySelector('#vh-task-input');
    taskInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        if (S().addTask(project.id, { title: taskInput.value, dueLabel: duePreset })) {
          M().showToast('할 일을 추가했습니다.');
        }
      }
    });
    container.querySelectorAll('[data-vh-task-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => S().toggleTask(project.id, btn.getAttribute('data-vh-task-toggle')));
    });
    container.querySelector('#vh-toggle-done')?.addEventListener('click', () => {
      S().setUi({ hybridShowDoneTasks: !S().getState().ui.hybridShowDoneTasks });
    });

    // Right Bottom Dock: Unified Consultations (with Call Recording + Transcript + AI) & Comments
    container.querySelectorAll('[data-vh-ff]').forEach((btn) => {
      btn.addEventListener('click', () => S().setUi({ hybridFeedFilter: btn.getAttribute('data-vh-ff') }));
    });

    container.querySelectorAll('[data-vh-play]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rid = btn.getAttribute('data-vh-play');
        if (playingRecordingIds.has(rid)) playingRecordingIds.delete(rid);
        else playingRecordingIds.add(rid);
        renderHybrid(container);
      });
    });
    container.querySelectorAll('[data-vh-transcript]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rid = btn.getAttribute('data-vh-transcript');
        if (expandedTranscriptIds.has(rid)) expandedTranscriptIds.delete(rid);
        else expandedTranscriptIds.add(rid);
        renderHybrid(container);
      });
    });

    container.querySelectorAll('[data-vh-asug]').forEach((btn) => {
      btn.addEventListener('click', () => {
        S().acceptSuggestion(project.id, btn.getAttribute('data-vh-asug'));
        M().showToast('통화 AI 제안을 위 할 일/조건에 바로 반영했습니다.');
      });
    });
    container.querySelectorAll('[data-vh-dsug]').forEach((btn) => {
      btn.addEventListener('click', () => S().dismissSuggestion(project.id, btn.getAttribute('data-vh-dsug')));
    });

    container.querySelectorAll('[data-vh-cmode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        composerMode = btn.getAttribute('data-vh-cmode');
        renderHybrid(container);
      });
    });
    container.querySelector('#vh-consult-type')?.addEventListener('change', (e) => {
      consultType = e.target.value;
    });
    const compInput = container.querySelector('#vh-composer-input');
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
    container.querySelector('#vh-composer-submit')?.addEventListener('click', submitComposer);
    compInput?.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
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
  window.PWViews.hybrid = renderHybrid;
})();
