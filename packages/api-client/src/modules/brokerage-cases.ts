import type { RequestFn } from "../client.js";

export type BrokerageCaseLedgerMode = "all" | "demand" | "listing" | "both";
export type BrokerageCaseLedgerSortField =
  | "customer"
  | "intentCount"
  | "budgetMin"
  | "budgetMax"
  | "monthlyRentMin"
  | "monthlyRentMax"
  | "areaMin"
  | "areaMax"
  | "matchCount"
  | "createdAt";

/**
 * 고객 원장 한 줄의 관련 연락처. 저장된 행이 아니라 그 줄에 담긴 의뢰의 당사자
 * (구매 의뢰 참여자, 매물 관련인)에서 읽은 것이다. id는 contactId와 같다.
 */
export interface BrokerageCaseParticipant {
  id: string;
  contactId: string;
  roles: string[];
  isPrincipal: boolean;
  isCommunicationPrimary: boolean;
  memo: string | null;
  contact: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
}

export interface BrokerageCaseDemandIntent {
  kind: "demand";
  buyerIntakeId: string;
  /** 이 줄 안에서 의뢰가 접수된 순서 (1부터). 저장된 값이 아니다. */
  intakePriorityRank: number;
  intakeRequirementCount: number;
  lifecycleStatus: string;
  receivedAt: string;
  requirementId: string;
  priorityRank: number;
  status: string;
  urgency: string;
  transactionType: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  depositMin: number | null;
  depositMax: number | null;
  monthlyRentMin: number | null;
  monthlyRentMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
  moveInDate: string | null;
  lastContactDate: string | null;
  nextContactDate: string | null;
  memo: string | null;
  assignedTo: { id: string; name: string } | null;
  matchCount: number;
  preferredSites: Array<{
    id: string;
    name: string;
    type: string;
    priority: number | null;
  }>;
  preferredRegions: Array<{
    provinceCode: string | null;
    provinceName: string | null;
    districtCode: string | null;
    districtName: string | null;
    wardCode: string | null;
    wardName: string | null;
  }>;
  contextLabel: string;
}

export interface BrokerageCaseListingIntent {
  kind: "listing";
  listingIntakeId: string;
  intakeUpdatedAt: string;
  intakeMemo: string | null;
  /** 이 줄 안에서 의뢰가 접수된 순서 (1부터). 저장된 값이 아니다. */
  intakePriorityRank: number;
  lifecycleStatus: string;
  receivedAt: string;
  listingId: string;
  listingUpdatedAt: string;
  transactionType: string;
  askingPrice: number | null;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  moveInAvailableType: string | null;
  moveInAvailableFrom: string | null;
  moveInAvailableTo: string | null;
  area: number | null;
  isPaused: boolean;
  matchCount: number;
  propertyId: string;
  siteId: string;
  siteName: string;
  districtName: string;
  wardName: string;
  dongName: string | null;
  unitName: string | null;
  contextLabel: string;
  memo: string | null;
}

export interface BrokerageCaseLatestConsultation {
  id: string;
  type: string;
  content: string;
  createdAt: string;
}

/**
 * 고객 원장의 한 줄. 사용자가 묶은 중개 건이 있으면 그 건이 한 줄이고, 없으면 실제
 * 당사자(매수인·소유자) 조합이 같은 진행 중 의뢰들이 한 줄이다.
 */
export interface BrokerageCase {
  /** 줄 id. 중개 건이 있으면 건 id, 없으면 당사자 조합에서 계산한 값이다. */
  id: string;
  /** 사용자가 중개 건으로 묶었을 때만 있다. 건 API는 이 값으로 부른다. */
  brokerageCaseId: string | null;
  title: string | null;
  memo: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** 중개 건의 진행 계획 단계 수. 건이 없으면 0. */
  stepCount: number;
  participants: BrokerageCaseParticipant[];
  primaryParticipant: BrokerageCaseParticipant | null;
  /** 대표 연락 고객에게 기록된 가장 최근 상담. 이 줄의 의뢰에 한정된 기록은 아니다. */
  latestConsultation: BrokerageCaseLatestConsultation | null;
  demandIntents: BrokerageCaseDemandIntent[];
  listingIntents: BrokerageCaseListingIntent[];
  /**
   * 이 줄의 진행 중 의뢰 전부(접수 순). demandIntents·listingIntents는 필터에 맞는 것만
   * 담지만 이 목록은 걸러지지 않는다. 건으로 묶을 때 쓴다.
   */
  listingIntakeIds: string[];
  buyerIntakeIds: string[];
  intentCount: number;
  mode: Exclude<BrokerageCaseLedgerMode, "all">;
}

