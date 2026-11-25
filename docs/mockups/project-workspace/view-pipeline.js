/* ==========================================================================
   ANGLE 3 · 상담→매칭→계약 여정 보드 (Stage-Centric Deal Room)
   56px 다크 아이콘 레일 + 5단계 여정 스테퍼 + 갈아타기 일정 대조 바 + 매칭 칸반 + 컨텍스트 인스펙터
   ========================================================================== */
(() => {
  'use strict';

  function D() { return window.PWData; }
  function S() { return window.PWStore; }
  function M() { return window.PWModals; }

  let inspCompKind = 'consult';
  let inspCompDraft = '';

  function computeJourneyStageIndex(project) {
    const hasDeal = project.listingIntakes.some((l) => l.deal);
    const deal = project.listingIntakes.find((l) => l.deal)?.deal;
    if (deal && (deal.stage === 'settling' || deal.stage === 'completed' || deal.stage === 'closed')) return 4;
    if (hasDeal || project.matches.some((m) => m.stage === 'negotiating' || m.stage === 'dealCreated')) return 3;
    if (project.matches.length > 0) return 2;
    if (project.listingIntakes.length > 0 || project.buyerIntakes.length > 0) return 1;
    return 0;
  }

  function renderPipeline(container) {
    const state = S().getState();
    const project = S().getCurrentProject();
    const ui = state.ui;
    const journeyIdx = computeJourneyStageIndex(project);
    const openTasks = project.tasks.filter((t) => !t.done);
    const activeMatches = project.matches.filter((m) => m.stage !== 'closed');
    const selectedMatch =
      project.matches.find((m) => m.id === ui.pipelineSelectedMatchId) || project.matches[0] || null;

    const deal = project.listingIntakes.find((l) => l.deal)?.deal || null;
    const buyReq = project.buyerIntakes[0]?.requirements[0] || null;
    const urgentTask = openTasks[0] || null;

    const journeySteps = [
      { label: '1. 접수·상담', sub: `상담 ${project.consultations.length}건` },
      { label: '2. 의뢰·조건', sub: `매물 ${project.listingIntakes.length} · 구매 ${project.buyerIntakes.length}` },
      { label: '3. 매칭·임장', sub: `후보 ${activeMatches.length}건` },
      { label: '4. 협상·계약', sub: deal ? deal.stageLabel : `${project.matches.filter((m) => m.stage === 'negotiating').length}건 협상` },
      { label: '5. 잔금·정산', sub: deal ? deal.balanceDate : '대기' },
    ];

    container.innerHTML = `
      <div class="v3-shell">
        <!-- Left Slim Dark Rail -->
        <aside class="v3-icon-rail" aria-label="빠른 전환 레일">
          ${state.projects.map((p, idx) => `
            <button type="button" class="v3-rail-btn ${p.id === project.id ? 'active' : ''}"
              data-v3-select="${p.id}"
              title="${D().esc(p.primaryContact?.name)} · ${D().esc(p.title)}">
              <span style="font-size:12px;font-weight:700">${D().esc((p.primaryContact?.name || 'P')[0])}</span>
            </button>
          `).join('')}
          <button type="button" class="v3-rail-btn" id="v3-new-proj" title="새 프로젝트 열기" style="border:1px dashed rgba(255,255,255,0.22)">
            ${D().icon('plus', 16)}
          </button>
          <div style="flex:1"></div>
          <button type="button" class="v3-rail-btn" id="v3-quick-list" title="매물 의뢰 추가">${D().icon('building', 16)}</button>
          <button type="button" class="v3-rail-btn" id="v3-quick-req" title="희망 조건 추가">${D().icon('target', 16)}</button>
          <button type="button" class="v3-rail-btn" id="v3-quick-file" title="자료 올리기">${D().icon('upload', 16)}</button>
          <button type="button" class="v3-rail-btn" id="v3-quick-brief" title="브리핑 만들기">${D().icon('share', 16)}</button>
        </aside>

        <div class="v3-main">
          <!-- Top Executive Header & Journey Stepper -->
          <header class="v3-top">
            <div class="v3-top-row">
              <div style="display:flex;align-items:center;gap:10px;min-width:0;flex-wrap:wrap">
                <select class="stage-select" id="v3-proj-select" style="height:30px;font-weight:700;font-size:13.5px" aria-label="프로젝트 선택">
                  ${state.projects.map((p) => `
                    <option value="${p.id}" ${p.id === project.id ? 'selected' : ''}>${D().esc(p.primaryContact?.name)} · ${D().esc(p.title)}</option>
                  `).join('')}
                </select>
                <span style="font-size:12px;color:#64748b">담당 <strong>${D().esc(project.assignedTo)}</strong> · ${D().esc(project.primaryContact?.phone || '')}</span>
                ${urgentTask ? `
                  <span class="pw-badge" data-tone="amber">다음 액션 · ${D().esc(urgentTask.dueLabel)}: ${D().esc(urgentTask.title)}</span>
                ` : ''}
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v3-act-consult">${D().icon('message', 13)} 상담 적기</button>
                <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v3-act-listing">+ 매물 의뢰</button>
                <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v3-act-req">+ 희망 조건</button>
                <button type="button" class="pw-btn pw-btn-blue pw-btn-sm" id="v3-act-brief" style="background:#4f46e5">${D().icon('share', 13)} 브리핑 공유</button>
              </div>
            </div>

            <div class="v3-stepper" aria-label="거래 여정 단계">
              ${journeySteps.map((st, idx) => {
                const cls = idx < journeyIdx ? 'done' : idx === journeyIdx ? 'current' : '';
                return `
                  <div class="v3-step-box ${cls}">
                    <span style="width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;flex:none;
                      ${idx < journeyIdx ? 'background:#10b981;color:#fff' : idx === journeyIdx ? 'background:#4f46e5;color:#fff' : 'background:#e2e8f0;color:#475569'}">
                      ${idx < journeyIdx ? D().icon('check', 11) : idx + 1}
                    </span>
                    <div style="min-width:0">
                      <div style="font-weight:700;font-size:12px" class="trunc">${st.label}</div>
                      <div style="font-size:11px;opacity:0.8" class="trunc num">${D().esc(st.sub)}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            ${deal && buyReq ? `
              <div class="v3-timeline-bar">
                <div style="display:flex;align-items:center;gap:8px">
                  <span class="pw-badge" data-tone="violet">갈아타기 일정 대조</span>
                  <span>매도 잔금일 <strong class="num">${D().esc(deal.balanceDate)}</strong></span>
                  <span style="color:#6366f1">→</span>
                  <span>매수 입주 희망 <strong class="num">${D().esc(buyReq.moveInDate)}</strong></span>
                </div>
                <span style="color:#4338ca;font-size:11.5px">사람/계약에 적은 날짜 기준 표시 (자동 자금 계산 아님)</span>
              </div>
            ` : ''}
          </header>

          <!-- Asymmetric Split Workbench -->
          <div class="v3-split">
            <section class="v3-board-pane" data-scroll-id="v3-board">
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
                <div style="display:inline-flex;gap:3px;padding:3px;border-radius:8px;background:#e2e8f0">
                  <button type="button" class="pw-btn pw-btn-sm ${ui.pipelineBoardMode === 'kanban' ? 'pw-btn-primary' : 'pw-btn-ghost'}" data-v3-mode="kanban">
                    ${D().icon('kanban', 13)} 매칭 칸반 (${activeMatches.length})
                  </button>
                  <button type="button" class="pw-btn pw-btn-sm ${ui.pipelineBoardMode === 'compare' ? 'pw-btn-primary' : 'pw-btn-ghost'}" data-v3-mode="compare">
                    후보 비교표
                  </button>
                  <button type="button" class="pw-btn pw-btn-sm ${ui.pipelineBoardMode === 'listing' ? 'pw-btn-primary' : 'pw-btn-ghost'}" data-v3-mode="listing">
                    매도·계약 현황
                  </button>
                </div>
                ${buyReq ? `
                  <div style="font-size:12px;color:#475569">
                    희망: <strong>${D().esc(buyReq.transactionType)} ${D().esc(buyReq.budgetLabel)}</strong> · ${D().esc(buyReq.areaLabel)} (${D().esc(buyReq.preferredSites.join(', '))})
                  </div>
                ` : ''}
              </div>

              ${ui.pipelineBoardMode === 'kanban' ? renderKanban(project, activeMatches, selectedMatch) : ''}
              ${ui.pipelineBoardMode === 'compare' ? renderCompare(project, activeMatches) : ''}
              ${ui.pipelineBoardMode === 'listing' ? renderListingDeals(project) : ''}
            </section>

            <!-- Right Contextual Inspector -->
            <aside class="v3-inspector" aria-label="상세 인스펙터">
              <div style="padding:10px 12px;border-bottom:1px solid #e2e8f0">
                <div class="v1-seg-bar">
                  <button type="button" class="v1-seg-btn ${ui.pipelineInspectorTab === 'timeline' ? 'active' : ''}" data-v3-insp="timeline">상담·코멘트</button>
                  <button type="button" class="v1-seg-btn ${ui.pipelineInspectorTab === 'tasks' ? 'active' : ''}" data-v3-insp="tasks">업무 ${openTasks.length}</button>
                  <button type="button" class="v1-seg-btn ${ui.pipelineInspectorTab === 'files' ? 'active' : ''}" data-v3-insp="files">자료 ${project.files.length}</button>
                  <button type="button" class="v1-seg-btn ${ui.pipelineInspectorTab === 'detail' ? 'active' : ''}" data-v3-insp="detail">선택 매물</button>
                </div>
              </div>

              <div class="v1-dock-scroll" data-scroll-id="v3-insp-scroll">
                ${renderInspectorBody(project, ui.pipelineInspectorTab, selectedMatch, openTasks)}
              </div>

              <div class="v1-composer">
                <div style="display:flex;gap:4px">
                  <button type="button" class="pw-btn pw-btn-sm ${inspCompKind === 'consult' ? 'pw-btn-blue' : 'pw-btn-line'}" data-v3-ckind="consult">고객 상담</button>
                  <button type="button" class="pw-btn pw-btn-sm ${inspCompKind === 'comment' ? 'pw-btn-blue' : 'pw-btn-line'}" data-v3-ckind="comment">팀 코멘트</button>
                </div>
                <textarea id="v3-comp-input" class="field-textarea" style="min-height:54px;font-size:12.5px"
                  placeholder="${inspCompKind === 'consult' ? '상담 내용을 바로 기록하세요...' : '진행 메모나 확인 요청을 적으세요...'}">${D().esc(inspCompDraft)}</textarea>
                <button type="button" class="pw-btn pw-btn-primary pw-btn-sm" id="v3-comp-save" style="align-self:flex-end">기록 저장</button>
              </div>
            </aside>
          </div>
        </div>
      </div>
    `;

    bindPipelineEvents(container, project);
  }

  function renderKanban(project, activeMatches, selectedMatch) {
    if (activeMatches.length === 0) {
      return `
        <div class="v1-card" style="padding:36px;text-align:center;color:#64748b">
          아직 매칭 파이프라인에 오른 매물이 없습니다.<br/>상단 "+ 희망 조건" 또는 "+ 매물 의뢰"로 의뢰를 추가해 시작하세요.
        </div>
      `;
    }
    const buckets = [
      { title: '내부 후보·관심', stages: ['suggested', 'buyerInterested'], targetStage: 'buyerInterested' },
      { title: '임장 조율·진행', stages: ['viewingConfirmed', 'viewing'], targetStage: 'viewing' },
      { title: '고객 검토', stages: ['buyerReviewing'], targetStage: 'buyerReviewing' },
      { title: '협상 중', stages: ['negotiating'], targetStage: 'negotiating' },
      { title: '거래 전환', stages: ['dealCreated'], targetStage: 'dealCreated' },
    ];

    return `
      <div class="v3-kanban">
        ${buckets.map((col, bIdx) => {
          const cards = activeMatches.filter((m) => col.stages.includes(m.stage));
          return `
            <div class="v3-col">
              <div class="v3-col-head">
                <span>${col.title}</span>
                <span class="pw-badge" data-tone="gray">${cards.length}</span>
              </div>
              ${cards.length === 0 ? `
                <div style="padding:18px 8px;text-align:center;font-size:11.5px;color:#94a3b8;border:1px dashed #cbd5e1;border-radius:8px">비어 있음</div>
              ` : cards.map((m) => `
                <div class="v3-kcard ${selectedMatch?.id === m.id ? 'selected' : ''}" data-v3-card="${m.id}">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span class="pw-badge" data-tone="${D().MATCH_STAGE_MAP[m.stage]?.tone || 'gray'}" style="font-size:10.5px;height:19px">
                      ${D().esc(D().MATCH_STAGE_MAP[m.stage]?.label)}
                    </span>
                    <span class="num" style="font-size:11px;color:#64748b">${D().esc(m.areaShort)}</span>
                  </div>
                  <div style="font-weight:700;font-size:13px;color:#0f172a">${D().esc(m.place)}</div>
                  <div class="num" style="font-weight:700;font-size:13px;color:#4f46e5">
                    ${D().esc(m.agreedPriceLabel || m.priceLabel)}
                    ${m.agreedPriceLabel ? '<span style="font-size:10.5px;font-weight:500;color:#059669"> (협의)</span>' : ''}
                  </div>
                  <div style="font-size:11.5px;color:#475569;line-height:1.4">${D().esc(m.briefNote)}</div>
                  <div style="display:flex;align-items:center;justify-content:space-between;padding-top:4px;border-top:1px solid #f1f5f9">
                    <button type="button" class="pw-btn pw-btn-ghost pw-btn-sm" style="height:22px;padding:0 5px;font-size:11px"
                      ${bIdx === 0 ? 'disabled' : ''}
                      data-v3-move="${m.id}:${buckets[Math.max(0, bIdx - 1)].targetStage}" title="이전 단계">←</button>
                    <span style="font-size:10.5px;color:#94a3b8">${D().esc(m.updatedAt)}</span>
                    <button type="button" class="pw-btn pw-btn-ghost pw-btn-sm" style="height:22px;padding:0 5px;font-size:11px"
                      ${bIdx === buckets.length - 1 ? 'disabled' : ''}
                      data-v3-move="${m.id}:${buckets[Math.min(buckets.length - 1, bIdx + 1)].targetStage}" title="다음 단계">→</button>
                  </div>
                </div>
              `).join('')}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderCompare(project, activeMatches) {
    if (activeMatches.length === 0) {
      return '<div class="v1-card" style="padding:30px;text-align:center;color:#64748b">비교할 매칭 후보가 없습니다.</div>';
    }
    return `
      <div class="v1-card">
        <table class="pw-table">
          <thead>
            <tr>
              <th>브리핑</th>
              <th>단지 · 동 · 호</th>
              <th>면적</th>
              <th>호가 / 합의가</th>
              <th>입주 가능</th>
              <th>단계</th>
            </tr>
          </thead>
          <tbody>
            ${activeMatches.map((m) => `
              <tr>
                <td><input type="checkbox" data-v3-brief="${m.id}" ${m.briefSelected ? 'checked' : ''} /></td>
                <td><strong>${D().esc(m.place)}</strong><div style="font-size:11px;color:#64748b">${D().esc(m.briefNote)}</div></td>
                <td class="num">${D().esc(m.areaDetail)}</td>
                <td class="num"><strong>${D().esc(m.agreedPriceLabel || m.priceLabel)}</strong></td>
                <td>${D().esc(m.moveInLabel)}</td>
                <td>
                  <select class="stage-select" data-v3-mstage="${m.id}">
                    ${D().MATCH_STAGES.map((s) => `<option value="${s.key}" ${s.key === m.stage ? 'selected' : ''}>${s.label}</option>`).join('')}
                  </select>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderListingDeals(project) {
    if (project.listingIntakes.length === 0) {
      return `
        <div class="v1-card" style="padding:30px;text-align:center;color:#64748b">
          이 프로젝트에 담긴 매물 의뢰가 없습니다.
        </div>
      `;
    }
    return project.listingIntakes.map((li) => `
      <div class="v1-card" style="display:grid;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong style="font-size:15px">${D().esc(li.place)}</strong>
          <span class="pw-badge" data-tone="green">${D().esc(li.lastCheckResult)} · ${D().esc(li.lastVerifiedLabel)}</span>
        </div>
        <div style="font-size:12.5px;color:#475569">${D().esc(li.areaDetail)} · ${D().esc(li.occupancyStatus)}</div>
        ${li.deal ? `
          <div style="padding:10px 12px;border-radius:9px;background:#eef2ff;border:1px solid #c7d2fe">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <strong>거래 진행: ${D().esc(li.deal.stageLabel)} (${D().esc(li.deal.agreedPriceLabel)})</strong>
              <span class="num">잔금 ${D().esc(li.deal.balanceDate)}</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${li.deal.payments.map((p) => `
                <span class="pw-badge" data-tone="${p.status === 'paid' ? 'green' : 'gray'}">${D().esc(p.kind)} ${D().esc(p.amountLabel)} (${D().esc(p.statusLabel)})</span>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  function renderInspectorBody(project, tab, selectedMatch, openTasks) {
    if (tab === 'detail') {
      if (!selectedMatch) {
        return '<div style="padding:20px;text-align:center;color:#94a3b8;font-size:12px">칸반에서 매물 카드를 클릭하면 여기에서 상세 확인과 메모 수정을 할 수 있습니다.</div>';
      }
      return `
        <div style="display:grid;gap:10px">
          <div>
            <span class="pw-badge" data-tone="${D().MATCH_STAGE_MAP[selectedMatch.stage]?.tone || 'gray'}">${D().esc(D().MATCH_STAGE_MAP[selectedMatch.stage]?.label)}</span>
            <h3 style="font-size:15px;font-weight:700;margin-top:6px">${D().esc(selectedMatch.place)}</h3>
            <div style="font-size:12px;color:#64748b">${D().esc(selectedMatch.areaDetail)} · 입주 ${D().esc(selectedMatch.moveInLabel)}</div>
          </div>
          <div style="padding:10px;border-radius:9px;background:#f8fafc;border:1px solid #e2e8f0;display:grid;gap:5px">
            <div class="v1-kv-line"><span class="v1-kv-k">호가</span><span class="v1-kv-v num">${D().esc(selectedMatch.priceLabel)}</span></div>
            <div class="v1-kv-line"><span class="v1-kv-k">협의 조건</span><span class="v1-kv-v num" style="color:#4f46e5">${D().esc(selectedMatch.agreedPriceLabel || '협의 전')}</span></div>
          </div>
          <div>
            <label class="field-label">매칭 단계 변경</label>
            <select class="field-select" data-v3-mstage="${selectedMatch.id}">
              ${D().MATCH_STAGES.map((s) => `<option value="${s.key}" ${s.key === selectedMatch.stage ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="field-label">손님 브리핑 한 줄 설명</label>
            <textarea class="field-textarea" style="min-height:64px" id="v3-sel-briefnote" data-match-id="${selectedMatch.id}">${D().esc(selectedMatch.briefNote)}</textarea>
          </div>
          ${selectedMatch.privateMemo ? `
            <div style="padding:8px 10px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a;font-size:12px;color:#92400e">
              <strong>내부 전용 메모 (공유 제외):</strong><br/>${D().esc(selectedMatch.privateMemo)}
            </div>
          ` : ''}
        </div>
      `;
    }
    if (tab === 'tasks') {
      return `
        <div class="task-input-row" style="margin-bottom:8px">
          ${D().icon('plus', 14)}
          <input id="v3-task-input" placeholder="업무 추가 후 Enter..." />
        </div>
        ${project.tasks.map((t) => `
          <div class="task-row ${t.done ? 'done' : ''}">
            <button type="button" class="task-check" data-v3-task="${t.id}">${t.done ? D().icon('check', 11) : ''}</button>
            <div style="min-width:0;flex:1">
              <div class="task-title" style="font-size:12.5px;font-weight:500">${D().esc(t.title)}</div>
              <div style="font-size:11px;color:#64748b">${D().esc(t.dueLabel)} · ${D().esc(t.assignee)}</div>
            </div>
          </div>
        `).join('')}
      `;
    }
    if (tab === 'files') {
      return `
        <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v3-insp-upload" style="margin-bottom:8px;width:100%">
          ${D().icon('upload', 13)} 새 자료 올리기
        </button>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
          ${project.files.map((f) => `
            <button type="button" class="file-card" data-open-file="${f.id}">
              <div class="file-thumb" style="height:74px">${D().svgPreview(f.previewKind, f.category)}</div>
              <div class="file-info">
                <div class="file-name trunc">${D().esc(f.name)}</div>
                <div class="file-caption">${D().esc(f.category)}</div>
              </div>
            </button>
          `).join('')}
        </div>
      `;
    }
    // timeline
    return `
      ${project.consultations.map((c) => `
        <article class="stream-card consult">
          <div class="stream-meta"><strong>상담 · ${D().esc(c.contactName)}</strong><span class="num">${D().esc(c.createdAt)}</span></div>
          <div class="stream-body">${D().esc(c.content)}</div>
        </article>
      `).join('')}
      ${project.comments.map((cm) => `
        <article class="stream-card comment">
          <div class="stream-meta"><strong>코멘트 · ${D().esc(cm.author)}</strong><span class="num">${D().esc(cm.createdAt)}</span></div>
          <div class="stream-body">${D().esc(cm.body)}</div>
        </article>
      `).join('')}
    `;
  }

  function bindPipelineEvents(container, project) {
    container.querySelectorAll('[data-v3-select]').forEach((btn) => {
      btn.addEventListener('click', () => S().selectProject(btn.getAttribute('data-v3-select')));
    });
    container.querySelector('#v3-proj-select')?.addEventListener('change', (e) => S().selectProject(e.target.value));
    container.querySelector('#v3-new-proj')?.addEventListener('click', () => M().openNewProjectModal());
    container.querySelector('#v3-quick-list')?.addEventListener('click', () => M().openNewListingSheet(project.id));
    container.querySelector('#v3-act-listing')?.addEventListener('click', () => M().openNewListingSheet(project.id));
    container.querySelector('#v3-quick-req')?.addEventListener('click', () => M().openNewRequirementSheet(project.id));
    container.querySelector('#v3-act-req')?.addEventListener('click', () => M().openNewRequirementSheet(project.id));
    container.querySelector('#v3-quick-file')?.addEventListener('click', () => M().openUploadFileModal(project.id));
    container.querySelector('#v3-insp-upload')?.addEventListener('click', () => M().openUploadFileModal(project.id));
    container.querySelector('#v3-quick-brief')?.addEventListener('click', () => M().openBriefingModal(project.id));
    container.querySelector('#v3-act-brief')?.addEventListener('click', () => M().openBriefingModal(project.id));
    container.querySelector('#v3-act-consult')?.addEventListener('click', () => M().openQuickConsultModal(project.id, 'consult'));

    container.querySelectorAll('[data-v3-mode]').forEach((btn) => {
      btn.addEventListener('click', () => S().setUi({ pipelineBoardMode: btn.getAttribute('data-v3-mode') }));
    });
    container.querySelectorAll('[data-v3-insp]').forEach((btn) => {
      btn.addEventListener('click', () => S().setUi({ pipelineInspectorTab: btn.getAttribute('data-v3-insp') }));
    });

    container.querySelectorAll('[data-v3-card]').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        S().setUi({
          pipelineSelectedMatchId: card.getAttribute('data-v3-card'),
          pipelineInspectorTab: 'detail',
        });
      });
    });

    container.querySelectorAll('[data-v3-move]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const [mid, stage] = btn.getAttribute('data-v3-move').split(':');
        S().updateMatchStage(project.id, mid, stage);
        M().showToast(`"${D().MATCH_STAGE_MAP[stage]?.label}" 단계로 이동했습니다.`);
      });
    });

    container.querySelectorAll('[data-v3-mstage]').forEach((sel) => {
      sel.addEventListener('change', () => {
        S().updateMatchStage(project.id, sel.getAttribute('data-v3-mstage'), sel.value);
        M().showToast('매칭 단계를 변경했습니다.');
      });
    });
    container.querySelectorAll('[data-v3-brief]').forEach((cb) => {
      cb.addEventListener('change', () => S().toggleBriefSelect(project.id, cb.getAttribute('data-v3-brief')));
    });

    container.querySelector('#v3-sel-briefnote')?.addEventListener('change', (e) => {
      S().updateBriefNote(project.id, e.target.getAttribute('data-match-id'), e.target.value);
      M().showToast('브리핑 설명을 저장했습니다.');
    });

    container.querySelectorAll('[data-v3-task]').forEach((btn) => {
      btn.addEventListener('click', () => S().toggleTask(project.id, btn.getAttribute('data-v3-task')));
    });
    const tInput = container.querySelector('#v3-task-input');
    tInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        if (S().addTask(project.id, { title: tInput.value })) {
          M().showToast('업무를 추가했습니다.');
        }
      }
    });

    container.querySelectorAll('[data-open-file]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const f = project.files.find((x) => x.id === btn.getAttribute('data-open-file'));
        M().openFilePreviewModal(f);
      });
    });

    container.querySelectorAll('[data-v3-ckind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        inspCompKind = btn.getAttribute('data-v3-ckind');
        renderPipeline(container);
      });
    });
    const compInput = container.querySelector('#v3-comp-input');
    compInput?.addEventListener('input', (e) => { inspCompDraft = e.target.value; });
    container.querySelector('#v3-comp-save')?.addEventListener('click', () => {
      const txt = compInput?.value || '';
      if (!txt.trim()) return;
      if (inspCompKind === 'consult') {
        S().addConsultation(project.id, { type: 'phone', content: txt });
        M().showToast('고객 상담을 저장했습니다.');
      } else {
        S().addComment(project.id, { body: txt, color: 'yellow' });
        M().showToast('팀 코멘트를 저장했습니다.');
      }
      inspCompDraft = '';
    });
  }

  window.PWViews = window.PWViews || {};
  window.PWViews.pipeline = renderPipeline;
})();
