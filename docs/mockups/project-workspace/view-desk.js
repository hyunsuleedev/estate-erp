/* ==========================================================================
   ANGLE 2 · 중개날개 진화형 · 올인원 손님 데스크 (Warm Tactile Single-Scroll Desk)
   폴더·불빛 사이드바 + OCR 통합검색 + 포스트잇/상담 보드 + 원라인 할 일 + 브리핑·자료실
   ========================================================================== */
(() => {
  'use strict';

  function D() { return window.PWData; }
  function S() { return window.PWStore; }
  function M() { return window.PWModals; }

  let noteComposerOpen = false;
  let noteKind = 'comment'; // comment | consult
  let noteColor = 'yellow';
  let noteConsultType = 'phone';
  let noteDraft = '';
  let taskDuePreset = '오늘';

  function renderDesk(container) {
    const state = S().getState();
    const project = S().getCurrentProject();
    const ui = state.ui;
    const light = D().STATUS_LIGHT_MAP[project.statusLight] || D().STATUS_LIGHTS[0];
    const query = (ui.deskSearch || '').trim().toLowerCase();

    // Unified OCR + Project search
    const ocrMatches = query.length >= 2
      ? state.projects.flatMap((p) =>
          p.files
            .filter((f) => (f.ocrText || '').toLowerCase().includes(query) || f.name.toLowerCase().includes(query))
            .map((f) => ({ project: p, file: f }))
        )
      : [];

    const openTasks = project.tasks.filter((t) => !t.done);
    const doneTasks = project.tasks.filter((t) => t.done);
    const selectedBriefCount = project.matches.filter((m) => m.briefSelected).length;

    // Combined notes for Post-it & Consultation board
    const noteItems = [];
    if (ui.deskNoteFilter === 'all' || ui.deskNoteFilter === 'consult') {
      project.consultations.forEach((c) => noteItems.push({ kind: 'consult', data: c }));
    }
    if (ui.deskNoteFilter === 'all' || ui.deskNoteFilter === 'comment') {
      project.comments.forEach((cm) => noteItems.push({ kind: 'comment', data: cm }));
    }

    const filteredFiles = project.files.filter(
      (f) => ui.deskFileCat === 'all' || f.category === ui.deskFileCat
    );

    container.innerHTML = `
      <div class="v2-shell">
        <!-- Left Folder & Client-Light Sidebar -->
        <aside class="v2-sidebar" aria-label="폴더 및 손님 목록">
          <div class="v2-search-box">
            <div class="v2-search-input">
              ${D().icon('search', 14)}
              <input id="v2-search-input" value="${D().esc(ui.deskSearch)}"
                placeholder="이름 · 메모 · 사진 속 글자(OCR)..." aria-label="통합 검색" />
              ${ui.deskSearch ? `<button type="button" id="v2-clear-search" aria-label="검색 지우기">${D().icon('x', 13)}</button>` : ''}
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#6b675f">
              <span>팁: "근저당", "가계약", "주차" 입력해 보세요</span>
              <button type="button" class="pw-btn pw-btn-primary pw-btn-sm" id="v2-new-proj" style="height:24px;font-size:11px">+ 새 손님</button>
            </div>
          </div>

          ${ocrMatches.length > 0 ? `
            <div style="padding:10px;background:#fffbeb;border-bottom:1px solid #fde68a;display:flex;flex-direction:column;gap:6px">
              <div style="font-size:11.5px;font-weight:700;color:#92400e">사진·문서 OCR 일치 (${ocrMatches.length}건)</div>
              ${ocrMatches.slice(0, 4).map(({ project: mp, file: mf }) => `
                <button type="button" data-v2-ocr-open="${mp.id}:${mf.id}"
                  style="text-align:left;padding:6px 8px;border-radius:7px;background:#ffffff;border:1px solid #fde68a;font-size:11.5px">
                  <div style="font-weight:600;color:#1f2328" class="trunc">${D().esc(mf.name)}</div>
                  <div style="color:#78350f;font-size:11px" class="trunc">${D().esc(mp.primaryContact?.name)} · ${D().esc(mf.ocrText)}</div>
                </button>
              `).join('')}
            </div>
          ` : ''}

          <div class="v2-folder-list" data-scroll-id="v2-sidebar">
            ${D().FOLDERS.map((folder) => {
              const items = state.projects.filter((p) => {
                if (p.folderId !== folder.id) return false;
                if (!query) return true;
                return (
                  p.title.toLowerCase().includes(query) ||
                  (p.primaryContact?.name || '').toLowerCase().includes(query) ||
                  (p.memo || '').toLowerCase().includes(query)
                );
              });
              return `
                <div>
                  <div class="v2-folder-label">
                    <span style="width:8px;height:8px;border-radius:2px;background:${folder.color}"></span>
                    <span>${D().esc(folder.space)} · ${D().esc(folder.name)}</span>
                    <span class="num" style="margin-left:auto;color:#9ca3af">${items.length}</span>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:3px">
                    ${items.length === 0 ? `<div style="padding:4px 8px;font-size:11.5px;color:#9ca3af">해당 없음</div>` : items.map((p) => {
                      const pl = D().STATUS_LIGHT_MAP[p.statusLight] || D().STATUS_LIGHTS[0];
                      const active = p.id === project.id;
                      return `
                        <button type="button" class="v2-client-row ${active ? 'active' : ''}" data-v2-select="${p.id}">
                          <span class="v2-light-dot" style="background:${pl.color}" title="${D().esc(pl.label)}"></span>
                          <div style="min-width:0;flex:1">
                            <div style="font-weight:600;font-size:12.5px;color:#1f2328" class="trunc">
                              ${D().esc(p.primaryContact?.name || '고객')} <span style="font-weight:400;color:#6b675f">· ${D().esc(p.title)}</span>
                            </div>
                            <div style="font-size:11px;color:#6b675f;display:flex;gap:6px">
                              <span>${D().esc(pl.label)}</span>
                              <span class="num">할 일 ${p.tasks.filter((t) => !t.done).length}</span>
                              <span class="num">자료 ${p.files.length}</span>
                            </div>
                          </div>
                        </button>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </aside>

        <!-- Right Single-Scroll Tactile Desk -->
        <main class="v2-desk">
          <header class="v2-desk-head">
            <div style="min-width:0;flex:1">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#1f2328">${D().esc(project.primaryContact?.name || '고객')}</span>
                <span style="font-size:14px;font-weight:600;color:#4b5563">${D().esc(project.title)}</span>
                <span class="pw-badge" style="background:${light.bg};color:${light.text}">
                  <span class="pw-dot" style="background:${light.color}"></span>${D().esc(light.label)}
                </span>
              </div>
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px;font-size:12px;color:#57534e">
                ${project.people.map((per) => `
                  <span><strong>${D().esc(per.name)}</strong> (${D().esc(per.role)}) ${D().esc(per.phone)}</span>
                `).join('<span style="color:#d6d3cd">|</span>')}
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <!-- Status Light Quick Switcher -->
              <div style="display:inline-flex;align-items:center;gap:4px;padding:3px 6px;border-radius:999px;background:#f5f3ee;border:1px solid #e6e2d8" title="손님 불빛 상태 변경">
                ${D().STATUS_LIGHTS.map((l) => `
                  <button type="button" data-v2-light="${l.key}"
                    style="display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border-radius:999px;font-size:11.5px;
                    ${project.statusLight === l.key ? `background:#ffffff;font-weight:700;color:${l.text};box-shadow:0 1px 2px rgba(0,0,0,0.08)` : 'color:#6b675f'}">
                    <span style="width:7px;height:7px;border-radius:50%;background:${l.color}"></span>${l.label}
                  </button>
                `).join('')}
              </div>
              <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v2-call-btn">
                ${D().icon('phone', 13)} 전화
              </button>
              <button type="button" class="pw-btn pw-btn-blue pw-btn-sm" id="v2-share-btn">
                ${D().icon('share', 13)} 손님 공유 페이지 만들기
              </button>
            </div>
          </header>

          <div class="v2-desk-scroll" data-scroll-id="v2-desk-scroll">
            <div class="v2-columns">
              <!-- Left Column: Post-it & Consultation Board + Matched Listings + Files -->
              <div class="v2-col">
                <!-- 1. Post-it & Consultation Board -->
                <section class="v2-panel">
                  <div class="v2-panel-head">
                    <div class="v2-panel-title">
                      ${D().icon('sticky', 15)} 포스트잇 &amp; 상담 보드
                      <span class="pw-badge" data-tone="gray">${noteItems.length}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                      <div style="display:inline-flex;gap:2px;background:#f4f2ec;padding:2px;border-radius:7px">
                        <button type="button" class="pw-btn pw-btn-sm ${ui.deskNoteFilter === 'all' ? 'pw-btn-primary' : 'pw-btn-ghost'}" style="height:24px;font-size:11.5px" data-v2-nfilter="all">전체</button>
                        <button type="button" class="pw-btn pw-btn-sm ${ui.deskNoteFilter === 'consult' ? 'pw-btn-primary' : 'pw-btn-ghost'}" style="height:24px;font-size:11.5px" data-v2-nfilter="consult">상담</button>
                        <button type="button" class="pw-btn pw-btn-sm ${ui.deskNoteFilter === 'comment' ? 'pw-btn-primary' : 'pw-btn-ghost'}" style="height:24px;font-size:11.5px" data-v2-nfilter="comment">포스트잇</button>
                      </div>
                      ${project.matches.length > 0 ? `
                        <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v2-insert-brief-note" title="선택한 후보 매물을 포스트잇 기록으로 남깁니다">
                          + 브리핑 물건 글로 넣기
                        </button>
                      ` : ''}
                      <button type="button" class="pw-btn pw-btn-blue pw-btn-sm" id="v2-toggle-note-form">
                        ${D().icon('plus', 13)} 글 남기기
                      </button>
                    </div>
                  </div>

                  ${noteComposerOpen ? `
                    <div style="margin-bottom:12px;padding:12px;border-radius:10px;background:#faf8f4;border:1px solid #e2ddd2;display:grid;gap:8px">
                      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
                        <div style="display:flex;gap:6px">
                          <button type="button" class="pw-btn pw-btn-sm ${noteKind === 'comment' ? 'pw-btn-primary' : 'pw-btn-line'}" data-v2-nkind="comment">포스트잇 (팀 코멘트)</button>
                          <button type="button" class="pw-btn pw-btn-sm ${noteKind === 'consult' ? 'pw-btn-primary' : 'pw-btn-line'}" data-v2-nkind="consult">고객 상담 적기</button>
                        </div>
                        ${noteKind === 'comment' ? `
                          <div style="display:flex;align-items:center;gap:6px">
                            ${D().COMMENT_COLORS.map((c) => `
                              <button type="button" class="v2-color-dot ${noteColor === c.key ? 'selected' : ''}" style="background:${c.bg}" data-v2-ncolor="${c.key}" title="${c.label}"></button>
                            `).join('')}
                          </div>
                        ` : `
                          <select class="stage-select" id="v2-note-ctype">
                            ${D().CONSULT_TYPES.map((t) => `<option value="${t.key}" ${t.key === noteConsultType ? 'selected' : ''}>${t.label}</option>`).join('')}
                          </select>
                        `}
                      </div>
                      <textarea id="v2-note-draft" class="field-textarea" style="min-height:66px" placeholder="${noteKind === 'comment' ? '포스트잇에 팀과 함께 볼 메모를 적으세요...' : '손님과 나눈 상담 내용을 적으세요...'}">${D().esc(noteDraft)}</textarea>
                      <div style="display:flex;justify-content:flex-end;gap:6px">
                        <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v2-note-cancel">닫기</button>
                        <button type="button" class="pw-btn pw-btn-blue pw-btn-sm" id="v2-note-save">저장</button>
                      </div>
                    </div>
                  ` : ''}

                  <div class="v2-postit-grid">
                    ${noteItems.length === 0 ? `
                      <div style="grid-column:span 2;padding:18px;text-align:center;color:#78716c;font-size:12.5px">등록된 글이 없습니다.</div>
                    ` : noteItems.map((item) => {
                      if (item.kind === 'comment') {
                        const cm = item.data;
                        return `
                          <article class="v2-postit" data-color="${D().esc(cm.color || 'yellow')}">
                            <div style="display:flex;justify-content:space-between;font-size:11px;color:#57534e">
                              <span><strong>포스트잇</strong> · ${D().esc(cm.author)}</span>
                              <span class="num">${D().esc(cm.createdAt)}</span>
                            </div>
                            <div style="line-height:1.5;color:#1f2328;white-space:pre-wrap">${D().esc(cm.body)}</div>
                          </article>
                        `;
                      }
                      const c = item.data;
                      const tLabel = D().CONSULT_TYPES.find((x) => x.key === c.type)?.label || c.type;
                      return `
                        <article class="v2-postit" data-color="neutral" style="border-left:3px solid #2563eb;background:#ffffff">
                          <div style="display:flex;justify-content:space-between;font-size:11px;color:#1d4ed8">
                            <span><strong>상담(${D().esc(tLabel)})</strong> · ${D().esc(c.contactName)}</span>
                            <span class="num" style="color:#6b7280">${D().esc(c.createdAt)}</span>
                          </div>
                          <div style="line-height:1.5;color:#1f2328;white-space:pre-wrap">${D().esc(c.content)}</div>
                        </article>
                      `;
                    }).join('')}
                  </div>
                </section>

                <!-- 2. 연결 매물 · 브리핑 비교 보드 -->
                <section class="v2-panel">
                  <div class="v2-panel-head">
                    <div class="v2-panel-title">${D().icon('building', 15)} 연결 매물 · 브리핑 비교</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                      <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v2-add-listing">+ 매물 의뢰</button>
                      <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v2-add-req">+ 희망 조건</button>
                      ${project.matches.length > 0 ? `
                        <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v2-copy-brief">${D().icon('copy', 12)} 카톡 브리핑 복사 (${selectedBriefCount})</button>
                      ` : ''}
                    </div>
                  </div>

                  ${project.listingIntakes.length > 0 ? `
                    <div style="padding:10px 12px;border-radius:9px;background:#fffbeb;border:1px solid #fde68a;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
                      <div>
                        <span class="pw-badge" data-tone="amber">매물 의뢰 (소유자 측)</span>
                        <strong style="margin-left:6px;font-size:13.5px">${D().esc(project.listingIntakes[0].place)}</strong>
                        <span style="font-size:12px;color:#78350f;margin-left:6px">${D().esc(project.listingIntakes[0].areaDetail)} · ${D().esc(project.listingIntakes[0].listings[0]?.priceLabel || '')}</span>
                      </div>
                      <span class="pw-badge" data-tone="green">${D().esc(project.listingIntakes[0].lastVerifiedLabel)}</span>
                    </div>
                  ` : ''}

                  ${project.buyerIntakes.flatMap((bi) => bi.requirements).map((req) => `
                    <div style="padding:10px 12px;border-radius:9px;background:#eff6ff;border:1px solid #bfdbfe;margin-bottom:10px;font-size:12.5px">
                      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
                        <span><strong>희망 조건:</strong> ${D().esc(req.transactionType)} ${D().esc(req.budgetLabel)} · ${D().esc(req.areaLabel)}</span>
                        <span style="color:#1e40af;font-weight:600">${D().esc(req.preferredSites.join(', '))}</span>
                      </div>
                      ${req.memo ? `<div style="font-size:11.5px;color:#475569;margin-top:4px">${D().esc(req.memo)}</div>` : ''}
                    </div>
                  `).join('')}

                  ${project.matches.length === 0 ? `
                    <div style="padding:16px;text-align:center;color:#78716c;font-size:12.5px;background:#faf9f6;border-radius:8px;border:1px dashed #d6d3cd">
                      아직 연결된 후보 매물이 없습니다. 위 단추로 매물 의뢰나 희망 조건을 먼저 등록해 보세요.
                    </div>
                  ` : `
                    <div style="display:flex;flex-direction:column;gap:6px">
                      ${project.matches.map((m) => `
                        <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;border:1px solid ${m.briefSelected ? '#93c5fd' : '#e5e7eb'};background:${m.briefSelected ? '#f8fbff' : '#ffffff'}">
                          <input type="checkbox" data-v2-brief="${m.id}" ${m.briefSelected ? 'checked' : ''} aria-label="브리핑 선택" />
                          <div style="min-width:0;flex:1">
                            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                              <strong style="font-size:13px">${D().esc(m.place)}</strong>
                              <span class="num" style="font-weight:700;color:#2563eb;font-size:12.5px">${D().esc(m.agreedPriceLabel || m.priceLabel)}</span>
                              <span style="font-size:11.5px;color:#6b7280">${D().esc(m.areaShort)} · 입주 ${D().esc(m.moveInLabel)}</span>
                            </div>
                            <div style="font-size:11.5px;color:#4b5563;margin-top:2px">${D().esc(m.briefNote)}</div>
                          </div>
                          <select class="stage-select" data-v2-mstage="${m.id}">
                            ${D().MATCH_STAGES.map((s) => `<option value="${s.key}" ${s.key === m.stage ? 'selected' : ''}>${s.label}</option>`).join('')}
                          </select>
                        </div>
                      `).join('')}
                    </div>
                  `}
                </section>

                <!-- 3. 분류별 자료 보관함 -->
                <section class="v2-panel">
                  <div class="v2-panel-head">
                    <div class="v2-panel-title">${D().icon('folder', 15)} 분류별 자료 보관함 (${filteredFiles.length})</div>
                    <button type="button" class="pw-btn pw-btn-line pw-btn-sm" id="v2-upload-file">${D().icon('upload', 13)} 자료 올리기 (Ctrl+V)</button>
                  </div>
                  <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px">
                    ${D().FILE_CATEGORIES.map((c) => `
                      <button type="button" class="pw-btn pw-btn-sm ${ui.deskFileCat === c.key ? 'pw-btn-primary' : 'pw-btn-line'}" data-v2-fcat="${c.key}">${c.label}</button>
                    `).join('')}
                  </div>
                  <div class="file-grid" style="grid-template-columns:repeat(auto-fill,minmax(155px,1fr))">
                    ${filteredFiles.map((f) => `
                      <button type="button" class="file-card" data-open-file="${f.id}">
                        <div class="file-thumb" style="height:88px">${D().svgPreview(f.previewKind, f.name)}</div>
                        <div class="file-info">
                          <div class="file-name trunc">${D().esc(f.name)}</div>
                          <div class="file-caption">${D().esc(f.category)} · ${D().esc(f.createdAt)}</div>
                        </div>
                      </button>
                    `).join('')}
                  </div>
                </section>
              </div>

              <!-- Right Column: One-line Tasks + Call Recording AI + Contract/Commission -->
              <div class="v2-col">
                <!-- 1. 오늘 · 예정 할 일 -->
                <section class="v2-panel">
                  <div class="v2-panel-head">
                    <div class="v2-panel-title">${D().icon('listTodo', 15)} 할 일 (업무) <span class="pw-badge" data-tone="blue">${openTasks.length}</span></div>
                    <div style="display:flex;gap:4px">
                      ${['오늘', '내일', '이번 주'].map((d) => `
                        <button type="button" class="pw-btn pw-btn-sm ${taskDuePreset === d ? 'pw-btn-primary' : 'pw-btn-ghost'}" style="height:22px;font-size:11px;padding:0 7px" data-v2-due="${d}">${d}</button>
                      `).join('')}
                    </div>
                  </div>
                  <div class="task-input-row" style="margin-bottom:10px">
                    ${D().icon('plus', 14)}
                    <input id="v2-task-input" placeholder="통화 중 한 줄 입력 후 Enter (${taskDuePreset})..." aria-label="새 할 일 입력" />
                  </div>
                  <div style="display:flex;flex-direction:column;gap:6px">
                    ${openTasks.length === 0 ? '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:12px">미완료 할 일이 없습니다.</div>' : ''}
                    ${openTasks.map((t) => `
                      <div class="task-row">
                        <button type="button" class="task-check" data-v2-task="${t.id}" aria-label="완료 표시"></button>
                        <div style="min-width:0;flex:1">
                          <div style="font-size:12.5px;font-weight:500">${D().esc(t.title)}</div>
                          <div style="font-size:11px;color:#6b7280;margin-top:2px;display:flex;gap:6px">
                            <span class="num">${D().esc(t.dueLabel)}</span>
                            ${t.remindLabel ? `<span style="color:#d97706">🔔 ${D().esc(t.remindLabel)}</span>` : ''}
                          </div>
                        </div>
                      </div>
                    `).join('')}
                    ${doneTasks.length > 0 ? `
                      <button type="button" id="v2-toggle-done-tasks" style="font-size:11.5px;color:#6b7280;padding:4px 2px;text-align:left">
                        ${ui.deskShowCompletedTasks ? '▾' : '▸'} 완료됨 ${doneTasks.length}건
                      </button>
                      ${ui.deskShowCompletedTasks ? doneTasks.map((t) => `
                        <div class="task-row done">
                          <button type="button" class="task-check" data-v2-task="${t.id}">${D().icon('check', 11)}</button>
                          <div class="task-title" style="font-size:12px">${D().esc(t.title)}</div>
                        </div>
                      `).join('') : ''}
                    ` : ''}
                  </div>
                </section>

                <!-- 2. 통화 녹음 & AI 제안 -->
                <section class="v2-panel">
                  <div class="v2-panel-head">
                    <div class="v2-panel-title">${D().icon('mic', 15)} 통화 녹음 · AI 제안</div>
                  </div>
                  ${project.callRecordings.length === 0 ? `
                    <div style="padding:12px;text-align:center;color:#78716c;font-size:12px">연결된 통화 녹음 분석이 아직 없습니다.</div>
                  ` : project.callRecordings.map((rec) => `
                    <div style="display:grid;gap:8px">
                      <div style="padding:10px;border-radius:9px;background:#f8fafc;border:1px solid #e2e8f0">
                        <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#475569;margin-bottom:4px">
                          <strong>${D().esc(rec.direction)} · ${D().esc(rec.contactName)}</strong>
                          <span class="num">${D().esc(rec.calledAt)} (${D().esc(rec.duration)})</span>
                        </div>
                        <div style="font-size:12px;color:#1e293b">${D().esc(rec.summary)}</div>
                      </div>
                      ${rec.suggestions.map((sug) => `
                        <div style="padding:9px 10px;border-radius:8px;border:1px solid ${sug.status === 'pending' ? '#c7d2fe' : '#e2e8f0'};background:${sug.status === 'pending' ? '#eef2ff' : '#f8fafc'}">
                          <div style="display:flex;justify-content:space-between;gap:6px;align-items:center">
                            <span class="pw-badge" data-tone="${sug.status === 'accepted' ? 'green' : 'violet'}">${D().esc(sug.type)}</span>
                            ${sug.status === 'pending' ? `
                              <div style="display:flex;gap:4px">
                                <button type="button" class="pw-btn pw-btn-line pw-btn-sm" style="height:22px;font-size:11px" data-v2-dsug="${sug.id}">무시</button>
                                <button type="button" class="pw-btn pw-btn-blue pw-btn-sm" style="height:22px;font-size:11px" data-v2-asug="${sug.id}">할 일에 반영</button>
                              </div>
                            ` : `<span style="font-size:11px;color:#64748b">${sug.status === 'accepted' ? '반영됨' : '무시됨'}</span>`}
                          </div>
                          <div style="font-size:12px;font-weight:600;margin-top:4px">${D().esc(sug.title)}</div>
                          <div style="font-size:11px;color:#475569;margin-top:2px">${D().esc(sug.evidence)}</div>
                        </div>
                      `).join('')}
                    </div>
                  `).join('')}
                </section>

                <!-- 3. 계약 · 중개보수 요약 -->
                <section class="v2-panel">
                  <div class="v2-panel-head">
                    <div class="v2-panel-title">${D().icon('wallet', 15)} 계약 · 중개보수</div>
                  </div>
                  ${project.listingIntakes.filter((li) => li.deal).length === 0 ? `
                    <div style="padding:12px;text-align:center;color:#78716c;font-size:12px">계약 진행 중인 거래가 없습니다.</div>
                  ` : project.listingIntakes.filter((li) => li.deal).map((li) => `
                    <div style="display:grid;gap:8px;font-size:12.5px">
                      <div style="display:flex;justify-content:space-between;align-items:center">
                        <strong>${D().esc(li.place)}</strong>
                        <span class="pw-badge" data-tone="blue">${D().esc(li.deal.stageLabel)}</span>
                      </div>
                      <div style="display:grid;gap:4px">
                        ${li.deal.payments.map((p) => `
                          <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed #e5e7eb">
                            <span>${D().esc(p.kind)} <span class="num" style="color:#6b7280">(${D().esc(p.dateLabel)})</span></span>
                            <span class="num"><strong>${D().esc(p.amountLabel)}</strong> · ${D().esc(p.statusLabel)}</span>
                          </div>
                        `).join('')}
                      </div>
                      <div style="padding:8px 10px;border-radius:8px;background:#f0fdf4;border:1px solid #bbf7d0;display:flex;justify-content:space-between">
                        <span>예상 중개보수 (${D().esc(li.deal.commission.rate)})</span>
                        <strong class="num" style="color:#15803d">${D().esc(li.deal.commission.expectedWonLabel)}</strong>
                      </div>
                    </div>
                  `).join('')}
                </section>
              </div>
            </div>
          </div>
        </main>
      </div>
    `;

    bindDeskEvents(container, project);
  }

  function bindDeskEvents(container, project) {
    const sInput = container.querySelector('#v2-search-input');
    if (sInput) {
      let composing = false;
      const applySearch = (val, pos) => {
        S().setUi({ deskSearch: val });
        const reInput = document.querySelector('#v2-search-input');
        if (reInput) { reInput.focus(); if (pos != null) reInput.setSelectionRange(pos, pos); }
      };
      sInput.addEventListener('compositionstart', () => { composing = true; });
      sInput.addEventListener('compositionend', (e) => {
        composing = false;
        applySearch(e.target.value, e.target.selectionStart);
      });
      sInput.addEventListener('input', (e) => {
        if (composing || e.isComposing) return;
        applySearch(e.target.value, e.target.selectionStart);
      });
    }
    container.querySelector('#v2-clear-search')?.addEventListener('click', () => S().setUi({ deskSearch: '' }));
    container.querySelector('#v2-new-proj')?.addEventListener('click', () => M().openNewProjectModal());

    container.querySelectorAll('[data-v2-select]').forEach((btn) => {
      btn.addEventListener('click', () => S().selectProject(btn.getAttribute('data-v2-select')));
    });

    container.querySelectorAll('[data-v2-ocr-open]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [pid, fid] = btn.getAttribute('data-v2-ocr-open').split(':');
        S().selectProject(pid);
        const f = S().getProject(pid)?.files.find((x) => x.id === fid);
        if (f) M().openFilePreviewModal(f);
      });
    });

    container.querySelectorAll('[data-v2-light]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-v2-light');
        S().updateProject(project.id, { statusLight: key });
        M().showToast(`손님 불빛을 "${D().STATUS_LIGHT_MAP[key]?.label}"(으)로 변경했습니다.`);
      });
    });

    container.querySelector('#v2-call-btn')?.addEventListener('click', () => {
      M().showToast(`${project.primaryContact?.name} (${project.primaryContact?.phone}) 전화 연결`);
    });
    container.querySelector('#v2-share-btn')?.addEventListener('click', () => M().openBriefingModal(project.id));
    container.querySelector('#v2-add-listing')?.addEventListener('click', () => M().openNewListingSheet(project.id));
    container.querySelector('#v2-add-req')?.addEventListener('click', () => M().openNewRequirementSheet(project.id));
    container.querySelector('#v2-upload-file')?.addEventListener('click', () => M().openUploadFileModal(project.id));

    container.querySelector('#v2-copy-brief')?.addEventListener('click', () => {
      const txt = S().computeBriefingCopyText(project, { hideUnit: true, excludePrivateMemo: true });
      navigator.clipboard?.writeText(txt).catch(() => {});
      M().showToast('선택한 후보 매물의 카톡 브리핑 문구를 복사했습니다.');
    });

    container.querySelector('#v2-insert-brief-note')?.addEventListener('click', () => {
      const txt = S().computeBriefingCopyText(project, { hideUnit: false, excludePrivateMemo: true });
      S().addComment(project.id, { body: `[브리핑 기록]\n${txt}`, color: 'blue' });
      M().showToast('선택한 후보 매물을 포스트잇 기록으로 남겼습니다.');
    });

    container.querySelectorAll('[data-v2-nfilter]').forEach((btn) => {
      btn.addEventListener('click', () => S().setUi({ deskNoteFilter: btn.getAttribute('data-v2-nfilter') }));
    });
    container.querySelector('#v2-toggle-note-form')?.addEventListener('click', () => {
      noteComposerOpen = !noteComposerOpen;
      renderDesk(container);
    });
    container.querySelector('#v2-note-cancel')?.addEventListener('click', () => {
      noteComposerOpen = false;
      renderDesk(container);
    });
    container.querySelectorAll('[data-v2-nkind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        noteKind = btn.getAttribute('data-v2-nkind');
        renderDesk(container);
      });
    });
    container.querySelectorAll('[data-v2-ncolor]').forEach((btn) => {
      btn.addEventListener('click', () => {
        noteColor = btn.getAttribute('data-v2-ncolor');
        renderDesk(container);
      });
    });
    container.querySelector('#v2-note-ctype')?.addEventListener('change', (e) => {
      noteConsultType = e.target.value;
    });
    const draftEl = container.querySelector('#v2-note-draft');
    draftEl?.addEventListener('input', (e) => { noteDraft = e.target.value; });
    container.querySelector('#v2-note-save')?.addEventListener('click', () => {
      const text = draftEl?.value || '';
      if (!text.trim()) return;
      if (noteKind === 'comment') {
        S().addComment(project.id, { body: text, color: noteColor });
        M().showToast('포스트잇(ProjectComment)을 추가했습니다.');
      } else {
        S().addConsultation(project.id, { type: noteConsultType, content: text });
        M().showToast('고객 상담(Consultation)을 추가했습니다.');
      }
      noteDraft = '';
      noteComposerOpen = false;
    });

    container.querySelectorAll('[data-v2-brief]').forEach((cb) => {
      cb.addEventListener('change', () => S().toggleBriefSelect(project.id, cb.getAttribute('data-v2-brief')));
    });
    container.querySelectorAll('[data-v2-mstage]').forEach((sel) => {
      sel.addEventListener('change', () => {
        S().updateMatchStage(project.id, sel.getAttribute('data-v2-mstage'), sel.value);
        M().showToast('매칭 단계를 변경했습니다.');
      });
    });

    container.querySelectorAll('[data-v2-fcat]').forEach((btn) => {
      btn.addEventListener('click', () => S().setUi({ deskFileCat: btn.getAttribute('data-v2-fcat') }));
    });
    container.querySelectorAll('[data-open-file]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const f = project.files.find((x) => x.id === btn.getAttribute('data-open-file'));
        M().openFilePreviewModal(f);
      });
    });

    container.querySelectorAll('[data-v2-due]').forEach((btn) => {
      btn.addEventListener('click', () => {
        taskDuePreset = btn.getAttribute('data-v2-due');
        renderDesk(container);
      });
    });
    const tInput = container.querySelector('#v2-task-input');
    tInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        if (S().addTask(project.id, { title: tInput.value, dueLabel: taskDuePreset })) {
          M().showToast('할 일을 추가했습니다.');
        }
      }
    });
    container.querySelectorAll('[data-v2-task]').forEach((btn) => {
      btn.addEventListener('click', () => S().toggleTask(project.id, btn.getAttribute('data-v2-task')));
    });
    container.querySelector('#v2-toggle-done-tasks')?.addEventListener('click', () => {
      S().setUi({ deskShowCompletedTasks: !S().getState().ui.deskShowCompletedTasks });
    });

    container.querySelectorAll('[data-v2-asug]').forEach((btn) => {
      btn.addEventListener('click', () => {
        S().acceptSuggestion(project.id, btn.getAttribute('data-v2-asug'));
        M().showToast('통화 AI 제안을 할 일/조건에 반영했습니다.');
      });
    });
    container.querySelectorAll('[data-v2-dsug]').forEach((btn) => {
      btn.addEventListener('click', () => {
        S().dismissSuggestion(project.id, btn.getAttribute('data-v2-dsug'));
      });
    });
  }

  window.PWViews = window.PWViews || {};
  window.PWViews.desk = renderDesk;
})();
