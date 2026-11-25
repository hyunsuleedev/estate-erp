import type { RequestFn } from '../client.js';
import type { Contact } from './contacts.js';
import type { CommissionPayment } from './finance.js';
import type { Listing } from './listings.js';
import type { Property } from './properties.js';

export interface DealPayment {
  id: string;
  officeId: string;
  dealId: string;
  /// pre_contract / contract / interim / balance / refund
  kind: string;
  sequence: number;
  scheduledAmount: number;
  scheduledDate: string | null;
  paidAmount: number | null;
  paidAt: string | null;
  /// pending / partial / paid / overdue / cancelled
  status: string;
  method: string | null;
  accountInfo: string | null;
  payerName: string | null;
  receiptUrl: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 거래에 실려 오는 계약서 요약: 상태 · 금액 · 날짜 */
export interface DealContract {
  id: string;
  dealId: string | null;
  status: string;
  transactionType: string;
  totalPrice: number;
  monthlyRent: number | null;
  contractDate: string | null;
  statedDeposit: number | null;
  statedInterimPayment: number | null;
  statedInterimDate: string | null;
  statedBalance: number | null;
  statedBalanceDate: string | null;
  moveInDate: string | null;
  leaseStartDate: string | null;
  leaseEndDate: string | null;
}

/** 목록 줄의 당사자: 이름과 대표 번호 */
export interface DealListContact {
  id: string;
  name: string;
  phone: string | null;
}

/** 목록 줄의 집: 어느 단지 · 동 · 호인지 */
export interface DealListProperty {
  id: string;
  siteId: string | null;
  unitId?: string | null;
  site?: {
    id: string;
    name: string;
    type: string;
    roadAddress: string | null;
    jibunAddress: string | null;
  } | null;
  unit?: {
    id: string;
    name: string | null;
    floor: number | null;
    floorEnd?: number | null;
    floorLabel?: string | null;
    exclusiveAreaM2: number | string | null;
    supplyAreaM2: number | string | null;
    dong?: { id: string; name: string; isPlaceholder?: boolean } | null;
  } | null;
}

/** 목록 줄의 거래 조건: 매물가와 거래 유형 (집은 property에 있다) */
export interface DealListListing {
  id: string;
  propertyId: string;
  intakeId: string;
  transactionType: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  isPaused: boolean;
}

/**
 * 거래 목록(GET /deals · 종료 목록)의 한 줄: 어느 집 · 누구 · 어느 단계 · 얼마 · 대금 일정 · 계약서 요약.
 * 수수료는 합계(commissionSummary)만 있다. 청구 · 배분 · 조정과 연락처 상세는 findOne(Deal)에 있다.
 */
export interface DealListItem {
  id: string;
  officeId: string;
  propertyId: string | null;
  listingId: string | null;
  externalListingId: string | null;
  matchId: string | null;
  /** 이 거래가 어느 구매 의뢰의 것인지. 구매 의뢰 없이 만든 거래는 null. */
  buyerIntakeId: string | null;
  stage: string;
  stageChangedAt: string;
  isCancelled: boolean;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledBy: string | null;
  buyerContactId: string | null;
  sellerContactId: string | null;
  transactionType: string;
  agreedPrice: number | null;
  agreedDeposit: number | null;
  agreedMonthlyRent: number | null;
  agreedMoveInDate: string | null;
  specialTerms: string | null;
  preContractCarriedOver: boolean;
  /// 서버가 include 로 payment 를 같이 조회할 때 응답에 동봉하는 계산 요약.
  /// DB 컬럼이 아니므로 목록 응답 구성 시 서버에서 채워서 내려보낸다.
  commissionSummary?: {
    billed: number;
    ourShare: number;
    partnerShare: number;
    collected: number;
  } | null;
  /**
   * 중개사가 담당이 아닌 거래를 볼 때 true. 그때는 commissionPayments 가 비고 commissionSummary 가 null 이다
   * (수수료는 대표·매니저와 그 거래의 담당만 본다 — 수금 화면과 같은 기준).
   */
  commissionHidden?: boolean;
  // 공동중개
  isJointBrokerage: boolean;
  ourSide: string | null;
  partnerBrokerId: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  property?: DealListProperty | null;
  listing?: DealListListing | null;
  buyerContact?: DealListContact | null;
  sellerContact?: DealListContact | null;
  partnerBroker?: { id: string; name: string; phone: string | null } | null;
  participants?: Array<{
    id: string;
    userId: string;
    role: string;
    side: string;
    commissionAmount?: number | null;
    /// Prisma Decimal이라 응답에서는 문자열로 온다.
    commissionRate?: number | string | null;
    /** 이 거래의 사무소 몫 가운데 이 직원이 맡은 비중 (%). 값이 있는 사람이 담당이다 (직원 정산 대상). */
    sharePercent?: number | null;
    settlementStatus?: string;
    settlementDate?: string | null;
    user: { id: string; name: string };
  }>;
  payments?: DealPayment[];
  /** 이 거래의 계약서 요약 (없으면 null). 문서와 당사자는 계약 상세에 있다 */
  contract?: DealContract | null;
}

/** 거래 상세(GET /deals/:id). 목록 줄의 칸에 더해 집 · 거래 조건 · 연락처의 상세와 수수료 청구가 있다 */
export interface Deal
  extends Omit<DealListItem, 'property' | 'listing' | 'buyerContact' | 'sellerContact'> {
  property?: Property | null;
  listing?: Listing | null;
  buyerContact?: Contact | null;
  sellerContact?: Contact | null;
  /// 수수료 청구. 목록·상세 응답에 분배와 함께 포함된다.
  /// adjustments 에는 승인을 기다리는 조정만 실린다 (DealPendingAdjustment 모양, 요청한 사람 이름 포함).
  commissionPayments?: CommissionPayment[];
}

/** 거래 응답의 수수료 청구에 실리는 승인 대기 조정 (할인·면제·대손). 금액은 만원, 깎는 쪽이라 음수. */
export interface DealPendingAdjustment {
  id: string;
  type: 'discount' | 'waive' | 'bad_debt';
  amount: number;
  reason: string;
  status: 'requested';
  requestedAt: string;
  requestedBy?: { id: string; name: string } | null;
}

export interface DealListFilter {
  /** 이 집의 거래만 */
  propertyId?: string;
  /** 이 거래 조건들의 거래만 (propertyId와 함께 주면 둘 중 하나에 걸린 거래) */
  listingIds?: string[];
  partnerBrokerId?: string;
  /** 공동중개 거래만 */
  joint?: boolean;
  /** 계약서가 아직 없는 거래만 */
  withoutContract?: boolean;
  /** 단지 이름 · 당사자 이름으로 찾기 */
  search?: string;
  limit?: number;
}

/** 수수료 청구 · 배분까지 실은 목록 줄 */
export type DealWithCommissions = DealListItem & Pick<Deal, 'commissionPayments'>;

export interface CreateDealDto {
  propertyId?: string;
  listingId?: string;
  matchId?: string;
  /** 매칭 없이 만드는 거래가 어느 구매 의뢰의 것인지. 매칭이 있으면 무시된다. */
  buyerIntakeId?: string;
  transactionType?: string;
  agreedPrice?: number;
  agreedDeposit?: number;
  agreedMonthlyRent?: number;
  agreedMoveInDate?: string;
  specialTerms?: string;
  buyerContactId?: string;
  sellerContactId?: string;
  /// 공동중개 여부
  isJointBrokerage?: boolean;
  /// 공동중개 시 우리 담당 측: seller / buyer / both
  ourSide?: 'seller' | 'buyer' | 'both';
  partnerBrokerId?: string;
  /** 상태 토글에서 Deal 생성 시 보류 상태를 함께 해제 */
  resumeListing?: boolean;
  memo?: string;
  /** 담당 직원. 비우면 만든 사람 (대표·매니저만 다른 직원을 고를 수 있다) */
  assigneeUserId?: string;
}

export interface UpdateDealStageDto {
  stage: string;
  agreedPrice?: number;
  agreedDeposit?: number;
  agreedMonthlyRent?: number;
  memo?: string;
}

/** 거래 조건 고치기. 보낸 칸만 바뀐다. null 은 비우기. */
export interface UpdateDealDto {
  buyerContactId?: string | null;
  sellerContactId?: string | null;
  agreedPrice?: number | null;
  agreedDeposit?: number | null;
  agreedMonthlyRent?: number | null;
  /** YYYY-MM-DD */
  agreedMoveInDate?: string | null;
  specialTerms?: string | null;
  memo?: string | null;
  isJointBrokerage?: boolean;
  ourSide?: 'seller' | 'buyer' | 'both';
  partnerBrokerId?: string | null;
}

export interface UpdateDealResult extends Deal {
  /**
   * 자동 수수료 청구를 어떻게 했는지.
   * synced: 새 조건에 맞췄음 · kept: 사람이 정한 금액·분배나 입금 기록이 있어 그대로 둠 · none: 할 일 없음
   */
  commissionNotice: 'synced' | 'kept' | 'none';
}

/** 우리 쪽 한 청구의 수수료 금액 (만원). 법정 상한을 넘을 수 없다. */
export interface SetDealCommissionDto {
  side: 'seller' | 'buyer';
  amount: number;
  /** 업무용 오피스텔처럼 물건 종류를 바꿔 계산했을 때 (housing / officetel / non_housing) */
  propertyKind?: 'housing' | 'officetel' | 'non_housing';
}

export interface CancelDealDto {
  cancelReason?: string;
  cancelledBy?: string;
  /** 이미 받은 가계약금·계약금을 어떻게 했는지 (받은 대금 줄의 메모로 남는다) */
  paidMoneyNote?: string;
}

export interface DealPropertyTransitionPreview {
  eligible: boolean;
  reason?: string;
  kind: 'sale' | 'lease' | null;
  propertyId: string | null;
  currentOwners: Array<{
    propertyContactId: string;
    contactId: string;
    name: string;
    role: string;
  }>;
  currentLeases: Array<{
    leaseId: string;
    deposit: number | null;
    monthlyRent: number | null;
    tenants: Array<{ contactId: string; name: string; role: string }>;
  }>;
  proposedBuyers: Array<{
    contactId: string;
    name: string;
    shareRatio: number | null;
    isPrimary: boolean;
  }>;
  leaseTerms?: {
    deposit: number | null;
    monthlyRent: number | null;
    contractStart: string | null;
    contractEnd: string | null;
  } | null;
}

export interface ApplyDealPropertyTransitionDto {
  archiveExistingOwners?: boolean;
  registerNewOwners?: boolean;
  markBuyersResident?: boolean;
  closeExistingLeases?: boolean;
  createNewLease?: boolean;
}

export interface CreateDealPaymentDto {
  /// pre_contract / contract / interim / balance / refund
  kind: string;
  /// 중도금 차수 (생략 시 interim 은 자동 증가, 나머지는 1)
  sequence?: number;
  /// 예정 금액 (만원)
  scheduledAmount: number;
  scheduledDate?: string;
  memo?: string;
}

export interface UpdateDealPaymentDto {
  scheduledAmount?: number;
  scheduledDate?: string | null;
  /// 실입금 금액 (만원). status 미지정 시 서버가 paid/partial 자동 판정
  paidAmount?: number | null;
  paidAt?: string | null;
  /// pending / partial / paid / overdue / cancelled
  status?: string;
  method?: string | null;
  payerName?: string | null;
  memo?: string | null;
}

export function createDealsApi(request: RequestFn) {
  return {
    findActive: () => request<DealListItem[]>('/deals?scope=active'),
    findArchive: (filters: { kind: 'closed' | 'cancelled'; q: string; since: string }, cursor?: string) => {
      const params = new URLSearchParams({ ...filters, ...(cursor && { cursor }) });
      return request<{ items: DealListItem[]; nextCursor: string | null }>(`/deals/views/archive?${params}`);
    },

    /** 거래 목록. 조건 없이 부르면 사무소의 모든 거래(취소 · 종료 포함)다 — 쓸 만큼만 조건으로 좁힌다. */
    findAll: (filter: DealListFilter = {}) =>
      request<DealListItem[]>('/deals', {
        params: {
          propertyId: filter.propertyId,
          listingIds: filter.listingIds?.length ? filter.listingIds.join(',') : undefined,
          partnerBrokerId: filter.partnerBrokerId,
          joint: filter.joint ? 'true' : undefined,
          withoutContract: filter.withoutContract ? 'true' : undefined,
          search: filter.search || undefined,
          limit: filter.limit,
        },
      }),

    /** 공동중개 거래와 그 수수료 청구 · 배분 (공동중개 정산 화면) */
    findJointWithCommissions: () =>
      request<DealWithCommissions[]>('/deals', {
        params: { joint: 'true', expand: 'commissions' },
      }),

    /** 파트너 중개사가 연결된 거래와 그 수수료 청구 · 배분 (파트너 중개사 화면) */
    findPartnerWithCommissions: () =>
      request<DealWithCommissions[]>('/deals', {
        params: { withPartner: 'true', expand: 'commissions' },
      }),

    findOne: (id: string) => request<Deal>(`/deals/${id}`),

    create: (dto: CreateDealDto) =>
      request<Deal>('/deals', { method: 'POST', body: dto }),

    updateStage: (id: string, dto: UpdateDealStageDto) =>
      request<Deal>(`/deals/${id}/stage`, { method: 'PATCH', body: dto }),

    /** 매칭 없이 만든 거래를 구매 의뢰에 잇거나(null이면) 끊는다. */
    setBuyerIntake: (id: string, buyerIntakeId: string | null) =>
      request<Deal>(`/deals/${id}/buyer-intake`, {
        method: 'PATCH',
        body: { buyerIntakeId },
      }),

    /** 당사자·금액·입주일·특약·메모·공동중개를 고친다. 단계는 updateStage 로 바꾼다. */
    update: (id: string, dto: UpdateDealDto) =>
      request<UpdateDealResult>(`/deals/${id}`, { method: 'PATCH', body: dto }),

    /** 우리 쪽 한 청구(매도측·매수측)의 수수료 금액을 정한다. 대표·매니저만. */
    setCommission: (id: string, dto: SetDealCommissionDto) =>
      request<Deal>(`/deals/${id}/commission`, { method: 'PATCH', body: dto }),

    cancel: (id: string, dto: CancelDealDto = {}) =>
      request<Deal>(`/deals/${id}/cancel`, { method: 'PATCH', body: dto }),

    /** 담당을 한 사람으로 바꾼다 (대표·매니저). 여러 명으로 나눈 거래는 수수료/정산에서 바꾼다. */
    setAssignee: (id: string, userId: string) =>
      request<Deal>(`/deals/${id}/assignee`, { method: 'PATCH', body: { userId } }),

    /** 취소한 거래를 되살린다. */
    restore: (id: string) =>
      request<Deal>(`/deals/${id}/restore`, { method: 'PATCH' }),

    getPropertyTransitionPreview: (id: string) =>
      request<DealPropertyTransitionPreview>(`/deals/${id}/property-transition-preview`),

    applyPropertyTransition: (id: string, dto: ApplyDealPropertyTransitionDto) =>
      request<{ applied: boolean }>(`/deals/${id}/apply-property-transition`, {
        method: 'POST',
        body: dto,
      }),

    remove: (id: string) =>
      request<void>(`/deals/${id}`, { method: 'DELETE' }),

    createPayment: (dealId: string, dto: CreateDealPaymentDto) =>
      request<DealPayment>(`/deals/${dealId}/payments`, {
        method: 'POST',
        body: dto,
      }),

    updatePayment: (
      dealId: string,
      paymentId: string,
      dto: UpdateDealPaymentDto,
    ) =>
      request<DealPayment>(`/deals/${dealId}/payments/${paymentId}`, {
        method: 'PATCH',
        body: dto,
      }),

    /** 대금 일정을 계약서 요약에 맞춘다. skipped: 그대로 둔 이유 (완납·여러 차수) */
    matchPaymentsToContract: (dealId: string) =>
      request<{ deal: Deal; changed: number; skipped: string[] }>(
        `/deals/${dealId}/payments/match-contract`,
        { method: 'POST' },
      ),

    removePayment: (dealId: string, paymentId: string) =>
      request<DealPayment>(`/deals/${dealId}/payments/${paymentId}`, {
        method: 'DELETE',
      }),
  };
}
