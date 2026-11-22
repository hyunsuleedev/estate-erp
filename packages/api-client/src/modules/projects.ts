import type { RequestFn } from "../client.js";

export type CustomerLedgerMode = "all" | "demand" | "listing" | "both";
export type CustomerLedgerSortField =
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
export interface CustomerLedgerParticipant {
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

export interface CustomerLedgerDemandIntent {
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

export interface CustomerLedgerListingIntent {
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

export interface CustomerLedgerLatestConsultation {
  id: string;
  type: string;
  content: string;
  createdAt: string;
}

/**
 * 고객 원장의 한 줄. 사용자가 묶은 프로젝트가 있으면 그 프로젝트가 한 줄이고, 없으면 실제
 * 당사자(매수인·소유자) 조합이 같은 진행 중 의뢰들이 한 줄이다.
 */
export interface CustomerLedgerRow {
  /** 줄 id. 프로젝트가 있으면 프로젝트 id, 없으면 당사자 조합에서 계산한 값이다. */
  id: string;
  /** 사용자가 프로젝트로 묶었을 때만 있다. 프로젝트 API는 이 값으로 부른다. */
  projectId: string | null;
  title: string | null;
  memo: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** 프로젝트의 진행 계획 단계 수. 프로젝트가 없으면 0. */
  stepCount: number;
  participants: CustomerLedgerParticipant[];
  primaryParticipant: CustomerLedgerParticipant | null;
  /** 대표 연락 고객에게 기록된 가장 최근 상담. 이 줄의 의뢰에 한정된 기록은 아니다. */
  latestConsultation: CustomerLedgerLatestConsultation | null;
  demandIntents: CustomerLedgerDemandIntent[];
  listingIntents: CustomerLedgerListingIntent[];
  /**
   * 이 줄의 진행 중 의뢰 전부(접수 순). demandIntents·listingIntents는 필터에 맞는 것만
   * 담지만 이 목록은 걸러지지 않는다. 프로젝트로 묶을 때 쓴다.
   */
  listingIntakeIds: string[];
  buyerIntakeIds: string[];
  intentCount: number;
  mode: Exclude<CustomerLedgerMode, "all">;
}

/** 단계가 가리키는 거래에서 읽은 현재 상태. 금액은 표시용이다. */
export interface ProjectStepDeal {
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
 * 진행 계획의 한 단계. 프로젝트에 담긴 매물 의뢰나 구매 의뢰, 의뢰 없이 바로 만든 거래
 * 하나를 가리키거나(kind), 아무것도 가리키지 않는다(manual).
 */
export interface ProjectStep {
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
  deal: ProjectStepDeal | null;
}

/** 프로젝트의 사람. 대표 고객은 사용자가 정한 값이고, 나머지는 담긴 의뢰에서 읽은 당사자다. */
export interface ProjectPerson {
  contactId: string;
  name: string;
  /** 숫자만 있는 전화번호 */
  phone: string | null;
  /** primary: 대표 고객 · buyer: 구매 의뢰의 참여자 · owner: 매물 의뢰 집의 소유자 */
  role: "primary" | "buyer" | "owner";
}

export interface ProjectPrimaryContact {
  id: string;
  name: string;
  phone: string | null;
}

/** 사용자가 연 프로젝트와 진행 계획. */
export interface ProjectPlan {
  id: string;
  title: string | null;
  memo: string | null;
  /** 직접 끝낸 때. 비어 있으면 열려 있다. */
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** 사용자가 정한 대표 고객. 정하지 않았으면 null. */
  primaryContact: ProjectPrimaryContact | null;
  assignedTo: { id: string; name: string } | null;
  /** 대표 고객이 맨 앞, 그다음 담긴 의뢰의 당사자. 같은 사람은 한 번만 나온다. */
  people: ProjectPerson[];
  commentCount: number;
  steps: ProjectStep[];
}

/** 프로젝트 목록의 한 줄. 고객 원장에 줄이 없는 프로젝트(의뢰가 모두 종료됨, 의뢰 없이 엶)도 포함한다. */
export interface ProjectListItem {
  id: string;
  title: string | null;
  memo: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  primaryContact: ProjectPrimaryContact | null;
  assignedTo: { id: string; name: string } | null;
  /** 대표 고객. 정하지 않았으면 담긴 의뢰의 첫 당사자. */
  customerName: string | null;
  peopleCount: number;
  buyerIntakeCount: number;
  listingIntakeCount: number;
  stepCount: number;
  /** 끝난 단계 수. 저장된 값이 아니라 의뢰·거래에서 읽어 계산한다. */
  doneStepCount: number;
  firstStepTitle: string | null;
  /** 아직 끝나지 않은 첫 단계 */
  nextStepTitle: string | null;
  nextStepTargetDate: string | null;
  commentCount: number;
  latestComment: {
    body: string;
    createdAt: string;
    authorName: string | null;
  } | null;
}

export interface ProjectList {
  /** 조건에 맞는 전체 수. items는 그중 한 쪽이다. */
  total: number;
  /** 다음 쪽의 offset. 더 없으면 null. */
  nextOffset: number | null;
  items: ProjectListItem[];
}

export type ProjectListStatus = "open" | "archived" | "all";
/** updated: 최근 고친 순(기본) · created: 최근 시작한 순 */
export type ProjectListSort = "updated" | "created";

export interface ProjectListFilter {
  /** open(기본): 끝내지 않은 것 · archived: 끝낸 것 */
  status?: ProjectListStatus;
  /** 이름, 대표 고객, 담긴 의뢰의 당사자 이름 */
  search?: string;
  assignedToId?: string;
  sort?: ProjectListSort;
  /** 쪽 넘기기. 앞 쪽의 nextOffset을 준다. */
  offset?: number;
  /** 한 쪽의 수 (기본 50, 최대 100) */
  limit?: number;
}

/** 프로젝트에 적는 코멘트. 직원이 일에 대해 적는 글이다(손님과 나눈 대화는 상담). */
export interface ProjectComment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  /** 적은 직원. 직원 기록이 지워졌으면 null. */
  author: { id: string; name: string } | null;
}

export interface ProjectCommentList {
  /** 이 프로젝트의 코멘트 전체 수 */
  total: number;
  /** 더 오래된 쪽을 읽을 때 before로 그대로 돌려줄 값. 더 없으면 null. 뜻을 풀어 쓰지 않는다. */
  nextBefore: string | null;
  /** 한 쪽. 쪽 안에서는 오래된 것부터 */
  items: ProjectComment[];
}

export interface UpdateProjectDto {
  title?: string | null;
  memo?: string | null;
  /** true면 끝내고, false면 다시 연다 */
  archived?: boolean;
  primaryContactId?: string | null;
  assignedToId?: string | null;
}

/** 이 프로젝트에 더 담을 만한 것 (제안). */
export interface ProjectCandidates {
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
  deals: ProjectStepDeal[];
}

export interface CustomerLedgerFilter {
  search?: string;
  mode?: CustomerLedgerMode;
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
  sortBy?: CustomerLedgerSortField;
  sortOrder?: "asc" | "desc";
  cursor?: string;
  limit?: number;
}

export interface CustomerLedgerResponse {
  items: CustomerLedgerRow[];
  pagination: {
    limit: number;
    total: number;
    nextCursor: string | null;
  };
  summary: {
    /** 원장의 줄 수 (프로젝트 수가 아니다). */
    rows: number;
    demand: number;
    listing: number;
    both: number;
  } | null;
}

/** 대표 고객을 정하거나 의뢰를 하나 이상 담아야 한다. */
export interface CreateProjectDto {
  title?: string | null;
  memo?: string | null;
  primaryContactId?: string | null;
  assignedToId?: string | null;
  listingIntakeIds?: string[];
  buyerIntakeIds?: string[];
}

export interface ProjectStepInput {
  title?: string;
  targetDate?: string | null;
  memo?: string | null;
}

export function createProjectsApi(request: RequestFn) {
  return {
    ledger: (filters?: CustomerLedgerFilter) =>
      request<CustomerLedgerResponse>("/projects/ledger", {
        params: filters as Record<
          string,
          string | number | boolean | undefined
        >,
      }),
    /** 프로젝트 목록. 조건을 주지 않으면 끝내지 않은 프로젝트다. */
    findAll: (filter?: ProjectListFilter) =>
      request<ProjectList>("/projects", {
        params: filter as Record<string, string | number | undefined>,
      }),
    /** 프로젝트를 연다. 대표 고객만 정해 열거나, 고른 의뢰들을 묶어 연다. */
    create: (dto: CreateProjectDto) =>
      request<ProjectPlan>("/projects", {
        method: "POST",
        body: dto,
      }),
    findOne: (id: string) =>
      request<ProjectPlan>(`/projects/${id}`),
    update: (id: string, dto: UpdateProjectDto) =>
      request<ProjectPlan>(`/projects/${id}`, {
        method: "PATCH",
        body: dto,
      }),
    /** 묶음을 푼다. 의뢰와 거래는 남는다. */
    remove: (id: string) =>
      request<{ success: boolean }>(`/projects/${id}`, {
        method: "DELETE",
      }),
    /** 최근 쪽부터. before에 앞 쪽의 nextBefore를 주면 그보다 오래된 쪽을 준다. */
    comments: (id: string, page?: { before?: string; limit?: number }) =>
      request<ProjectCommentList>(`/projects/${id}/comments`, {
        params: page as Record<string, string | number | undefined>,
      }),
    createComment: (id: string, body: string) =>
      request<ProjectComment>(`/projects/${id}/comments`, {
        method: "POST",
        body: { body },
      }),
    updateComment: (id: string, commentId: string, body: string) =>
      request<ProjectComment>(`/projects/${id}/comments/${commentId}`, {
        method: "PATCH",
        body: { body },
      }),
    removeComment: (id: string, commentId: string) =>
      request<{ success: boolean }>(`/projects/${id}/comments/${commentId}`, {
        method: "DELETE",
      }),
    candidates: (id: string) =>
      request<ProjectCandidates>(`/projects/${id}/candidates`),
    addIntake: (
      id: string,
      dto: { kind: "listing" | "buyer"; intakeId: string },
    ) =>
      request<ProjectPlan>(`/projects/${id}/intakes`, {
        method: "POST",
        body: dto,
      }),
    /** 의뢰를 가리키지 않는 단계. dealId를 주면 거래를 직접 가리킨다. */
    createStep: (
      id: string,
      dto: ProjectStepInput & { dealId?: string | null },
    ) =>
      request<ProjectPlan>(`/projects/${id}/steps`, {
        method: "POST",
        body: dto,
      }),
    updateStep: (
      id: string,
      stepId: string,
      dto: ProjectStepInput & { done?: boolean },
    ) =>
      request<ProjectPlan>(`/projects/${id}/steps/${stepId}`, {
        method: "PATCH",
        body: dto,
      }),
    /** 의뢰를 가리키는 단계를 지우면 그 의뢰도 프로젝트에서 빠진다. */
    removeStep: (id: string, stepId: string) =>
      request<ProjectPlan>(`/projects/${id}/steps/${stepId}`, {
        method: "DELETE",
      }),
    /** 프로젝트의 모든 단계를 빠짐없이 보낸다. 같은 번호는 동시 진행. */
    reorderSteps: (
      id: string,
      steps: Array<{ id: string; sortOrder: number }>,
    ) =>
      request<ProjectPlan>(`/projects/${id}/steps/order`, {
        method: "PUT",
        body: { steps },
      }),
  };
}
