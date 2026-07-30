const propertyRows = [
  ["매매", "고덕그라시움", "102", "1804", "115C", 25.4, 7, 2, "2일 전", "가용", 14.8, "14억 8,000만", 0, "-", "9. 1.~9. 30.", "날짜 지정", "데모 물건 4 · 신규 미확인 의뢰", "강동구", "아파트", "광고중", 5.2],
  ["매매", "고덕그라시움", "101", "1001", "154C", 34.3, 4, 1, "오늘", "거래중", 19.5, "19억 5,000만", 0, "-", "협의", "협의", "집주인 오후 통화 선호 · 가격 조정 여지 있음", "강동구", "아파트", "광고중", 7.0],
  ["전세", "고덕아르테온", "306", "1202", "84A", 25.7, 3, 3, "6일 전", "가용", 7.2, "7억 2,000만", 0, "-", "즉시", "즉시", "세입자 거주 중 · 방문 하루 전 연락", "강동구", "아파트", "광고중", 2.5],
  ["월세", "래미안솔베뉴", "109", "703", "59B", 18.1, 5, 0, "오늘", "가용", 1.0, "1억", 180, "180만", "8. 15.", "날짜 지정", "반려동물 협의 · 보증금 조정 가능", "강동구", "아파트", "미등록", 0.4],
  ["매매", "헬리오시티", "512", "2403", "84A", 25.7, 8, 4, "1일 전", "가용", 23.4, "23억 4,000만", 0, "-", "협의", "협의", "남향 로열동 · 공동중개 가능", "송파구", "아파트", "광고중", 9.0],
  ["전세", "파크리오", "203", "1501", "84B", 25.6, 2, 1, "8일 전", "보류", 9.3, "9억 3,000만", 0, "-", "10. 10.", "날짜 지정", "확인 전화 연결 안 됨 · 내일 재통화", "송파구", "아파트", "미등록", 3.2],
  ["월세", "잠실엘스", "118", "902", "59A", 18.0, 6, 2, "3일 전", "거래중", 2.0, "2억", 240, "240만", "즉시", "즉시", "법인 계약 가능 · 주차 1대", "송파구", "아파트", "광고중", 0.8],
  ["매매", "반포자이", "122", "2104", "116A", 35.1, 9, 3, "오늘", "가용", 31.8, "31억 8,000만", 0, "-", "협의", "협의", "급매 아님 · 실입주 목적 고객 우선", "서초구", "아파트", "광고중", 12.0],
  ["전세", "래미안퍼스티지", "108", "601", "84C", 25.5, 5, 2, "1일 전", "가용", 13.0, "13억", 0, "-", "11. 1.", "날짜 지정", "오전 방문 불가 · 내부 상태 양호", "서초구", "아파트", "광고중", 4.5],
  ["월세", "서초푸르지오써밋", "102", "1305", "84A", 25.6, 1, 1, "12일 전", "보류", 3.0, "3억", 360, "360만", "협의", "협의", "해외 체류 소유주 · 문자 먼저", "서초구", "아파트", "미등록", 1.0],
  ["매매", "고덕센트럴아이파크", "204", "802", "84B", 25.6, 4, 2, "4일 전", "가용", 15.9, "15억 9,000만", 0, "-", "12. 1.", "날짜 지정", "수리 완료 · 키 사무실 보관", "강동구", "아파트", "광고중", 5.8],
  ["전세", "올림픽파크포레온", "316", "1702", "59A", 18.1, 7, 4, "오늘", "가용", 6.8, "6억 8,000만", 0, "-", "즉시", "즉시", "신축 첫 입주 · 융자 없음 확인", "강동구", "아파트", "광고중", 0],
  ["월세", "송파시그니처롯데캐슬", "105", "1104", "59B", 18.0, 0, 0, "5일 전", "가용", 1.5, "1억 5,000만", 160, "160만", "9. 20.", "날짜 지정", "보증보험 가능 여부 확인 필요", "송파구", "아파트", "미등록", 0.5],
  ["매매", "래미안원베일리", "117", "2502", "133A", 40.2, 11, 4, "1일 전", "가용", 48.0, "48억", 0, "-", "협의", "협의", "공동중개 전 사전 협의 · 사진 비공개", "서초구", "아파트", "미등록", 18.0],
  ["전세", "아크로리버파크", "104", "1903", "84A", 25.6, 6, 3, "오늘", "거래중", 17.5, "17억 5,000만", 0, "-", "10. 31.", "날짜 지정", "가계약 진행 중 · 대기 고객 2팀", "서초구", "아파트", "광고중", 6.0],
  ["월세", "고덕센트럴푸르지오", "101", "606", "59C", 17.9, 2, 1, "9일 전", "종료", 0.8, "8,000만", 130, "130만", "즉시", "즉시", "계약 완료 · 광고 내림 확인", "강동구", "아파트", "미등록", 0.2],
  ["매매", "잠실리센츠", "213", "1604", "84A", 25.7, 10, 3, "2일 전", "가용", 25.5, "25억 5,000만", 0, "-", "협의", "협의", "학군 문의 많음 · 주말 방문 가능", "송파구", "아파트", "광고중", 8.5],
  ["전세", "디에이치반포라클라스", "111", "1002", "84B", 25.5, 3, 1, "7일 전", "보류", 14.2, "14억 2,000만", 0, "-", "12. 20.", "날짜 지정", "가격 재확인 예정 · 소유주 출장 중", "서초구", "아파트", "미등록", 5.0],
  ["월세", "힐스테이트천호역젠트리스", "A", "1412", "84A", 25.4, 1, 2, "오늘", "가용", 2.5, "2억 5,000만", 290, "290만", "즉시", "즉시", "오피스텔 · 전입 가능 · 세금계산서 불가", "강동구", "오피스텔", "광고중", 1.2],
  ["매매", "송파헬리오오피스텔", "1", "905", "42A", 12.7, 0, 0, "14일 전", "종료", 5.7, "5억 7,000만", 0, "-", "협의", "협의", "소유주 매각 보류 · 재확인 불필요", "송파구", "오피스텔", "미등록", 2.0],
  ["전세", "고덕강일제일풍경채", "704", "2001", "84C", 25.8, 5, 2, "3일 전", "가용", 5.9, "5억 9,000만", 0, "-", "9. 5.", "날짜 지정", "등기 완료 · 입주청소 협의", "강동구", "아파트", "광고중", 0],
  ["매매", "신반포센트럴자이", "105", "1801", "98A", 29.6, 8, 3, "오늘", "가용", 28.7, "28억 7,000만", 0, "-", "협의", "협의", "금일 가격 조정 · 고객 재안내 필요", "서초구", "아파트", "광고중", 10.0],
].map((row, index) => ({
  id: `property-${String(index + 1).padStart(2, "0")}`,
  transaction: row[0],
  site: row[1],
  dong: row[2],
  unit: row[3],
  unitType: row[4],
  area: row[5],
  matchCount: row[6],
  adCount: row[7],
  confirmation: row[8],
  status: row[9],
  priceValue: row[10],
  price: row[11],
  rentValue: row[12],
  rent: row[13],
  moveIn: row[14],
  moveKind: row[15],
  memo: row[16],
  region: row[17],
  category: row[18],
  adState: row[19],
  loan: row[20],
  owner: ["김○희", "이○준", "박○영", "정○수"][index % 4],
  phone: `010-${String(2180 + index * 137).slice(-4)}-${String(4421 + index * 173).slice(-4)}`,
  updatedBy: ["김영", "이수민", "박진호"][index % 3],
}));

