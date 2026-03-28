import type { RequestFn } from '../client.js';

export interface Deal {
  id: string;
  officeId: string;
  propertyId: string;
  stage: string;
  price: number | null;
  buyerContactId: string | null;
  sellerContactId: string | null;
  commissionSellerRate: number | null;
  commissionSellerAmount: number | null;
  commissionBuyerRate: number | null;
  commissionBuyerAmount: number | null;
  commissionTotal: number | null;
  vat: number | null;
  isJointBrokerage: boolean;
  partnerBrokerName: string | null;
  partnerBrokerPhone: string | null;
  partnerCommission: number | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  property?: unknown;
}

export interface CreateDealDto {
  propertyId: string;
  price?: number;
  memo?: string;
}

export function createDealsApi(request: RequestFn) {
  return {
    findAll: () =>
      request<Deal[]>('/deals'),

    findOne: (id: string) =>
      request<Deal>(`/deals/${id}`),

    create: (dto: CreateDealDto) =>
      request<Deal>('/deals', { method: 'POST', body: dto }),

    updateStage: (id: string, dto: { stage: string; price?: number; memo?: string }) =>
      request<Deal>(`/deals/${id}/stage`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/deals/${id}`, { method: 'DELETE' }),
  };
}
