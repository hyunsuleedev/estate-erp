/*
 * EstaitFlow — 구성원(직원) 관리 모던 CRM/ERP/HR 데모
 * - 시안 1 (cards): 구성원 카드 디렉터리 + 플로팅 프로파일 드로어 (flex · Deel · Rippling)
 * - 시안 2 (ops): 성과 리더보드 + 긴급 관제 큐 + 보더리스 클린 리스트 (Follow Up Boss · Attio · Stripe)
 * - 시안 3 (bento): 좌측 구성원 네비 + 우측 풀 벤토 프로필 워크스페이스 (flex 구성원 프로필 · Linear)
 */
(() => {
  'use strict';

  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    building: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4M10 10h4M10 14h4M2 22h20"/>',
    map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
    megaphone: '<path d="m3 11 18-5v12L3 14v-3Z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    kanban: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
    book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
    userSearch: '<circle cx="10" cy="7" r="4"/><path d="M10.3 15H7a4 4 0 0 0-4 4v2"/><circle cx="17" cy="17" r="3"/><path d="m21 21-1.9-1.9"/>',
    handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    todo: '<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8M13 12h8M13 18h8"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    menu: '<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronUp: '<path d="m18 15-6-6-6 6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevronsRight: '<path d="m6 17 5-5-5-5M13 17l5-5-5-5"/>',
    maximize: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/>',
    rotateCcw: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    arrowUpRight: '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    briefcase: '<rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
  };

  const ROLE_LABELS = { owner: '대표', manager: '매니저', agent: '중개사' };
  const ROLE_DESCRIPTIONS = {
    owner: '사무소 설정과 직원 계정, 급여와 배분율까지 모두 관리합니다.',
    manager: '중개사 계정을 만들고 관리합니다. 급여와 배분율은 볼 수 없습니다.',
    agent: '본인의 업무와 정보만 봅니다.',
  };
  const LICENSE_LABELS = {
    broker_owner: '개업공인중개사',
    broker_associate: '소속공인중개사',
    assistant: '중개보조원',
  };
  const PAY_TYPE_LABELS = {
    fixed: '고정급',
    mixed: '고정급+수수료',
    commission_only: '수수료제',
  };
  const PARTICIPANT_ROLE_LABELS = {
    listing_agent: '매도측 담당',
    buying_agent: '매수측 담당',
    dual_agent: '단독중개',
    manager: '관리자',
    closer: '마감 담당',
  };

  const NAV_SECTIONS = [
    { title: '시작', items: [{ id: 'dashboard', label: '대시보드', icon: 'dashboard' }] },
    {
      title: '매물·공간',
      items: [
        { id: 'properties', label: '매물관리', icon: 'building' },
        { id: 'sites', label: '관리단지', icon: 'map' },
        { id: 'ads', label: '광고관리', icon: 'megaphone' },
      ],
    },
    {
      title: '고객·상담',
      items: [
        { id: 'projects', label: '프로젝트', icon: 'kanban' },
        { id: 'contacts', label: '연락처', icon: 'book' },
        { id: 'consultations', label: '상담분석', icon: 'message' },
      ],
    },
    {
      title: '거래·계약',
      items: [
        { id: 'wanted', label: '희망매물', icon: 'userSearch' },
        { id: 'deals', label: '거래관리', icon: 'handshake' },
        { id: 'contracts', label: '계약서 관리', icon: 'file' },
        { id: 'cashflow', label: '수수료/정산', icon: 'wallet' },
      ],
    },
    {
      title: '업무·운영',
      items: [
        { id: 'tasks', label: '업무', icon: 'todo' },
        { id: 'calendar', label: '캘린더', icon: 'calendar' },
        { id: 'employees', label: '구성원 관리', icon: 'users', active: true },
        { id: 'settings', label: '설정', icon: 'settings' },
      ],
    },
  ];

  const OFFICE_DEFAULTS = {
    defaultAgentRate: 50,
    listingAgentRate: 50,
    buyingAgentRate: 50,
    dualAgentRate: 70,
  };

  const INITIAL_EMPLOYEES = [
    {
      id: 'emp-1',
      name: '김도현',
      loginId: 'dh.kim',
      role: 'owner',
      avatarTone: 'av-indigo',
      isActive: true,
      licenseType: 'broker_owner',
      licenseNo: '11740-2021-00182',
      phone: '010-4821-3910',
      email: 'dh.kim@godeokfirst.kr',
      createdAt: '2024.03.11',
      payType: 'commission_only',
      baseSalary: null,
      commissionRate: null,
      employmentType: 'freelancer',
      withholdTax: false,
      lastActivityOrder: 1,
      lastActivityLabel: '12분 전',
      quietDays: 0,
      consultationCount: 128,
      commissionAmountTotal: 4820,
      tasks: [
        { id: 't-101', title: '고덕그라시움 102동 2203호 전속계약 특약 검토', status: '진행 중', priority: '높음', dueDays: 0 },
        { id: 't-102', title: '아르테온 309동 1401호 매매 잔금서류 확인', status: '대기', priority: '보통', dueDays: 1 },
        { id: 't-103', title: '11월 공동중개 정산 내역 최종 승인', status: '진행 중', priority: '보통', dueDays: 4 },
        { id: 't-104', title: '신규 입점 상가 임대 조건 소유자 재확인', status: '대기', priority: '낮음', dueDays: null },
      ],
      buyers: [
        { id: 'b-101', name: '오세훈', status: '활성', nextContactDays: 0 },
        { id: 'b-102', name: '윤서영', status: '활성', nextContactDays: 2 },
        { id: 'b-103', name: '장민혁', status: '활성', nextContactDays: 5 },
        { id: 'b-104', name: '한예진', status: '활성', nextContactDays: null },
        { id: 'b-105', name: '배수민', status: '보류', nextContactDays: null },
      ],
      deals: [
        { id: 'd-101', place: '고덕그라시움 102동 2203호', role: 'dual_agent', settled: false, commission: 680 },
        { id: 'd-102', place: '고덕아르테온 309동 1401호', role: 'manager', settled: false, commission: 310 },
        { id: 'd-103', place: '고덕래미안힐스테이트 208동 802호', role: 'listing_agent', settled: true, commission: 840 },
      ],
      timeline: [
        {
          day: '오늘',
          items: [
            { id: 'c-101', kind: 'consultation', time: '14:20', title: '오세훈 전화 상담', body: '매매가 19억 8,000만 선에서 잔금 일정 1월 말로 조율 희망.' },
            { id: 'a-101', kind: 'activity', time: '11:05', title: '거래 수정', meta: '앱', body: '계약 준비 단계 일정 확인' },
          ],
        },
        {
          day: '어제',
          items: [
            { id: 'c-102', kind: 'consultation', time: '16:40', title: '윤서영 방문 상담', body: '30평형 로열층 위주 임장 2건 확정, 내일 오후 3시 동행.' },
            { id: 'a-102', kind: 'activity', time: '14:12', title: '특약 서식 수정', meta: 'AI 연결', body: '누수·하자 담보 표준 문구 보완' },
          ],
        },
      ],
    },
    {
      id: 'emp-2',
      name: '박서연',
      loginId: 'sy.park',
      role: 'manager',
      avatarTone: 'av-blue',
      isActive: true,
      licenseType: 'broker_associate',
      licenseNo: '2022-048192',
      phone: '010-9134-7721',
      email: 'sy.park@godeokfirst.kr',
      createdAt: '2024.05.02',
      payType: 'mixed',
      baseSalary: 280,
      commissionRate: 45,
      employmentType: 'employee',
      withholdTax: false,
      lastActivityOrder: 2,
      lastActivityLabel: '28분 전',
      quietDays: 0,
      consultationCount: 94,
      commissionAmountTotal: 3150,
      tasks: [
        { id: 't-201', title: '고덕센트럴아이파크 104동 502호 네이버 광고 가격 하향 확인', status: '진행 중', priority: '긴급', dueDays: -1 },
        { id: 't-202', title: '세입자 임차권등기 문의 회신', status: '진행 중', priority: '높음', dueDays: 0 },
        { id: 't-203', title: '래미안힐스테이트 전세 보증보험 안내', status: '대기', priority: '보통', dueDays: 2 },
        { id: 't-204', title: '신규 매물 의뢰 2건 호실 등기부 열람', status: '대기', priority: '보통', dueDays: 3 },
        { id: 't-205', title: '금주 임장 배차 및 열쇠 인수 목록 정리', status: '진행 중', priority: '낮음', dueDays: 6 },
      ],
      buyers: [
        { id: 'b-201', name: '송지훈', status: '활성', nextContactDays: -1 },
        { id: 'b-202', name: '임채원', status: '활성', nextContactDays: 0 },
        { id: 'b-203', name: '조현우', status: '활성', nextContactDays: 3 },
        { id: 'b-204', name: '서유진', status: '활성', nextContactDays: 4 },
        { id: 'b-205', name: '문태형', status: '활성', nextContactDays: null },
        { id: 'b-206', name: '강다은', status: '활성', nextContactDays: null },
      ],
      deals: [
        { id: 'd-201', place: '고덕센트럴아이파크 104동 1201호', role: 'buying_agent', settled: false, commission: 420 },
        { id: 'd-202', place: '고덕그라시움 118동 904호', role: 'listing_agent', settled: false, commission: 390 },
        { id: 'd-203', place: '고덕롯데캐슬베네루체 203동 1102호', role: 'buying_agent', settled: true, commission: 280 },
      ],
      timeline: [
        {
          day: '오늘',
          items: [
            { id: 'c-201', kind: 'consultation', time: '13:55', title: '임채원 전화 상담', body: '전세 보증금 7억 5,000만 조건으로 이번 주말 집 보기 예약.' },
            { id: 'a-201', kind: 'activity', time: '10:30', title: '매물 의뢰 수정', meta: '앱', body: '고덕센트럴아이파크 104동 매도 호가 16억 5,000만으로 조정' },
          ],
        },
        {
          day: '어제',
          items: [
            { id: 'a-202', kind: 'activity', time: '18:05', title: '광고 변경 요청 등록', meta: 'AI 연결', body: '이실장 가격 변경 작업 생성' },
          ],
        },
      ],
    },
    {
      id: 'emp-3',
      name: '이준호',
      loginId: 'jh.lee',
      role: 'agent',
      avatarTone: 'av-emerald',
      isActive: true,
      licenseType: 'broker_associate',
      licenseNo: '2021-119044',
      phone: '010-3352-8814',
      email: 'jh.lee@godeokfirst.kr',
      createdAt: '2024.06.19',
      payType: 'commission_only',
      baseSalary: null,
      commissionRate: 60,
      employmentType: 'freelancer',
      withholdTax: true,
      lastActivityOrder: 3,
      lastActivityLabel: '2시간 전',
      quietDays: 0,
      consultationCount: 142,
      commissionAmountTotal: 2940,
      tasks: [
        { id: 't-301', title: '김민수 고객 가계약금 입금 계좌 확인', status: '진행 중', priority: '긴급', dueDays: -3 },
        { id: 't-302', title: '그라시움 124동 701호 월세 1억 / 250만 소유자 재확인', status: '진행 중', priority: '높음', dueDays: -1 },
        { id: 't-303', title: '아르테온 312동 1803호 임장 열쇠 수령', status: '대기', priority: '높음', dueDays: 0 },
        { id: 't-304', title: '박지영 고객 학군지 매물 3건 제안서 정리', status: '진행 중', priority: '보통', dueDays: 1 },
        { id: 't-305', title: '네이버 단지 매물 최저가 비교 메모 갱신', status: '대기', priority: '보통', dueDays: 4 },
        { id: 't-306', title: '공동중개 파트너 사무소 수수료 확인서 발송', status: '대기', priority: '낮음', dueDays: 6 },
      ],
      buyers: [
        { id: 'b-301', name: '김민수', status: '활성', nextContactDays: -2 },
        { id: 'b-302', name: '박지영', status: '활성', nextContactDays: 0 },
        { id: 'b-303', name: '최성훈', status: '활성', nextContactDays: 1 },
        { id: 'b-304', name: '정하늘', status: '활성', nextContactDays: 3 },
        { id: 'b-305', name: '백승호', status: '활성', nextContactDays: 5 },
        { id: 'b-306', name: '유나경', status: '활성', nextContactDays: null },
        { id: 'b-307', name: '안태준', status: '활성', nextContactDays: null },
      ],
      deals: [
        { id: 'd-301', place: '고덕그라시움 112동 1902호', role: 'buying_agent', settled: false, commission: 540 },
        { id: 'd-302', place: '고덕아르테온 304동 603호', role: 'listing_agent', settled: false, commission: 410 },
        { id: 'd-303', place: '고덕아이파크 105동 1104호', role: 'dual_agent', settled: true, commission: 720 },
      ],
      timeline: [
        {
          day: '오늘',
          items: [
            { id: 'c-301', kind: 'consultation', time: '12:40', title: '김민수 전화 상담', body: '가계약 조건 재합의 완료. 오늘 오후 5시 전까지 계약금 송금 예정.' },
            { id: 'c-302', kind: 'consultation', time: '10:15', title: '박지영 방문 상담', body: '30평형 전세 7억 ~ 7억 8,000만 매물 4건 비교 안내.' },
            { id: 'a-301', kind: 'activity', time: '09:38', title: '매칭 등록', meta: '앱', body: '고덕아르테온 312동 1803호 연결' },
          ],
        },
        {
          day: '11월 20일',
          items: [
            { id: 'c-303', kind: 'consultation', time: '17:20', title: '최성훈 문자·온라인 상담', body: '대출 가능 한도 확인 후 주말 재임장 희망.' },
            { id: 'a-302', kind: 'activity', time: '15:02', title: '업무 수정', meta: '시스템', body: '기한 임박 알림 기록' },
          ],
        },
      ],
    },
    {
      id: 'emp-4',
      name: '정수빈',
      loginId: 'sb.jung',
      role: 'agent',
      avatarTone: 'av-violet',
      isActive: true,
      licenseType: 'broker_associate',
      licenseNo: '2023-084211',
      phone: '010-6729-1405',
      email: 'sb.jung@godeokfirst.kr',
      createdAt: '2024.09.04',
      payType: 'mixed',
      baseSalary: 200,
      commissionRate: null,
      employmentType: 'freelancer',
      withholdTax: true,
      lastActivityOrder: 4,
      lastActivityLabel: '어제',
      quietDays: 1,
      consultationCount: 61,
      commissionAmountTotal: 1740,
      tasks: [
        { id: 't-401', title: '고덕빌라 201호 월세 계약서 작성 준비', status: '진행 중', priority: '보통', dueDays: 1 },
        { id: 't-402', title: '소유자 입주청소 업체 연락처 전달', status: '대기', priority: '낮음', dueDays: 5 },
      ],
      buyers: [
        { id: 'b-401', name: '남궁현', status: '활성', nextContactDays: 0 },
        { id: 'b-402', name: '신소라', status: '활성', nextContactDays: 2 },
        { id: 'b-403', name: '권오성', status: '활성', nextContactDays: 7 },
      ],
      deals: [
        { id: 'd-401', place: '고덕래미안힐스테이트 211동 1502호', role: 'buying_agent', settled: true, commission: 480 },
        { id: 'd-402', place: '고덕빌라 201호', role: 'dual_agent', settled: true, commission: 190 },
      ],
      timeline: [
        {
          day: '어제',
          items: [
            { id: 'c-401', kind: 'consultation', time: '16:15', title: '남궁현 전화 상담', body: '보증금 5,000만 / 월세 180만 조건 수락 여부 확인.' },
            { id: 'a-401', kind: 'activity', time: '13:45', title: '프로젝트 수정', meta: '앱', body: '갈아타기 매도·매수 순서 정리' },
          ],
        },
      ],
    },
    {
      id: 'emp-5',
      name: '최민석',
      loginId: 'ms.choi',
      role: 'agent',
      avatarTone: 'av-amber',
      isActive: true,
      licenseType: 'assistant',
      licenseNo: null,
      phone: '010-5190-6283',
      email: 'ms.choi@godeokfirst.kr',
      createdAt: '2025.02.14',
      payType: 'fixed',
      baseSalary: 260,
      commissionRate: null,
      employmentType: 'employee',
      withholdTax: false,
      lastActivityOrder: 8,
      lastActivityLabel: '9일 전',
      quietDays: 9,
      consultationCount: 19,
      commissionAmountTotal: 420,
      tasks: [
        { id: 't-501', title: '단지 외관·주차장 현장 사진 정리', status: '대기', priority: '보통', dueDays: -2 },
        { id: 't-502', title: '고덕상가 2층 공실 현황 점검', status: '대기', priority: '낮음', dueDays: 3 },
      ],
      buyers: [
        { id: 'b-501', name: '류지성', status: '활성', nextContactDays: -4 },
        { id: 'b-502', name: '고은비', status: '활성', nextContactDays: 4 },
      ],
      deals: [],
      timeline: [
        {
          day: '11월 13일',
          items: [
            { id: 'c-501', kind: 'consultation', time: '15:10', title: '류지성 전화 상담', body: '오피스텔 월세 1,000만 / 85만 매물 1차 안내.' },
          ],
        },
      ],
    },
    {
      id: 'emp-6',
      name: '한지우',
      loginId: 'jw.han',
      role: 'agent',
      avatarTone: 'av-teal',
      isActive: true,
      licenseType: 'broker_associate',
      licenseNo: '2025-019283',
      phone: '010-8204-5519',
      email: 'jw.han@godeokfirst.kr',
      createdAt: '2026.11.20',
      payType: 'commission_only',
      baseSalary: null,
      commissionRate: 50,
      employmentType: 'freelancer',
      withholdTax: true,
      lastActivityOrder: 99,
      lastActivityLabel: null,
      quietDays: null,
      consultationCount: 0,
      commissionAmountTotal: 0,
      tasks: [],
      buyers: [],
      deals: [],
      timeline: [],
    },
    {
      id: 'emp-7',
      name: '강태윤',
      loginId: 'ty.kang',
      role: 'agent',
      avatarTone: 'av-slate',
      isActive: false,
      licenseType: 'broker_associate',
      licenseNo: '2020-073120',
      phone: '010-2218-4900',
      email: 'ty.kang@godeokfirst.kr',
      createdAt: '2024.03.15',
      payType: 'commission_only',
      baseSalary: null,
      commissionRate: 55,
      employmentType: 'freelancer',
      withholdTax: true,
      lastActivityOrder: 50,
      lastActivityLabel: '34일 전',
      quietDays: 34,
      consultationCount: 83,
      commissionAmountTotal: 2180,
      tasks: [],
      buyers: [],
      deals: [
        { id: 'd-701', place: '고덕센트럴푸르지오 102동 804호', role: 'buying_agent', settled: false, commission: 260 },
      ],
      timeline: [
        {
          day: '10월 19일',
          items: [
            { id: 'a-701', kind: 'activity', time: '17:50', title: '거래 수정', meta: '앱', body: '잔금 완료 후 인수인계 메모 작성' },
          ],
        },
      ],
    },
    {
      id: 'emp-8',
      name: '윤아름',
      loginId: 'ar.yoon',
      role: 'agent',
      avatarTone: 'av-slate',
      isActive: false,
      licenseType: 'assistant',
      licenseNo: null,
      phone: '010-7741-9032',
      email: 'ar.yoon@godeokfirst.kr',
      createdAt: '2024.07.01',
      payType: 'fixed',
      baseSalary: 240,
      commissionRate: null,
      employmentType: 'employee',
      withholdTax: false,
      lastActivityOrder: 70,
      lastActivityLabel: '62일 전',
      quietDays: 62,
      consultationCount: 14,
      commissionAmountTotal: 0,
      tasks: [],
      buyers: [],
      deals: [],
      timeline: [],
    },
  ];

  function esc(val) {
    return String(val == null ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ic(name, cls = 'ic') {
    return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.file}</svg>`;
  }

  function cloneEmployees() {
    return JSON.parse(JSON.stringify(INITIAL_EMPLOYEES));
  }

  function formatManwon(manwon) {
    if (!manwon) return '0원';
    const eok = Math.floor(manwon / 10000);
    const rest = manwon % 10000;
    if (eok > 0 && rest > 0) return `${eok}억 ${rest.toLocaleString()}만`;
    if (eok > 0) return `${eok}억`;
    return `${rest.toLocaleString()}만`;
  }

  function dueText(days) {
    if (days == null) return '';
    if (days < 0) return `${Math.abs(days)}일 지남`;
    if (days === 0) return '오늘';
    if (days === 1) return '내일';
    return `D-${days}`;
  }

  function countsOf(emp) {
    const tasks = emp.tasks.length;
    const customers = emp.buyers.filter((b) => b.status === '활성').length;
    const deals = emp.deals.length;
    const unsettled = emp.deals.filter((d) => !d.settled).length;
    const unsettledMoney = emp.deals.filter((d) => !d.settled).reduce((s, d) => s + (d.commission || 0), 0);
    const lateCount =
      emp.tasks.filter((t) => t.dueDays != null && t.dueDays < 0).length +
      emp.buyers.filter((b) => b.status === '활성' && b.nextContactDays != null && b.nextContactDays < 0).length;
    return { tasks, customers, deals, workload: tasks + customers + deals, unsettled, unsettledMoney, lateCount };
  }

  function isQuiet(emp) {
    return emp.isActive && (emp.quietDays === null || emp.quietDays >= 7);
  }

  function avatarDotClass(emp) {
    if (!emp.isActive) return 'is-inactive';
    if (isQuiet(emp)) return 'is-quiet';
    return '';
  }

  function roleBadgeClass(role) {
    if (role === 'owner') return 'pill-indigo';
    if (role === 'manager') return 'pill-blue';
    return 'pill-gray';
  }

  function paySummaryText(emp) {
    if (emp.role === 'owner') return '대표 계정';
    const rate = emp.commissionRate != null ? emp.commissionRate : OFFICE_DEFAULTS.defaultAgentRate;
    if (emp.payType === 'fixed') return `고정급 ${emp.baseSalary != null ? `${emp.baseSalary}만` : ''}`.trim();
    if (emp.payType === 'mixed') return `기본 ${emp.baseSalary ?? 0}만 + ${rate}%`;
    return `수수료제 ${rate}%`;
  }

  function buildAttention(emp) {
    const out = [];
    for (const t of emp.tasks) {
      if (t.dueDays == null || t.dueDays > 1) continue;
      out.push({
        key: `task-${t.id}`,
        tone: t.dueDays < 0 ? 'late' : 'soon',
        label: '업무',
        text: t.title,
        when: dueText(t.dueDays),
        dest: `/tasks?task=${t.id}`,
      });
    }
    for (const b of emp.buyers) {
      if (b.status !== '활성' || b.nextContactDays == null || b.nextContactDays > 0) continue;
      out.push({
        key: `buyer-${b.id}`,
        tone: b.nextContactDays < 0 ? 'late' : 'soon',
        label: '고객 연락',
        text: b.name,
        when: dueText(b.nextContactDays),
        dest: `/buyer-requirements/${b.id}`,
      });
    }
    const unsettled = emp.deals.filter((d) => !d.settled);
    if (unsettled.length > 0) {
      const total = unsettled.reduce((s, d) => s + (d.commission || 0), 0);
      out.push({
        key: `settle-${emp.id}`,
        tone: 'soon',
        label: '정산',
        text: `미정산 거래 ${unsettled.length}건`,
        when: total > 0 ? formatManwon(total) : '',
        dest: '/cashflow/employee-settlements',
      });
    }
    return out.sort((a, b) => Number(b.tone === 'late') - Number(a.tone === 'late'));
  }

  function toAccountDraft(emp) {
    return {
      name: emp.name || '',
      phone: emp.phone || '',
      email: emp.email || '',
      licenseType: emp.licenseType || '',
      licenseNo: emp.licenseNo || '',
      payType: emp.payType || 'mixed',
      baseSalary: emp.baseSalary != null ? String(emp.baseSalary) : '',
      commissionRate: emp.commissionRate != null ? String(emp.commissionRate) : '',
      employmentType: emp.employmentType || 'freelancer',
      withholdTax: emp.withholdTax !== false,
    };
  }

  function isAccountDirty(emp, draft) {
    if (!emp || !draft) return false;
    const saved = toAccountDraft(emp);
    return Object.keys(saved).some((k) => saved[k] !== draft[k]);
  }

  window.mountEmployeesDemo = function mountEmployeesDemo(options = {}) {
    const params = new URLSearchParams(window.location.search);
    const urlView = params.get('view');
    const initialView = ['cards', 'ops', 'bento'].includes(urlView) ? urlView : (options.defaultView || 'cards');
    const urlRole = params.get('role');
    const initialRole = ['owner', 'manager', 'agent'].includes(urlRole) ? urlRole : 'owner';

    const state = {
      employees: cloneEmployees(),
      viewMode: initialView, // 'cards' | 'ops' | 'bento'
      actorRole: initialRole, // 'owner' | 'manager' | 'agent'
      seatMode: 'available', // 'available' (10) | 'full' (6)
      sidebarCollapsed: false,
      statusFilter: 'active', // 'active' | 'inactive' | 'all'
      roleFilter: '', // '' | 'owner' | 'manager' | 'agent'
      quickFilter: 'all', // 'all' | 'busy' | 'unsettled' | 'attention'
      search: '',
      sort: 'workload', // 'workload' | 'commission' | 'recent' | 'name'
      lbMetric: 'commission', // 'commission' | 'consultations' | 'workload'
      drawerId: null,
      drawerTab: 'overview', // 'overview' | 'work' | 'timeline' | 'account'
      bentoSelectedId: 'emp-3',
      bentoTab: 'overview', // 'overview' | 'timeline' | 'account'
      timelineFilter: 'all', // 'all' | 'consultation' | 'activity'
      accountDraft: null,
      accountDraftForId: null,
      newPasswordDraft: '',
      wizardOpen: false,
      wizardStep: 1,
      wizardDraft: {
        name: '',
        loginId: '',
        password: '',
        phone: '',
        email: '',
        role: 'agent',
        licenseType: 'broker_associate',
        licenseNo: '',
        payType: 'commission_only',
        baseSalary: '',
        commissionRate: '50',
        employmentType: 'freelancer',
        withholdTax: true,
      },
      confirmModal: null, // { kind: 'role' | 'status', empId, nextValue }
      currentPage: options.currentPage || 'index',
    };

    const root = document.getElementById('app');
    if (!root) return;

    root.innerHTML = `
      <div class="demo-root">
        <div class="demo-bar" id="demoBar"></div>
        <div class="saas-shell" id="saasShell">
          <header class="saas-topbar">
            <div class="brand-cluster">
              <button type="button" class="sidebar-toggle-btn pressable" id="sidebarToggleBtn" aria-label="사이드바 토글" title="사이드바 접기/펼치기">
                ${ic('menu')}
              </button>
              <span class="brand-mark" aria-hidden="true">E</span>
              <span class="brand-name">EstaitFlow</span>
              <span class="topbar-divider" aria-hidden="true"></span>
              <div class="topbar-crumb">
                <span>업무·운영</span>
                <span>/</span>
                <strong>구성원 관리</strong>
              </div>
            </div>
            <div class="topbar-right">
              <button type="button" class="topbar-cmd-btn pressable" id="cmdQuickFocus">
                ${ic('search', 'ic ic-sm')}
                <span>구성원 빠른 찾기</span>
                <span class="cmd-kbd">/</span>
              </button>
              <div id="actorChipMount"></div>
            </div>
          </header>

          <div class="saas-body">
            <aside class="saas-sidebar" aria-label="주 메뉴">
              <nav class="sidebar-nav">
                ${NAV_SECTIONS.map((sec) => `
                  <div class="nav-section">
                    <div class="nav-section-title">${esc(sec.title)}</div>
                    ${sec.items.map((item) => `
                      <button type="button" class="nav-link ${item.active ? 'active' : ''}" data-nav-lbl="${esc(item.label)}">
                        ${ic(item.icon)}
                        <span class="trunc">${esc(item.label)}</span>
                      </button>
                    `).join('')}
                  </div>
                `).join('')}
              </nav>
              <div class="sidebar-office-card">
                <div class="office-title">고덕더퍼스트 공인중개사법인</div>
                <div class="office-plan" id="sidebarPlanText"></div>
              </div>
            </aside>

            <main class="main-canvas" id="mainCanvas"></main>
          </div>
        </div>

        <div class="drawer-backdrop" id="drawerBackdrop"></div>
        <aside class="profile-drawer" id="profileDrawer" aria-label="구성원 상세 드로어"></aside>
        <div id="modalHost"></div>
        <div class="toast-stack" id="toastStack" aria-live="polite"></div>
      </div>
    `;

    document.getElementById('sidebarToggleBtn').addEventListener('click', () => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      document.getElementById('saasShell').classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
    });

    document.getElementById('cmdQuickFocus').addEventListener('click', () => {
      focusActiveSearch();
    });

    root.querySelectorAll('[data-nav-lbl]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lbl = btn.getAttribute('data-nav-lbl');
        if (lbl !== '구성원 관리') showToast(`실제 앱에서는 '${lbl}' 화면으로 이동합니다.`, 'info');
      });
    });

    document.getElementById('drawerBackdrop').addEventListener('click', closeDrawer);

    // Keyboard shortcuts: '/', 'Escape', 'ArrowUp', 'ArrowDown'
    window.addEventListener('keydown', (e) => {
      const target = e.target;
      const isTyping = target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if (e.key === 'Escape') {
        if (state.confirmModal) {
          state.confirmModal = null;
          renderModals();
          return;
        }
        if (state.wizardOpen) {
          state.wizardOpen = false;
          renderModals();
          return;
        }
        if (state.drawerId) {
          closeDrawer();
          return;
        }
      }

      if (e.key === '/' && !isTyping && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (canSeeTeam()) {
          e.preventDefault();
          focusActiveSearch();
        }
        return;
      }

      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !isTyping && canSeeTeam()) {
        if (state.wizardOpen || state.confirmModal) return;
        const list = getMatchingEmployees();
        if (list.length === 0) return;

        const isDrawer = Boolean(state.drawerId);
        const isBento = state.viewMode === 'bento';
        if (!isDrawer && !isBento) return;

        e.preventDefault();
        const curId = isDrawer ? state.drawerId : state.bentoSelectedId;
        const idx = list.findIndex((emp) => emp.id === curId);
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const nextIdx = idx < 0 ? 0 : Math.max(0, Math.min(list.length - 1, idx + delta));
        const nextEmp = list[nextIdx];
        if (!nextEmp || nextEmp.id === curId) return;

        if (isDrawer) {
          state.drawerId = nextEmp.id;
          ensureAccountDraft(nextEmp);
          renderDrawer();
          renderMainContentOnly();
        } else {
          state.bentoSelectedId = nextEmp.id;
          ensureAccountDraft(nextEmp);
          renderBentoMemberList();
          renderBentoProfile();
        }
      }
    });

    function actorIdForRole(role) {
      if (role === 'owner') return 'emp-1';
      if (role === 'manager') return 'emp-2';
      return 'emp-3';
    }

    function canSeeTeam() {
      return state.actorRole === 'owner' || state.actorRole === 'manager';
    }

    function seatCounts() {
      const activeCount = state.employees.filter((e) => e.isActive).length;
      const maxUsers = state.seatMode === 'full' ? 6 : 10;
      return { activeCount, maxUsers, isFull: activeCount >= maxUsers };
    }

    function focusActiveSearch() {
      const el = document.getElementById('mainSearchInput') || document.getElementById('bentoSearchInput');
      if (el) {
        el.focus();
        el.select();
      } else {
        showToast('중개사 본인 보기에서는 팀 검색을 사용하지 않습니다.', 'info');
      }
    }

    function getMatchingEmployees() {
      const actorId = actorIdForRole(state.actorRole);
      const visible = canSeeTeam()
        ? state.employees
        : state.employees.filter((e) => e.id === actorId);

      const q = state.search.trim().toLowerCase();
      return visible.filter((emp) => {
        if (state.statusFilter === 'active' && !emp.isActive) return false;
        if (state.statusFilter === 'inactive' && emp.isActive) return false;
        if (state.roleFilter && emp.role !== state.roleFilter) return false;
        const c = countsOf(emp);
        if (state.quickFilter === 'busy' && c.workload === 0) return false;
        if (state.quickFilter === 'unsettled' && c.unsettled === 0) return false;
        if (state.quickFilter === 'attention' && c.lateCount === 0 && !isQuiet(emp)) return false;
        if (q) {
          const hay = [emp.name, emp.loginId, emp.email, emp.phone].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }).sort((a, b) => {
        if (state.statusFilter === 'all' && a.isActive !== b.isActive) {
          return Number(b.isActive) - Number(a.isActive);
        }
        if (state.sort === 'workload') {
          return countsOf(b).workload - countsOf(a).workload || a.name.localeCompare(b.name, 'ko');
        }
        if (state.sort === 'commission') {
          return b.commissionAmountTotal - a.commissionAmountTotal || a.name.localeCompare(b.name, 'ko');
        }
        if (state.sort === 'recent') {
          return a.lastActivityOrder - b.lastActivityOrder || a.name.localeCompare(b.name, 'ko');
        }
        return a.name.localeCompare(b.name, 'ko');
      });
    }

    function ensureAccountDraft(emp) {
      if (!emp) return;
      if (state.accountDraftForId !== emp.id) {
        state.accountDraft = toAccountDraft(emp);
        state.accountDraftForId = emp.id;
        state.newPasswordDraft = '';
      }
    }

    function showToast(msg, tone = 'success') {
      const stack = document.getElementById('toastStack');
      const el = document.createElement('div');
      el.className = `toast-item ${tone === 'error' ? 'is-error' : tone === 'info' ? 'is-info' : ''}`;
      el.innerHTML = `<span class="toast-dot"></span><span>${esc(msg)}</span>`;
      stack.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transition = 'opacity 180ms ease';
        setTimeout(() => el.remove(), 190);
      }, 2600);
    }

    function copyText(label, val) {
      if (!val) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(val).catch(() => {});
      }
      showToast(`${label}를 복사했습니다 (${val})`);
    }

    function openDrawer(empId, tab) {
      const emp = state.employees.find((e) => e.id === empId);
      if (!emp) return;
      state.drawerId = empId;
      if (tab) state.drawerTab = tab;
      ensureAccountDraft(emp);
      renderDrawer();
      renderMainContentOnly();
    }

    function closeDrawer() {
      state.drawerId = null;
      renderDrawer();
      renderMainContentOnly();
    }

    function renderDemoBar() {
      const bar = document.getElementById('demoBar');
      const { activeCount } = seatCounts();
      bar.innerHTML = `
        <span class="demo-brand">
          구성원 관리 모던 SaaS 시안
          <span class="demo-pill-tag">탈-NOTION · CRM/HR</span>
        </span>

        <div class="demo-group">
          <span class="demo-label">시안 보기</span>
          <div class="demo-seg" role="group" aria-label="시안 전환">
            <button type="button" data-demo-view="cards" aria-pressed="${state.viewMode === 'cards'}">시안 1 · 카드 디렉터리</button>
            <button type="button" data-demo-view="ops" aria-pressed="${state.viewMode === 'ops'}">시안 2 · 관제 허브</button>
            <button type="button" data-demo-view="bento" aria-pressed="${state.viewMode === 'bento'}">시안 3 · 벤토 프로필</button>
          </div>
        </div>

        <div class="demo-group">
          <span class="demo-label">권한</span>
          <div class="demo-seg" role="group" aria-label="로그인 역할 시뮬레이션">
            <button type="button" data-demo-role="owner" aria-pressed="${state.actorRole === 'owner'}">대표</button>
            <button type="button" data-demo-role="manager" aria-pressed="${state.actorRole === 'manager'}">매니저</button>
            <button type="button" data-demo-role="agent" aria-pressed="${state.actorRole === 'agent'}">중개사</button>
          </div>
        </div>

        <div class="demo-group">
          <span class="demo-label">슬롯</span>
          <div class="demo-seg" role="group" aria-label="계정 슬롯 시뮬레이션">
            <button type="button" data-demo-seat="available" aria-pressed="${state.seatMode === 'available'}">여유 (${activeCount}/10)</button>
            <button type="button" data-demo-seat="full" aria-pressed="${state.seatMode === 'full'}">한도 (${activeCount}/6)</button>
          </div>
        </div>

        <div class="demo-links">
          <a class="demo-link ${state.currentPage === 'index' ? 'is-current' : ''}" href="./index.html">전체</a>
          <a class="demo-link ${state.currentPage === 'option-a' ? 'is-current' : ''}" href="./option-a.html">시안 1</a>
          <a class="demo-link ${state.currentPage === 'option-b' ? 'is-current' : ''}" href="./option-b.html">시안 2</a>
          <a class="demo-link ${state.currentPage === 'option-c' ? 'is-current' : ''}" href="./option-c.html">시안 3</a>
        </div>
      `;

      bar.querySelectorAll('[data-demo-view]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const next = btn.getAttribute('data-demo-view');
          if (next === state.viewMode) return;
          if (next === 'bento' && state.drawerId) {
            state.bentoSelectedId = state.drawerId;
          }
          state.drawerId = null;
          state.viewMode = next;
          renderAll();
        });
      });

      bar.querySelectorAll('[data-demo-role]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const next = btn.getAttribute('data-demo-role');
          if (next === state.actorRole) return;
          state.actorRole = next;
          state.accountDraftForId = null;
          state.drawerId = null;
          if (next === 'agent') state.bentoSelectedId = actorIdForRole('agent');
          renderAll();
          showToast(`'${ROLE_LABELS[next]}' 권한 시점으로 전환했습니다.`, 'info');
        });
      });

      bar.querySelectorAll('[data-demo-seat]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.seatMode = btn.getAttribute('data-demo-seat');
          renderAll();
        });
      });
    }

    function renderTopbarActor() {
      const actor = state.employees.find((e) => e.id === actorIdForRole(state.actorRole)) || state.employees[0];
      const { activeCount, maxUsers } = seatCounts();
      document.getElementById('actorChipMount').innerHTML = `
        <div class="actor-chip">
          <span class="av-circle av-xs ${esc(actor.avatarTone)}">${esc(actor.name.charAt(0))}</span>
          <span>${esc(actor.name)} · ${esc(ROLE_LABELS[state.actorRole])}</span>
        </div>
      `;
      document.getElementById('sidebarPlanText').textContent = `프로 플랜 · 계정 ${activeCount}/${maxUsers}석`;
    }

    function renderMainCanvas() {
      const canvas = document.getElementById('mainCanvas');
      if (!canSeeTeam()) {
        canvas.className = 'main-canvas';
        const self = state.employees.find((e) => e.id === actorIdForRole('agent')) || state.employees[0];
        ensureAccountDraft(self);
        canvas.innerHTML = `<div class="bento-profile-wrap" id="soloProfileHost"></div>`;
        renderFullProfile(document.getElementById('soloProfileHost'), self, { isSolo: true });
        return;
      }

      if (state.viewMode === 'bento') {
        canvas.className = 'main-canvas is-bento-shell';
        const { activeCount, maxUsers, isFull } = seatCounts();
        const activeTotal = state.employees.filter((e) => e.isActive).length;
        const inactiveTotal = state.employees.length - activeTotal;

        canvas.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex:none;">
            <div>
              <h1 class="page-title" style="font-size:20px;line-height:26px;">구성원 관리</h1>
              <p class="page-sub" style="margin-top:1px;font-size:12.5px;">구성원별 진행 업무, 상담 타임라인과 인사·급여 조건을 한 화면에서 관리합니다.</p>
            </div>
            <div class="header-actions">
              <div class="seat-card ${isFull ? 'is-full' : ''}" id="bentoSeatCard"></div>
              <button type="button" class="btn-blue pressable" id="openWizardBtn">
                ${ic('plus', 'ic ic-sm')}
                <span>구성원 추가</span>
              </button>
            </div>
          </div>

          <div class="bento-shell">
            <aside class="bento-nav-card" aria-label="구성원 목록">
              <div class="bento-nav-head">
                <div class="bento-nav-top">
                  <div class="seg-track" role="tablist" aria-label="재직 상태" id="bentoStatusTabs" style="width:100%;">
                    <button type="button" class="seg-btn" style="flex:1;justify-content:center;" role="tab" aria-selected="${state.statusFilter === 'active'}" data-bento-status="active">재직 <span class="seg-count num">${activeTotal}</span></button>
                    <button type="button" class="seg-btn" style="flex:1;justify-content:center;" role="tab" aria-selected="${state.statusFilter === 'inactive'}" data-bento-status="inactive">비활성 <span class="seg-count num">${inactiveTotal}</span></button>
                    <button type="button" class="seg-btn" style="flex:1;justify-content:center;" role="tab" aria-selected="${state.statusFilter === 'all'}" data-bento-status="all">전체 <span class="seg-count num">${state.employees.length}</span></button>
                  </div>
                </div>
                <label class="search-box" style="max-width:none;">
                  ${ic('search', 'ic ic-sm')}
                  <input id="bentoSearchInput" type="text" value="${esc(state.search)}" placeholder="이름, 아이디, 연락처">
                </label>
              </div>
              <div class="bento-nav-scroll" id="bentoMemberList"></div>
            </aside>

            <div class="bento-main-scroll">
              <div class="bento-profile-wrap" id="bentoProfileHost"></div>
            </div>
          </div>
        `;

        renderSeatCard(document.getElementById('bentoSeatCard'), activeCount, maxUsers, isFull);
        document.getElementById('openWizardBtn').addEventListener('click', openAddWizard);

        const bSearch = document.getElementById('bentoSearchInput');
        bSearch.addEventListener('input', (e) => {
          state.search = e.target.value;
          renderBentoMemberList();
          renderBentoProfile();
        });

        canvas.querySelectorAll('[data-bento-status]').forEach((btn) => {
          btn.addEventListener('click', () => {
            state.statusFilter = btn.getAttribute('data-bento-status');
            renderMainCanvas();
          });
        });

        renderBentoMemberList();
        renderBentoProfile();
        return;
      }

      // View 1 (cards) & View 2 (ops) share the spacious top header + KPI + filter bar
      canvas.className = 'main-canvas';
      const activeTotal = state.employees.filter((e) => e.isActive).length;
      const inactiveTotal = state.employees.length - activeTotal;

      canvas.innerHTML = `
        <div class="canvas-container">
          <header class="page-header">
            <div>
              <h1 class="page-title">구성원 관리</h1>
              <p class="page-sub">
                ${state.viewMode === 'cards'
                  ? '구성원 카드에서 업무 부하와 활동 상태를 살펴보고, 클릭해 프로필과 인사·급여를 바로 관리합니다.'
                  : '중개법인의 성과 리더보드, 긴급 처리 대기열과 구성원별 업무 현황을 실시간으로 관제합니다.'}
              </p>
            </div>
            <div class="header-actions">
              <div class="seat-card" id="mainSeatCard"></div>
              <button type="button" class="btn-blue pressable" id="openWizardBtn">
                ${ic('plus', 'ic ic-sm')}
                <span>구성원 추가</span>
              </button>
            </div>
          </header>

          <section class="kpi-grid" id="kpiGridHost" aria-label="팀 현황 요약"></section>

          <section class="filter-bar" aria-label="구성원 필터 및 정렬">
            <div class="seg-track" role="tablist" aria-label="재직 상태" id="mainStatusTabs">
              <button type="button" class="seg-btn" role="tab" aria-selected="${state.statusFilter === 'active'}" data-main-status="active">재직 중 <span class="seg-count num">${activeTotal}</span></button>
              <button type="button" class="seg-btn" role="tab" aria-selected="${state.statusFilter === 'inactive'}" data-main-status="inactive">비활성 <span class="seg-count num">${inactiveTotal}</span></button>
              <button type="button" class="seg-btn" role="tab" aria-selected="${state.statusFilter === 'all'}" data-main-status="all">전체 <span class="seg-count num">${state.employees.length}</span></button>
            </div>

            <label class="search-box">
              ${ic('search', 'ic ic-sm')}
              <input id="mainSearchInput" type="text" value="${esc(state.search)}" placeholder="이름, 아이디, 연락처 검색 ( / )">
            </label>

            <div class="filter-right">
              <select class="filter-select" id="roleFilterSelect" aria-label="역할 필터">
                <option value="" ${!state.roleFilter ? 'selected' : ''}>모든 역할</option>
                <option value="owner" ${state.roleFilter === 'owner' ? 'selected' : ''}>대표</option>
                <option value="manager" ${state.roleFilter === 'manager' ? 'selected' : ''}>매니저</option>
                <option value="agent" ${state.roleFilter === 'agent' ? 'selected' : ''}>중개사</option>
              </select>

              <select class="filter-select" id="sortSelect" aria-label="정렬 기준">
                <option value="workload" ${state.sort === 'workload' ? 'selected' : ''}>업무량순</option>
                <option value="commission" ${state.sort === 'commission' ? 'selected' : ''}>누적 수수료순</option>
                <option value="recent" ${state.sort === 'recent' ? 'selected' : ''}>최근 활동순</option>
                <option value="name" ${state.sort === 'name' ? 'selected' : ''}>이름순</option>
              </select>

              <span id="filterResetHost"></span>
            </div>
          </section>

          <div id="viewContentHost" style="display:flex;flex-direction:column;gap:16px;"></div>
        </div>
      `;

      const { activeCount, maxUsers, isFull } = seatCounts();
      renderSeatCard(document.getElementById('mainSeatCard'), activeCount, maxUsers, isFull);
      document.getElementById('openWizardBtn').addEventListener('click', openAddWizard);

      canvas.querySelectorAll('[data-main-status]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.statusFilter = btn.getAttribute('data-main-status');
          renderMainCanvas();
        });
      });

      const mSearch = document.getElementById('mainSearchInput');
      mSearch.addEventListener('input', (e) => {
        state.search = e.target.value;
        renderFilterResetBtn();
        renderMainContentOnly();
      });

      document.getElementById('roleFilterSelect').addEventListener('change', (e) => {
        state.roleFilter = e.target.value;
        renderFilterResetBtn();
        renderMainContentOnly();
      });

      document.getElementById('sortSelect').addEventListener('change', (e) => {
        state.sort = e.target.value;
        renderFilterResetBtn();
        renderMainContentOnly();
      });

      renderKpiGrid();
      renderFilterResetBtn();
      renderMainContentOnly();
    }

    function renderSeatCard(el, activeCount, maxUsers, isFull) {
      if (!el) return;
      const pct = Math.min(100, Math.round((activeCount / maxUsers) * 100));
      el.className = `seat-card ${isFull ? 'is-full' : ''}`;
      el.innerHTML = `
        <span>사용 중인 계정 <strong class="num">${activeCount} / ${maxUsers}석</strong></span>
        <span class="seat-bar" aria-hidden="true"><span class="seat-bar-fill" style="width:${pct}%"></span></span>
      `;
    }

    function renderFilterResetBtn() {
      const host = document.getElementById('filterResetHost');
      if (!host) return;
      const dirty = Boolean(state.search.trim() || state.roleFilter || state.quickFilter !== 'all' || state.sort !== 'workload');
      host.innerHTML = dirty
        ? `<button type="button" class="btn-subtle pressable" id="resetMainFiltersBtn">${ic('rotateCcw', 'ic ic-sm')}<span>초기화</span></button>`
        : '';
      const btn = document.getElementById('resetMainFiltersBtn');
      if (btn) {
        btn.addEventListener('click', () => {
          state.search = '';
          state.roleFilter = '';
          state.quickFilter = 'all';
          state.sort = 'workload';
          renderMainCanvas();
        });
      }
    }

    function renderKpiGrid() {
      const host = document.getElementById('kpiGridHost');
      if (!host) return;
      const activeEmps = state.employees.filter((e) => e.isActive);
      const inactiveCount = state.employees.length - activeEmps.length;
      const agg = activeEmps.reduce((acc, emp) => {
        const c = countsOf(emp);
        acc.tasks += c.tasks;
        acc.customers += c.customers;
        acc.deals += c.deals;
        acc.workload += c.workload;
        if (c.unsettled > 0) {
          acc.unsettledPeople += 1;
          acc.unsettledMoney += c.unsettledMoney;
        }
        if (c.lateCount > 0 || isQuiet(emp)) acc.attentionPeople += 1;
        return acc;
      }, { tasks: 0, customers: 0, deals: 0, workload: 0, unsettledPeople: 0, unsettledMoney: 0, attentionPeople: 0 });

      host.innerHTML = `
        <button type="button" class="kpi-card pressable ${state.quickFilter === 'all' ? 'is-selected' : ''}" data-kpi="all">
          <div class="kpi-top">
            <span class="kpi-label">재직 구성원</span>
            <span class="kpi-icon-box is-blue">${ic('users', 'ic ic-sm')}</span>
          </div>
          <div class="kpi-value num">${activeEmps.length}명</div>
          <div class="kpi-hint num">비활성 ${inactiveCount}명 · 전체 ${state.employees.length}명</div>
        </button>

        <button type="button" class="kpi-card pressable ${state.quickFilter === 'busy' ? 'is-selected' : ''}" data-kpi="busy">
          <div class="kpi-top">
            <span class="kpi-label">진행 중 총 업무</span>
            <span class="kpi-icon-box">${ic('briefcase', 'ic ic-sm')}</span>
          </div>
          <div class="kpi-value num">${agg.workload}건</div>
          <div class="kpi-hint num">업무 ${agg.tasks} · 고객 ${agg.customers} · 거래 ${agg.deals}</div>
        </button>

        <button type="button" class="kpi-card pressable ${state.quickFilter === 'unsettled' ? 'is-selected' : ''}" data-kpi="unsettled">
          <div class="kpi-top">
            <span class="kpi-label">미정산 수수료</span>
            <span class="kpi-icon-box is-amber">${ic('wallet', 'ic ic-sm')}</span>
          </div>
          <div class="kpi-value num">${agg.unsettledPeople}명</div>
          <div class="kpi-hint num">${agg.unsettledMoney > 0 ? `미정산 합계 ${formatManwon(agg.unsettledMoney)}` : '미정산 없음'}</div>
        </button>

        <button type="button" class="kpi-card pressable ${state.quickFilter === 'attention' ? 'is-selected' : ''}" data-kpi="attention">
          <div class="kpi-top">
            <span class="kpi-label">관심 필요</span>
            <span class="kpi-icon-box is-red">${ic('alert', 'ic ic-sm')}</span>
          </div>
          <div class="kpi-value num">${agg.attentionPeople}명</div>
          <div class="kpi-hint">기한 지연 또는 7일+ 활동 없음</div>
        </button>
      `;

      host.querySelectorAll('[data-kpi]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const k = btn.getAttribute('data-kpi');
          if (k === 'all') {
            state.quickFilter = 'all';
          } else {
            state.statusFilter = 'active';
            state.quickFilter = state.quickFilter === k ? 'all' : k;
          }
          renderKpiGrid();
          renderFilterResetBtn();
          renderMainContentOnly();
        });
      });
    }

    function renderMainContentOnly() {
      if (state.viewMode === 'bento') {
        renderBentoMemberList();
        renderBentoProfile();
        return;
      }

      const host = document.getElementById('viewContentHost');
      if (!host) return;
      const list = getMatchingEmployees();
      const maxWorkload = Math.max(1, ...state.employees.map((e) => countsOf(e).workload));
      const actorId = actorIdForRole(state.actorRole);

      if (state.viewMode === 'cards') {
        if (list.length === 0) {
          host.innerHTML = renderEmptyCard();
          bindEmptyReset();
          return;
        }
        host.innerHTML = `
          <section class="card-grid" aria-label="구성원 카드 디렉터리">
            ${list.map((emp) => {
              const c = countsOf(emp);
              const quiet = isQuiet(emp);
              const isSelf = emp.id === actorId;
              const isSel = state.drawerId === emp.id;
              const tPct = (c.tasks / maxWorkload) * 100;
              const bPct = (c.customers / maxWorkload) * 100;
              const dPct = (c.deals / maxWorkload) * 100;

              let statusBadge = `<span class="pill pill-emerald">정상 진행</span>`;
              if (!emp.isActive) statusBadge = `<span class="pill pill-gray">비활성 계정</span>`;
              else if (c.lateCount > 0) statusBadge = `<span class="pill pill-red num">기한 지연 ${c.lateCount}건</span>`;
              else if (quiet) statusBadge = `<span class="pill pill-amber num">${emp.quietDays == null ? '활동 없음' : `${emp.quietDays}일째 무활동`}</span>`;
              else if (c.unsettled > 0) statusBadge = `<span class="pill pill-amber num">미정산 ${c.unsettled}건</span>`;

              const payMeta = state.actorRole === 'owner'
                ? `<span class="mc-pay-tag num">${esc(paySummaryText(emp))}</span>`
                : `<span class="mc-pay-tag num">${esc(emp.lastActivityLabel ? `최근 ${emp.lastActivityLabel}` : '활동 없음')}</span>`;

              return `
                <article class="member-card ${isSel ? 'is-selected' : ''}" data-card-emp="${esc(emp.id)}" tabindex="0">
                  <div class="mc-head">
                    <div class="mc-person">
                      <span class="av-wrap">
                        <span class="av-circle av-md ${esc(emp.avatarTone)}">${esc(emp.name.charAt(0))}</span>
                        <span class="av-dot ${avatarDotClass(emp)}" title="${emp.isActive ? (quiet ? '7일 이상 활동 없음' : '정상 활동') : '비활성'}"></span>
                      </span>
                      <div style="min-width:0">
                        <div class="mc-name-row">
                          <span class="mc-name trunc">${esc(emp.name)}</span>
                          ${isSelf ? '<span class="pill pill-blue" style="height:19px;font-size:10.5px;">나</span>' : ''}
                        </div>
                        <div class="mc-sub">
                          <span class="pill ${roleBadgeClass(emp.role)}" style="height:19px;font-size:11px;">${esc(ROLE_LABELS[emp.role])}</span>
                          <span class="trunc">${esc(LICENSE_LABELS[emp.licenseType] || '자격 미지정')}</span>
                        </div>
                      </div>
                    </div>
                    ${emp.phone ? `
                      <button type="button" class="mc-quick-btn pressable" data-copy-phone="${esc(emp.phone)}" title="전화번호 복사 (${esc(emp.phone)})" aria-label="${esc(emp.name)} 전화번호 복사">
                        ${ic('phone', 'ic ic-sm')}
                      </button>
                    ` : ''}
                  </div>

                  <div class="mc-stats">
                    <div class="mc-stat-box">
                      <div class="mc-stat-lbl">진행 업무</div>
                      <div class="mc-stat-val num">${c.tasks}<span style="font-size:12px;font-weight:500;color:var(--ink-3);margin-left:1px">건</span></div>
                    </div>
                    <div class="mc-stat-box">
                      <div class="mc-stat-lbl">담당 고객</div>
                      <div class="mc-stat-val num">${c.customers}<span style="font-size:12px;font-weight:500;color:var(--ink-3);margin-left:1px">명</span></div>
                    </div>
                    <div class="mc-stat-box">
                      <div class="mc-stat-lbl">진행 거래</div>
                      <div class="mc-stat-val num">${c.deals}<span style="font-size:12px;font-weight:500;color:var(--ink-3);margin-left:1px">건</span></div>
                    </div>
                  </div>

                  <div class="mc-bar-wrap">
                    <div class="mc-bar" aria-hidden="true">
                      ${c.tasks > 0 ? `<span class="seg-task" style="width:${tPct}%"></span>` : ''}
                      ${c.customers > 0 ? `<span class="seg-buyer" style="width:${bPct}%"></span>` : ''}
                      ${c.deals > 0 ? `<span class="seg-deal" style="width:${dPct}%"></span>` : ''}
                    </div>
                    <span class="mc-bar-meta num">총 ${c.workload}</span>
                  </div>

                  <div class="mc-footer">
                    ${statusBadge}
                    ${payMeta}
                  </div>
                </article>
              `;
            }).join('')}
          </section>
        `;

        host.querySelectorAll('[data-card-emp]').forEach((card) => {
          card.addEventListener('click', (e) => {
            if (e.target.closest('[data-copy-phone]')) return;
            openDrawer(card.getAttribute('data-card-emp'));
          });
          card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openDrawer(card.getAttribute('data-card-emp'));
            }
          });
        });

        host.querySelectorAll('[data-copy-phone]').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            copyText('전화번호', btn.getAttribute('data-copy-phone'));
          });
        });
        return;
      }

      // View 2: Brokerage Ops Hub (Leaderboard + Attention Queue + Clean Borderless Table)
      const activeTeam = state.employees.filter((e) => e.isActive);
      const lbSorted = [...activeTeam].sort((a, b) => {
        if (state.lbMetric === 'commission') return b.commissionAmountTotal - a.commissionAmountTotal;
        if (state.lbMetric === 'consultations') return b.consultationCount - a.consultationCount;
        return countsOf(b).workload - countsOf(a).workload;
      });
      const lbMax = Math.max(1, ...lbSorted.map((e) => {
        if (state.lbMetric === 'commission') return e.commissionAmountTotal;
        if (state.lbMetric === 'consultations') return e.consultationCount;
        return countsOf(e).workload;
      }));

      // Team-wide Attention Queue
      const teamQueue = [];
      for (const emp of activeTeam) {
        for (const t of emp.tasks) {
          if (t.dueDays != null && t.dueDays <= 0) {
            teamQueue.push({
              emp,
              late: t.dueDays < 0,
              rank: t.dueDays,
              badge: t.dueDays < 0 ? `${Math.abs(t.dueDays)}일 지연` : '오늘 마감',
              title: t.title,
              sub: `${emp.name} · 담당 업무`,
              tab: 'work',
            });
          }
        }
        for (const b of emp.buyers) {
          if (b.status === '활성' && b.nextContactDays != null && b.nextContactDays <= 0) {
            teamQueue.push({
              emp,
              late: b.nextContactDays < 0,
              rank: b.nextContactDays,
              badge: b.nextContactDays < 0 ? `${Math.abs(b.nextContactDays)}일 지연` : '오늘 연락',
              title: `${b.name} 고객 연락 예정`,
              sub: `${emp.name} · 희망매물`,
              tab: 'work',
            });
          }
        }
        if (isQuiet(emp)) {
          teamQueue.push({
            emp,
            late: false,
            rank: 1,
            badge: emp.quietDays == null ? '활동 없음' : `${emp.quietDays}일 무활동`,
            title: `${emp.name}님 최근 활동 기록 확인 필요`,
            sub: `${ROLE_LABELS[emp.role]} · 타임라인 점검`,
            tab: 'timeline',
          });
        }
      }
      teamQueue.sort((a, b) => a.rank - b.rank);

      host.innerHTML = `
        <section class="ops-grid-2">
          <div class="panel-card">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">팀 성과 · 업무량 리더보드</h2>
                <div class="panel-sub">막대를 누르면 해당 구성원의 상세 드로어를 엽니다</div>
              </div>
              <div class="seg-track" role="group" aria-label="리더보드 지표">
                <button type="button" class="seg-btn" aria-pressed="${state.lbMetric === 'commission'}" data-lb-metric="commission">수수료</button>
                <button type="button" class="seg-btn" aria-pressed="${state.lbMetric === 'consultations'}" data-lb-metric="consultations">상담</button>
                <button type="button" class="seg-btn" aria-pressed="${state.lbMetric === 'workload'}" data-lb-metric="workload">업무량</button>
              </div>
            </div>
            <div class="lb-list">
              ${lbSorted.map((emp) => {
                const rawVal = state.lbMetric === 'commission'
                  ? emp.commissionAmountTotal
                  : state.lbMetric === 'consultations'
                    ? emp.consultationCount
                    : countsOf(emp).workload;
                const pct = Math.max(4, Math.round((rawVal / lbMax) * 100));
                const fillCls = state.lbMetric === 'commission'
                  ? 'is-emerald'
                  : state.lbMetric === 'consultations'
                    ? 'is-indigo'
                    : '';
                const labelVal = state.lbMetric === 'commission'
                  ? formatManwon(rawVal)
                  : state.lbMetric === 'consultations'
                    ? `${rawVal}건`
                    : `${rawVal}건`;
                return `
                  <button type="button" class="lb-row" data-open-drawer="${esc(emp.id)}">
                    <span class="lb-person">
                      <span class="av-circle av-xs ${esc(emp.avatarTone)}">${esc(emp.name.charAt(0))}</span>
                      <span class="trunc">${esc(emp.name)}</span>
                    </span>
                    <span class="lb-track"><span class="lb-fill ${fillCls}" style="width:${rawVal === 0 ? 0 : pct}%"></span></span>
                    <span class="lb-val num">${esc(labelVal)}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <div class="panel-card">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">지금 확인이 필요한 항목</h2>
                <div class="panel-sub">팀 전체의 기한 지연·오늘 연락·무활동 구성원 집계</div>
              </div>
              <span class="pill ${teamQueue.some((q) => q.late) ? 'pill-red' : 'pill-amber'} num">${teamQueue.length}건</span>
            </div>
            <div class="queue-scroll">
              ${teamQueue.length === 0 ? '<div style="padding:24px;text-align:center;color:var(--ink-3);font-size:13px;">긴급하게 확인할 항목이 없습니다.</div>' : teamQueue.map((q) => `
                <button type="button" class="queue-item pressable" data-queue-emp="${esc(q.emp.id)}" data-queue-tab="${esc(q.tab)}">
                  <span class="queue-dot ${q.late ? 'is-late' : ''}"></span>
                  <div class="queue-body">
                    <div class="queue-title trunc">${esc(q.title)}</div>
                    <div class="queue-meta">${esc(q.sub)}</div>
                  </div>
                  <span class="pill ${q.late ? 'pill-red' : 'pill-amber'} num">${esc(q.badge)}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </section>

        <section class="panel-card">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">구성원 현황표 <span class="num" style="color:var(--ink-3);font-weight:500;margin-left:4px">${list.length}명</span></h2>
            </div>
            <div style="display:flex;align-items:center;gap:12px;font-size:12px;color:var(--ink-3);">
              <span style="display:inline-flex;align-items:center;gap:5px;"><i style="width:8px;height:8px;border-radius:2px;background:#3182f6;display:inline-block"></i>업무</span>
              <span style="display:inline-flex;align-items:center;gap:5px;"><i style="width:8px;height:8px;border-radius:2px;background:#6366f1;display:inline-block"></i>고객</span>
              <span style="display:inline-flex;align-items:center;gap:5px;"><i style="width:8px;height:8px;border-radius:2px;background:#10b981;display:inline-block"></i>거래</span>
            </div>
          </div>

          ${list.length === 0 ? renderEmptyCard(true) : `
            <div class="clean-table-wrap">
              <table class="clean-table" aria-label="구성원 관제 표">
                <thead>
                  <tr>
                    <th>구성원</th>
                    <th>역할${state.actorRole === 'owner' ? ' · 보상' : ''}</th>
                    <th style="width:210px;">업무 부하</th>
                    <th>누적 실적</th>
                    <th>미정산</th>
                    <th>최근 활동</th>
                    <th style="text-align:right;">빠른 작업</th>
                  </tr>
                </thead>
                <tbody>
                  ${list.map((emp) => {
                    const c = countsOf(emp);
                    const quiet = isQuiet(emp);
                    const isSelf = emp.id === actorId;
                    const isSel = state.drawerId === emp.id;
                    const tPct = (c.tasks / maxWorkload) * 100;
                    const bPct = (c.customers / maxWorkload) * 100;
                    const dPct = (c.deals / maxWorkload) * 100;
                    return `
                      <tr data-ops-row="${esc(emp.id)}" class="${isSel ? 'is-selected' : ''}">
                        <td>
                          <div style="display:flex;align-items:center;gap:10px;">
                            <span class="av-wrap">
                              <span class="av-circle av-sm ${esc(emp.avatarTone)}">${esc(emp.name.charAt(0))}</span>
                              <span class="av-dot is-sm ${avatarDotClass(emp)}"></span>
                            </span>
                            <div style="min-width:0;">
                              <div style="display:flex;align-items:center;gap:5px;">
                                <span style="font-weight:600;color:${emp.isActive ? 'var(--ink)' : 'var(--ink-3)'}">${esc(emp.name)}</span>
                                ${isSelf ? '<span class="pill pill-blue" style="height:18px;font-size:10.5px;">나</span>' : ''}
                                ${!emp.isActive ? '<span class="pill pill-gray" style="height:18px;font-size:10.5px;">비활성</span>' : ''}
                              </div>
                              <div style="font-size:12px;color:var(--ink-3);">${esc(LICENSE_LABELS[emp.licenseType] || '자격 미지정')} · ${esc(emp.loginId)}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                            <span class="pill ${roleBadgeClass(emp.role)}">${esc(ROLE_LABELS[emp.role])}</span>
                            ${state.actorRole === 'owner' && emp.role !== 'owner' ? `<span style="font-size:12px;color:var(--ink-2);" class="num">${esc(paySummaryText(emp))}</span>` : ''}
                          </div>
                        </td>
                        <td>
                          <div class="mc-bar-wrap">
                            <div class="mc-bar">
                              ${c.tasks > 0 ? `<span class="seg-task" style="width:${tPct}%"></span>` : ''}
                              ${c.customers > 0 ? `<span class="seg-buyer" style="width:${bPct}%"></span>` : ''}
                              ${c.deals > 0 ? `<span class="seg-deal" style="width:${dPct}%"></span>` : ''}
                            </div>
                            <span class="mc-bar-meta num" style="min-width:64px;text-align:right;color:var(--ink-2);font-weight:600">${c.workload}건</span>
                          </div>
                          <div style="font-size:11.5px;color:var(--ink-3);margin-top:3px;" class="num">업무 ${c.tasks} · 고객 ${c.customers} · 거래 ${c.deals}</div>
                        </td>
                        <td>
                          <div style="font-weight:600;" class="num">${esc(formatManwon(emp.commissionAmountTotal))}</div>
                          <div style="font-size:11.5px;color:var(--ink-3);" class="num">상담 ${emp.consultationCount}건</div>
                        </td>
                        <td>
                          ${c.unsettled > 0
                            ? `<span class="pill pill-amber num">${c.unsettled}건 · ${esc(formatManwon(c.unsettledMoney))}</span>`
                            : '<span style="color:var(--ink-3)">—</span>'}
                        </td>
                        <td>
                          ${quiet
                            ? `<span class="pill pill-amber num">${emp.quietDays == null ? '활동 없음' : `${emp.quietDays}일째 무활동`}</span>`
                            : `<span style="color:var(--ink-2)">${esc(emp.lastActivityLabel || '—')}</span>`}
                        </td>
                        <td style="text-align:right;">
                          <div style="display:inline-flex;align-items:center;gap:6px;">
                            ${emp.phone ? `
                              <button type="button" class="btn-subtle pressable" data-copy-phone="${esc(emp.phone)}" title="전화번호 복사">
                                ${ic('copy', 'ic ic-sm')}
                              </button>
                            ` : ''}
                            <button type="button" class="btn-soft pressable" style="height:29px;font-size:12px;" data-open-drawer="${esc(emp.id)}">프로필</button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </section>
      `;

      if (list.length === 0) bindEmptyReset();

      host.querySelectorAll('[data-lb-metric]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.lbMetric = btn.getAttribute('data-lb-metric');
          renderMainContentOnly();
        });
      });

      host.querySelectorAll('[data-open-drawer]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openDrawer(btn.getAttribute('data-open-drawer'));
        });
      });

      host.querySelectorAll('[data-queue-emp]').forEach((btn) => {
        btn.addEventListener('click', () => {
          openDrawer(btn.getAttribute('data-queue-emp'), btn.getAttribute('data-queue-tab'));
        });
      });

      host.querySelectorAll('[data-ops-row]').forEach((row) => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('[data-copy-phone]') || e.target.closest('[data-open-drawer]')) return;
          openDrawer(row.getAttribute('data-ops-row'));
        });
      });

      host.querySelectorAll('[data-copy-phone]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          copyText('전화번호', btn.getAttribute('data-copy-phone'));
        });
      });
    }

    function renderEmptyCard(inline = false) {
      return `
        <div class="${inline ? '' : 'panel-card'}" style="padding:48px 20px;text-align:center;">
          <div style="font-size:14px;font-weight:600;color:var(--ink);">조건에 맞는 구성원이 없습니다</div>
          <div style="font-size:13px;color:var(--ink-3);margin-top:4px;">검색어나 상태·역할 필터를 초기화해 보세요.</div>
          <button type="button" class="btn-soft pressable" id="emptyResetBtn" style="margin-top:14px;">필터 초기화</button>
        </div>
      `;
    }

    function bindEmptyReset() {
      const btn = document.getElementById('emptyResetBtn');
      if (btn) {
        btn.addEventListener('click', () => {
          state.statusFilter = 'all';
          state.roleFilter = '';
          state.quickFilter = 'all';
          state.search = '';
          state.sort = 'workload';
          renderMainCanvas();
        });
      }
    }

    // =========================================================
    // View 3: Bento Member List + Full Profile Workspace
    // =========================================================
    function renderBentoMemberList() {
      const host = document.getElementById('bentoMemberList');
      if (!host) return;
      const list = getMatchingEmployees();
      const actorId = actorIdForRole(state.actorRole);
      const selected = list.find((e) => e.id === state.bentoSelectedId) || list[0] || null;
      if (selected) state.bentoSelectedId = selected.id;

      if (list.length === 0) {
        host.innerHTML = '<div style="padding:36px 12px;text-align:center;font-size:12.5px;color:var(--ink-3);">일치하는 구성원이 없습니다.</div>';
        return;
      }

      host.innerHTML = list.map((emp) => {
        const c = countsOf(emp);
        const quiet = isQuiet(emp);
        const isSel = selected && selected.id === emp.id;
        return `
          <button type="button" class="bento-member-btn ${isSel ? 'is-selected' : ''}" data-bento-pick="${esc(emp.id)}" aria-current="${isSel ? 'true' : 'false'}">
            <span class="av-wrap">
              <span class="av-circle av-sm ${esc(emp.avatarTone)}">${esc(emp.name.charAt(0))}</span>
              <span class="av-dot is-sm ${avatarDotClass(emp)}"></span>
            </span>
            <div style="min-width:0;flex:1;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                <span class="trunc" style="font-size:13.5px;font-weight:600;color:${emp.isActive ? 'var(--ink)' : 'var(--ink-3)'}">
                  ${esc(emp.name)}
                  ${emp.id === actorId ? '<span style="font-size:11px;color:var(--blue);font-weight:600;margin-left:3px;">나</span>' : ''}
                </span>
                <span class="num" style="font-size:11.5px;font-weight:600;color:${c.lateCount > 0 ? 'var(--red)' : quiet ? 'var(--amber)' : 'var(--ink-3)'}">
                  ${c.lateCount > 0 ? `지연 ${c.lateCount}` : quiet ? '무활동' : `${c.workload}건`}
                </span>
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:2px;font-size:11.5px;color:var(--ink-3);">
                <span>${esc(ROLE_LABELS[emp.role])}</span>
                <span class="num">${c.unsettled > 0 ? `미정산 ${c.unsettled}건` : esc(emp.lastActivityLabel || '기록 없음')}</span>
              </div>
            </div>
          </button>
        `;
      }).join('');

      host.querySelectorAll('[data-bento-pick]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.bentoSelectedId = btn.getAttribute('data-bento-pick');
          const emp = state.employees.find((e) => e.id === state.bentoSelectedId);
          ensureAccountDraft(emp);
          renderBentoMemberList();
          renderBentoProfile();
        });
      });
    }

    function renderBentoProfile() {
      const host = document.getElementById('bentoProfileHost');
      if (!host) return;
      const emp = state.employees.find((e) => e.id === state.bentoSelectedId);
      if (!emp) {
        host.innerHTML = renderEmptyCard();
        bindEmptyReset();
        return;
      }
      ensureAccountDraft(emp);
      renderFullProfile(host, emp, { isSolo: false });
    }

    function renderFullProfile(host, emp, { isSolo }) {
      const c = countsOf(emp);
      const quiet = isQuiet(emp);
      const actorId = actorIdForRole(state.actorRole);
      const isSelf = emp.id === actorId;
      const tlAll = emp.timeline.reduce((s, d) => s + d.items.length, 0);

      host.innerHTML = `
        <section class="hero-card">
          <div class="hero-top">
            <div class="hero-identity">
              <span class="av-wrap">
                <span class="av-circle av-lg ${esc(emp.avatarTone)}">${esc(emp.name.charAt(0))}</span>
                <span class="av-dot ${avatarDotClass(emp)}"></span>
              </span>
              <div style="min-width:0;">
                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:7px;">
                  <h2 class="hero-name">${esc(emp.name)}</h2>
                  <span class="pill ${roleBadgeClass(emp.role)}">${esc(ROLE_LABELS[emp.role])}</span>
                  <span class="pill pill-gray">${esc(LICENSE_LABELS[emp.licenseType] || '자격 미지정')}</span>
                  ${isSelf ? '<span class="pill pill-blue">나</span>' : ''}
                  ${!emp.isActive ? '<span class="pill pill-gray">비활성</span>' : ''}
                </div>
                <div class="hero-meta">
                  <span>아이디 <strong style="color:var(--ink);font-weight:600;">${esc(emp.loginId)}</strong></span>
                  <span>·</span>
                  <span>등록 ${esc(emp.createdAt)}</span>
                  <span>·</span>
                  <span style="color:${quiet ? 'var(--amber)' : 'var(--ink-2)'};">${emp.lastActivityLabel ? `마지막 활동 ${esc(emp.lastActivityLabel)}` : '활동 기록 없음'}</span>
                </div>
                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:8px;">
                  ${emp.phone ? `<button type="button" class="copy-chip num" data-copy-chip="${esc(emp.phone)}" data-copy-lbl="전화번호">${ic('phone', 'ic ic-sm')}<span>${esc(emp.phone)}</span></button>` : ''}
                  ${emp.email ? `<button type="button" class="copy-chip" data-copy-chip="${esc(emp.email)}" data-copy-lbl="이메일">${ic('mail', 'ic ic-sm')}<span>${esc(emp.email)}</span></button>` : ''}
                </div>
              </div>
            </div>
            ${!isSolo && state.bentoTab !== 'account' ? `
              <button type="button" class="btn-soft pressable" id="heroEditAccountBtn">
                ${ic('settings', 'ic ic-sm')}
                <span>인사·급여 관리</span>
              </button>
            ` : ''}
          </div>

          <div class="hero-metrics">
            <button type="button" class="hero-metric" data-bento-jump="overview">
              <div class="hm-lbl">진행 업무</div>
              <div class="hm-val num ${c.tasks === 0 ? 'is-zero' : ''}">${c.tasks}건</div>
            </button>
            <button type="button" class="hero-metric" data-bento-jump="overview">
              <div class="hm-lbl">담당 고객</div>
              <div class="hm-val num ${c.customers === 0 ? 'is-zero' : ''}">${c.customers}명</div>
            </button>
            <button type="button" class="hero-metric" data-bento-jump="overview">
              <div class="hm-lbl">진행 거래</div>
              <div class="hm-val num ${c.deals === 0 ? 'is-zero' : ''}">${c.deals}건</div>
            </button>
            <button type="button" class="hero-metric" data-bento-jump="overview">
              <div class="hm-lbl">미정산</div>
              <div class="hm-val num ${c.unsettled > 0 ? 'is-warn' : 'is-zero'}">${c.unsettled}건</div>
            </button>
            <div class="hero-metric">
              <div class="hm-lbl">누적 상담</div>
              <div class="hm-val num ${emp.consultationCount === 0 ? 'is-zero' : ''}">${emp.consultationCount}건</div>
            </div>
            <div class="hero-metric">
              <div class="hm-lbl">참여 수수료</div>
              <div class="hm-val num ${emp.commissionAmountTotal === 0 ? 'is-zero' : ''}">${esc(formatManwon(emp.commissionAmountTotal))}</div>
            </div>
          </div>
        </section>

        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div class="seg-track" role="tablist" aria-label="구성원 상세 탭" style="background:#e9edf3;">
            <button type="button" class="seg-btn" role="tab" aria-selected="${state.bentoTab === 'overview'}" data-bento-tab="overview">개요 & 업무 <span class="seg-count num">${c.workload}</span></button>
            <button type="button" class="seg-btn" role="tab" aria-selected="${state.bentoTab === 'timeline'}" data-bento-tab="timeline">활동 타임라인 <span class="seg-count num">${tlAll}</span></button>
            <button type="button" class="seg-btn" role="tab" aria-selected="${state.bentoTab === 'account'}" data-bento-tab="account">인사·급여·보안</button>
          </div>
        </div>

        <div id="bentoTabContent"></div>
      `;

      host.querySelectorAll('[data-copy-chip]').forEach((btn) => {
        btn.addEventListener('click', () => copyText(btn.getAttribute('data-copy-lbl'), btn.getAttribute('data-copy-chip')));
      });

      const editBtn = document.getElementById('heroEditAccountBtn');
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          state.bentoTab = 'account';
          renderFullProfile(host, emp, { isSolo });
        });
      }

      host.querySelectorAll('[data-bento-jump]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.bentoTab = 'overview';
          renderFullProfile(host, emp, { isSolo });
        });
      });

      host.querySelectorAll('[data-bento-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.bentoTab = btn.getAttribute('data-bento-tab');
          ensureAccountDraft(emp);
          renderFullProfile(host, emp, { isSolo });
        });
      });

      const tabHost = document.getElementById('bentoTabContent');
      if (state.bentoTab === 'overview') {
        const attention = buildAttention(emp);
        tabHost.innerHTML = `
          <div class="bento-2col">
            <div class="bento-col">
              <div class="card-block">
                <div class="card-block-head">
                  <h3 class="card-block-title">지금 챙길 것 <span class="pill ${attention.some((a) => a.tone === 'late') ? 'pill-red' : 'pill-gray'} num">${attention.length}</span></h3>
                </div>
                <div class="card-block-body">
                  ${attention.length === 0 ? '<div style="font-size:13px;color:var(--ink-3);">기한이 지났거나 곧 닥치는 일이 없습니다.</div>' : `
                    <div class="item-list">
                      ${attention.map((a) => `
                        <button type="button" class="item-row ${a.tone === 'late' ? 'is-late' : 'is-soon'}" data-nav-dest="${esc(a.dest)}">
                          <span class="pill ${a.tone === 'late' ? 'pill-red' : 'pill-amber'}">${esc(a.label)}</span>
                          <span class="trunc" style="flex:1;font-weight:500;">${esc(a.text)}</span>
                          <span class="num" style="font-size:12px;font-weight:600;">${esc(a.when)}</span>
                        </button>
                      `).join('')}
                    </div>
                  `}
                </div>
              </div>

              ${renderTasksCard(emp)}
              ${renderBuyersCard(emp)}
            </div>

            <div class="bento-col">
              ${renderDealsCard(emp)}
              <div class="card-block">
                <div class="card-block-head">
                  <h3 class="card-block-title">최근 활동</h3>
                  <button type="button" class="btn-subtle" id="bentoViewAllTimeline" style="height:24px;font-size:12px;">전체 타임라인 ${ic('chevronRight', 'ic ic-sm')}</button>
                </div>
                <div class="card-block-body">
                  ${emp.timeline.length === 0 ? '<div style="font-size:13px;color:var(--ink-3);">기록된 활동이 없습니다.</div>' : `
                    <div class="item-list">
                      ${emp.timeline.slice(0, 2).flatMap((d) => d.items.slice(0, 2).map((i) => ({ ...i, day: d.day }))).map((i) => `
                        <div class="item-row" style="align-items:flex-start;">
                          <span class="pill ${i.kind === 'consultation' ? 'pill-blue' : 'pill-gray'}" style="margin-top:1px;">${i.kind === 'consultation' ? '상담' : (i.meta || '기록')}</span>
                          <div style="min-width:0;flex:1;">
                            <div class="trunc" style="font-weight:600;">${esc(i.title)}</div>
                            ${i.body ? `<div style="font-size:12px;color:var(--ink-2);margin-top:2px;">${esc(i.body)}</div>` : ''}
                          </div>
                          <span class="num" style="font-size:11.5px;color:var(--ink-3);">${esc(i.day)} ${esc(i.time)}</span>
                        </div>
                      `).join('')}
                    </div>
                  `}
                </div>
              </div>
            </div>
          </div>
        `;
        const viewTl = document.getElementById('bentoViewAllTimeline');
        if (viewTl) {
          viewTl.addEventListener('click', () => {
            state.bentoTab = 'timeline';
            renderFullProfile(host, emp, { isSolo });
          });
        }
        bindDestClicks(tabHost);
      } else if (state.bentoTab === 'timeline') {
        renderTimelineInto(tabHost, emp, () => renderFullProfile(host, emp, { isSolo }));
      } else {
        renderAccountFormInto(tabHost, emp);
      }
    }

    // =========================================================
    // Floating Profile Drawer (View 1 & View 2)
    // =========================================================
    function renderDrawer() {
      const backdrop = document.getElementById('drawerBackdrop');
      const drawer = document.getElementById('profileDrawer');
      const emp = state.drawerId ? state.employees.find((e) => e.id === state.drawerId) : null;

      if (!emp) {
        backdrop.classList.remove('is-open');
        drawer.classList.remove('is-open');
        return;
      }

      backdrop.classList.add('is-open');
      drawer.classList.add('is-open');
      ensureAccountDraft(emp);

      const list = getMatchingEmployees();
      const idx = list.findIndex((e) => e.id === emp.id);
      const c = countsOf(emp);
      const quiet = isQuiet(emp);
      const actorId = actorIdForRole(state.actorRole);
      const tlAll = emp.timeline.reduce((s, d) => s + d.items.length, 0);

      drawer.innerHTML = `
        <div class="drawer-topbar">
          <button type="button" class="drawer-icon-btn" id="drawerCloseBtn" aria-label="닫기" title="닫기 (Esc)">
            ${ic('chevronsRight')}
          </button>
          <button type="button" class="btn-subtle" id="drawerExpandBento" style="height:28px;font-size:12px;">
            ${ic('maximize', 'ic ic-sm')}
            <span>전체 프로필로 열기</span>
          </button>
          <div style="flex:1"></div>
          ${idx >= 0 ? `
            <span class="num" style="font-size:12px;color:var(--ink-3);margin-right:4px;">${idx + 1} / ${list.length}</span>
            <button type="button" class="drawer-icon-btn" id="drawerPrevBtn" ${idx <= 0 ? 'disabled' : ''} aria-label="이전 구성원" title="이전 (↑)">${ic('chevronUp')}</button>
            <button type="button" class="drawer-icon-btn" id="drawerNextBtn" ${idx >= list.length - 1 ? 'disabled' : ''} aria-label="다음 구성원" title="다음 (↓)">${ic('chevronDown')}</button>
          ` : ''}
        </div>

        <div class="drawer-hero">
          <div style="display:flex;align-items:center;gap:13px;">
            <span class="av-wrap">
              <span class="av-circle av-lg ${esc(emp.avatarTone)}">${esc(emp.name.charAt(0))}</span>
              <span class="av-dot ${avatarDotClass(emp)}"></span>
            </span>
            <div style="min-width:0;flex:1;">
              <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
                <h2 style="margin:0;font-size:19px;font-weight:700;letter-spacing:-0.02em;">${esc(emp.name)}</h2>
                <span class="pill ${roleBadgeClass(emp.role)}">${esc(ROLE_LABELS[emp.role])}</span>
                ${emp.id === actorId ? '<span class="pill pill-blue">나</span>' : ''}
                ${!emp.isActive ? '<span class="pill pill-gray">비활성</span>' : ''}
              </div>
              <div style="margin-top:3px;font-size:12.5px;color:var(--ink-2);">
                ${esc(LICENSE_LABELS[emp.licenseType] || '자격 미지정')} · ${esc(emp.loginId)} ·
                <span style="color:${quiet ? 'var(--amber)' : 'var(--ink-2)'}">${emp.lastActivityLabel ? `활동 ${esc(emp.lastActivityLabel)}` : '활동 없음'}</span>
              </div>
              <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:8px;">
                ${emp.phone ? `<button type="button" class="copy-chip num" data-copy-chip="${esc(emp.phone)}" data-copy-lbl="전화번호">${ic('phone', 'ic ic-sm')}<span>${esc(emp.phone)}</span></button>` : ''}
                ${emp.email ? `<button type="button" class="copy-chip" data-copy-chip="${esc(emp.email)}" data-copy-lbl="이메일">${ic('mail', 'ic ic-sm')}<span>${esc(emp.email)}</span></button>` : ''}
              </div>
            </div>
          </div>
        </div>

        <div class="drawer-tabs" role="tablist" aria-label="드로어 탭">
          <button type="button" class="drawer-tab" role="tab" aria-selected="${state.drawerTab === 'overview'}" data-drawer-tab="overview">개요·성과</button>
          <button type="button" class="drawer-tab" role="tab" aria-selected="${state.drawerTab === 'work'}" data-drawer-tab="work">업무·거래 <span class="num" style="opacity:0.75">${c.workload}</span></button>
          <button type="button" class="drawer-tab" role="tab" aria-selected="${state.drawerTab === 'timeline'}" data-drawer-tab="timeline">활동 기록 <span class="num" style="opacity:0.75">${tlAll}</span></button>
          <button type="button" class="drawer-tab" role="tab" aria-selected="${state.drawerTab === 'account'}" data-drawer-tab="account">인사·급여·보안</button>
        </div>

        <div class="drawer-body" id="drawerBodyHost"></div>
      `;

      document.getElementById('drawerCloseBtn').addEventListener('click', closeDrawer);
      document.getElementById('drawerExpandBento').addEventListener('click', () => {
        state.bentoSelectedId = emp.id;
        state.bentoTab = state.drawerTab === 'account' ? 'account' : state.drawerTab === 'timeline' ? 'timeline' : 'overview';
        state.drawerId = null;
        state.viewMode = 'bento';
        renderAll();
      });

      const prevBtn = document.getElementById('drawerPrevBtn');
      if (prevBtn && idx > 0) prevBtn.addEventListener('click', () => openDrawer(list[idx - 1].id));
      const nextBtn = document.getElementById('drawerNextBtn');
      if (nextBtn && idx < list.length - 1) nextBtn.addEventListener('click', () => openDrawer(list[idx + 1].id));

      drawer.querySelectorAll('[data-copy-chip]').forEach((btn) => {
        btn.addEventListener('click', () => copyText(btn.getAttribute('data-copy-lbl'), btn.getAttribute('data-copy-chip')));
      });

      drawer.querySelectorAll('[data-drawer-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.drawerTab = btn.getAttribute('data-drawer-tab');
          ensureAccountDraft(emp);
          renderDrawer();
        });
      });

      const body = document.getElementById('drawerBodyHost');
      if (state.drawerTab === 'overview') {
        const attention = buildAttention(emp);
        body.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;">
            <div class="card-block" style="padding:12px 14px;">
              <div style="font-size:11.5px;color:var(--ink-3);">진행 업무</div>
              <div class="num" style="font-size:20px;font-weight:700;margin-top:2px;">${c.tasks}건</div>
            </div>
            <div class="card-block" style="padding:12px 14px;">
              <div style="font-size:11.5px;color:var(--ink-3);">담당 고객</div>
              <div class="num" style="font-size:20px;font-weight:700;margin-top:2px;">${c.customers}명</div>
            </div>
            <div class="card-block" style="padding:12px 14px;">
              <div style="font-size:11.5px;color:var(--ink-3);">진행 거래</div>
              <div class="num" style="font-size:20px;font-weight:700;margin-top:2px;">${c.deals}건</div>
            </div>
          </div>

          <div class="card-block" style="padding:14px 16px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;">
            <div>
              <div style="font-size:11.5px;color:var(--ink-3);">누적 상담</div>
              <div class="num" style="font-size:16px;font-weight:700;margin-top:2px;">${emp.consultationCount}건</div>
            </div>
            <div>
              <div style="font-size:11.5px;color:var(--ink-3);">참여 수수료</div>
              <div class="num" style="font-size:16px;font-weight:700;margin-top:2px;">${esc(formatManwon(emp.commissionAmountTotal))}</div>
            </div>
            <div>
              <div style="font-size:11.5px;color:var(--ink-3);">미정산</div>
              <div class="num" style="font-size:16px;font-weight:700;margin-top:2px;color:${c.unsettled > 0 ? 'var(--amber)' : 'var(--ink-3)'};">${c.unsettled}건</div>
            </div>
          </div>

          <div class="card-block">
            <div class="card-block-head">
              <h3 class="card-block-title">지금 챙길 것 <span class="pill ${attention.some((a) => a.tone === 'late') ? 'pill-red' : 'pill-gray'} num">${attention.length}</span></h3>
              <button type="button" class="btn-subtle" id="drawerGoWork" style="height:24px;font-size:12px;">전체 업무 보기 ${ic('chevronRight', 'ic ic-sm')}</button>
            </div>
            <div class="card-block-body">
              ${attention.length === 0 ? '<div style="font-size:13px;color:var(--ink-3);">기한이 지났거나 곧 닥치는 일이 없습니다.</div>' : `
                <div class="item-list">
                  ${attention.map((a) => `
                    <button type="button" class="item-row ${a.tone === 'late' ? 'is-late' : 'is-soon'}" data-nav-dest="${esc(a.dest)}">
                      <span class="pill ${a.tone === 'late' ? 'pill-red' : 'pill-amber'}">${esc(a.label)}</span>
                      <span class="trunc" style="flex:1;font-weight:500;">${esc(a.text)}</span>
                      <span class="num" style="font-size:12px;font-weight:600;">${esc(a.when)}</span>
                    </button>
                  `).join('')}
                </div>
              `}
            </div>
          </div>
        `;
        document.getElementById('drawerGoWork').addEventListener('click', () => {
          state.drawerTab = 'work';
          renderDrawer();
        });
        bindDestClicks(body);
      } else if (state.drawerTab === 'work') {
        body.innerHTML = `
          ${renderTasksCard(emp)}
          ${renderBuyersCard(emp)}
          ${renderDealsCard(emp)}
        `;
        bindDestClicks(body);
      } else if (state.drawerTab === 'timeline') {
        renderTimelineInto(body, emp, renderDrawer);
      } else {
        renderAccountFormInto(body, emp);
      }
    }

    // =========================================================
    // Shared Work Cards, Timeline, & Integrated HR Form
    // =========================================================
    function renderTasksCard(emp) {
      return `
        <div class="card-block">
          <div class="card-block-head">
            <h3 class="card-block-title">담당 업무 <span class="num" style="color:var(--ink-3);font-weight:500">${emp.tasks.length}</span></h3>
            <button type="button" class="btn-subtle" data-nav-dest="/tasks" style="height:24px;font-size:12px;">업무 ${ic('arrowUpRight', 'ic ic-sm')}</button>
          </div>
          <div class="card-block-body">
            ${emp.tasks.length === 0 ? '<div style="font-size:13px;color:var(--ink-3);">담당 업무가 없습니다.</div>' : `
              <div class="item-list">
                ${emp.tasks.map((t) => {
                  const dueCls = t.dueDays != null && t.dueDays < 0 ? 'pill-red' : t.dueDays != null && t.dueDays <= 2 ? 'pill-amber' : 'pill-gray';
                  return `
                    <button type="button" class="item-row" data-nav-dest="/tasks?task=${esc(t.id)}">
                      <span class="trunc" style="flex:1;font-weight:500;">${esc(t.title)}</span>
                      <span style="font-size:12px;color:var(--ink-3);white-space:nowrap;">${esc(t.status)} · ${esc(t.priority)}</span>
                      <span class="pill ${dueCls} num">${t.dueDays == null ? '기한 없음' : esc(dueText(t.dueDays))}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            `}
          </div>
        </div>
      `;
    }

    function renderBuyersCard(emp) {
      return `
        <div class="card-block">
          <div class="card-block-head">
            <h3 class="card-block-title">담당 고객 <span class="num" style="color:var(--ink-3);font-weight:500">${emp.buyers.length}</span></h3>
            <button type="button" class="btn-subtle" data-nav-dest="/wanted-properties" style="height:24px;font-size:12px;">희망매물 ${ic('arrowUpRight', 'ic ic-sm')}</button>
          </div>
          <div class="card-block-body">
            ${emp.buyers.length === 0 ? '<div style="font-size:13px;color:var(--ink-3);">담당 고객이 없습니다.</div>' : `
              <div class="item-list">
                ${emp.buyers.map((b) => {
                  const hasNext = b.status === '활성' && b.nextContactDays != null;
                  const dueCls = hasNext && b.nextContactDays < 0 ? 'pill-red' : hasNext && b.nextContactDays <= 2 ? 'pill-amber' : 'pill-gray';
                  return `
                    <button type="button" class="item-row" data-nav-dest="/buyer-requirements/${esc(b.id)}">
                      <span class="trunc" style="flex:1;font-weight:600;">${esc(b.name)}</span>
                      <span style="font-size:12px;color:var(--ink-3);">${esc(b.status)}</span>
                      <span class="pill ${dueCls} num">${hasNext ? `연락 ${esc(dueText(b.nextContactDays))}` : '연락일 미정'}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            `}
          </div>
        </div>
      `;
    }

    function renderDealsCard(emp) {
      const dest = state.actorRole === 'owner' ? '/cashflow/employee-settlements' : '/cashflow/my-settlement';
      return `
        <div class="card-block">
          <div class="card-block-head">
            <h3 class="card-block-title">거래 참여와 정산 <span class="num" style="color:var(--ink-3);font-weight:500">${emp.deals.length}</span></h3>
            <button type="button" class="btn-subtle" data-nav-dest="${dest}" style="height:24px;font-size:12px;">정산 현황 ${ic('arrowUpRight', 'ic ic-sm')}</button>
          </div>
          <div class="card-block-body">
            ${emp.deals.length === 0 ? '<div style="font-size:13px;color:var(--ink-3);">참여 중인 거래가 없습니다.</div>' : `
              <div class="item-list">
                ${emp.deals.map((d) => `
                  <button type="button" class="item-row" data-nav-dest="/deals?dealId=${esc(d.id)}">
                    <div style="min-width:0;flex:1;">
                      <div class="trunc" style="font-weight:600;">${esc(d.place)}</div>
                      <div style="font-size:12px;color:var(--ink-3);">${esc(PARTICIPANT_ROLE_LABELS[d.role] || d.role)}</div>
                    </div>
                    <span class="pill ${d.settled ? 'pill-emerald' : 'pill-amber'}">${d.settled ? '정산완료' : '미정산'}</span>
                    <span class="num" style="min-width:68px;text-align:right;font-weight:700;">${d.commission ? esc(formatManwon(d.commission)) : '—'}</span>
                  </button>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      `;
    }

    function bindDestClicks(container) {
      container.querySelectorAll('[data-nav-dest]').forEach((btn) => {
        btn.addEventListener('click', () => {
          showToast(`연결 화면 이동: ${btn.getAttribute('data-nav-dest')}`, 'info');
        });
      });
    }

    function renderTimelineInto(host, emp, rerender) {
      const tlAll = emp.timeline.reduce((s, d) => s + d.items.length, 0);
      const tlConsult = emp.timeline.reduce((s, d) => s + d.items.filter((i) => i.kind === 'consultation').length, 0);
      const tlAct = tlAll - tlConsult;
      const days = emp.timeline
        .map((d) => ({ day: d.day, items: d.items.filter((i) => state.timelineFilter === 'all' || i.kind === state.timelineFilter) }))
        .filter((d) => d.items.length > 0);

      host.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;">
          <div class="seg-track" role="group" aria-label="타임라인 필터">
            <button type="button" class="seg-btn" aria-pressed="${state.timelineFilter === 'all'}" data-tl-f="all">전체 <span class="seg-count num">${tlAll}</span></button>
            <button type="button" class="seg-btn" aria-pressed="${state.timelineFilter === 'consultation'}" data-tl-f="consultation">상담 <span class="seg-count num">${tlConsult}</span></button>
            <button type="button" class="seg-btn" aria-pressed="${state.timelineFilter === 'activity'}" data-tl-f="activity">시스템 기록 <span class="seg-count num">${tlAct}</span></button>
          </div>
          <button type="button" class="btn-subtle" data-tl-dest="/consultations" style="height:28px;font-size:12px;">상담분석 ${ic('arrowUpRight', 'ic ic-sm')}</button>
        </div>

        ${days.length === 0 ? '<div class="card-block" style="padding:28px;text-align:center;color:var(--ink-3);font-size:13px;">표시할 상담 및 활동 기록이 없습니다.</div>' : `
          <div style="display:flex;flex-direction:column;gap:12px;">
            ${days.map((d) => `
              <div class="tl-day-card">
                <div class="tl-day-lbl">${esc(d.day)}</div>
                <div class="tl-list">
                  ${d.items.map((item) => {
                    const isC = item.kind === 'consultation';
                    const badge = !isC && item.meta && item.meta !== '앱' ? `<span class="pill pill-gray" style="height:18px;font-size:11px;">${esc(item.meta)}</span>` : '';
                    const inner = `
                      <span class="tl-node ${isC ? '' : 'is-act'}" aria-hidden="true"></span>
                      <div style="display:flex;align-items:center;gap:8px;">
                        <span class="trunc" style="flex:1;font-size:13px;font-weight:600;color:var(--ink);">${esc(item.title)}</span>
                        ${badge}
                        <time class="num" style="font-size:11.5px;color:var(--ink-3);">${esc(item.time)}</time>
                      </div>
                      ${item.body ? `<div style="margin-top:2px;font-size:12.5px;color:var(--ink-2);line-height:1.5;">${esc(item.body)}</div>` : ''}
                    `;
                    return isC
                      ? `<button type="button" class="tl-entry" style="padding-top:3px;padding-bottom:3px;" data-tl-dest="/consultations?consultationId=${esc(item.id)}">${inner}</button>`
                      : `<div class="tl-entry">${inner}</div>`;
                  }).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      `;

      host.querySelectorAll('[data-tl-f]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.timelineFilter = btn.getAttribute('data-tl-f');
          rerender();
        });
      });

      host.querySelectorAll('[data-tl-dest]').forEach((btn) => {
        btn.addEventListener('click', () => showToast(`이동: ${btn.getAttribute('data-tl-dest')}`, 'info'));
      });
    }

    function renderSplitMeterHtml(draft) {
      if (draft.payType === 'fixed') {
        return `
          <div class="split-meter-box">
            <div class="split-meter-head">
              <span>고정급 구성원 (수수료 배분 없음)</span>
              <span class="num" style="color:var(--ink-2)">사무소 100%</span>
            </div>
            <div class="split-meter-bar"><div class="split-office-fill"></div></div>
          </div>
        `;
      }
      const raw = draft.commissionRate.trim() === '' ? OFFICE_DEFAULTS.defaultAgentRate : Number(draft.commissionRate);
      const agentPct = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : OFFICE_DEFAULTS.defaultAgentRate;
      const officePct = Math.max(0, 100 - agentPct);
      const usingDefault = draft.commissionRate.trim() === '';
      return `
        <div class="split-meter-box">
          <div class="split-meter-head">
            <span style="color:var(--blue-hover)">직원 몫 ${agentPct}%${usingDefault ? ' (사무소 기본)' : ''}</span>
            <span class="num" style="color:var(--ink-2)">사무소 몫 ${officePct}%</span>
          </div>
          <div class="split-meter-bar" aria-label="수수료 배분 비율">
            <div class="split-agent-fill" style="width:${agentPct}%"></div>
            <div class="split-office-fill"></div>
          </div>
        </div>
      `;
    }

    function renderAccountFormInto(host, emp) {
      ensureAccountDraft(emp);
      const draft = state.accountDraft;
      const actorId = actorIdForRole(state.actorRole);
      const canEdit = state.actorRole === 'owner' || (state.actorRole === 'manager' && emp.role === 'agent');
      const canEditPay = state.actorRole === 'owner';
      const payVisible = (state.actorRole === 'owner' || emp.id === actorId) && emp.role !== 'owner';
      const canChangeRole = state.actorRole === 'owner' && emp.id !== actorId;
      const dirty = isAccountDirty(emp, draft);

      host.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:14px;">
          ${!canEdit ? `
            <div style="padding:12px 14px;border-radius:11px;background:var(--surface);border:1px solid var(--line);font-size:12.5px;color:var(--ink-2);">
              ${state.actorRole === 'agent'
                ? '본인 계정 정보는 읽기 전용입니다. 변경이 필요하면 대표나 매니저에게 요청하세요.'
                : '매니저는 중개사 계정만 수정할 수 있습니다. 이 계정은 대표가 관리합니다.'}
            </div>
          ` : ''}

          <section class="card-block">
            <div class="card-block-head">
              <h3 class="card-block-title">기본 · 중개 자격</h3>
              <span style="font-size:12px;color:var(--ink-3);">로그인 ID는 변경할 수 없습니다</span>
            </div>
            <div class="card-block-body">
              <div class="form-grid-2">
                <div class="field">
                  <label for="fName">이름</label>
                  <input id="fName" class="f-input" value="${esc(draft.name)}" ${canEdit ? '' : 'disabled'}>
                </div>
                <div class="field">
                  <label>로그인 ID</label>
                  <div class="f-readonly">${esc(emp.loginId)}</div>
                </div>
                <div class="field">
                  <label for="fPhone">휴대폰</label>
                  <input id="fPhone" type="tel" class="f-input" value="${esc(draft.phone)}" ${canEdit ? '' : 'disabled'}>
                </div>
                <div class="field">
                  <label for="fEmail">이메일</label>
                  <input id="fEmail" type="email" class="f-input" value="${esc(draft.email)}" ${canEdit ? '' : 'disabled'}>
                </div>
                <div class="field">
                  <label for="fLicenseType">자격 구분</label>
                  <select id="fLicenseType" class="f-select" ${canEdit ? '' : 'disabled'}>
                    <option value="" ${!draft.licenseType ? 'selected' : ''}>미지정</option>
                    ${Object.entries(LICENSE_LABELS).map(([k, l]) => `<option value="${k}" ${draft.licenseType === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}
                  </select>
                  ${draft.licenseType === 'assistant' ? '<span style="font-size:11.5px;color:var(--amber);">중개보조원은 계약서에 서명할 수 없습니다.</span>' : ''}
                </div>
                <div class="field">
                  <label for="fLicenseNo">자격증/등록 번호</label>
                  <input id="fLicenseNo" class="f-input" value="${esc(draft.licenseNo)}" ${canEdit ? '' : 'disabled'}>
                </div>
              </div>
            </div>
          </section>

          ${payVisible ? `
            <section class="card-block">
              <div class="card-block-head">
                <h3 class="card-block-title">급여 · 수수료 배분</h3>
                <span style="font-size:12px;color:var(--ink-3);">${canEditPay ? '대표만 열람 및 변경 가능' : '본인 열람 전용'}</span>
              </div>
              <div class="card-block-body" style="display:flex;flex-direction:column;gap:14px;">
                <div id="splitMeterHost">${renderSplitMeterHtml(draft)}</div>
                <div class="form-grid-2">
                  <div class="field">
                    <label for="fPayType">급여 유형</label>
                    <select id="fPayType" class="f-select" ${canEditPay ? '' : 'disabled'}>
                      ${Object.entries(PAY_TYPE_LABELS).map(([k, l]) => `<option value="${k}" ${draft.payType === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}
                    </select>
                  </div>
                  <div class="field">
                    <label for="fBaseSalary">월 기본급 (만원)</label>
                    <input id="fBaseSalary" type="number" min="0" class="f-input num" value="${esc(draft.baseSalary)}" placeholder="${draft.payType === 'commission_only' ? '수수료제' : '예: 250'}" ${!canEditPay || draft.payType === 'commission_only' ? 'disabled' : ''}>
                  </div>
                  <div class="field">
                    <label for="fRate">개인 배분율 (%)</label>
                    <input id="fRate" type="number" min="0" max="100" class="f-input num" value="${esc(draft.commissionRate)}" placeholder="${draft.payType === 'fixed' ? '고정급' : '비우면 사무소 기준'}" ${!canEditPay || draft.payType === 'fixed' ? 'disabled' : ''}>
                  </div>
                  <div class="field">
                    <label for="fEmpType">정산 구분</label>
                    <select id="fEmpType" class="f-select" ${canEditPay ? '' : 'disabled'}>
                      <option value="freelancer" ${draft.employmentType === 'freelancer' ? 'selected' : ''}>프리랜서</option>
                      <option value="employee" ${draft.employmentType === 'employee' ? 'selected' : ''}>근로자</option>
                    </select>
                  </div>
                  <div class="field span-2">
                    <label>3.3% 원천징수 공제</label>
                    ${draft.employmentType === 'employee' ? `
                      <div style="font-size:12.5px;color:var(--ink-2);padding:4px 0;">근로자는 성과급까지만 계산하고, 기본급과 세금·4대보험은 급여에서 처리합니다.</div>
                    ` : `
                      <div style="display:flex;align-items:center;gap:10px;min-height:34px;">
                        <button type="button" id="fTaxSwitch" class="switch-btn" role="switch" aria-checked="${draft.withholdTax}" ${canEditPay ? '' : 'disabled'}>
                          <span class="switch-thumb"></span>
                        </button>
                        <span style="font-size:13px;">${draft.withholdTax ? '3.3%를 떼고 지급합니다' : '떼지 않고 전액 지급합니다'}</span>
                      </div>
                      ${!draft.withholdTax ? '<span style="font-size:11.5px;color:var(--amber);">세무사용 목록에는 공제 안 함으로 표시되고, 원천징수 신고는 사무소가 따로 챙겨야 합니다.</span>' : ''}
                    `}
                  </div>
                </div>
                <div style="padding-top:10px;border-top:1px solid var(--line-soft);font-size:12px;color:var(--ink-3);" class="num">
                  사무소 기준: 기본 ${OFFICE_DEFAULTS.defaultAgentRate}% · 매도측 ${OFFICE_DEFAULTS.listingAgentRate}% · 매수측 ${OFFICE_DEFAULTS.buyingAgentRate}% · 단독중개 ${OFFICE_DEFAULTS.dualAgentRate}%
                </div>
              </div>
            </section>
          ` : ''}

          ${canEdit ? `
            <div class="save-bar" id="accSaveBar">
              <div id="accSaveStatus" style="display:flex;align-items:center;gap:8px;font-size:13px;color:${dirty ? 'var(--ink)' : 'var(--ink-3)'};font-weight:${dirty ? '600' : '500'};">
                <span class="pill ${dirty ? 'pill-blue' : 'pill-emerald'}">${dirty ? '수정됨' : '저장됨'}</span>
                <span>${dirty ? '저장하지 않은 변경사항이 있습니다.' : '모든 변경사항이 저장되었습니다.'}</span>
              </div>
              <button type="button" class="btn-blue pressable" id="accSaveBtn" style="height:34px;" ${dirty ? '' : 'disabled'}>
                ${ic('save', 'ic ic-sm')}
                <span>변경사항 저장</span>
              </button>
            </div>
          ` : ''}

          ${state.actorRole !== 'agent' ? `
            <section class="card-block">
              <div class="card-block-head">
                <h3 class="card-block-title">권한 · 보안</h3>
                <span style="font-size:12px;color:var(--ink-3);">변경 시 즉시 적용됩니다</span>
              </div>
              <div class="card-block-body">
                <div class="ctrl-row">
                  <div style="flex:1;min-width:190px;">
                    <div style="font-size:13px;font-weight:600;">역할</div>
                    <div style="font-size:12px;color:var(--ink-3);margin-top:2px;">${esc(ROLE_DESCRIPTIONS[emp.role] || '')}</div>
                  </div>
                  <select id="fRoleSelect" class="f-select" style="width:130px;" aria-label="직원 역할" ${canChangeRole ? '' : 'disabled'}>
                    ${['agent', 'manager', 'owner'].map((r) => `<option value="${r}" ${emp.role === r ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}
                  </select>
                </div>

                <div class="ctrl-row">
                  <div style="flex:1;min-width:190px;">
                    <div style="font-size:13px;font-weight:600;">비밀번호 재설정</div>
                    <div style="font-size:12px;color:var(--ink-3);margin-top:2px;">새 비밀번호를 발급하면 기존 로그인 세션은 모두 끊깁니다.</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <input id="fResetPw" type="password" class="f-input" style="width:150px;height:33px;" placeholder="새 비밀번호" value="${esc(state.newPasswordDraft)}" ${canEdit ? '' : 'disabled'}>
                    <button type="button" class="btn-soft pressable" id="fResetPwBtn" style="height:33px;" ${!canEdit || !state.newPasswordDraft.trim() ? 'disabled' : ''}>
                      ${ic('key', 'ic ic-sm')}
                      <span>재설정</span>
                    </button>
                  </div>
                </div>

                <div class="ctrl-row">
                  <div style="flex:1;min-width:190px;">
                    <div style="font-size:13px;font-weight:600;">${emp.isActive ? '계정 비활성화' : '계정 재활성화'}</div>
                    <div style="font-size:12px;color:var(--ink-3);margin-top:2px;">
                      ${emp.isActive
                        ? '비활성화하면 로그인할 수 없고 계정 수에서 빠집니다. 기록은 남습니다.'
                        : '다시 로그인하고 업무를 맡을 수 있게 됩니다.'}
                    </div>
                  </div>
                  <button type="button" class="btn-soft pressable ${emp.isActive ? 'is-danger' : ''}" id="fStatusBtn" style="height:33px;" ${canEdit ? '' : 'disabled'}>
                    ${emp.isActive ? '비활성화' : '재활성화'}
                  </button>
                </div>
              </div>
            </section>
          ` : ''}
        </div>
      `;

      const syncSaveBar = () => {
        const nowDirty = isAccountDirty(emp, draft);
        const btn = document.getElementById('accSaveBtn');
        const st = document.getElementById('accSaveStatus');
        if (btn) btn.disabled = !nowDirty;
        if (st) {
          st.style.color = nowDirty ? 'var(--ink)' : 'var(--ink-3)';
          st.style.fontWeight = nowDirty ? '600' : '500';
          st.innerHTML = `
            <span class="pill ${nowDirty ? 'pill-blue' : 'pill-emerald'}">${nowDirty ? '수정됨' : '저장됨'}</span>
            <span>${nowDirty ? '저장하지 않은 변경사항이 있습니다.' : '모든 변경사항이 저장되었습니다.'}</span>
          `;
        }
      };

      [['fName', 'name'], ['fPhone', 'phone'], ['fEmail', 'email'], ['fLicenseNo', 'licenseNo'], ['fBaseSalary', 'baseSalary']].forEach(([id, key]) => {
        const el = host.querySelector(`#${id}`);
        if (!el) return;
        el.addEventListener('input', (e) => {
          draft[key] = e.target.value;
          syncSaveBar();
        });
      });

      const rateInput = host.querySelector('#fRate');
      if (rateInput) {
        rateInput.addEventListener('input', (e) => {
          draft.commissionRate = e.target.value;
          const meter = document.getElementById('splitMeterHost');
          if (meter) meter.innerHTML = renderSplitMeterHtml(draft);
          syncSaveBar();
        });
      }

      const rerenderTab = () => renderAccountFormInto(host, emp);

      const licSel = host.querySelector('#fLicenseType');
      if (licSel) licSel.addEventListener('change', (e) => { draft.licenseType = e.target.value; rerenderTab(); });

      const paySel = host.querySelector('#fPayType');
      if (paySel) paySel.addEventListener('change', (e) => { draft.payType = e.target.value; rerenderTab(); });

      const empSel = host.querySelector('#fEmpType');
      if (empSel) empSel.addEventListener('change', (e) => { draft.employmentType = e.target.value; rerenderTab(); });

      const taxSw = host.querySelector('#fTaxSwitch');
      if (taxSw) taxSw.addEventListener('click', () => { draft.withholdTax = !draft.withholdTax; rerenderTab(); });

      const saveBtn = host.querySelector('#accSaveBtn');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          if (!draft.name.trim()) {
            showToast('이름을 입력하세요.', 'error');
            return;
          }
          if (state.actorRole === 'owner' && emp.role !== 'owner') {
            if (draft.baseSalary.trim() !== '') {
              const bs = Number(draft.baseSalary);
              if (!Number.isInteger(bs) || bs < 0) {
                showToast('기본급은 0 이상의 정수(만원)로 입력하세요.', 'error');
                return;
              }
            }
            if (draft.commissionRate.trim() !== '') {
              const r = Number(draft.commissionRate);
              if (!Number.isFinite(r) || r < 0 || r > 100) {
                showToast('수수료 배분율은 0~100 사이로 입력하세요.', 'error');
                return;
              }
            }
          }
          emp.name = draft.name.trim();
          emp.phone = draft.phone.trim() || null;
          emp.email = draft.email.trim() || null;
          emp.licenseType = draft.licenseType || null;
          emp.licenseNo = draft.licenseNo.trim() || null;
          if (state.actorRole === 'owner' && emp.role !== 'owner') {
            emp.payType = draft.payType;
            emp.baseSalary = draft.baseSalary.trim() === '' ? null : Number(draft.baseSalary);
            emp.commissionRate = draft.commissionRate.trim() === '' ? null : Number(draft.commissionRate);
            emp.employmentType = draft.employmentType;
            emp.withholdTax = draft.withholdTax;
          }
          state.accountDraft = toAccountDraft(emp);
          renderAll();
          showToast('구성원 정보가 저장되었습니다.');
        });
      }

      const roleSel = host.querySelector('#fRoleSelect');
      if (roleSel) {
        roleSel.addEventListener('change', (e) => {
          const next = e.target.value;
          if (next === emp.role) return;
          e.target.value = emp.role;
          state.confirmModal = { kind: 'role', empId: emp.id, nextValue: next };
          renderModals();
        });
      }

      const pwIn = host.querySelector('#fResetPw');
      const pwBtn = host.querySelector('#fResetPwBtn');
      if (pwIn && pwBtn) {
        pwIn.addEventListener('input', (e) => {
          state.newPasswordDraft = e.target.value;
          pwBtn.disabled = !state.newPasswordDraft.trim();
        });
        pwBtn.addEventListener('click', () => {
          if (!state.newPasswordDraft.trim()) return;
          state.newPasswordDraft = '';
          pwIn.value = '';
          pwBtn.disabled = true;
          showToast(`${emp.name}님 비밀번호가 재설정되었습니다.`);
        });
      }

      const statusBtn = host.querySelector('#fStatusBtn');
      if (statusBtn) {
        statusBtn.addEventListener('click', () => {
          state.confirmModal = { kind: 'status', empId: emp.id, nextValue: !emp.isActive };
          renderModals();
        });
      }
    }

    // =========================================================
    // 2-Step Add Employee Wizard & Confirmation Modals
    // =========================================================
    function openAddWizard() {
      state.wizardStep = 1;
      state.wizardDraft = {
        name: '',
        loginId: '',
        password: '',
        phone: '',
        email: '',
        role: 'agent',
        licenseType: 'broker_associate',
        licenseNo: '',
        payType: 'commission_only',
        baseSalary: '',
        commissionRate: '50',
        employmentType: 'freelancer',
        withholdTax: true,
      };
      state.wizardOpen = true;
      renderModals();
    }

    function renderModals() {
      const host = document.getElementById('modalHost');
      const { activeCount, maxUsers, isFull } = seatCounts();

      if (state.wizardOpen) {
        const d = state.wizardDraft;
        const roleOptions = state.actorRole === 'owner' ? ['agent', 'manager'] : ['agent'];
        const step1Ok = Boolean(d.name.trim() && d.loginId.trim() && d.password.trim());

        host.innerHTML = `
          <div class="modal-backdrop" id="wizardBackdrop">
            <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="wizardTitle">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
                <div>
                  <h2 id="wizardTitle" style="margin:0;font-size:17px;font-weight:700;">새 구성원 추가</h2>
                  <p style="margin:3px 0 0;font-size:13px;color:var(--ink-2);">계정 생성과 역할·보상 조건을 순서대로 설정합니다 (<span class="num">${activeCount}/${maxUsers}석</span> 사용 중).</p>
                </div>
                <button type="button" class="drawer-icon-btn" id="wizardCloseX" aria-label="닫기">${ic('x')}</button>
              </div>

              ${isFull ? `
                <div style="margin-top:12px;display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:10px;background:var(--red-soft);color:#dc2626;font-size:12.5px;" role="alert">
                  ${ic('alert', 'ic ic-sm')}
                  <span>최대 사용자 수(${maxUsers}석)에 도달했습니다. 구성원을 비활성화하거나 요금제를 올린 뒤 추가하세요.</span>
                </div>
              ` : ''}

              <div class="wizard-steps">
                <div class="wizard-step ${state.wizardStep === 1 ? 'is-active' : 'is-done'}">
                  <span class="wizard-num">${state.wizardStep > 1 ? '✓' : '1'}</span>
                  <span>계정 및 연락처</span>
                </div>
                <div class="wizard-step ${state.wizardStep === 2 ? 'is-active' : ''}">
                  <span class="wizard-num">2</span>
                  <span>역할 · 자격${state.actorRole === 'owner' ? ' · 보상' : ''}</span>
                </div>
              </div>

              ${state.wizardStep === 1 ? `
                <div class="form-grid-2">
                  <div class="field">
                    <label for="wName">이름 <span style="color:var(--red)">*</span></label>
                    <input id="wName" class="f-input" value="${esc(d.name)}" placeholder="예: 홍길동">
                  </div>
                  <div class="field">
                    <label for="wLogin">로그인 ID <span style="color:var(--red)">*</span></label>
                    <input id="wLogin" class="f-input" value="${esc(d.loginId)}" placeholder="예: gd.hong">
                  </div>
                  <div class="field">
                    <label for="wPw">초기 비밀번호 <span style="color:var(--red)">*</span></label>
                    <input id="wPw" type="password" class="f-input" value="${esc(d.password)}" placeholder="8자 이상">
                  </div>
                  <div class="field">
                    <label for="wPhone">휴대폰</label>
                    <input id="wPhone" type="tel" class="f-input" value="${esc(d.phone)}" placeholder="010-0000-0000">
                  </div>
                  <div class="field span-2">
                    <label for="wEmail">이메일</label>
                    <input id="wEmail" type="email" class="f-input" value="${esc(d.email)}" placeholder="name@office.kr">
                  </div>
                </div>
              ` : `
                <div style="display:flex;flex-direction:column;gap:14px;">
                  <div class="form-grid-2">
                    <div class="field">
                      <label for="wRole">역할</label>
                      <select id="wRole" class="f-select">
                        ${roleOptions.map((r) => `<option value="${r}" ${d.role === r ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}
                      </select>
                    </div>
                    <div class="field">
                      <label for="wLicType">자격 구분</label>
                      <select id="wLicType" class="f-select">
                        <option value="">미지정</option>
                        ${Object.entries(LICENSE_LABELS).map(([k, l]) => `<option value="${k}" ${d.licenseType === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}
                      </select>
                    </div>
                    <div class="field span-2">
                      <label for="wLicNo">자격증/등록 번호</label>
                      <input id="wLicNo" class="f-input" value="${esc(d.licenseNo)}" placeholder="선택 입력">
                    </div>
                  </div>
                  ${state.actorRole === 'owner' ? `
                    <div id="wSplitMeter">${renderSplitMeterHtml(d)}</div>
                    <div class="form-grid-2">
                      <div class="field">
                        <label for="wPayType">급여 유형</label>
                        <select id="wPayType" class="f-select">
                          ${Object.entries(PAY_TYPE_LABELS).map(([k, l]) => `<option value="${k}" ${d.payType === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}
                        </select>
                      </div>
                      <div class="field">
                        <label for="wRate">개인 배분율 (%)</label>
                        <input id="wRate" type="number" min="0" max="100" class="f-input num" value="${esc(d.commissionRate)}" ${d.payType === 'fixed' ? 'disabled' : ''}>
                      </div>
                      <div class="field">
                        <label for="wBase">월 기본급 (만원)</label>
                        <input id="wBase" type="number" min="0" class="f-input num" value="${esc(d.baseSalary)}" placeholder="${d.payType === 'commission_only' ? '수수료제' : '예: 200'}" ${d.payType === 'commission_only' ? 'disabled' : ''}>
                      </div>
                      <div class="field">
                        <label for="wEmpType">정산 구분</label>
                        <select id="wEmpType" class="f-select">
                          <option value="freelancer" ${d.employmentType === 'freelancer' ? 'selected' : ''}>프리랜서 (3.3%)</option>
                          <option value="employee" ${d.employmentType === 'employee' ? 'selected' : ''}>근로자</option>
                        </select>
                      </div>
                    </div>
                  ` : ''}
                </div>
              `}

              <div style="margin-top:20px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                ${state.wizardStep === 2
                  ? '<button type="button" class="btn-soft pressable" id="wizardPrevBtn">이전 단계</button>'
                  : '<span></span>'}
                <div style="display:flex;gap:8px;">
                  <button type="button" class="btn-soft pressable" id="wizardCancelBtn">닫기</button>
                  ${state.wizardStep === 1
                    ? `<button type="button" class="btn-blue pressable" id="wizardNextBtn" ${step1Ok ? '' : 'disabled'}>다음 단계</button>`
                    : `<button type="button" class="btn-blue pressable" id="wizardFinishBtn" ${isFull ? 'disabled' : ''}>구성원 생성</button>`}
                </div>
              </div>
            </div>
          </div>
        `;

        const closeW = () => { state.wizardOpen = false; renderModals(); };
        document.getElementById('wizardBackdrop').addEventListener('click', (e) => { if (e.target.id === 'wizardBackdrop') closeW(); });
        document.getElementById('wizardCloseX').addEventListener('click', closeW);
        document.getElementById('wizardCancelBtn').addEventListener('click', closeW);

        if (state.wizardStep === 1) {
          const nextBtn = document.getElementById('wizardNextBtn');
          [['wName', 'name'], ['wLogin', 'loginId'], ['wPw', 'password'], ['wPhone', 'phone'], ['wEmail', 'email']].forEach(([id, key]) => {
            document.getElementById(id).addEventListener('input', (e) => {
              d[key] = e.target.value;
              nextBtn.disabled = !(d.name.trim() && d.loginId.trim() && d.password.trim());
            });
          });
          nextBtn.addEventListener('click', () => {
            state.wizardStep = 2;
            renderModals();
          });
        } else {
          document.getElementById('wizardPrevBtn').addEventListener('click', () => {
            state.wizardStep = 1;
            renderModals();
          });
          document.getElementById('wRole').addEventListener('change', (e) => { d.role = e.target.value; });
          document.getElementById('wLicType').addEventListener('change', (e) => { d.licenseType = e.target.value; });
          document.getElementById('wLicNo').addEventListener('input', (e) => { d.licenseNo = e.target.value; });

          if (state.actorRole === 'owner') {
            document.getElementById('wPayType').addEventListener('change', (e) => {
              d.payType = e.target.value;
              renderModals();
            });
            document.getElementById('wRate').addEventListener('input', (e) => {
              d.commissionRate = e.target.value;
              const m = document.getElementById('wSplitMeter');
              if (m) m.innerHTML = renderSplitMeterHtml(d);
            });
            document.getElementById('wBase').addEventListener('input', (e) => { d.baseSalary = e.target.value; });
            document.getElementById('wEmpType').addEventListener('change', (e) => {
              d.employmentType = e.target.value;
              d.withholdTax = e.target.value === 'freelancer';
            });
          }

          document.getElementById('wizardFinishBtn').addEventListener('click', () => {
            if (isFull) return;
            const tones = ['av-blue', 'av-indigo', 'av-emerald', 'av-violet', 'av-teal'];
            const newId = `emp-${Date.now()}`;
            const newEmp = {
              id: newId,
              name: d.name.trim(),
              loginId: d.loginId.trim(),
              role: d.role,
              avatarTone: tones[state.employees.length % tones.length],
              isActive: true,
              licenseType: d.licenseType || null,
              licenseNo: d.licenseNo.trim() || null,
              phone: d.phone.trim() || null,
              email: d.email.trim() || null,
              createdAt: '2026.11.22',
              payType: state.actorRole === 'owner' ? d.payType : 'commission_only',
              baseSalary: state.actorRole === 'owner' && d.baseSalary.trim() !== '' ? Number(d.baseSalary) : null,
              commissionRate: state.actorRole === 'owner' && d.commissionRate.trim() !== '' ? Number(d.commissionRate) : null,
              employmentType: state.actorRole === 'owner' ? d.employmentType : 'freelancer',
              withholdTax: state.actorRole === 'owner' ? d.withholdTax : true,
              lastActivityOrder: 99,
              lastActivityLabel: null,
              quietDays: null,
              consultationCount: 0,
              commissionAmountTotal: 0,
              tasks: [],
              buyers: [],
              deals: [],
              timeline: [],
            };
            state.employees.push(newEmp);
            state.wizardOpen = false;
            state.statusFilter = 'active';
            state.accountDraft = toAccountDraft(newEmp);
            state.accountDraftForId = newId;
            if (state.viewMode === 'bento') {
              state.bentoSelectedId = newId;
              state.bentoTab = 'account';
            } else {
              state.drawerId = newId;
              state.drawerTab = 'account';
            }
            renderAll();
            showToast(`${newEmp.name}님 계정이 생성되었습니다.`);
          });
        }
        return;
      }

      if (state.confirmModal) {
        const m = state.confirmModal;
        const emp = state.employees.find((e) => e.id === m.empId);
        if (!emp) {
          state.confirmModal = null;
          host.innerHTML = '';
          return;
        }
        if (m.kind === 'role') {
          const nextLbl = ROLE_LABELS[m.nextValue] || m.nextValue;
          host.innerHTML = `
            <div class="modal-backdrop" id="confirmBackdrop">
              <div class="modal-card is-sm" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle">
                <h2 id="confirmTitle" style="margin:0;font-size:16px;font-weight:700;">역할 변경</h2>
                <p style="margin:8px 0 0;font-size:13px;line-height:1.55;color:var(--ink-2);">
                  ${esc(emp.name)}님의 역할을 '${esc(nextLbl)}'(으)로 변경합니다. 접근 권한이 즉시 바뀝니다.
                  ${m.nextValue === 'owner' ? ' 대표 권한을 주면 사무소 핵심 설정까지 변경할 수 있습니다.' : ''}
                </p>
                <div style="margin-top:18px;display:flex;justify-content:flex-end;gap:8px;">
                  <button type="button" class="btn-soft pressable" id="confirmCancel">취소</button>
                  <button type="button" class="btn-blue pressable" style="height:34px;" id="confirmOk">변경</button>
                </div>
              </div>
            </div>
          `;
          document.getElementById('confirmBackdrop').addEventListener('click', (e) => { if (e.target.id === 'confirmBackdrop') { state.confirmModal = null; renderModals(); } });
          document.getElementById('confirmCancel').addEventListener('click', () => { state.confirmModal = null; renderModals(); });
          document.getElementById('confirmOk').addEventListener('click', () => {
            emp.role = m.nextValue;
            state.confirmModal = null;
            renderAll();
            showToast(`역할이 '${nextLbl}'(으)로 변경되었습니다.`);
          });
          return;
        }

        if (m.kind === 'status') {
          const deactivating = emp.isActive;
          const c = countsOf(emp);
          const warnings = [];
          if (deactivating && emp.role === 'owner') warnings.push('대표 계정입니다. 사무소의 마지막 대표 계정은 비활성화할 수 없습니다.');
          if (deactivating && (c.tasks > 0 || c.deals > 0)) warnings.push(`진행 중 업무 ${c.tasks}건 · 거래 ${c.deals}건이 있습니다. 비활성화 전에 다른 구성원에게 인계하세요.`);

          host.innerHTML = `
            <div class="modal-backdrop" id="confirmBackdrop">
              <div class="modal-card is-sm" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle">
                <h2 id="confirmTitle" style="margin:0;font-size:16px;font-weight:700;">${deactivating ? '계정 비활성화' : '계정 재활성화'}</h2>
                <div style="margin:8px 0 0;font-size:13px;line-height:1.55;color:var(--ink-2);">
                  ${deactivating
                    ? `<p style="margin:0;">${esc(emp.name)}님 계정을 비활성화하면 더 이상 로그인할 수 없습니다.</p>`
                    : `<p style="margin:0;">${esc(emp.name)}님 계정을 재활성화하면 즉시 로그인과 업무 배정이 가능해집니다.</p>`}
                  ${warnings.map((w) => `<p style="margin:6px 0 0;color:var(--red);font-weight:500;">${esc(w)}</p>`).join('')}
                </div>
                <div style="margin-top:18px;display:flex;justify-content:flex-end;gap:8px;">
                  <button type="button" class="btn-soft pressable" id="confirmCancel">취소</button>
                  <button type="button" class="${deactivating ? 'btn-soft is-danger' : 'btn-blue'} pressable" style="height:34px;" id="confirmOk">${deactivating ? '비활성화' : '재활성화'}</button>
                </div>
              </div>
            </div>
          `;
          document.getElementById('confirmBackdrop').addEventListener('click', (e) => { if (e.target.id === 'confirmBackdrop') { state.confirmModal = null; renderModals(); } });
          document.getElementById('confirmCancel').addEventListener('click', () => { state.confirmModal = null; renderModals(); });
          document.getElementById('confirmOk').addEventListener('click', () => {
            if (deactivating && emp.role === 'owner' && state.employees.filter((e) => e.isActive && e.role === 'owner').length <= 1) {
              showToast('마지막 대표 계정은 비활성화할 수 없습니다.', 'error');
              state.confirmModal = null;
              renderModals();
              return;
            }
            emp.isActive = !emp.isActive;
            state.confirmModal = null;
            renderAll();
            showToast(emp.isActive ? '계정이 재활성화되었습니다.' : '계정이 비활성화되었습니다.');
          });
          return;
        }
      }

      host.innerHTML = '';
    }

    function renderAll() {
      renderDemoBar();
      renderTopbarActor();
      renderMainCanvas();
      renderDrawer();
      renderModals();
    }

    renderAll();
  };
})();