/** 단계가 가리키는 거래에서 읽은 현재 상태. 금액은 표시용이다. */
export interface BrokerageCaseStepDeal {
  id: string;
  stage: string;
  isCancelled: boolean;
  transactionType: string;
  agreedPrice: number | null;
  agreedDeposit: number | null;
  agreedMonthlyRent: number | null;
  propertyLabel: string | null;
  buyerName: string | null;
  sellerName: string | null;
  /** 잔금 예정일. 대금 일정에 없으면 계약서의 잔금일. */
  balanceDate: string | null;
  balancePaidAt: string | null;
}

/**
 * 진행 계획의 한 단계. 건에 담긴 매물 의뢰나 구매 의뢰, 의뢰 없이 바로 만든 거래
 * 하나를 가리키거나(kind), 아무것도 가리키지 않는다(manual).
 */
export interface BrokerageCaseStep {
  id: string;
  /** 사용자가 정한 차례. 같은 번호면 동시 진행. */
  sortOrder: number;
  title: string;
  targetDate: string | null;
  memo: string | null;
  kind: "listing_intake" | "buyer_intake" | "deal" | "manual";
  /** manual은 사용자가 체크한 값, 나머지는 거래가 완료 단계인지. */
  done: boolean;
  doneAt: string | null;
  listingIntake: {
    id: string;
    propertyId: string;
    label: string | null;
    lifecycleStatus: string;
    closedReason: string | null;
    listings: Array<{
      id: string;
      transactionType: string;
      price: number | null;
      deposit: number | null;
      monthlyRent: number | null;
      isPaused: boolean;
    }>;
    matchCount: number;
  } | null;
  buyerIntake: {
    id: string;
    label: string | null;
    contactId: string | null;
    lifecycleStatus: string;
    requirements: Array<{
      id: string;
      status: string;
      transactionType: string | null;
    }>;
    matchCount: number;
  } | null;
  /** 이 단계의 현재 거래: 취소되지 않은 가장 최근 거래. 없으면 null. */
  deal: BrokerageCaseStepDeal | null;
}

/** 사용자가 묶은 중개 건과 진행 계획. */
export interface BrokerageCasePlan {
  id: string;
  title: string | null;
  memo: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps: BrokerageCaseStep[];
}

/** 건 목록의 한 줄. 고객 원장에 줄이 없는 건(의뢰가 모두 종료됨 등)도 포함한다. */
export interface BrokerageCaseListItem {
  id: string;
  title: string | null;
  updatedAt: string;
  stepCount: number;
  firstStepTitle: string | null;
  customerName: string | null;
}

/** 이 건에 더 담을 만한 것 (제안). */
export interface BrokerageCaseCandidates {
  /** 이미 종료된 의뢰도 포함한다 (lifecycleStatus로 구분). */
  listingIntakes: Array<{
    id: string;
    label: string;
    lifecycleStatus: string;
    transactionTypes: string[];
  }>;
  buyerIntakes: Array<{
    id: string;
    label: string;
    lifecycleStatus: string;
    transactionTypes: string[];
  }>;
  deals: BrokerageCaseStepDeal[];
}

