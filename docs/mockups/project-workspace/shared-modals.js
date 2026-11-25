/* ==========================================================================
   EstaitFlow — Shared Slide-Over Sheets, Modals, Briefing Phone Preview & DB Diagnosis
   ========================================================================== */
(() => {
  'use strict';

  function D() { return window.PWData; }
  function S() { return window.PWStore; }

  function showToast(message) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'pw-toast';
    el.innerHTML = `${D().icon('check', 14)}<span>${D().esc(message)}</span>`;
    root.appendChild(el);
    window.setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      el.style.transition = 'opacity 180ms ease, transform 180ms ease';
      window.setTimeout(() => el.remove(), 190);
    }, 2400);
  }

  function closeOverlay() {
    const root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
  }

  function renderModal(title, subtitle, bodyHtml, footHtml, options = {}) {
    const root = document.getElementById('modal-root');
    if (!root) return null;
    const { wide = false, sheet = false } = options;
    const backdropCls = sheet ? 'sheet-backdrop' : 'modal-backdrop';
    const cardCls = sheet ? 'sheet-panel' : `modal-card ${wide ? 'wide' : ''}`;
    root.innerHTML = `
      <div class="${backdropCls}" data-overlay-backdrop>
        <div class="${cardCls}" role="dialog" aria-modal="true" aria-label="${D().esc(title)}">
          <div class="overlay-head">
            <div style="min-width:0">
              <div class="overlay-title">${D().esc(title)}</div>
              ${subtitle ? `<div class="overlay-sub">${D().esc(subtitle)}</div>` : ''}
            </div>
            <button type="button" class="pw-btn pw-btn-ghost pw-btn-sm" data-overlay-close aria-label="닫기">
              ${D().icon('x', 16)}
            </button>
          </div>
          <div class="overlay-body">${bodyHtml}</div>
          ${footHtml ? `<div class="overlay-foot">${footHtml}</div>` : ''}
        </div>
      </div>
    `;
    const backdrop = root.querySelector('[data-overlay-backdrop]');
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeOverlay();
    });
    root.querySelector('[data-overlay-close]')?.addEventListener('click', closeOverlay);
    return root;
  }

  /* 1. 인라인 매물 의뢰 등록 Sheet */
  function openNewListingSheet(projectId) {
    const project = S().getProject(projectId);
    const body = `
      <form id="pw-new-listing-form" class="form-grid">
        <div style="padding:10px 12px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#475569">
          기존 앱에서는 <strong>매물 등록 새 탭</strong>으로 나갔다가 돌아와야 했지만, 워크스페이스 안에서 바로 등록하고 이 프로젝트의 단계에 자동 연결합니다.
          (소유자: <strong>${D().esc(project?.primaryContact?.name || '미지정')}</strong> 자동 채움)
        </div>
        <div>
          <label class="field-label" for="nl-place">단지 · 동 · 호</label>
          <input id="nl-place" class="field-input" placeholder="예: 둔촌주공 104동 1203호" required />
        </div>
        <div class="form-row-2">
          <div>
            <label class="field-label" for="nl-tx">거래 유형</label>
            <select id="nl-tx" class="field-select">
              <option value="매매">매매</option>
              <option value="전세">전세</option>
              <option value="월세">월세</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="nl-area">전용면적 (㎡)</label>
            <input id="nl-area" class="field-input" type="number" step="0.1" value="84.9" />
          </div>
        </div>
        <div>
          <label class="field-label" for="nl-price">희망 가격</label>
          <input id="nl-price" class="field-input" placeholder="예: 18억 5,000만 또는 1억 / 220만" required />
        </div>
        <div>
          <label class="field-label" for="nl-memo">점유·방문 메모</label>
          <textarea id="nl-memo" class="field-textarea" placeholder="세입자 거주 여부, 임장 가능 시간 등"></textarea>
        </div>
      </form>
    `;
    const foot = `
      <button type="button" class="pw-btn pw-btn-line" data-overlay-close>취소</button>
      <button type="submit" form="pw-new-listing-form" class="pw-btn pw-btn-blue">${D().icon('plus', 14)} 매물 의뢰 등록 &amp; 담기</button>
    `;
    const root = renderModal('새 매물 의뢰 바로 등록', 'Property → ListingIntake → Listing + ProjectStep 동시 생성', body, foot, { sheet: true });
    if (!root) return;
    root.querySelector('[data-overlay-close]')?.addEventListener('click', closeOverlay);
    const footClose = root.querySelector('.overlay-foot [data-overlay-close]');
    footClose?.addEventListener('click', closeOverlay);
    root.querySelector('#nl-place')?.focus();
    root.querySelector('#pw-new-listing-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const place = root.querySelector('#nl-place').value;
      const transactionType = root.querySelector('#nl-tx').value;
      const areaDetail = root.querySelector('#nl-area').value;
      const priceLabel = root.querySelector('#nl-price').value;
      const memo = root.querySelector('#nl-memo').value;
      if (!place.trim() || !priceLabel.trim()) return;
      S().addListingIntake(project.id, { place, areaDetail, transactionType, priceLabel, memo });
      closeOverlay();
      showToast(`"${place.trim()}" 매물 의뢰를 프로젝트에 담았습니다.`);
    });
  }

  /* 2. 인라인 희망 조건 등록 Sheet */
  function openNewRequirementSheet(projectId) {
    const project = S().getProject(projectId);
    const body = `
      <form id="pw-new-req-form" class="form-grid">
        <div style="padding:10px 12px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#475569">
          현재 프로젝트의 <strong>구매 의뢰(BuyerIntake)</strong>에 새 희망 조건을 즉시 추가합니다.
        </div>
        <div class="form-row-2">
          <div>
            <label class="field-label" for="nr-tx">거래 유형</label>
            <select id="nr-tx" class="field-select">
              <option value="매매">매매</option>
              <option value="전세">전세</option>
              <option value="월세">월세</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="nr-area">희망 평형</label>
            <input id="nr-area" class="field-input" value="33~35평" placeholder="예: 25~34평" />
          </div>
        </div>
        <div class="form-row-2">
          <div>
            <label class="field-label" for="nr-budget">예산 범위</label>
            <input id="nr-budget" class="field-input" placeholder="예: 12억 ~ 14억" required />
          </div>
          <div>
            <label class="field-label" for="nr-move">입주 희망일</label>
            <input id="nr-move" class="field-input" placeholder="예: 2027.02 말" />
          </div>
        </div>
        <div>
          <label class="field-label" for="nr-sites">희망 단지 (쉼표 구분)</label>
          <input id="nr-sites" class="field-input" placeholder="예: 잠실엘스, 잠실리센츠, 파크리오" />
        </div>
        <div>
          <label class="field-label" for="nr-memo">선호 조건 메모</label>
          <textarea id="nr-memo" class="field-textarea" placeholder="학군, 로열층, 대출 활용 여부 등"></textarea>
        </div>
      </form>
    `;
    const foot = `
      <button type="button" class="pw-btn pw-btn-line" data-cancel>취소</button>
      <button type="submit" form="pw-new-req-form" class="pw-btn pw-btn-blue">${D().icon('plus', 14)} 희망 조건 추가</button>
    `;
    const root = renderModal('새 희망 조건 추가', 'BuyerIntake → BuyerRequirement 추가', body, foot, { sheet: true });
    if (!root) return;
    root.querySelector('[data-cancel]')?.addEventListener('click', closeOverlay);
    root.querySelector('#nr-budget')?.focus();
    root.querySelector('#pw-new-req-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const transactionType = root.querySelector('#nr-tx').value;
      const areaLabel = root.querySelector('#nr-area').value;
      const budgetLabel = root.querySelector('#nr-budget').value;
      const moveInDate = root.querySelector('#nr-move').value;
      const preferredSites = root.querySelector('#nr-sites').value;
      const memo = root.querySelector('#nr-memo').value;
      if (!budgetLabel.trim()) return;
      S().addBuyerRequirement(project.id, {
        transactionType,
        areaLabel,
        budgetLabel,
        moveInDate,
        preferredSites,
        memo,
      });
      closeOverlay();
      showToast('새 희망 조건을 프로젝트에 추가했습니다.');
    });
  }

  /* 3. 자료 업로드 Modal (중개날개 분류 + OCR 검색 대비) */
  function openUploadFileModal(projectId) {
    const project = S().getProject(projectId);
    const presets = [
      { name: '현장_거실_실측사진.jpg', cat: '현장사진', caption: '임장 시 촬영한 거실 채광 및 뷰' },
      { name: '가계약금_이체확인증.pdf', cat: '계약관련', caption: '계약 당사자 입금 증빙 서류' },
      { name: '등기사항전부증명서_열람.pdf', cat: '등기·대장', caption: '근저당 및 소유자 확인용' },
      { name: '매도인_협의_카톡캡처.png', cat: '대화캡처', caption: '가격·잔금일 조정 합의 카톡' },
    ];
    let selectedCat = '현장사진';
    const body = `
      <form id="pw-upload-form" class="form-grid">
        <div style="border:2px dashed #cbd5e1;border-radius:10px;padding:18px;text-align:center;background:#f8fafc">
          <div style="color:#2563eb;margin-bottom:6px">${D().icon('upload', 24)}</div>
          <div style="font-weight:600;font-size:13px;color:#0f172a">파일을 끌어다 놓거나 클릭해 올리세요 (Ctrl+V 캡처 붙여넣기 지원)</div>
          <div style="font-size:11.5px;color:#64748b;margin-top:3px">사진·PDF·음성 녹음·대화 캡처 · 제안 테이블 <span class="mono-tag">ProjectFile</span></div>
          <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:10px">
            ${presets.map((pr, i) => `
              <button type="button" class="pw-btn pw-btn-line pw-btn-sm" data-preset="${i}">+ ${D().esc(pr.name)}</button>
            `).join('')}
          </div>
        </div>
        <div>
          <label class="field-label">자료 분류</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px" id="up-cats">
            ${D().FILE_CATEGORIES.filter((c) => c.key !== 'all').map((c) => `
              <button type="button" class="pw-btn pw-btn-sm ${c.key === selectedCat ? 'pw-btn-blue' : 'pw-btn-line'}" data-cat="${c.key}">${c.label}</button>
            `).join('')}
          </div>
        </div>
        <div>
          <label class="field-label" for="up-name">파일명</label>
          <input id="up-name" class="field-input" value="현장_임장메모_사진.jpg" required />
        </div>
        <div>
          <label class="field-label" for="up-caption">한 줄 설명 (검색 · 팀 공유용)</label>
          <input id="up-caption" class="field-input" placeholder="예: 남향 채광 양호, 베란다 샷시 2022년 교체" />
        </div>
      </form>
    `;
    const foot = `
      <button type="button" class="pw-btn pw-btn-line" data-cancel>취소</button>
      <button type="submit" form="pw-upload-form" class="pw-btn pw-btn-blue">${D().icon('upload', 14)} 자료실에 올리기</button>
    `;
    const root = renderModal('프로젝트 자료 올리기', '사진 · 계약서 스캔 · 등기부 · 카톡 캡처 · 녹음', body, foot);
    if (!root) return;
    root.querySelector('[data-cancel]')?.addEventListener('click', closeOverlay);

    const catButtons = root.querySelectorAll('[data-cat]');
    const syncCatButtons = () => {
      catButtons.forEach((btn) => {
        const active = btn.getAttribute('data-cat') === selectedCat;
        btn.className = `pw-btn pw-btn-sm ${active ? 'pw-btn-blue' : 'pw-btn-line'}`;
      });
    };
    catButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedCat = btn.getAttribute('data-cat');
        syncCatButtons();
      });
    });

    root.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pr = presets[Number(btn.getAttribute('data-preset'))];
        root.querySelector('#up-name').value = pr.name;
        root.querySelector('#up-caption').value = pr.caption;
        selectedCat = pr.cat;
        syncCatButtons();
      });
    });

    root.querySelector('#pw-upload-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = root.querySelector('#up-name').value;
      const caption = root.querySelector('#up-caption').value;
      if (!name.trim()) return;
      S().addFile(project.id, { name, category: selectedCat, caption });
      closeOverlay();
      showToast(`"${name.trim()}" 자료를 프로젝트에 올렸습니다.`);
    });
  }

  /* 4. 손님 브리핑 & 공유 링크 빌더 Modal (중개날개 핵심 기능 반영) */
  function openBriefingModal(projectId) {
    let hideUnit = true;
    let excludePrivateMemo = true;
    let briefingTitle = `${S().getProject(projectId)?.primaryContact?.name || '고객'}님 맞춤 후보 브리핑`;

    function draw() {
      const project = S().getProject(projectId);
      const selected = (project.matches || []).filter((m) => m.briefSelected);
      const body = `
        <div class="briefing-split">
          <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
            <div>
              <label class="field-label" for="br-title">공유 페이지 제목</label>
              <input id="br-title" class="field-input" value="${D().esc(briefingTitle)}" />
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:12px;padding:8px 10px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px">
              <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer">
                <input type="checkbox" id="br-hide-unit" ${hideUnit ? 'checked' : ''} />
                <span><strong>호수 숨기기</strong> (예: 112동 1502호 → 112동 중층)</span>
              </label>
              <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer">
                <input type="checkbox" id="br-excl-priv" ${excludePrivateMemo ? 'checked' : ''} />
                <span><strong>내부 메모 제외</strong> (Listing.privateMemo 차단)</span>
              </label>
            </div>
            <div style="font-size:12px;font-weight:700;color:#334155">후보 매물 고르기 &amp; 브리핑 한 줄 설명 (${selected.length}/${project.matches.length})</div>
            <div style="display:flex;flex-direction:column;gap:8px;max-height:330px;overflow-y:auto;padding-right:2px">
              ${project.matches.length === 0 ? `
                <div style="padding:20px;text-align:center;color:#64748b;border:1px dashed #cbd5e1;border-radius:10px">
                  아직 매칭된 후보 매물이 없습니다. 먼저 매물 연결을 진행해 주세요.
                </div>
              ` : project.matches.map((m) => `
                <div class="brief-item-card ${m.briefSelected ? 'selected' : ''}">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;min-width:0;flex:1">
                      <input type="checkbox" data-br-toggle="${m.id}" ${m.briefSelected ? 'checked' : ''} />
                      <strong class="trunc" style="font-size:13px">${D().esc(m.place)}</strong>
                      <span class="pw-badge" data-tone="blue">${D().esc(m.transactionType)} ${D().esc(m.priceLabel)}</span>
                    </label>
                    <span class="pw-badge" data-tone="gray">${D().esc(D().MATCH_STAGE_MAP[m.stage]?.label || m.stage)}</span>
                  </div>
                  <input class="field-input" style="margin-top:7px;padding:6px 8px;font-size:12px"
                    data-br-note="${m.id}"
                    value="${D().esc(m.briefNote || '')}"
                    placeholder="손님께 보여 줄 한 줄 설명 (예: 남향 로열층, 채광 우수)" />
                  ${m.privateMemo ? `<div style="margin-top:4px;font-size:11px;color:#b45309">내부 전용 메모: ${D().esc(m.privateMemo)}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>

          <div>
            <div style="font-size:12px;font-weight:700;color:#334155;margin-bottom:8px">손님 휴대폰 미리보기 (실시간 반영)</div>
            <div class="phone-frame">
              <div class="phone-notch"><span></span></div>
              <div class="phone-screen">
                <div style="background:#ffffff;border-radius:12px;padding:12px;border:1px solid #e2e8f0;margin-bottom:10px">
                  <div style="font-size:10.5px;color:#2563eb;font-weight:700">EstaitFlow 맞춤 브리핑</div>
                  <div style="font-size:14px;font-weight:700;color:#0f172a;margin-top:2px">${D().esc(briefingTitle)}</div>
                  <div style="font-size:11px;color:#64748b;margin-top:3px">담당 ${D().esc(project.assignedTo)} · 후보 ${selected.length}건</div>
                </div>
                ${selected.length === 0 ? `
                  <div style="padding:26px 12px;text-align:center;color:#94a3b8;background:#ffffff;border-radius:12px;border:1px dashed #cbd5e1">
                    왼쪽에서 매물을 선택하면 손님 화면이 여기에 그려집니다.
                  </div>
                ` : selected.map((m, i) => `
                  <div style="background:#ffffff;border-radius:12px;padding:10px;border:1px solid #e2e8f0;margin-bottom:8px">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                      <span style="font-weight:700;font-size:12.5px;color:#0f172a">${i + 1}. ${D().esc(hideUnit ? m.maskedPlace : m.place)}</span>
                      <span style="font-weight:700;font-size:12px;color:#2563eb" class="num">${D().esc(m.priceLabel)}</span>
                    </div>
                    <div style="font-size:11px;color:#64748b;margin-top:3px">${D().esc(m.areaDetail)} · 입주 ${D().esc(m.moveInLabel)}</div>
                    ${m.briefNote ? `<div style="margin-top:6px;padding:6px 8px;border-radius:6px;background:#f8fafc;font-size:11.5px;color:#334155">${D().esc(m.briefNote)}</div>` : ''}
                    ${!excludePrivateMemo && m.privateMemo ? `<div style="margin-top:5px;padding:4px 7px;border-radius:5px;background:#fef2f2;color:#b91c1c;font-size:10.5px">⚠ 내부메모 노출: ${D().esc(m.privateMemo)}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
      const foot = `
        <button type="button" class="pw-btn pw-btn-line" data-cancel>닫기</button>
        <button type="button" class="pw-btn pw-btn-line" id="br-copy-kakao">${D().icon('copy', 14)} 카톡 문구 복사</button>
        <button type="button" class="pw-btn pw-btn-blue" id="br-create-link">${D().icon('share', 14)} 공유 링크 생성 (${selected.length}건)</button>
      `;
      const root = renderModal('손님 맞춤 브리핑 만들기', '중개날개의 "브리핑 비교 + 공유 링크" 패턴 · 제안 테이블 ClientBriefing', body, foot, { wide: true });
      if (!root) return;
      root.querySelector('[data-cancel]')?.addEventListener('click', closeOverlay);
      root.querySelector('#br-title')?.addEventListener('input', (e) => { briefingTitle = e.target.value; });
      root.querySelector('#br-hide-unit')?.addEventListener('change', (e) => { hideUnit = e.target.checked; draw(); });
      root.querySelector('#br-excl-priv')?.addEventListener('change', (e) => { excludePrivateMemo = e.target.checked; draw(); });
      root.querySelectorAll('[data-br-toggle]').forEach((cb) => {
        cb.addEventListener('change', () => {
          S().toggleBriefSelect(projectId, cb.getAttribute('data-br-toggle'));
          draw();
        });
      });
      root.querySelectorAll('[data-br-note]').forEach((inp) => {
        inp.addEventListener('change', () => {
          S().updateBriefNote(projectId, inp.getAttribute('data-br-note'), inp.value);
          draw();
        });
      });
      root.querySelector('#br-copy-kakao')?.addEventListener('click', () => {
        const text = S().computeBriefingCopyText(S().getProject(projectId), { hideUnit, excludePrivateMemo });
        navigator.clipboard?.writeText(text).catch(() => {});
        showToast('카카오톡 브리핑 문구를 복사했습니다.');
      });
      root.querySelector('#br-create-link')?.addEventListener('click', () => {
        if (selected.length === 0) {
          showToast('최소 1개 이상의 매물을 선택하세요.');
          return;
        }
        const br = S().saveBriefingLink(projectId, { title: briefingTitle, hideUnit });
        navigator.clipboard?.writeText(br.url).catch(() => {});
        closeOverlay();
        showToast(`공유 링크 생성 & 복사 완료: ${br.url}`);
      });
    }
    draw();
  }

  /* 5. 자료 미리보기 Lightbox */
  function openFilePreviewModal(file) {
    if (!file) return;
    const body = `
      <div style="display:grid;gap:14px">
        <div style="height:260px;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;background:#f8fafc">
          ${D().svgPreview(file.previewKind, file.name)}
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;font-size:12.5px">
          <div><span style="color:#64748b">분류:</span> <strong>${D().esc(file.category)}</strong></div>
          <div><span style="color:#64748b">원천 테이블:</span> <span class="mono-tag">${D().esc(file.sourceTable)}</span></div>
          <div><span style="color:#64748b">올린 직원:</span> ${D().esc(file.uploader)}</div>
          <div><span style="color:#64748b">크기 · 등록일:</span> ${D().esc(file.size)} · ${D().esc(file.createdAt)}</div>
        </div>
        <div style="padding:10px 12px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;font-weight:700;color:#475569;margin-bottom:4px">설명</div>
          <div style="font-size:13px;color:#0f172a">${D().esc(file.caption)}</div>
        </div>
        ${file.ocrText ? `
          <div style="padding:10px 12px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a">
            <div style="font-size:11.5px;font-weight:700;color:#92400e;margin-bottom:4px">추출 텍스트 (OCR 검색 인덱스 예시)</div>
            <div style="font-size:12px;color:#78350f">${D().esc(file.ocrText)}</div>
          </div>
        ` : ''}
      </div>
    `;
    const foot = `<button type="button" class="pw-btn pw-btn-primary" data-close>확인</button>`;
    const root = renderModal(file.name, '프로젝트 자료 상세 미리보기', body, foot);
    root?.querySelector('[data-close]')?.addEventListener('click', closeOverlay);
  }

  /* 6. 새 프로젝트 열기 Modal */
  function openNewProjectModal() {
    const body = `
      <form id="pw-new-proj-form" class="form-grid">
        <div class="form-row-2">
          <div>
            <label class="field-label" for="np-name">대표 고객 이름</label>
            <input id="np-name" class="field-input" placeholder="예: 정유진" required />
          </div>
          <div>
            <label class="field-label" for="np-phone">연락처</label>
            <input id="np-phone" class="field-input" placeholder="010-1234-5678" />
          </div>
        </div>
        <div>
          <label class="field-label" for="np-title">프로젝트 제목 (비워 두면 고객명으로 자동 표기)</label>
          <input id="np-title" class="field-input" placeholder="예: 반포 자이 매도 후 신반포 갈아타기" />
        </div>
        <div>
          <label class="field-label" for="np-memo">한두 줄 요약 메모</label>
          <textarea id="np-memo" class="field-textarea" placeholder="상담 시작 배경, 핵심 일정, 특이사항"></textarea>
        </div>
      </form>
    `;
    const foot = `
      <button type="button" class="pw-btn pw-btn-line" data-cancel>취소</button>
      <button type="submit" form="pw-new-proj-form" class="pw-btn pw-btn-blue">${D().icon('plus', 14)} 새 프로젝트 열기</button>
    `;
    const root = renderModal('새 프로젝트 열기', '빈 작업 공간을 먼저 열고 상담하면서 의뢰·자료를 채웁니다', body, foot);
    if (!root) return;
    root.querySelector('[data-cancel]')?.addEventListener('click', closeOverlay);
    root.querySelector('#np-name')?.focus();
    root.querySelector('#pw-new-proj-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const contactName = root.querySelector('#np-name').value;
      const phone = root.querySelector('#np-phone').value;
      const title = root.querySelector('#np-title').value;
      const memo = root.querySelector('#np-memo').value;
      if (!contactName.trim()) return;
      const proj = S().createProject({ contactName, phone, title, memo });
      closeOverlay();
      showToast(`"${proj.title}" 프로젝트를 열었습니다.`);
    });
  }

  /* 7. 빠른 상담 / 팀 코멘트 작성 Modal */
  function openQuickConsultModal(projectId, defaultKind = 'consult') {
    let kind = defaultKind;
    function draw() {
      const project = S().getProject(projectId);
      const body = `
        <form id="pw-qc-form" class="form-grid">
          <div style="display:flex;gap:6px">
            <button type="button" class="pw-btn pw-btn-sm ${kind === 'consult' ? 'pw-btn-blue' : 'pw-btn-line'}" data-qc-kind="consult">
              고객 상담 적기 (Contact 귀속)
            </button>
            <button type="button" class="pw-btn pw-btn-sm ${kind === 'comment' ? 'pw-btn-blue' : 'pw-btn-line'}" data-qc-kind="comment">
              팀 코멘트 (Project 귀속)
            </button>
          </div>
          ${kind === 'consult' ? `
            <div class="form-row-2">
              <div>
                <label class="field-label" for="qc-type">상담 방식</label>
                <select id="qc-type" class="field-select">
                  ${D().CONSULT_TYPES.map((t) => `<option value="${t.key}">${t.label}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="field-label" for="qc-ctx">연결 맥락</label>
                <input id="qc-ctx" class="field-input" value="${D().esc(project.title)}" />
              </div>
            </div>
          ` : `
            <div>
              <label class="field-label" for="qc-color">포스트잇 색</label>
              <select id="qc-color" class="field-select">
                ${D().COMMENT_COLORS.map((c) => `<option value="${c.key}">${c.label}</option>`).join('')}
              </select>
            </div>
          `}
          <div>
            <label class="field-label" for="qc-body">내용</label>
            <textarea id="qc-body" class="field-textarea" placeholder="${kind === 'consult' ? '손님과 나눈 대화 내용을 적으세요...' : '직원끼리 공유할 진행 메모나 다음 할 일을 적으세요...'}" required></textarea>
          </div>
        </form>
      `;
      const foot = `
        <button type="button" class="pw-btn pw-btn-line" data-cancel>취소</button>
        <button type="submit" form="pw-qc-form" class="pw-btn pw-btn-blue">${kind === 'consult' ? '상담 저장' : '코멘트 저장'}</button>
      `;
      const root = renderModal(kind === 'consult' ? '고객 상담 적기' : '팀 코멘트 적기', `${project.primaryContact?.name || '고객'} · ${project.title}`, body, foot);
      if (!root) return;
      root.querySelector('[data-cancel]')?.addEventListener('click', closeOverlay);
      root.querySelectorAll('[data-qc-kind]').forEach((b) => {
        b.addEventListener('click', () => {
          kind = b.getAttribute('data-qc-kind');
          draw();
        });
      });
      root.querySelector('#qc-body')?.focus();
      root.querySelector('#pw-qc-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = root.querySelector('#qc-body').value;
        if (!text.trim()) return;
        if (kind === 'consult') {
          const type = root.querySelector('#qc-type').value;
          const contextLabel = root.querySelector('#qc-ctx').value;
          S().addConsultation(projectId, { type, content: text, contextLabel });
          showToast('고객 상담(Consultation)을 저장했습니다.');
        } else {
          const color = root.querySelector('#qc-color').value;
          S().addComment(projectId, { body: text, color });
          showToast('팀 코멘트(ProjectComment)를 저장했습니다.');
        }
        closeOverlay();
      });
    }
    draw();
  }

  /* 8. DB 구조 & 중개날개 비교 진단서 Modal */
  function openDbDiagnosisModal() {
    const body = `
      <div class="diag-grid">
        <div class="diag-card keep">
          <div style="font-weight:700;font-size:13px;color:#065f46;margin-bottom:5px">1. 그대로 지킬 구조 (강점)</div>
          <ul style="font-size:12px;color:#064e3b;display:grid;gap:4px">
            <li>• <strong>Contact ≠ Project (1:N)</strong>: 재방문 손님·동시 진행(갈아타기+부모님 전세) 충돌 없음</li>
            <li>• <strong>정형 데이터 정규화</strong>: 매물/희망조건/매칭/거래/정산과 MCP AI 검색이 모두 살아 있음</li>
            <li>• <strong>상담=사람, 코멘트=일</strong> 분리</li>
          </ul>
        </div>
        <div class="diag-card fix">
          <div style="font-weight:700;font-size:13px;color:#92400e;margin-bottom:5px">2. 현재 프로젝트 상세의 문제</div>
          <ul style="font-size:12px;color:#78350f;display:grid;gap:4px">
            <li>• <strong>읽기 전용 집합기</strong>: 상담 쓰기·매물 연결·의뢰 추가를 전부 다른 화면/새 탭으로 밀어냄</li>
            <li>• <strong>모노톤 Notion 문서 UI</strong>: 긴 세로 나열로 매도↔매수·할 일·자료가 한눈에 안 들어옴</li>
            <li>• <strong>Task·통화제안 미노출</strong></li>
          </ul>
        </div>
        <div class="diag-card add">
          <div style="font-weight:700;font-size:13px;color:#1e40af;margin-bottom:5px">3. 마스터 워크스페이스 DB 보강안</div>
          <ul style="font-size:12px;color:#1e3a8a;display:grid;gap:4px">
            <li>• <span class="mono-tag">Task.projectId</span> FK 추가 (업무 직결)</li>
            <li>• <span class="mono-tag">ProjectFile</span> 표 추가 (사진·스캔·OCR)</li>
            <li>• <span class="mono-tag">ClientBriefing</span> (손님 공유 링크)</li>
            <li>• 선택: 프로젝트 불빛 색 <span class="mono-tag">statusLight</span></li>
          </ul>
        </div>
      </div>

      <table class="diag-table">
        <thead>
          <tr>
            <th style="width:150px">업무 영역</th>
            <th>중개날개 손님관리</th>
            <th>EstaitFlow 현재 DB</th>
            <th>이번 데모에서의 워크스페이스 통합</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>사람 · 당사자</strong></td>
            <td>폴더 안 손님 카드 1개 + 공동명의 배열</td>
            <td><span class="mono-tag">Contact</span> + <span class="mono-tag">Project.primaryContactId</span> + 의뢰 당사자</td>
            <td>상단 히어로에 대표 고객 · 공동 당사자 · 원클릭 전화 동시 노출</td>
          </tr>
          <tr>
            <td><strong>매물 · 구매 의뢰</strong></td>
            <td>단순 텍스트 브리핑 + 소유자 역할 연결</td>
            <td><span class="mono-tag">ListingIntake</span> · <span class="mono-tag">BuyerIntake</span> · <span class="mono-tag">Match</span></td>
            <td>새 탭 나가지 않고 인라인 등록 + 매칭 단계 즉시 변경(협상/임장)</td>
          </tr>
          <tr>
            <td><strong>상담 · 통화 · 메모</strong></td>
            <td>포스트잇 배열(색상) + 메모창고 연동</td>
            <td><span class="mono-tag">Consultation</span>(<span class="mono-tag">callRecordingId</span> 포함) + <span class="mono-tag">ProjectComment</span></td>
            <td>통화 녹음·STT 원문·AI 제안을 전화 상담 카드 안에 통합하고 팀 코멘트와 함께 즉시 작성</td>
          </tr>
          <tr>
            <td><strong>할 일 · 통화 AI</strong></td>
            <td>상단 1줄 Enter 입력 + D-day/알림</td>
            <td><span class="mono-tag">Task</span> (projectId 없음) · <span class="mono-tag">CallActionSuggestion</span></td>
            <td><span class="mono-tag">Task.projectId</span> 상시 도크 + 한글 IME 안전 Enter 입력 + 상담 내 AI 제안 1클릭 반영</td>
          </tr>
          <tr>
            <td><strong>자료실 · 브리핑</strong></td>
            <td>분류별 파일 + OCR 검색 + 손님 공유 페이지</td>
            <td><span class="mono-tag">PropertyPhoto</span> · <span class="mono-tag">PublicDocument</span> (프로젝트 파일 없음)</td>
            <td><span class="mono-tag">ProjectFile</span> 통합 갤러리 + 호수 가림 손님 브리핑 미리보기</td>
          </tr>
        </tbody>
      </table>
    `;
    const foot = `<button type="button" class="pw-btn pw-btn-primary" data-close>확인</button>`;
    const root = renderModal('DB 구조 진단 & 중개날개 비교 요약', 'prisma/schema/* + apps/desktop/projects/$id.tsx 실사 기반', body, foot, { wide: true });
    root?.querySelector('[data-close]')?.addEventListener('click', closeOverlay);
  }

  window.PWModals = {
    showToast,
    closeOverlay,
    openNewListingSheet,
    openNewRequirementSheet,
    openUploadFileModal,
    openBriefingModal,
    openFilePreviewModal,
    openNewProjectModal,
    openQuickConsultModal,
    openDbDiagnosisModal,
  };
})();
