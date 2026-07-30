const properties = [
  {
    id: "p01",
    transaction: "매매",
    complex: "고덕그라시움",
    region: "강동구",
    ward: "고덕동",
    siteType: "아파트",
    dong: "102",
    unit: "1804",
    type: "115C",
    area: 25.4,
    status: "가용",
    price: 148000,
    rent: 0,
    move: "9. 1.~9. 30.",
    moveKind: "날짜 지정",
    confirmation: "오늘",
    confirmDate: "7. 27.",
    ad: "미등록",
    adChannel: "-",
    match: 0,
    buyer: "",
    matchStage: "",
    owner: "연락처 없음",
    phone: "-",
    lastContact: "7. 25.",
    nextAction: "소유주 연락처 등록",
    memo: "신규 미확인 의뢰 · 남향 · 내부 확인 필요",
  },
  {
    id: "p02",
    transaction: "매매",
    complex: "고덕그라시움",
    region: "강동구",
    ward: "고덕동",
    siteType: "아파트",
    dong: "101",
    unit: "1001",
    type: "154C",
    area: 34.3,
    status: "거래중",
    price: 195000,
    rent: 0,
    move: "즉시",
    moveKind: "즉시",
    confirmation: "오늘",
    confirmDate: "7. 27.",
    ad: "광고중",
    adChannel: "네이버",
    match: 0,
    buyer: "",
    matchStage: "",
    owner: "김미영",
    phone: "010-32••-1184",
    lastContact: "7. 26.",
    nextAction: "계약 일정 확인",
    memo: "소유주 직접 의뢰 · 계약 준비",
  },
  {
    id: "p03",
    transaction: "전세",
    complex: "고덕그라시움",
    region: "강동구",
    ward: "고덕동",
    siteType: "아파트",
    dong: "101",
    unit: "1202",
    type: "172",
    area: 38.6,
    status: "가용",
    price: 115000,
    rent: 0,
    move: "8. 15. 이후",
    moveKind: "날짜 지정",
    confirmation: "오늘",
    confirmDate: "7. 27.",
    ad: "광고중",
    adChannel: "네이버",
    match: 0,
    buyer: "",
    matchStage: "",
    owner: "박선희",
    phone: "010-78••-2201",
    lastContact: "7. 27.",
    nextAction: "전세권 설정 협의",
    memo: "전세권 설정 협의 가능",
  },
  {
    id: "p04",
    transaction: "매매",
    complex: "고덕그라시움",
    region: "강동구",
    ward: "고덕동",
    siteType: "아파트",
    dong: "102",
    unit: "3401",
    type: "243C",
    area: 53.0,
    status: "거래중",
    price: 319000,
    rent: 0,
    move: "확인 필요",
    moveKind: "협의",
    confirmation: "미확인",
    confirmDate: "-",
    ad: "광고중",
    adChannel: "네이버 · 직방",
    match: 1,
    buyer: "최살래",
    matchStage: "거래전환",
    owner: "정호진",
    phone: "010-41••-9032",
    lastContact: "7. 20.",
    nextAction: "구매자 계약조건 재확인",
    memo: "펜트하우스 매매 의뢰 · 협상 진행",
  },
  {
    id: "p05",
    transaction: "매매",
    complex: "고덕그라시움",
    region: "강동구",
    ward: "고덕동",
    siteType: "아파트",
    dong: "101",
    unit: "3404",
    type: "153A",
    area: 34.2,
    status: "가용",
    price: 205576,
    rent: 0,
    move: "즉시",
    moveKind: "즉시",
    confirmation: "미확인",
    confirmDate: "-",
    ad: "미등록",
    adChannel: "-",
    match: 0,
    buyer: "",
    matchStage: "",
    owner: "이원석",
    phone: "010-64••-5331",
    lastContact: "7. 18.",
    nextAction: "오늘 확인 전화",
    memo: "남향 로얄층 · 입주 협의",
  },
  {
    id: "p06",
    transaction: "전세",
    complex: "고덕그라시움",
    region: "강동구",
    ward: "고덕동",
    siteType: "아파트",
    dong: "101",
    unit: "3301",
    type: "154C",
    area: 34.3,
    status: "가용",
    price: 101058,
    rent: 0,
    move: "8. 11. 이후",
    moveKind: "날짜 지정",
    confirmation: "확인 필요",
    confirmDate: "7. 22.",
    ad: "광고중",
    adChannel: "네이버",
    match: 0,
    buyer: "",
    matchStage: "",
    owner: "윤성자",
    phone: "010-51••-0082",
    lastContact: "7. 22.",
    nextAction: "확인 기한 5일 지남",
    memo: "올수리 완료 · 채광 좋음",
  },
  {
    id: "p07",
    transaction: "매매",
    complex: "고덕그라시움",
    region: "강동구",
    ward: "고덕동",
    siteType: "아파트",
    dong: "101",
    unit: "3302",
    type: "172",
    area: 38.6,
    status: "가용",
    price: 218608,
    rent: 0,
    move: "8. 12.~9. 2.",
    moveKind: "날짜 지정",
    confirmation: "확인 필요",
    confirmDate: "7. 15.",
    ad: "미등록",
    adChannel: "-",
    match: 0,
    buyer: "",
    matchStage: "",
    owner: "김남수",
    phone: "010-23••-6700",
    lastContact: "7. 15.",
    nextAction: "가격과 입주일 재확인",
    memo: "한강 조망 · 조용한 동",
  },
  {
    id: "p08",
    transaction: "월세",
    complex: "고덕그라시움",
    region: "강동구",
    ward: "고덕동",
    siteType: "아파트",
    dong: "101",
    unit: "3403",
    type: "155B",
    area: 34.2,
    status: "거래중",
    price: 5000,
    rent: 180,
    move: "확인 필요",
    moveKind: "협의",
    confirmation: "오늘",
    confirmDate: "7. 27.",
    ad: "광고중",
    adChannel: "네이버",
    match: 0,
    buyer: "",
    matchStage: "",
    owner: "최은경",
    phone: "010-91••-2456",
    lastContact: "7. 27.",
    nextAction: "가계약금 입금 확인",
    memo: "보증금 조정 가능 · 즉시입주",
  },
  {
    id: "p09",
    transaction: "월세",
    complex: "고덕그라시움",
    region: "강동구",
    ward: "고덕동",
    siteType: "아파트",
    dong: "102",
    unit: "3404",
    type: "184B",
    area: 40.2,
    status: "거래중",
    price: 20000,
    rent: 259,
    move: "협의",
    moveKind: "협의",
    confirmation: "확인 필요",
    confirmDate: "7. 23.",
    ad: "미등록",
    adChannel: "-",
    match: 0,
    buyer: "",
    matchStage: "",
    owner: "서정훈",
    phone: "010-76••-0013",
    lastContact: "7. 23.",
    nextAction: "임대조건 최종 확인",
    memo: "보증금 조정 가능 · 내부 상태 양호",
  },
  {
    id: "p10",
    transaction: "매매",
    complex: "고덕그라시움",
    region: "강동구",
    ward: "고덕동",
    siteType: "아파트",
    dong: "103",
    unit: "3201",
    type: "243C",
    area: 53.0,
    status: "보류",
    price: 259432,
    rent: 0,
    move: "8. 16.~9. 6.",
    moveKind: "날짜 지정",
    confirmation: "확인 필요",
    confirmDate: "7. 21.",
    ad: "광고중",
    adChannel: "네이버",
    match: 0,
    buyer: "",
    matchStage: "",
    owner: "강민정",
    phone: "010-47••-3108",
    lastContact: "7. 21.",
    nextAction: "보류 사유 종료 여부 확인",
    memo: "학군 선호동 · 내부 상태 양호",
  },
  {
    id: "p11",
    transaction: "전세",
    complex: "강동롯데캐슬퍼스트",
    region: "강동구",
    ward: "암사동",
    siteType: "아파트",
    dong: "115",
    unit: "2102",
    type: "84A",
    area: 25.1,
    status: "가용",
    price: 84000,
    rent: 0,
    move: "즉시",
    moveKind: "즉시",
    confirmation: "오늘",
    confirmDate: "7. 27.",
    ad: "광고중",
    adChannel: "네이버 · 다방",
    match: 2,
    buyer: "김현지 외 1명",
    matchStage: "고객연락",
    owner: "오세진",
    phone: "010-55••-7702",
    lastContact: "7. 26.",
    nextAction: "방문 일정 제안",
    memo: "가전 포함 · 신혼 추천",
  },
  {
    id: "p12",
    transaction: "월세",
    complex: "강동롯데캐슬퍼스트",
    region: "강동구",
    ward: "암사동",
    siteType: "아파트",
    dong: "103",
    unit: "902",
    type: "84B",
    area: 25.5,
    status: "보류",
    price: 10000,
    rent: 210,
    move: "협의",
    moveKind: "협의",
    confirmation: "확인 필요",
    confirmDate: "7. 19.",
    ad: "미등록",
    adChannel: "-",
    match: 0,
    buyer: "",
    matchStage: "",
    owner: "권정희",
    phone: "010-18••-4037",
    lastContact: "7. 19.",
    nextAction: "세입자 만기일 재확인",
    memo: "세입자 만기일 재확인",
  },
  {
    id: "p13",
    transaction: "매매",
    complex: "올림픽파크포레온",
    region: "강동구",
    ward: "둔촌동",
    siteType: "아파트",
    dong: "314",
    unit: "2304",
    type: "84A",
    area: 34.0,
    status: "가용",
    price: 248000,
    rent: 0,
    move: "10. 5. 이후",
    moveKind: "날짜 지정",
    confirmation: "오늘",
    confirmDate: "7. 27.",
    ad: "광고중",
    adChannel: "네이버",
    match: 3,
    buyer: "조현수 외 2명",
    matchStage: "제안",
    owner: "이소영",
    phone: "010-66••-1320",
    lastContact: "7. 27.",
    nextAction: "매칭 후보 우선순위 확인",
    memo: "공원 조망 · 로열동",
  },
  {
    id: "p14",
    transaction: "전세",
    complex: "올림픽파크포레온",
    region: "강동구",
    ward: "둔촌동",
    siteType: "아파트",
    dong: "208",
    unit: "1103",
    type: "59A",
    area: 25.4,
    status: "가용",
    price: 102000,
    rent: 0,
    move: "즉시",
    moveKind: "즉시",
    confirmation: "오늘",
    confirmDate: "7. 27.",
    ad: "미등록",
    adChannel: "-",
    match: 1,
    buyer: "장미선",
    matchStage: "집주인연락",
    owner: "한태수",
    phone: "010-72••-5116",
    lastContact: "7. 27.",
    nextAction: "광고 등록과 집주인 회신",
    memo: "융자 없음 · 빠른 입주",
  },
  {
    id: "p15",
    transaction: "월세",
    complex: "올림픽파크포레온",
    region: "강동구",
    ward: "둔촌동",
    siteType: "아파트",
    dong: "407",
    unit: "701",
    type: "39A",
    area: 18.2,
    status: "가용",
    price: 20000,
    rent: 210,
    move: "협의",
    moveKind: "협의",
    confirmation: "확인 필요",
    confirmDate: "7. 18.",
    ad: "광고중",
    adChannel: "네이버",
    match: 0,
    buyer: "",
    matchStage: "",
    owner: "문정우",
    phone: "010-38••-7941",
    lastContact: "7. 18.",
    nextAction: "반려동물 조건 확인",
    memo: "반려동물 협의 · 주차 편리",
  },
  {
    id: "p16",
    transaction: "매매",
    complex: "파크리오",
    region: "송파구",
    ward: "신천동",
    siteType: "아파트",
    dong: "212",
    unit: "1701",
    type: "84A",
    area: 25.7,
    status: "가용",
    price: 229000,
    rent: 0,
    move: "9. 20. 이후",
    moveKind: "날짜 지정",
    confirmation: "오늘",
    confirmDate: "7. 27.",
    ad: "광고중",
    adChannel: "네이버",
    match: 1,
    buyer: "김도연",
    matchStage: "입장",
    owner: "서명희",
    phone: "010-83••-9005",
    lastContact: "7. 26.",
    nextAction: "방문 후 의견 확인",
    memo: "한강 조망 · 내부 상태 양호",
  },
  {
    id: "p17",
    transaction: "전세",
    complex: "파크리오",
    region: "송파구",
    ward: "신천동",
    siteType: "아파트",
    dong: "108",
    unit: "2603",
    type: "114B",
    area: 34.1,
    status: "종료",
    price: 123000,
    rent: 0,
    move: "즉시",
    moveKind: "즉시",
    confirmation: "미확인",
    confirmDate: "-",
    ad: "미등록",
    adChannel: "-",
    match: 0,
    buyer: "",
    matchStage: "",
    owner: "조수경",
    phone: "010-11••-4258",
    lastContact: "6. 30.",
    nextAction: "종료 기록 보관",
    memo: "종료된 이전 의뢰",
  },
  {
    id: "p18",
    transaction: "매매",
    complex: "헬리오시티",
    region: "송파구",
    ward: "가락동",
    siteType: "아파트",
    dong: "305",
    unit: "2402",
    type: "84C",
    area: 25.5,
    status: "보류",
    price: 235500,
    rent: 0,
    move: "10. 1. 이후",
    moveKind: "날짜 지정",
    confirmation: "오늘",
    confirmDate: "7. 27.",
    ad: "미등록",
    adChannel: "-",
    match: 0,
    buyer: "",
    matchStage: "",
    owner: "김정란",
    phone: "010-34••-6307",
    lastContact: "7. 27.",
    nextAction: "가족 의사결정 대기",
    memo: "가격 조정 후 재노출 예정",
  },
  {
    id: "p19",
    transaction: "매매",
    complex: "래미안원베일리",
    region: "서초구",
    ward: "반포동",
    siteType: "아파트",
    dong: "112",
    unit: "1901",
    type: "84A",
    area: 25.5,
    status: "가용",
    price: 428000,
    rent: 0,
    move: "협의",
    moveKind: "협의",
    confirmation: "확인 필요",
    confirmDate: "7. 17.",
    ad: "광고중",
    adChannel: "네이버",
    match: 2,
    buyer: "배민준 외 1명",
    matchStage: "협상",
    owner: "이병철",
    phone: "010-29••-8154",
    lastContact: "7. 17.",
    nextAction: "매도 희망가 재확인",
    memo: "한강 조망 · 내부 사진 갱신 필요",
  },
  {
    id: "p20",
    transaction: "월세",
    complex: "강동역SK리더스뷰",
    region: "강동구",
    ward: "길동",
    siteType: "오피스텔",
    dong: "1",
    unit: "1507",
    type: "46A",
    area: 13.8,
    status: "가용",
    price: 5000,
    rent: 145,
    move: "즉시",
    moveKind: "즉시",
    confirmation: "오늘",
    confirmDate: "7. 27.",
    ad: "미등록",
    adChannel: "-",
    match: 1,
    buyer: "이진경",
    matchStage: "제안",
    owner: "박유진",
    phone: "010-50••-2340",
    lastContact: "7. 27.",
    nextAction: "광고 등록 후 후보 전달",
    memo: "역세권 · 업무용 가능",
  },
];