export interface BrokerageCaseLedgerFilter {
  search?: string;
  mode?: BrokerageCaseLedgerMode;
  /** 아래 조건들은 BuyerRequirement에만 적용된다. 하나라도 있으면 구함 없는 케이스는 제외된다. */
  status?: string;
  urgency?: string;
  transactionType?: string;
  assignedToId?: string;
  preferredSiteIds?: string;
  provinceCodes?: string;
  districtCodes?: string;
  wardCodes?: string;
  priceMin?: number;
  priceMax?: number;
  depositMin?: number;
  depositMax?: number;
  budgetMin?: number;
  budgetMax?: number;
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  areaMin?: number;
  areaMax?: number;
  nextContactAfter?: string;
  nextContactBefore?: string;
  moveInAfter?: string;
  moveInBefore?: string;
  /** 매물 의뢰 가격 조건. 구매고객 필터와는 별도로 적용된다. */
  listingPriceMin?: number;
  listingPriceMax?: number;
  sortBy?: BrokerageCaseLedgerSortField;
  sortOrder?: "asc" | "desc";
  cursor?: string;
  limit?: number;
}

export interface BrokerageCaseLedgerResponse {
  items: BrokerageCase[];
  pagination: {
    limit: number;
    total: number;
    nextCursor: string | null;
  };
  summary: {
    cases: number;
    demand: number;
    listing: number;
    both: number;
  } | null;
}

export interface CreateBrokerageCaseDto {
  title?: string | null;
  memo?: string | null;
  listingIntakeIds?: string[];
  buyerIntakeIds?: string[];
}

export interface BrokerageCaseStepInput {
  title?: string;
  targetDate?: string | null;
  memo?: string | null;
}

export function createBrokerageCasesApi(request: RequestFn) {
  return {
    ledger: (filters?: BrokerageCaseLedgerFilter) =>
      request<BrokerageCaseLedgerResponse>("/brokerage-cases/ledger", {
        params: filters as Record<
          string,
          string | number | boolean | undefined
        >,
      }),
    /** 보관하지 않은 중개 건 전부. */
    findAll: () => request<BrokerageCaseListItem[]>("/brokerage-cases"),
    /** 사용자가 고른 의뢰들을 중개 건으로 묶는다. */
    create: (dto: CreateBrokerageCaseDto) =>
      request<BrokerageCasePlan>("/brokerage-cases", {
        method: "POST",
        body: dto,
      }),
    findOne: (id: string) =>
      request<BrokerageCasePlan>(`/brokerage-cases/${id}`),
    update: (
      id: string,
      dto: { title?: string | null; memo?: string | null; archived?: boolean },
    ) =>
      request<BrokerageCasePlan>(`/brokerage-cases/${id}`, {
        method: "PATCH",
        body: dto,
      }),
    /** 묶음을 푼다. 의뢰와 거래는 남는다. */
    remove: (id: string) =>
      request<{ success: boolean }>(`/brokerage-cases/${id}`, {
        method: "DELETE",
      }),
    candidates: (id: string) =>
      request<BrokerageCaseCandidates>(`/brokerage-cases/${id}/candidates`),
    addIntake: (
      id: string,
      dto: { kind: "listing" | "buyer"; intakeId: string },
    ) =>
      request<BrokerageCasePlan>(`/brokerage-cases/${id}/intakes`, {
        method: "POST",
        body: dto,
      }),
    /** 의뢰를 가리키지 않는 단계. dealId를 주면 거래를 직접 가리킨다. */
    createStep: (
      id: string,
      dto: BrokerageCaseStepInput & { dealId?: string | null },
    ) =>
      request<BrokerageCasePlan>(`/brokerage-cases/${id}/steps`, {
        method: "POST",
        body: dto,
      }),
    updateStep: (
      id: string,
      stepId: string,
      dto: BrokerageCaseStepInput & { done?: boolean },
    ) =>
      request<BrokerageCasePlan>(`/brokerage-cases/${id}/steps/${stepId}`, {
        method: "PATCH",
        body: dto,
      }),
    /** 의뢰를 가리키는 단계를 지우면 그 의뢰도 건에서 빠진다. */
    removeStep: (id: string, stepId: string) =>
      request<BrokerageCasePlan>(`/brokerage-cases/${id}/steps/${stepId}`, {
        method: "DELETE",
      }),
    /** 건의 모든 단계를 빠짐없이 보낸다. 같은 번호는 동시 진행. */
    reorderSteps: (
      id: string,
      steps: Array<{ id: string; sortOrder: number }>,
    ) =>
      request<BrokerageCasePlan>(`/brokerage-cases/${id}/steps/order`, {
        method: "PUT",
        body: { steps },
      }),
  };
}
