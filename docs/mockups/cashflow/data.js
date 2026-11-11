/* 캐시플로우 시안 가상 데이터. 필드 이름은 packages/api-client/src/modules/finance.ts, employees.ts와 맞췄다.
   금액은 만원 단위, 기준일은 2026-11-04(수)다. 모든 페이지가 이 한 벌에서 숫자를 계산한다. */
(function () {
  /* taxType: 수당의 소득 구분. business = 프리랜서 사업소득(3.3% 원천징수), wage = 근로소득(급여와 함께 처리),
     none = 대표 본인 몫(지급 대상이 아님) */
  const users = [
    { id: 'u1', name: '서지현', role: 'owner', phone: '010-0000-2001', isActive: true, payType: 'fixed', baseSalary: null, commissionRate: 10, taxType: 'none' },
    { id: 'u2', name: '김도윤', role: 'manager', phone: '010-0000-2002', isActive: true, payType: 'mixed', baseSalary: 200, commissionRate: 40, taxType: 'wage' },
    { id: 'u3', name: '박서연', role: 'agent', phone: '010-0000-2003', isActive: true, payType: 'commission_only', baseSalary: null, commissionRate: 60, taxType: 'business' },
    { id: 'u4', name: '이준호', role: 'agent', phone: '010-0000-2004', isActive: true, payType: 'commission_only', baseSalary: null, commissionRate: 55, taxType: 'business' },
    { id: 'u5', name: '최하은', role: 'agent', phone: '010-0000-2005', isActive: true, payType: 'mixed', baseSalary: 150, commissionRate: 30, taxType: 'wage' },
    { id: 'u6', name: '정민수', role: 'agent', phone: '010-0000-2006', isActive: false, payType: 'commission_only', baseSalary: null, commissionRate: 50, taxType: 'business' },
  ];

  const partners = [
    { id: 'b1', name: '한강공인중개사', phone: '02-0000-1101' },
    { id: 'b2', name: '명일제일공인중개사', phone: '02-0000-1102' },
    { id: 'b3', name: '상일스타공인중개사', phone: '02-0000-1103' },
    { id: 'b4', name: '고덕센트럴공인중개사', phone: '02-0000-1104' },
  ];

  const name = (id) => users.find((u) => u.id === id).name;

  function P(id, code, clientSide, expectedAmount, o) {
    return Object.assign({
      id, code, clientSide, collectedByOffice: 'us', baseAmount: null, rate: null,
      expectedAmount, actualAmount: null, dueDate: null, paidAt: null, agreedRemainingDate: null,
      status: 'pending', method: null, note: null, taxInvoiceStatus: 'none', taxInvoiceNo: null, distributions: [],
    }, o);
  }

  /* 공동중개 분배. 금액은 청구액 × 비율 */
  function split(id, partnerId, ourRatio, expected, settled) {
    const ourAmount = Math.round((expected * ourRatio) / 100);
    const partnerAmount = expected - ourAmount;
    const s = settled || {};
    return [
      { id: id + '-o', recipientType: 'our_office', partnerBrokerId: null, shareRatio: ourRatio, shareAmount: ourAmount, settledAmount: s.our ? ourAmount : 0, status: s.our ? 'settled' : 'pending', settledAt: s.our || null, settlementMemo: null },
      { id: id + '-p', recipientType: 'partner_broker', partnerBrokerId: partnerId, shareRatio: 100 - ourRatio, shareAmount: partnerAmount, settledAmount: s.partner ? partnerAmount : 0, status: s.partner ? 'settled' : 'pending', settledAt: s.partner || null, settlementMemo: s.partner ? '계좌이체 완료' : null },
    ];
  }

  function W(id, userId, role, side, rate, amount, settledAt) {
    return { id, userId, userName: name(userId), role, side, commissionRate: rate, commissionAmount: amount, settlementStatus: settledAt ? 'settled' : 'unsettled', settlementDate: settledAt || null };
  }

  const collected = (paid, method) => ({ status: 'collected', paidAt: paid, method: method || 'transfer' });

  const deals = [
    {
      id: 'd01', transactionType: 'sale', stage: 'completed', stageChangedAt: '2026-08-20', agreedPrice: 158000, balanceDueDate: '2026-11-02',
      siteName: '고덕그라시움', dongName: '105동', unitName: '1203호', sellerContactName: '김민준', buyerContactName: '신유나', partnerBrokerId: null,
      payments: [
        P('p011', 'CP-1041', 'seller', 790, Object.assign(collected('2026-11-02'), { baseAmount: 158000, rate: 0.5, actualAmount: 790, dueDate: '2026-11-02', taxInvoiceStatus: 'issued', taxInvoiceNo: '2026-11-00021' })),
        /* 10월 말과 11월 초에 나눠 받은 청구. 입금마다 달과 증빙이 따로 남는다. */
        P('p012', 'CP-1042', 'buyer', 790, {
          baseAmount: 158000, rate: 0.5, status: 'partial', actualAmount: 500, dueDate: '2026-11-02', paidAt: '2026-11-02', method: 'cash', agreedRemainingDate: '2026-11-16', note: '잔여분 11월 16일 입금 약속',
          receipts: [
            { id: 'p012-r1', date: '2026-10-30', amount: 300, vat: 30, method: 'transfer', evidenceType: 'cash_receipt', evidenceNo: '1093-2251', evidenceDate: '2026-10-30' },
            { id: 'p012-r2', date: '2026-11-02', amount: 200, vat: 20, method: 'cash', evidenceType: 'cash_receipt', evidenceNo: null, evidenceDate: null },
          ],
        }),
      ],
      participants: [W('w011', 'u3', 'listing_agent', 'seller', 60, 474), W('w012', 'u4', 'buying_agent', 'buyer', 55, 435), W('w013', 'u1', 'manager', 'both', 10, 158)],
    },
    {
      id: 'd02', transactionType: 'jeonse', stage: 'settling', stageChangedAt: '2026-09-12', agreedPrice: 90000, balanceDueDate: '2026-11-12',
      siteName: '고덕래미안힐스테이트', dongName: '112동', unitName: '905호', sellerContactName: '박정숙', buyerContactName: '임하늘', partnerBrokerId: null,
      payments: [
        P('p021', 'CP-1051', 'seller', 270, { baseAmount: 90000, rate: 0.3, dueDate: '2026-11-12' }),
        P('p022', 'CP-1052', 'buyer', 270, { baseAmount: 90000, rate: 0.3, dueDate: '2026-11-12' }),
      ],
      participants: [W('w021', 'u5', 'dual_agent', 'both', 30, 162)],
    },
    {
      id: 'd03', transactionType: 'sale', stage: 'settling', stageChangedAt: '2026-09-01', agreedPrice: 105000, balanceDueDate: '2026-10-28',
      siteName: '고덕리엔파크 2단지', dongName: '205동', unitName: '304호', sellerContactName: '배성호', buyerContactName: '권오성', partnerBrokerId: 'b1',
      payments: [
        P('p031', 'CP-1037', 'seller', 420, Object.assign(collected('2026-10-28'), { baseAmount: 105000, rate: 0.4, actualAmount: 420, dueDate: '2026-10-28', distributions: split('p031', 'b1', 50, 420) })),
        P('p032', 'CP-1038', 'buyer', 420, { baseAmount: 105000, rate: 0.4, collectedByOffice: 'partner', status: 'overdue', dueDate: '2026-10-28', note: '한강공인에서 매수인 수금 대기', distributions: split('p032', 'b1', 50, 420) }),
      ],
      participants: [W('w031', 'u2', 'dual_agent', 'both', 40, 168)],
    },
    {
      id: 'd04', transactionType: 'sale', stage: 'closed', stageChangedAt: '2026-08-05', agreedPrice: 99000, balanceDueDate: '2026-10-15',
      siteName: '명일 삼익그린', dongName: '5동', unitName: '1203호', sellerContactName: '한지수', buyerContactName: '최유진', partnerBrokerId: null,
      payments: [
        P('p041', 'CP-1021', 'seller', 495, Object.assign(collected('2026-10-15'), { baseAmount: 99000, rate: 0.5, actualAmount: 495, dueDate: '2026-10-15', taxInvoiceStatus: 'issued', taxInvoiceNo: '2026-10-00014' })),
        P('p042', 'CP-1022', 'buyer', 495, Object.assign(collected('2026-10-15'), { baseAmount: 99000, rate: 0.5, actualAmount: 495, dueDate: '2026-10-15', taxInvoiceStatus: 'issued', taxInvoiceNo: '2026-10-00015' })),
      ],
      participants: [W('w041', 'u3', 'dual_agent', 'both', 60, 594, '2026-10-31'), W('w042', 'u1', 'manager', 'both', 10, 99, '2026-10-31')],
    },
    {
      id: 'd05', transactionType: 'monthly', stage: 'contracted', stageChangedAt: '2026-10-20', agreedPrice: null, agreedDeposit: 5000, agreedMonthlyRent: 280, balanceDueDate: '2026-11-20', propertyKind: 'non_housing',
      siteName: '상일 근린상가', dongName: '', unitName: '1층 102호', sellerContactName: '오수빈', buyerContactName: '정현우', partnerBrokerId: null,
      payments: [
        P('p051', 'CP-1071', 'seller', 148, { dueDate: '2026-11-20' }),
        P('p052', 'CP-1072', 'buyer', 148, { dueDate: '2026-11-20', payerType: 'business' }),
      ],
      participants: [W('w051', 'u4', 'dual_agent', 'both', 55, 163)],
    },
    {
      id: 'd06', transactionType: 'sale', stage: 'contracted', stageChangedAt: '2026-10-08', agreedPrice: 142000, balanceDueDate: '2026-12-18',
      siteName: '고덕아르테온', dongName: '309동', unitName: '1502호', sellerContactName: '남궁민재', buyerContactName: '송태양', partnerBrokerId: null,
      payments: [
        P('p061', 'CP-1063', 'seller', 710, { baseAmount: 142000, rate: 0.5, dueDate: '2026-12-18' }),
        P('p062', 'CP-1064', 'buyer', 710, { baseAmount: 142000, rate: 0.5, dueDate: '2026-12-18' }),
      ],
      participants: [W('w061', 'u3', 'listing_agent', 'seller', 60, 426), W('w062', 'u5', 'buying_agent', 'buyer', 30, 213), W('w063', 'u1', 'manager', 'both', 10, 142)],
    },
    {
      id: 'd07', transactionType: 'sale', stage: 'settling', stageChangedAt: '2026-09-20', agreedPrice: 117500, balanceDueDate: '2026-11-09',
      siteName: '고덕센트럴아이파크', dongName: '101동', unitName: '801호', sellerContactName: '최유진', buyerContactName: '박지훈', partnerBrokerId: 'b2',
      payments: [
        P('p071', 'CP-1055', 'seller', 470, { baseAmount: 117500, rate: 0.4, dueDate: '2026-11-09', distributions: split('p071', 'b2', 60, 470) }),
        P('p072', 'CP-1056', 'buyer', 470, { baseAmount: 117500, rate: 0.4, collectedByOffice: 'partner', dueDate: '2026-11-09', distributions: split('p072', 'b2', 40, 470) }),
      ],
      participants: [W('w071', 'u4', 'dual_agent', 'both', 55, 259)],
    },
    {
      id: 'd08', transactionType: 'jeonse', stage: 'contracted', stageChangedAt: '2026-10-25', agreedPrice: 70000, balanceDueDate: '2026-11-28',
      siteName: '상일 e편한세상', dongName: '203동', unitName: '1104호', sellerContactName: '김하나', buyerContactName: '권오성', partnerBrokerId: null,
      payments: [
        P('p081', 'CP-1081', 'seller', 210, { baseAmount: 70000, rate: 0.3, status: 'draft' }),
        P('p082', 'CP-1082', 'buyer', 210, { baseAmount: 70000, rate: 0.3, dueDate: '2026-11-28' }),
      ],
      participants: [W('w081', 'u5', 'dual_agent', 'both', 30, 126)],
    },
    {
      id: 'd09', transactionType: 'monthly', stage: 'settling', stageChangedAt: '2026-10-02', agreedPrice: null, agreedDeposit: 3000, agreedMonthlyRent: 110, balanceDueDate: '2026-10-30',
      siteName: '명일 현대', dongName: '3동', unitName: '402호', sellerContactName: '송태양', buyerContactName: '임하늘', partnerBrokerId: null,
      payments: [
        P('p091', 'CP-1061', 'seller', 56, Object.assign(collected('2026-10-30', 'cash'), { actualAmount: 56, dueDate: '2026-10-30' })),
        P('p092', 'CP-1062', 'buyer', 56, { status: 'overdue', dueDate: '2026-10-30' }),
      ],
      participants: [W('w091', 'u6', 'dual_agent', 'both', 50, 56)],
    },
    {
      id: 'd10', transactionType: 'sale', stage: 'closed', stageChangedAt: '2026-07-10', agreedPrice: 130000, balanceDueDate: '2026-09-25',
      siteName: '고덕아이파크', dongName: '120동', unitName: '1801호', sellerContactName: '신유나', buyerContactName: '정현우', partnerBrokerId: null,
      payments: [
        P('p101', 'CP-0987', 'seller', 650, Object.assign(collected('2026-09-25'), { baseAmount: 130000, rate: 0.5, actualAmount: 650, dueDate: '2026-09-25', taxInvoiceStatus: 'issued', taxInvoiceNo: '2026-09-00031' })),
        P('p102', 'CP-0988', 'buyer', 650, Object.assign(collected('2026-09-25'), { baseAmount: 130000, rate: 0.5, actualAmount: 650, dueDate: '2026-09-25', taxInvoiceStatus: 'issued', taxInvoiceNo: '2026-09-00032' })),
      ],
      participants: [W('w101', 'u2', 'listing_agent', 'seller', 40, 260, '2026-09-30'), W('w102', 'u3', 'buying_agent', 'buyer', 60, 390, '2026-09-30')],
    },
    {
      id: 'd11', transactionType: 'jeonse', stage: 'closed', stageChangedAt: '2026-07-28', agreedPrice: 54700, balanceDueDate: '2026-09-30',
      siteName: '상일 리버파크', dongName: '8동', unitName: '1705호', sellerContactName: '오수빈', buyerContactName: '김하나', partnerBrokerId: 'b3',
      payments: [
        P('p111', 'CP-0995', 'seller', 164, Object.assign(collected('2026-09-30'), { baseAmount: 54700, rate: 0.3, actualAmount: 164, dueDate: '2026-09-30', taxInvoiceStatus: 'issued', taxInvoiceNo: '2026-09-00040', distributions: split('p111', 'b3', 50, 164, { partner: '2026-10-05' }) })),
        P('p112', 'CP-0996', 'buyer', 164, Object.assign(collected('2026-09-30'), { baseAmount: 54700, rate: 0.3, collectedByOffice: 'partner', actualAmount: 164, dueDate: '2026-09-30', taxInvoiceStatus: 'issued', taxInvoiceNo: '2026-09-00041', distributions: split('p112', 'b3', 50, 164) })),
      ],
      participants: [W('w111', 'u4', 'dual_agent', 'both', 55, 90)],
    },
    {
      id: 'd12', transactionType: 'sale', stage: 'contracted', stageChangedAt: '2026-10-30', agreedPrice: 86000, balanceDueDate: '2027-01-15',
      siteName: '명일 우성', dongName: '11동', unitName: '905호', sellerContactName: '배성호', buyerContactName: '한지수', partnerBrokerId: null,
      payments: [
        P('p121', 'CP-1091', 'seller', 344, { baseAmount: 86000, rate: 0.4, dueDate: '2027-01-15' }),
        P('p122', 'CP-1092', 'buyer', 344, { baseAmount: 86000, rate: 0.4, dueDate: '2027-01-15' }),
      ],
      participants: [W('w121', 'u5', 'listing_agent', 'seller', 30, 103), W('w122', 'u3', 'buying_agent', 'buyer', 60, 206)],
    },
    {
      id: 'd13', transactionType: 'jeonse', stage: 'settling', stageChangedAt: '2026-09-05', agreedPrice: 40000, balanceDueDate: '2026-11-04',
      siteName: '고덕한신', dongName: '3동', unitName: '1203호', sellerContactName: '남궁민재', buyerContactName: '박지훈', partnerBrokerId: null,
      payments: [
        P('p131', 'CP-1047', 'seller', 120, { baseAmount: 40000, rate: 0.3, dueDate: '2026-11-04' }),
        P('p132', 'CP-1048', 'buyer', 120, { baseAmount: 40000, rate: 0.3, dueDate: '2026-11-04' }),
      ],
      participants: [W('w131', 'u4', 'dual_agent', 'both', 55, 132)],
    },
    {
      id: 'd14', transactionType: 'sale', stage: 'contracted', stageChangedAt: '2026-10-12', agreedPrice: 62000, balanceDueDate: '2026-11-24', propertyKind: 'non_housing',
      siteName: '고덕플라자상가', dongName: '', unitName: '2층 205호', sellerContactName: '오수빈', buyerContactName: '배성호', partnerBrokerId: 'b4',
      payments: [
        P('p141', 'CP-1066', 'seller', 558, { baseAmount: 62000, rate: 0.9, dueDate: '2026-11-24', payerType: 'business', distributions: split('p141', 'b4', 50, 558) }),
        P('p142', 'CP-1067', 'buyer', 558, { baseAmount: 62000, rate: 0.9, collectedByOffice: 'partner', dueDate: '2026-11-24', distributions: split('p142', 'b4', 50, 558) }),
      ],
      participants: [W('w141', 'u2', 'dual_agent', 'both', 40, 223)],
    },
    {
      id: 'd15', transactionType: 'monthly', stage: 'completed', stageChangedAt: '2026-09-28', agreedPrice: null, agreedDeposit: 10000, agreedMonthlyRent: 200, balanceDueDate: '2026-11-03',
      siteName: '고덕자이', dongName: '104동', unitName: '703호', sellerContactName: '정현우', buyerContactName: '김민준', partnerBrokerId: null,
      payments: [
        P('p151', 'CP-1058', 'seller', 90, Object.assign(collected('2026-11-03'), { actualAmount: 90, dueDate: '2026-11-03', taxInvoiceStatus: 'issued', taxInvoiceNo: '2026-11-00026' })),
        P('p152', 'CP-1059', 'buyer', 90, Object.assign(collected('2026-11-03'), { actualAmount: 90, dueDate: '2026-11-03' })),
      ],
      participants: [W('w151', 'u3', 'dual_agent', 'both', 60, 108)],
    },
    {
      id: 'd16', transactionType: 'sale', stage: 'contracted', stageChangedAt: '2026-11-02', agreedPrice: 148000, balanceDueDate: '2027-01-20',
      siteName: '고덕그라시움', dongName: '211동', unitName: '604호', sellerContactName: '권오성', buyerContactName: '최유진', partnerBrokerId: null,
      payments: [
        P('p161', 'CP-1095', 'seller', 592, { baseAmount: 148000, rate: 0.4, dueDate: '2027-01-20' }),
        P('p162', 'CP-1096', 'buyer', 592, { baseAmount: 148000, rate: 0.4, dueDate: '2027-01-20' }),
      ],
      participants: [W('w161', 'u5', 'dual_agent', 'both', 30, 355)],
    },
    {
      id: 'd17', transactionType: 'jeonse', stage: 'contracted', stageChangedAt: '2026-11-03', agreedPrice: 62000, balanceDueDate: '2026-12-10',
      siteName: '상일 아델리체', dongName: '5동', unitName: '1103호', sellerContactName: '임하늘', buyerContactName: '송태양', partnerBrokerId: null,
      payments: [
        P('p171', 'CP-1097', 'seller', 186, { baseAmount: 62000, rate: 0.3, dueDate: '2026-12-10' }),
        P('p172', 'CP-1098', 'buyer', 186, { baseAmount: 62000, rate: 0.3, dueDate: '2026-12-10' }),
      ],
      participants: [W('w171', 'u4', 'dual_agent', 'both', 55, 205)],
    },
    /* 거래가를 정하지 않고 만든 거래. 앱은 이때 청구를 만들지 않고, 담당자 배정 화면도 없다. */
    {
      id: 'd18', transactionType: 'jeonse', stage: 'contracted', stageChangedAt: '2026-11-03', agreedPrice: 135000, balanceDueDate: '2026-12-22',
      siteName: '명일 래미안솔베뉴', dongName: '107동', unitName: '1302호', sellerContactName: '한지수', buyerContactName: '신유나', partnerBrokerId: null,
      payments: [],
      participants: [],
    },
  ];

  const adjustments = [
    { id: 'a1', code: 'CA-2031', type: 'discount', amount: 16, reason: '임차인 요청 협의. 이번 주 현금 지급 조건으로 할인', paymentId: 'p092', dealId: 'd09', status: 'requested', requestedBy: '정민수' },
    { id: 'a2', code: 'CA-2032', type: 'discount', amount: 58, reason: '매도인 협의. 잔금일을 앞당기는 조건으로 수수료 조정', paymentId: 'p141', dealId: 'd14', status: 'requested', requestedBy: '김도윤' },
  ];

  const E = (id, title, category, amount, frequency, dayOfMonth, taxDeductible, note, isActive) => ({ id, title, category, amount, frequency, dayOfMonth, taxDeductible, note: note || null, isActive: isActive !== false });

  const expenses = [
    E('e1', '사무실 임대료', 'rent', 280, 'monthly', 25, true, '2층 사무실, 보증금 별도'),
    E('e2', '네이버 부동산 광고', 'ad', 120, 'monthly', 1, true),
    E('e3', '이실장 CP 이용료', 'ad', 33, 'monthly', 5, true),
    E('e4', '업무용 차량 리스', 'vehicle', 62, 'monthly', 10, true, '카니발 1대'),
    E('e5', '세무 기장료', 'other', 22, 'monthly', 15, true),
    E('e6', '사무용품', 'supplies', 15, 'monthly', null, false),
    E('e7', '인터넷·전화', 'telecom', 14, 'monthly', 20, true),
    E('e8', '복합기 유지보수', 'supplies', 18, 'quarterly', 5, true, '1·4·7·10월 결제'),
    E('e9', '손해배상책임 공제', 'insurance', 60, 'yearly', 12, true, '매년 3월 갱신'),
    E('e10', '공인중개사협회 회비', 'association', 36, 'yearly', 20, false, '매년 1월 납부'),
    E('e11', '정수기 렌탈', 'other', 3, 'monthly', 10, false, '10월 해지', false),
  ];

  window.DEMO_SEED = {
    today: '2026-11-04',
    users,
    partners,
    /* 데이터가 시작되기 전 달의 실적: 우리 몫 수금과 직원 수당. 9월부터는 입금 내역에서 계산한다. */
    trendHistory: {
      '2026-06': { collected: 2140, staff: 960 },
      '2026-07': { collected: 1380, staff: 610 },
      '2026-08': { collected: 2610, staff: 1180 },
    },
    /* 사무소 과세 유형. general = 일반과세자(중개보수에 부가세 10% 별도) */
    office: { vatType: 'general' },
    state: { deals, adjustments, expenses, dunned: {}, persona: 'u1' },
  };
})();