const filterDefinitions = [
  ["regionFilter", "region", "지역"],
  ["typeFilter", "siteType", "유형"],
  ["statusFilter", "status", "상태"],
  ["priceFilter", "priceRange", "가격"],
  ["rentFilter", "rentRange", "월세"],
  ["areaFilter", "areaRange", "면적"],
  ["moveFilter", "moveKind", "입주"],
  ["confirmationFilter", "confirmation", "확인"],
  ["adFilter", "ad", "광고"],
  ["matchFilter", "matchRange", "매칭"],
];

const defaultFilters = {
  region: "전체",
  siteType: "전체",
  status: "전체",
  priceRange: "전체",
  rentRange: "전체",
  areaRange: "전체",
  moveKind: "전체",
  confirmation: "전체",
  ad: "전체",
  matchRange: "전체",
};

const workViews = [
  {
    id: "all",
    label: "전체 매물",
    preset: "standard",
    predicate: () => true,
    overrides: {},
  },
  {
    id: "confirmation",
    label: "확인 필요",
    preset: "confirmation",
    predicate: (property) => property.confirmation === "확인 필요" || property.confirmation === "미확인",
    overrides: { confirmation: "확인 필요" },
  },
  {
    id: "hold",
    label: "보류",
    preset: "standard",
    predicate: (property) => property.status === "보류",
    overrides: { status: "보류" },
  },
  {
    id: "no-ad",
    label: "광고 미노출",
    preset: "ads",
    predicate: (property) => property.status === "가용" && property.ad === "미등록",
    overrides: { status: "가용", ad: "미등록" },
  },
  {
    id: "matching",
    label: "매칭 있음",
    preset: "matching",
    predicate: (property) => property.match > 0,
    overrides: { matchRange: "있음" },
  },
];

