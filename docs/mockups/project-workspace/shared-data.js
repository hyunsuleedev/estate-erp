/* ==========================================================================
   EstaitFlow — Project Workspace Interactive Demo Data & Reactive Store
   Grounded 1:1 in prisma/schema/*.prisma + CONTEXT.md + 중개날개 참고 조사
   ========================================================================== */
(() => {
  'use strict';

  function esc(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name, size = 14, cls = '') {
    const path = ICONS[name] || ICONS.file;
    return `<svg class="pw-ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  }

  const ICONS = {
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    building: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4M10 10h4M10 14h4M2 22h20"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/>',
    db: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    rotate: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
    sticky: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>',
    tag: '<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>',
    arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    listTodo: '<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8M13 12h8M13 18h8"/>',
    kanban: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
    chevronUp: '<path d="m18 15-6-6-6 6"/>',
  };

  function svgPreview(kind, subtitle) {
    const label = esc(subtitle || '');
    if (kind === 'living' || kind === 'photo') {
      return `<svg viewBox="0 0 320 200" class="pw-thumb-svg" role="img" aria-label="${label}">
        <defs><linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#dbeafe"/><stop offset="100%" stop-color="#eff6ff"/></linearGradient></defs>
        <rect width="320" height="200" fill="#f5f3ee"/>
        <rect x="28" y="20" width="190" height="106" rx="4" fill="url(#skyG)" stroke="#cbd5e1" stroke-width="2"/>
        <line x1="123" y1="20" x2="123" y2="126" stroke="#e2e8f0" stroke-width="2"/>
        <rect x="44" y="76" width="24" height="48" fill="#cbd5e1" opacity="0.6"/>
        <rect x="74" y="64" width="32" height="60" fill="#94a3b8" opacity="0.45"/>
        <rect x="134" y="54" width="36" height="70" fill="#94a3b8" opacity="0.5"/>
        <path d="M0 148 L320 148 L320 200 L0 200 Z" fill="#e7e0d3"/>
        <rect x="42" y="128" width="128" height="36" rx="6" fill="#ffffff" stroke="#d6d0c4" stroke-width="1.5"/>
        <rect x="52" y="118" width="108" height="14" rx="4" fill="#f8fafc" stroke="#d6d0c4" stroke-width="1.2"/>
        <rect x="210" y="138" width="66" height="24" rx="4" fill="#d9c7ad"/>
        <circle cx="268" cy="46" r="14" fill="#fef3c7" stroke="#f59e0b" stroke-width="1.5"/>
        <text x="16" y="186" font-size="11" font-weight="600" fill="#64748b" font-family="sans-serif">${label}</text>
      </svg>`;
    }
    if (kind === 'floorplan') {
      return `<svg viewBox="0 0 320 200" class="pw-thumb-svg" role="img" aria-label="${label}">
        <rect width="320" height="200" fill="#f8fafc"/>
        <rect x="34" y="22" width="252" height="146" fill="#ffffff" stroke="#334155" stroke-width="2.5"/>
        <line x1="120" y1="22" x2="120" y2="108" stroke="#334155" stroke-width="2"/>
        <line x1="34" y1="108" x2="196" y2="108" stroke="#334155" stroke-width="2"/>
        <line x1="196" y1="22" x2="196" y2="168" stroke="#334155" stroke-width="2"/>
        <line x1="196" y1="92" x2="286" y2="92" stroke="#334155" stroke-width="2"/>
        <text x="64" y="68" font-size="11" fill="#475569" font-family="sans-serif">안방</text>
        <text x="144" y="68" font-size="11" fill="#475569" font-family="sans-serif">거실</text>
        <text x="228" y="60" font-size="11" fill="#475569" font-family="sans-serif">침실2</text>
        <text x="228" y="134" font-size="11" fill="#475569" font-family="sans-serif">주방</text>
        <text x="86" y="142" font-size="11" fill="#64748b" font-family="sans-serif">발코니 확장</text>
        <rect x="34" y="174" width="252" height="18" rx="4" fill="#eef2ff"/>
        <text x="160" y="187" font-size="10.5" font-weight="600" text-anchor="middle" fill="#4338ca" font-family="sans-serif">${label}</text>
      </svg>`;
    }
    if (kind === 'document' || kind === 'contract' || kind === 'registry') {
      const accent = kind === 'contract' ? '#2563eb' : '#0f766e';
      const bg = kind === 'contract' ? '#eff6ff' : '#f0fdfa';
      return `<svg viewBox="0 0 320 200" class="pw-thumb-svg" role="img" aria-label="${label}">
        <rect width="320" height="200" fill="${bg}"/>
        <rect x="58" y="16" width="204" height="168" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
        <rect x="74" y="32" width="90" height="10" rx="2" fill="${accent}"/>
        <rect x="74" y="52" width="172" height="6" rx="2" fill="#e2e8f0"/>
        <rect x="74" y="66" width="150" height="6" rx="2" fill="#e2e8f0"/>
        <rect x="74" y="84" width="172" height="44" rx="4" fill="#f8fafc" stroke="#e2e8f0"/>
        <line x1="130" y1="84" x2="130" y2="128" stroke="#e2e8f0"/>
        <line x1="74" y1="106" x2="246" y2="106" stroke="#e2e8f0"/>
        <rect x="74" y="140" width="110" height="6" rx="2" fill="#cbd5e1"/>
        <circle cx="222" cy="154" r="14" fill="none" stroke="#dc2626" stroke-width="2" opacity="0.75"/>
        <text x="222" y="158" font-size="9" font-weight="700" text-anchor="middle" fill="#dc2626" font-family="sans-serif">확인</text>
        <text x="160" y="194" font-size="10.5" font-weight="600" text-anchor="middle" fill="#334155" font-family="sans-serif">${label}</text>
      </svg>`;
    }
    if (kind === 'chat') {
      return `<svg viewBox="0 0 320 200" class="pw-thumb-svg" role="img" aria-label="${label}">
        <rect width="320" height="200" fill="#bacee0"/>
        <rect x="28" y="24" width="164" height="36" rx="10" fill="#ffffff"/>
        <rect x="40" y="36" width="128" height="6" rx="2" fill="#475569"/>
        <rect x="40" y="47" width="84" height="5" rx="2" fill="#94a3b8"/>
        <rect x="128" y="72" width="164" height="40" rx="10" fill="#fee500"/>
        <rect x="142" y="84" width="132" height="6" rx="2" fill="#1e293b"/>
        <rect x="142" y="95" width="96" height="5" rx="2" fill="#475569"/>
        <rect x="28" y="124" width="184" height="36" rx="10" fill="#ffffff"/>
        <rect x="40" y="136" width="150" height="6" rx="2" fill="#475569"/>
        <rect x="40" y="147" width="106" height="5" rx="2" fill="#94a3b8"/>
        <text x="160" y="186" font-size="10.5" font-weight="600" text-anchor="middle" fill="#1e293b" font-family="sans-serif">${label}</text>
      </svg>`;
    }
    return `<svg viewBox="0 0 320 200" class="pw-thumb-svg" role="img" aria-label="${label}">
      <rect width="320" height="200" fill="#1e1b4b"/>
      <g fill="#818cf8">
        <rect x="44" y="82" width="6" height="36" rx="3"/><rect x="58" y="64" width="6" height="72" rx="3"/>
        <rect x="72" y="48" width="6" height="104" rx="3"/><rect x="86" y="70" width="6" height="60" rx="3"/>
        <rect x="100" y="54" width="6" height="92" rx="3"/><rect x="114" y="40" width="6" height="120" rx="3"/>
        <rect x="128" y="76" width="6" height="48" rx="3"/><rect x="142" y="58" width="6" height="84" rx="3"/>
        <rect x="156" y="44" width="6" height="112" rx="3"/><rect x="170" y="66" width="6" height="68" rx="3"/>
        <rect x="184" y="80" width="6" height="40" rx="3"/><rect x="198" y="52" width="6" height="96" rx="3"/>
        <rect x="212" y="68" width="6" height="64" rx="3"/><rect x="226" y="48" width="6" height="104" rx="3"/>
        <rect x="240" y="74" width="6" height="52" rx="3"/><rect x="254" y="84" width="6" height="32" rx="3"/>
        <rect x="268" y="62" width="6" height="76" rx="3"/>
      </g>
      <text x="160" y="182" font-size="11" font-weight="600" text-anchor="middle" fill="#e0e7ff" font-family="sans-serif">${label}</text>
    </svg>`;
  }

  const MATCH_STAGES = [
    { key: 'suggested', label: '내부 후보', tone: 'gray' },
    { key: 'buyerInterested', label: '고객 관심', tone: 'blue' },
    { key: 'viewingConfirmed', label: '임장 조율', tone: 'orange' },
    { key: 'viewing', label: '임장', tone: 'violet' },
    { key: 'buyerReviewing', label: '고객 검토', tone: 'pink' },
    { key: 'negotiating', label: '협상', tone: 'amber' },
    { key: 'dealCreated', label: '거래 전환', tone: 'green' },
    { key: 'closed', label: '종료', tone: 'gray' },
  ];

  const MATCH_STAGE_MAP = Object.fromEntries(MATCH_STAGES.map((s) => [s.key, s]));

  const DEAL_STAGES = [
    { key: 'preparing', label: '계약 준비' },
    { key: 'preContract', label: '가계약' },
    { key: 'contracted', label: '본계약' },
    { key: 'settling', label: '중도금/잔금' },
    { key: 'completed', label: '잔금 완료' },
    { key: 'closed', label: '정산 종료' },
  ];

  const STATUS_LIGHTS = [
    { key: 'consulting', label: '상담 중', color: '#10b981', bg: '#ecfdf5', text: '#047857' },
    { key: 'viewing', label: '임장 중', color: '#3b82f6', bg: '#eff6ff', text: '#1d4ed8' },
    { key: 'contract', label: '계약 진행', color: '#f59e0b', bg: '#fffbeb', text: '#b45309' },
    { key: 'hold', label: '보류', color: '#94a3b8', bg: '#f1f5f9', text: '#475569' },
  ];

  const STATUS_LIGHT_MAP = Object.fromEntries(STATUS_LIGHTS.map((l) => [l.key, l]));

  const FILE_CATEGORIES = [
    { key: 'all', label: '전체' },
    { key: '현장사진', label: '현장사진' },
    { key: '계약관련', label: '계약관련' },
    { key: '등기·대장', label: '등기·대장' },
    { key: '대화캡처', label: '대화캡처' },
    { key: '녹음', label: '녹음' },
  ];

  const CONSULT_TYPES = [
    { key: 'phone', label: '전화' },
    { key: 'visit', label: '방문' },
    { key: 'online', label: '문자·온라인' },
  ];

  const COMMENT_COLORS = [
    { key: 'yellow', label: '노랑', bg: '#fef9c3', border: '#fde047' },
    { key: 'blue', label: '하늘', bg: '#e0f2fe', border: '#7dd3fc' },
    { key: 'mint', label: '민트', bg: '#dcfce7', border: '#86efac' },
    { key: 'neutral', label: '기본', bg: '#ffffff', border: '#e2e8f0' },
  ];

  const FOLDERS = [
    { id: 'f_team_swap', space: '팀 공간', name: '갈아타기 집중관리', color: '#f59e0b' },
    { id: 'f_team_lease', space: '팀 공간', name: '신혼·전세 임차', color: '#3b82f6' },
    { id: 'f_my_new', space: '내 공간', name: '신규 문의 / 초기 상담', color: '#10b981' },
  ];

  const INITIAL_PROJECTS = [
    {
      id: 'p1',
      title: '고덕 → 잠실 갈아타기',
      memo: '고덕아르테온 매도 잔금일(2027.01.20)에 맞춰 잠실엘스·리센츠 33~35평 매수 입주 일정을 맞추는 건. 자금조달계획서와 1주택 일시적 2주택 비과세 요건 체크 필요.',
      statusLight: 'contract',
      folderId: 'f_team_swap',
      assignedTo: '박지훈',
      createdAt: '2026-11-02',
      archivedAt: null,
      primaryContact: {
        id: 'c_han',
        name: '한지우',
        phone: '010-4821-7734',
        tags: ['갈아타기', '학군', 'VIP'],
      },
      people: [
        { contactId: 'c_han', name: '한지우', role: '대표 고객', phone: '010-4821-7734', note: '의사결정 주체 · 오전 통화 선호' },
        { contactId: 'c_choi', name: '최민서', role: '공동명의·배우자', phone: '010-4821-9012', note: '잠실 현장 임장 동행' },
        { contactId: 'c_yoon', name: '윤태호', role: '고덕 매수인', phone: '010-9102-3318', note: '본계약 체결 상대방' },
      ],
      steps: [
        { id: 'st1', order: 1, kind: 'listing_intake', intakeId: 'li_1', title: '고덕아르테온 304동 1802호 매물 의뢰', targetDate: '11.05 (목)', done: true },
        { id: 'st2', order: 1, kind: 'buyer_intake', intakeId: 'bi_1', title: '잠실 33~35평 구매 의뢰', targetDate: '2027.01.25', done: false },
        { id: 'st3', order: 2, kind: 'manual', title: '잠실 후보 2차 재임장 및 학군 동선 확인', targetDate: '내일', done: false },
        { id: 'st4', order: 3, kind: 'manual', title: '갈아타기 대출 실행 및 잔금 일시적 2주택 서류 체크', targetDate: '2027.01.10', done: false },
      ],
      listingIntakes: [
        {
          id: 'li_1',
          propertyId: 'prop_godeok_304',
          place: '고덕아르테온 304동 1802호',
          areaDetail: '114.8㎡ (35평)',
          areaShort: '35평',
          lifecycleStatus: 'open',
          lastCheckResult: '정상 확인',
          lastVerifiedLabel: '어제 확인',
          occupancyStatus: '소유자 거주 (잔금일 명도 합의)',
          viewingMemo: '평일 오후 4시 이후, 주말 사전 예약',
          listings: [
            {
              id: 'l_1',
              transactionType: '매매',
              priceLabel: '19억 8,000만',
              priceManwon: 198000,
              isPaused: false,
              ad: {
                channel: '이실장 · 네이버',
                rank: 2,
                totalCount: 9,
                cheapestLabel: '경쟁 최저 19억 5,000만',
                status: '게재 중',
              },
              matchSummary: '계약 진행 1 · 종료 2',
            },
          ],
          deal: {
            id: 'd_1',
            stage: 'contracted',
            stageLabel: '본계약',
            transactionType: '매매',
            agreedPriceLabel: '19억 5,000만',
            sellerName: '한지우',
            buyerName: '윤태호',
            contractDate: '11.15 (토)',
            balanceDate: '2027.01.20',
            isJointBrokerage: false,
            payments: [
              { id: 'pay1', kind: '계약금', dateLabel: '11.15 (토)', amountLabel: '1억 9,500만', status: 'paid', statusLabel: '입금 완료' },
              { id: 'pay2', kind: '중도금 1차', dateLabel: '12.10 (목)', amountLabel: '5억', status: 'pending', statusLabel: '예정' },
              { id: 'pay3', kind: '잔금', dateLabel: '2027.01.20', amountLabel: '12억 5,500만', status: 'pending', statusLabel: '예정' },
            ],
            commission: {
              clientSide: '매도인(한지우)',
              rate: '0.4%',
              expectedWonLabel: '7,800,000원 (부가세 별도)',
              statusLabel: '청구 예정 (잔금일)',
            },
          },
        },
      ],
      buyerIntakes: [
        {
          id: 'bi_1',
          lifecycleStatus: 'open',
          receivedAt: '11.02 (월)',
          requirements: [
            {
              id: 'req_1',
              priorityRank: 1,
              status: 'active',
              urgency: '급함',
              transactionType: '매매',
              budgetLabel: '22억 ~ 24억 5,000만',
              areaLabel: '33~35평',
              siteTypes: '아파트',
              preferredSites: ['잠실엘스', '잠실리센츠', '잠실트리지움'],
              preferredRegions: ['송파구 잠실동'],
              moveInDate: '2027.01.25',
              memo: '남향 로열층 선호, 초품아 동선 필수, 세대 주차 2대 가능 여부 확인 필요.',
            },
          ],
        },
      ],
      matches: [
        {
          id: 'm_1',
          buyerReqId: 'req_1',
          place: '잠실엘스 112동 1502호',
          maskedPlace: '잠실엘스 112동 중층',
          areaDetail: '84.8㎡ (33평)',
          areaShort: '33평',
          transactionType: '매매',
          priceLabel: '23억 8,000만',
          agreedPriceLabel: '23억 5,000만',
          moveInLabel: '2027.01.24 협의 가능',
          stage: 'negotiating',
          briefSelected: true,
          briefNote: '남향 · 잠일초 도보 2분 · 매도인 23억 5,000만 절충 의사 있음',
          privateMemo: '소유자 해외 체류로 위임장 확인 필요 (손님 공개 시 제외)',
          updatedAt: '오늘 11:20',
        },
        {
          id: 'm_2',
          buyerReqId: 'req_1',
          place: '잠실리센츠 234동 1104호',
          maskedPlace: '잠실리센츠 234동 중층',
          areaDetail: '84.9㎡ (33평)',
          areaShort: '33평',
          transactionType: '매매',
          priceLabel: '24억 2,000만',
          agreedPriceLabel: null,
          moveInLabel: '2027.02.05',
          stage: 'buyerReviewing',
          briefSelected: true,
          briefNote: '올수리 완료 · 한강 일부 조망 · 잔금 2월 초 협의 가능',
          privateMemo: '전세 세입자 퇴거 조건 확인 중',
          updatedAt: '어제 17:40',
        },
        {
          id: 'm_3',
          buyerReqId: 'req_1',
          place: '잠실트리지움 311동 803호',
          maskedPlace: '잠실트리지움 311동 중층',
          areaDetail: '84.8㎡ (33평)',
          areaShort: '33평',
          transactionType: '매매',
          priceLabel: '22억 9,000만',
          agreedPriceLabel: null,
          moveInLabel: '즉시 입주',
          stage: 'viewing',
          briefSelected: true,
          briefNote: '단지 내 최고 가성비 호가 · 시스템에어컨 4대 설치',
          privateMemo: '타 부동산 공동중개 건',
          updatedAt: '어제 14:15',
        },
        {
          id: 'm_4',
          buyerReqId: 'req_1',
          place: '잠실엘스 145동 2101호',
          maskedPlace: '잠실엘스 145동 고층',
          areaDetail: '84.8㎡ (33평)',
          areaShort: '33평',
          transactionType: '매매',
          priceLabel: '24억 5,000만',
          agreedPriceLabel: null,
          moveInLabel: '2027.01.20 이후',
          stage: 'buyerInterested',
          briefSelected: false,
          briefNote: '로열동 고층 · 입주일 정확히 일치',
          privateMemo: '',
          updatedAt: '11.20 (금)',
        },
        {
          id: 'm_5',
          buyerReqId: 'req_1',
          place: '잠실파크리오 208동 902호',
          maskedPlace: '잠실파크리오 208동 중층',
          areaDetail: '84.7㎡ (33평)',
          areaShort: '33평',
          transactionType: '매매',
          priceLabel: '22억 3,000만',
          agreedPriceLabel: null,
          moveInLabel: '협의',
          stage: 'suggested',
          briefSelected: false,
          briefNote: '예산 여유 확보 가능한 대안 단지',
          privateMemo: '',
          updatedAt: '11.18 (수)',
        },
      ],
      consultations: [
        {
          id: 'co_1',
          contactName: '한지우',
          type: 'phone',
          purpose: '조건 협의',
          contextLabel: '잠실엘스 112동 1502호',
          callRecordingId: 'cr_1',
          content: '잠실엘스 1502호 23억 5,000만까지 맞춰지면 바로 가계약 진행하고 싶다고 하심. 내일 오후 2시에 배우자분과 한 번 더 채광 보러 오기로 함.',
          author: '박지훈',
          createdAt: '오늘 11:15',
        },
        {
          id: 'co_2',
          contactName: '윤태호',
          type: 'phone',
          purpose: '거래 진행',
          contextLabel: '고덕아르테온 304동 1802호',
          content: '매수인 윤태호님 중도금 5억 은행 대출 실행일(12.10) 문제없다고 전달받음. 법무사 지정 여부 다음 주 확정.',
          author: '박지훈',
          createdAt: '어제 16:20',
        },
        {
          id: 'co_3',
          contactName: '최민서',
          type: 'visit',
          purpose: '임장 후 상담',
          contextLabel: '잠실 33~35평 구매 의뢰',
          content: '리센츠 1104호 인테리어 상태는 마음에 들지만, 24억 초과분 대출 비율을 세무사·은행과 상의 후 결정하기로 함.',
          author: '박지훈',
          createdAt: '11.19 (목) 15:30',
        },
        {
          id: 'co_4',
          contactName: '한지우',
          type: 'online',
          purpose: '초기 접수',
          contextLabel: '고덕 → 잠실 갈아타기',
          content: '카톡으로 고덕 집 매도 희망가 19억 8,000만 및 잠실 33평대 갈아타기 조건 전달받음. 가족관계등록부 기준 공동명의 확인.',
          author: '이수민',
          createdAt: '11.02 (월) 10:05',
        },
      ],
      comments: [
        {
          id: 'cm_1',
          author: '박지훈',
          body: '잠실엘스 112동 소유자 측 중개사와 23억 5,000만 가계약금 3,000만 조건 사전 조율 중. 위임장 원본 확인 필수!',
          color: 'yellow',
          createdAt: '오늘 11:30',
        },
        {
          id: 'cm_2',
          author: '이수민',
          body: '고덕아르테온 중도금 날(12.10) 오전에 매수인·매도인 계좌 재확인 문자 발송 예약해 둠.',
          color: 'blue',
          createdAt: '어제 18:05',
        },
        {
          id: 'cm_3',
          author: '박지훈',
          body: '일시적 2주택 비과세 처분 기한 및 취득세 중과 배제 여부 세무사 확인 메모 손님께 안내 완료.',
          color: 'mint',
          createdAt: '11.16 (월) 14:10',
        },
      ],
      tasks: [
        { id: 't_1', title: '잠실엘스 1502호 소유자 위임장·인감증명 사본 확인', dueLabel: '오늘 17:00', remindLabel: '16:00 알림', assignee: '박지훈', done: false },
        { id: 't_2', title: '내일 14:00 잠실엘스 1502호 재임장 (한지우·최민서 동행)', dueLabel: '내일 14:00', remindLabel: '내일 13:00', assignee: '박지훈', done: false },
        { id: 't_3', title: '매수인 윤태호님 측 법무사 연락처 수령 및 등기 서류 안내', dueLabel: '11.27 (금)', remindLabel: null, assignee: '이수민', done: false },
        { id: 't_4', title: '고덕아르테온 304동 1802호 본계약서 실거래 신고 접수', dueLabel: '11.16 완료', remindLabel: null, assignee: '박지훈', done: true },
        { id: 't_5', title: '고덕아르테온 등기부등본 말소사항 포함 재발급 확인', dueLabel: '11.14 완료', remindLabel: null, assignee: '이수민', done: true },
      ],
      callRecordings: [
        {
          id: 'cr_1',
          direction: '수신',
          contactName: '한지우',
          duration: '04:32',
          calledAt: '오늘 11:10',
          summary: '잠실엘스 112동 1502호 23억 5,000만 절충 시 가계약 의사 확인 및 내일 오후 2시 재임장 약속.',
          messages: [
            { speaker: '고객', time: '00:18', text: '실장님, 아까 보내주신 잠실엘스 112동 1502호 23억 5,000만원까지 맞춰지면 바로 가계약 넣을 수 있을 것 같아요.' },
            { speaker: '나', time: '00:42', text: '네 대표님, 소유자 측 중개사분과 23억 5,000만 선으로 다시 조율해 보겠습니다. 그 전에 현장을 한 번 더 보시겠어요?' },
            { speaker: '고객', time: '01:24', text: '내일 오후 2시에 와이프랑 엘스 1502호 한 번만 더 들어가 볼 수 있을까요? 그리고 차 두 대 들어가면 관리비 얼마나 더 나오는지 꼭 여쭤봐 주세요.' },
            { speaker: '나', time: '02:05', text: '내일 오후 2시로 재임장 일정 잡아 보고, 주차 2대 등록 요금도 관리사무소에 확인해서 내일 현장에서 바로 말씀드리겠습니다.' },
          ],
          suggestions: [
            {
              id: 'sug_1',
              type: '업무 · 일정',
              title: '내일 14:00 잠실엘스 1502호 재임장 일정 등록',
              evidence: '"내일 오후 2시에 와이프랑 엘스 1502호 한 번만 더 들어가 볼 수 있을까요?"',
              status: 'pending',
              applyKind: 'task',
              applyTaskTitle: '내일 14:00 잠실엘스 1502호 재임장 (통화 제안 반영)',
              applyDue: '내일 14:00',
            },
            {
              id: 'sug_2',
              type: '희망 조건 메모',
              title: '희망 조건 메모에 "지하주차장 2대 무료/유료 요금 확인" 추가',
              evidence: '"차 두 대 들어가면 관리비 얼마나 더 나오는지 꼭 여쭤봐 주세요."',
              status: 'pending',
              applyKind: 'memo',
              applyMemoText: '지하주차장 세대당 2대 등록 비용 추가 확인 요청.',
            },
          ],
        },
      ],
      files: [
        { id: 'fl_1', name: '고덕아르테온_본계약서_서명본.pdf', category: '계약관련', previewKind: 'contract', caption: '매매 19억 5,000만 · 11.15 날인본 (계약금 입금 완료)', size: '2.4 MB', uploader: '박지훈', createdAt: '11.15', sourceTable: 'ProjectFile', ocrText: '매매대금 19억 5,000만 계약금 1억 9,500만 중도금 5억 잔금 2027년 1월 20일 한지우 윤태호' },
        { id: 'fl_2', name: '잠실엘스_112동_1502호_등기부.pdf', category: '등기·대장', previewKind: 'registry', caption: '근저당 채권최고액 3억 6,000만 (잔금 상환 말소 조건)', size: '1.1 MB', uploader: '이수민', createdAt: '어제', sourceTable: 'PublicDocument', ocrText: '갑구 소유자 김성훈 을구 근저당권 설정 채권최고액 3억 6,000만 신한은행 말소 조건' },
        { id: 'fl_3', name: '잠실엘스_거실_채광_현장사진.jpg', category: '현장사진', previewKind: 'living', caption: '남향 정면 동간거리 넓음 · 우드 바닥 상태 양호', size: '3.8 MB', uploader: '박지훈', createdAt: '11.19', sourceTable: 'ProjectFile', ocrText: '남향 거실 채광 시스템에어컨 인테리어' },
        { id: 'fl_4', name: '잠실엘스_84A_확장평면도.png', category: '현장사진', previewKind: 'floorplan', caption: '84㎡ 판상형 맞통풍 · 발코니 확장 완료', size: '890 KB', uploader: '박지훈', createdAt: '11.19', sourceTable: 'PropertyPhoto', ocrText: '전용 84.8 제곱미터 33평 3베이 판상형 확장' },
        { id: 'fl_5', name: '잠실리센츠_올수리_주방거실.jpg', category: '현장사진', previewKind: 'living', caption: '2024년 전체 리모델링 완료 (화이트 톤)', size: '4.1 MB', uploader: '박지훈', createdAt: '11.19', sourceTable: 'ProjectFile', ocrText: '올수리 리모델링 인테리어 한강 조망' },
        { id: 'fl_6', name: '소유자_가격절충_카톡캡처.png', category: '대화캡처', previewKind: 'chat', caption: '잠실엘스 소유자 측 23억 5,000만 구두 절충 회신', size: '420 KB', uploader: '박지훈', createdAt: '오늘', sourceTable: 'ProjectFile', ocrText: '23억 5,000만 가계약금 입금 시 조건 수락 가능' },
        { id: 'fl_7', name: '고덕아르테온_건축물대장.pdf', category: '등기·대장', previewKind: 'registry', caption: '위반건축물 없음 확인 (계약 전 발급)', size: '940 KB', uploader: '이수민', createdAt: '11.14', sourceTable: 'PublicDocument', ocrText: '고덕아르테온 304동 1802호 전용 84.98 위반건축물 없음' },
        { id: 'fl_8', name: '한지우_오전통화_녹음.m4a', category: '녹음', previewKind: 'audio', caption: '04:32 · 엘스 가계약 의사 및 재임장 약속', size: '5.6 MB', uploader: '시스템 STT', createdAt: '오늘', sourceTable: 'CallRecording', ocrText: '가계약 재임장 주차 2대 관리비' },
      ],
      briefings: [
        { id: 'br_1', title: '잠실 매수 후보 1차 비교 브리핑 (3건)', createdAt: '어제 18:30', url: 'https://share.estaitt.com/b/han-jamsil-01', views: 4, hideUnit: true },
      ],
    },

    /* ── Scenario 2: 전세 구매 의뢰 집중 ── */
    {
      id: 'p2',
      title: '고덕그라시움 신혼 전세 구함',
      memo: '12월 말 혼인신고 예정 신혼부부. 전세대출(버팀목/시중은행) 가능 호실 필수, 융자 없는 조건 우선.',
      statusLight: 'viewing',
      folderId: 'f_team_lease',
      assignedTo: '이수민',
      createdAt: '2026-11-16',
      archivedAt: null,
      primaryContact: {
        id: 'c_park',
        name: '박서연',
        phone: '010-3391-5802',
        tags: ['신혼부부', '전세대출', '역세권'],
      },
      people: [
        { contactId: 'c_park', name: '박서연', role: '대표 고객', phone: '010-3391-5802', note: '주 연락 창구 · 저녁 6시 이후 통화' },
        { contactId: 'c_kang', name: '강현우', role: '공동 임차인·예비배우자', phone: '010-7741-2094', note: '전세대출 명의자' },
      ],
      steps: [
        { id: 'st2_1', order: 1, kind: 'buyer_intake', intakeId: 'bi_2', title: '고덕그라시움 · 아르테온 전세 구매 의뢰', targetDate: '12.20 (일)', done: false },
        { id: 'st2_2', order: 2, kind: 'manual', title: '토요일 오전 10:30 후보 3곳 연속 임장', targetDate: '11.28 (토)', done: false },
      ],
      listingIntakes: [],
      buyerIntakes: [
        {
          id: 'bi_2',
          lifecycleStatus: 'open',
          receivedAt: '11.16 (월)',
          requirements: [
            {
              id: 'req_2',
              priorityRank: 1,
              status: 'active',
              urgency: '보통',
              transactionType: '전세',
              budgetLabel: '7억 5,000만 ~ 8억 5,000만',
              areaLabel: '25~34평',
              siteTypes: '아파트',
              preferredSites: ['고덕그라시움', '고덕아르테온', '래미안힐스테이트고덕'],
              preferredRegions: ['강동구 고덕동'],
              moveInDate: '12.22 (화)',
              memo: '전세자금대출 100% 협조 필수, 융자 말소 조건만 검토, 상일동역 도보권 선호.',
            },
          ],
        },
      ],
      matches: [
        {
          id: 'm2_1',
          buyerReqId: 'req_2',
          place: '고덕그라시움 108동 1403호',
          maskedPlace: '고덕그라시움 108동 중층',
          areaDetail: '84.9㎡ (34평)',
          areaShort: '34평',
          transactionType: '전세',
          priceLabel: '8억 3,000만',
          agreedPriceLabel: null,
          moveInLabel: '12.20 이후 즉시',
          stage: 'buyerReviewing',
          briefSelected: true,
          briefNote: '융자 없음 · 전세대출 100% 협조 · 역세권 동',
          privateMemo: '임대인 12.15 잔금 전입조건 확인 완료',
          updatedAt: '오늘 10:00',
        },
        {
          id: 'm2_2',
          buyerReqId: 'req_2',
          place: '고덕아르테온 318동 902호',
          maskedPlace: '고덕아르테온 318동 중층',
          areaDetail: '59.9㎡ (25평)',
          areaShort: '25평',
          transactionType: '전세',
          priceLabel: '7억 6,000만',
          agreedPriceLabel: null,
          moveInLabel: '12.18 협의',
          stage: 'viewingConfirmed',
          briefSelected: true,
          briefNote: '신축급 컨디션 · 공원 뷰 · 시스템에어컨 풀옵션',
          privateMemo: '',
          updatedAt: '어제 15:10',
        },
        {
          id: 'm2_3',
          buyerReqId: 'req_2',
          place: '고덕그라시움 121동 2201호',
          maskedPlace: '고덕그라시움 121동 고층',
          areaDetail: '84.9㎡ (34평)',
          areaShort: '34평',
          transactionType: '전세',
          priceLabel: '8억 5,000만',
          agreedPriceLabel: null,
          moveInLabel: '12.28',
          stage: 'buyerInterested',
          briefSelected: false,
          briefNote: '고층 트인 전망 · 12월 말 입주',
          privateMemo: '',
          updatedAt: '11.20 (금)',
        },
      ],
      consultations: [
        {
          id: 'co2_1',
          contactName: '박서연',
          type: 'phone',
          purpose: '임장 조율',
          contextLabel: '고덕그라시움 108동 1403호',
          callRecordingId: 'cr2_1',
          content: '토요일 오전 10시 30분에 예랑분과 함께 3곳 연속으로 보기로 확정. 보증보험 가입 가능 여부 먼저 체크 부탁하심.',
          author: '이수민',
          createdAt: '오늘 09:50',
        },
        {
          id: 'co2_2',
          contactName: '강현우',
          type: 'online',
          purpose: '서류 확인',
          contextLabel: '전세 구매 의뢰',
          content: '은행 대출 사전 심사서 캡처 보내주심. 한도 최대 5억까지 가능해서 보증금 8.3억 선까지 무리 없음.',
          author: '이수민',
          createdAt: '11.20 (금) 19:20',
        },
      ],
      comments: [
        {
          id: 'cm2_1',
          author: '이수민',
          body: '그라시움 108동 1403호 등기부상 근저당 깨끗하고 보증보험(HUG) 한도 내 금액 확인됨.',
          color: 'mint',
          createdAt: '오늘 10:15',
        },
      ],
      tasks: [
        { id: 't2_1', title: '그라시움 108동·아르테온 318동 집주인 임장 시간 최종 확정', dueLabel: '오늘 18:00', remindLabel: '17:00 알림', assignee: '이수민', done: false },
        { id: 't2_2', title: '임장 비교 브리핑 링크 만들어 카톡 전달', dueLabel: '내일 오전', remindLabel: null, assignee: '이수민', done: false },
        { id: 't2_3', title: '대출 사전심사 기준 매물 리스트업', dueLabel: '11.20 완료', remindLabel: null, assignee: '이수민', done: true },
      ],
      callRecordings: [
        {
          id: 'cr2_1',
          direction: '발신',
          contactName: '박서연',
          duration: '02:48',
          calledAt: '오늘 09:48',
          summary: '토요일 오전 10:30 연속 임장 3곳 확정 및 HUG 전세보증보험 가입 한도 사전 확인 요청.',
          messages: [
            { speaker: '나', time: '00:12', text: '서연님, 토요일 오전 10시 반에 그라시움 108동부터 아르테온까지 세 집 연속으로 보는 일정 가능하실까요?' },
            { speaker: '고객', time: '00:39', text: '네 좋아요! 예랑이랑 같이 갈게요. 혹시 108동 집은 HUG 보증보험 가입되는지 미리 확인해 주실 수 있나요?' },
            { speaker: '나', time: '01:10', text: '등기부 확인하니 융자 0원이라 한도 내 무리 없는데, 공시가 대비 126% 기준 정확히 계산해서 토요일 브리핑 때 보여드릴게요.' },
          ],
          suggestions: [
            {
              id: 'sug2_1',
              type: '업무 · 서류',
              title: '그라시움 108동 1403호 공시가 × 126% HUG 보증한도 계산표 준비',
              evidence: '"혹시 108동 집은 HUG 보증보험 가입되는지 미리 확인해 주실 수 있나요?"',
              status: 'pending',
              applyKind: 'task',
              applyTaskTitle: '그라시움 108동 1403호 HUG 보증한도(126%) 사전 계산 준비',
              applyDue: '금요일까지',
            },
          ],
        },
      ],
      files: [
        { id: 'fl2_1', name: '그라시움_108동_등기부열람.pdf', category: '등기·대장', previewKind: 'registry', caption: '융자 0원 · 소유권 단독명의 확인', size: '860 KB', uploader: '이수민', createdAt: '오늘', sourceTable: 'PublicDocument', ocrText: '갑구 소유자 정미경 을구 기록사항 없음 근저당 없음' },
        { id: 'fl2_2', name: '그라시움_84타입_내부사진.jpg', category: '현장사진', previewKind: 'living', caption: '남동향 고층 거실 채광 사진', size: '3.2 MB', uploader: '이수민', createdAt: '어제', sourceTable: 'PropertyPhoto', ocrText: '그라시움 84 거실 채광' },
        { id: 'fl2_3', name: '예비신랑_대출심사_카톡.png', category: '대화캡처', previewKind: 'chat', caption: '은행 사전한도 5억 승인 화면 캡처', size: '310 KB', uploader: '이수민', createdAt: '11.20', sourceTable: 'ProjectFile', ocrText: '전세자금대출 한도 5억 사전승인' },
      ],
      briefings: [],
    },

    /* ── Scenario 3: 신규 첫 방문 상담 (빈 의뢰 상태 체험) ── */
    {
      id: 'p3',
      title: '김도현님 신규 상담',
      memo: '지인 소개로 오늘 오후 첫 방문 상담. 상일동·고덕역 인근 꼬마빌딩 또는 상가주택 매수/임대 수익형 검토 시작.',
      statusLight: 'consulting',
      folderId: 'f_my_new',
      assignedTo: '박지훈',
      createdAt: '오늘',
      archivedAt: null,
      primaryContact: {
        id: 'c_kim',
        name: '김도현',
        phone: '010-6510-8842',
        tags: ['수익형', '신규문의'],
      },
      people: [
        { contactId: 'c_kim', name: '김도현', role: '대표 고객', phone: '010-6510-8842', note: '첫 방문 상담 · 수익률 4% 이상 희망' },
      ],
      steps: [],
      listingIntakes: [],
      buyerIntakes: [],
      matches: [],
      consultations: [
        {
          id: 'co3_1',
          contactName: '김도현',
          type: 'visit',
          purpose: '최초 방문 상담',
          contextLabel: '초기 니즈 파악',
          content: '현금 가용 약 15억 + 대출 활용해 30억 내외 강동구 상가주택/꼬마빌딩 검토 중. 보유 중인 둔촌동 빌라(시세 6억) 처분 여부도 같이 고민 중이라 내일 등기 자료 보내주기로 함.',
          author: '박지훈',
          createdAt: '오늘 14:20',
        },
      ],
      comments: [
        {
          id: 'cm3_1',
          author: '박지훈',
          body: '둔촌동 빌라 자료 받으면 매물 의뢰와 상가주택 구매 의뢰를 이 프로젝트에 함께 담을 예정.',
          color: 'neutral',
          createdAt: '오늘 14:35',
        },
      ],
      tasks: [
        { id: 't3_1', title: '김도현님 둔촌동 빌라 주소·등기 확인 후 매물 의뢰 등록', dueLabel: '내일 오전', remindLabel: '내일 10:00', assignee: '박지훈', done: false },
      ],
      callRecordings: [],
      files: [
        { id: 'fl3_1', name: '강동구_수익형_검토메모.png', category: '대화캡처', previewKind: 'floorplan', caption: '방문 상담 시 검토한 고덕·상일 상권 메모', size: '540 KB', uploader: '박지훈', createdAt: '오늘', sourceTable: 'ProjectFile', ocrText: '상일동 고덕역 상가주택 수익률 4%' },
      ],
      briefings: [],
    },
  ];

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  let seq = 100;
  function nextId(prefix) {
    seq += 1;
    return `${prefix}_${seq}`;
  }

  const initialHash = (window.location.hash || '').replace('#', '');
  const validAngles = ['hybrid', 'cockpit', 'desk', 'pipeline', 'bento'];

  const state = {
    angle: validAngles.includes(initialHash) ? initialHash : 'hybrid',
    selectedProjectId: 'p1',
    projects: deepClone(INITIAL_PROJECTS),
    // UI sub-states per angle
    ui: {
      hybridTab: 'overview',       // overview | matches | files | deal
      hybridFeedFilter: 'all',     // all | consult | comment
      hybridSearch: '',
      hybridShowDoneTasks: false,
      hybridFileCat: 'all',
      hybridFileSearch: '',
      cockpitTab: 'overview',      // overview | matches | files | deal
      cockpitStreamTab: 'all',     // all | consult | comment | tasks
      cockpitFileCat: 'all',
      cockpitFileSearch: '',
      deskNoteFilter: 'all',       // all | consult | comment
      deskFileCat: 'all',
      deskSearch: '',
      deskShowCompletedTasks: false,
      pipelineBoardMode: 'kanban', // kanban | compare | listing
      pipelineInspectorTab: 'timeline', // timeline | files | tasks | detail
      pipelineSelectedMatchId: 'm_1',
      selectedFileId: null,
    },
  };

  const listeners = new Set();

  function emit() {
    for (const fn of listeners) fn(state);
  }

  function getProject(projectId) {
    return state.projects.find((p) => p.id === (projectId || state.selectedProjectId)) || state.projects[0];
  }

  function computeProjectProgress(project) {
    const steps = project.steps || [];
    if (project.archivedAt) return { key: 'archived', label: '종료', done: steps.length, total: steps.length };
    if (steps.length === 0) return { key: 'preparing', label: '준비', done: 0, total: 0 };
    const done = steps.filter((s) => s.done).length;
    if (done >= steps.length) return { key: 'wrapping', label: '마무리', done, total: steps.length };
    return { key: 'active', label: '진행 중', done, total: steps.length };
  }

  function computeBriefingCopyText(project, options = {}) {
    const { hideUnit = true, excludePrivateMemo = true } = options;
    const selected = (project.matches || []).filter((m) => m.briefSelected);
    if (selected.length === 0) {
      return '선택된 후보 매물이 없습니다. 체크박스로 손님께 보낼 매물을 1개 이상 골라 주세요.';
    }
    const lines = [
      `[${project.primaryContact?.name || '고객'}님 맞춤 매물 브리핑]`,
      `담당: ${project.assignedTo || '에스테잇플로우 중개사무소'}`,
      '',
    ];
    selected.forEach((m, idx) => {
      const place = hideUnit ? m.maskedPlace : m.place;
      lines.push(`${idx + 1}. ${place} (${m.areaShort}) · ${m.transactionType} ${m.priceLabel}`);
      if (m.agreedPriceLabel) lines.push(`   - 협의 가능가: ${m.agreedPriceLabel}`);
      if (m.moveInLabel) lines.push(`   - 입주: ${m.moveInLabel}`);
      if (m.briefNote) lines.push(`   - 특징: ${m.briefNote}`);
      if (!excludePrivateMemo && m.privateMemo) lines.push(`   - 참고: ${m.privateMemo}`);
      lines.push('');
    });
    lines.push('자세한 현장 사진과 일정 조율은 답장 주시면 바로 안내드리겠습니다.');
    return lines.join('\n');
  }

  const PWStore = {
    getState: () => state,
    getCurrentProject: () => getProject(state.selectedProjectId),
    getProject,
    computeProjectProgress,
    computeBriefingCopyText,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setAngle(angle) {
      if (!validAngles.includes(angle) || state.angle === angle) return;
      state.angle = angle;
      if (window.location.hash !== `#${angle}`) {
        history.replaceState(null, '', `#${angle}`);
      }
      emit();
    },
    selectProject(projectId) {
      const found = state.projects.find((p) => p.id === projectId);
      if (!found) return;
      state.selectedProjectId = found.id;
      state.ui.hybridTab = 'overview';
      state.ui.cockpitTab = 'overview';
      state.ui.pipelineSelectedMatchId = found.matches[0]?.id || null;
      if (state.ui.pipelineInspectorTab === 'detail' && !found.matches[0]) {
        state.ui.pipelineInspectorTab = 'timeline';
      }
      emit();
    },
    setUi(patch) {
      Object.assign(state.ui, patch);
      emit();
    },
    updateProject(projectId, patch) {
      const p = getProject(projectId);
      if (!p) return;
      Object.assign(p, patch);
      emit();
    },
    createProject({ title, contactName, phone, memo, statusLight }) {
      const id = nextId('proj');
      const contactId = nextId('c');
      const name = (contactName || '').trim() || '신규 고객';
      const newProject = {
        id,
        title: (title || '').trim() || `${name}님 프로젝트`,
        memo: (memo || '').trim() || '',
        statusLight: statusLight || 'consulting',
        folderId: 'f_my_new',
        assignedTo: '박지훈',
        createdAt: '오늘',
        archivedAt: null,
        primaryContact: {
          id: contactId,
          name,
          phone: (phone || '').trim() || '010-0000-0000',
          tags: ['신규'],
        },
        people: [
          { contactId, name, role: '대표 고객', phone: (phone || '').trim() || '010-0000-0000', note: '방금 등록됨' },
        ],
        steps: [],
        listingIntakes: [],
        buyerIntakes: [],
        matches: [],
        consultations: [],
        comments: [],
        tasks: [],
        callRecordings: [],
        files: [],
        briefings: [],
      };
      state.projects.unshift(newProject);
      state.selectedProjectId = id;
      state.ui.hybridTab = 'overview';
      state.ui.cockpitTab = 'overview';
      emit();
      return newProject;
    },
    addConsultation(projectId, { type, content, contextLabel }) {
      const p = getProject(projectId);
      const body = (content || '').trim();
      if (!p || !body) return false;
      p.consultations.unshift({
        id: nextId('co'),
        contactName: p.primaryContact?.name || '고객',
        type: type || 'phone',
        purpose: '프로젝트 상담',
        contextLabel: contextLabel || p.title,
        content: body,
        author: p.assignedTo || '박지훈',
        createdAt: '방금',
      });
      emit();
      return true;
    },
    addComment(projectId, { body, color, author }) {
      const p = getProject(projectId);
      const text = (body || '').trim();
      if (!p || !text) return false;
      p.comments.unshift({
        id: nextId('cm'),
        author: author || p.assignedTo || '박지훈',
        body: text,
        color: color || 'yellow',
        createdAt: '방금',
      });
      emit();
      return true;
    },
    addTask(projectId, { title, dueLabel, remindLabel, assignee }) {
      const p = getProject(projectId);
      const text = (title || '').trim();
      if (!p || !text) return false;
      p.tasks.unshift({
        id: nextId('t'),
        title: text,
        dueLabel: (dueLabel || '').trim() || '오늘',
        remindLabel: (remindLabel || '').trim() || null,
        assignee: assignee || p.assignedTo || '박지훈',
        done: false,
      });
      emit();
      return true;
    },
    toggleTask(projectId, taskId) {
      const p = getProject(projectId);
      const task = p?.tasks.find((t) => t.id === taskId);
      if (!task) return;
      task.done = !task.done;
      emit();
    },
    deleteTask(projectId, taskId) {
      const p = getProject(projectId);
      if (!p) return;
      p.tasks = p.tasks.filter((t) => t.id !== taskId);
      emit();
    },
    toggleStepDone(projectId, stepId) {
      const p = getProject(projectId);
      const step = p?.steps.find((s) => s.id === stepId);
      if (!step) return;
      step.done = !step.done;
      emit();
    },
    addStep(projectId, { title, order, targetDate, parallelWithCurrent }) {
      const p = getProject(projectId);
      const text = (title || '').trim();
      if (!p || !text) return null;
      const maxOrder = p.steps.length ? Math.max(...p.steps.map((s) => Number(s.order) || 1)) : 0;
      let resolvedOrder = Number(order);
      if (!Number.isFinite(resolvedOrder) || resolvedOrder < 1) {
        if (parallelWithCurrent && p.steps.length > 0) {
          const orders = Array.from(new Set(p.steps.map((s) => Number(s.order) || 1))).sort((a, b) => a - b);
          const activeOrder = orders.find((ord) => p.steps.some((s) => (Number(s.order) || 1) === ord && !s.done));
          resolvedOrder = activeOrder || orders[orders.length - 1];
        } else {
          resolvedOrder = maxOrder + 1;
        }
      }
      const step = {
        id: nextId('st'),
        order: resolvedOrder,
        kind: 'manual',
        title: text,
        targetDate: (targetDate || '').trim() || '미정',
        done: false,
      };
      p.steps.push(step);
      p.steps.sort((a, b) => (Number(a.order) || 1) - (Number(b.order) || 1));
      emit();
      return step;
    },
    addListingIntake(projectId, { place, areaDetail, transactionType, priceLabel, memo }) {
      const p = getProject(projectId);
      if (!p || !place?.trim()) return null;
      const areaNum = parseFloat(areaDetail) || 84.9;
      const pyeong = Math.round(areaNum * 0.3025);
      const item = {
        id: nextId('li'),
        propertyId: nextId('prop'),
        place: place.trim(),
        areaDetail: `${areaNum}㎡ (${pyeong}평)`,
        areaShort: `${pyeong}평`,
        lifecycleStatus: 'open',
        lastCheckResult: '확인 대기',
        lastVerifiedLabel: '방금 등록',
        occupancyStatus: memo?.trim() || '확인 중',
        viewingMemo: '사전 예약 후 안내',
        listings: [
          {
            id: nextId('l'),
            transactionType: transactionType || '매매',
            priceLabel: (priceLabel || '').trim() || '가격 협의',
            priceManwon: 0,
            isPaused: false,
            ad: null,
            matchSummary: '매칭 대기',
          },
        ],
        deal: null,
      };
      p.listingIntakes.push(item);
      const maxOrder = p.steps.length ? Math.max(...p.steps.map((s) => Number(s.order) || 1)) : 0;
      p.steps.push({
        id: nextId('st'),
        order: maxOrder + 1,
        kind: 'listing_intake',
        intakeId: item.id,
        title: `${item.place} 매물 의뢰`,
        targetDate: '미정',
        done: false,
      });
      emit();
      return item;
    },
    addBuyerRequirement(projectId, { transactionType, budgetLabel, areaLabel, preferredSites, moveInDate, memo }) {
      const p = getProject(projectId);
      if (!p) return null;
      if (p.buyerIntakes.length === 0) {
        p.buyerIntakes.push({
          id: nextId('bi'),
          lifecycleStatus: 'open',
          receivedAt: '오늘',
          requirements: [],
        });
      }
      const intake = p.buyerIntakes[0];
      const sites = (preferredSites || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const req = {
        id: nextId('req'),
        priorityRank: intake.requirements.length + 1,
        status: 'active',
        urgency: '보통',
        transactionType: transactionType || '매매',
        budgetLabel: (budgetLabel || '').trim() || '예산 협의',
        areaLabel: (areaLabel || '').trim() || '30평대',
        siteTypes: '아파트',
        preferredSites: sites.length ? sites : ['희망 단지 협의'],
        preferredRegions: ['관심 지역'],
        moveInDate: (moveInDate || '').trim() || '협의',
        memo: (memo || '').trim() || '',
      };
      intake.requirements.push(req);
      const hasStep = p.steps.some((s) => s.kind === 'buyer_intake');
      if (!hasStep) {
        const maxOrder = p.steps.length ? Math.max(...p.steps.map((s) => Number(s.order) || 1)) : 0;
        p.steps.push({
          id: nextId('st'),
          order: maxOrder + 1,
          kind: 'buyer_intake',
          intakeId: intake.id,
          title: `${sites[0] || req.transactionType} 구매 의뢰`,
          targetDate: req.moveInDate,
          done: false,
        });
      }
      emit();
      return req;
    },
    updateMatchStage(projectId, matchId, stage) {
      const p = getProject(projectId);
      const m = p?.matches.find((item) => item.id === matchId);
      if (!m || !MATCH_STAGE_MAP[stage]) return;
      m.stage = stage;
      m.updatedAt = '방금';
      emit();
    },
    toggleBriefSelect(projectId, matchId) {
      const p = getProject(projectId);
      const m = p?.matches.find((item) => item.id === matchId);
      if (!m) return;
      m.briefSelected = !m.briefSelected;
      emit();
    },
    updateBriefNote(projectId, matchId, note) {
      const p = getProject(projectId);
      const m = p?.matches.find((item) => item.id === matchId);
      if (!m) return;
      m.briefNote = note;
      emit();
    },
    saveBriefingLink(projectId, { title, hideUnit }) {
      const p = getProject(projectId);
      if (!p) return null;
      const slug = Math.random().toString(36).slice(2, 7);
      const briefing = {
        id: nextId('br'),
        title: (title || '').trim() || `${p.primaryContact?.name || '고객'}님 맞춤 브리핑`,
        createdAt: '방금',
        url: `https://share.estaitt.com/b/${slug}`,
        views: 0,
        hideUnit: Boolean(hideUnit),
      };
      p.briefings.unshift(briefing);
      emit();
      return briefing;
    },
    addFile(projectId, { name, category, caption, size, previewKind, ocrText }) {
      const p = getProject(projectId);
      if (!p || !name?.trim()) return null;
      const cat = category || '현장사진';
      const inferredPreview =
        previewKind ||
        (cat === '현장사진'
          ? 'living'
          : cat === '계약관련'
            ? 'contract'
            : cat === '등기·대장'
              ? 'registry'
              : cat === '대화캡처'
                ? 'chat'
                : 'audio');
      const file = {
        id: nextId('fl'),
        name: name.trim(),
        category: cat,
        previewKind: inferredPreview,
        caption: (caption || '').trim() || '프로젝트에 직접 올린 자료',
        size: size || '1.4 MB',
        uploader: p.assignedTo || '박지훈',
        createdAt: '방금',
        sourceTable: 'ProjectFile',
        ocrText: ocrText || `${name} ${caption || ''}`,
      };
      p.files.unshift(file);
      emit();
      return file;
    },
    acceptSuggestion(projectId, suggestionId) {
      const p = getProject(projectId);
      if (!p) return;
      for (const rec of p.callRecordings) {
        const sug = rec.suggestions.find((s) => s.id === suggestionId);
        if (sug && sug.status === 'pending') {
          sug.status = 'accepted';
          if (sug.applyKind === 'task') {
            p.tasks.unshift({
              id: nextId('t'),
              title: sug.applyTaskTitle || sug.title,
              dueLabel: sug.applyDue || '내일',
              remindLabel: '1시간 전 알림',
              assignee: p.assignedTo || '박지훈',
              done: false,
            });
          } else if (sug.applyKind === 'memo' && p.buyerIntakes[0]?.requirements[0]) {
            const req = p.buyerIntakes[0].requirements[0];
            req.memo = `${req.memo ? `${req.memo} ` : ''}${sug.applyMemoText || sug.title}`;
          }
          emit();
          return;
        }
      }
    },
    dismissSuggestion(projectId, suggestionId) {
      const p = getProject(projectId);
      if (!p) return;
      for (const rec of p.callRecordings) {
        const sug = rec.suggestions.find((s) => s.id === suggestionId);
        if (sug && sug.status === 'pending') {
          sug.status = 'dismissed';
          emit();
          return;
        }
      }
    },
    resetDemo() {
      state.projects = deepClone(INITIAL_PROJECTS);
      state.selectedProjectId = 'p1';
      state.ui.hybridTab = 'overview';
      state.ui.hybridFeedFilter = 'all';
      state.ui.hybridSearch = '';
      state.ui.hybridShowDoneTasks = false;
      state.ui.hybridFileCat = 'all';
      state.ui.hybridFileSearch = '';
      state.ui.cockpitTab = 'overview';
      state.ui.cockpitStreamTab = 'all';
      state.ui.cockpitFileCat = 'all';
      state.ui.cockpitFileSearch = '';
      state.ui.deskNoteFilter = 'all';
      state.ui.deskFileCat = 'all';
      state.ui.deskSearch = '';
      state.ui.pipelineBoardMode = 'kanban';
      state.ui.pipelineInspectorTab = 'timeline';
      state.ui.pipelineSelectedMatchId = 'm_1';
      emit();
    },
  };

  window.PWData = {
    esc,
    icon,
    svgPreview,
    MATCH_STAGES,
    MATCH_STAGE_MAP,
    DEAL_STAGES,
    STATUS_LIGHTS,
    STATUS_LIGHT_MAP,
    FILE_CATEGORIES,
    CONSULT_TYPES,
    COMMENT_COLORS,
    FOLDERS,
  };
  window.PWStore = PWStore;
})();
