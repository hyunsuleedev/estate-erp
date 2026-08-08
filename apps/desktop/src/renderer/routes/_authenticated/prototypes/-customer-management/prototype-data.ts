export type CustomerMode = "demand" | "supply" | "both";
export type CustomerReadiness = "ready" | "progress" | "review";
export type PlanStepState = "done" | "progress" | "blocked" | "review";

export interface DemandIntentDemo {
  id: string;
  transactionType: "매매" | "전세" | "월세";
  role: "주안" | "대안" | "병행";
  priceLabel: string;
  regions: string;
  areaLabel: string;
  timingLabel: string;
  matches: number;
}

export interface SupplyIntentDemo {
  id: string;
  transactionType: "매매" | "전세" | "월세";
  propertyLabel: string;
  priceLabel: string;
  state: "광고 중" | "가격 협의" | "계약 협상" | "확인 필요";
  timingLabel: string;
}

export interface PlanStepDemo {
  id: string;
  label: string;
  detail: string;
  state: PlanStepState;
  amountLabel?: string;
  dueLabel?: string;
  requiredBefore: "매칭 전" | "계약 전" | "잔금 전";
}

export interface CustomerManagementDemo {
  id: string;
  name: string;
  phone: string;
  assignee: string;
  lastContact: string;
  latestNote: string;
  currentSituation: string;
  readiness: CustomerReadiness;
  demands: DemandIntentDemo[];
  supplies: SupplyIntentDemo[];
  steps: PlanStepDemo[];
  nextAction: string;
  nextActionDue: string;
}