const state = {
  currentView: "all",
  transaction: "전체",
  site: "전체",
  dong: "",
  unit: "",
  search: "",
  filters: { ...defaultFilters },
  preset: "standard",
  mode: "list",
  selectedId: null,
  inspectorTab: "summary",
};

const columnCatalog = {
  select: {
    label: "",
    width: 36,
    render: (property) =>
      `<input type="checkbox" aria-label="${escapeHtml(property.complex)} ${property.dong}동 ${property.unit}호 선택" />`,
  },
  transaction: {
    label: "거래",
    width: 64,
    render: (property) =>
      `<span class="deal-badge ${getTransactionClass(property.transaction)}">${property.transaction}</span>`,
  },
  complex: {
    label: "단지",
    width: 184,
    render: (property) => `
      <span class="identity-cell">
        <strong>${escapeHtml(property.complex)}</strong>
        <small>${escapeHtml(property.ward)}</small>
      </span>
    `,
  },
  dong: { label: "동", width: 54, render: (property) => property.dong },
  unit: { label: "호", width: 62, render: (property) => property.unit },
  type: { label: "타입", width: 68, render: (property) => property.type },
  status: {
    label: "매물상태",
    width: 86,
    render: (property) =>
      `<span class="status-badge ${getStatusClass(property.status)}">${property.status}</span>`,
  },
  price: {
    label: "가격/보증금",
    width: 116,
    render: (property) => `<span class="price-cell">${formatMoney(property.price)}</span>`,
  },
  rent: {
    label: "월세",
    width: 62,
    render: (property) => (property.rent ? `${property.rent.toLocaleString("ko-KR")}만` : "-"),
  },
  area: { label: "전용", width: 68, render: (property) => `${property.area.toFixed(1)}평` },
  confirmation: {
    label: "확인",
    width: 92,
    render: (property) =>
      `<span class="confirmation-badge ${getConfirmationClass(property.confirmation)}">${property.confirmation}</span>`,
  },
  ad: {
    label: "광고",
    width: 74,
    render: (property) => `
      <button
        class="ad-badge ${property.ad === "광고중" ? "running" : "none"}"
        type="button"
        data-row-action="ads"
        data-id="${property.id}"
      >${property.ad}</button>
    `,
  },
  move: { label: "입주", width: 96, render: (property) => property.move },
  memo: {
    label: "의뢰 메모",
    width: 220,
    render: (property) => `<span class="memo-cell">${escapeHtml(property.memo)}</span>`,
  },
  owner: { label: "소유주", width: 84, render: (property) => escapeHtml(property.owner) },
  phone: { label: "연락처", width: 110, render: (property) => escapeHtml(property.phone) },
  lastContact: { label: "최근 연락", width: 78, render: (property) => property.lastContact },
  nextAction: {
    label: "다음 행동",
    width: 170,
    render: (property) => `<span class="memo-cell">${escapeHtml(property.nextAction)}</span>`,
  },
  adChannel: { label: "광고 채널", width: 112, render: (property) => escapeHtml(property.adChannel) },
  match: {
    label: "매칭",
    width: 62,
    render: (property) => `
      <button class="table-link" type="button" data-row-action="matching" data-id="${property.id}">
        ${property.match ? `${property.match}건` : "-"}
      </button>
    `,
  },
  buyer: { label: "우선 구매자", width: 126, render: (property) => escapeHtml(property.buyer || "-") },
  stage: {
    label: "진행 단계",
    width: 90,
    render: (property) =>
      property.matchStage
        ? `<span class="stage-badge">${escapeHtml(property.matchStage)}</span>`
        : "-",
  },
};