const WIDTHS = {
  identity: 462,
  details: 404,
  status: 92,
  price: 128,
  rent: 80,
  move: 108,
  loan: 96,
  memo: 260,
};

const detailColumns = [
  { key: "unitType", label: "타입", width: 72 },
  { key: "area", label: "전용면적", width: 78 },
  { key: "match", label: "매칭", width: 72 },
  { key: "ad", label: "광고", width: 76 },
  { key: "confirmation", label: "확인", width: 106 },
];

const state = {
  transaction: "전체",
  site: "전체",
  dong: "",
  unit: "",
  search: "",
  region: "전체",
  category: "전체",
  status: "전체",
  price: "전체",
  rent: "전체",
  area: "전체",
  move: "전체",
  ad: "전체",
  detailsExpanded: true,
  showLoan: false,
  view: "list",
  expandedRow: null,
  selectedRowId: null,
  selectedMapId: null,
};

const elements = {
  transactionTabs: document.querySelector("#transactionTabs"),
  site: document.querySelector("#siteFilter"),
  dong: document.querySelector("#dongFilter"),
  unit: document.querySelector("#unitFilter"),
  search: document.querySelector("#searchFilter"),
  clearSearch: document.querySelector("#clearSearch"),
  region: document.querySelector("#regionFilter"),
  category: document.querySelector("#typeFilter"),
  status: document.querySelector("#statusFilter"),
  price: document.querySelector("#priceFilter"),
  rent: document.querySelector("#rentFilter"),
  area: document.querySelector("#areaFilter"),
  move: document.querySelector("#moveFilter"),
  ad: document.querySelector("#adFilter"),
  reset: document.querySelector("#resetFiltersButton"),
  listViewButton: document.querySelector("#listViewButton"),
  mapViewButton: document.querySelector("#mapViewButton"),
  listView: document.querySelector("#listView"),
  mapView: document.querySelector("#mapView"),
  tableScroll: document.querySelector("#tableScroll"),
  guide: document.querySelector("#guideTrack"),
  detailToggle: document.querySelector("#detailColumnToggle"),
  colgroup: document.querySelector("#propertyColgroup"),
  head: document.querySelector("#propertyHead"),
  body: document.querySelector("#propertyBody"),
  resultCount: document.querySelector("#resultCount"),
  resultSummary: document.querySelector("#resultSummary"),
  mapPins: document.querySelector("#mapPins"),
  mapResultList: document.querySelector("#mapResultList"),
  mapResultCount: document.querySelector("#mapResultCount"),
  columnMenuButton: document.querySelector("#columnMenuButton"),
  columnMenu: document.querySelector("#columnMenu"),
  loanToggle: document.querySelector("#loanColumnToggle"),
  modal: document.querySelector("#propertyModal"),
  modalScrim: document.querySelector("#modalScrim"),
  closeModal: document.querySelector("#closeModalButton"),
  sheetTitle: document.querySelector("#sheetTitle"),
  sheetContent: document.querySelector("#sheetContent"),
  toast: document.querySelector("#toast"),
};

