export type Readiness = 'ready' | 'progress' | 'review';
export type DependencyState = 'done' | 'progress' | 'blocked' | 'review';

export interface BuyerDependency {
  id: string;
  label: string;
  detail: string;
  state: DependencyState;
  dueLabel?: string;
  amountLabel?: string;
}

export interface BuyerRequirementDemo {
  id: string;
  transactionType: '매매' | '전세';
  homeType: string;
  priceLabel: string;
  regions: string[];
  sizeLabel: string;
  moveLabel: string;
  matches: number;
  urgency: '긴급' | '보통' | '여유';
}

export interface BuyerCustomerDemo {
  id: string;
  name: string;
  phone: string;
  assignee: string;
  lastContact: string;
  currentSituation: string;
  readiness: Readiness;
  readinessReason: string;
  nextAction: string;
  nextActionDue: string;
  requirements: BuyerRequirementDemo[];
  dependencies: BuyerDependency[];
}

export const BUYER_CUSTOMERS: BuyerCustomerDemo[] = [
  {
    id: 'buyer-han',
    name: '한구매',
    phone: '010-3001-0001',
    assignee: '김영업',
    lastContact: '오늘 10:24',
    currentSituation: '고덕동 전세 거주 · 보증금 9억',
    readiness: 'progress',
    readinessReason: '전세보증금 반환일 확정 후 잔금 일정 결정 가능',
    nextAction: '임대인에게 보증금 반환일 확인',
    nextActionDue: '오늘',
    requirements: [
      {
        id: 'req-han-sale',
        transactionType: '매매',
        homeType: '아파트',
        priceLabel: '24억 ~ 27억',
        regions: ['강동구', '고덕동'],
        sizeLabel: '전용 84㎡ 이상',
        moveLabel: '2026년 10월 입주',
        matches: 2,
        urgency: '긴급',
      },
      {
        id: 'req-han-jeonse',
        transactionType: '전세',
        homeType: '아파트',
        priceLabel: '9억 ~ 13억',
        regions: ['강동구'],
        sizeLabel: '전용 84㎡ 이상',
        moveLabel: '매매 불발 시 대안',
        matches: 1,
        urgency: '보통',
      },
    ],
    dependencies: [
      {
        id: 'dep-han-deposit',
        label: '전세보증금 반환',
        detail: '현 거주지 임대인과 반환일 협의 중',
        state: 'blocked',
        dueLabel: '9월 30일 예상',
        amountLabel: '9억',
      },
      {
        id: 'dep-han-loan',
        label: '주택담보대출',
        detail: '은행 사전 한도 확인 완료',
        state: 'done',
        amountLabel: '최대 5억',
      },
    ],
  },
  {
    id: 'buyer-kang',
    name: '강학군',
    phone: '010-3001-0004',
    assignee: '김영업',
    lastContact: '어제 16:40',
    currentSituation: '고덕그라시움 105동 자가 거주',
    readiness: 'progress',
    readinessReason: '보유 주택 매도 계약 후 신규 매수 계약 예정',
    nextAction: '보유 주택 2차 광고 가격 협의',
    nextActionDue: '8월 6일',
    requirements: [
      {
        id: 'req-kang-sale',
        transactionType: '매매',
        homeType: '아파트',
        priceLabel: '23억 ~ 26억',
        regions: ['고덕동', '상일동'],
        sizeLabel: '전용 84㎡',
        moveLabel: '매도 잔금 후 2개월 내',
        matches: 2,
        urgency: '보통',
      },
    ],
    dependencies: [
      {
        id: 'dep-kang-sale',
        label: '보유 주택 매도',
        detail: '고덕그라시움 105동 1203호 · 광고 중',
        state: 'progress',
        dueLabel: '9월 내 계약 목표',
        amountLabel: '희망 18.5억',
      },
      {
        id: 'dep-kang-bridge',
        label: '잔금 연결',
        detail: '매도 잔금일 기준으로 신규 매수 잔금 조율',
        state: 'review',
      },
    ],
  },
  {
    id: 'buyer-choi',
    name: '최살래',
    phone: '010-3001-0002',
    assignee: '이중개',
    lastContact: '8월 1일',
    currentSituation: '송파구 월세 거주 · 첫 주택 매수',
    readiness: 'review',
    readinessReason: '대출 한도와 가족 지원금 증빙이 아직 확인되지 않음',
    nextAction: '자금계획표와 대출 상담 결과 요청',
    nextActionDue: '8월 5일',
    requirements: [
      {
        id: 'req-choi-sale',
        transactionType: '매매',
        homeType: '아파트',
        priceLabel: '30억 ~ 34억',
        regions: ['강동구', '송파구'],
        sizeLabel: '전용 84~114㎡',
        moveLabel: '2026년 내',
        matches: 1,
        urgency: '보통',
      },
    ],
    dependencies: [
      {
        id: 'dep-choi-loan',
        label: '대출 가능액 확인',
        detail: '주거래 은행 상담 예약 전',
        state: 'review',
        amountLabel: '예상 8억',
      },
      {
        id: 'dep-choi-family',
        label: '가족 지원금 증빙',
        detail: '증여 여부와 자금 출처 확인 필요',
        state: 'review',
        amountLabel: '6억',
      },
    ],
  },
  {
    id: 'buyer-bae',
    name: '배투자',
    phone: '010-3001-0003',
    assignee: '박실장',
    lastContact: '오늘 09:12',
    currentSituation: '현금성 자산 확보 · 임대사업 경험 있음',
    readiness: 'ready',
    readinessReason: '선행 거래 없이 계약금 즉시 집행 가능',
    nextAction: '추천 매물 3건 비교 브리핑',
    nextActionDue: '오늘',
    requirements: [
      {
        id: 'req-bae-sale',
        transactionType: '매매',
        homeType: '아파트',
        priceLabel: '18억 ~ 22억',
        regions: ['강동구', '송파구'],
        sizeLabel: '전용 59~84㎡',
        moveLabel: '일정 유연',
        matches: 3,
        urgency: '여유',
      },
    ],
    dependencies: [
      {
        id: 'dep-bae-cash',
        label: '계약 자금',
        detail: '계약금 및 잔금 자금 확인 완료',
        state: 'done',
        amountLabel: '22억',
      },
    ],
  },
  {
    id: 'buyer-yoon',
    name: '윤새집',
    phone: '010-4012-8810',
    assignee: '이중개',
    lastContact: '7월 29일',
    currentSituation: '둔촌동 전세 거주 · 계약 만료 11월',
    readiness: 'review',
    readinessReason: '매수와 전세 연장 중 의사결정이 정리되지 않음',
    nextAction: '배우자 포함 방문 상담 일정 확정',
    nextActionDue: '8월 7일',
    requirements: [
      {
        id: 'req-yoon-sale',
        transactionType: '매매',
        homeType: '아파트',
        priceLabel: '16억 ~ 19억',
        regions: ['둔촌동', '성내동'],
        sizeLabel: '전용 59㎡ 이상',
        moveLabel: '11월 전후',
        matches: 0,
        urgency: '보통',
      },
    ],
    dependencies: [
      {
        id: 'dep-yoon-decision',
        label: '가족 의사결정',
        detail: '매수 전환 여부 배우자와 최종 협의 필요',
        state: 'review',
      },
      {
        id: 'dep-yoon-deposit',
        label: '보증금 반환',
        detail: '임대인에게 퇴거 의사 미통보',
        state: 'review',
        amountLabel: '7.5억',
      },
    ],
  },
  {
    id: 'buyer-jeong',
    name: '정현금',
    phone: '010-8842-2026',
    assignee: '박실장',
    lastContact: '어제 11:05',
    currentSituation: '자가 거주 유지 · 추가 매수',
    readiness: 'ready',
    readinessReason: '취득세 포함 자기자금 확인 완료',
    nextAction: '토요일 현장 방문 2건 확정',
    nextActionDue: '8월 8일',
    requirements: [
      {
        id: 'req-jeong-sale',
        transactionType: '매매',
        homeType: '아파트',
        priceLabel: '12억 ~ 15억',
        regions: ['강동구'],
        sizeLabel: '전용 59㎡',
        moveLabel: '세입자 승계 가능',
        matches: 2,
        urgency: '여유',
      },
    ],
    dependencies: [
      {
        id: 'dep-jeong-cash',
        label: '자금 확인',
        detail: '취득 부대비용 포함 자금 확인 완료',
        state: 'done',
        amountLabel: '15.8억',
      },
    ],
  },
];