const presets = {
  standard: [
    "select",
    "transaction",
    "complex",
    "dong",
    "unit",
    "status",
    "price",
    "rent",
    "area",
    "confirmation",
    "ad",
    "move",
    "memo",
  ],
  confirmation: [
    "select",
    "transaction",
    "complex",
    "dong",
    "unit",
    "confirmation",
    "owner",
    "phone",
    "lastContact",
    "nextAction",
    "status",
    "memo",
  ],
  ads: [
    "select",
    "transaction",
    "complex",
    "dong",
    "unit",
    "status",
    "price",
    "confirmation",
    "ad",
    "adChannel",
    "nextAction",
    "memo",
  ],
  matching: [
    "select",
    "transaction",
    "complex",
    "dong",
    "unit",
    "area",
    "price",
    "match",
    "buyer",
    "stage",
    "status",
    "memo",
  ],
  all: [
    "select",
    "transaction",
    "complex",
    "dong",
    "unit",
    "type",
    "area",
    "match",
    "ad",
    "confirmation",
    "status",
    "price",
    "rent",
    "move",
    "owner",
    "memo",
  ],
};

const elements = {
  workViews: document.querySelector("#workViews"),
  transactionTabs: document.querySelector("#transactionTabs"),
  siteFilter: document.querySelector("#siteFilter"),
  dongFilter: document.querySelector("#dongFilter"),
  unitFilter: document.querySelector("#unitFilter"),
  searchFilter: document.querySelector("#searchFilter"),
  clearSearchButton: document.querySelector("#clearSearchButton"),
  resultCount: document.querySelector("#resultCount"),
  resultContext: document.querySelector("#resultContext"),
  activeFilterSummary: document.querySelector("#activeFilterSummary"),
  resetFiltersButton: document.querySelector("#resetFiltersButton"),
  columnPreset: document.querySelector("#columnPreset"),
  dataLayout: document.querySelector("#dataLayout"),
  listSurface: document.querySelector("#listSurface"),
  mapSurface: document.querySelector("#mapSurface"),
  mapResultCount: document.querySelector("#mapResultCount"),
  mapMarkers: document.querySelector("#mapMarkers"),
  mapResults: document.querySelector("#mapResults"),
  tableHead: document.querySelector("#tableHead"),
  tableBody: document.querySelector("#tableBody"),
  table: document.querySelector(".property-table"),
  emptyState: document.querySelector("#emptyState"),
  statusText: document.querySelector("#statusText"),
  inspector: document.querySelector("#inspector"),
  inspectorTitle: document.querySelector("#inspectorTitle"),
  inspectorSubtitle: document.querySelector("#inspectorSubtitle"),
  inspectorBadges: document.querySelector("#inspectorBadges"),
  inspectorTabs: document.querySelector("#inspectorTabs"),
  inspectorContent: document.querySelector("#inspectorContent"),
  toast: document.querySelector("#toast"),
};