let toastTimer;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function filteredProperties() {
  const query = state.search.trim().toLocaleLowerCase("ko");
  const dong = state.dong.trim();
  const unit = state.unit.trim();

  return propertyRows.filter((property) => {
    if (state.transaction !== "전체" && property.transaction !== state.transaction) return false;
    if (state.site !== "전체" && property.site !== state.site) return false;
    if (dong && !property.dong.includes(dong)) return false;
    if (unit && !property.unit.includes(unit)) return false;
    if (state.region !== "전체" && property.region !== state.region) return false;
    if (state.category !== "전체" && property.category !== state.category) return false;
    if (state.status !== "전체" && property.status !== state.status) return false;
    if (state.ad !== "전체" && property.adState !== state.ad) return false;

    if (state.price === "10억 미만" && property.priceValue >= 10) return false;
    if (state.price === "10–20억" && (property.priceValue < 10 || property.priceValue >= 20)) return false;
    if (state.price === "20억 이상" && property.priceValue < 20) return false;

    if (state.rent === "있음" && property.rentValue === 0) return false;
    if (state.rent === "200만 미만" && (property.rentValue === 0 || property.rentValue >= 200)) return false;
    if (state.rent === "200만 이상" && property.rentValue < 200) return false;

    if (state.area === "25평 미만" && property.area >= 25) return false;
    if (state.area === "25–35평" && (property.area < 25 || property.area >= 35)) return false;
    if (state.area === "35평 이상" && property.area < 35) return false;

    if (state.move !== "전체" && property.moveKind !== state.move) return false;

    if (query) {
      const haystack = [
        property.site,
        property.dong,
        property.unit,
        property.memo,
        property.owner,
        property.phone,
      ]
        .join(" ")
        .toLocaleLowerCase("ko");
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function transactionClass(transaction) {
  if (transaction === "매매") return "sale";
  if (transaction === "전세") return "jeonse";
  return "rent";
}

function statusClass(status) {
  return {
    가용: "available",
    보류: "hold",
    거래중: "dealing",
    종료: "closed",
  }[status];
}

function confirmationClass(confirmation) {
  if (confirmation === "오늘") return "today";
  if (confirmation.includes("일 전") && Number.parseInt(confirmation, 10) >= 6) return "overdue";
  if (confirmation === "1일 전" || confirmation === "2일 전") return "verified";
  return "";
}

function visibleColumns() {
  const columns = [
    { key: "select", label: "", width: 36, className: "sticky-cell sticky-select" },
    { key: "transaction", label: "거래", width: 62, className: "sticky-cell sticky-deal" },
    { key: "site", label: "단지", width: 180, className: "sticky-cell sticky-site" },
    { key: "dong", label: "동", width: 58, className: "sticky-cell sticky-dong" },
    { key: "unit", label: "호", width: 66, className: "sticky-cell sticky-unit" },
    { key: "action", label: "작업", width: 60, className: "sticky-cell sticky-action" },
  ];

  if (state.detailsExpanded) {
    columns.push(...detailColumns.map((column) => ({ ...column, className: "detail-head" })));
  }

  columns.push(
    { key: "status", label: "매물상태", width: WIDTHS.status },
    { key: "price", label: "가격/보증금", width: WIDTHS.price },
    { key: "rent", label: "월세", width: WIDTHS.rent },
    { key: "move", label: "입주가능일", width: WIDTHS.move },
  );

  if (state.showLoan) {
    columns.push({ key: "loan", label: "융자금", width: WIDTHS.loan });
  }

  columns.push({ key: "memo", label: "의뢰 메모", width: WIDTHS.memo });
  return columns;
}

function tableWidth() {
  return (
    WIDTHS.identity +
    (state.detailsExpanded ? WIDTHS.details : 0) +
    WIDTHS.status +
    WIDTHS.price +
    WIDTHS.rent +
    WIDTHS.move +
    (state.showLoan ? WIDTHS.loan : 0) +
    WIDTHS.memo
  );
}

function renderTableStructure() {
  const columns = visibleColumns();
  const width = tableWidth();
  document.documentElement.style.setProperty("--table-width", `${width}px`);
  elements.guide.classList.toggle("collapsed", !state.detailsExpanded);
  elements.detailToggle.textContent = state.detailsExpanded ? "−" : "+";
  elements.detailToggle.setAttribute("aria-expanded", String(state.detailsExpanded));
  elements.detailToggle.setAttribute(
    "aria-label",
    state.detailsExpanded ? "타입–확인 컬럼 접기" : "타입–확인 컬럼 펼치기",
  );
  elements.detailToggle.title = state.detailsExpanded
    ? "타입–확인 컬럼 접기"
    : "타입–확인 컬럼 펼치기";

  elements.colgroup.innerHTML = columns
    .map((column) => `<col style="width:${column.width}px" />`)
    .join("");

  elements.head.innerHTML = `
    <tr>
      ${columns
        .map((column) => {
          const content =
            column.key === "select"
              ? '<input id="selectAllRows" type="checkbox" aria-label="전체 매물 선택" />'
              : escapeHtml(column.label);
          return `<th scope="col" class="${column.className ?? ""}">${content}</th>`;
        })
        .join("")}
    </tr>
  `;

  document.querySelector("#selectAllRows")?.addEventListener("change", (event) => {
    document.querySelectorAll(".row-checkbox").forEach((checkbox) => {
      checkbox.checked = event.target.checked;
    });
  });

  renderTableBody();
}

function renderTableBody() {
  const rows = filteredProperties();
  const columnCount = visibleColumns().length;

  if (rows.length === 0) {
    elements.body.innerHTML = `
      <tr>
        <td colspan="${columnCount}" class="empty-state">
          조건에 맞는 매물이 없습니다. 필터를 줄이거나 초기화해 보세요.
        </td>
      </tr>
    `;
    updateResultMeta(rows);
    return;
  }

  elements.body.innerHTML = rows
    .map((property) => {
      const isExpanded = state.expandedRow?.id === property.id;
      const cells = [
        `<td class="sticky-cell sticky-select"><input class="row-checkbox" type="checkbox" aria-label="${escapeHtml(property.site)} ${escapeHtml(property.unit)}호 선택" /></td>`,
        `<td class="sticky-cell sticky-deal"><span class="deal-label ${transactionClass(property.transaction)}">${property.transaction}</span></td>`,
        `<td class="sticky-cell sticky-site"><span class="site-name">${escapeHtml(property.site)}</span></td>`,
        `<td class="sticky-cell sticky-dong">${escapeHtml(property.dong)}</td>`,
        `<td class="sticky-cell sticky-unit">${escapeHtml(property.unit)}</td>`,
        `<td class="sticky-cell sticky-action"><button class="row-menu" type="button" aria-label="${escapeHtml(property.site)} 작업 메뉴">⋮</button></td>`,
      ];

      if (state.detailsExpanded) {
        cells.push(
          `<td>${escapeHtml(property.unitType)}</td>`,
          `<td>${property.area.toFixed(1)}평</td>`,
          `<td><button class="cell-action match-button ${isExpanded && state.expandedRow.kind === "match" ? "open" : ""}" data-id="${property.id}" type="button" aria-expanded="${isExpanded && state.expandedRow.kind === "match"}">${property.matchCount ? `연결 ${property.matchCount}` : "없음"}</button></td>`,
          `<td><button class="cell-action ad ad-button ${isExpanded && state.expandedRow.kind === "ad" ? "open" : ""}" data-id="${property.id}" type="button" aria-expanded="${isExpanded && state.expandedRow.kind === "ad"}">${property.adCount ? `${property.adCount}곳` : "미등록"}</button></td>`,
          `<td><span class="confirm-state ${confirmationClass(property.confirmation)}">${escapeHtml(property.confirmation)}</span></td>`,
        );
      }

      cells.push(
        `<td><span class="status-pill ${statusClass(property.status)}">${property.status}</span></td>`,
        `<td class="price-cell">${escapeHtml(property.price)}</td>`,
        `<td class="${property.rent === "-" ? "muted-cell" : ""}">${escapeHtml(property.rent)}</td>`,
        `<td>${escapeHtml(property.moveIn)}</td>`,
      );

      if (state.showLoan) {
        cells.push(`<td>${property.loan ? `${property.loan}억` : "없음"}</td>`);
      }

      cells.push(`<td class="memo-cell" title="${escapeHtml(property.memo)}">${escapeHtml(property.memo)}</td>`);

      const dataRow = `
        <tr class="data-row ${state.selectedRowId === property.id ? "selected" : ""}" data-id="${property.id}" tabindex="0">
          ${cells.join("")}
        </tr>
      `;

      if (!isExpanded) return dataRow;

      return `${dataRow}${renderInlinePanel(property, state.expandedRow.kind, columnCount)}`;
    })
    .join("");

  updateResultMeta(rows);
}

function renderInlinePanel(property, kind, columnCount) {
  if (kind === "match") {
    return `
      <tr class="inline-detail-row">
        <td colspan="${columnCount}">
          <div class="inline-panel match-panel">
            <div>
              <span class="inline-kicker">연결된 구매의뢰</span>
              <strong>${property.matchCount ? `${property.matchCount}건 · 우선순위 높은 의뢰 2건` : "연결된 의뢰 없음"}</strong>
              <p>${property.region} · ${property.transaction} · ${property.area.toFixed(1)}평 전후 조건</p>
            </div>
            <div>
              <span class="inline-kicker">최근 매칭 진행</span>
              <div class="pipeline" aria-label="매칭 진행 단계">
                <span class="done">제안</span>
                <span class="done">고객 연락</span>
                <span class="${property.matchCount > 3 ? "done" : ""}">방문</span>
                <span>소유주 연락</span>
                <span>협상</span>
              </div>
            </div>
            <div class="inline-side">
              <span class="inline-kicker">다음 작업</span>
              <strong>${property.matchCount ? "오늘 16:00 고객 재연락" : "조건이 맞는 구매의뢰 찾기"}</strong>
              <p>담당 ${property.updatedBy}</p>
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  return `
    <tr class="inline-detail-row">
      <td colspan="${columnCount}">
        <div class="inline-panel ad-panel">
          <div>
            <span class="inline-kicker">광고 현황</span>
            <strong>${property.adCount ? `${property.adCount}개 채널 게재 중` : "현재 게재 중인 광고 없음"}</strong>
            <p>마지막 동기화 · 오늘 ${10 + (property.adCount % 6)}:${property.adCount ? "24" : "05"}</p>
          </div>
          <div>
            <span class="inline-kicker">채널</span>
            <div class="channel-list">
              ${property.adCount ? '<span class="channel">네이버</span><span class="channel">직방</span>' : '<span class="channel">광고 등록 대기</span>'}
              ${property.adCount > 2 ? '<span class="channel">다방</span><span class="channel">홈페이지</span>' : ""}
            </div>
          </div>
          <div class="inline-side">
            <span class="inline-kicker">검수</span>
            <strong>${property.adCount ? "가격·사진 정상" : "기본정보 확인 필요"}</strong>
            <p>${property.adCount ? "자동 연장 6일 남음" : "등록 전 의뢰 확인 권장"}</p>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function activeFilterLabels() {
  const labels = [];
  if (state.transaction !== "전체") labels.push(state.transaction);
  if (state.site !== "전체") labels.push(state.site);
  if (state.dong) labels.push(`${state.dong}동`);
  if (state.unit) labels.push(`${state.unit}호`);
  if (state.region !== "전체") labels.push(state.region);
  if (state.category !== "전체") labels.push(state.category);
  if (state.status !== "전체") labels.push(state.status);
  if (state.price !== "전체") labels.push(state.price);
  if (state.rent !== "전체") labels.push(state.rent);
  if (state.area !== "전체") labels.push(state.area);
  if (state.move !== "전체") labels.push(state.move);
  if (state.ad !== "전체") labels.push(state.ad);
  if (state.search) labels.push(`“${state.search}”`);
  return labels;
}

function updateResultMeta(rows = filteredProperties()) {
  const labels = activeFilterLabels();
  elements.resultCount.textContent = `${rows.length}건`;
  elements.resultSummary.textContent = labels.length ? labels.join(" · ") : "전체 매물";
  elements.reset.hidden = labels.length === 0;
  elements.clearSearch.hidden = state.search.length === 0;
  elements.mapResultCount.textContent = `${rows.length}건`;

  [
    elements.region,
    elements.category,
    elements.status,
    elements.price,
    elements.rent,
    elements.area,
    elements.move,
    elements.ad,
  ].forEach((select) => {
    select.classList.toggle("is-active", select.value !== "전체");
  });
}

function renderMap() {
  const rows = filteredProperties();
  const positions = [
    [18, 20],
    [38, 30],
    [62, 17],
    [75, 39],
    [27, 58],
    [53, 67],
    [80, 73],
    [12, 79],
    [45, 45],
    [68, 57],
    [34, 13],
    [87, 22],
  ];

  elements.mapPins.innerHTML = rows
    .slice(0, positions.length)
    .map(
      (property, index) => `
        <button
          class="map-pin ${state.selectedMapId === property.id ? "active" : ""}"
          type="button"
          data-map-id="${property.id}"
          style="left:${positions[index][0]}%;top:${positions[index][1]}%"
          aria-label="${escapeHtml(property.site)} ${escapeHtml(property.price)}"
        >${escapeHtml(property.price)}</button>
      `,
    )
    .join("");

  elements.mapResultList.innerHTML = rows
    .map(
      (property) => `
        <button class="map-result-card ${state.selectedMapId === property.id ? "active" : ""}" type="button" data-map-id="${property.id}">
          <span class="map-card-top">
            <span class="deal-label ${transactionClass(property.transaction)}">${property.transaction}</span>
            <strong>${escapeHtml(property.site)}</strong>
            <em>${escapeHtml(property.price)}${property.rent !== "-" ? ` / ${escapeHtml(property.rent)}` : ""}</em>
          </span>
          <span class="map-card-meta">
            <span>${escapeHtml(property.dong)}동 ${escapeHtml(property.unit)}호</span>
            <span>${escapeHtml(property.unitType)} · ${property.area.toFixed(1)}평</span>
            <span>${escapeHtml(property.status)}</span>
          </span>
        </button>
      `,
    )
    .join("");

  updateResultMeta(rows);
}

function renderView() {
  const isList = state.view === "list";
  elements.listView.hidden = !isList;
  elements.mapView.hidden = isList;
  elements.listViewButton.classList.toggle("active", isList);
  elements.mapViewButton.classList.toggle("active", !isList);
  elements.listViewButton.setAttribute("aria-pressed", String(isList));
  elements.mapViewButton.setAttribute("aria-pressed", String(!isList));
  if (!isList) renderMap();
}

function renderAll() {
  renderTableStructure();
  renderView();
}

function openModal(id) {
  const property = propertyRows.find((row) => row.id === id);
  if (!property) return;

  elements.sheetTitle.textContent = `${property.site} ${property.dong}동 ${property.unit}호`;
  elements.sheetContent.innerHTML = `
    <div class="sheet-summary">
      <div>
        <span>거래 조건</span>
        <strong>${property.transaction} ${escapeHtml(property.price)}${property.rent !== "-" ? ` / ${escapeHtml(property.rent)}` : ""}</strong>
      </div>
      <div>
        <span>매물 상태</span>
        <strong><span class="status-pill ${statusClass(property.status)}">${property.status}</span></strong>
      </div>
      <div>
        <span>최근 확인</span>
        <strong>${escapeHtml(property.confirmation)}</strong>
      </div>
    </div>
    <section class="detail-section">
      <h3>기본 정보</h3>
      <dl class="detail-grid">
        <div><dt>단지</dt><dd>${escapeHtml(property.site)}</dd></div>
        <div><dt>동 · 호</dt><dd>${escapeHtml(property.dong)}동 ${escapeHtml(property.unit)}호</dd></div>
        <div><dt>타입 · 면적</dt><dd>${escapeHtml(property.unitType)} · ${property.area.toFixed(1)}평</dd></div>
        <div><dt>입주가능일</dt><dd>${escapeHtml(property.moveIn)}</dd></div>
        <div><dt>연결 매칭</dt><dd>${property.matchCount}건</dd></div>
        <div><dt>광고 채널</dt><dd>${property.adCount}곳</dd></div>
      </dl>
    </section>
    <section class="detail-section">
      <h3>소유주 · 담당</h3>
      <dl class="detail-grid">
        <div><dt>소유주</dt><dd>${escapeHtml(property.owner)}</dd></div>
        <div><dt>연락처</dt><dd>${escapeHtml(property.phone)}</dd></div>
        <div><dt>담당자</dt><dd>${escapeHtml(property.updatedBy)}</dd></div>
      </dl>
    </section>
    <section class="detail-section">
      <h3>의뢰 메모</h3>
      <div class="sheet-note">${escapeHtml(property.memo)}</div>
    </section>
  `;
  elements.modal.hidden = false;
  elements.closeModal.focus();
}

function closeModal() {
  elements.modal.hidden = true;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 1800);
}

function setView(view) {
  state.view = view;
  renderView();
}

function syncStateFromControls() {
  state.site = elements.site.value;
  state.dong = elements.dong.value;
  state.unit = elements.unit.value;
  state.search = elements.search.value;
  state.region = elements.region.value;
  state.category = elements.category.value;
  state.status = elements.status.value;
  state.price = elements.price.value;
  state.rent = elements.rent.value;
  state.area = elements.area.value;
  state.move = elements.move.value;
  state.ad = elements.ad.value;
  state.expandedRow = null;
  renderTableBody();
  if (state.view === "map") renderMap();
}

function resetFilters() {
  state.transaction = "전체";
  state.site = "전체";
  state.dong = "";
  state.unit = "";
  state.search = "";
  state.region = "전체";
  state.category = "전체";
  state.status = "전체";
  state.price = "전체";
  state.rent = "전체";
  state.area = "전체";
  state.move = "전체";
  state.ad = "전체";
  state.expandedRow = null;

  elements.transactionTabs.querySelectorAll("button").forEach((button) => {
    const active = button.dataset.value === "전체";
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  elements.site.value = "전체";
  elements.dong.value = "";
  elements.unit.value = "";
  elements.search.value = "";
  elements.region.value = "전체";
  elements.category.value = "전체";
  elements.status.value = "전체";
  elements.price.value = "전체";
  elements.rent.value = "전체";
  elements.area.value = "전체";
  elements.move.value = "전체";
  elements.ad.value = "전체";
  renderTableBody();
  if (state.view === "map") renderMap();
}

function populateSites() {
  const sites = [...new Set(propertyRows.map((property) => property.site))].sort((a, b) =>
    a.localeCompare(b, "ko"),
  );
  elements.site.insertAdjacentHTML(
    "beforeend",
    sites.map((site) => `<option value="${escapeHtml(site)}">${escapeHtml(site)}</option>`).join(""),
  );
}

elements.transactionTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-value]");
  if (!button) return;
  state.transaction = button.dataset.value;
  state.expandedRow = null;
  elements.transactionTabs.querySelectorAll("button").forEach((tab) => {
    const active = tab === button;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  renderTableBody();
  if (state.view === "map") renderMap();
});

[
  elements.site,
  elements.region,
  elements.category,
  elements.status,
  elements.price,
  elements.rent,
  elements.area,
  elements.move,
  elements.ad,
].forEach((control) => control.addEventListener("change", syncStateFromControls));

[elements.dong, elements.unit, elements.search].forEach((control) =>
  control.addEventListener("input", syncStateFromControls),
);

elements.clearSearch.addEventListener("click", () => {
  elements.search.value = "";
  syncStateFromControls();
  elements.search.focus();
});

elements.reset.addEventListener("click", resetFilters);
elements.listViewButton.addEventListener("click", () => setView("list"));
elements.mapViewButton.addEventListener("click", () => setView("map"));

elements.detailToggle.addEventListener("click", () => {
  const previousScrollLeft = elements.tableScroll.scrollLeft;
  state.detailsExpanded = !state.detailsExpanded;
  state.expandedRow = null;
  renderTableStructure();
  requestAnimationFrame(() => {
    elements.tableScroll.scrollLeft = Math.min(previousScrollLeft, elements.tableScroll.scrollWidth);
  });
});

elements.body.addEventListener("click", (event) => {
  const matchButton = event.target.closest(".match-button");
  const adButton = event.target.closest(".ad-button");
  const menuButton = event.target.closest(".row-menu");
  const row = event.target.closest(".data-row");

  if (matchButton || adButton) {
    const button = matchButton ?? adButton;
    const next = { id: button.dataset.id, kind: matchButton ? "match" : "ad" };
    state.expandedRow =
      state.expandedRow?.id === next.id && state.expandedRow.kind === next.kind ? null : next;
    state.selectedRowId = next.id;
    renderTableBody();
    return;
  }

  if (menuButton) {
    showToast("작업 메뉴: 수정 · 복제 · 상태 변경");
    return;
  }

  if (row && !event.target.matches("input")) {
    state.selectedRowId = row.dataset.id;
    elements.body.querySelectorAll(".data-row").forEach((dataRow) => {
      dataRow.classList.toggle("selected", dataRow.dataset.id === state.selectedRowId);
    });
  }
});

elements.body.addEventListener("dblclick", (event) => {
  if (event.target.closest("button, input")) return;
  const row = event.target.closest(".data-row");
  if (row) openModal(row.dataset.id);
});

elements.body.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const row = event.target.closest(".data-row");
  if (row) openModal(row.dataset.id);
});

elements.mapView.addEventListener("click", (event) => {
  const target = event.target.closest("[data-map-id]");
  if (!target) return;
  state.selectedMapId = target.dataset.mapId;
  renderMap();
});

elements.mapView.addEventListener("dblclick", (event) => {
  const target = event.target.closest("[data-map-id]");
  if (target) openModal(target.dataset.mapId);
});

elements.columnMenuButton.addEventListener("click", () => {
  const willOpen = elements.columnMenu.hidden;
  elements.columnMenu.hidden = !willOpen;
  elements.columnMenuButton.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) {
    const rect = elements.columnMenuButton.getBoundingClientRect();
    elements.columnMenu.style.top = `${rect.bottom + 5}px`;
    elements.columnMenu.style.left = `${Math.max(8, rect.right - 146)}px`;
  }
});

elements.loanToggle.addEventListener("change", () => {
  state.showLoan = elements.loanToggle.checked;
  renderTableStructure();
});

document.addEventListener("click", (event) => {
  if (
    !elements.columnMenu.hidden &&
    !event.target.closest("#columnMenu") &&
    !event.target.closest("#columnMenuButton")
  ) {
    elements.columnMenu.hidden = true;
    elements.columnMenuButton.setAttribute("aria-expanded", "false");
  }
});

elements.modalScrim.addEventListener("click", closeModal);
elements.closeModal.addEventListener("click", closeModal);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.modal.hidden) closeModal();
});

document.querySelector("#newPropertyButton").addEventListener("click", () => {
  showToast("현행 등록 흐름: 새 매물 등록 Sheet 열기");
});

populateSites();
renderAll();
