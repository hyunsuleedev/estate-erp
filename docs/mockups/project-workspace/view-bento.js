/* ==========================================================================
   ANGLE 4 · 모듈형 브로커 벤토 (Apple / Craft Spatial Bento Grid)
   플로팅 커맨드 바 + 12열 벤토 그리드(고객요약 · 매도↔매수 브리지 · 상담/코멘트 · 업무 · 자료모자이크 · 거래트래커)
   ========================================================================== */
(() => {
  'use strict';

  function D() { return window.PWData; }
  function S() { return window.PWStore; }
  function M() { return window.PWModals; }

  let bentoFeedFilter = 'all'; // all | consult | comment
  let bentoCompKind = 'consult';
  let bentoCompDraft = '';

  function renderBento(container) {
    const state = S().getState();
    const project = S().getCurrentProject();
    const progress = S().computeProjectProgress(project);
    const openTasks = project.tasks.filter((t) => !t.done);
    const activeMatches = project.matches.filter((m) => m.stage !== 'closed');
    const pendingSuggestions = project.callRecordings.flatMap((r) =>
      r.suggestions.filter((s) => s.status === 'pending')
    );
    const deal = project.listingIntakes.find((l) => l.deal)?.deal || null;
    const dealPlace = project.listingIntakes.find((l) => l.deal)?.place || null;

    const feedItems = [];
    if (bentoFeedFilter === 'all' || bentoFeedFilter === 'consult') {
      project.consultations.forEach((c) => feedItems.push({ kind: 'consult', data: c }));
    }
    if (bentoFeedFilter === 'all' || bentoFeedFilter === 'comment') {
      project.comments.forEach((cm) => feedItems.push({ kind: 'comment', data: cm }));
    }

    container.innerHTML = `
      <div class="v4-shell">
        <!-- Floating Command Header -->
        <header class="v4-cmd-bar">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;flex-wrap:wrap">
            <select class="stage-select" id="v4-proj-select" style="height:32px;font-weight:700;font-size:13.5px;border-radius:9px" aria-label="프로젝트 선택">
              ${state.projects.map((p) => `
                <option value="${p.id}" ${p.id === project.id ? 'selected' : ''}>${D().esc(p.primaryContact?.name)} · ${D().esc(p.title)}</option>
              `).join('')}
            </select>
            <span class="pw-badge" data-tone="${progress.key === 'active' ? 'green' : 'gray'}">
              <span class="pw-dot"></span>${D().esc(progress.label)}
            </span>
            <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v4-call-btn">
              ${D().icon('phone', 13)} ${D().esc(project.primaryContact?.phone || '')}
            </button>
          </div>

          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v4-new-proj">+ 새 프로젝트</button>
            <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v4-add-listing">+ 매물 의뢰</button>
            <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v4-add-req">+ 희망 조건</button>
            <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v4-add-file">+ 자료</button>
            <button type="button" class="pw-btn pw-btn-blue pw-btn-sm" style="background:#0071e3" id="v4-brief-btn">
              ${D().icon('share', 13)} 손님 브리핑
            </button>
          </div>
        </header>

        <div class="v4-scroll" data-scroll-id="v4-scroll">
          <div class="v4-bento-grid">
            <!-- Tile 1 (4 cols): 고객 & 프로젝트 요약 -->
            <section class="v4-tile v4-span-4">
              <div class="v4-tile-head">
                <div class="v4-tile-title">${D().icon('users', 15)} 고객 · 프로젝트 요약</div>
                <span style="font-size:11.5px;color:#64748b">담당 ${D().esc(project.assignedTo)}</span>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:6px">
                ${project.people.map((per) => `
                  <div class="v4-inner-card" style="padding:7px 10px;flex:1;min-width:130px">
                    <div style="font-weight:700;font-size:12.5px">${D().esc(per.name)} <span style="font-weight:500;color:#64748b;font-size:11px">${D().esc(per.role)}</span></div>
                    <div class="num" style="font-size:11px;color:#475569">${D().esc(per.phone)}</div>
                  </div>
                `).join('')}
              </div>
              <textarea id="v4-memo-input" class="field-textarea" style="min-height:76px;font-size:12.5px;background:#f8fafc;border-color:#eef2f6"
                placeholder="프로젝트 요약 메모...">${D().esc(project.memo)}</textarea>
              <div>
                <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;color:#475569;margin-bottom:6px">
                  <span>진행 계획</span>
                  <span class="num">${progress.done}/${progress.total} 완료</span>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px">
                  ${project.steps.length === 0 ? '<div style="font-size:12px;color:#94a3b8">정한 단계 없음</div>' : project.steps.map((st) => `
                    <button type="button" data-v4-step="${st.id}" style="display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:7px;background:${st.done ? '#ecfdf5' : '#f8fafc'};font-size:12px">
                      <span style="width:14px;height:14px;border-radius:4px;border:1.5px solid ${st.done ? '#10b981' : '#cbd5e1'};background:${st.done ? '#10b981' : '#fff'};display:grid;place-items:center;color:#fff;flex:none">
                        ${st.done ? D().icon('check', 10) : ''}
                      </span>
                      <span class="trunc" style="flex:1;${st.done ? 'text-decoration:line-through;color:#64748b' : ''}">${D().esc(st.title)}</span>
                      <span class="num" style="font-size:11px;color:#64748b">${D().esc(st.targetDate)}</span>
                    </button>
                  `).join('')}
                </div>
              </div>
            </section>

            <!-- Tile 2 (8 cols): 매도 ↔ 매수 듀얼 트랙 브리지 -->
            <section class="v4-tile v4-span-8">
              <div class="v4-tile-head">
                <div class="v4-tile-title">${D().icon('layers', 15)} 매물 의뢰 ↔ 구매 의뢰 · 매칭 브리지</div>
                <div style="display:flex;gap:6px">
                  <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v4-bridge-listing">+ 매물 의뢰</button>
                  <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v4-bridge-req">+ 희망 조건</button>
                </div>
              </div>
              <div class="v1-dual-grid">
                <!-- Left: Listing Side -->
                <div class="v4-inner-card" style="display:flex;flex-direction:column;gap:8px">
                  <div style="display:flex;align-items:center;justify-content:space-between">
                    <span class="pw-badge" data-tone="amber">매물 의뢰 (내놓는 집)</span>
                    <span style="font-size:11.5px;color:#64748b">${project.listingIntakes.length}건</span>
                  </div>
                  ${project.listingIntakes.length === 0 ? `
                    <div style="padding:20px 10px;text-align:center;color:#94a3b8;font-size:12px">등록된 매물 의뢰가 없습니다.</div>
                  ` : project.listingIntakes.map((li) => `
                    <div style="padding:9px 10px;border-radius:8px;background:#ffffff;border:1px solid #e2e8f0;display:grid;gap:4px">
                      <div style="display:flex;justify-content:space-between;align-items:center">
                        <strong style="font-size:13.5px">${D().esc(li.place)}</strong>
                        <span class="pw-badge" data-tone="green">${D().esc(li.lastCheckResult)}</span>
                      </div>
                      <div style="font-size:12px;color:#475569">${D().esc(li.areaDetail)} · <strong>${D().esc(li.listings[0]?.transactionType)} ${D().esc(li.listings[0]?.priceLabel)}</strong></div>
                      ${li.listings[0]?.ad ? `
                        <div style="font-size:11.5px;color:#2563eb">${D().esc(li.listings[0].ad.channel)} · ${li.listings[0].ad.rank}위/${li.listings[0].ad.totalCount} (${D().esc(li.listings[0].ad.cheapestLabel)})</div>
                      ` : ''}
                    </div>
                  `).join('')}
                </div>

                <!-- Right: Buyer Side + Top Matches -->
                <div class="v4-inner-card" style="display:flex;flex-direction:column;gap:8px">
                  <div style="display:flex;align-items:center;justify-content:space-between">
                    <span class="pw-badge" data-tone="blue">구매 의뢰 &amp; 매칭 후보 (${activeMatches.length})</span>
                    ${activeMatches.length > 0 ? `<button type="button" style="font-size:11.5px;color:#0071e3;font-weight:600" id="v4-bridge-brief">브리핑 만들기 →</button>` : ''}
                  </div>
                  ${project.buyerIntakes.flatMap((bi) => bi.requirements).map((req) => `
                    <div style="padding:8px 10px;border-radius:8px;background:#ffffff;border:1px solid #dbeafe;font-size:12px">
                      <strong>${D().esc(req.transactionType)} ${D().esc(req.budgetLabel)}</strong> · ${D().esc(req.areaLabel)}
                      <div style="color:#475569;font-size:11.5px;margin-top:2px">${D().esc(req.preferredSites.join(' · '))} (입주 ${D().esc(req.moveInDate)})</div>
                    </div>
                  `).join('')}
                  ${activeMatches.slice(0, 3).map((m) => `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;border-radius:8px;background:#ffffff;border:1px solid #e2e8f0">
                      <div style="min-width:0;flex:1">
                        <div style="font-weight:600;font-size:12.5px" class="trunc">${D().esc(m.place)}</div>
                        <div class="num" style="font-size:11.5px;color:#0071e3;font-weight:600">${D().esc(m.agreedPriceLabel || m.priceLabel)} <span style="color:#64748b;font-weight:400">· ${D().esc(m.areaShort)}</span></div>
                      </div>
                      <select class="stage-select" data-v4-mstage="${m.id}">
                        ${D().MATCH_STAGES.map((s) => `<option value="${s.key}" ${s.key === m.stage ? 'selected' : ''}>${s.label}</option>`).join('')}
                      </select>
                    </div>
                  `).join('')}
                  ${project.buyerIntakes.length === 0 && activeMatches.length === 0 ? `
                    <div style="padding:20px 10px;text-align:center;color:#94a3b8;font-size:12px">등록된 희망 조건이 없습니다.</div>
                  ` : ''}
                </div>
              </div>
            </section>

            <!-- Tile 3 (5 cols): 실시간 상담 & 팀 코멘트 -->
            <section class="v4-tile v4-span-5">
              <div class="v4-tile-head">
                <div class="v4-tile-title">${D().icon('message', 15)} 상담 · 팀 코멘트</div>
                <div style="display:flex;gap:3px;background:#f1f5f9;padding:2px;border-radius:7px">
                  <button type="button" class="pw-btn pw-btn-sm ${bentoFeedFilter === 'all' ? 'pw-btn-primary' : 'pw-btn-ghost'}" style="height:22px;font-size:11px" data-v4-ff="all">전체</button>
                  <button type="button" class="pw-btn pw-btn-sm ${bentoFeedFilter === 'consult' ? 'pw-btn-primary' : 'pw-btn-ghost'}" style="height:22px;font-size:11px" data-v4-ff="consult">상담</button>
                  <button type="button" class="pw-btn pw-btn-sm ${bentoFeedFilter === 'comment' ? 'pw-btn-primary' : 'pw-btn-ghost'}" style="height:22px;font-size:11px" data-v4-ff="comment">코멘트</button>
                </div>
              </div>
              ${pendingSuggestions.length > 0 ? `
                <div style="padding:8px 10px;border-radius:9px;background:#eef2ff;border:1px solid #c7d2fe;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px">
                  <span class="trunc"><strong>AI 제안:</strong> ${D().esc(pendingSuggestions[0].title)}</span>
                  <button type="button" class="pw-btn pw-btn-blue pw-btn-sm" style="height:22px;font-size:11px" data-v4-asug="${pendingSuggestions[0].id}">반영</button>
                </div>
              ` : ''}
              <div style="display:flex;flex-direction:column;gap:8px;max-height:220px;overflow-y:auto" data-scroll-id="v4-feed">
                ${feedItems.map((item) => {
                  if (item.kind === 'consult') {
                    const c = item.data;
                    return `
                      <div class="stream-card consult" style="padding:8px 10px">
                        <div class="stream-meta"><strong>상담 · ${D().esc(c.contactName)}</strong><span class="num">${D().esc(c.createdAt)}</span></div>
                        <div class="stream-body" style="font-size:12px">${D().esc(c.content)}</div>
                      </div>
                    `;
                  }
                  const cm = item.data;
                  return `
                    <div class="stream-card comment" style="padding:8px 10px">
                      <div class="stream-meta"><strong>코멘트 · ${D().esc(cm.author)}</strong><span class="num">${D().esc(cm.createdAt)}</span></div>
                      <div class="stream-body" style="font-size:12px">${D().esc(cm.body)}</div>
                    </div>
                  `;
                }).join('')}
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;padding-top:8px;border-top:1px solid #f1f5f9">
                <div style="display:flex;gap:4px">
                  <button type="button" class="pw-btn pw-btn-sm ${bentoCompKind === 'consult' ? 'pw-btn-blue' : 'pw-btn-line'}" style="height:24px;font-size:11.5px" data-v4-ckind="consult">고객 상담</button>
                  <button type="button" class="pw-btn pw-btn-sm ${bentoCompKind === 'comment' ? 'pw-btn-blue' : 'pw-btn-line'}" style="height:24px;font-size:11.5px" data-v4-ckind="comment">팀 코멘트</button>
                </div>
                <div style="display:flex;gap:6px">
                  <input id="v4-comp-input" class="field-input" style="padding:6px 9px;font-size:12.5px"
                    value="${D().esc(bentoCompDraft)}"
                    placeholder="${bentoCompKind === 'consult' ? '상담 내용 빠르게 기록...' : '팀 코멘트 남기기...'}" />
                  <button type="button" class="pw-btn pw-btn-primary pw-btn-sm" id="v4-comp-save">등록</button>
                </div>
              </div>
            </section>

            <!-- Tile 4 (4 cols): 업무 & 다가오는 일정 -->
            <section class="v4-tile v4-span-4">
              <div class="v4-tile-head">
                <div class="v4-tile-title">${D().icon('listTodo', 15)} 업무 · 일정 <span class="pw-badge" data-tone="blue">${openTasks.length}</span></div>
              </div>
              <div class="task-input-row">
                ${D().icon('plus', 13)}
                <input id="v4-task-input" placeholder="새 업무 적고 Enter..." />
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;max-height:245px;overflow-y:auto" data-scroll-id="v4-tasks">
                ${project.tasks.length === 0 ? '<div style="padding:18px;text-align:center;color:#94a3b8;font-size:12px">등록된 업무가 없습니다.</div>' : ''}
                ${project.tasks.map((t) => `
                  <div class="task-row ${t.done ? 'done' : ''}">
                    <button type="button" class="task-check" data-v4-task="${t.id}">${t.done ? D().icon('check', 11) : ''}</button>
                    <div style="min-width:0;flex:1">
                      <div class="task-title" style="font-size:12.5px;font-weight:500">${D().esc(t.title)}</div>
                      <div style="font-size:11px;color:#64748b" class="num">${D().esc(t.dueLabel)} · ${D().esc(t.assignee)}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </section>

            <!-- Tile 5 (3 cols): 자료실 미니 갤러리 -->
            <section class="v4-tile v4-span-3">
              <div class="v4-tile-head">
                <div class="v4-tile-title">${D().icon('image', 15)} 자료실 (${project.files.length})</div>
                <button type="button" class="pw-btn pw-btn-ghost pw-btn-sm" id="v4-tile-upload">+ 올리기</button>
              </div>
              ${project.files.length === 0 ? `
                <div style="padding:26px 10px;text-align:center;color:#94a3b8;font-size:12px">자료 없음</div>
              ` : `
                <div class="v4-mosaic">
                  ${project.files.slice(0, 4).map((f) => `
                    <button type="button" class="v4-mosaic-item" data-open-file="${f.id}">
                      ${D().svgPreview(f.previewKind, f.category)}
                      <span class="v4-mosaic-label">${D().esc(f.name)}</span>
                    </button>
                  `).join('')}
                </div>
                <div style="font-size:11.5px;color:#64748b">썸네일을 누르면 OCR 원문과 함께 크게 봅니다.</div>
              `}
            </section>

            <!-- Tile 6 (12 cols): 거래 · 대금 일정 & 중개보수 트래커 -->
            <section class="v4-tile v4-span-12">
              <div class="v4-tile-head">
                <div class="v4-tile-title">${D().icon('handshake', 15)} 거래 · 대금 일정 &amp; 중개보수 트래커</div>
                ${deal ? `<span class="pw-badge" data-tone="blue">${D().esc(dealPlace)} · ${D().esc(deal.stageLabel)}</span>` : ''}
              </div>
              ${!deal ? `
                <div style="padding:12px;border-radius:10px;background:#f8fafc;border:1px dashed #cbd5e1;text-align:center;font-size:12.5px;color:#64748b">
                  현재 거래 전환된 계약이 없습니다. 매칭 후보가 협상 단계를 통과하면 대금 일정과 예상 중개보수가 여기에 펼쳐집니다.
                </div>
              ` : `
                <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:14px;align-items:center">
                  <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
                    ${deal.payments.map((p) => `
                      <div class="v4-inner-card" style="background:${p.status === 'paid' ? '#ecfdf5' : '#f8fafc'};border-color:${p.status === 'paid' ? '#a7f3d0' : '#e2e8f0'}">
                        <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#475569">
                          <strong>${D().esc(p.kind)}</strong>
                          <span>${D().esc(p.statusLabel)}</span>
                        </div>
                        <div class="num" style="font-size:15px;font-weight:700;color:#0f172a;margin-top:3px">${D().esc(p.amountLabel)}</div>
                        <div class="num" style="font-size:11.5px;color:#64748b">${D().esc(p.dateLabel)}</div>
                      </div>
                    `).join('')}
                  </div>
                  <div class="v4-inner-card" style="background:#f0fdf4;border-color:#bbf7d0;display:flex;justify-content:space-between;align-items:center">
                    <div>
                      <div style="font-size:11.5px;color:#15803d;font-weight:700">예상 중개보수 (${D().esc(deal.commission.clientSide)})</div>
                      <div class="num" style="font-size:16px;font-weight:800;color:#14532d;margin-top:2px">${D().esc(deal.commission.expectedWonLabel)}</div>
                      <div style="font-size:11px;color:#166534">요율 ${D().esc(deal.commission.rate)} · ${D().esc(deal.commission.statusLabel)}</div>
                    </div>
                    <span class="pw-badge" data-tone="green">권한 보호</span>
                  </div>
                </div>
              `}
            </section>
          </div>
        </div>
      </div>
    `;

    bindBentoEvents(container, project);
  }

  function bindBentoEvents(container, project) {
    container.querySelector('#v4-proj-select')?.addEventListener('change', (e) => S().selectProject(e.target.value));
    container.querySelector('#v4-call-btn')?.addEventListener('click', () => {
      M().showToast(`${project.primaryContact?.name} (${project.primaryContact?.phone}) 전화 발신`);
    });
    container.querySelector('#v4-new-proj')?.addEventListener('click', () => M().openNewProjectModal());
    container.querySelector('#v4-add-listing')?.addEventListener('click', () => M().openNewListingSheet(project.id));
    container.querySelector('#v4-bridge-listing')?.addEventListener('click', () => M().openNewListingSheet(project.id));
    container.querySelector('#v4-add-req')?.addEventListener('click', () => M().openNewRequirementSheet(project.id));
    container.querySelector('#v4-bridge-req')?.addEventListener('click', () => M().openNewRequirementSheet(project.id));
    container.querySelector('#v4-add-file')?.addEventListener('click', () => M().openUploadFileModal(project.id));
    container.querySelector('#v4-tile-upload')?.addEventListener('click', () => M().openUploadFileModal(project.id));
    container.querySelector('#v4-brief-btn')?.addEventListener('click', () => M().openBriefingModal(project.id));
    container.querySelector('#v4-bridge-brief')?.addEventListener('click', () => M().openBriefingModal(project.id));

    container.querySelector('#v4-memo-input')?.addEventListener('change', (e) => {
      S().updateProject(project.id, { memo: e.target.value.trim() });
      M().showToast('요약 메모를 저장했습니다.');
    });

    container.querySelectorAll('[data-v4-step]').forEach((btn) => {
      btn.addEventListener('click', () => S().toggleStepDone(project.id, btn.getAttribute('data-v4-step')));
    });
    container.querySelectorAll('[data-v4-mstage]').forEach((sel) => {
      sel.addEventListener('change', () => {
        S().updateMatchStage(project.id, sel.getAttribute('data-v4-mstage'), sel.value);
        M().showToast('매칭 단계를 변경했습니다.');
      });
    });

    container.querySelectorAll('[data-v4-ff]').forEach((btn) => {
      btn.addEventListener('click', () => {
        bentoFeedFilter = btn.getAttribute('data-v4-ff');
        renderBento(container);
      });
    });
    container.querySelectorAll('[data-v4-asug]').forEach((btn) => {
      btn.addEventListener('click', () => {
        S().acceptSuggestion(project.id, btn.getAttribute('data-v4-asug'));
        M().showToast('통화 AI 제안을 반영했습니다.');
      });
    });
    container.querySelectorAll('[data-v4-ckind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        bentoCompKind = btn.getAttribute('data-v4-ckind');
        renderBento(container);
      });
    });
    const compInput = container.querySelector('#v4-comp-input');
    compInput?.addEventListener('input', (e) => { bentoCompDraft = e.target.value; });
    const submitComp = () => {
      const txt = compInput?.value || '';
      if (!txt.trim()) return;
      if (bentoCompKind === 'consult') {
        S().addConsultation(project.id, { type: 'phone', content: txt });
        M().showToast('고객 상담을 저장했습니다.');
      } else {
        S().addComment(project.id, { body: txt, color: 'yellow' });
        M().showToast('팀 코멘트를 저장했습니다.');
      }
      bentoCompDraft = '';
    };
    container.querySelector('#v4-comp-save')?.addEventListener('click', submitComp);
    compInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        submitComp();
      }
    });

    const tInput = container.querySelector('#v4-task-input');
    tInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        if (S().addTask(project.id, { title: tInput.value })) {
          M().showToast('업무를 추가했습니다.');
        }
      }
    });
    container.querySelectorAll('[data-v4-task]').forEach((btn) => {
      btn.addEventListener('click', () => S().toggleTask(project.id, btn.getAttribute('data-v4-task')));
    });

    container.querySelectorAll('[data-open-file]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const f = project.files.find((x) => x.id === btn.getAttribute('data-open-file'));
        M().openFilePreviewModal(f);
      });
    });
  }

  window.PWViews = window.PWViews || {};
  window.PWViews.bento = renderBento;
})();