export const CUSTOMER_MANAGEMENT_DEMO: CustomerManagementDemo[] = [
  {
    id: "customer-han",
    name: "한구매",
    phone: "010-3001-0001",
    assignee: "김영업",
    lastContact: "오늘 10:24",
    latestNote:
      "매매를 우선하되 잔금 일정이 맞지 않으면 전세·월세도 검토하기로 함",
    currentSituation: "고덕동 전세 거주 · 보증금 9억",
    readiness: "progress",
    demands: [
      {
        id: "demand-han-sale",
        transactionType: "매매",
        role: "주안",
        priceLabel: "24억 ~ 27억",
        regions: "강동구 · 고덕동",
        areaLabel: "공급 32평 이상",
        timingLabel: "2026년 10월 입주",
        matches: 2,
      },
      {
        id: "demand-han-jeonse",
        transactionType: "전세",
        role: "대안",
        priceLabel: "9억 ~ 13억",
        regions: "강동구",
        areaLabel: "공급 32평 이상",
        timingLabel: "매매 불발 시 대안",
        matches: 1,
      },
      {
        id: "demand-han-monthly",
        transactionType: "월세",
        role: "병행",
        priceLabel: "보증금 5억 ~ 7억 / 월 250만 ~ 350만",
        regions: "강동구 · 하남 미사",
        areaLabel: "공급 32평 이상",
        timingLabel: "매매·전세 불발 시",
        matches: 1,
      },
    ],
    supplies: [],
    steps: [
      {
        id: "step-han-deposit",
        label: "전세보증금 반환",
        detail: "현 거주지 임대인과 반환일 협의 중",
        state: "blocked",
        amountLabel: "9억",
        dueLabel: "9월 30일 예상",
        requiredBefore: "잔금 전",
      },
      {
        id: "step-han-loan",
        label: "주택담보대출 한도",
        detail: "은행 사전 심사 완료",
        state: "done",
        amountLabel: "최대 5억",
        requiredBefore: "계약 전",
      },
    ],
    nextAction: "임대인에게 보증금 반환일 확인",
    nextActionDue: "오늘",
  },
  {
    id: "customer-kang",
    name: "강학군",
    phone: "010-3001-0004",
    assignee: "김영업",
    lastContact: "어제 16:40",
    latestNote:
      "보유 주택 매도가 조정되면 신규 매수 잔금도 같은 주로 맞추길 희망",
    currentSituation: "고덕그라시움 105동 자가 거주",
    readiness: "progress",
    demands: [
      {
        id: "demand-kang-sale",
        transactionType: "매매",
        role: "주안",
        priceLabel: "23억 ~ 26억",
        regions: "고덕동 · 상일동",
        areaLabel: "공급 34평",
        timingLabel: "매도 잔금 후 2개월 내",
        matches: 2,
      },
    ],
    supplies: [
      {
        id: "supply-kang-home",
        transactionType: "매매",
        propertyLabel: "고덕그라시움 105동 1203호",
        priceLabel: "18억 5,000만",
        state: "가격 협의",
        timingLabel: "9월 내 계약 목표",
      },
    ],
    steps: [
      {
        id: "step-kang-sale",
        label: "보유 주택 매도",
        detail: "2차 광고 가격 조정 협의 중",
        state: "progress",
        amountLabel: "희망 18억 5,000만",
        dueLabel: "9월 내 계약",
        requiredBefore: "계약 전",
      },
      {
        id: "step-kang-balance",
        label: "매도·매수 잔금 연결",
        detail: "매도 잔금일 기준 신규 매수 잔금 조율",
        state: "review",
        requiredBefore: "잔금 전",
      },
    ],
    nextAction: "보유 주택 2차 광고 가격 협의",
    nextActionDue: "8월 6일",
  },
  {
    id: "customer-choi",
    name: "최살래",
    phone: "010-3001-0002",
    assignee: "이중개",
    lastContact: "8월 1일",
    latestNote: "배우자와 자금 출처를 먼저 정리한 뒤 매물 범위를 좁히기로 함",
    currentSituation: "송파구 월세 거주 · 첫 주택 매수",
    readiness: "review",
    demands: [
      {
        id: "demand-choi-sale",
        transactionType: "매매",
        role: "주안",
        priceLabel: "30억 ~ 34억",
        regions: "강동구 · 송파구",
        areaLabel: "공급 34~45평",
        timingLabel: "2026년 내",
        matches: 1,
      },
    ],
    supplies: [],
    steps: [
      {
        id: "step-choi-loan",
        label: "대출 가능액 확인",
        detail: "주거래 은행 상담 예약 전",
        state: "review",
        amountLabel: "예상 8억",
        requiredBefore: "계약 전",
      },
      {
        id: "step-choi-family",
        label: "가족 지원금 증빙",
        detail: "증여 여부와 자금 출처 확인 필요",
        state: "review",
        amountLabel: "6억",
        requiredBefore: "계약 전",
      },
    ],
    nextAction: "자금계획표와 대출 상담 결과 요청",
    nextActionDue: "오늘",
  },
  {
    id: "customer-bae",
    name: "배투자",
    phone: "010-3001-0003",
    assignee: "박실장",
    lastContact: "오늘 09:12",
    latestNote: "전세 승계 가능한 매물을 우선 비교하고 수익률 자료 요청",
    currentSituation: "현금성 자산 확보 · 임대사업 경험 있음",
    readiness: "ready",
    demands: [
      {
        id: "demand-bae-sale",
        transactionType: "매매",
        role: "주안",
        priceLabel: "18억 ~ 22억",
        regions: "강동구 · 송파구",
        areaLabel: "공급 25~34평",
        timingLabel: "일정 유연",
        matches: 3,
      },
    ],
    supplies: [],
    steps: [
      {
        id: "step-bae-cash",
        label: "계약 자금 확인",
        detail: "계약금과 잔금 자금 확인 완료",
        state: "done",
        amountLabel: "22억",
        requiredBefore: "계약 전",
      },
    ],
    nextAction: "추천 매물 3건 비교 브리핑",
    nextActionDue: "오늘",
  },
  {
    id: "customer-kim",
    name: "김소유",
    phone: "010-2001-0001",
    assignee: "박실장",
    lastContact: "어제 11:05",
    latestNote: "매매·전세·월세를 동시에 노출하고 먼저 성사되는 조건으로 진행",
    currentSituation: "고덕그라시움 3채 보유 · 비거주",
    readiness: "progress",
    demands: [],
    supplies: [
      {
        id: "supply-kim-sale",
        transactionType: "매매",
        propertyLabel: "고덕그라시움 101동 3401호",
        priceLabel: "19억 8,000만",
        state: "광고 중",
        timingLabel: "즉시 입주",
      },
      {
        id: "supply-kim-jeonse",
        transactionType: "전세",
        propertyLabel: "고덕그라시움 102동 3401호",
        priceLabel: "12억",
        state: "확인 필요",
        timingLabel: "7월 15일 이후",
      },
      {
        id: "supply-kim-monthly",
        transactionType: "월세",
        propertyLabel: "고덕그라시움 103동 1702호",
        priceLabel: "보증금 1억 / 월 350만",
        state: "광고 중",
        timingLabel: "즉시 입주",
      },
    ],
    steps: [
      {
        id: "step-kim-confirm",
        label: "전세 매물 재확인",
        detail: "세입자 퇴거일과 내부 확인 필요",
        state: "review",
        dueLabel: "8월 7일",
        requiredBefore: "매칭 전",
      },
    ],
    nextAction: "전세 매물 세입자 퇴거일 확인",
    nextActionDue: "8월 7일",
  },
  {
    id: "customer-lee",
    name: "이갈아",
    phone: "010-7731-2048",
    assignee: "이중개",
    lastContact: "오늘 08:50",
    latestNote: "매도 협상가격 이상이면 바로 매수 계약 진행 가능",
    currentSituation: "강동롯데캐슬 84㎡ 자가 거주",
    readiness: "ready",
    demands: [
      {
        id: "demand-lee-sale",
        transactionType: "매매",
        role: "주안",
        priceLabel: "16억 ~ 19억",
        regions: "고덕동 · 명일동",
        areaLabel: "공급 34평 이상",
        timingLabel: "10월 잔금 희망",
        matches: 2,
      },
    ],
    supplies: [
      {
        id: "supply-lee-home",
        transactionType: "매매",
        propertyLabel: "강동롯데캐슬 103동 702호",
        priceLabel: "14억 8,000만",
        state: "계약 협상",
        timingLabel: "10월 잔금 협의",
      },
    ],
    steps: [
      {
        id: "step-lee-contract",
        label: "매도 계약 조건 확정",
        detail: "매수인 잔금일 회신 대기",
        state: "progress",
        amountLabel: "14억 6,000만 제안",
        dueLabel: "오늘 회신 예정",
        requiredBefore: "계약 전",
      },
    ],
    nextAction: "매도 매수인 잔금일 회신 확인",
    nextActionDue: "오늘",
  },
];