export const READINESS_META: Record<
  Readiness,
  { label: string; shortLabel: string; dotClassName: string; badgeClassName: string }
> = {
  ready: {
    label: '즉시 매칭 가능',
    shortLabel: '준비 완료',
    dotClassName: 'bg-success',
    badgeClassName: 'bg-success-soft text-success',
  },
  progress: {
    label: '선행 거래 진행',
    shortLabel: '진행 중',
    dotClassName: 'bg-info',
    badgeClassName: 'bg-info-soft text-info-strong',
  },
  review: {
    label: '확인 필요',
    shortLabel: '확인 필요',
    dotClassName: 'bg-warning',
    badgeClassName: 'bg-warning-soft text-warning-strong',
  },
};

export const DEPENDENCY_META: Record<
  DependencyState,
  { label: string; dotClassName: string; badgeClassName: string }
> = {
  done: {
    label: '확인 완료',
    dotClassName: 'bg-success',
    badgeClassName: 'bg-success-soft text-success',
  },
  progress: {
    label: '진행 중',
    dotClassName: 'bg-info',
    badgeClassName: 'bg-info-soft text-info-strong',
  },
  blocked: {
    label: '일정 미확정',
    dotClassName: 'bg-destructive',
    badgeClassName: 'bg-destructive-soft text-destructive-strong',
  },
  review: {
    label: '확인 필요',
    dotClassName: 'bg-warning',
    badgeClassName: 'bg-warning-soft text-warning-strong',
  },
};

export function includesBuyerSearch(customer: BuyerCustomerDemo, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase('ko-KR');
  if (!normalized) return true;

  return [
    customer.name,
    customer.phone,
    customer.assignee,
    customer.currentSituation,
    ...customer.requirements.flatMap((requirement) => [
      requirement.transactionType,
      requirement.homeType,
      ...requirement.regions,
    ]),
    ...customer.dependencies.flatMap((dependency) => [dependency.label, dependency.detail]),
  ]
    .join(' ')
    .toLocaleLowerCase('ko-KR')
    .includes(normalized);
}
