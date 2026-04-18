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
  commissionSellerRate: number | null;
  commissionSellerAmount: number | null;
  commissionBuyerRate: number | null;
  commissionBuyerAmount: number | null;
  commissionTotal: number | null;
  vat: number | null;
  isJointBrokerage: boolean;
  ourSide: string | null;
  partnerBrokerName: string | null;
  partnerBrokerPhone: string | null;
  partnerCommission: number | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  property?: Property | null;
  listing?: Listing | null;
  buyerContact?: Contact | null;
  sellerContact?: Contact | null;
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
  };
}