export const READINESS_META: Record<
  CustomerReadiness,
  { label: string; className: string; dotClassName: string }
> = {
  ready: {
    label: "준비 완료",
    className: "bg-success-soft text-success",
    dotClassName: "bg-success",
  },
  progress: {
    label: "선행 진행",
    className: "bg-info-soft text-info-strong",
    dotClassName: "bg-info",
  },
  review: {
    label: "확인 필요",
    className: "bg-warning-soft text-warning-strong",
    dotClassName: "bg-warning",
  },
};

export const STEP_META: Record<
  PlanStepState,
  { label: string; className: string; dotClassName: string }
> = {
  done: {
    label: "완료",
    className: "bg-success-soft text-success",
    dotClassName: "bg-success",
  },
  progress: {
    label: "진행 중",
    className: "bg-info-soft text-info-strong",
    dotClassName: "bg-info",
  },
  blocked: {
    label: "일정 미정",
    className: "bg-destructive-soft text-destructive-strong",
    dotClassName: "bg-destructive",
  },
  review: {
    label: "확인 필요",
    className: "bg-warning-soft text-warning-strong",
    dotClassName: "bg-warning",
  },
};

export function getCustomerMode(
  customer: CustomerManagementDemo,
): CustomerMode {
  if (customer.demands.length > 0 && customer.supplies.length > 0)
    return "both";
  if (customer.supplies.length > 0) return "supply";
  return "demand";
}

export function includesCustomerQuery(
  customer: CustomerManagementDemo,
  query: string,
): boolean {
  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  if (!normalized) return true;

  return [
    customer.name,
    customer.phone,
    customer.assignee,
    customer.currentSituation,
    customer.nextAction,
    customer.latestNote,
    ...customer.demands.flatMap((intent) => [
      intent.transactionType,
      intent.priceLabel,
      intent.regions,
      intent.areaLabel,
    ]),
    ...customer.supplies.flatMap((intent) => [
      intent.transactionType,
      intent.propertyLabel,
      intent.priceLabel,
      intent.state,
    ]),
    ...customer.steps.flatMap((step) => [step.label, step.detail]),
  ]
    .join(" ")
    .toLocaleLowerCase("ko-KR")
    .includes(normalized);
}
