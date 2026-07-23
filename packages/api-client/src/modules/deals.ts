import type { RequestFn } from '../client.js';
import type { Contact } from './contacts.js';
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

export interface Deal {
  id: string;
  officeId: string;
  propertyId: string | null;
  listingId: string | null;
  externalListingId: string | null;
  matchId: string | null;
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
  // 공동중개
  isJointBrokerage: boolean;
  ourSide: string | null;
  partnerBrokerId: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  property?: Property | null;
  listing?: Listing | null;
  buyerContact?: Contact | null;
  sellerContact?: Contact | null;
  partnerBroker?: { id: string; name: string; phone: string | null } | null;
  participants?: Array<{
    id: string;
    userId: string;
    role: string;
    side: string;
    user: { id: string; name: string };
  }>;
  payments?: DealPayment[];
}

export interface CreateDealDto {
  propertyId?: string;
  listingId?: string;
  matchId?: string;
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
  memo?: string;
}

export interface UpdateDealStageDto {
  stage: string;
  agreedPrice?: number;
  agreedDeposit?: number;
  agreedMonthlyRent?: number;
  memo?: string;
}

export interface CancelDealDto {
  cancelReason?: string;
  cancelledBy?: string;
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
    findAll: () => request<Deal[]>('/deals'),

    findOne: (id: string) => request<Deal>(`/deals/${id}`),

    create: (dto: CreateDealDto) =>
      request<Deal>('/deals', { method: 'POST', body: dto }),

    updateStage: (id: string, dto: UpdateDealStageDto) =>
      request<Deal>(`/deals/${id}/stage`, { method: 'PATCH', body: dto }),

    cancel: (id: string, dto: CancelDealDto = {}) =>
      request<Deal>(`/deals/${id}/cancel`, { method: 'PATCH', body: dto }),

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

    removePayment: (dealId: string, paymentId: string) =>
      request<DealPayment>(`/deals/${dealId}/payments/${paymentId}`, {
        method: 'DELETE',
      }),
  };
}