let toastTimer = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getTransactionClass(transaction) {
  if (transaction === "매매") return "sale";
  if (transaction === "전세") return "jeonse";
  return "monthly";
}

function getStatusClass(status) {
  return {
    가용: "available",
    보류: "hold",
    거래중: "dealing",
    종료: "closed",
  }[status];
}

function getConfirmationClass(confirmation) {
  return {
    오늘: "today",
    "확인 필요": "overdue",
    미확인: "unverified",
  }[confirmation];
}

function formatMoney(value) {
  if (!value) return "-";
  const eok = Math.floor(value / 10000);
  const man = value % 10000;
  if (eok && man) return `${eok.toLocaleString("ko-KR")}억 ${man.toLocaleString("ko-KR")}만`;
  if (eok) return `${eok.toLocaleString("ko-KR")}억`;
  return `${man.toLocaleString("ko-KR")}만`;
}

function resetStateFilters() {
  state.transaction = "전체";
  state.site = "전체";
  state.dong = "";
  state.unit = "";
  state.search = "";
  state.filters = { ...defaultFilters };
}

function syncControlsFromState() {
  elements.siteFilter.value = state.site;
  elements.dongFilter.value = state.dong;
  elements.unitFilter.value = state.unit;
  elements.searchFilter.value = state.search;
  elements.clearSearchButton.hidden = !state.search;
  elements.columnPreset.value = state.preset;

  elements.transactionTabs.querySelectorAll("button").forEach((button) => {
    const active = button.dataset.value === state.transaction;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  filterDefinitions.forEach(([elementId, key]) => {
    document.querySelector(`#${elementId}`).value = state.filters[key];
  });
}

function applyWorkView(viewId) {
  const view = workViews.find((candidate) => candidate.id === viewId);
  if (!view) return;
  resetStateFilters();
  Object.assign(state.filters, view.overrides);
  state.currentView = view.id;
  state.preset = view.preset;
  syncControlsFromState();
  renderAll();
}

function markCustomView() {
  state.currentView = "custom";
}

function matchesPriceRange(property) {
  const range = state.filters.priceRange;
  if (range === "전체") return true;
  if (range === "10억 미만") return property.price < 100000;
  if (range === "10–20억") return property.price >= 100000 && property.price < 200000;
  if (range === "20–30억") return property.price >= 200000 && property.price < 300000;
  return property.price >= 300000;
}

function matchesRentRange(property) {
  const range = state.filters.rentRange;
  if (range === "전체") return true;
  if (range === "있음") return property.rent > 0;
  if (range === "200만 미만") return property.rent > 0 && property.rent < 200;
  return property.rent >= 200;
}

function matchesAreaRange(property) {
  const range = state.filters.areaRange;
  if (range === "전체") return true;
  if (range === "25평 미만") return property.area < 25;
  if (range === "25–35평") return property.area >= 25 && property.area < 35;
  if (range === "35–45평") return property.area >= 35 && property.area < 45;
  return property.area >= 45;
}

function getFilteredProperties() {
  const query = state.search.trim().toLocaleLowerCase("ko-KR");
  return properties.filter((property) => {
    if (state.transaction !== "전체" && property.transaction !== state.transaction) return false;
    if (state.site !== "전체" && property.complex !== state.site) return false;
    if (state.dong && !property.dong.includes(state.dong.trim())) return false;
    if (state.unit && !property.unit.includes(state.unit.trim())) return false;
    if (state.filters.region !== "전체" && property.region !== state.filters.region) return false;
    if (state.filters.siteType !== "전체" && property.siteType !== state.filters.siteType) return false;
    if (state.filters.status !== "전체" && property.status !== state.filters.status) return false;
    if (!matchesPriceRange(property) || !matchesRentRange(property) || !matchesAreaRange(property)) return false;
    if (state.filters.moveKind !== "전체" && property.moveKind !== state.filters.moveKind) return false;
    if (state.filters.confirmation !== "전체") {
      if (
        state.filters.confirmation === "확인 필요" &&
        !["확인 필요", "미확인"].includes(property.confirmation)
      ) {
        return false;
      }
      if (
        state.filters.confirmation !== "확인 필요" &&
        property.confirmation !== state.filters.confirmation
      ) {
        return false;
      }
    }
    if (state.filters.ad !== "전체" && property.ad !== state.filters.ad) return false;
    if (state.filters.matchRange === "있음" && property.match === 0) return false;
    if (state.filters.matchRange === "없음" && property.match > 0) return false;
    if (query) {
      const haystack = [
        property.complex,
        property.region,
        property.ward,
        property.dong,
        property.unit,
        property.owner,
        property.phone,
        property.memo,
      ]
        .join(" ")
        .toLocaleLowerCase("ko-KR");
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function renderWorkViews() {
  elements.workViews.innerHTML = workViews
    .map((view) => {
      const count = properties.filter(view.predicate).length;
      const active = state.currentView === view.id;
      return `
        <button
          class="work-view-button ${active ? "active" : ""}"
          type="button"
          role="tab"
          aria-selected="${active}"
          data-view-id="${view.id}"
        >
          <span>${view.label}</span>
          <span class="work-view-count">${count}</span>
        </button>
      `;
    })
    .join("");
}

function getActiveFilterEntries() {
  const entries = [];
  if (state.transaction !== "전체") entries.push(["거래", state.transaction]);
  if (state.site !== "전체") entries.push(["단지", state.site]);
  if (state.dong) entries.push(["동", state.dong]);
  if (state.unit) entries.push(["호", state.unit]);
  if (state.search) entries.push(["검색", state.search]);
  filterDefinitions.forEach(([, key, label]) => {
    if (state.filters[key] !== "전체") entries.push([label, state.filters[key]]);
  });
  return entries;
}

function renderResultToolbar(filteredProperties) {
  const activeEntries = getActiveFilterEntries();
  const activeView = workViews.find((view) => view.id === state.currentView);
  elements.resultCount.textContent = `${filteredProperties.length.toLocaleString("ko-KR")}건`;
  elements.resultContext.textContent = activeView?.label ?? "사용자 조건";
  elements.activeFilterSummary.innerHTML = activeEntries
    .slice(0, 6)
    .map(
      ([label, value]) =>
        `<span class="filter-summary-chip"><span>${escapeHtml(label)} · ${escapeHtml(value)}</span></span>`,
    )
    .join("");
  elements.resetFiltersButton.hidden = activeEntries.length === 0;
  elements.statusText.textContent = `의뢰 ${filteredProperties.length.toLocaleString("ko-KR")}건 표시 · 전체 ${properties.length.toLocaleString("ko-KR")}건`;

  filterDefinitions.forEach(([elementId, key]) => {
    document
      .querySelector(`#${elementId}`)
      .closest(".filter-control")
      .classList.toggle("active", state.filters[key] !== "전체");
  });
}

function renderTable(filteredProperties) {
  const columnKeys = presets[state.preset];
  const columns = columnKeys.map((key) => [key, columnCatalog[key]]);
  const minWidth = columns.reduce((total, [, column]) => total + column.width, 0);
  elements.table.style.minWidth = `${Math.max(minWidth, 960)}px`;

  elements.tableHead.innerHTML = columns
    .map(
      ([key, column]) =>
        `<th scope="col" data-column="${key}" style="width:${column.width}px">${column.label}</th>`,
    )
    .join("");

  elements.tableBody.innerHTML = filteredProperties
    .map(
      (property) => `
        <tr
          data-id="${property.id}"
          tabindex="0"
          aria-selected="${state.selectedId === property.id}"
          class="${state.selectedId === property.id ? "selected" : ""}"
        >
          ${columns
            .map(
              ([key, column]) =>
                `<td data-column="${key}" style="width:${column.width}px">${column.render(property)}</td>`,
            )
            .join("")}
        </tr>
      `,
    )
    .join("");

  elements.emptyState.hidden = filteredProperties.length > 0;
}

function renderMap(filteredProperties) {
  elements.mapResultCount.textContent = filteredProperties.length.toLocaleString("ko-KR");
  const visibleMarkers = filteredProperties.slice(0, 12);
  elements.mapMarkers.innerHTML = visibleMarkers
    .map((property, index) => {
      const left = 16 + ((index * 23) % 72);
      const top = 22 + ((index * 19) % 62);
      return `
        <button
          class="map-marker ${state.selectedId === property.id ? "selected" : ""}"
          type="button"
          data-map-id="${property.id}"
          style="left:${left}%;top:${top}%"
          title="${escapeHtml(property.complex)} ${property.dong}동 ${property.unit}호"
        >${formatMoney(property.price)}</button>
      `;
    })
    .join("");

  elements.mapResults.innerHTML = filteredProperties
    .map(
      (property) => `
        <button
          class="map-result-button ${state.selectedId === property.id ? "selected" : ""}"
          type="button"
          data-map-id="${property.id}"
        >
          <strong>${escapeHtml(property.complex)} ${property.dong}동 ${property.unit}호</strong>
          <small>${property.transaction} · ${property.area.toFixed(1)}평 · ${property.status}</small>
          <span>${formatMoney(property.price)}</span>
        </button>
      `,
    )
    .join("");
}

function renderViewMode() {
  const listMode = state.mode === "list";
  elements.listSurface.hidden = !listMode;
  elements.mapSurface.hidden = listMode;
  document.querySelector("#listViewButton").classList.toggle("active", listMode);
  document.querySelector("#mapViewButton").classList.toggle("active", !listMode);
  document.querySelector("#listViewButton").setAttribute("aria-pressed", String(listMode));
  document.querySelector("#mapViewButton").setAttribute("aria-pressed", String(!listMode));
}

function openInspector(propertyId, tab = "summary") {
  state.selectedId = propertyId;
  state.inspectorTab = tab;
  renderAll();
}

function closeInspector() {
  state.selectedId = null;
  elements.inspector.hidden = true;
  elements.dataLayout.classList.remove("has-inspector");
  renderAll();
}

function renderInspector() {
  const property = properties.find((candidate) => candidate.id === state.selectedId);
  elements.inspector.hidden = !property;
  elements.dataLayout.classList.toggle("has-inspector", Boolean(property));
  if (!property) return;

  elements.inspectorTitle.textContent = `${property.complex} ${property.dong}동 ${property.unit}호`;
  elements.inspectorSubtitle.textContent = `${property.type}타입 · ${property.area.toFixed(1)}평 · ${property.ward}`;
  elements.inspectorBadges.innerHTML = `
    <span class="deal-badge ${getTransactionClass(property.transaction)}">${property.transaction}</span>
    <span class="status-badge ${getStatusClass(property.status)}">${property.status}</span>
    <span class="confirmation-badge ${getConfirmationClass(property.confirmation)}">${property.confirmation}</span>
  `;

  elements.inspectorTabs.querySelectorAll("button").forEach((button) => {
    const active = button.dataset.tab === state.inspectorTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });

  if (state.inspectorTab === "matching") {
    elements.inspectorContent.innerHTML = renderMatchingPanel(property);
  } else if (state.inspectorTab === "ads") {
    elements.inspectorContent.innerHTML = renderAdPanel(property);
  } else if (state.inspectorTab === "memo") {
    elements.inspectorContent.innerHTML = renderMemoPanel(property);
  } else {
    elements.inspectorContent.innerHTML = renderSummaryPanel(property);
  }
}

function renderSummaryPanel(property) {
  const attentionTitle =
    property.confirmation === "확인 필요"
      ? "확인 기한이 지났습니다"
      : property.confirmation === "미확인"
        ? "최초 확인이 필요합니다"
        : property.owner === "연락처 없음"
          ? "소유주 연락처가 없습니다"
          : property.nextAction;
  return `
    <section class="inspector-section">
      <div class="section-heading">
        <h3>지금 확인할 것</h3>
        <span>${escapeHtml(property.confirmDate)}</span>
      </div>
      <div class="attention-box">
        <strong>${escapeHtml(attentionTitle)}</strong>
        <span>${escapeHtml(property.nextAction)} · 목록을 닫지 않고 바로 후속 작업을 이어갑니다.</span>
      </div>
    </section>

    <section class="inspector-section">
      <div class="section-heading">
        <h3>핵심 정보</h3>
        <span>선택 행 기준</span>
      </div>
      <div class="fact-grid">
        <div class="fact-item"><span>가격/보증금</span><strong>${formatMoney(property.price)}</strong></div>
        <div class="fact-item"><span>월세</span><strong>${property.rent ? `${property.rent}만` : "-"}</strong></div>
        <div class="fact-item"><span>입주</span><strong>${escapeHtml(property.move)}</strong></div>
        <div class="fact-item"><span>소유주</span><strong>${escapeHtml(property.owner)}</strong></div>
        <div class="fact-item"><span>광고</span><strong>${escapeHtml(property.ad)}</strong></div>
        <div class="fact-item"><span>매칭</span><strong>${property.match}건</strong></div>
      </div>
    </section>

    <section class="inspector-section">
      <div class="section-heading">
        <h3>의뢰 메모</h3>
        <span>최근 수정 7. 27.</span>
      </div>
      <div class="memo-block">${escapeHtml(property.memo)}</div>
    </section>
  `;
}

function renderMatchingPanel(property) {
  if (!property.match) {
    return `
      <section class="inspector-section">
        <div class="section-heading"><h3>연관 구매의뢰</h3><span>0건</span></div>
        <div class="empty-panel">
          <strong>연결된 구매의뢰가 없습니다.</strong>
          <p>현재 매물의 거래유형·가격·면적 조건으로 후보를 다시 찾을 수 있습니다.</p>
          <button type="button" data-demo-action="match-search">매칭 후보 찾기</button>
        </div>
      </section>
    `;
  }

  const stages = ["제안", "고객연락", "입장", "집주인연락", "협상", "거래전환"];
  const currentIndex = Math.max(0, stages.indexOf(property.matchStage));
  return `
    <section class="inspector-section">
      <div class="section-heading"><h3>연관 구매의뢰</h3><span>${property.match}건</span></div>
      <div class="record-card">
        <div class="record-card-header">
          <strong>${escapeHtml(property.buyer)}</strong>
          <span>${property.transaction} · 보통</span>
        </div>
        <div class="record-meta">
          <span>예산 ${formatMoney(Math.round(property.price * 1.08))}까지</span>
          <span>선호 ${property.area.toFixed(0)}평 전후</span>
          <span>${escapeHtml(property.region)}</span>
        </div>
        <div class="pipeline">
          ${stages
            .map((stage, index) => {
              const className = index < currentIndex ? "done" : index === currentIndex ? "current" : "";
              return `<span class="${className}">${stage}</span>`;
            })
            .join("")}
        </div>
      </div>
    </section>
    <section class="inspector-section">
      <div class="section-heading"><h3>다음 행동</h3><span>오늘</span></div>
      <div class="memo-block">${escapeHtml(property.nextAction)}</div>
    </section>
  `;
}

function renderAdPanel(property) {
  if (property.ad === "미등록") {
    return `
      <section class="inspector-section">
        <div class="section-heading"><h3>광고 현황</h3><span>0건</span></div>
        <div class="empty-panel">
          <strong>등록된 광고가 없습니다.</strong>
          <p>매물 확인을 마친 뒤 광고 채널을 선택해 노출할 수 있습니다.</p>
          <button type="button" data-demo-action="ad-create">광고 등록</button>
        </div>
      </section>
    `;
  }

  return `
    <section class="inspector-section">
      <div class="section-heading"><h3>광고 현황</h3><span>1건</span></div>
      <div class="record-card">
        <div class="record-card-header">
          <strong>${escapeHtml(property.adChannel)}</strong>
          <span class="ad-badge running">광고중</span>
        </div>
        <div class="record-meta">
          <span>${property.transaction}</span>
          <span>${formatMoney(property.price)}</span>
          <span>등록 7. 25.</span>
        </div>
      </div>
    </section>
    <section class="inspector-section">
      <div class="section-heading"><h3>확인 상태</h3><span>${property.confirmDate}</span></div>
      <div class="memo-block">${escapeHtml(property.nextAction)}</div>
    </section>
  `;
}

function renderMemoPanel(property) {
  return `
    <section class="inspector-section">
      <div class="section-heading"><h3>의뢰 메모</h3><span>행과 즉시 동기화</span></div>
      <div class="memo-editor">
        <textarea id="memoTextarea" aria-label="의뢰 메모">${escapeHtml(property.memo)}</textarea>
        <button type="button" data-demo-action="memo-save" data-id="${property.id}">메모 저장</button>
      </div>
    </section>
    <section class="inspector-section">
      <div class="section-heading"><h3>최근 상담</h3><span>2건</span></div>
      <div class="timeline">
        <div class="timeline-item">
          <div><strong>${escapeHtml(property.lastContact)} 소유주 통화</strong><span>${escapeHtml(property.nextAction)}</span></div>
        </div>
        <div class="timeline-item">
          <div><strong>7. 18. 내부 메모 수정</strong><span>${escapeHtml(property.memo)}</span></div>
        </div>
      </div>
    </section>
  `;
}

function renderAll() {
  const filteredProperties = getFilteredProperties();
  if (state.selectedId && !filteredProperties.some((property) => property.id === state.selectedId)) {
    state.selectedId = null;
  }
  renderWorkViews();
  renderResultToolbar(filteredProperties);
  renderTable(filteredProperties);
  renderMap(filteredProperties);
  renderViewMode();
  renderInspector();
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.requestAnimationFrame(() => elements.toast.classList.add("visible"));
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("visible");
    window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 190);
  }, 2200);
}

function initializeSiteOptions() {
  [...new Set(properties.map((property) => property.complex))]
    .sort((a, b) => a.localeCompare(b, "ko-KR"))
    .forEach((complex) => {
      const option = document.createElement("option");
      option.value = complex;
      option.textContent = complex;
      elements.siteFilter.append(option);
    });
}

function bindEvents() {
  elements.workViews.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view-id]");
    if (button) applyWorkView(button.dataset.viewId);
  });

  elements.transactionTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-value]");
    if (!button) return;
    state.transaction = button.dataset.value;
    markCustomView();
    syncControlsFromState();
    renderAll();
  });

  elements.siteFilter.addEventListener("change", (event) => {
    state.site = event.target.value;
    markCustomView();
    renderAll();
  });

  [
    [elements.dongFilter, "dong"],
    [elements.unitFilter, "unit"],
    [elements.searchFilter, "search"],
  ].forEach(([element, key]) => {
    element.addEventListener("input", (event) => {
      state[key] = event.target.value;
      markCustomView();
      elements.clearSearchButton.hidden = !state.search;
      renderAll();
    });
  });

  elements.clearSearchButton.addEventListener("click", () => {
    state.search = "";
    elements.searchFilter.value = "";
    elements.clearSearchButton.hidden = true;
    markCustomView();
    renderAll();
    elements.searchFilter.focus();
  });

  filterDefinitions.forEach(([elementId, key]) => {
    document.querySelector(`#${elementId}`).addEventListener("change", (event) => {
      state.filters[key] = event.target.value;
      markCustomView();
      renderAll();
    });
  });

  elements.columnPreset.addEventListener("change", (event) => {
    state.preset = event.target.value;
    renderAll();
  });

  elements.resetFiltersButton.addEventListener("click", () => applyWorkView("all"));
  elements.emptyState.querySelector("button").addEventListener("click", () => applyWorkView("all"));

  elements.tableBody.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-row-action]");
    if (actionButton) {
      openInspector(actionButton.dataset.id, actionButton.dataset.rowAction);
      return;
    }
    if (event.target.closest("input")) return;
    const row = event.target.closest("tr[data-id]");
    if (row) openInspector(row.dataset.id, "summary");
  });

  elements.tableBody.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("tr[data-id]");
    if (!row) return;
    event.preventDefault();
    openInspector(row.dataset.id, "summary");
  });

  document.querySelector("#closeInspectorButton").addEventListener("click", closeInspector);

  elements.inspectorTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    state.inspectorTab = button.dataset.tab;
    renderInspector();
  });

  elements.inspectorContent.addEventListener("click", (event) => {
    const action = event.target.closest("[data-demo-action]");
    if (!action) return;
    if (action.dataset.demoAction === "memo-save") {
      const property = properties.find((candidate) => candidate.id === action.dataset.id);
      const textarea = document.querySelector("#memoTextarea");
      if (property && textarea) {
        property.memo = textarea.value.trim() || property.memo;
        renderAll();
        showToast("의뢰 메모를 저장했습니다.");
      }
      return;
    }
    if (action.dataset.demoAction === "match-search") {
      showToast("현재 매물 조건으로 구매의뢰 후보를 찾습니다.");
      return;
    }
    if (action.dataset.demoAction === "ad-create") {
      showToast("광고 등록 작업을 시작합니다.");
    }
  });

  [elements.mapMarkers, elements.mapResults].forEach((container) => {
    container.addEventListener("click", (event) => {
      const target = event.target.closest("[data-map-id]");
      if (target) openInspector(target.dataset.mapId, "summary");
    });
  });

  document.querySelector("#listViewButton").addEventListener("click", () => {
    state.mode = "list";
    renderAll();
  });
  document.querySelector("#mapViewButton").addEventListener("click", () => {
    state.mode = "map";
    renderAll();
  });

  document.querySelector("#newPropertyButton").addEventListener("click", () => {
    showToast("새 매물 등록 화면을 여는 동작입니다.");
  });
  document.querySelector("#addViewButton").addEventListener("click", () => {
    showToast("현재 조건을 개인 또는 사무소 업무 보기로 저장할 수 있습니다.");
  });
  document.querySelector("#consultationButton").addEventListener("click", () => {
    showToast("선택한 매물의 상담 기록을 엽니다.");
  });
  document.querySelector("#fullPageButton").addEventListener("click", () => {
    showToast("선택한 매물의 전체 상세 페이지를 엽니다.");
  });

  document.querySelectorAll(".nav-rail button, .titlebar button").forEach((button) => {
    button.addEventListener("click", () =>
      showToast(`${button.getAttribute("aria-label") || button.textContent.trim()} 동작`),
    );
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.selectedId) closeInspector();
  });
}

initializeSiteOptions();
bindEvents();
syncControlsFromState();
renderAll();
