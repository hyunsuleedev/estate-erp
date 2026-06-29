import { useQuery } from '@tanstack/react-query';
import type { SortingState } from '@tanstack/react-table';
import type { Deal, PartnerBroker } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatMoney, formatRent } from '@/lib/format';

/**
 * deals.findAll 응답에는 서버 include로 commissionPayments(+distributions)가 동봉되지만
 * api-client Deal 타입에는 아직 선언돼 있지 않다 — 이 페이지에서만 로컬 확장으로 사용.
 */
export interface DealCommissionDistribution {
  id: string;
  recipientType: 'our_office' | 'partner_broker' | string;
  partnerBrokerId: string | null;
  shareRatio: number | string;
  shareAmount: number;
  status: 'pending' | 'settled' | string;
  settledAt: string | null;
}

export interface DealCommissionPayment {
  id: string;
  clientSide: 'seller' | 'buyer' | string;
  expectedAmount: number;
  actualAmount: number | null;
  status: string;
  distributions?: DealCommissionDistribution[];
}

export type DealWithCommission = Deal & {
  commissionPayments?: DealCommissionPayment[];
};

/** 거래 전체 조회 — 파트너별 거래 수/연결 거래/분배 내역 계산용 (deals 페이지와 캐시 공유) */
export function usePartnerDeals() {
  return useQuery({
    queryKey: ['deals'],
    queryFn: async () => (await api.deals.findAll()) as DealWithCommission[],
  });
}

/** partnerBrokerId → 연결 거래 수 (서버 dealCount 캐시가 항상 0이라 클라이언트에서 실시간 집계) */
export function buildDealCountMap(deals: DealWithCommission[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const deal of deals) {
    if (!deal.partnerBrokerId) continue;
    map.set(deal.partnerBrokerId, (map.get(deal.partnerBrokerId) ?? 0) + 1);
  }
  return map;
}

export function getPartnerDeals(deals: DealWithCommission[], brokerId: string): DealWithCommission[] {
  return deals.filter((deal) => deal.partnerBrokerId === brokerId);
}

export interface PartnerDistributionEntry {
  payment: DealCommissionPayment;
  distribution: DealCommissionDistribution;
}

/** 해당 거래의 수금 건들에서 이 파트너 몫으로 잡힌 분배(CommissionDistribution)만 추출 */
export function getPartnerDistributions(
  deal: DealWithCommission,
  brokerId: string,
): PartnerDistributionEntry[] {
  return (deal.commissionPayments ?? []).flatMap((payment) =>
    (payment.distributions ?? [])
      .filter(
        (distribution) =>
          distribution.recipientType === 'partner_broker' &&
          distribution.partnerBrokerId === brokerId,
      )
      .map((distribution) => ({ payment, distribution })),
  );
}

export interface PartnerShareSummary {
  total: number;
  settled: number;
  pending: number;
}

/** 파트너 분배 합계 (취소 거래·취소 수금 건 제외) */
export function summarizePartnerShare(
  deals: DealWithCommission[],
  brokerId: string,
): PartnerShareSummary {
  const summary: PartnerShareSummary = { total: 0, settled: 0, pending: 0 };
  for (const deal of deals) {
    if (deal.isCancelled) continue;
    for (const { payment, distribution } of getPartnerDistributions(deal, brokerId)) {
      if (payment.status === 'cancelled') continue;
      summary.total += distribution.shareAmount;
      if (distribution.status === 'settled') {
        summary.settled += distribution.shareAmount;
      } else {
        summary.pending += distribution.shareAmount;
      }
    }
  }
  return summary;
}

export function dealAddressLabel(deal: DealWithCommission): string {
  const dong = deal.property?.unit?.dong;
  const parts = [
    deal.property?.site?.name,
    dong && !dong.isPlaceholder ? dong.name : null,
    deal.property?.unit?.name,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '매물 미지정';
}

export function dealPriceLabel(deal: DealWithCommission): string {
  if (deal.transactionType === 'monthly') {
    return formatRent(deal.agreedDeposit, deal.agreedMonthlyRent);
  }
  return formatMoney(deal.agreedPrice ?? deal.agreedDeposit);
}

// ============================================================
// 목록 검색/정렬 (클라이언트 사이드)
// ============================================================

export function brokerMatchesSearch(broker: PartnerBroker, query: string): boolean {
  return [
    broker.name,
    broker.phone,
    broker.ceoName,
    broker.ceoPhone,
    broker.licenseNo,
    broker.email,
    broker.address,
    broker.memo,
  ].some((value) => value?.toLowerCase().includes(query));
}

export function sortBrokers(
  brokers: PartnerBroker[],
  sorting: SortingState,
  getDealCount: (broker: PartnerBroker) => number,
): PartnerBroker[] {
  const activeSort = sorting[0];
  if (!activeSort) return brokers;

  return [...brokers].sort((left, right) => {
    const leftValue = getBrokerSortValue(left, activeSort.id, getDealCount);
    const rightValue = getBrokerSortValue(right, activeSort.id, getDealCount);
    const leftEmpty = isEmptySortValue(leftValue);
    const rightEmpty = isEmptySortValue(rightValue);

    if (leftEmpty && rightEmpty) return 0;
    if (leftEmpty) return 1;
    if (rightEmpty) return -1;

    const result = compareSortValues(leftValue, rightValue);
    return activeSort.desc ? -result : result;
  });
}

function getBrokerSortValue(
  broker: PartnerBroker,
  field: string,
  getDealCount: (broker: PartnerBroker) => number,
): string | number | null | undefined {
  switch (field) {
    case 'dealCount':
      return getDealCount(broker);
    case 'createdAt':
      return Date.parse(broker.createdAt);
    case 'updatedAt':
      return Date.parse(broker.updatedAt);
    case 'name':
      return broker.name;
    case 'phone':
      return broker.phone;
    case 'ceoPhone':
      return broker.ceoPhone;
    case 'address':
      return broker.address;
    default:
      return '';
  }
}

function compareSortValues(
  left: string | number | null | undefined,
  right: string | number | null | undefined,
): number {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  });
}

function isEmptySortValue(value: string | number | null | undefined): boolean {
  return value === null || value === undefined || value === '';
}
