import { normalizeDealStage } from '@estate-erp/shared';
import { Prisma } from '@prisma/client';
import { getPrimaryPhone } from '../contacts/contact-phone.utils';

/**
 * 다른 것의 상세에 실리는 거래 요약 — 집(매물 상세)과 의뢰(옆 패널)가 "이 집의 거래"를 보이는 데 쓴다.
 * 단계 · 취소 · 합의 금액 · 당사자 이름 · 대금 일정까지. 수수료 청구와 계약서는 싣지 않는다:
 * 그 화면들이 보이지 않고, 수수료는 담당이 아닌 중개사에게 가려야 해서 나가는 길을 거래 조회 하나로 둔다.
 * 화면이 거래를 따로 요청해 같은 거래를 두 번 받던 것을 없앤다(상세는 GET /deals/:id).
 */
const contactSelect = {
  select: {
    id: true,
    name: true,
    phones: { orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }] },
  },
};

export const DEAL_SUMMARY_SELECT = {
  id: true,
  listingId: true,
  matchId: true,
  stage: true,
  stageChangedAt: true,
  isCancelled: true,
  cancelledAt: true,
  cancelReason: true,
  cancelledBy: true,
  transactionType: true,
  agreedPrice: true,
  agreedDeposit: true,
  agreedMonthlyRent: true,
  agreedMoveInDate: true,
  isJointBrokerage: true,
  partnerBrokerId: true,
  createdAt: true,
  updatedAt: true,
  listing: { select: { propertyId: true } },
  buyerContact: contactSelect,
  sellerContact: contactSelect,
  partnerBroker: { select: { id: true, name: true, phone: true } },
  payments: { orderBy: [{ kind: 'asc' }, { sequence: 'asc' }] },
} satisfies Prisma.DealSelect;

type DealSummaryRow = Prisma.DealGetPayload<{ select: typeof DEAL_SUMMARY_SELECT }>;

export function presentDealSummary({ listing, buyerContact, sellerContact, ...deal }: DealSummaryRow) {
  const person = (contact: typeof buyerContact) =>
    contact ? { id: contact.id, name: contact.name, phone: getPrimaryPhone(contact) } : null;
  return {
    ...deal,
    stage: normalizeDealStage(deal.stage),
    propertyId: listing?.propertyId ?? null,
    buyerContact: person(buyerContact),
    sellerContact: person(sellerContact),
  };
}
