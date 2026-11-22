(() => {
  'use strict';

  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addDays(d, days) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  }

  function startOfWeek(d) {
    return addDays(startOfDay(d), -((d.getDay() + 6) % 7));
  }

  function dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatShortDate(d) {
    return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${WEEKDAYS[d.getDay()]})`;
  }

  function formatHour(h) {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  function formatMoneyManwon(manwon) {
    if (manwon == null) return '—';
    const eok = Math.floor(manwon / 10000);
    const rest = manwon % 10000;
    if (eok > 0 && rest > 0) return `${eok}억 ${rest.toLocaleString('ko-KR')}`;
    if (eok > 0) return `${eok}억`;
    return `${rest.toLocaleString('ko-KR')}만`;
  }

  const now = new Date();
  const today = startOfDay(now);
  const weekStart = startOfWeek(now);
  const todayKey = dateKey(today);
  const todayWeekdayIndex = (today.getDay() + 6) % 7; // Mon=0 .. Sun=6

  function dayAtOffset(offsetFromToday) {
    return addDays(today, offsetFromToday);
  }

  function dayInWeek(weekdayIndex) {
    return addDays(weekStart, weekdayIndex);
  }

  // Pick week offsets that guarantee 9 events Mon..Sun with 3 exact events on today
  const otherWeekdays = [0, 1, 2, 3, 4, 5, 6].filter((idx) => idx !== todayWeekdayIndex);

  const initialWeekEvents = [
    {
      id: 'ev-today-1',
      dayKey: todayKey,
      hour: 10.5,
      title: '고객 미팅 · 한지우',
      type: 'meeting',
      propertyLabel: '고덕아르테온 305동 1203호',
      contactName: '한지우',
      assignee: '현수',
      mine: true,
      memo: '갈아타기 매도 희망가 16.5억 → 16.2억 조정 협의 및 잠실 34평 매수 예산 확인',
    },
    {
      id: 'ev-today-2',
      dayKey: todayKey,
      hour: 15.0,
      title: '임장 · 고덕그라시움 104동',
      type: 'viewing',
      propertyLabel: '고덕그라시움 104동 1802호',
      contactName: '오하늘',
      assignee: '현수',
      mine: true,
      memo: '전세 8.5억 (로열층 남향) — 세입자 퇴거일 12월 중순 조율 필요',
    },
    {
      id: 'ev-today-3',
      dayKey: todayKey,
      hour: 17.5,
      title: '계약서 검토 · 아르테온 1203호',
      type: 'contract',
      propertyLabel: '고덕아르테온 305동 1203호',
      contactName: '김도윤 · 한지우',
      assignee: '현수',
      mine: true,
      memo: '특약: 근저당 잔금일 동시 말소, 누수 하자 담보 6개월 명시 확인',
    },
    {
      id: 'ev-w-1',
      dayKey: dateKey(dayInWeek(otherWeekdays[0])),
      hour: 11.0,
      title: '매물 현장 확인 · 래미안힐스테이트',
      type: 'viewing',
      propertyLabel: '고덕래미안힐스테이트 208동 904호',
      contactName: '윤서연',
      assignee: '박지훈',
      mine: false,
      memo: '도배·싱크대 상태 사진 촬영 및 공실 키 수령',
    },
    {
      id: 'ev-w-2',
      dayKey: dateKey(dayInWeek(otherWeekdays[1])),
      hour: 14.0,
      title: '중도금 입금 확인 · 잠실엘스',
      type: 'contract',
      propertyLabel: '잠실엘스 118동 1502호',
      contactName: '최민준 · 정하은',
      assignee: '현수',
      mine: true,
      memo: '1차 중도금 2억 이체 영수증 수령 및 매도인 확인',
    },
    {
      id: 'ev-w-3',
      dayKey: dateKey(dayInWeek(otherWeekdays[2])),
      hour: 16.0,
      title: '전세 임차인 2차 임장',
      type: 'viewing',
      propertyLabel: '고덕그라시움 112동 703호',
      contactName: '강서진',
      assignee: '이수민',
      mine: false,
      memo: '배우자 동반 재방문, 반려동물 여부 사전 확인 완료',
    },
    {
      id: 'ev-w-4',
      dayKey: dateKey(dayInWeek(otherWeekdays[3])),
      hour: 10.0,
      title: '가계약금 정산 및 본계약 일정 확정',
      type: 'contract',
      propertyLabel: '고덕아르테온 301동 604호',
      contactName: '송유진',
      assignee: '현수',
      mine: true,
      memo: '인감증명서·등기권리증 지참 안내',
    },
    {
      id: 'ev-w-5',
      dayKey: dateKey(dayInWeek(otherWeekdays[4])),
      hour: 15.5,
      title: '상가 권리금 조건 미팅',
      type: 'meeting',
      propertyLabel: '고덕역 센트럴 1층 108호',
      contactName: '조태형',
      assignee: '박지훈',
      mine: false,
      memo: '시설 권리금 내역서 검토',
    },
    {
      id: 'ev-w-6',
      dayKey: dateKey(dayInWeek(otherWeekdays[5])),
      hour: 13.5,
      title: '등기부등본 열람 및 잔금 서류 준비',
      type: 'task',
      propertyLabel: '고덕래미안힐스테이트 302동 1101호',
      contactName: '임지훈',
      assignee: '현수',
      mine: true,
      memo: '법무사 전달용 소유권 이전 체크리스트 확인',
    },
  ];

  const initialTasks = [
    {
      id: 'task-1',
      title: '고덕그라시움 104동 매도인 가격 재확인 전화',
      category: 'verify',
      categoryLabel: '매물확인',
      priority: 'urgent',
      dueOffsetDays: -2,
      dueTime: '14:00',
      propertyLabel: '고덕그라시움 104동 1802호',
      contactName: '박성훈',
      contactPhone: '010-4821-9034',
      assignee: '현수',
      mine: true,
      status: 'pending',
      memo: '14일 경과 매물. 경쟁 최저가 15.8억 대비 호가 조정 의사 확인 필요.',
    },
    {
      id: 'task-2',
      title: '래미안힐스테이트 208동 등기부등본 갱신 열람',
      category: 'document',
      categoryLabel: '서류',
      priority: 'high',
      dueOffsetDays: -1,
      dueTime: '17:00',
      propertyLabel: '고덕래미안힐스테이트 208동 904호',
      contactName: '윤서연',
      contactPhone: '010-3910-2218',
      assignee: '현수',
      mine: true,
      status: 'pending',
      memo: '근저당 말소 예정액과 실제 채권최고액 일치 여부 확인.',
    },
    {
      id: 'task-3',
      title: '아르테온 1203호 본계약서 특약 초안 송부',
      category: 'contract',
      categoryLabel: '계약',
      priority: 'high',
      dueOffsetDays: 0,
      dueTime: '16:00',
      propertyLabel: '고덕아르테온 305동 1203호',
      contactName: '김도윤',
      contactPhone: '010-8122-4410',
      assignee: '현수',
      mine: true,
      status: 'pending',
      memo: '17:30 계약서 검토 미팅 전 양측 카톡으로 초안 공유.',
    },
    {
      id: 'task-4',
      title: '오하늘 고객 임장 매물 3곳 브리핑 시트 출력',
      category: 'viewing',
      categoryLabel: '임장',
      priority: 'medium',
      dueOffsetDays: 0,
      dueTime: '14:20',
      propertyLabel: '고덕그라시움 외 2건',
      contactName: '오하늘',
      contactPhone: '010-6502-7731',
      assignee: '현수',
      mine: true,
      status: 'pending',
      memo: '15:00 임장 출발 전 평면도 + 관리비 내역 준비.',
    },
    {
      id: 'task-5',
      title: '네이버 광고 가격 수정 요청 반영 확인 (엘스 1502호)',
      category: 'advertisement',
      categoryLabel: '광고',
      priority: 'medium',
      dueOffsetDays: 0,
      dueTime: '18:00',
      propertyLabel: '잠실엘스 118동 1502호',
      contactName: '정하은',
      contactPhone: '010-9244-1182',
      assignee: '현수',
      mine: true,
      status: 'pending',
      memo: '이실장 23.2억 → 22.9억 인하 반영 후 네이버 순위 재체크.',
    },
    {
      id: 'task-6',
      title: '고덕역 센트럴 108호 임대인 수선특약 확인',
      category: 'deal',
      categoryLabel: '거래',
      priority: 'medium',
      dueOffsetDays: 0,
      dueTime: '17:30',
      propertyLabel: '고덕역 센트럴 1층 108호',
      contactName: '조태형',
      contactPhone: '010-5501-8390',
      assignee: '박지훈',
      mine: false,
      status: 'pending',
      memo: '에어컨 철거 원상복구 예외 조항 동의 여부.',
    },
    {
      id: 'task-7',
      title: '잠실엘스 1502호 중도금 입금 계좌 사전 안내',
      category: 'deal',
      categoryLabel: '거래',
      priority: 'medium',
      dueOffsetDays: 1,
      dueTime: '10:00',
      propertyLabel: '잠실엘스 118동 1502호',
      contactName: '최민준',
      contactPhone: '010-2318-6090',
      assignee: '현수',
      mine: true,
      status: 'pending',
      memo: '매수인 이체 한도 증액 여부 리마인드.',
    },
    {
      id: 'task-8',
      title: '만기 60일 세입자 재계약/퇴거 의사 확인 (301동 604호)',
      category: 'buyer',
      categoryLabel: '임차만기',
      priority: 'low',
      dueOffsetDays: 3,
      dueTime: '11:00',
      propertyLabel: '고덕아르테온 301동 604호',
      contactName: '임지훈',
      contactPhone: '010-7741-5520',
      assignee: '현수',
      mine: true,
      status: 'pending',
      memo: '갱신요구권 행사 여부 확인 후 신규 전세 광고 준비.',
    },
    {
      id: 'task-9',
      title: '신규 전속 매물 사진 촬영 일정 조율',
      category: 'property',
      categoryLabel: '매물',
      priority: 'low',
      dueOffsetDays: 4,
      dueTime: '15:00',
      propertyLabel: '고덕그라시움 112동 703호',
      contactName: '강서진',
      contactPhone: '010-3329-8841',
      assignee: '이수민',
      mine: false,
      status: 'pending',
      memo: '남향 채광 시간대(오전 11시경) 맞춰 방문.',
    },
  ];

  const STAGE_META = {
    preparing: { label: '계약 준비', tone: 'gray', step: 1 },
    preContract: { label: '가계약', tone: 'violet', step: 2 },
    contracted: { label: '본계약', tone: 'info', step: 3 },
    settling: { label: '중도금/잔금', tone: 'orange', step: 4 },
    completed: { label: '잔금완료', tone: 'success', step: 5 },
  };

  const TX_LABELS = {
    sale: '매매',
    jeonse: '전세',
    monthly: '월세',
  };

  const initialDeals = [
    {
      id: 'deal-1',
      siteName: '고덕아르테온',
      dongHo: '305동 1203호',
      transactionType: 'sale',
      priceManwon: 162000,
      depositManwon: null,
      monthlyRentManwon: null,
      amountText: '매매 16억 2,000',
      stage: 'preContract',
      sellerName: '한지우',
      sellerPhone: '010-5190-3382',
      buyerName: '김도윤',
      buyerPhone: '010-8122-4410',
      assignee: '현수',
      mine: true,
      isJointBrokerage: false,
      partnerName: null,
      commissionExpectedManwon: 648,
      nextPaymentLabel: '계약금',
      nextPaymentAmountManwon: 15000,
      nextPaymentOffsetDays: 0,
      health: 'urgent', // overdue | urgent | healthy
      healthText: '오늘 17:30 계약서 검토',
      payments: [
        { kind: '가계약금', amount: '1,500만', dateOffset: -2, paid: true },
        { kind: '계약금', amount: '1억 4,700만', dateOffset: 0, paid: false },
        { kind: '중도금', amount: '4억', dateOffset: 24, paid: false },
        { kind: '잔금', amount: '10억 5,800만', dateOffset: 62, paid: false },
      ],
      specialTerms: '1. 현 시설 상태의 매매계약. 2. 잔금일과 동시에 기존 근저당권 말소 조건.',
    },
    {
      id: 'deal-2',
      siteName: '잠실엘스',
      dongHo: '118동 1502호',
      transactionType: 'sale',
      priceManwon: 248000,
      depositManwon: null,
      monthlyRentManwon: null,
      amountText: '매매 24억 8,000',
      stage: 'settling',
      sellerName: '정하은',
      sellerPhone: '010-9244-1182',
      buyerName: '최민준',
      buyerPhone: '010-2318-6090',
      assignee: '현수',
      mine: true,
      isJointBrokerage: true,
      partnerName: '잠실중앙공인',
      commissionExpectedManwon: 990,
      nextPaymentLabel: '중도금',
      nextPaymentAmountManwon: 20000,
      nextPaymentOffsetDays: 2,
      health: 'urgent',
      healthText: '중도금 D-2',
      payments: [
        { kind: '계약금', amount: '2억 4,800만', dateOffset: -18, paid: true },
        { kind: '중도금', amount: '8억', dateOffset: 2, paid: false },
        { kind: '잔금', amount: '14억 3,200만', dateOffset: 34, paid: false },
      ],
      specialTerms: '공동중개(매수측 당사). 중도금 이체 후 즉시 영수증 교환.',
    },
    {
      id: 'deal-3',
      siteName: '고덕래미안힐스테이트',
      dongHo: '302동 1101호',
      transactionType: 'jeonse',
      priceManwon: 88000,
      depositManwon: null,
      monthlyRentManwon: null,
      amountText: '전세 8억 8,000',
      stage: 'contracted',
      sellerName: '윤서연',
      sellerPhone: '010-3910-2218',
      buyerName: '임지훈',
      buyerPhone: '010-7741-5520',
      assignee: '현수',
      mine: true,
      isJointBrokerage: false,
      partnerName: null,
      commissionExpectedManwon: 352,
      nextPaymentLabel: '잔금',
      nextPaymentAmountManwon: 79200,
      nextPaymentOffsetDays: -1,
      health: 'overdue',
      healthText: '잔금 1일 지연',
      payments: [
        { kind: '계약금', amount: '8,800만', dateOffset: -29, paid: true },
        { kind: '잔금', amount: '7억 9,200만', dateOffset: -1, paid: false },
      ],
      specialTerms: '전세자금대출 실행 지연으로 1일 연기 구두 합의(확인서 첨부 예정).',
    },
    {
      id: 'deal-4',
      siteName: '고덕그라시움',
      dongHo: '112동 703호',
      transactionType: 'monthly',
      priceManwon: null,
      depositManwon: 30000,
      monthlyRentManwon: 185,
      amountText: '월세 3억 / 185',
      stage: 'preparing',
      sellerName: '강서진',
      sellerPhone: '010-3329-8841',
      buyerName: '서지우',
      buyerPhone: '010-4409-1205',
      assignee: '이수민',
      mine: false,
      isJointBrokerage: false,
      partnerName: null,
      commissionExpectedManwon: 240,
      nextPaymentLabel: '계약 일정 미정',
      nextPaymentAmountManwon: 3000,
      nextPaymentOffsetDays: 5,
      health: 'healthy',
      healthText: '계약일 확정 대기',
      payments: [
        { kind: '계약금', amount: '3,000만', dateOffset: 5, paid: false },
        { kind: '잔금', amount: '2억 7,000만', dateOffset: 28, paid: false },
      ],
      specialTerms: '반려동물 소형견 1마리 허용 특약 협의 중.',
    },
    {
      id: 'deal-5',
      siteName: '고덕아르테온',
      dongHo: '301동 604호',
      transactionType: 'jeonse',
      priceManwon: 79000,
      depositManwon: null,
      monthlyRentManwon: null,
      amountText: '전세 7억 9,000',
      stage: 'contracted',
      sellerName: '송유진',
      sellerPhone: '010-6112-8940',
      buyerName: '문재현',
      buyerPhone: '010-2093-4481',
      assignee: '박지훈',
      mine: false,
      isJointBrokerage: true,
      partnerName: '명일퍼스트공인',
      commissionExpectedManwon: 316,
      nextPaymentLabel: '잔금',
      nextPaymentAmountManwon: 71100,
      nextPaymentOffsetDays: 11,
      health: 'healthy',
      healthText: '잔금 D-11',
      payments: [
        { kind: '계약금', amount: '7,900만', dateOffset: -20, paid: true },
        { kind: '잔금', amount: '7억 1,100만', dateOffset: 11, paid: false },
      ],
      specialTerms: '입주 전 도배 1식 임대인 부담.',
    },
    {
      id: 'deal-6',
      siteName: '고덕래미안힐스테이트',
      dongHo: '109동 402호',
      transactionType: 'sale',
      priceManwon: 145000,
      depositManwon: null,
      monthlyRentManwon: null,
      amountText: '매매 14억 5,000',
      stage: 'completed',
      sellerName: '안태호',
      sellerPhone: '010-8834-2103',
      buyerName: '백서윤',
      buyerPhone: '010-7215-6632',
      assignee: '현수',
      mine: true,
      isJointBrokerage: false,
      partnerName: null,
      commissionExpectedManwon: 580,
      nextPaymentLabel: '수수료 정산 대기',
      nextPaymentAmountManwon: 580,
      nextPaymentOffsetDays: 3,
      health: 'healthy',
      healthText: '등기접수 완료',
      payments: [
        { kind: '계약금', amount: '1억 4,500만', dateOffset: -45, paid: true },
        { kind: '중도금', amount: '5억', dateOffset: -19, paid: true },
        { kind: '잔금', amount: '8억 500만', dateOffset: -1, paid: true },
      ],
      specialTerms: '잔금 및 소유권 이전 등기 접수 완료. 세금계산서 발행 예정.',
    },
  ];

  const initialSignals = [
    {
      id: 'sig-1',
      kind: 'verify_overdue',
      badge: '매물 확인',
      tone: 'destructive',
      title: '고덕그라시움 104동 1802호',
      sub: '매매 16.0억 · 마지막 확인 18일 전 (기한 초과)',
      owner: '박성훈 · 010-4821-9034',
      assignee: '현수',
      mine: true,
      resolved: false,
      resolvedLabel: '',
    },
    {
      id: 'sig-2',
      kind: 'verify_overdue',
      badge: '매물 확인',
      tone: 'orange',
      title: '고덕아르테온 310동 502호',
      sub: '전세 8.2억 · 부재중 2회 (재연락 필요)',
      owner: '이승우 · 010-3381-9420',
      assignee: '현수',
      mine: true,
      resolved: false,
      resolvedLabel: '',
    },
    {
      id: 'sig-3',
      kind: 'verify_overdue',
      badge: '매물 확인',
      tone: 'warning',
      title: '고덕래미안힐스테이트 204동 1401호',
      sub: '월세 2억/210 · 확인 15일 경과',
      owner: '김은지 · 010-9120-5503',
      assignee: '박지훈',
      mine: false,
      resolved: false,
      resolvedLabel: '',
    },
    {
      id: 'sig-4',
      kind: 'ad_alert',
      badge: '네이버 광고',
      tone: 'destructive',
      title: '잠실엘스 118동 1502호 · 더 싼 경쟁광고 등장',
      sub: '내 광고 23.2억(4위) vs 경쟁 최저 22.9억 · 이실장 가격조정 필요',
      owner: '정하은 · 채널: 이실장',
      assignee: '현수',
      mine: true,
      resolved: false,
      resolvedLabel: '',
    },
    {
      id: 'sig-5',
      kind: 'ad_alert',
      badge: '네이버 광고',
      tone: 'info',
      title: '고덕아르테온 305동 1203호 · 경쟁 정확한 층 공개',
      sub: '내 광고 "중층" 노출 vs 타사 "12/25층" 노출 (동일 매물 6건)',
      owner: '한지우 · 채널: 부동산뱅크',
      assignee: '현수',
      mine: true,
      resolved: false,
      resolvedLabel: '',
    },
    {
      id: 'sig-6',
      kind: 'tenant_expiring',
      badge: '만기 임박',
      tone: 'warning',
      title: '고덕아르테온 301동 604호 · 세입자 만기 D-42',
      sub: '임지훈 (전세 7.5억) · 갱신/퇴거 의사 확인 필요',
      owner: '임지훈 · 010-7741-5520',
      assignee: '현수',
      mine: true,
      resolved: false,
      resolvedLabel: '',
    },
    {
      id: 'sig-7',
      kind: 'tenant_expiring',
      badge: '만기 임박',
      tone: 'warning',
      title: '고덕그라시움 119동 302호 · 세입자 만기 D-54',
      sub: '장민혁 (월세 1억/240) · 임대료 시세 재산정 시기',
      owner: '장민혁 · 010-6321-7790',
      assignee: '이수민',
      mine: false,
      resolved: false,
      resolvedLabel: '',
    },
  ];

  const initialCallSuggestions = [
    {
      id: 'call-1',
      kind: 'missed_call',
      badge: '부재중 콜백',
      tone: 'destructive',
      contactName: '김도윤 (아르테온 매수인)',
      phone: '010-8122-4410',
      timeAgo: '24분 전',
      summary: '본계약 특약 관련 부재중 수신 1건 · 17:30 미팅 전 회신 필요',
      suggestionAction: '통화 기록 확인',
      assignee: '현수',
      mine: true,
      status: 'pending',
    },
    {
      id: 'call-2',
      kind: 'ai_calendar',
      badge: '통화 제안 · 일정',
      tone: 'violet',
      contactName: '오하늘 (매수·전세 의뢰)',
      phone: '010-6502-7731',
      timeAgo: '1시간 전 (통화 4분 18초)',
      summary: '"토요일 오전 11시에 그라시움 112동 다시 한 번 보고 싶어요"',
      suggestionAction: '일정 등록 제안 · 토 11:00 임장',
      assignee: '현수',
      mine: true,
      status: 'pending',
    },
    {
      id: 'call-3',
      kind: 'ai_verify',
      badge: '통화 제안 · 가격변경',
      tone: 'info',
      contactName: '한지우 (아르테온 1203호 소유자)',
      phone: '010-5190-3382',
      timeAgo: '어제 18:12 (통화 3분 05초)',
      summary: '"빠른 잔금 조건이면 16억 2천까지는 맞춰볼 생각 있습니다"',
      suggestionAction: '매물 가격 반영 · 16.5억 → 16.2억',
      assignee: '현수',
      mine: true,
      status: 'pending',
    },
  ];

  const initialManagedSites = [
    {
      id: 'site-1',
      name: '고덕아르테온',
      ward: '고덕동 · 4,066세대',
      activeListings: 18,
      weekNew: 4,
      unverified: 2,
      avgSaleText: '84㎡ 16.2억',
      trend: '+0.8%',
      trendDir: 'up',
    },
    {
      id: 'site-2',
      name: '고덕그라시움',
      ward: '고덕동 · 4,932세대',
      activeListings: 15,
      weekNew: 3,
      unverified: 3,
      avgSaleText: '84㎡ 15.9억',
      trend: '-0.4%',
      trendDir: 'down',
    },
    {
      id: 'site-3',
      name: '고덕래미안힐스테이트',
      ward: '고덕동 · 3,658세대',
      activeListings: 9,
      weekNew: 1,
      unverified: 2,
      avgSaleText: '84㎡ 14.8억',
      trend: '보합',
      trendDir: 'flat',
    },
    {
      id: 'site-4',
      name: '잠실엘스',
      ward: '잠실동 · 5,678세대',
      activeListings: 6,
      weekNew: 2,
      unverified: 1,
      avgSaleText: '84㎡ 24.6억',
      trend: '+1.2%',
      trendDir: 'up',
    },
  ];

  const initialNotices = [
    {
      id: 'notice-1',
      title: '[필독] 11월 주택 임대차 계약 신고 과태료 계도기간 종료 안내',
      isRequired: true,
      readAt: null,
      publishedAt: '11.20',
      body: '에스테잇플로우를 이용해 주시는 중개사무소 대표님·소속공인중개사님께 안내드립니다.\n\n주택 임대차 계약 신고제 계도기간 종료에 따라, 보증금 6,000만 원 초과 또는 월 차임 30만 원 초과 신규·갱신 계약 체결 시 계약일로부터 30일 이내 관할 주민센터 또는 부동산거래관리시스템 신고가 필수입니다.\n\n계약서 관리 > 계약 문서 탭에서 [주택임대차계약 신고서] 서식을 바로 생성하실 수 있습니다.',
    },
    {
      id: 'notice-2',
      title: '직원 정산 원 단위 계산 및 3.3% 원천징수 자동 반영 업데이트',
      isRequired: false,
      readAt: null,
      publishedAt: '11.18',
      body: '수수료/정산 메뉴에 [직원 정산] 화면이 추가되었습니다.\n\n• 수수료 입금 기록(CommissionReceipt)은 부가세·3.3% 공제를 정확히 계산하기 위해 원 단위로 저장됩니다.\n• 확정된 정산(Settlement)은 이후 직원 비율을 변경해도 금액이 유지됩니다.',
    },
    {
      id: 'notice-3',
      title: '네이버 부동산 내광고 순위·층 노출 비교 MCP 연동 안내',
      isRequired: false,
      readAt: '2026-11-17T09:00:00Z',
      publishedAt: '11.16',
      body: '광고관리 > 내광고관리에서 이실장·부동산뱅크 광고와 네이버 경쟁 매물(최저가, 정확한 층 노출 여부)을 로컬 Skill로 안전하게 비교할 수 있습니다.',
    },
    {
      id: 'notice-4',
      title: '건축물대장·등기부등본 일괄 발급 공급자 점검 완료 (11/15)',
      isRequired: false,
      readAt: '2026-11-15T14:20:00Z',
      publishedAt: '11.15',
      body: '11월 15일 진행된 공공문서 API 점검이 정상 완료되어 현재 모든 단지·호실 열람이 정상 동작합니다.',
    },
    {
      id: 'notice-5',
      title: '에스테잇플로우 데스크톱 앱 v2.4 자동 업데이트 배포 안내',
      isRequired: false,
      readAt: '2026-11-12T11:00:00Z',
      publishedAt: '11.12',
      body: 'v2.4부터 탭 분리(Ghost Window) 및 CTI 통화 수신 팝업 안정성이 개선되었습니다.',
    },
  ];

  const summaryByScope = {
    mine: {
      collectedManwon: 1580,
      expectedManwon: 2640,
      contractCount: 4,
      activeListings: 24,
      unverifiedListings: 5,
      activeMatches: 9,
      activeDeals: 4,
      expiringTenants: 2,
    },
    all: {
      collectedManwon: 2450,
      expectedManwon: 4220,
      contractCount: 7,
      activeListings: 48,
      unverifiedListings: 8,
      activeMatches: 14,
      activeDeals: 6,
      expiringTenants: 4,
    },
  };

  const state = {
    officeName: '고덕퍼스트공인중개사사무소',
    userName: '현수',
    scope: 'mine', // 'mine' | 'all'
    selectedDayKey: todayKey,
    events: initialWeekEvents,
    tasks: initialTasks,
    deals: initialDeals,
    signals: initialSignals,
    callSuggestions: initialCallSuggestions,
    managedSites: initialManagedSites,
    notices: initialNotices,
    cheerCount: 0,
  };

  const listeners = new Set();

  function notify(reason, payload) {
    for (const fn of listeners) {
      try {
        fn(state, reason, payload);
      } catch (err) {
        console.error('[DashMockData listener error]', err);
      }
    }
  }

  function getWeekDays() {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      return {
        index: i,
        date: d,
        key: dateKey(d),
        weekday: WEEKDAYS[d.getDay()],
        dayNum: d.getDate(),
        isToday: dateKey(d) === todayKey,
        isPast: dateKey(d) < todayKey,
      };
    });
  }

  function getScopedData() {
    const isMine = state.scope === 'mine';
    const events = state.events
      .filter((e) => !isMine || e.mine)
      .slice()
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.hour - b.hour);

    const todayEvents = events.filter((e) => e.dayKey === todayKey);
    const selectedDayEvents = events.filter((e) => e.dayKey === state.selectedDayKey);

    const openTasks = state.tasks
      .filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
      .filter((t) => !isMine || t.mine)
      .slice()
      .sort((a, b) => a.dueOffsetDays - b.dueOffsetDays || a.dueTime.localeCompare(b.dueTime));

    const overdueTasks = openTasks.filter((t) => t.dueOffsetDays < 0);
    const todayTasks = openTasks.filter((t) => t.dueOffsetDays === 0);
    const upcomingTasks = openTasks.filter((t) => t.dueOffsetDays > 0);

    const deals = state.deals
      .filter((d) => !isMine || d.mine || true) // keep office deals visible, highlight mine
      .slice();

    const scopedDeals = isMine ? state.deals.filter((d) => d.mine) : state.deals;

    const signals = state.signals.filter((s) => !isMine || s.mine);
    const activeSignals = signals.filter((s) => !s.resolved);

    const callSuggestions = state.callSuggestions.filter((c) => !isMine || c.mine);
    const pendingSuggestions = callSuggestions.filter((c) => c.status === 'pending');

    const unreadNotices = state.notices.filter((n) => !n.readAt);
    const unreadRequiredNotices = unreadNotices.filter((n) => n.isRequired);

    const baseSummary = summaryByScope[state.scope];
    const resolvedVerifyCount = state.signals.filter(
      (s) => s.resolved && s.kind === 'verify_overdue' && (!isMine || s.mine),
    ).length;

    const summary = {
      ...baseSummary,
      unverifiedListings: Math.max(0, baseSummary.unverifiedListings - resolvedVerifyCount),
      activeDeals: scopedDeals.filter((d) => d.stage !== 'completed').length,
      collectionPct: Math.round((baseSummary.collectedManwon / baseSummary.expectedManwon) * 100),
    };

    const taskCountByDay = {};
    for (const day of getWeekDays()) taskCountByDay[day.key] = 0;
    for (const t of openTasks) {
      const dk = dateKey(dayAtOffset(t.dueOffsetDays));
      if (dk in taskCountByDay) taskCountByDay[dk] += 1;
    }

    const eventCountByDay = {};
    for (const day of getWeekDays()) eventCountByDay[day.key] = 0;
    for (const ev of events) {
      if (ev.dayKey in eventCountByDay) eventCountByDay[ev.dayKey] += 1;
    }

    return {
      now,
      today,
      todayKey,
      scope: state.scope,
      weekDays: getWeekDays(),
      events,
      todayEvents,
      selectedDayKey: state.selectedDayKey,
      selectedDayEvents,
      eventCountByDay,
      taskCountByDay,
      openTasks,
      overdueTasks,
      todayTasks,
      upcomingTasks,
      deals: state.deals,
      scopedDeals,
      signals,
      activeSignals,
      callSuggestions,
      pendingSuggestions,
      managedSites: state.managedSites,
      notices: state.notices,
      unreadNotices,
      unreadRequiredNotices,
      summary,
      heroCounts: {
        events: todayEvents.length,
        tasks: openTasks.length,
        overdue: overdueTasks.length,
      },
      heroFlags: todayEvents.map((e) => ({ hour: e.hour, label: e.title })),
    };
  }

  function setScope(nextScope) {
    if (nextScope !== 'mine' && nextScope !== 'all') return;
    if (state.scope === nextScope) return;
    state.scope = nextScope;
    notify('scope', nextScope);
  }

  function selectDay(dayKey) {
    state.selectedDayKey = dayKey || todayKey;
    notify('day', state.selectedDayKey);
  }

  function completeTask(taskId) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return null;
    const prev = task.status;
    task.status = prev === 'completed' ? 'pending' : 'completed';
    if (task.status === 'completed') state.cheerCount += 1;
    notify('task:toggle', { task, completed: task.status === 'completed' });
    return { task, previousStatus: prev };
  }

  function restoreTaskStatus(taskId, status) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.status = status;
    notify('task:restore', { task });
  }

  function snoozeTask(taskId, newOffsetDays, label) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return null;
    const prevOffset = task.dueOffsetDays;
    task.dueOffsetDays = newOffsetDays;
    notify('task:snooze', { task, label, prevOffset });
    return { task, prevOffset };
  }

  function addTask(title, category = 'other') {
    const trimmed = String(title || '').trim();
    if (!trimmed) return null;
    const newTask = {
      id: `task-${Date.now()}`,
      title: trimmed,
      category,
      categoryLabel: category === 'verify' ? '매물확인' : '업무',
      priority: 'medium',
      dueOffsetDays: 0,
      dueTime: '18:00',
      propertyLabel: null,
      contactName: null,
      contactPhone: null,
      assignee: '현수',
      mine: true,
      status: 'pending',
      memo: '대시보드에서 빠른 추가됨',
    };
    state.tasks.unshift(newTask);
    notify('task:add', { task: newTask });
    return newTask;
  }

  function markNoticeRead(noticeId) {
    const n = state.notices.find((item) => item.id === noticeId);
    if (!n || n.readAt) return;
    n.readAt = new Date().toISOString();
    notify('notice:read', n);
  }

  function resolveSignal(signalId, actionLabel) {
    const sig = state.signals.find((s) => s.id === signalId);
    if (!sig) return null;
    sig.resolved = true;
    sig.resolvedLabel = actionLabel || '처리 완료';
    if (sig.kind === 'verify_overdue') state.cheerCount += 1;
    notify('signal:resolve', sig);
    return sig;
  }

  function reopenSignal(signalId) {
    const sig = state.signals.find((s) => s.id === signalId);
    if (!sig) return;
    sig.resolved = false;
    sig.resolvedLabel = '';
    notify('signal:reopen', sig);
  }

  function resolveCallSuggestion(id, decision) {
    const c = state.callSuggestions.find((item) => item.id === id);
    if (!c) return null;
    c.status = decision; // 'accepted' | 'dismissed'
    if (decision === 'accepted') {
      state.cheerCount += 1;
      if (c.kind === 'ai_calendar') {
        const satIdx = 5;
        state.events.push({
          id: `ev-ai-${Date.now()}`,
          dayKey: dateKey(dayInWeek(satIdx)),
          hour: 11.0,
          title: '재임장 · 고덕그라시움 112동',
          type: 'viewing',
          propertyLabel: '고덕그라시움 112동 703호',
          contactName: '오하늘',
          assignee: '현수',
          mine: true,
          memo: '통화 분석 제안에서 자동 등록됨',
        });
      }
    }
    notify('call:resolve', { item: c, decision });
    return c;
  }

  function toggleDealPaymentPaid(dealId, idx) {
    const deal = state.deals.find((d) => d.id === dealId);
    if (!deal || !deal.payments[idx]) return null;
    deal.payments[idx].paid = !deal.payments[idx].paid;
    notify('deal:payment', { deal, idx });
    return deal;
  }

  function dDayLabel(offsetDays) {
    if (offsetDays === 0) return '오늘';
    if (offsetDays < 0) return `${Math.abs(offsetDays)}일 지남`;
    return `D-${offsetDays}`;
  }

  function relativeDateLabel(offsetDays) {
    const d = dayAtOffset(offsetDays);
    if (offsetDays === 0) return '오늘';
    if (offsetDays === 1) return '내일';
    if (offsetDays === -1) return '어제';
    return formatShortDate(d);
  }

  window.DashMockData = {
    WEEKDAYS,
    STAGE_META,
    TX_LABELS,
    state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getWeekDays,
    getScopedData,
    setScope,
    selectDay,
    completeTask,
    restoreTaskStatus,
    snoozeTask,
    addTask,
    markNoticeRead,
    resolveSignal,
    reopenSignal,
    resolveCallSuggestion,
    toggleDealPaymentPaid,
    formatHour,
    formatShortDate,
    formatMoneyManwon,
    dDayLabel,
    relativeDateLabel,
    dateKey,
  };
})();
